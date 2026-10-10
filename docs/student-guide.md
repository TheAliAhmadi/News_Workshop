# Student guide — Research Workbench

The workbench runs on your own computer and opens in your web browser. You use your own API keys, and they stay on your computer. You do not need to install Python, Node.js, or Git first; the start script sets everything up.

Works on Macs with Apple Silicon (M1 or newer) and on 64-bit Windows 10/11. Older Intel Macs are not supported because current PyTorch no longer ships for them. The first start needs internet and about 2 GB of free disk space.

## Get the workbench

Pick **one** of these options.

### Option A — one line in the terminal (easiest)

**Mac:** open **Terminal** (press ⌘ Space, type *Terminal*, press Return), paste this line, and press Return:

```sh
curl -LsSf https://raw.githubusercontent.com/TheAliAhmadi/News_Workshop/main/scripts/install.sh | bash
```

**Windows:** open the **Start** menu, type *PowerShell*, open **Windows PowerShell**, paste this line, and press Enter:

```powershell
powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/TheAliAhmadi/News_Workshop/main/scripts/install.ps1 | iex"
```

This downloads the project into a `News_Workshop` folder in your home folder and starts it. Running the same line again later updates the program and keeps your research files and keys.

### Option B — fork or clone with Git

If you use Git or GitHub Desktop, fork [the repository](https://github.com/TheAliAhmadi/News_Workshop) (or clone it directly), then start it from the project folder:

- **Mac:** double-click **Start Workbench.command**, or run `./start.sh` in Terminal.
- **Windows:** double-click **start.bat**.

To get your instructor's updates later, use **Sync fork** on GitHub and pull, or run `git pull`.

## Starting it again

Open your `News_Workshop` folder and double-click **Start Workbench.command** (Mac) or **start.bat** (Windows). Later starts take a few seconds.

A terminal window shows what the workbench is doing and your browser opens it. **Keep that window open while you work; close it to stop the workbench.** If you close the browser tab by accident, the terminal shows the address (for example `http://127.0.0.1:8765`) to open again.

If you downloaded the project as a ZIP from your web browser, macOS may refuse to open **Start Workbench.command**. Run the Option A line instead (it works on an existing folder too), or open **System Settings → Privacy & Security** and choose **Open Anyway**. On Windows, if a blue “Windows protected your PC” box appears, choose **More info → Run anyway**.

## Desktop installers (alternative)

Prefer a packaged app instead of the start script? Download an installer.

| Computer | File |
| --- | --- |
| Mac (Apple Silicon, macOS 14 or newer) | `ResearchWorkbench-*-macOS-arm64.dmg` |
| Windows 11 (64-bit) | `ResearchWorkbench-*-Windows-x64-Setup.exe` |

Get the latest files from the [Releases](https://github.com/TheAliAhmadi/News_Workshop/releases) page on GitHub.

**Mac.** Open the disk image and drag **Research Workbench** into Applications. Open it from Applications the first time (not from the disk image).

**Windows.** Run the setup file. It installs for your user account only, so administrator rights are usually not required.

Intel Macs and native Windows on ARM are not supported in this release.

## Opening the unsigned preview

This preview has no verified publisher certificate. Only approve the copy linked by your instructor from this repository.

- **Mac:** After trying to open the installed app, open **System Settings → Privacy & Security**, find the message about Research Workbench, and choose **Open Anyway**. Confirm the prompt. [Apple's instructions](https://support.apple.com/en-gb/102445).
- **Windows:** If SmartScreen says “Windows protected your PC,” choose **More info → Run anyway**, when offered. [Microsoft's explanation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
- School-managed devices and Windows Smart App Control may block unsigned software without an individual override. Ask the instructor or IT team if the approval option is unavailable. Do not turn off system protections.

## First launch

1. Start the workbench as above; your browser opens it.
2. Choose a **research folder** (or keep the suggested `research_workspace` folder inside the project).
3. Enter your **NewsAPI** and/or **OpenAI** keys if you have them. Leave **Remember on this computer** checked to store them securely in your system keychain or credential manager. You can skip and add keys later under **Connections**.
4. Optionally click **Prepare FinBERT for class** so the default classifier downloads once and is ready offline afterward.

Every step can be skipped. **Connections** is always in the top bar, and FinBERT preparation is also in the **Classify** step.

## Everyday use

The sidebar lists the research steps in order: **Collect, Clean, Classify, Extract, Validate, Aggregate**. A key icon next to a step means it needs a key you have not added yet. Each step works on its own: choose any CSV or JSON file as its input, and it saves a new file, so your originals never change.

Under **Files**, upload datasets, open a file to preview its rows, or use **Open folder** to show another folder from your computer. A file's **⋯** menu and its preview both have **Use in** buttons that send it to a step. Your research files are in the `research_workspace` folder inside `News_Workshop` unless you chose another.

Closing the terminal window stops the workbench. Interrupted jobs keep their checkpoints; resume them explicitly after the next start.

## Keys and privacy

Keys entered in **Connections** stay on your computer. With **Remember on this computer**, they are stored through macOS Keychain or Windows Credential Manager—not in your research files and not sent back to the interface after saving. Use **Remove** to forget them, or turn off Remember for a session-only key.

If secure storage is unavailable, the app keeps keys for the current session only and tells you plainly. It never silently saves plaintext keys to disk.

## Models

The default classifier (`yiyanghkust/finbert-esg`, about 440 MB) downloads on first use and is reused afterwards. To download it ahead of class, open **Classify** and choose **Prepare FinBERT for class**. If a download is interrupted, run it again; it continues from what was already downloaded.

## Jobs

The **Jobs** bar at the bottom shows what is running; click it to open or close the list. One job runs at a time, and jobs keep running while you switch steps. If something goes wrong, the job shows a plain explanation, such as a rejected key or a NewsAPI plan limit. Stopped or interrupted jobs keep their finished rows: **Resume** continues and retries failed rows, and the folder icon resumes into a different file. **Open result** shows the saved file.

## Updating and removing

Run the Option A line again, or `git pull` if you used Git. Research files, settings, jobs, and keys are kept.

To remove the workbench, first copy anything you want to keep out of `research_workspace`, then delete the `News_Workshop` folder. Saved keys can be removed first with **Remove** under **Connections**.

Using the desktop installer instead? Install a newer release over the previous one; uninstalling removes only the application and keeps research data and cached models.

## Getting help

1. Read the last lines in the terminal window; setup problems start with **Setup stopped**.
2. Close the window and start again — setup resumes where it stopped.
3. Ask your instructor, or open an issue on the [project repository](https://github.com/TheAliAhmadi/News_Workshop/issues).

For classroom workflows and assignment ideas, see the [instructor guide](instructor-guide.md).
