"""Generate the third-party notices shipped with every release.

Installers bundle Python, the processing libraries, and the compiled interface,
so the licences of those components travel with the download.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'THIRD_PARTY_NOTICES.md'
HEADER = """# Third-party notices

Research Workbench bundles the Python runtime, the libraries listed below, and a
compiled copy of its own interface. Each component remains under its own licence.
The application itself is distributed under the MIT License; see `LICENSE`.

Model weights are not bundled. Classifiers download from the Hugging Face Hub on
first use and are covered by the licence of their own repository.
"""


def distributions():
    """Ask pip-licenses for installed distributions, or fall back to metadata."""
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'piplicenses', '--format=json', '--with-urls', '--with-license-file',
             '--no-license-path', '--ignore-packages', 'pip', 'setuptools', 'wheel'],
            capture_output=True, text=True, check=True)
        return json.loads(result.stdout)
    except (OSError, ValueError, subprocess.CalledProcessError):
        from importlib import metadata
        found = []
        for dist in metadata.distributions():
            name = dist.metadata['Name']
            if not name:
                continue
            licence = (dist.metadata.get('License-Expression') or _classifier_license(dist)
                       or dist.metadata.get('License') or '')
            found.append({'Name': name, 'Version': dist.version, 'License': licence,
                          'URL': dist.metadata.get('Home-page') or ''})
        return found


def _classifier_license(dist):
    for value in dist.metadata.get_all('Classifier') or []:
        if value.startswith('License ::'):
            return value.rsplit('::', 1)[-1].strip()
    return ''


def _summarize(value):
    """Some packages put an entire licence text in the metadata field."""
    text = ' '.join((value or '').split())
    if not text or text.lower() in ('unknown', 'none'):
        return 'See package metadata'
    return text if len(text) <= 60 else text[:57].rstrip(' ,;') + '…'


def render(packages):
    latest = {}
    for package in packages:
        latest[package['Name'].lower()] = (package['Name'], package['Version'], _summarize(package.get('License')))
    rows = sorted(latest.values())
    lines = [HEADER, '', f'Python runtime: {sys.version.split()[0]} (Python Software Foundation License).', '',
             '| Component | Version | Licence |', '| --- | --- | --- |']
    lines += [f'| {name} | {version} | {licence} |' for name, version, licence in rows]
    lines += ['', 'Interface components (Next.js, React, Radix, Tailwind CSS, lucide-react and their',
              'dependencies) are listed in `frontend/package.json` and their licences ship with',
              'the compiled interface in the source repository.', '']
    return '\n'.join(lines)


if __name__ == '__main__':
    OUTPUT.write_text(render(distributions()), encoding='utf-8')
    print(f'Wrote {OUTPUT} ({OUTPUT.stat().st_size} bytes)')
