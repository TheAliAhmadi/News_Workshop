"""One running application per user.

Clicking the icon again must reopen the existing workbench rather than start a
second backend against the same jobs and checkpoints. An exclusive lock on a
file in the per-user data directory enforces that. The live address is written
to a sibling JSON file so a second launch can read it on Windows, where the
locked byte of the lock file cannot be shared with another reader.
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
        self.info_path = self.path.with_name(self.path.stem + '.json')
        self.handle = None

    def _locked_elsewhere_url(self):
        for candidate in (self.info_path, self.path):
            try:
                value = json.loads(candidate.read_text(encoding='utf-8'))
                url = value.get('url') or ''
                if url:
                    return url
            except (OSError, ValueError):
                continue
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
        payload = json.dumps({'url': url, 'pid': pid or os.getpid()})
        # Sibling file is readable while the lock file itself stays exclusively held.
        self.info_path.write_text(payload, encoding='utf-8')
        if not self.handle:
            return
        self.handle.seek(0)
        self.handle.truncate()
        self.handle.write(payload)
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
            try:
                self.info_path.unlink(missing_ok=True)
            except OSError:
                pass

    def __enter__(self):
        return self.acquire()

    def __exit__(self, *exc):
        self.release()
        return False
