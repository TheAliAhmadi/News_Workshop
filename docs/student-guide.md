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

### Or: let an AI coding assistant do Option A

If you use an AI assistant that can run commands on your computer, such as Claude Code, Codex, Cursor's agent, or GitHub Copilot in Agent mode, copy the ready-made prompt from the [README](../README.md#student-quick-start) into it. It runs the same installer and gives you the workbench's address. It is told never to handle your API keys: you add those yourself under **Connections**.

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

The sidebar lists the three steps in order: **Collect news → Classify → Extract**. A key icon next to a step means it needs a key you have not added yet. Each step works on its own: choose any CSV or JSON file as its input, and it saves a new file, so your originals never change. When a job finishes, its row under **Jobs** offers the next step, such as **Classify these**.

Each step page starts with **How this step works**, a flowchart that fills in with your settings. Green boxes happen on your computer, blue boxes over the internet; click a box to jump to that setting. **Show the Python code** (top right) shows a short script that does exactly what the page will do. Use **Download** to save it, then run it from the `News_Workshop` folder with the command at the top of the script. The second tab, **Inside the workbench**, shows the code the workbench itself runs.

Settings most people never change are folded under **More …** sections.

Under **Files**, upload datasets, open a file to preview its rows (click a row to read it as an article, with any labels and extracted fields on top; **All fields** and **Raw JSON** show the data itself), or use **Open folder** to show another folder from your computer: click through your folders (Desktop, Documents, …), or make a new one, then choose it. A file's **⋯** menu has **Use in Classify / Extract**, **Download**, **Rename**, and **Delete…**. To change your main research folder, open **Help (?)** and choose **Change…** next to Research folder. Your research files are in the `research_workspace` folder inside `News_Workshop` unless you chose another.

Closing the terminal window stops the workbench. Starting it again while it is already running simply reopens it in your browser. Interrupted jobs keep their checkpoints; resume them explicitly after the next start.

## Keys and privacy

Open **Connections** (top right) and paste your keys. **Save and check** asks NewsAPI or OpenAI whether each key works, and the window stays open to show the answer:

- **Working**: the provider accepted the key.
- **Not accepted**: the provider rejected it, so it was *not* saved. Copy it again from the provider's website; OpenAI keys start with `sk-`.
- **Saved, not checked yet**: the provider could not be reached (for example, no internet). The key is saved and will be checked when you run a step.

The window shows the last four characters of the saved key, so you can tell which key is in use. With **Remember on this computer**, keys are kept in the macOS Keychain or Windows Credential Manager, never in your project files or on GitHub. They are only sent to NewsAPI or OpenAI when you run a step. Use **Check it works** any time, or **Remove** to forget a key.

## Models

The default classifier (`yiyanghkust/finbert-esg`, about 440 MB) downloads on first use and is reused afterwards. To download it ahead of class, open **Classify** and choose **Prepare FinBERT for class**. If a download is interrupted, run it again; it continues from what was already downloaded.

## Jobs

The **Jobs** bar at the bottom shows what is running; click it to open or close the list. One job runs at a time, and jobs keep running while you switch steps. If something goes wrong, the job shows a plain explanation, such as a rejected key or a NewsAPI plan limit. Stopped or interrupted jobs keep their finished rows: **Resume** continues and retries failed rows, and the folder icon resumes into a different file. **Open result** shows the saved file. **Clear history** removes finished jobs from the list; your result files are kept.

## Updating and removing

Run the Option A line again, or `git pull` if you used Git. Research files, settings, jobs, and keys are kept.

To remove the workbench, first copy anything you want to keep out of `research_workspace`, then delete the `News_Workshop` folder. Saved keys can be removed first with **Remove** under **Connections**.

Using the desktop installer instead? Install a newer release over the previous one; uninstalling removes only the application and keeps research data and cached models.

## Getting help

1. Read the last lines in the terminal window; setup problems start with **Setup stopped**.
2. Close the window and start again — setup resumes where it stopped.
3. Ask your instructor, or open an issue on the [project repository](https://github.com/TheAliAhmadi/News_Workshop/issues).

For classroom workflows and assignment ideas, see the [instructor guide](instructor-guide.md).
