# PyInstaller specification, one-folder mode.
#
# One-folder keeps startup fast and avoids unpacking a large archive on every
# launch. The resulting directory is placed inside a familiar installer for each
# platform rather than shipped on its own.
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

ROOT = Path(SPECPATH).resolve().parent
sys.path.insert(0, str(ROOT))
from workbench.version import APP_NAME, DISPLAY_NAME, VERSION  # noqa: E402

STATIC = ROOT / 'frontend' / 'out'
if not (STATIC / 'index.html').exists():
    raise SystemExit('Build the interface first: cd frontend && npm ci && npm run build')

datas = [
    (str(STATIC), 'frontend/out'),
    (str(ROOT / 'THIRD_PARTY_NOTICES.md'), '.'),
]
datas += collect_data_files('keyring')

# Transformers resolves models lazily by name, so its model packages and the
# import metadata it inspects at runtime are not visible to static analysis.
hiddenimports = [
    'workbench', 'workbench.api', 'workbench.jobs', 'workbench.processors', 'workbench.models',
    'workbench.credentials', 'workbench.preferences', 'workbench.paths', 'workbench.designer',
    'pipeline', 'pipeline.io', 'pipeline.demo', 'pipeline.text_window', 'pipeline.step6_aggregate',
    'config', 'config.settings', 'config.taxonomies', 'schemas', 'schemas.esg_event',
    'launcher', 'launcher.main', 'launcher.gui', 'launcher.service', 'launcher.instance',
    'uvicorn.logging', 'uvicorn.loops.auto', 'uvicorn.loops.asyncio', 'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl', 'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan.on',
    'sklearn.metrics', 'sklearn.utils._typedefs', 'sklearn.utils._heap', 'sklearn.utils._sorting',
    'encodings.idna', 'multiprocessing.spawn', 'multiprocessing.popen_spawn_posix',
    'multiprocessing.popen_spawn_win32',
]
hiddenimports += collect_submodules('transformers.models.bert')
hiddenimports += collect_submodules('transformers.models.roberta')
hiddenimports += collect_submodules('transformers.models.distilbert')
hiddenimports += collect_submodules('transformers.models.xlm_roberta')
hiddenimports += collect_submodules('transformers.models.deberta_v2')
hiddenimports += collect_submodules('transformers.models.electra')
hiddenimports += collect_submodules('transformers.models.albert')
hiddenimports += collect_submodules('transformers.pipelines')
hiddenimports += collect_submodules('keyring.backends')

# `transformers` reads distribution metadata to decide which optional backends
# exist. Without these the packaged build reports missing dependencies that are
# in fact present.
for package in ('transformers', 'tokenizers', 'safetensors', 'huggingface-hub', 'filelock', 'regex',
                'requests', 'packaging', 'numpy', 'pyyaml', 'tqdm', 'torch', 'openai', 'keyring',
                'jsonschema', 'fastapi', 'starlette', 'pydantic', 'scikit-learn', 'pandas'):
    try:
        datas += copy_metadata(package)
    except Exception:
        pass  # An optional package that is genuinely absent must not fail the build.

excludes = [
    'tensorflow', 'flax', 'jax', 'jaxlib', 'tensorboard', 'matplotlib', 'IPython', 'notebook',
    'pytest', 'playwright', 'tkinter.test', 'test', 'lib2to3', 'pydoc_data',
    'torchvision', 'torchaudio',
]

analysis = Analysis(
    [str(ROOT / 'run_workbench.py')],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[str(ROOT / 'packaging' / 'hooks')],
    runtime_hooks=[str(ROOT / 'packaging' / 'hooks' / 'runtime_environment.py')],
    excludes=excludes,
    noarchive=False,
)
pyz = PYZ(analysis.pure)

exe = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name=APP_NAME,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    icon=str(ROOT / 'packaging' / 'icons' / ('workbench.icns' if sys.platform == 'darwin' else 'workbench.ico')),
)

collected = COLLECT(
    exe,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    name=APP_NAME,
)

if sys.platform == 'darwin':
    app = BUNDLE(
        collected,
        name=f'{DISPLAY_NAME}.app',
        icon=str(ROOT / 'packaging' / 'icons' / 'workbench.icns'),
        bundle_identifier='com.thealiahmadi.researchworkbench',
        version=VERSION,
        info_plist={
            'CFBundleName': DISPLAY_NAME,
            'CFBundleDisplayName': DISPLAY_NAME,
            'CFBundleShortVersionString': VERSION,
            'CFBundleVersion': VERSION,
            'LSMinimumSystemVersion': '14.0',
            'NSHighResolutionCapable': True,
            'LSApplicationCategoryType': 'public.app-category.education',
            'NSHumanReadableCopyright': 'Research Workbench. Distributed under the MIT License.',
        },
    )
