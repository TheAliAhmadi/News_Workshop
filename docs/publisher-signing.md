# Publisher signing setup

Public installer publication waits until the Mac and Windows artifacts are signed and verified. Packaging and draft (unsigned) builds can proceed without these accounts; students should not be pointed at unsigned installers for class use.

Signing establishes publisher identity. It does **not** guarantee the absence of every Windows SmartScreen or institutional-policy warning. Reputation on Windows builds over download volume and time; managed machines may apply their own rules.

## Apple (macOS)

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/). Educational institutions may qualify for a membership fee waiver; see [Apple membership guidance](https://developer.apple.com/support/compare-memberships/).
2. Create a **Developer ID Application** certificate in Certificates, Identifiers & Profiles.
3. Create an App Store Connect API key with access to notarization, and download the `.p8` private key once.
4. Export the Developer ID certificate as a `.p12` for CI (temporary keychain import).

### GitHub secrets

| Secret | Purpose |
| --- | --- |
| `APPLE_CERTIFICATE_P12` | Base64-encoded `.p12` of the Developer ID Application certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for that `.p12` |
| `APPLE_SIGNING_IDENTITY` | Full identity string, e.g. `Developer ID Application: Name (TEAMID)` |
| `APPLE_TEAM_ID` | Team identifier |
| `APPLE_API_KEY_ID` | App Store Connect API key id |
| `APPLE_API_ISSUER_ID` | App Store Connect issuer id |
| `APPLE_API_KEY` | Base64-encoded contents of the `.p8` key file |

### Local or CI signing

```sh
# After packaging/build_macos.sh has produced the .app and .dmg:
export APPLE_SIGNING_IDENTITY='Developer ID Application: …'
export APPLE_API_KEY_PATH=/path/to/AuthKey.p8
export APPLE_API_KEY_ID=…
export APPLE_API_ISSUER_ID=…
bash packaging/sign_macos.sh
```

The script signs nested binaries and the bundle, submits the DMG to notarization, staples the ticket, and assesses Gatekeeper acceptance.

## Windows (Azure Artifact Signing)

1. Create an Azure Artifact Signing account with a validated **Public Trust** identity. Follow [Microsoft’s quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart).
2. Configure GitHub OIDC federated credentials so Actions can request tokens without storing a long-lived client secret in the repository (the release workflow already requests `id-token: write`).
3. Note the signing endpoint URL, account name, and certificate profile name.

### GitHub secrets

| Secret | Purpose |
| --- | --- |
| `AZURE_SIGNING_ENDPOINT` | Artifact Signing service endpoint URL |
| `AZURE_CODE_SIGNING_ACCOUNT` | Account name |
| `AZURE_CERTIFICATE_PROFILE` | Certificate profile name |

### Signing order

The Windows executable must be signed **before** Inno Setup builds the installer, so the installed program carries a signature. The Setup.exe is signed afterward.

```powershell
# After packaging/build_windows.ps1 -SkipInstaller:
pwsh -File packaging/sign_windows.ps1 -Target Exe
pwsh -File packaging/build_windows.ps1 -InstallerOnly
pwsh -File packaging/sign_windows.ps1 -Target Setup
```

The release workflow performs this sequence when signing is enabled.

## Enabling signing in GitHub Actions

Signing runs when:

- You dispatch the **Release** workflow with **sign** checked, or
- Repository variable `ENABLE_RELEASE_SIGNING` is set to `true` (useful for tag pushes once accounts are ready).

Without those, tag pushes still produce a **draft** release with unsigned installers for internal size and smoke checks. Do not publish those drafts to students.

## Before class publication

1. Download the draft assets and verify checksums in `SHA256SUMS.txt`.
2. On a clean Mac: open the DMG under quarantine, confirm Gatekeeper accepts the notarized app, install, and walk the [student acceptance checklist](../PLAN_release.md#5-acceptance-and-rollout).
3. On a clean Windows 11 PC: run Setup.exe, confirm Authenticode status, install without admin if possible, and walk the same checklist.
4. Confirm uninstall leaves research data and model cache intact.
5. Publish the verified draft release, then point the README download links at that release.
