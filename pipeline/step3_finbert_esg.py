"""Local FinBERT inference; imports the ML runtime only when invoked."""
from __future__ import annotations

import argparse
from functools import lru_cache

from config.settings import FINBERT_MODEL_NAME, Settings
from pipeline.io import assert_unique, read_table, utc_now, write_table
from pipeline.text_window import add_windows, normalize_text


def canonical_label(label):
    mapping = {"e": "Environmental", "environmental": "Environmental", "s": "Social", "social": "Social",
               "g": "Governance", "governance": "Governance", "none": "None"}
    if label is None:
        raise ValueError("Missing FinBERT classification. Rerun the local model.")
    normalized = mapping.get(normalize_text(label).lower())
    if normalized is None:
        raise ValueError("Unknown FinBERT label. Check the model label mapping.")
    return normalized


@lru_cache(maxsize=2)
def load_finbert(model_name=FINBERT_MODEL_NAME, revision="main", cache_dir=None, local_files_only=False):
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name, revision=revision, cache_dir=cache_dir,
                                               local_files_only=local_files_only)
    model = AutoModelForSequenceClassification.from_pretrained(model_name, revision=revision, cache_dir=cache_dir,
                                                               local_files_only=local_files_only)
    model.eval()
    labels = {canonical_label(v) for v in model.config.id2label.values()}
    if labels != {"Environmental", "Social", "Governance", "None"}:
        raise ValueError("This model does not expose the expected four ESG labels.")
    return tokenizer, model


def predict_one(text, tokenizer, model):
    import torch
    available = tokenizer(text, add_special_tokens=True, truncation=False)["input_ids"]
    limit = min(512, model.config.max_position_embeddings, tokenizer.model_max_length)
    encoded = tokenizer(text, return_tensors="pt", truncation=True, max_length=limit)
    with torch.inference_mode():
        probs = torch.softmax(model(**encoded).logits[0], dim=-1)
    index = int(probs.argmax().item())
    ids = encoded["input_ids"][0].tolist()
    return {
        "finbert_label": canonical_label(model.config.id2label[index]),
        "finbert_score": float(probs[index].item()),
        "finbert_tokens_available": len(available), "finbert_tokens_used": len(ids),
        "finbert_token_truncated": len(available) > len(ids), "finbert_input_ids": ids,
        "finbert_effective_text": tokenizer.decode(ids, skip_special_tokens=True),
    }


def classify_articles(df, word_limit=150, revision="main", cache_dir=None, local_files_only=False,
                      predictor=None, progress=None):
    assert_unique(df)
    out = add_windows(df, "finbert", word_limit)
    if predictor is None and len(out):
        tokenizer, model = load_finbert(revision=revision, cache_dir=cache_dir, local_files_only=local_files_only)
        predictor = lambda text: predict_one(text, tokenizer, model)
        resolved_revision = getattr(model.config, "_commit_hash", None) or revision
    else:
        resolved_revision = "injected-test-predictor" if predictor else revision
    results = []
    for i, text in enumerate(out["finbert_input_text"]):
        result = predictor(text)
        result["finbert_label"] = canonical_label(result["finbert_label"])
        if not 0 <= result["finbert_score"] <= 1:
            raise ValueError("FinBERT returned an invalid score.")
        results.append(result)
        if progress:
            progress(i + 1, len(out))
    for col in ["finbert_label", "finbert_score", "finbert_tokens_available", "finbert_tokens_used",
                "finbert_token_truncated", "finbert_input_ids", "finbert_effective_text"]:
        out[col] = [r.get(col) for r in results]
    out["finbert_model_name"] = FINBERT_MODEL_NAME
    out["finbert_model_revision"] = resolved_revision
    out["finbert_processed_at"] = utc_now()
    out["finbert_backend"] = "local"
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--word-limit", type=int, default=150)
    p.add_argument("--local-files-only", action="store_true")
    a = p.parse_args()
    s = Settings.from_env()
    out = classify_articles(read_table(a.input), a.word_limit, s.finbert_revision, str(s.model_cache), a.local_files_only)
    write_table(out, a.output)
    print(f"Classified {len(out)} observations locally.")


if __name__ == "__main__":
    main()
