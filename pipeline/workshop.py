"""Small application service: orchestrates stages and persists versioned artifacts."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import pandas as pd

from config.settings import CODEBOOK_VERSION, KEYS, PROMPT_VERSION, SAMPLE_SEED, SCHEMA_VERSION, Settings
from pipeline.demo import DEMO_MODEL, demo_extract_one, demo_finbert, demo_raw
from pipeline.io import RunStore, atomic_write, fingerprint, json_text, read_table, utc_now, write_table
from pipeline.step1_news_api import fetch_news, query_inputs
from pipeline.step2_clean import clean_articles, select_demo_corpus
from pipeline.step3_finbert_esg import classify_articles
from pipeline.step4_openai_extract import extract_esg_events
from pipeline.step5_validate import HUMAN_COLUMNS, select_validation_sample, sample_signature, validate_labels
from pipeline.step6_aggregate import aggregate_firm_month


def collect(settings, options, news_key=""):
    if options["mode"] == "live":
        query_inputs(options["firms"], options["keywords"], options["start"], options["end"], options["max_per_query"])
        if not news_key:
            raise ValueError("Enter your News API key or set NEWS_API_KEY in .env.")
    store = RunStore.create(settings.data_dir, options)
    path = store.new_path("raw", "articles_raw.json")
    if options["mode"] == "synthetic":
        raw = demo_raw()
        audit = {"collection_complete": True, "synthetic": True, "queries": "Authored fixture, no API query."}
    else:
        raw = fetch_news(options["firms"], options["keywords"], options["start"], options["end"], news_key,
                         settings.news_api_base_url, max_articles_per_query=options["max_per_query"],
                         checkpoint=lambda d: write_table(d, path))
        audit = dict(raw.attrs)
    raw["run_id"] = store.run_id
    write_table(raw, path)
    write_table(raw, path.with_suffix(".csv"))
    atomic_write(path.parent / "collection_audit.json", json_text(audit))
    store.record("raw", path, fingerprint(options), len(raw), audit)
    clean = clean_articles(raw)
    clean_audit = dict(clean.attrs)
    selected = select_demo_corpus(clean, options["corpus_limit"])
    clean_path = store.new_path("clean", "articles_clean.json")
    write_table(clean, clean_path.parent / "articles_clean_all.json")
    write_table(clean, clean_path.parent / "articles_clean_all.csv")
    write_table(selected, clean_path)
    write_table(selected, clean_path.with_suffix(".csv"))
    atomic_write(clean_path.parent / "cleaning_audit.json", json_text(clean_audit))
    store.record("clean", clean_path, fingerprint(options), len(selected), {"all_clean_rows": len(clean), **clean_audit})
    return store


def finbert_signature(store, word_limit, revision):
    return fingerprint({"clean": store.manifest()["stages"]["clean"]["path"],
                        "word_limit": word_limit, "revision": revision})


def run_finbert(store, settings, word_limit, progress=None):
    clean = store.load("clean")
    if clean is None or clean.empty:
        raise ValueError("Collect at least one cleaned observation first.")
    synthetic = store.manifest()["settings"]["mode"] == "synthetic"
    if synthetic:
        result = demo_finbert(clean, word_limit, progress)
    else:
        result = classify_articles(clean, word_limit, settings.finbert_revision, str(settings.model_cache), progress=progress)
    path = store.new_path("finbert", "articles_finbert.json")
    write_table(result, path)
    write_table(result, path.with_suffix(".csv"))
    store.invalidate_after("finbert")
    store.record("finbert", path, finbert_signature(store, word_limit, settings.finbert_revision), len(result),
                 {"word_limit": word_limit, "backend": "synthetic_reference" if synthetic else "local"})
    return result


def llm_signature(store, word_limit, model):
    return fingerprint({"finbert": store.manifest()["stages"]["finbert"]["path"], "word_limit": word_limit,
                        "model": model, "prompt": PROMPT_VERSION, "codebook": CODEBOOK_VERSION, "schema": SCHEMA_VERSION})


def run_llm(store, settings, word_limit, model, cap, api_key="", retry_failed=False, progress=None):
    df = store.load("finbert")
    if df is None:
        raise ValueError("Run FinBERT first.")
    synthetic = store.manifest()["settings"]["mode"] == "synthetic"
    model = DEMO_MODEL if synthetic else model
    if not synthetic and (not model or not api_key):
        raise ValueError("Enter an OpenAI key and model name before live coding.")
    previous = store.load("llm")
    signature = llm_signature(store, word_limit, model)
    old_entry = store.manifest()["stages"].get("llm")
    if retry_failed and (not old_entry or old_entry["signature"] != signature):
        raise ValueError("Retry requires the same extraction settings as the failed run.")
    path = store.new_path("llm", "articles_llm.json")
    # New extraction revisions invalidate dependent labels; old artifacts remain on disk.
    store.invalidate_after("llm")

    def checkpoint(result):
        write_table(result, path)
        write_table(result, path.with_suffix(".csv"))
        store.record("llm", path, signature, len(result), {"word_limit": word_limit, "model": model,
                      "cap_per_action": cap, "statuses": result["llm_status"].value_counts().to_dict()})

    kwargs = {"client": object(), "extractor": demo_extract_one} if synthetic else {}
    result = extract_esg_events(df, api_key, model, word_limit, cap, previous, retry_failed,
                                checkpoint=checkpoint, progress=progress, **kwargs)
    return result


def validation_state(store):
    llm = store.load("llm")
    sample = select_validation_sample(llm)
    labels = store.load("validation")
    if labels is None:
        labels = pd.DataFrame(columns=HUMAN_COLUMNS)
    return sample, labels


def persist_labels(store, sample, labels):
    metrics = validate_labels(sample, labels)
    path = store.new_path("validation", "human_labels.json")
    write_table(labels, path)
    write_table(labels, path.with_suffix(".csv"))
    atomic_write(path.parent / "sample.json", json_text({"seed": SAMPLE_SEED,
        "selected": sample[KEYS + ["llm_fingerprint"]].to_dict("records")}))
    atomic_write(path.parent / "metrics.json", json_text(metrics))
    store.invalidate_after("validation")
    store.record("validation", path, sample_signature(sample), len(labels), metrics)
    return metrics


def export_final(store):
    df = store.load("llm")
    if df is None:
        raise ValueError("Run structured coding before export.")
    sample, labels = validation_state(store)
    if len(labels):
        validate_labels(sample, labels)
        df = df.merge(labels[KEYS + [c for c in labels if c.startswith("human_")] + ["labeled_at"]],
                      on=KEYS, how="left", validate="one_to_one")
    aggregate = aggregate_firm_month(df)
    path = store.new_path("final", "esg_articles_final.json")
    write_table(df, path)
    write_table(df, path.with_suffix(".csv"), spreadsheet_safe=True)
    write_table(aggregate, path.parent / "esg_firm_month.csv", spreadsheet_safe=True)
    atomic_write(path.parent / "export_notes.json", json_text({
        "created_at": utc_now(), "csv": "Formula-leading text is prefixed with an apostrophe. JSON preserves canonical text.",
        "aggregation": aggregate.attrs, "validation_n": len(labels),
        "synthetic": store.manifest()["settings"]["mode"] == "synthetic",
        "claim": "Article–firm event mentions, not unique events. API text may be truncated.",
    }))
    store.record("final", path, fingerprint(df.to_dict("records")), len(df), {"firm_months": len(aggregate), **aggregate.attrs})
    return {"articles_json": path, "articles_csv": path.with_suffix(".csv"),
            "firm_month_csv": path.parent / "esg_firm_month.csv", "notes": path.parent / "export_notes.json"}


def default_demo_options():
    return {"mode": "synthetic", "corpus_limit": 20, "preset": "Snippet API", "firms": [], "keywords": [],
            "start": "2026-08-01", "end": "2026-08-31", "max_per_query": 25}


def main():
    p = argparse.ArgumentParser(description="Build a complete synthetic demonstration run without API calls.")
    p.add_argument("--demo", action="store_true", required=True)
    a = p.parse_args()
    settings = Settings.from_env()
    store = collect(settings, default_demo_options())
    run_finbert(store, settings, 150)
    run_llm(store, settings, 150, DEMO_MODEL, 25)
    paths = export_final(store)
    print(f"Synthetic demonstration run: {store.run_id}")
    print(json_text(paths))


if __name__ == "__main__":
    main()
