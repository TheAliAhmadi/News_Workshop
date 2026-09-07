"""Platform locations.

Installed application files are read-only and may be replaced by an upgrade.
Everything a student creates or configures lives in per-user directories that
upgrades and uninstallation leave alone.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from .version import APP_NAME

WINDOWS = os.name == 'nt'
MACOS = sys.platform == 'darwin'


def packaged():
    """True inside an installed build; false when running from a source checkout."""
    override = os.environ.get('WORKBENCH_PACKAGED')
    if override is not None:
        return override.strip().lower() not in ('', '0', 'false', 'no')
    return bool(getattr(sys, 'frozen', False))


def resource_dir():
    """Installed, read-only application files: bundled interface and libraries."""
    bundle = getattr(sys, '_MEIPASS', None)
    return Path(bundle) if bundle else Path(__file__).resolve().parents[1]


def home():
    return Path(os.path.expanduser('~'))


def _local_app_data():
    return Path(os.environ.get('LOCALAPPDATA') or home() / 'AppData' / 'Local')


def user_data_dir():
    """Per-user application data: settings, root registrations, jobs, checkpoints."""
    if MACOS:
        return home() / 'Library' / 'Application Support' / APP_NAME
    if WINDOWS:
        return _local_app_data() / APP_NAME
    return Path(os.environ.get('XDG_DATA_HOME') or home() / '.local' / 'share') / APP_NAME


def user_cache_dir():
    """Per-user cache: downloaded models. Safe to delete; re-downloads on demand."""
    if MACOS:
        return home() / 'Library' / 'Caches' / APP_NAME
    if WINDOWS:
        return _local_app_data() / APP_NAME / 'Cache'
    return Path(os.environ.get('XDG_CACHE_HOME') or home() / '.cache') / APP_NAME


def user_log_dir():
    override = os.environ.get('WORKBENCH_LOG_DIR')
    if override:
        return Path(override).expanduser()
    if MACOS:
        return home() / 'Library' / 'Logs' / APP_NAME
    return user_data_dir() / 'logs'


def _override(name):
    value = os.environ.get(name)
    return Path(value).expanduser() if value else None


def state_dir():
    """Settings, attached-root registry, jobs, and checkpoints."""
    return _override('WORKBENCH_STATE_DIR') or (user_data_dir() / 'state' if packaged() else resource_dir() / '.workbench')


def default_workspace_dir():
    """Default research folder. Students may attach or choose others."""
    return _override('WORKBENCH_WORKSPACE_DIR') or (home() / 'ResearchWorkbench' if packaged() else resource_dir() / 'research_workspace')


def model_cache_dir():
    """Hugging Face downloads, retained between runs and upgrades."""
    return _override('WORKBENCH_MODEL_CACHE') or (user_cache_dir() / 'models' if packaged() else resource_dir() / '.cache' / 'huggingface')


def static_dir():
    """Compiled interface bundled with the application."""
    return _override('WORKBENCH_STATIC_DIR') or resource_dir() / 'frontend' / 'out'


def env_file():
    """Developer `.env`, still honoured for source-based use."""
    return _override('WORKBENCH_ENV_FILE') or resource_dir() / '.env'


def describe(state=None, research=None):
    """Locations shown in Troubleshooting and diagnostic reports.

    The running application passes the locations it actually opened, which may
    differ from the defaults when a student chose another research folder.
    """
    return {
        'packaged': packaged(),
        'application': str(resource_dir()),
        'data': str(state or state_dir()),
        'models': str(model_cache_dir()),
        'research': str(research or default_workspace_dir()),
        'logs': str(user_log_dir()),
    }
