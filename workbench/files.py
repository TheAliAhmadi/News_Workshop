from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
import pandas as pd
from pipeline.io import atomic_write, json_text, json_value, csv_text
from . import paths

APP = paths.resource_dir()
EXTENSIONS = {'.csv', '.json', '.txt', '.md'}
BLOCKED = {'node_modules', '__pycache__', 'workbench', 'frontend', 'pipeline', 'config', 'schemas', 'tests', 'logs'}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_user_text(path):
    """Read a student-authored file. Editors on Windows often add a byte-order mark."""
    return Path(path).read_text(encoding='utf-8-sig')


def read_dataset(path):
    path = Path(path)
    if path.suffix.lower() == '.csv':
        return pd.read_csv(path, keep_default_na=False, dtype=str, encoding='utf-8-sig')
    value = json.loads(read_user_text(path))
    if isinstance(value, dict) and isinstance(value.get('articles'), list):
        value = value['articles']
    if not isinstance(value, list) or any(not isinstance(row, dict) for row in value):
        raise ValueError('Choose a CSV or JSON array of records. This JSON file is a configuration, not a dataset.')
    return pd.DataFrame(value)


def records(df):
    return json_value(df.to_dict(orient='records'))


class Workspace:
    def __init__(self, state: Path, default: Path):
        self.state = Path(state)
        self.state.mkdir(parents=True, exist_ok=True)
        default.mkdir(parents=True, exist_ok=True)
        self.registry = self.state / 'roots.json'
        self.roots = json.loads(self.registry.read_text(encoding='utf-8')) if self.registry.exists() else {}
        self.attach(str(default))

    def attach(self, path):
        p = Path(path).expanduser().resolve()
        if not p.is_dir():
            raise ValueError('Enter an existing absolute directory path.')
        if p == APP or p in APP.parents or any(part.startswith('.') or part in BLOCKED for part in p.relative_to(p.anchor).parts):
            raise ValueError('Choose a research data folder, outside application, dependency, or hidden directories.')
        key = hashlib.sha256(str(p).encode()).hexdigest()[:12]
        self.roots[key] = str(p)
        atomic_write(self.registry, json_text(self.roots))
        return {'id': key, 'name': p.name, 'path': str(p)}

    def list_roots(self):
        return [{'id': k, 'name': Path(v).name, 'path': v} for k, v in self.roots.items()]

    def resolve(self, ref, *, directory=False):
        if not ref or ref.get('root') not in self.roots:
            raise ValueError('Select a file or folder in an attached workspace.')
        relative = Path(ref.get('path') or '.')
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Paths must stay within the selected workspace.')
        root = Path(self.roots[ref['root']]).resolve()
        p = root.joinpath(relative).resolve()
        if not p.is_relative_to(root):
            raise ValueError('Links outside the workspace are not allowed.')
        parts = p.relative_to(root).parts
        if any(x.startswith('.') or x in BLOCKED or 'credential' in x.lower() or 'secret' in x.lower() for x in parts):
            raise ValueError('This path is reserved or contains credentials.')
        if not directory and p.suffix.lower() not in EXTENSIONS:
            raise ValueError('Supported files: CSV, JSON, TXT, MD.')
        return p

    def tree(self, root, path=''):
        base = self.resolve({'root': root, 'path': path}, directory=True)
        if not base.is_dir():
            raise ValueError('Folder no longer exists. Refresh the explorer.')
        entries = []
        for child in sorted(base.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            if child.is_symlink() and child.is_dir():
                continue
            relative = str(child.relative_to(Path(self.roots[root])))
            try:
                p = self.resolve({'root': root, 'path': relative}, directory=child.is_dir())
            except ValueError:
                continue
            entries.append({'root': root, 'path': relative, 'name': child.name, 'kind': 'folder' if p.is_dir() else 'file'})
        return entries

    def destination(self, dest):
        folder = self.resolve(dest, directory=True)
        if not folder.is_dir():
            raise ValueError('Output folder does not exist. Create it in the explorer first.')
        name = dest.get('filename', '')
        if not name or Path(name).name != name:
            raise ValueError('Enter a filename without directory separators.')
        fmt = dest.get('format', Path(name).suffix.lstrip('.'))
        if fmt not in ('csv', 'json'):
            raise ValueError('Dataset output format must be CSV or JSON.')
        if Path(name).suffix.lower() != '.' + fmt:
            raise ValueError('Filename extension must match the selected format.')
        ref = {'root': dest['root'], 'path': str(Path(dest.get('path', '')) / name)}
        target = self.resolve(ref)
        if target.exists() and not dest.get('overwrite'):
            raise ValueError('That output file exists. Choose another name or explicitly enable replacement.')
        return target, ref

    def write(self, ref, content, overwrite=False):
        path = self.resolve(ref)
        if path.exists() and not overwrite:
            raise ValueError('File exists. Explicit replacement is required.')
        if not path.parent.is_dir():
            raise ValueError('Choose an existing folder.')
        atomic_write(path, content)


def save_dataset(df, target, overwrite=False, expected_hash=None):
    """Atomically reserve new files; replacement uses the identity approved at submission."""
    target = Path(target)
    content = csv_text(df) if target.suffix.lower() == '.csv' else json_text(records(df))
    if overwrite:
        if target.exists() and digest(target) != expected_hash:
            raise ValueError('Output changed since submission. Choose a new destination before resuming.')
        atomic_write(target, content)
    else:
        # O_EXCL prevents a concurrent job or explorer upload from being overwritten.
        fd, temporary = tempfile.mkstemp(prefix='.workbench-output-', dir=target.parent)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            try:
                os.link(temporary, target)  # Atomic publication; refuses an existing destination.
            except (OSError, NotImplementedError, AttributeError):
                # Removable and network volumes may not support hard links. Reserve the
                # name exclusively instead, then write into the reserved file.
                reserved = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                with os.fdopen(reserved, 'w', encoding='utf-8') as handle:
                    handle.write(content)
                    handle.flush()
                    os.fsync(handle.fileno())
        finally:
            Path(temporary).unlink(missing_ok=True)
