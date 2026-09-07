"""Seeded diversity sample and human–LLM agreement on completed labels only."""
from __future__ import annotations

import argparse
import random
import pandas as pd
from sklearn.metrics import confusion_matrix

from config.settings import KEYS, SAMPLE_SEED
from config.taxonomies import ESGDimension, EventRelationship
from pipeline.io import assert_unique, atomic_write, fingerprint, json_text, read_table, utc_now, write_table

GOLD = ["human_esg_relevant", "human_esg_dimension", "human_event_relationship"]
HUMAN_COLUMNS = KEYS + GOLD + ["llm_fingerprint", "labeled_at"]


def select_validation_sample(df, n=5, seed=SAMPLE_SEED):
    assert_unique(df)
    if not 1 <= n <= 5:
        raise ValueError("The workshop sample must contain at most five observations.")
    ok = df[df["llm_status"].eq("ok")].sort_values(KEYS).reset_index(drop=True)
    rng = random.Random(seed)
    groups = [list(g.index) for _, g in ok.groupby("event_relationship", sort=True)]
    rng.shuffle(groups)
    chosen = []
    for group in groups:
        if len(chosen) < n:
            chosen.append(rng.choice(group))
    remaining = [i for i in ok.index if i not in chosen]
    chosen += rng.sample(remaining, min(n - len(chosen), len(remaining)))
    sample = ok.loc[chosen].reset_index(drop=True)
    sample.attrs.update(seed=seed, selected_keys=sample[KEYS].to_dict("records"))
    return sample


def save_human_label(labels, row, relevant, dimension, relationship):
    if relevant not in (True, False) or type(relevant) is not bool:
        raise ValueError("Choose whether the mention is ESG relevant.")
    ESGDimension(dimension)
    EventRelationship(relationship)
    if (relevant and dimension == "none") or (not relevant and (dimension != "none" or relationship != "other")):
        raise ValueError("For non-ESG choose dimension none and relationship other; relevant coding needs a substantive dimension.")
    result = labels.copy() if labels is not None else pd.DataFrame(columns=HUMAN_COLUMNS)
    if len(result):
        result = result[~(result[KEYS[0]].eq(row[KEYS[0]]) & result[KEYS[1]].eq(row[KEYS[1]]))]
    record = {k: row[k] for k in KEYS}
    record.update(human_esg_relevant=relevant, human_esg_dimension=dimension, human_event_relationship=relationship,
                  llm_fingerprint=row["llm_fingerprint"], labeled_at=utc_now())
    return pd.concat([result, pd.DataFrame([record])], ignore_index=True)


def validate_labels(model_df, human_df):
    assert_unique(model_df)
    assert_unique(human_df)
    complete = human_df.dropna(subset=GOLD).copy()
    complete = complete[~complete[GOLD].eq("").any(axis=1)]
    for row in complete.to_dict("records"):
        save_human_label(None, row, row[GOLD[0]], row[GOLD[1]], row[GOLD[2]])
    merged = model_df[model_df["llm_status"].eq("ok")].merge(
        complete, on=KEYS, how="inner", validate="one_to_one", suffixes=("", "_human"))
    if len(merged) and not merged["llm_fingerprint"].eq(merged["llm_fingerprint_human"]).all():
        raise ValueError("Human labels refer to an older extraction. Relabel the current sample.")
    categories = [e.value for e in EventRelationship]
    metrics = {"n": len(merged), "relationship_labels": categories,
               "relationship_confusion_matrix": confusion_matrix(
                   merged["human_event_relationship"].tolist(), merged["event_relationship"].tolist(), labels=categories
               ).tolist() if len(merged) else [[0] * len(categories) for _ in categories]}
    for name, model_field in [("relationship", "event_relationship"), ("dimension", "esg_dimension"), ("relevant", "esg_relevant")]:
        matches = int(merged[f"human_{model_field}"].eq(merged[model_field]).sum())
        metrics[f"{name}_matches"] = matches
        metrics[f"{name}_accuracy"] = matches / len(merged) if len(merged) else None
    return metrics


def sample_signature(sample):
    return fingerprint(sample[KEYS + ["llm_fingerprint"]].to_dict("records"))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True)
    p.add_argument("--human")
    p.add_argument("--output", required=True)
    a = p.parse_args()
    model = read_table(a.input)
    sample = select_validation_sample(model)
    if a.human:
        atomic_write(a.output, json_text(validate_labels(sample, read_table(a.human))))
    else:
        result = sample[KEYS + ["focal_firm", "llm_input_text", "llm_fingerprint"]].loc[:, lambda d: ~d.columns.duplicated()].copy()
        for c in GOLD:
            result[c] = None
        write_table(result, a.output)
    print(f"Selected {len(sample)} rows (seed {SAMPLE_SEED}).")


if __name__ == "__main__":
    main()
