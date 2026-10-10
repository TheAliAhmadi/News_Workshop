from __future__ import annotations

import json
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse
import pandas as pd
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from config.settings import FINBERT_MODEL_NAME
from . import paths
from .files import Workspace, browse, create_folder, read_dataset, read_user_text, records, digest
from .configuration import SOURCES, templates, validate_schema, validate_config
from .credentials import CredentialStore, check_key
from .jobs import JobManager
from .models import ModelPreparer
from .preferences import UserStore
from .designer import DesignRequest, generate_design
from .processors import prompt_for, safe_error
from .version import describe


def open_workspace(state_dir, default, settings):
    """Attach the student's chosen research folder, or the platform default.

    A folder chosen on an earlier run may since have been renamed, deleted, or
    moved to a disconnected drive. The application still has to open, so it falls
    back to the default folder and leaves the earlier choice untouched.
    """
    chosen = settings.settings()['research_folder']
    fallback = paths.default_workspace_dir()
    reason = ''
    for candidate in ([default] if default else [Path(chosen).expanduser()] if chosen else []) + [fallback]:
        try:
            return Workspace(state_dir, candidate)
        except (OSError, ValueError) as exc:
            reason = str(exc)
    raise ValueError(f'No research folder could be opened. Last tried {fallback}: {reason}')


def create_app(state=None, default=None, start_worker=True):
    load_dotenv(paths.env_file())
    state_dir = Path(state) if state else paths.state_dir()
    settings = UserStore(state_dir)
    workspace = open_workspace(state_dir, Path(default) if default else None, settings)
    credentials = CredentialStore()
    credentials.load()
    keys = credentials.keys
    manager = JobManager(workspace, keys, start=start_worker)
    preparer = ModelPreparer()
    token = secrets.token_urlsafe(32)

    @asynccontextmanager
    async def lifespan(app):
        yield
        manager.close()

    app = FastAPI(title='Research Workbench', lifespan=lifespan)
    app.state.workspace, app.state.jobs = workspace, manager
    app.state.settings, app.state.credentials, app.state.models = settings, credentials, preparer

    def locations():
        """The locations this instance actually opened, not the platform defaults."""
        return paths.describe(state=workspace.state, research=next(iter(workspace.roots.values()), None))

    @app.middleware('http')
    async def local_only(request: Request, call_next):
        host = request.url.hostname
        if host not in ('localhost', '127.0.0.1', 'testserver'):
            return JSONResponse({'detail': 'Use the local workbench address.'}, status_code=403)
        origin = request.headers.get('origin')
        if origin and origin != str(request.base_url).rstrip('/'):
            return JSONResponse({'detail': 'Cross-origin requests are not allowed.'}, status_code=403)
        if request.url.path.startswith('/api/') and request.method not in ('GET', 'HEAD') and request.headers.get('x-workbench-token') != token:
            return JSONResponse({'detail': 'Refresh the application to reconnect securely.'}, status_code=403)
        return await call_next(request)

    @app.exception_handler(ValueError)
    async def bad_value(request, exc):
        return JSONResponse({'detail': str(exc)}, status_code=400)

    @app.exception_handler(Exception)
    async def unexpected(request, exc):
        return JSONResponse({'detail': safe_error(exc)}, status_code=400)

    @app.get('/api/bootstrap')
    def bootstrap():
        return {'token': token, 'roots': workspace.list_roots(), 'templates': templates(),
                'sources': [{'name': n, 'domain': d, 'suggested': True} for n, d in SOURCES],
                'default_model': os.getenv('OPENAI_MODEL', ''),
                'build': describe(), 'locations': locations(), 'settings': settings.settings(),
                'default_research_folder': str(paths.default_workspace_dir()),
                'default_classifier': FINBERT_MODEL_NAME, **credentials.status()}

    @app.post('/api/connections')
    def connections(body: dict):
        """Check new keys with their provider, then save the ones that work.

        A key the provider rejects is not saved, so a typo never silently
        replaces a working key. Keys that cannot be checked (offline) are saved.
        """
        remove = [name for name in body.get('remove', []) if name in keys]
        values = {name: value.strip() for name, value in body.items()
                  if name in keys and isinstance(value, str) and value.strip()}
        checks = {}
        for name, value in list(values.items()):
            if os.environ.get('WORKBENCH_SKIP_KEY_CHECKS'):  # Offline browser tests.
                checks[name] = {'state': 'unchecked', 'message': 'Key checks are turned off for this run.'}
            else:
                checks[name] = check_key(name, value)
                if checks[name]['state'] == 'rejected':
                    values.pop(name)
        return {**credentials.apply(values, remember=bool(body.get('remember')), remove=remove), 'checks': checks}

    @app.post('/api/connections/check')
    def connection_check(body: dict):
        name = body.get('name')
        if name not in keys:
            raise ValueError('Unknown connection.')
        if not keys[name]:
            raise ValueError('No key is set for this connection yet.')
        return {**credentials.status(), 'checks': {name: check_key(name, keys[name])}}

    @app.get('/api/settings')
    def read_settings():
        return settings.settings()

    @app.post('/api/settings')
    def write_settings(body: dict):
        return settings.update_settings(body)

    @app.post('/api/research-folder')
    def research_folder(body: dict):
        """Choose the research folder used the next time the application starts."""
        folder = Path(body['path']).expanduser()
        if not body.get('create') and not folder.is_dir():
            raise ValueError('Enter an existing absolute directory path, or choose to create it.')
        folder.mkdir(parents=True, exist_ok=True)
        attached = workspace.attach(str(folder), primary=True)
        settings.update_settings({'research_folder': str(folder)})
        return {'root': attached, 'roots': workspace.list_roots(), 'locations': locations()}

    # Browsing is a POST so it needs the session token, like every change.
    @app.post('/api/browse')
    def browse_folders(body: dict):
        return browse(body.get('path'))

    @app.post('/api/browse/folder')
    def browse_create(body: dict):
        return create_folder(body['path'], body.get('name'))

    @app.get('/api/preferences')
    def read_preferences():
        return {'tools': settings.preferences(), **settings.settings()}

    @app.post('/api/preferences')
    def write_preferences(body: dict):
        return settings.save_preferences(body.get('tools', {}))

    @app.post('/api/preferences/import')
    def import_preferences(body: dict):
        return settings.import_browser_state(body.get('tools'), body.get('designer'))

    @app.get('/api/designer-sessions/{workspace_id}')
    def read_session(workspace_id: str):
        return settings.session(workspace_id)

    @app.post('/api/designer-sessions/{workspace_id}')
    def write_session(workspace_id: str, body: dict):
        return settings.save_session(workspace_id, body)

    @app.get('/api/roots')
    def roots():
        return workspace.list_roots()

    @app.post('/api/roots')
    def add_root(body: dict):
        return workspace.attach(body['path'])

    @app.post('/api/roots/detach')
    def detach_root(body: dict):
        root = body['root']
        if root == next(iter(workspace.roots)):
            raise ValueError('The default research workspace stays attached.')
        if any(j['state'] in ('queued', 'running') and (j.get('output') or {}).get('root') == root for j in manager.list()):
            raise ValueError('Wait until jobs using this output folder finish before detaching it.')
        workspace.roots.pop(root, None)
        from pipeline.io import atomic_write, json_text
        atomic_write(workspace.registry, json_text(workspace.roots))
        return workspace.list_roots()

    @app.get('/api/tree')
    def tree(root: str, path: str = ''):
        return workspace.tree(root, path)

    @app.post('/api/folders')
    def folder(body: dict):
        path = workspace.resolve(body, directory=True)
        path.mkdir()
        return {'ok': True}

    @app.post('/api/rename')
    def rename(body: dict):
        source = workspace.resolve(body['file'], directory=True)
        if source == Path(workspace.roots[body['file']['root']]):
            raise ValueError('Attached workspace roots cannot be renamed here.')
        name = body['name']
        if Path(name).name != name:
            raise ValueError('Enter a filename, without a directory path.')
        ref = {**body['file'], 'path': str(Path(body['file']['path']).parent / name)}
        target = workspace.resolve(ref, directory=source.is_dir())
        if target.exists():
            raise ValueError('A file or folder with that name already exists.')
        source.rename(target)
        return ref

    @app.post('/api/upload')
    async def upload(root: str = Form(...), path: str = Form(''), overwrite: bool = Form(False), file: UploadFile = File(...)):
        name = Path(file.filename or '').name
        content = await file.read(100 * 1024 * 1024 + 1)
        if len(content) > 100 * 1024 * 1024:
            raise ValueError('Uploads are limited to 100 MB. Attach a folder for larger files.')
        ref = {'root': root, 'path': str(Path(path) / name)}
        workspace.write(ref, content.decode('utf-8-sig'), overwrite)
        return ref

    @app.get('/api/preview')
    def preview(root: str, path: str, offset: int = 0, limit: int = 30):
        p = workspace.resolve({'root': root, 'path': path})
        value = None
        if p.suffix.lower() == '.json':
            try:
                value = json.loads(read_user_text(p))
            except json.JSONDecodeError:
                pass  # Invalid configuration drafts remain editable.
        if p.suffix.lower() == '.csv' or isinstance(value, list) or isinstance(value, dict) and isinstance(value.get('articles'), list):
            df = read_dataset(p)
            return {'kind': 'dataset', 'columns': list(df.columns), 'total': len(df), 'rows': records(df.iloc[max(0, offset):max(0, offset) + min(100, max(1, limit))]), 'hash': digest(p)}
        if p.stat().st_size > 2 * 1024 * 1024:
            raise ValueError('Configuration preview is limited to 2 MB.')
        return {'kind': 'text', 'content': read_user_text(p), 'hash': digest(p)}

    @app.post('/api/text')
    def save_text(body: dict):
        p = workspace.resolve(body['file'])
        if p.suffix.lower() == '.csv':
            raise ValueError('Dataset previews are read-only. Use a processing tool to create a new dataset.')
        if p.exists() and p.suffix.lower() == '.json':
            try:
                existing = json.loads(read_user_text(p))
            except json.JSONDecodeError:
                existing = None
            if isinstance(existing, list) or isinstance(existing, dict) and isinstance(existing.get('articles'), list):
                raise ValueError('Dataset previews are read-only.')
        if p.exists() and body.get('expected_hash') != digest(p):
            raise ValueError('File changed on disk. Reopen it or Save As a new file.')
        workspace.write(body['file'], body['content'], body.get('overwrite', False))
        return {'hash': digest(p)}

    @app.post('/api/delete')
    def delete(body: dict):
        target = workspace.resolve(body['file'], directory=True)
        if target == Path(workspace.roots[body['file']['root']]).resolve():
            raise ValueError('Use Close folder to remove a whole folder from Files.')
        ref = {'root': body['file']['root'], 'path': body['file']['path']}
        if any(j['state'] in ('queued', 'running') and j.get('output') == ref for j in manager.list()):
            raise ValueError('A running job is writing this file. Stop the job first.')
        if target.is_dir():
            if any(target.iterdir()):
                raise ValueError('Only empty folders can be deleted here. Delete the files inside first.')
            target.rmdir()
        else:
            target.unlink()
        return {'ok': True}

    @app.post('/api/code')
    def code(body: dict):
        from .teaching import teaching_code
        source = workspace.resolve(body['input']) if body.get('input') else None
        dest = body.get('destination') or {}
        output = None
        if dest.get('filename'):
            try:
                folder = workspace.resolve({'root': dest.get('root') or next(iter(workspace.roots)), 'path': dest.get('path', '')}, directory=True)
                output = folder / dest['filename']
            except ValueError:
                output = dest['filename']
        return teaching_code(body['tool'], body.get('config') or {}, source, output)

    @app.get('/api/download')
    def download(root: str, path: str):
        p = workspace.resolve({'root': root, 'path': path})
        return FileResponse(p, filename=p.name)

    @app.get('/api/sources')
    def sources():
        if not keys['news']:
            raise ValueError('Set a NewsAPI key in Connections to search the source directory.')
        response = requests.get('https://newsapi.org/v2/top-headlines/sources', headers={'X-Api-Key': keys['news']}, timeout=20)
        if response.status_code != 200:
            raise ValueError(f'NewsAPI directory returned HTTP {response.status_code}. Suggested domains remain available.')
        return [{'name': s['name'], 'domain': urlparse(s['url']).hostname.removeprefix('www.'), 'suggested': False} for s in response.json().get('sources', []) if urlparse(s['url']).hostname]

    @app.get('/api/models/hf')
    def hf_models(q: str = ''):
        from huggingface_hub import HfApi
        return [{'id': m.id, 'downloads': m.downloads} for m in HfApi().list_models(search=q, filter='text-classification', sort='downloads', limit=30)]

    @app.post('/api/models/hf/validate')
    def hf_validate(body: dict):
        from transformers import AutoConfig
        cfg = AutoConfig.from_pretrained(body['model'], revision=body.get('revision') or 'main', cache_dir=str(paths.model_cache_dir()), trust_remote_code=False)
        if not any('SequenceClassification' in a for a in cfg.architectures or []) or cfg.num_labels < 2:
            raise ValueError('Choose a text classifier with a SequenceClassification architecture and at least two labels.')
        return {'labels': cfg.id2label, 'revision': getattr(cfg, '_commit_hash', None)}

    @app.get('/api/models/prepare')
    def prepare_status():
        return preparer.status()

    @app.post('/api/models/prepare')
    def prepare_start(body: dict):
        return preparer.start(body.get('model') or FINBERT_MODEL_NAME, body.get('revision') or 'main')

    @app.post('/api/models/prepare/cancel')
    def prepare_cancel(body: dict | None = None):
        return preparer.cancel()

    @app.get('/api/devices')
    def devices():
        import torch
        return ['cpu'] + (['mps'] if torch.backends.mps.is_available() else []) + (['cuda'] if torch.cuda.is_available() else [])

    @app.get('/api/models/openai')
    def openai_models():
        from openai import OpenAI
        if not keys['openai']:
            raise ValueError('Set an OpenAI key in Connections. You can also enter a model ID manually.')
        models = OpenAI(api_key=keys['openai'], timeout=20, max_retries=0).models.list()
        return sorted([m.id for m in models.data if m.id.startswith(('gpt-', 'o1', 'o3', 'o4')) and not any(x in m.id for x in ('audio', 'realtime', 'image', 'transcribe', 'tts', 'search'))])

    @app.post('/api/extraction-design')
    def extraction_design(body: DesignRequest):
        return generate_design(body, keys['openai'])

    @app.post('/api/schema/validate')
    def schema(body: dict):
        validate_schema(body['schema'], body.get('enums'))
        return {'ok': True}

    @app.post('/api/input-preview')
    def input_preview(body: dict):
        df = read_dataset(workspace.resolve(body['input']))
        c = validate_config(body['tool'], {**body['config'], 'model': body['config'].get('model') or 'preview-only'}, df)
        from .configuration import selected_rows, text_input
        indexes = selected_rows(df, c)
        if not indexes:
            raise ValueError('No records match this selection.')
        row = df.iloc[indexes[0]]
        if body['tool'] == 'llm':
            window, prompt = prompt_for(row, c)
            return {**window, 'prompt': prompt, 'instructions': c['instructions'], 'selected_rows': len(indexes)}
        return {**text_input(row, c['columns'], c.get('word_limit', 150)), 'selected_rows': len(indexes)}

    @app.get('/api/jobs')
    def jobs():
        return manager.list()

    @app.get('/api/health')
    def health():
        return {'worker_ready': manager.thread.is_alive(), 'scheduler_error': manager.scheduler_error, **describe()}

    @app.get('/api/diagnostics')
    def diagnostics():
        """Sanitized report for Troubleshooting. Never includes keys or research content."""
        states = {}
        for job in manager.list():
            states[job['state']] = states.get(job['state'], 0) + 1
        return {'build': describe(), 'locations': locations(), 'jobs': states,
                'attached_folders': len(workspace.roots), 'worker_ready': manager.thread.is_alive(),
                'scheduler_error': manager.scheduler_error, 'model_preparation': preparer.status(),
                'connections': credentials.status()['connections'],
                'secure_storage': credentials.status()['secure_storage']}

    @app.post('/api/jobs')
    def submit(body: dict):
        return manager.submit(body)

    @app.post('/api/jobs/clear')
    def clear_jobs(body: dict | None = None):
        return manager.clear()

    @app.get('/api/jobs/{job_id}')
    def job_detail(job_id: str):
        folder = manager.folder(job_id)
        req = json.loads((folder / 'request.json').read_text(encoding='utf-8'))
        return {'request': {k: v for k, v in req.items() if k not in ('target', 'state_dir', 'default_root', 'snapshot')},
                'status': json.loads((folder / 'status.json').read_text(encoding='utf-8')),
                'rows': json.loads((folder / 'checkpoint.json').read_text(encoding='utf-8'))[:100] if (folder / 'checkpoint.json').exists() else []}

    @app.post('/api/jobs/{job_id}/cancel')
    def cancel(job_id: str):
        return manager.cancel(job_id)

    @app.get('/api/jobs/{job_id}/checkpoint')
    def checkpoint_download(job_id: str):
        path = manager.folder(job_id) / 'checkpoint.json'
        if not path.exists():
            raise ValueError('This job has not checkpointed any rows yet.')
        return FileResponse(path, filename=f'{job_id}_checkpoint.json')

    @app.post('/api/jobs/{job_id}/resume')
    def resume(job_id: str, body: dict):
        return manager.resume(job_id, body.get('destination'))

    @app.post('/api/examples')
    def example(body: dict):
        from pipeline.demo import demo_raw
        from .files import save_dataset
        target, ref = workspace.destination(body['destination'])
        df = demo_raw()
        df['synthetic'] = True
        save_dataset(df, target, body['destination'].get('overwrite', False), digest(target) if target.exists() else None)
        return ref

    static = paths.static_dir()
    if static.exists():
        app.mount('/', StaticFiles(directory=static, html=True), name='frontend')
    return app
