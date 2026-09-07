"""Firm-publication-month mention measures with explicit processing coverage."""
from __future__ import annotations

import argparse
import pandas as pd

from config.taxonomies import EventRelationship
from pipeline.io import assert_unique, read_table, write_table

AGG_COLUMNS = ["focal_firm", "month", "observed_mentions", "llm_successes", "skipped_mentions", "failed_mentions",
               "deferred_mentions", "pending_mentions", "esg_mentions", "env_share", "soc_share", "gov_share",
               "multiple_share", "firm_actions", "accusations", "firm_responses", "external_events",
               "other_relationships", "n_themes", "other_theme_mentions"]


def aggregate_firm_month(df):
    assert_unique(df)
    out = df.copy()
    dates = pd.to_datetime(out["published_at"], utc=True, errors="coerce", format="mixed")
    out["month"] = dates.dt.strftime("%Y-%m")
    invalid = int(dates.isna().sum())
    rows = []
    for (firm, month), group in out.dropna(subset=["month"]).groupby(["focal_firm", "month"], sort=True):
        ok = group[group["llm_status"].eq("ok")]
        relevant = ok[ok["esg_relevant"].eq(True)]
        row = {"focal_firm": firm, "month": month, "observed_mentions": len(group), "llm_successes": len(ok),
               "esg_mentions": len(relevant)}
        for col, status in [("skipped_mentions", "skipped_finbert_none"), ("failed_mentions", "failed"),
                            ("deferred_mentions", "not_processed_limit"), ("pending_mentions", "pending")]:
            row[col] = int(group["llm_status"].eq(status).sum())
        for col, dim in [("env_share", "environmental"), ("soc_share", "social"), ("gov_share", "governance"), ("multiple_share", "multiple")]:
            row[col] = float(relevant["esg_dimension"].eq(dim).mean()) if len(relevant) else None
        for col, rel in zip(["firm_actions", "accusations", "firm_responses", "external_events", "other_relationships"], EventRelationship):
            row[col] = int(relevant["event_relationship"].eq(rel.value).sum())
        row["n_themes"] = int(relevant.loc[relevant["theme_primary"].ne("other_theme"), "theme_primary"].nunique())
        row["other_theme_mentions"] = int(relevant["theme_primary"].eq("other_theme").sum())
        rows.append(row)
    result = pd.DataFrame(rows, columns=AGG_COLUMNS)
    result.attrs["invalid_publication_dates"] = invalid
    result.attrs["definition"] = "Observed article–firm mentions, grouped by publication month; not unique events."
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    a = p.parse_args()
    result = aggregate_firm_month(read_table(a.input))
    write_table(result, a.output, spreadsheet_safe=True)
    print(f"Saved {len(result)} firm-months; excluded {result.attrs['invalid_publication_dates']} invalid dates.")


if __name__ == "__main__":
    main()
