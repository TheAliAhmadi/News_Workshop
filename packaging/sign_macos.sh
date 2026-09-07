#!/bin/bash
# Sign, notarize, and staple the macOS application and disk image.
#
# Requires an Apple Developer Program membership and these variables:
#   APPLE_SIGNING_IDENTITY   Developer ID Application: Name (TEAMID)
#   APPLE_TEAM_ID            Team identifier
#   APPLE_API_KEY_ID         App Store Connect API key identifier
#   APPLE_API_ISSUER_ID      App Store Connect issuer identifier
#   APPLE_API_KEY_PATH       Path to the .p8 private key file
#
# Publication waits for this step. Without it, macOS shows students a warning
# that the developer cannot be verified.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PYTHON="${PYTHON:-python3}"
VERSION="$("$PYTHON" -c 'import sys; sys.path.insert(0, "."); from workbench.version import VERSION; print(VERSION)')"
APP="dist/Research Workbench.app"
DMG="dist/ResearchWorkbench-${VERSION}-macOS-arm64.dmg"

: "${APPLE_SIGNING_IDENTITY:?Set APPLE_SIGNING_IDENTITY to your Developer ID Application identity}"

echo "==> Signing nested code"
# Every Mach-O inside the bundle is signed before the bundle itself.
find "$APP" -type f \( -name '*.so' -o -name '*.dylib' \) -print0 |
  xargs -0 -I{} codesign --force --timestamp --options runtime --sign "$APPLE_SIGNING_IDENTITY" {}

echo "==> Signing the application"
codesign --force --timestamp --options runtime --entitlements packaging/macos/entitlements.plist \
  --sign "$APPLE_SIGNING_IDENTITY" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

echo "==> Signing the disk image"
codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$DMG"

echo "==> Notarizing"
xcrun notarytool submit "$DMG" \
  --key "${APPLE_API_KEY_PATH:?Set APPLE_API_KEY_PATH}" \
  --key-id "${APPLE_API_KEY_ID:?Set APPLE_API_KEY_ID}" \
  --issuer "${APPLE_API_ISSUER_ID:?Set APPLE_API_ISSUER_ID}" \
  --wait

echo "==> Stapling"
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"
echo "Signed and notarized $DMG"
