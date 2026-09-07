"""API credentials.

Keys always live in backend memory for the running session. A student may also
choose to remember them on this computer, which stores them in the macOS
Keychain or Windows Credential Manager through `keyring`. When no secure store
is available the keys stay session-only and the interface says so; plaintext
keys are never written silently.
"""
from __future__ import annotations

import os

from .version import APP_NAME

SERVICE = APP_NAME
ENVIRONMENT = {'news': 'NEWS_API_KEY', 'openai': 'OPENAI_API_KEY'}
UNAVAILABLE = ('Secure storage is unavailable on this computer. Keys are kept for '
               'this session only and must be entered again after a restart.')


def _backend():
    """Return an available keyring backend, or a reason it cannot be used."""
    if os.environ.get('WORKBENCH_SECURE_STORAGE', '').strip().lower() in ('0', 'false', 'no'):
        return None, 'Secure storage is turned off for this run. ' + UNAVAILABLE
    try:
        import keyring
    except Exception:
        return None, 'The keyring library is not installed in this build. ' + UNAVAILABLE
    try:
        backend = keyring.get_keyring()
    except Exception as exc:
        return None, f'Secure storage could not start ({type(exc).__name__}). ' + UNAVAILABLE
    name = type(backend).__module__ + '.' + type(backend).__name__
    if 'fail' in name.lower() or 'null' in name.lower():
        return None, UNAVAILABLE
    return keyring, name


class CredentialStore:
    """Session keys, with optional per-user secure storage."""

    def __init__(self, names=tuple(ENVIRONMENT), service=SERVICE):
        self.names = list(names)
        self.service = service
        self.keys = {name: '' for name in self.names}
        self.saved = {name: False for name in self.names}
        keyring, detail = _backend()
        self._keyring = keyring
        self.available = keyring is not None
        self.detail = detail if not self.available else f'Using {detail}.'

    # -- secure storage -------------------------------------------------
    def _account(self, name):
        return f'{name}-api-key'

    def _read(self, name):
        try:
            return self._keyring.get_password(self.service, self._account(name)) or ''
        except Exception:
            self._disable()
            return ''

    def _disable(self):
        self._keyring, self.available = None, False
        self.detail = UNAVAILABLE

    def load(self):
        """Populate the session from secure storage, then the developer `.env`."""
        for name in self.names:
            value = self._read(name) if self.available else ''
            self.saved[name] = bool(value)
            self.keys[name] = value or os.getenv(ENVIRONMENT[name], '')
        return self.status()

    def apply(self, values, remember=False, remove=()):
        """Update keys for this session and honour the remember/remove choice."""
        for name in remove:
            if name in self.keys:
                self.keys[name] = ''
                self.forget(name)
        for name, value in values.items():
            if name not in self.keys or not isinstance(value, str) or not value.strip():
                continue
            self.keys[name] = value.strip()
            if remember:
                self.remember(name)
            else:
                # Switching a remembered key to session-only must not leave the old one behind.
                self.forget(name)
        return self.status()

    def remember(self, name):
        if not self.available:
            return False
        try:
            self._keyring.set_password(self.service, self._account(name), self.keys[name])
        except Exception:
            self._disable()
            return False
        self.saved[name] = True
        return True

    def forget(self, name):
        if self.available:
            try:
                self._keyring.delete_password(self.service, self._account(name))
            except Exception:
                pass  # Absent entries and locked stores are both fine to ignore here.
        self.saved[name] = False

    def status(self):
        """Flags only. Key values are never returned to the interface."""
        return {
            'connections': {name: bool(value) for name, value in self.keys.items()},
            'remembered': dict(self.saved),
            'secure_storage': {'available': self.available, 'detail': self.detail},
        }
