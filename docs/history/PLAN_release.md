# Downloadable Classroom Apps for Mac and Windows

## 1. Distribution approach

Create a public repository at **`TheAliAhmadi/News_Workshop`** and distribute ready-to-use installers through **GitHub Releases**.

Students will download the appropriate installer, open Research Workbench, and enter their own API keys. Python, processing libraries, and the compiled interface will be bundled. Students will not need Python, Node.js, Git, Docker, or terminal commands.

Confirmed choices and defaults:

- **Interface:** retain the current browser workbench, opened automatically by a small desktop launcher.
- **Mac:** Apple Silicon, macOS 14 or newer.
- **Windows:** Windows 11 x64; CPU inference, without requiring NVIDIA drivers.
- **Models:** download automatically on first use and retain locally. Include an optional “Prepare FinBERT for class” action.
- **First release excludes:** Intel Macs, native Windows ARM support, Docker, and hosted processing.
- **Updates:** download and install a newer release; preserve user data. Automatic self-updating is deferred.

## 2. Application packaging and launcher

Use **PyInstaller in one-folder mode** to bundle Python, backend dependencies, native libraries, and the Next.js static export. Package that directory inside familiar installers rather than repeatedly unpacking a large single-file executable.

Deliver:

- `ResearchWorkbench-<version>-macOS-arm64.dmg`, containing `Research Workbench.app`.
- `ResearchWorkbench-<version>-Windows-x64-Setup.exe`, built with Inno Setup and installed per user without a separate development-tool setup.

Build a small native launcher using Tkinter, including its runtime. It displays startup progress, **Open workbench**, **Open research folder**, **Troubleshooting**, and **Quit**.

The launcher will:

- Start the local backend and open the browser only after its health check succeeds.
- Keep one application instance per user. Clicking the icon again opens the existing workbench.
- Bind exclusively to localhost; use the normal port when available and select another if an unrelated application occupies it.
- Shut down the backend and worker cleanly. Interrupted jobs retain checkpoints and require explicit resume.
- Show readable startup errors and provide sanitized diagnostic logs.

Adjust the frozen entrypoint so multiprocessing initialization runs before application imports. Bundle the dependencies and import metadata needed by Transformers and its supported tokenizers. Verify actual classifier execution inside both packaged builds.

## 3. First launch, credentials, and persistent data

Separate installed application files from all writable user data.

- Store settings, root registrations, jobs, and checkpoints in the platform’s per-user application-data directory.
- Store model downloads in the per-user cache directory.
- Default research files to `~/ResearchWorkbench`, with the existing folder-selection controls available.
- Preserve these locations across application replacement and upgrades. Uninstalling the program will not automatically delete research data.

Add a first-launch guide for choosing a research folder, entering API keys, and optionally preparing FinBERT. Students can skip connections and configure them later.

Extend **Connections** with a visible **Remember on this computer** option, enabled by default. Save remembered credentials using macOS Keychain or Windows Credential Manager through `keyring`. Provide explicit removal and session-only options. If secure storage is unavailable, retain keys only for the session and explain that clearly; never silently save plaintext keys.

Move persistent tool settings and designer conversations from browser-only storage into backend-managed user storage. This prevents apparent data loss when the local port changes.

Interface changes:

- Add version/platform information to bootstrap responses.
- Add authenticated preferences and designer-session read/write endpoints.
- Extend connection requests with remember/remove behavior; responses continue returning status flags only.
- Import existing browser settings once when backend preferences are empty, preserving custom schemas and drafts.
- Keep the developer `.env` workflow available for source-based use.

## 4. GitHub builds and signed releases

Create the repository from a deliberate source allowlist. Include code, tests, student documentation, and clearly labeled synthetic examples. Exclude API keys, virtual environments, caches, job archives, research datasets, and screenshots containing existing research information.

Add GitHub Actions workflows that:

1. Run backend tests and frontend verification.
2. Build the static interface.
3. Build platform-specific packages on Apple Silicon macOS and Windows runners using pinned dependencies.
4. Exercise the packaged launcher, worker, and default classifier.
5. Sign the application and installers.
6. Produce a draft release with installers, checksums, third-party notices, version information, and supported-system requirements.

Keep each download below GitHub’s release-asset limit. Measure actual download and installed sizes before publishing. [GitHub release limits](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).

Provide publisher setup instructions:

- **Apple:** enroll in the Apple Developer Program, create a Developer ID Application certificate, configure notarization credentials, sign the bundle, notarize it, and staple the ticket. Educational institutions may qualify for a membership fee waiver. [Apple membership guidance](https://developer.apple.com/support/compare-memberships/).
- **Windows:** configure Azure Artifact Signing with a validated Public Trust identity and GitHub OIDC authentication; sign and timestamp the executable and installer. [Microsoft setup guidance](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart).

Account enrollment, identity verification, and any purchases remain owner setup tasks. Packaging work can proceed before those are complete, but **public installer publication must wait for signing and verification**. Signing will not be described as guaranteeing the absence of every Windows reputation or institutional-policy warning.

The README will prominently display **Download for Mac** and **Download for Windows**, with a short illustrated student guide.

## 5. Acceptance and rollout

The release is ready when a nontechnical student can complete the following on clean Mac and Windows installations without Python or Node.js:

- Install and launch through the graphical interface.
- Configure their own keys, restart, and retain remembered connections.
- Upload, preview, classify, design an extraction schema through chat, and run extraction.
- Download FinBERT with visible progress, recover from an interrupted download, and reuse the cached model.
- Cancel and resume jobs without losing completed rows.
- Reopen the app without duplicate servers; recover from an occupied port.
- Upgrade while preserving datasets, attached folders, presets, conversations, and jobs.
- Use paths containing spaces and non-ASCII characters.
- Quit without leaving backend or worker processes running.

Make existing tests portable across operating systems and add packaged-application smoke tests. Test the actual downloaded signed artifacts, including macOS quarantine/notarization and Windows installation behavior.

Roll out first to a small student pilot on both platforms, resolve installation issues, then publish the verified release for the class.
