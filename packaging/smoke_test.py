"""Exercise an installed build the way a student would.

Runs against the packaged application rather than the source tree, so it catches
the failures that only appear after packaging: a missing native library, import
metadata that PyInstaller dropped, a job worker that cannot restart the frozen
executable, or a classifier that loads but will not run.

    python packaging/smoke_test.py --app "dist/Research Workbench.app"
    python packaging/smoke_test.py --app dist/ResearchWorkbench
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

# Deliberately awkward: a space and non-ASCII characters, which students do use.
WORKSPACE_NAME = 'Research Wörkbench tëst'
DATASET = ('title,description,content,synthetic\n'
           'Fictional environmental notice,Fictional software test,The company reduced emissions through renewable energy.,true\n'
           'Fictional governance notice,Fictional software test,The board appointed three independent directors.,true\n')
DEFAULT_MODEL = 'yiyanghkust/finbert-esg'


def executable(app):
    """Resolve the launcher executable inside a packaged build."""
    app = Path(app)
    if app.suffix == '.app':
        return app / 'Contents' / 'MacOS' / 'ResearchWorkbench'
    for candidate in (app / 'ResearchWorkbench.exe', app / 'ResearchWorkbench', app):
        if candidate.is_file():
            return candidate
    raise SystemExit(f'No launcher executable was found in {app}')


class Client:
    def __init__(self, base):
        self.base = base.rstrip('/')
        self.token = ''

    def request(self, path, body=None, method=None, timeout=60):
        headers = {'Accept': 'application/json', 'x-workbench-token': self.token}
        data = None
        if body is not None:
            data = json.dumps(body).encode('utf-8')
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(self.base + path, data=data, headers=headers,
                                         method=method or ('POST' if body is not None else 'GET'))
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as error:
            raise AssertionError(f'{path} returned HTTP {error.code}: {error.read().decode("utf-8", "replace")}') from None

    def upload(self, root, name, content):
        boundary = '----workbench-smoke-test'
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="root"\r\n\r\n{root}\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
                f'Content-Type: text/csv\r\n\r\n{content}\r\n--{boundary}--\r\n').encode('utf-8')
        request = urllib.request.Request(self.base + '/api/upload', data=body, method='POST', headers={
            'Content-Type': f'multipart/form-data; boundary={boundary}', 'x-workbench-token': self.token})
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode('utf-8'))

    def await_job(self, job_id, timeout, label):
        deadline = time.monotonic() + timeout
        phases = []
        while time.monotonic() < deadline:
            status = self.request(f'/api/jobs/{job_id}')['status']
            mark = (status['state'], status.get('phase'), status.get('completed'))
            if mark not in phases:
                phases.append(mark)
                print(f'   {label}: {mark}', flush=True)
            if status['state'] in ('completed', 'failed', 'cancelled', 'interrupted'):
                return status, phases
            time.sleep(0.5)
        raise AssertionError(f'{label} did not finish within {timeout} seconds.')


def start(launcher, environment, url_file, timeout=240):
    """Start the packaged application headless and wait for its address."""
    process = subprocess.Popen([str(launcher), '--headless', '--port', '0', '--url-file', str(url_file)],
                               env=environment, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise AssertionError(f'The launcher exited early:\n{process.stdout.read() if process.stdout else ""}')
        if url_file.exists():
            url = url_file.read_text(encoding='utf-8').strip()
            if url:
                return process, url
        time.sleep(0.3)
    process.terminate()
    raise AssertionError('The packaged launcher never reported a local address.')


def main(argv=None):
    parser = argparse.ArgumentParser(description='Exercise a packaged Research Workbench build')
    parser.add_argument('--app', required=True, help='Packaged .app bundle or application folder')
    parser.add_argument('--skip-classifier', action='store_true', help='Skip the classifier download and run')
    parser.add_argument('--output', default='dist/smoke-report.json')
    args = parser.parse_args(argv)

    launcher = executable(args.app)
    if not launcher.is_file():
        raise SystemExit(f'Not an executable: {launcher}')
    print(f'==> Using {launcher}')

    base = Path(tempfile.mkdtemp(prefix='workbench-smoke-'))
    research = base / WORKSPACE_NAME
    research.mkdir(parents=True, exist_ok=True)
    environment = {**os.environ,
                   'WORKBENCH_STATE_DIR': str(base / 'state'),
                   'WORKBENCH_WORKSPACE_DIR': str(research),
                   'WORKBENCH_LOG_DIR': str(base / 'logs'),
                   'WORKBENCH_MODEL_CACHE': os.environ.get('WORKBENCH_MODEL_CACHE', str(base / 'models')),
                   'WORKBENCH_SECURE_STORAGE': '0'}
    report = {'launcher': str(launcher), 'workspace': str(research)}
    url_file = base / 'address.txt'
    process = None
    try:
        print('==> Starting the packaged launcher')
        process, url = start(launcher, environment, url_file)
        report['url'] = url
        print(f'==> Ready at {url}')

        client = Client(url)
        boot = client.request('/api/bootstrap')
        client.token = boot['token']
        report['version'] = boot['build']['version']
        report['platform'] = boot['build']['platform']
        assert boot['roots'], 'No research folder was attached.'
        root = boot['roots'][0]['id']
        assert WORKSPACE_NAME in boot['roots'][0]['path'], 'The folder with a space and non-ASCII name was not used.'

        print('==> A second launch must reuse this instance, not start another')
        second = subprocess.run([str(launcher), '--headless', '--port', '0', '--url-file', str(base / 'second.txt')],
                                env=environment, capture_output=True, text=True, timeout=120)
        assert second.returncode == 0, f'The second launch failed: {second.stderr}'
        assert not (base / 'second.txt').exists(), 'A second backend started instead of reusing the running one.'
        report['single_instance'] = True

        print('==> Backend-managed preferences survive a different address')
        client.request('/api/preferences', {'tools': {'hf': {'word_limit': 123}}})
        assert client.request('/api/preferences')['tools']['hf']['word_limit'] == 123
        report['preferences'] = True

        print('==> Uploading a dataset and running a job in the spawned worker')
        reference = client.upload(root, 'fictional_input.csv', DATASET)
        clean = client.request('/api/jobs', {'tool': 'clean', 'input': reference, 'config': {'columns': ['title']},
                                             'destination': {'root': root, 'path': '', 'filename': 'cleaned.csv', 'format': 'csv'}})
        status, _ = client.await_job(clean['id'], 180, 'clean')
        assert status['state'] == 'completed', f'The clean job did not complete: {status}'
        assert (research / 'cleaned.csv').exists(), 'The clean job produced no output file.'
        report['worker'] = {'state': status['state'], 'completed': status['completed']}

        print('==> Cancel and resume keep completed work')
        long_input = client.upload(root, 'cancel_resume.csv', DATASET + DATASET + DATASET)
        cancellable = client.request('/api/jobs', {
            'tool': 'clean', 'input': long_input,
            'config': {'columns': ['title', 'description', 'content']},
            'destination': {'root': root, 'path': '', 'filename': 'cancel_resume.csv', 'format': 'csv'}})
        # Give the worker a moment to start, then cancel.
        time.sleep(0.4)
        client.request(f'/api/jobs/{cancellable["id"]}/cancel', {})
        cancelled, _ = client.await_job(cancellable['id'], 120, 'cancel')
        assert cancelled['state'] in ('cancelled', 'interrupted', 'completed'), cancelled
        if cancelled['state'] != 'completed':
            client.request(f'/api/jobs/{cancellable["id"]}/resume', {})
            status, _ = client.await_job(cancellable['id'], 180, 'resume')
            assert status['state'] == 'completed', f'Resume did not complete: {status}'
        report['cancel_resume'] = True

        if not args.skip_classifier:
            print('==> Preparing and running the default classifier')
            client.request('/api/models/prepare', {'model': DEFAULT_MODEL})
            deadline = time.monotonic() + 1800
            while time.monotonic() < deadline:
                preparation = client.request('/api/models/prepare')
                if preparation['state'] in ('completed', 'failed', 'cancelled'):
                    break
                time.sleep(2)
            assert preparation['state'] == 'completed', f'Model preparation failed: {preparation}'
            report['model_preparation'] = {'labels': preparation['labels'], 'total': preparation['total']}

            classify = client.request('/api/jobs', {
                'tool': 'hf', 'input': reference,
                'config': {'model': DEFAULT_MODEL, 'columns': ['content', 'title'], 'prefix': 'hf_',
                           'word_limit': 150, 'batch_size': 1, 'device': 'cpu'},
                'destination': {'root': root, 'path': '', 'filename': 'classified.json', 'format': 'json'}})
            status, _ = client.await_job(classify['id'], 1800, 'classify')
            assert status['state'] == 'completed', f'Classification did not complete: {status}'
            assert status['failed'] == 0, f'Classification reported failed rows: {status}'
            rows = json.loads((research / 'classified.json').read_text(encoding='utf-8'))
            assert all(row['hf_status'] == 'ok' for row in rows), 'A classified row was not marked ok.'
            report['classifier'] = {'rows': len(rows), 'labels': [row['hf_label'] for row in rows],
                                    'revision': rows[0]['hf_model_revision']}

        print('==> Diagnostics')
        report['diagnostics'] = client.request('/api/diagnostics')
    finally:
        if process and process.poll() is None:
            print('==> Stopping the application')
            process.terminate()
            try:
                process.wait(timeout=45)
            except subprocess.TimeoutExpired:
                process.kill()
                raise AssertionError('The application did not shut down when asked.')
            report['exit_code'] = process.returncode
            # Quit must not leave a worker or second launcher behind.
            time.sleep(1.0)
            if process.poll() is None:
                raise AssertionError('The launcher process was still running after terminate.')
            report['clean_shutdown'] = True
        shutil.rmtree(base, ignore_errors=True)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, default=str), encoding='utf-8')
    print(json.dumps(report, indent=2, default=str))
    print(f'\nPacked build passed the smoke test. Report: {output}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
