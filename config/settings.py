from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
FINBERT_MODEL_NAME = "yiyanghkust/finbert-esg"
PROMPT_VERSION = "esg_event_v3"
CODEBOOK_VERSION = "starter_v1.1"
SCHEMA_VERSION = "esg_event_v1.1"
PRESETS = {"Snippet API": (150, 150), "Full-text API": (150, 400)}
SAMPLE_SEED = 42
KEYS = ["article_id", "focal_firm"]


@dataclass(frozen=True)
class Settings:
    news_api_key: str = field(default="", repr=False)
    openai_api_key: str = field(default="", repr=False)
    openai_model: str = ""
    news_api_base_url: str = "https://newsapi.org/v2/everything"
    finbert_revision: str = "main"
    data_dir: Path = ROOT / "data"
    model_cache: Path = ROOT / ".cache" / "huggingface"

    @classmethod
    def from_env(cls):
        load_dotenv(ROOT / ".env")
        return cls(
            news_api_key=os.getenv("NEWS_API_KEY", ""),
            openai_api_key=os.getenv("OPENAI_API_KEY", ""),
            openai_model=os.getenv("OPENAI_MODEL", ""),
            news_api_base_url=os.getenv("NEWS_API_BASE_URL") or cls.news_api_base_url,
            finbert_revision=os.getenv("FINBERT_REVISION", "main"),
            data_dir=Path(os.getenv("ESG_DATA_DIR") or ROOT / "data"),
            model_cache=Path(os.getenv("ESG_MODEL_CACHE") or ROOT / ".cache" / "huggingface"),
        )
