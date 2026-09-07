"""Backend-managed user storage for settings, tool preferences, and design conversations.

These were previously kept in browser storage, which is scoped to the address
of the page. A different local port therefore looked like data loss. Storing
them per user, next to jobs and checkpoints, keeps them across restarts,
port changes, and application upgrades.
"""
from __future__ import annotations

import json
from pathlib import Path

from pipeline.io import atomic_write, json_text

LIMIT = 2 * 1024 * 1024
SETTINGS = {'first_run_complete': False, 'research_folder': '', 'imported_browser_settings': False}


def _read(path, fallback):
    try:
        value = json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return fallback  # A damaged preferences file must never block startup.
    return value if isinstance(value, type(fallback)) else fallback


def _check_size(value, label):
    text = json_text(value)
    if len(text.encode('utf-8')) > LIMIT:
        raise ValueError(f'{label} are limited to 2 MB. Save large drafts as files in your research folder.')
    return text


class UserStore:
    def __init__(self, state):
        self.state = Path(state)
        self.designer = self.state / 'designer'
        self.state.mkdir(parents=True, exist_ok=True)

    # -- application settings -------------------------------------------
    def settings(self):
        return {**SETTINGS, **_read(self.state / 'settings.json', {})}

    def update_settings(self, values):
        current = self.settings()
        for key in SETTINGS:
            if key in values:
                current[key] = values[key]
        atomic_write(self.state / 'settings.json', json_text(current))
        return current

    # -- tool preferences -----------------------------------------------
    def preferences(self):
        return _read(self.state / 'preferences.json', {})

    def save_preferences(self, tools):
        if not isinstance(tools, dict):
            raise ValueError('Tool preferences must be an object keyed by tool name.')
        atomic_write(self.state / 'preferences.json', _check_size(tools, 'Tool preferences'))
        return {'saved': True}

    # -- design conversations -------------------------------------------
    def _session_path(self, workspace):
        key = str(workspace or '')
        if not key.isalnum() or len(key) > 64:
            raise ValueError('Unknown workspace identifier.')
        return self.designer / (key + '.json')

    def session(self, workspace):
        return _read(self._session_path(workspace), {})

    def save_session(self, workspace, value):
        if not isinstance(value, dict):
            raise ValueError('A design conversation must be an object.')
        atomic_write(self._session_path(workspace), _check_size(value, 'Design conversations'))
        return {'saved': True}

    # -- one-time migration from browser storage -------------------------
    def import_browser_state(self, tools, sessions):
        """Adopt existing browser settings once, only while backend storage is empty.

        Custom schemas and drafts a student already wrote are preserved; a later
        import can never overwrite preferences they have since saved here.
        """
        settings = self.settings()
        if settings['imported_browser_settings'] or self.preferences():
            return {'imported': False, 'reason': 'Backend preferences already exist.'}
        if isinstance(tools, dict) and tools:
            self.save_preferences(tools)
        for workspace, value in (sessions or {}).items():
            if isinstance(value, dict) and value:
                try:
                    self.save_session(workspace, value)
                except ValueError:
                    continue  # Skip an unusable conversation rather than failing the import.
        self.update_settings({'imported_browser_settings': True})
        return {'imported': True}
