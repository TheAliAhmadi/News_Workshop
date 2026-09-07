"""Explicit serialization and small, versioned local run store."""
from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from uuid import uuid4

import pandas as pd

from config.settings import KEYS


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def json_value(v):
    if isinstance(v, Enum):
        return v.value
    if isinstance(v, dict):
        return {str(k): json_value(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [json_value(x) for x in v]
    if v is None or pd.isna(v):
        return None
    if isinstance(v, (datetime, pd.Timestamp)):
        return v.isoformat()
    if isinstance(v, Path):
        return str(v)
    if hasattr(v, "item"):
        return v.item()
    return v


def json_text(value):
    return json.dumps(json_value(value), ensure_ascii=False, indent=2, allow_nan=False)


def fingerprint(value):
    return hashlib.sha256(json_text(value).encode()).hexdigest()


def atomic_write(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".writing-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def csv_text(df, spreadsheet_safe=False):
    out = df.copy()
    for col in out.columns:
        out[col] = out[col].map(lambda v: json_text(v) if isinstance(v, (list, dict)) else json_value(v))
        if spreadsheet_safe:
            out[col] = out[col].map(
                lambda v: "'" + v if isinstance(v, str) and v.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else v
            )
    return out.to_csv(index=False, lineterminator="\n")


def write_table(df, path, spreadsheet_safe=False):
    path = Path(path)
    if path.suffix == ".json":
        atomic_write(path, json_text(df.to_dict("records")))
        # JSON [] has no column information; keep empty stage outputs loadable.
        atomic_write(str(path) + ".columns.json", json_text(list(df.columns)))
    elif path.suffix == ".csv":
        atomic_write(path, csv_text(df, spreadsheet_safe))
    else:
        raise ValueError("Use a CSV or JSON table path.")


def read_table(path):
    path = Path(path)
    if path.suffix == ".json":
        records = json.loads(path.read_text(encoding="utf-8"))
        schema_path = Path(str(path) + ".columns.json")
        columns = json.loads(schema_path.read_text(encoding="utf-8")) if not records and schema_path.exists() else None
        return pd.DataFrame(records, columns=columns)
    out = pd.read_csv(path, keep_default_na=False, dtype=object, encoding="utf-8-sig")
    bool_cols = {"esg_relevant", "human_esg_relevant", "finbert_token_truncated", "synthetic"}
    numeric_cols = {"words_available", "finbert_score", "finbert_word_limit", "finbert_words_used",
                    "llm_word_limit", "llm_words_used", "llm_attempts", "input_tokens", "output_tokens",
                    "finbert_tokens_available", "finbert_tokens_used"}
    for col in out:
        out[col] = out[col].replace("", None)
        if col in bool_cols:
            out[col] = out[col].map(lambda v: {"true": True, "false": False}.get(str(v).lower()) if v is not None else None)
        elif col in numeric_cols:
            out[col] = pd.to_numeric(out[col], errors="coerce")
        elif col in {"query_keywords", "query_strings", "merged_article_ids", "finbert_input_ids"}:
            out[col] = out[col].map(lambda v: json.loads(v) if v else [])
    return out


def assert_unique(df):
    if not set(KEYS).issubset(df.columns):
        raise ValueError("Observation keys article_id and focal_firm are required.")
    if df[KEYS].isna().any().any() or df[KEYS].eq("").any().any() or df.duplicated(KEYS).any():
        raise ValueError("Observation keys must be nonempty and unique within focal firm.")


class RunStore:
    def __init__(self, root, run_id):
        if not re.fullmatch(r"[A-Za-z0-9_-]+", run_id):
            raise ValueError("Invalid run identifier.")
        self.root = Path(root)
        self.run_id = run_id
        self.path = self.root / "runs" / f"{run_id}.json"

    @classmethod
    def create(cls, root, settings):
        # Callers supply an allowlisted public settings object, never credentials.
        run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid4().hex[:8]
        store = cls(root, run_id)
        store.save({"run_id": run_id, "created_at": utc_now(), "settings": settings, "stages": {}, "history": []})
        return store

    def manifest(self):
        return json.loads(self.path.read_text(encoding="utf-8"))

    def save(self, manifest):
        atomic_write(self.path, json_text(manifest))

    def new_path(self, stage, filename):
        revision = uuid4().hex[:12]
        return self.root / stage / self.run_id / revision / filename

    def record(self, stage, path, signature, rows, details=None):
        m = self.manifest()
        entry = {"path": str(Path(path).resolve()), "signature": signature, "rows": rows,
                 "saved_at": utc_now(), "details": details or {}}
        m["stages"][stage] = entry
        m["history"].append({"stage": stage, **entry})
        self.save(m)
        log_path = self.root.parent / "logs" / "pipeline.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as log:
            log.write(f"{utc_now()} run={self.run_id} stage={stage} rows={rows}\n")

    def load(self, stage):
        entry = self.manifest()["stages"].get(stage)
        return read_table(entry["path"]) if entry else None

    def invalidate_after(self, stage):
        order = ["raw", "clean", "finbert", "llm", "validation", "final"]
        m = self.manifest()
        for later in order[order.index(stage) + 1:]:
            m["stages"].pop(later, None)
        self.save(m)


def list_runs(root):
    return sorted((Path(root) / "runs").glob("*.json"), reverse=True)
