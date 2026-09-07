#!/bin/bash
# Sign the actual app, notarize/staple it, then create and notarize its disk image.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PYTHON="${PYTHON:-python3}"
VERSION="$("$PYTHON" -c 'from workbench.version import VERSION; print(VERSION)')"
APP="dist/Research Workbench.app"
DMG="dist/ResearchWorkbench-${VERSION}-macOS-arm64.dmg"
: "${APPLE_SIGNING_IDENTITY:?Set APPLE_SIGNING_IDENTITY}"
: "${APPLE_API_KEY_PATH:?Set APPLE_API_KEY_PATH}"
: "${APPLE_API_KEY_ID:?Set APPLE_API_KEY_ID}"
: "${APPLE_API_ISSUER_ID:?Set APPLE_API_ISSUER_ID}"

# Python and other bundled frameworks contain extensionless Mach-O binaries too.
# Sign every native binary, then framework bundles from the inside out.
"$PYTHON" - <<'PY'
import os
from pathlib import Path
import subprocess
app = Path('dist/Research Workbench.app')
magic = {bytes.fromhex(x) for x in ('feedface', 'cefaedfe', 'feedfacf', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca')}
command = ['codesign', '--force', '--timestamp', '--options', 'runtime', '--entitlements',
           'packaging/macos/entitlements.plist', '--sign', os.environ['APPLE_SIGNING_IDENTITY']]
for file in app.rglob('*'):
    if file.is_file() and not file.is_symlink():
        with file.open('rb') as stream:
            native = stream.read(4) in magic
        if native:
            subprocess.run([*command, str(file)], check=True)
for framework in sorted(app.rglob('*.framework'), key=lambda p: len(p.parts), reverse=True):
    if not framework.is_symlink():
        subprocess.run([*command, str(framework)], check=True)
subprocess.run([*command, str(app)], check=True)
PY
codesign --verify --deep --strict --verbose=2 "$APP"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
notarize() {
  xcrun notarytool submit "$1" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER_ID" --wait --timeout 15m --output-format json > "$STAGING/notary.json"
  cat "$STAGING/notary.json"
  "$PYTHON" -c 'import json,sys; r=json.load(open(sys.argv[1])); sys.exit(0 if r.get("status")=="Accepted" else "Notarization rejected; inspect submission " + r.get("id", "unknown"))' "$STAGING/notary.json"
}
ditto -c -k --keepParent "$APP" "$STAGING/application.zip"
notarize "$STAGING/application.zip"
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
spctl --assess --type execute --verbose=2 "$APP"

# Rebuild AFTER signing. The old implementation notarized an image containing
# the earlier unsigned app even though the app on disk had been signed.
mkdir "$STAGING/image"
ditto "$APP" "$STAGING/image/Research Workbench.app"
ln -s /Applications "$STAGING/image/Applications"
cp docs/student-guide.md "$STAGING/image/Student guide.md"
hdiutil create -volname "Research Workbench $VERSION" -srcfolder "$STAGING/image" -ov -format UDZO "$DMG"
codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$DMG"
notarize "$DMG"
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"
