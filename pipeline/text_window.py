from __future__ import annotations

import re
import pandas as pd


def normalize_text(value: object) -> str:
    if value is None or (not isinstance(value, (list, dict)) and pd.isna(value)):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def build_text_window(headline: str, lead: str, content: str, word_limit: int) -> tuple[str, int]:
    if isinstance(word_limit, bool) or not isinstance(word_limit, int) or not 1 <= word_limit <= 2000:
        raise ValueError("Word limit must be an integer between 1 and 2000.")
    words = " ".join(normalize_text(v) for v in (headline, lead, content)).split()
    window = words[:word_limit]
    return " ".join(window), len(window)


def add_windows(df: pd.DataFrame, prefix: str, word_limit: int) -> pd.DataFrame:
    build_text_window("", "", "", word_limit)
    out = df.copy()
    windows = [build_text_window(r.get("headline"), r.get("lead"), r.get("content"), word_limit)
               for r in out.to_dict("records")]
    out[f"{prefix}_input_text"] = [w[0] for w in windows]
    out[f"{prefix}_word_limit"] = word_limit
    out[f"{prefix}_words_used"] = [w[1] for w in windows]
    return out
