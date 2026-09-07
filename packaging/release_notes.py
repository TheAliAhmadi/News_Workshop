"""Write the notes published with a release."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from workbench.version import VERSION  # noqa: E402

TEMPLATE = """## Research Workbench {version}

Download the installer for your computer, open it, and enter your own API keys in
the application. Python, Node.js, Git, Docker, and terminal commands are not needed.

| Computer | Download |
| --- | --- |
| Mac (Apple Silicon, macOS 14 or newer) | `ResearchWorkbench-{version}-macOS-arm64.dmg` |
| Windows 11 (64-bit) | `ResearchWorkbench-{version}-Windows-x64-Setup.exe` |

### Installing

**Mac.** Open the disk image and drag **Research Workbench** into Applications. Open it
from Applications the first time.

**Windows.** Run the setup file. It installs for your user account only, so
administrator rights are not required.

### Supported systems

- Apple Silicon Macs running macOS 14 or newer. Intel Macs are not supported in this release.
- Windows 11 on 64-bit Intel or AMD processors. Native Windows on ARM is not supported in this release.
- Classification runs on the processor. No NVIDIA driver or graphics card is required.

### What is included

Python, the processing libraries, and the compiled interface are bundled. Classifier
weights are not: the default classifier downloads on first use and is then reused from
a local cache. You supply your own NewsAPI and OpenAI keys.

### Upgrading

Install this version over the previous one. Research files, attached folders, settings,
saved presets, design conversations, and jobs are kept. Uninstalling does not delete
your research data.

### Verifying your download

`SHA256SUMS.txt` lists the checksum of each installer.

```
shasum -a 256 -c SHA256SUMS.txt      # macOS
certutil -hashfile <file> SHA256     # Windows
```

Licences for the bundled components are in `THIRD_PARTY_NOTICES.md`.
"""


def main(argv=None):
    parser = argparse.ArgumentParser(description='Write release notes')
    parser.add_argument('--version', default=VERSION)
    parser.add_argument('--output', default='dist/RELEASE_NOTES.md')
    args = parser.parse_args(argv)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(TEMPLATE.format(version=args.version), encoding='utf-8')
    print(f'Wrote {output}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
