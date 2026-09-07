"""Fail early with missing secret names, never their values."""
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from workbench.version import VERSION

REQUIRED = (
    'APPLE_CERTIFICATE_P12', 'APPLE_CERTIFICATE_PASSWORD', 'APPLE_SIGNING_IDENTITY',
    'APPLE_TEAM_ID', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER_ID', 'APPLE_API_KEY',
    'AZURE_CLIENT_ID', 'AZURE_TENANT_ID', 'AZURE_SUBSCRIPTION_ID',
    'AZURE_SIGNING_ENDPOINT', 'AZURE_CODE_SIGNING_ACCOUNT', 'AZURE_CERTIFICATE_PROFILE',
)


def validate(env):
    if env.get('SHOULD_SIGN') != 'true':
        return 'Unsigned preview build. No publisher accounts required; OS approval prompts may appear.'
    missing = [key for key in REQUIRED if not env.get(key, '').strip()]
    if missing:
        raise ValueError('Configure these repository secrets before signing: ' + ', '.join(missing) +
                         '. See docs/publisher-signing.md.')
    if env.get('GITHUB_REF') != f'refs/tags/v{VERSION}':
        raise ValueError(f'Signed releases must run on tag v{VERSION}, matching workbench/version.py.')
    return f'Publisher configuration present for v{VERSION}.'


if __name__ == '__main__':
    try:
        print(validate(os.environ))
    except ValueError as error:
        raise SystemExit(str(error))
