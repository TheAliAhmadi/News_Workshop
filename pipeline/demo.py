"""Authored synthetic teaching fixtures. These are NOT news or model predictions."""
from __future__ import annotations

import argparse
import pandas as pd

from pipeline.io import utc_now, write_table
from pipeline.step1_news_api import make_article_id
from pipeline.text_window import add_windows
from schemas.esg_event import ESGEvent

DEMO_MODEL = "synthetic-reference-codes-v1.1"
# firm, headline/quote, prior, dimension, relationship, action, theme, status, valence
SCENARIOS = [
    ("Aster Energy", "Aster Energy announces a target to cut operational emissions by 40 percent by 2030.", "Environmental", "environmental", "firm_action", "emissions_target_or_cut", "climate_emissions", "announcement", "positive"),
    ("Aster Energy", "A regulator alleges Aster Energy discharged untreated wastewater into a river.", "Environmental", "environmental", "accusation_against_firm", "pollution_incident_or_violation", "pollution", "allegation", "negative"),
    ("Aster Energy", "Aster Energy begins compensating local residents after last month's pipeline spill.", "Environmental", "environmental", "firm_response", "settlement_or_remediation", "pollution", "ongoing", "positive"),
    ("Aster Energy", "Flooding closes Aster Energy's coastal terminal for three days.", "Environmental", "environmental", "external_esg_event_affecting_firm", "other_action", "climate_emissions", "ongoing", "negative"),
    ("Aster Energy", "Aster Energy completed a solar farm that replaces a diesel generator.", "Environmental", "environmental", "firm_action", "renewable_energy_investment", "energy_transition", "completed_action", "positive"),
    ("Aster Energy", "A court orders Aster Energy to pay a fine for destroying protected wetland.", "Environmental", "environmental", "accusation_against_firm", "environmental_lawsuit_or_fine", "biodiversity_land", "ruling_or_settlement", "negative"),
    ("Meridian Bank", "Meridian Bank announces an independent committee to oversee executive pay.", "Governance", "governance", "firm_action", "board_or_executive_change", "board_governance", "announcement", "neutral"),
    ("Meridian Bank", "Employees accuse Meridian Bank of paying women less than men in equivalent jobs.", "Social", "social", "accusation_against_firm", "other_action", "diversity_inclusion", "allegation", "negative"),
    ("Meridian Bank", "Meridian Bank publishes corrected climate disclosures after a regulator questioned its earlier report.", "Environmental", "governance", "firm_response", "greenwashing_or_disclosure_issue", "disclosure_transparency", "completed_action", "positive"),
    ("Meridian Bank", "An industry report compares Meridian Bank's board diversity with its peers without describing a new action.", "Governance", "governance", "other", "other_action", "board_governance", "unclear", "neutral"),
    ("Meridian Bank", "Prosecutors are investigating allegations that Meridian Bank staff paid bribes to secure contracts.", "Governance", "governance", "accusation_against_firm", "bribery_corruption_allegation", "corruption_ethics", "investigation", "negative"),
    ("Harbor Manufacturing", "Harbor Manufacturing recalls a battery after reports of injuries caused by overheating.", "Social", "social", "firm_response", "product_harm_or_safety_issue", "product_safety_customers", "ongoing", "positive"),
    ("Harbor Manufacturing", "Harbor Manufacturing workers begin a strike over unsafe working conditions.", "Social", "social", "accusation_against_firm", "labor_dispute_or_strike", "labor_workplace", "ongoing", "negative"),
    ("Harbor Manufacturing", "Harbor Manufacturing commits to reduce factory emissions and improve employee safety training.", "Social", "multiple", "firm_action", "emissions_target_or_cut", "climate_emissions", "announcement", "positive"),
    ("Harbor Manufacturing", "Aster Energy and Harbor Manufacturing jointly invest in a community solar project.", "Environmental", "environmental", "firm_action", "renewable_energy_investment", "energy_transition", "announcement", "positive"),
    ("Aster Energy", "Aster Energy and Harbor Manufacturing jointly invest in a community solar project.", "Environmental", "environmental", "firm_action", "renewable_energy_investment", "energy_transition", "announcement", "positive"),
    ("Meridian Bank", "Meridian Bank's market newsletter reports another company's emissions target; it describes no ESG involvement by the bank.", "Environmental", "none", "other", "other_action", "other_theme", "unclear", "neutral"),
    ("Aster Energy", "Aster Energy shares closed two percent higher after a routine trading session.", "None", "none", "other", "other_action", "other_theme", "unclear", "neutral"),
    ("Meridian Bank", "Meridian Bank publishes the date of its next quarterly earnings call.", "None", "none", "other", "other_action", "other_theme", "unclear", "neutral"),
    ("Harbor Manufacturing", "Harbor Manufacturing changes the opening hours of its investor relations office.", "None", "none", "other", "other_action", "other_theme", "unclear", "neutral"),
]


def demo_raw():
    rows = []
    for i, s in enumerate(SCENARIOS):
        firm, quote, prior, dim, relationship, action, theme, status, valence = s
        # The joint article deliberately has one source ID and two focal-firm observations.
        source_index = 14 if i == 15 else i
        url = f"https://example.invalid/synthetic-workshop/{source_index + 1}"
        rows.append({
            "article_id": make_article_id(url), "id_method": "url_sha256", "focal_firm": firm,
            "query_keyword": "ESG", "query_string": f'"{firm}" AND "ESG"',
            "published_at": f"2026-08-{source_index + 1:02d}T09:00:00+00:00",
            "source": "Synthetic Workshop Bulletin", "headline": quote,
            "lead": "This fictional classroom example illustrates coding from a limited news window.",
            "content": "No further details are available in the supplied excerpt.",
            "url": url, "retrieved_at": "2026-09-05T12:00:00+00:00",
            "api_provider": "synthetic_fixture", "synthetic": True, "fixture_id": i,
        })
    for i in [0, 6, 14]:
        rows.append({**rows[i], "query_keyword": "sustainability", "query_string": f'"{rows[i]["focal_firm"]}" AND "sustainability"'})
    rows.append({**rows[0], "article_id": "missing-headline-fixture", "url": "", "headline": None})
    return pd.DataFrame(rows)


def demo_finbert(df, word_limit=150, progress=None):
    if not df["synthetic"].eq(True).all():
        raise ValueError("Synthetic reference labels can only be used with the synthetic fixture.")
    out = add_windows(df, "finbert", word_limit)
    out["finbert_label"] = [SCENARIOS[int(i)][2] for i in df["fixture_id"]]
    out["finbert_score"] = 0.85
    out["finbert_model_name"] = "synthetic-reference-labels-v1"
    out["finbert_model_revision"] = "fixture-v1"
    out["finbert_backend"] = "synthetic_reference"
    out["finbert_processed_at"] = utc_now()
    for c in ["finbert_tokens_available", "finbert_tokens_used", "finbert_token_truncated", "finbert_input_ids", "finbert_effective_text"]:
        out[c] = None
    if progress:
        progress(len(out), len(out))
    return out


def demo_extract_one(client, model, row):
    if row.get("synthetic") is not True:
        raise ValueError("Cannot apply a synthetic code to live news.")
    firm, quote, prior, dim, relationship, action, theme, status, valence = SCENARIOS[int(row["fixture_id"])]
    relevant = dim != "none"
    event = ESGEvent(
        esg_relevant=relevant, esg_dimension=dim, event_relationship=relationship,
        action_valence=valence, action_type=action, geography=None, theme_primary=theme,
        event_status=status, quoted_evidence=quote if relevant else "",
        evidence_explanation=(f"The supplied sentence directly supports {relationship.replace('_', ' ')} involving {firm}."
                              if relevant else "The text does not describe substantive ESG involvement by the focal firm."),
        confidence="high" if relationship != "other" else "medium",
    )
    return event, {"openai_returned_model": DEMO_MODEL, "input_tokens": 0, "output_tokens": 0,
                   "llm_backend": "synthetic_reference"}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--output", default="data/demo/articles_raw.json")
    a = p.parse_args()
    write_table(demo_raw(), a.output)
    print(f"Saved 24 synthetic query hits to {a.output}; no news API or model was called.")


if __name__ == "__main__":
    main()
