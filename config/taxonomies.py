from enum import Enum


class ESGDimension(str, Enum):
    environmental = "environmental"
    social = "social"
    governance = "governance"
    multiple = "multiple"
    none = "none"


class EventRelationship(str, Enum):
    firm_action = "firm_action"
    accusation_against_firm = "accusation_against_firm"
    firm_response = "firm_response"
    external_esg_event_affecting_firm = "external_esg_event_affecting_firm"
    other = "other"


class ActionValence(str, Enum):
    positive = "positive"
    negative = "negative"
    mixed = "mixed"
    neutral = "neutral"


class ThemePrimary(str, Enum):
    climate_emissions = "climate_emissions"
    pollution = "pollution"
    biodiversity_land = "biodiversity_land"
    energy_transition = "energy_transition"
    labor_workplace = "labor_workplace"
    diversity_inclusion = "diversity_inclusion"
    community_human_rights = "community_human_rights"
    product_safety_customers = "product_safety_customers"
    board_governance = "board_governance"
    corruption_ethics = "corruption_ethics"
    disclosure_transparency = "disclosure_transparency"
    other_theme = "other_theme"


class ActionType(str, Enum):
    emissions_target_or_cut = "emissions_target_or_cut"
    renewable_energy_investment = "renewable_energy_investment"
    pollution_incident_or_violation = "pollution_incident_or_violation"
    environmental_lawsuit_or_fine = "environmental_lawsuit_or_fine"
    biodiversity_or_land_use_impact = "biodiversity_or_land_use_impact"
    workforce_restructuring_or_layoffs = "workforce_restructuring_or_layoffs"
    labor_dispute_or_strike = "labor_dispute_or_strike"
    diversity_program_or_commitment = "diversity_program_or_commitment"
    human_rights_or_supply_chain_issue = "human_rights_or_supply_chain_issue"
    product_harm_or_safety_issue = "product_harm_or_safety_issue"
    board_or_executive_change = "board_or_executive_change"
    executive_pay_controversy = "executive_pay_controversy"
    bribery_corruption_allegation = "bribery_corruption_allegation"
    greenwashing_or_disclosure_issue = "greenwashing_or_disclosure_issue"
    philanthropy_or_community_investment = "philanthropy_or_community_investment"
    regulatory_investigation = "regulatory_investigation"
    settlement_or_remediation = "settlement_or_remediation"
    other_action = "other_action"


class EventStatus(str, Enum):
    announcement = "announcement"
    allegation = "allegation"
    investigation = "investigation"
    ongoing = "ongoing"
    completed_action = "completed_action"
    ruling_or_settlement = "ruling_or_settlement"
    unclear = "unclear"


class Confidence(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class LLMStatus(str, Enum):
    ok = "ok"
    failed = "failed"
    skipped_finbert_none = "skipped_finbert_none"
    not_processed_limit = "not_processed_limit"
    pending = "pending"  # Interrupted checkpoint, not a completed extraction.


def taxonomy_lists():
    return {c.__name__: [v.value for v in c] for c in (
        ESGDimension, EventRelationship, ActionValence, ThemePrimary,
        ActionType, EventStatus, Confidence, LLMStatus,
    )}
