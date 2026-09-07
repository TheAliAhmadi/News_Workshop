"""Test isolation.

Tests must never read the developer's `.env`, touch the real keychain, or write
into the per-user application directories of the machine running them.
"""
import os
import tempfile
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def isolated_environment(tmp_path_factory, monkeypatch):
    base = tmp_path_factory.mktemp('workbench-env')
    monkeypatch.setenv('WORKBENCH_SECURE_STORAGE', '0')
    monkeypatch.setenv('WORKBENCH_ENV_FILE', str(base / 'absent.env'))
    monkeypatch.setenv('WORKBENCH_STATE_DIR', str(base / 'state'))
    monkeypatch.setenv('WORKBENCH_WORKSPACE_DIR', str(base / 'research'))
    monkeypatch.setenv('WORKBENCH_MODEL_CACHE', str(base / 'models'))
    for name in ('NEWS_API_KEY', 'OPENAI_API_KEY', 'OPENAI_MODEL'):
        monkeypatch.delenv(name, raising=False)
    yield base


@pytest.fixture
def temporary_directory():
    """A writable directory outside the workspace, on every supported platform."""
    with tempfile.TemporaryDirectory(prefix='workbench-test-') as folder:
        yield Path(folder)
