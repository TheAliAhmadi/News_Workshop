"""Launcher entry point.

Order matters here. Multiprocessing initialization has to run before the
application is imported, because the job worker restarts this same executable
and must not rebuild a window when it does.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
import time
from pathlib import Path

LOG_FORMAT = '%(asctime)s %(levelname)s %(name)s %(message)s'


def attach_streams(log_dir):
    """Give the process real streams.

    A windowed build has no console, so `sys.stdout` and `sys.stderr` are None.
    Libraries that write to them directly would fail, and progress output would
    be lost, so both are pointed at a rotating log file.
    """
    for candidate in (log_dir, Path(tempfile.gettempdir()) / 'ResearchWorkbench-logs'):
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            log_file = candidate / 'workbench.log'
            if log_file.exists() and log_file.stat().st_size > 4 * 1024 * 1024:
                log_file.replace(candidate / 'workbench.previous.log')
            stream = open(log_file, 'a', encoding='utf-8', buffering=1)
        except OSError:
            continue  # A read-only or restricted location must not stop the application.
        if sys.stdout is None:
            sys.stdout = stream
        if sys.stderr is None:
            sys.stderr = stream
        logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, handlers=[logging.StreamHandler(stream)])
        return log_file
    # Without any writable location, keep whatever streams the process already has.
    if sys.stdout is None:
        sys.stdout = sys.stderr = open(os.devnull, 'w', encoding='utf-8')
    logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
    return None


def self_test(service):
    """Prove a packaged build actually works: service, worker, and classifier."""
    from workbench import paths
    from workbench.version import describe

    report = {'build': describe(), 'locations': paths.describe(), 'url': service.url}
    report['health'] = service.wait_until_ready(timeout=180)
    import urllib.request
    with urllib.request.urlopen(service.url + '/api/bootstrap', timeout=10) as response:
        bootstrap = json.loads(response.read().decode('utf-8'))
    report['bootstrap'] = {'roots': len(bootstrap['roots']), 'version': bootstrap['build']['version'],
                           'secure_storage': bootstrap['secure_storage']['available'],
                           'templates': sorted(bootstrap['templates'])}
    report['interface_bundled'] = (paths.static_dir() / 'index.html').exists()
    if not report['interface_bundled']:
        raise SystemExit('The compiled interface is missing from this build.')

    # Import the machine-learning stack the classifier depends on, so a build that
    # is missing a native library or import metadata fails here rather than in class.
    import torch
    import transformers
    from transformers import AutoTokenizer
    report['torch'] = torch.__version__
    report['transformers'] = transformers.__version__
    report['tokenizer_backends'] = bool(AutoTokenizer)
    return report


def offline_classifier_check():
    """Run the bundled classifier if its weights are already cached."""
    from workbench.processors import load_classifier
    from config.settings import FINBERT_MODEL_NAME
    os.environ.setdefault('HF_HUB_OFFLINE', '0')
    classifier, revision = load_classifier({'model': FINBERT_MODEL_NAME, 'device': 'cpu'})
    result = classifier('The company published its annual sustainability report.', truncation=True, max_length=512, top_k=None)
    return {'model': FINBERT_MODEL_NAME, 'revision': revision, 'predictions': len(result)}


def main(argv=None):
    from workbench import paths

    parser = argparse.ArgumentParser(prog='Research Workbench', description='Local research workbench launcher')
    parser.add_argument('--port', type=int, default=8765, help='Preferred local port')
    parser.add_argument('--headless', action='store_true', help='Run the local service without the launcher window')
    parser.add_argument('--url-file', help='Write the local address here once the service is ready')
    parser.add_argument('--self-test', action='store_true', help='Verify this installation and exit')
    parser.add_argument('--classifier-check', action='store_true', help='Also download and run the default classifier during --self-test')
    parser.add_argument('--version', action='store_true', help='Print the version and exit')
    args = parser.parse_args(argv)

    from workbench.version import VERSION
    if args.version:
        print(VERSION)
        return 0

    log_file = attach_streams(paths.user_log_dir())
    logging.getLogger(__name__).info('Starting Research Workbench %s (packaged=%s)', VERSION, paths.packaged())

    from .instance import AlreadyRunning, SingleInstance
    from .service import BackendService

    if args.self_test:
        service = BackendService(preferred=args.port)
        service.start()
        try:
            report = self_test(service)
            if args.classifier_check:
                report['classifier'] = offline_classifier_check()
        finally:
            service.stop()
        print(json.dumps(report, indent=2, default=str))
        return 0

    instance = SingleInstance()
    try:
        instance.acquire()
    except AlreadyRunning as running:
        # A second click reopens the workbench already running for this user.
        import webbrowser
        if running.url:
            webbrowser.open(running.url)
            return 0
        _report_startup_error(str(running), log_file)
        return 1

    try:
        if args.headless:
            service = BackendService(preferred=args.port)
            url = service.start()
            service.wait_until_ready(timeout=180)
            instance.publish(url)
            if args.url_file:
                # A windowed build has no console, so the address is also written
                # where an automated check can read it.
                Path(args.url_file).write_text(url, encoding='utf-8')
            print(url, flush=True)
            try:
                while True:
                    time.sleep(0.5)
            except KeyboardInterrupt:
                pass
            finally:
                service.stop()
            return 0

        from .gui import LauncherWindow
        LauncherWindow(instance=instance, log_file=log_file, preferred_port=args.port).start()
        return 0
    finally:
        instance.release()


def _report_startup_error(message, log_file):
    """Show a readable error even when the window never opened."""
    logging.getLogger(__name__).error(message)
    try:
        import tkinter as tk
        from tkinter import messagebox
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror('Research Workbench', f'{message}\n\nDetails were written to:\n{log_file}')
        root.destroy()
    except Exception:
        print(message, file=sys.stderr)
