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

The script signs all native binaries and frameworks, notarizes and staples the app, then builds a fresh disk image containing that signed app. It signs, notarizes, staples, and assesses the final image as well.

## Windows (Azure Artifact Signing)

1. Create an Azure Artifact Signing account with a validated **Public Trust** identity. Follow [Microsoft’s quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart).
2. Configure GitHub OIDC federated credentials so Actions can request tokens without storing a long-lived client secret in the repository (the release workflow already requests `id-token: write`).
3. Note the signing endpoint URL, account name, and certificate profile name.

### GitHub secrets

| Secret | Purpose |
| --- | --- |
| `AZURE_CLIENT_ID` | Entra application/client ID for GitHub OIDC |
| `AZURE_TENANT_ID` | Entra tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
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

The release workflow performs this sequence using the official Azure action when signing is enabled, and rejects invalid Authenticode signatures. The standalone script is for local use after authenticating to Azure.

## Enabling signing in GitHub Actions

Signing runs when:

- You dispatch the **Release** workflow with **sign** checked, or
- Repository variable `ENABLE_RELEASE_SIGNING` is set to `true` (useful for tag pushes once accounts are ready).

Signing is optional. With signing disabled, a version tag creates an **unsigned preview draft**, marked as a prerelease with explicit installation instructions. A manual run on `main` only creates CI validation artifacts. No publisher accounts are required for unsigned previews.

Signed runs must target a `v` tag matching `workbench/version.py`. A preflight job reports missing secret **names** before packaging begins. Add the credentials in GitHub Settings → Secrets and variables → Actions; never commit them. The Windows identity needs the **Artifact Signing Certificate Profile Signer** role and a federated credential matching this repository and the release tag/environment. The workflow authenticates using `azure/login` and signs through the official `azure/artifact-signing-action`.

The failed initial `v1.0.0` tag points at the original packaging commit. Do not rerun that old tag expecting later fixes. Validate `main` first; when publishing the corrected release, update `workbench/version.py` and create a new matching version tag.

## Before signed class publication

1. Download the draft assets and verify checksums in `SHA256SUMS.txt`.
2. On a clean Mac: open the DMG under quarantine, confirm Gatekeeper accepts the notarized app, install, and walk the [student acceptance checklist](../PLAN_release.md#5-acceptance-and-rollout).
3. On a clean Windows 11 PC: run Setup.exe, confirm Authenticode status, install without admin if possible, and walk the same checklist.
4. Confirm uninstall leaves research data and model cache intact.
5. Publish the verified draft release, then point the README download links at that release.
