"""Install the exact distribution asset, then exercise its extracted application."""
import argparse
import plistlib
from pathlib import Path
import subprocess
import sys
import tempfile

from smoke_test import main as smoke


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='Workbench installation tëst ') as base:
        base = Path(base)
        if sys.platform == 'darwin':
            images = list(Path('dist').glob('*.dmg'))
            assert len(images) == 1, 'Expected exactly one disk image.'
            mounted = subprocess.run(['hdiutil', 'attach', '-readonly', '-nobrowse', '-plist', str(images[0])],
                                     check=True, capture_output=True, timeout=120)
            volumes = [item['mount-point'] for item in plistlib.loads(mounted.stdout)['system-entities'] if 'mount-point' in item]
            assert len(volumes) == 1, volumes
            try:
                app = base / 'Research Workbench.app'
                subprocess.run(['ditto', str(Path(volumes[0]) / app.name), str(app)], check=True, timeout=180)
            finally:
                subprocess.run(['hdiutil', 'detach', volumes[0]], check=True, timeout=60)
        elif sys.platform == 'win32':
            installers = list(Path('dist').glob('*Setup.exe'))
            assert len(installers) == 1, 'Expected exactly one Windows installer.'
            app = base / 'ResearchWorkbench'
            subprocess.run([str(installers[0].resolve()), '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART',
                            '/SP-', f'/DIR={app}', f'/LOG={base / "install.log"}'], check=True, timeout=240)
        else:
            raise SystemExit('Installer verification requires macOS or Windows.')
        try:
            return smoke(['--app', str(app), '--output', args.output])
        finally:
            if sys.platform == 'win32':
                uninstall = app / 'unins000.exe'
                if uninstall.exists():
                    subprocess.run([str(uninstall), '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], check=True, timeout=120)


if __name__ == '__main__':
    sys.exit(main())
