"""Runtime hook: prepare the environment before the application imports.

Runs inside the packaged process, including each spawned job worker, so the
worker and the launcher agree on where models are cached and never try to
write into the installed application directory.
"""
import os
import sys


def _writable(path):
    try:
        os.makedirs(path, exist_ok=True)
        return True
    except OSError:
        return False


# Transformers and huggingface_hub consult these before any explicit cache_dir
# argument reaches them, and their defaults point at the user's home directory
# under a different name. Keep every download in the application's own cache.
if not os.environ.get('WORKBENCH_MODEL_CACHE'):
    if sys.platform == 'darwin':
        cache = os.path.expanduser('~/Library/Caches/ResearchWorkbench/models')
    elif os.name == 'nt':
        cache = os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~')), 'ResearchWorkbench', 'Cache', 'models')
    else:
        cache = os.path.join(os.environ.get('XDG_CACHE_HOME', os.path.expanduser('~/.cache')), 'ResearchWorkbench', 'models')
    if _writable(cache):
        os.environ['WORKBENCH_MODEL_CACHE'] = cache

_cache = os.environ.get('WORKBENCH_MODEL_CACHE')
if _cache:
    for name in ('HF_HOME', 'HF_HUB_CACHE'):
        os.environ.setdefault(name, _cache)

# A frozen build has no source tree to compile, and a read-only installation
# directory would otherwise produce warnings on every start.
os.environ.setdefault('PYTHONDONTWRITEBYTECODE', '1')
# Progress bars need a real stream; a windowed build has none until the launcher
# attaches one. Disabling them avoids output before that happens.
os.environ.setdefault('HF_HUB_DISABLE_PROGRESS_BARS', '1')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')
