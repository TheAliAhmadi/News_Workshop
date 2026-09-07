from __future__ import annotations

from pydantic import BaseModel, ConfigDict, model_validator
from config.taxonomies import (
    ESGDimension, EventRelationship, ActionValence, ActionType,
    ThemePrimary, EventStatus, Confidence,
)
from pipeline.text_window import normalize_text


class ESGEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    esg_relevant: bool
    esg_dimension: ESGDimension
    event_relationship: EventRelationship
    action_valence: ActionValence
    action_type: ActionType
    geography: str | None  # Required but nullable for strict structured output.
    theme_primary: ThemePrimary
    event_status: EventStatus
    quoted_evidence: str
    evidence_explanation: str
    confidence: Confidence

    @model_validator(mode="after")
    def consistent_coding(self):
        if not self.evidence_explanation.strip():
            raise ValueError("An evidence explanation is required.")
        if self.esg_relevant:
            if self.esg_dimension == ESGDimension.none or not self.quoted_evidence.strip():
                raise ValueError("Relevant coding needs an ESG dimension and supporting quote.")
        else:
            expected = {
                "esg_dimension": "none", "event_relationship": "other", "action_valence": "neutral",
                "action_type": "other_action", "theme_primary": "other_theme", "event_status": "unclear",
            }
            if any(getattr(self, k).value != v for k, v in expected.items()):
                raise ValueError("Non-ESG coding must use the documented sentinel categories.")
            if self.geography is not None:
                raise ValueError("Non-ESG coding has no event geography.")
        return self


def validate_evidence(event: ESGEvent, input_text: str) -> None:
    quote = normalize_text(event.quoted_evidence)
    if quote and quote not in normalize_text(input_text):
        raise ValueError("Evidence quote is absent from the supplied text window.")


EVENT_FIELDS = list(ESGEvent.model_fields)
