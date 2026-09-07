"""Supervises the local backend for the desktop launcher.

The backend binds to the loopback interface only. It prefers the usual port so
bookmarks keep working, and moves to another free port when an unrelated
application already holds it.
"""
from __future__ import annotations

import json
import logging
import socket
import threading
import time
import urllib.error
import urllib.request

DEFAULT_PORT = 8765
HOST = '127.0.0.1'
log = logging.getLogger(__name__)


def reserve_port(preferred=DEFAULT_PORT, host=HOST):
    """Bind a loopback socket, preferring the usual port.

    The socket is handed to the server still bound, so nothing else can take the
    port between the availability check and the server starting.
    """
    for candidate in (preferred, 0):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind((host, candidate))
            sock.listen(128)
            return sock, sock.getsockname()[1]
        except OSError:
            sock.close()
    raise OSError('No local port was available for the workbench.')


class BackendService:
    """Runs the FastAPI application in this process and reports readiness."""

    def __init__(self, preferred=DEFAULT_PORT, host=HOST):
        self.preferred, self.host = preferred, host
        self.port = None
        self.socket = None
        self.server = None
        self.thread = None
        self.app = None
        self.error = None

    @property
    def url(self):
        return f'http://{self.host}:{self.port}' if self.port else ''

    def start(self):
        import uvicorn
        from workbench.api import create_app

        self.socket, self.port = reserve_port(self.preferred, self.host)
        self.app = create_app()
        config = uvicorn.Config(self.app, host=self.host, port=self.port, log_level='warning',
                                timeout_graceful_shutdown=5, lifespan='on')
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(target=self._serve, name='workbench-backend', daemon=True)
        self.thread.start()
        return self.url

    def _serve(self):
        try:
            self.server.run(sockets=[self.socket])
        except BaseException as exc:  # Surface the reason in the launcher rather than dying silently.
            self.error = exc
            log.exception('The local backend stopped unexpectedly.')

    def health(self, timeout=2):
        request = urllib.request.Request(self.url + '/api/health', headers={'Accept': 'application/json'})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode('utf-8'))

    def wait_until_ready(self, timeout=120, on_progress=None):
        """Poll the health endpoint. The browser opens only after this succeeds."""
        deadline = time.monotonic() + timeout
        last = None
        while time.monotonic() < deadline:
            if self.error:
                raise RuntimeError(f'The local service could not start: {self.error}')
            try:
                status = self.health()
                if status.get('worker_ready'):
                    return status
                last = 'The background worker did not start.'
            except (urllib.error.URLError, OSError, ValueError) as exc:
                last = f'{type(exc).__name__}: {exc}'
            if on_progress:
                on_progress()
            time.sleep(0.2)
        raise TimeoutError(f'The local service did not answer within {timeout} seconds. {last or ""}'.strip())

    def stop(self, timeout=10):
        """Shut the backend and its worker down before the process exits."""
        if self.server:
            self.server.should_exit = True
        if self.thread:
            self.thread.join(timeout=timeout)
        jobs = getattr(getattr(self.app, 'state', None), 'jobs', None)
        if jobs:
            try:
                jobs.close()  # Idempotent; covers a server thread that never reached shutdown.
            except Exception:
                log.exception('The job worker did not shut down cleanly.')
        if self.socket:
            try:
                self.socket.close()
            except OSError:
                pass
