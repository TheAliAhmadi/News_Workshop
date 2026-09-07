#!/bin/bash
# Build the macOS application bundle and disk image.
#
# Signing and notarization are separate steps in sign_macos.sh, because they
# need an Apple Developer account that packaging does not.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-python3}"
VERSION="$("$PYTHON" -c 'import sys; sys.path.insert(0, "."); from workbench.version import VERSION; print(VERSION)')"
APP="dist/Research Workbench.app"
DMG="dist/ResearchWorkbench-${VERSION}-macOS-arm64.dmg"

echo "==> Building the interface"
if [ ! -f frontend/out/index.html ] || [ "${REBUILD_FRONTEND:-0}" = "1" ]; then
  (cd frontend && npm ci && npm run build)
fi

echo "==> Collecting third-party notices"
"$PYTHON" packaging/third_party_notices.py

echo "==> Building the application bundle"
rm -rf build dist
"$PYTHON" -m PyInstaller --noconfirm --clean packaging/workbench.spec

if [ ! -d "$APP" ]; then
  echo "Expected $APP to exist" >&2
  exit 1
fi

echo "==> Verifying the packaged build"
"$PYTHON" packaging/check_installation.py --app "$APP" --output dist/self-test-macos.json

echo "==> Creating the disk image"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
cp -R "$APP" "$STAGING/"
ln -s /Applications "$STAGING/Applications"
cp docs/student-guide.md "$STAGING/Student guide.md"
hdiutil create -volname "Research Workbench $VERSION" -srcfolder "$STAGING" -ov -format UDZO "$DMG"

echo "==> Sizes"
du -sh "$APP" "$DMG"
echo "Built $DMG"
