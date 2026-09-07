from __future__ import annotations

import copy
import json
import multiprocessing as mp
import threading
import time
import uuid
from pathlib import Path
import pandas as pd
from pipeline.io import atomic_write, json_text
from .files import digest, read_dataset, records, save_dataset
from .configuration import validate_config
from .processors import safe_error


class Context:
    def __init__(self, folder, keys):
        self.folder = Path(folder)
        self.keys = keys
        self.status = json.loads((self.folder / 'status.json').read_text(encoding='utf-8'))
        self.rows = json.loads((self.folder / 'checkpoint.json').read_text(encoding='utf-8')) if (self.folder / 'checkpoint.json').exists() else []

    def update(self, **values):
        self.status.update(values, updated_at=time.time())
        atomic_write(self.folder / 'status.json', json_text(self.status))

    def cancelled(self):
        return (self.folder / 'cancel').exists()

    def checkpoint(self, rows, **progress):
        self.rows = rows
        atomic_write(self.folder / 'checkpoint.json', json_text(rows))
        self.update(**progress)


def run_job(folder, keys):
    from .processors import hf_process, llm_process, news_process, clean_process, aggregate_process
    ctx = Context(folder, keys)
    request = json.loads((Path(folder) / 'request.json').read_text(encoding='utf-8'))
    ctx.update(state='running', started_at=time.time(), error='')
    try:
        if ctx.cancelled():
            ctx.update(state='cancelled', phase='Cancelled before processing', finished_at=time.time())
            return
        if request['tool'] == 'news':
            result = news_process(ctx, request['config'])
        else:
            df = read_dataset(Path(folder) / request['snapshot'])
            processor = {'hf': hf_process, 'llm': llm_process, 'clean': clean_process, 'aggregate': aggregate_process}[request['tool']]
            result = processor(ctx, df, request['config'])
        ctx.checkpoint(records(result))
        # Re-resolve the output root after processing to detect changed symlinks.
        from .files import Workspace
        workspace = Workspace(Path(request['state_dir']), Path(request['default_root']))
        resolved, _ = workspace.destination({**request['destination'], 'overwrite': True})
        if str(resolved) != request['target']:
            raise ValueError('The output folder changed while processing. Choose a safe destination to resume.')
        save_dataset(result, request['target'], overwrite=request.get('replace', False), expected_hash=request.get('target_hash'))
        ctx.update(output_hash=digest(request['target']), state='cancelled' if ctx.cancelled() else 'completed',
                   phase='Cancelled; completed rows saved' if ctx.cancelled() else 'Finished', finished_at=time.time(), saved=True)
    except BaseException as exc:
        ctx.update(state='cancelled' if ctx.cancelled() else 'failed', error=safe_error(exc),
                   phase='Stopped; checkpoint retained', finished_at=time.time())


class JobManager:
    def __init__(self, workspace, keys, start=True):
        self.workspace, self.keys = workspace, keys
        self.base = workspace.state / 'jobs'
        self.base.mkdir(exist_ok=True)
        self.lock = threading.RLock()
        self.stop_event = threading.Event()
        self.process = None
        self.active_id = None
        self.scheduler_error = ''
        for folder in self.base.iterdir():
            if (folder / 'status.json').exists():
                ctx = Context(folder, {})
                if ctx.status['state'] in ('queued', 'running'):
                    ctx.update(state='interrupted', phase='Application restarted. Resume explicitly to continue.')
        self.thread = threading.Thread(target=self._loop, daemon=True)
        if start:
            self.thread.start()

    def list(self):
        return sorted([json.loads(p.read_text(encoding='utf-8')) for p in self.base.glob('*/status.json')], key=lambda x: x['created_at'], reverse=True)

    def folder(self, job_id):
        if not job_id.isalnum() or not (self.base / job_id / 'status.json').exists():
            raise ValueError('Job not found.')
        return self.base / job_id

    def submit(self, request):
        with self.lock:
            tool = request['tool']
            input_path = self.workspace.resolve(request.get('input')) if tool != 'news' else None
            df = read_dataset(input_path) if input_path else None
            config = validate_config(tool, request.get('config', {}), df)
            if tool == 'news' and not self.keys.get('news'):
                raise ValueError('Set your NewsAPI key in Connections before retrieving articles.')
            if tool == 'llm' and not self.keys.get('openai'):
                raise ValueError('Set your OpenAI key in Connections before starting extraction.')
            target, output_ref = self.workspace.destination(request['destination'])
            if input_path == target:
                raise ValueError('Processing must create a separate output file; it cannot replace the input dataset.')
            if any(j['state'] in ('queued', 'running') and j.get('output') == output_ref for j in self.list()):
                raise ValueError('Another queued or running job is using this output. Choose a new filename.')
            job_id = uuid.uuid4().hex[:16]
            folder = self.base / job_id
            folder.mkdir()
            snapshot = None
            input_hash = None
            if input_path:
                snapshot = 'input' + input_path.suffix.lower()
                # Capture bytes once, then validate the exact snapshot used by the worker.
                content = input_path.read_bytes()
                (folder / snapshot).write_bytes(content)
                input_hash = digest(folder / snapshot)
                config = validate_config(tool, config, read_dataset(folder / snapshot))
            saved_request = {**copy.deepcopy(request), 'config': config, 'snapshot': snapshot, 'input_hash': input_hash,
                             'target': str(target), 'replace': bool(request['destination'].get('overwrite')),
                             'target_hash': digest(target) if target.exists() else None,
                             'state_dir': str(self.workspace.state), 'default_root': next(iter(self.workspace.roots.values()))}
            atomic_write(folder / 'request.json', json_text(saved_request))
            status = {'id': job_id, 'tool': tool, 'state': 'queued', 'phase': 'Waiting for worker', 'created_at': time.time(),
                      'completed': 0, 'total': None, 'failed': 0, 'input_hash': input_hash, 'output': output_ref, 'filename': target.name,
                      'saved': False, 'error': ''}
            atomic_write(folder / 'status.json', json_text(status))
            return status

    def cancel(self, job_id):
        with self.lock:
            folder = self.folder(job_id)
            ctx = Context(folder, {})
            (folder / 'cancel').touch()
            if ctx.status['state'] == 'queued':
                ctx.update(state='cancelled', phase='Cancelled before processing')
            elif ctx.status.get('phase') == 'Loading / downloading classifier' and self.active_id == job_id and self.process:
                self.process.terminate()
                self.process.join(timeout=3)
                ctx.update(state='cancelled', phase='Model loading cancelled; cached downloads retained', finished_at=time.time())
            return ctx.status

    def resume(self, job_id, destination=None):
        with self.lock:
            folder = self.folder(job_id)
            ctx = Context(folder, {})
            if ctx.status['state'] not in ('failed', 'cancelled', 'interrupted', 'completed'):
                raise ValueError('Wait until this job stops before resuming it.')
            if ctx.status['state'] == 'completed' and not ctx.status.get('failed'):
                raise ValueError('All selected rows succeeded. Submit a new job to process again.')
            req = json.loads((folder / 'request.json').read_text(encoding='utf-8'))
            if destination:
                target, ref = self.workspace.destination(destination)
                if req.get('input') and target == self.workspace.resolve(req['input']):
                    raise ValueError('Choose an output separate from the source input.')
                req.update(destination=destination, target=str(target), replace=bool(destination.get('overwrite')), target_hash=digest(target) if target.exists() else None)
                ctx.status.update(output=ref, filename=target.name, saved=False)
            elif ctx.status.get('saved'):
                req.update(replace=True, target_hash=ctx.status['output_hash'])
            if any(j['id'] != job_id and j['state'] in ('queued', 'running') and j.get('output') == ctx.status['output'] for j in self.list()):
                raise ValueError('Another active job is using this output destination.')
            atomic_write(folder / 'request.json', json_text(req))
            (folder / 'cancel').unlink(missing_ok=True)
            ctx.update(state='queued', phase='Queued to resume; successful rows retained', error='')
            return ctx.status

    def _loop(self):
        while not self.stop_event.wait(.3):
            try:
                self._tick()
                self.scheduler_error = ''
            except (OSError, ValueError) as exc:
                # A transient filesystem error must not kill the queue thread.
                self.scheduler_error = safe_error(exc)

    def _tick(self):
        with self.lock:
            if self.process:
                if self.process.is_alive():
                    return
                self.process.join()
                ctx = Context(self.folder(self.active_id), {})
                if ctx.status['state'] == 'running':
                    ctx.update(state='interrupted', phase='Worker stopped unexpectedly; resume from checkpoint.')
                self.process, self.active_id = None, None
            queued = [j for j in reversed(self.list()) if j['state'] == 'queued']
            if queued:
                job = queued[0]
                self.active_id = job['id']
                self.process = mp.get_context('spawn').Process(target=run_job, args=(str(self.folder(job['id'])), dict(self.keys)), daemon=True)
                self.process.start()

    def close(self):
        self.stop_event.set()
        if self.thread.is_alive():
            self.thread.join(timeout=2)
        if self.process and self.process.is_alive():
            self.process.terminate()
            self.process.join(timeout=3)
            Context(self.folder(self.active_id), {}).update(state='interrupted', phase='Service stopped; resume explicitly.')
