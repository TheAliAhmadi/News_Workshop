"""Run a windowed executable's self-test with a deadline and explicit JSON output."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

from smoke_test import executable


def check(app, output, timeout=240):
    output = Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory(prefix='workbench-self-test-') as folder:
        base = Path(folder)
        env = {**os.environ, 'WORKBENCH_STATE_DIR': str(base / 'state'),
               'WORKBENCH_WORKSPACE_DIR': str(base / 'research'),
               'WORKBENCH_LOG_DIR': str(base / 'logs'), 'WORKBENCH_SECURE_STORAGE': '0'}
        command = [str(executable(app).resolve()), '--self-test', '--port', '0', '--report-file', str(output)]
        try:
            result = subprocess.run(command, env=env, timeout=timeout, check=True, capture_output=True, text=True)
            if result.stdout:
                print(result.stdout)
            report = json.loads(output.read_text(encoding='utf-8'))
            assert report['health']['worker_ready'] and report['interface_bundled'], report
            print(json.dumps(report, indent=2))
        except (subprocess.SubprocessError, OSError, ValueError, AssertionError):
            for log in (base / 'logs').glob('*.log'):
                print(log.read_text(encoding='utf-8', errors='replace')[-20000:])
            raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    check(args.app, args.output)
