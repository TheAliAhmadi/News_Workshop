"""Normalize and deduplicate within focal firm, retaining query lineage."""
from __future__ import annotations

import argparse
import pandas as pd

from config.settings import KEYS
from pipeline.io import assert_unique, atomic_write, json_text, read_table, write_table
from pipeline.step1_news_api import make_article_id
from pipeline.text_window import normalize_text


def clean_articles(df):
    out = df.copy()
    for col in ["headline", "lead", "content", "url", "focal_firm", "source", "query_keyword", "query_string"]:
        if col not in out:
            out[col] = ""
        out[col] = out[col].map(normalize_text)
    rows, audit = [], []
    url_map, headline_map = {}, {}
    for index, row in enumerate(out.to_dict("records")):
        if not row["headline"] or row["headline"].lower() == "[removed]" or not row["focal_firm"]:
            audit.append({"raw_row": index, "reason": "missing_headline_or_firm"})
            continue
        if not normalize_text(row.get("article_id")):
            row["article_id"] = make_article_id(row["url"], row["source"], row.get("published_at"), row["headline"])
        row["id_method"] = row.get("id_method") or ("url_sha256" if row["url"] else "source_date_headline_sha256")
        url_key = (row["focal_firm"], row["url"]) if row["url"] else None
        headline_key = (row["focal_firm"], row["headline"])
        existing = url_map.get(url_key) if url_key else None
        reason = "duplicate_url"
        if existing is None:
            existing = headline_map.get(headline_key)
            reason = "duplicate_firm_headline"
        if existing is not None:
            kept = rows[existing]
            for plural, singular in [("query_keywords", "query_keyword"), ("query_strings", "query_string"),
                                     ("merged_article_ids", "article_id")]:
                kept[plural] = list(dict.fromkeys(kept[plural] + [row[singular]]))
            audit.append({"raw_row": index, "reason": reason, "retained_article_id": kept["article_id"],
                          "focal_firm": row["focal_firm"]})
            if url_key:
                url_map[url_key] = existing
            headline_map[headline_key] = existing
            continue
        if url_key:
            url_map[url_key] = len(rows)
        headline_map[headline_key] = len(rows)
        row.update(query_keywords=[row["query_keyword"]], query_strings=[row["query_string"]],
                   merged_article_ids=[row["article_id"]],
                   words_available=len(" ".join(row[c] for c in ["headline", "lead", "content"]).split()))
        rows.append(row)
    columns = list(dict.fromkeys(list(out.columns) + KEYS + ["query_keywords", "query_strings", "merged_article_ids", "words_available"]))
    result = pd.DataFrame(rows, columns=columns)
    assert_unique(result)
    result.attrs["cleaning_audit"] = audit
    result.attrs["raw_rows"] = len(df)
    return result


def select_demo_corpus(df, limit=20, seed=42):
    if not 1 <= limit <= 100:
        raise ValueError("Demo corpus limit must be between 1 and 100.")
    assert_unique(df)
    ordered = df.sort_values(KEYS).reset_index(drop=True)
    return ordered.sample(n=min(limit, len(ordered)), random_state=seed).sort_values(KEYS).reset_index(drop=True)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    a = p.parse_args()
    result = clean_articles(read_table(a.input))
    write_table(result, a.output)
    atomic_write(a.output + ".audit.json", json_text(result.attrs))
    print(f"Saved {len(result)} cleaned observations.")


if __name__ == "__main__":
    main()
