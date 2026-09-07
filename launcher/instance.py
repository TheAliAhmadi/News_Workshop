"""One running application per user.

Clicking the icon again must reopen the existing workbench rather than start a
second backend against the same jobs and checkpoints. An exclusive lock on a
file in the per-user data directory both enforces that and records the address
of the instance already running, so the second click can open it.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from workbench import paths


class AlreadyRunning(Exception):
    def __init__(self, url):
        super().__init__(f'Research Workbench is already running at {url}.')
        self.url = url


class SingleInstance:
    """Holds an exclusive lock for the lifetime of the application."""

    def __init__(self, path=None):
        # Kept beside the jobs and settings it protects, so a separate state
        # directory is genuinely a separate application instance.
        self.path = Path(path) if path else paths.state_dir() / 'instance.lock'
        self.handle = None

    def _locked_elsewhere_url(self):
        try:
            value = json.loads(self.path.read_text(encoding='utf-8'))
            return value.get('url') or ''
        except (OSError, ValueError):
            return ''

    def acquire(self):
        """Take the lock, or raise AlreadyRunning with the existing address."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.handle = open(self.path, 'a+', encoding='utf-8')
        try:
            if os.name == 'nt':
                import msvcrt
                self.handle.seek(0)
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            url = self._locked_elsewhere_url()
            self.handle.close()
            self.handle = None
            raise AlreadyRunning(url) from None
        return self

    def publish(self, url, pid=None):
        """Record the address so a second launch can open this instance."""
        if not self.handle:
            return
        self.handle.seek(0)
        self.handle.truncate()
        self.handle.write(json.dumps({'url': url, 'pid': pid or os.getpid()}))
        self.handle.flush()
        os.fsync(self.handle.fileno())

    def release(self):
        if not self.handle:
            return
        try:
            if os.name == 'nt':
                import msvcrt
                self.handle.seek(0)
                msvcrt.locking(self.handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        finally:
            self.handle.close()
            self.handle = None

    def __enter__(self):
        return self.acquire()

    def __exit__(self, *exc):
        self.release()
        return False
