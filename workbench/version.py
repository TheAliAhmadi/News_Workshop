"""Single source of truth for the release version, read by builds and installers."""
from __future__ import annotations

import platform
import sys

VERSION = '1.0.0'
APP_NAME = 'ResearchWorkbench'
DISPLAY_NAME = 'Research Workbench'
PUBLISHER = 'TheAliAhmadi'
REPOSITORY = 'https://github.com/TheAliAhmadi/News_Workshop'


def platform_key():
    """Identifier used in release asset filenames."""
    if sys.platform == 'darwin':
        return 'macOS-arm64' if platform.machine() in ('arm64', 'aarch64') else 'macOS-x86_64'
    if sys.platform.startswith('win'):
        return 'Windows-x64' if platform.machine().lower() in ('amd64', 'x86_64') else 'Windows-' + platform.machine()
    return 'Linux-' + platform.machine()


def describe():
    """Version and platform facts shown in the interface and diagnostics."""
    return {
        'version': VERSION,
        'app_name': APP_NAME,
        'display_name': DISPLAY_NAME,
        'platform': platform_key(),
        'system': platform.system(),
        'release': platform.release(),
        'machine': platform.machine(),
        'python': platform.python_version(),
    }


if __name__ == '__main__':
    print(VERSION)
