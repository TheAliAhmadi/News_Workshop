"""Prepare and check release assets.

Measures the actual download size against the limit GitHub applies to release
assets, and writes the checksum file students can use to verify a download.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

# https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
ASSET_LIMIT = 2 * 1024 ** 3
WARN_AT = 0.8


def checksum(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description='Check release assets and write checksums')
    parser.add_argument('assets', nargs='+', help='Installer files to publish')
    parser.add_argument('--output', default='dist/SHA256SUMS.txt')
    args = parser.parse_args(argv)

    lines, oversized = [], []
    for name in args.assets:
        path = Path(name)
        if not path.is_file():
            raise SystemExit(f'Missing release asset: {path}')
        size = path.stat().st_size
        share = size / ASSET_LIMIT
        print(f'{path.name}: {size / 1024 ** 2:,.0f} MB ({share:.0%} of the {ASSET_LIMIT / 1024 ** 3:.0f} GB asset limit)')
        if share >= 1:
            oversized.append(path.name)
        elif share >= WARN_AT:
            print(f'  Warning: {path.name} is close to the limit. Review bundled dependencies before adding more.')
        lines.append(f'{checksum(path)}  {path.name}')

    if oversized:
        raise SystemExit('These assets exceed the GitHub release asset limit: ' + ', '.join(oversized))

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'Wrote {output}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
