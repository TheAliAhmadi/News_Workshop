# Student guide — Research Workbench

Download the installer for your computer, open Research Workbench, and use your own API keys. You do not need Python, Node.js, Git, Docker, or the terminal.

## Download and install

| Computer | File |
| --- | --- |
| Mac (Apple Silicon, macOS 14 or newer) | `ResearchWorkbench-*-macOS-arm64.dmg` |
| Windows 11 (64-bit) | `ResearchWorkbench-*-Windows-x64-Setup.exe` |

Get the latest files from the [Releases](https://github.com/TheAliAhmadi/News_Workshop/releases) page on GitHub.

**Mac.** Open the disk image and drag **Research Workbench** into Applications. Open it from Applications the first time (not from the disk image).

**Windows.** Run the setup file. It installs for your user account only, so administrator rights are usually not required.

Intel Macs and native Windows on ARM are not supported in this release.

## First launch

1. Open **Research Workbench**. A small window shows startup progress, then your browser opens the workbench.
2. Choose a **research folder** (or keep the suggested `ResearchWorkbench` folder in your home directory).
3. Enter your **NewsAPI** and/or **OpenAI** keys if you have them. Leave **Remember on this computer** checked to store them securely in your system keychain or credential manager. You can skip and add keys later under **Connections**.
4. Optionally click **Prepare FinBERT for class** so the default classifier downloads once and is ready offline afterward.

Every step can be skipped. Connections and model preparation are always available from the header later.

## Everyday use

- **Open workbench** opens the browser again if you closed the tab.
- **Open research folder** reveals your research files in Finder or File Explorer.
- **Troubleshooting** shows recent startup messages if something fails.
- **Quit** stops the local backend cleanly. Interrupted jobs keep their checkpoints; resume them explicitly after the next launch.

Attach additional folders with **Open folder** in the explorer. Upload datasets, preview rows, and run each tool with its own input, settings, and output destination.

## Keys and privacy

Keys entered in **Connections** stay on your computer. With **Remember on this computer**, they are stored through macOS Keychain or Windows Credential Manager—not in your research files and not sent back to the interface after saving. Use **Remove** to forget them, or turn off Remember for a session-only key.

If secure storage is unavailable, the app keeps keys for the current session only and tells you plainly. It never silently saves plaintext keys to disk.

## Models

The default classifier (`yiyanghkust/finbert-esg`) downloads on first use into a per-user cache and is reused later. Progress is visible; if a download is interrupted, run **Prepare FinBERT for class** again—it continues from what was already cached.

## Jobs

The bottom panel shows the queue. Cancelled or interrupted jobs keep completed rows. Use **Resume / retry failed** to continue. Choosing a new output destination is required if the previous output file changed.

## Upgrading and uninstalling

Install a newer release over the previous one. Research files, attached folders, settings, presets, design conversations, jobs, and downloaded models are kept.

Uninstalling removes only the application. It does not delete your research data or cached models.

## Getting help

1. Use **Troubleshooting** in the launcher.
2. Confirm you downloaded the installer that matches your computer.
3. Ask your instructor, or open an issue on the [project repository](https://github.com/TheAliAhmadi/News_Workshop/issues).

For classroom workflows and assignment ideas, see the [instructor guide](instructor-guide.md).
