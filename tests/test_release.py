"""Release policy checks that do not require publisher credentials."""
import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location('signing_preflight', Path(__file__).resolve().parents[1] / 'packaging/signing_preflight.py')
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


def test_unsigned_validation_needs_no_publisher_accounts():
    assert 'No publisher accounts required' in preflight.validate({'SHOULD_SIGN': 'false'})


def test_missing_signing_secrets_report_names_only():
    with pytest.raises(ValueError) as error:
        preflight.validate({'SHOULD_SIGN': 'true', 'APPLE_API_KEY': 'private-example'})
    assert 'AZURE_CLIENT_ID' in str(error.value)
    assert 'private-example' not in str(error.value)


def test_signed_release_requires_matching_version_tag():
    env = {key: 'present' for key in preflight.REQUIRED}
    env.update(SHOULD_SIGN='true', GITHUB_REF='refs/heads/main')
    with pytest.raises(ValueError, match='must run on tag'):
        preflight.validate(env)
    env['GITHUB_REF'] = f'refs/tags/v{preflight.VERSION}'
    assert 'Publisher configuration present' in preflight.validate(env)
