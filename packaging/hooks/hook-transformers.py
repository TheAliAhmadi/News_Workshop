"""Transformers loads model and tokenizer classes by name at runtime.

Static analysis cannot see those imports, and the library also inspects
installed distribution metadata to decide which backends are available. Both
are collected here so a packaged classifier behaves like a source install.
"""
from PyInstaller.utils.hooks import collect_data_files, copy_metadata

# Transformers 4.57 builds its lazy import table by reading the model source
# tree. Merely listing *.py in includes does not collect Python files: the
# hook helper excludes them unless include_py_files is explicitly enabled.
datas = collect_data_files('transformers', include_py_files=True, includes=['**/*.json', '**/*.txt', '**/*.py'])

for package in ('transformers', 'tokenizers', 'huggingface-hub', 'safetensors', 'filelock',
                'regex', 'requests', 'packaging', 'numpy', 'pyyaml', 'tqdm'):
    try:
        datas += copy_metadata(package)
    except Exception:
        pass

hiddenimports = [
    'transformers.models.auto',
    'transformers.models.auto.configuration_auto',
    'transformers.models.auto.modeling_auto',
    'transformers.models.auto.tokenization_auto',
    'transformers.pipelines.text_classification',
    'transformers.tokenization_utils_fast',
    'transformers.convert_slow_tokenizer',
    'tokenizers',
    'tokenizers.models',
    'tokenizers.decoders',
    'tokenizers.normalizers',
    'tokenizers.pre_tokenizers',
    'tokenizers.processors',
    'tokenizers.trainers',
    'safetensors.torch',
]

excludedimports = ['tensorflow', 'flax', 'jax']
