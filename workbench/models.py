"""Optional up-front classifier download.

Classifiers otherwise download the first time a job needs them. Before a class,
an instructor or student can prepare the default classifier deliberately, watch
the progress, and confirm it actually runs on this computer. Downloads resume
from partial files, and a prepared model is reused from the cache afterwards.
"""
from __future__ import annotations

import threading
import time
from pathlib import Path

from config.settings import FINBERT_MODEL_NAME
from . import paths
from .processors import safe_error

# One weight format is enough. Fetching both doubles the download for no benefit.
SAFETENSORS = 'model.safetensors'
TORCH_WEIGHTS = 'pytorch_model.bin'
COMPANIONS = {'config.json', 'vocab.txt', 'vocab.json', 'merges.txt', 'tokenizer.json', 'tokenizer_config.json',
              'special_tokens_map.json', 'added_tokens.json', 'spiece.model', 'sentencepiece.bpe.model'}
SAMPLE = 'The company published its annual sustainability and workforce report.'


def _wanted(filenames):
    """Choose one weight format plus the tokenizer and configuration files."""
    shards = sorted(f for f in filenames if f.startswith('model-') and f.endswith('.safetensors'))
    if shards:
        weights = shards + [f for f in filenames if f == 'model.safetensors.index.json']
    elif SAFETENSORS in filenames:
        weights = [SAFETENSORS]
    elif TORCH_WEIGHTS in filenames:
        weights = [TORCH_WEIGHTS]
    else:
        raise ValueError('This repository has no PyTorch or safetensors weights. Choose another classifier.')
    return weights + sorted(f for f in filenames if f in COMPANIONS)


def _bytes_in(folder):
    total = 0
    for child in Path(folder).rglob('*'):
        try:
            if child.is_file() and not child.is_symlink():
                total += child.stat().st_size
        except OSError:
            continue  # Files move as the download progresses; a skipped file only affects the estimate.
    return total


class ModelPreparer:
    """Runs at most one preparation at a time and reports progress for the interface."""

    def __init__(self, cache_dir=None):
        self.cache_dir = Path(cache_dir or paths.model_cache_dir())
        self.lock = threading.RLock()
        self.thread = None
        self.cancelled = threading.Event()
        self.state = {'state': 'idle', 'phase': '', 'model': '', 'downloaded': 0, 'total': 0,
                      'error': '', 'labels': {}, 'cached': False, 'updated_at': time.time()}

    def status(self):
        with self.lock:
            return dict(self.state, cache_dir=str(self.cache_dir))

    def _set(self, **values):
        with self.lock:
            self.state.update(values, updated_at=time.time())

    def start(self, model=None, revision='main'):
        with self.lock:
            if self.thread and self.thread.is_alive():
                raise ValueError('A model is already being prepared. Wait for it to finish or cancel it.')
            self.cancelled.clear()
            self.state = {'state': 'running', 'phase': 'Contacting Hugging Face', 'model': model or FINBERT_MODEL_NAME,
                          'downloaded': 0, 'total': 0, 'error': '', 'labels': {}, 'cached': False, 'updated_at': time.time()}
            self.thread = threading.Thread(target=self._run, args=(model or FINBERT_MODEL_NAME, revision or 'main'), daemon=True)
            self.thread.start()
            return self.status()

    def cancel(self):
        self.cancelled.set()
        if self.status()['state'] == 'running':
            self._set(phase='Stopping after the current file')
        return self.status()

    def _run(self, model, revision):
        try:
            from huggingface_hub import HfApi, hf_hub_download, try_to_load_from_cache
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            info = HfApi().model_info(model, revision=revision, files_metadata=True)
            commit = info.sha or revision
            sizes = {f.rfilename: (f.size or 0) for f in info.siblings or []}
            wanted = _wanted(set(sizes))
            missing = [f for f in wanted if not isinstance(try_to_load_from_cache(model, f, cache_dir=str(self.cache_dir), revision=commit), str)]
            self._set(total=sum(sizes.get(f, 0) for f in missing), phase='Downloading model files' if missing else 'Already downloaded')
            baseline = _bytes_in(self.cache_dir)
            stop = threading.Event()
            watcher = threading.Thread(target=self._watch, args=(baseline, stop), daemon=True)
            watcher.start()
            try:
                for filename in wanted:
                    if self.cancelled.is_set():
                        self._set(state='cancelled', phase='Cancelled. Partial files are kept and resume next time.')
                        return
                    hf_hub_download(model, filename, revision=commit, cache_dir=str(self.cache_dir))
            finally:
                stop.set()
                watcher.join(timeout=1)
            self._set(downloaded=self.status()['total'], phase='Verifying the classifier runs on this computer')
            labels = self._verify(model, commit)
            self._set(state='completed', phase='Ready for class', labels=labels, cached=True,
                      model_revision=commit)
        except BaseException as exc:
            self._set(state='cancelled' if self.cancelled.is_set() else 'failed', error=safe_error(exc),
                      phase='Stopped. Any completed files are kept and resume next time.')

    def _watch(self, baseline, stop):
        while not stop.wait(0.5):
            total = self.status()['total']
            self._set(downloaded=max(0, min(total, _bytes_in(self.cache_dir) - baseline)) if total else 0)

    def _verify(self, model, revision):
        """Load and run the classifier once, so a packaged build proves it works."""
        from .processors import load_classifier
        classifier, _ = load_classifier({'model': model, 'revision': revision, 'device': 'cpu'})
        result = classifier(SAMPLE, truncation=True, max_length=512, top_k=None)
        if not result:
            raise ValueError('The classifier loaded but returned no prediction.')
        return dict(classifier.model.config.id2label)
