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

## First launch

1. Start the workbench as above; your browser opens it.
2. Choose a **research folder** (or keep the suggested `research_workspace` folder inside the project).
3. Enter your **NewsAPI** and/or **OpenAI** keys if you have them. Leave **Remember on this computer** checked to store them securely in your system keychain or credential manager. You can skip and add keys later under **Connections**.
4. Optionally click **Prepare FinBERT for class** so the default classifier downloads once and is ready offline afterward.

Every step can be skipped. Connections and model preparation are always available from the header later.

## Everyday use

Attach additional folders with **Open folder** in the explorer. Upload datasets, preview rows, and run each tool with its own input, settings, and output destination. Your research files are in the `research_workspace` folder inside `News_Workshop` unless you chose another.

Closing the terminal window stops the workbench. Interrupted jobs keep their checkpoints; resume them explicitly after the next start.

## Keys and privacy

Keys entered in **Connections** stay on your computer. With **Remember on this computer**, they are stored through macOS Keychain or Windows Credential Manager—not in your research files and not sent back to the interface after saving. Use **Remove** to forget them, or turn off Remember for a session-only key.

If secure storage is unavailable, the app keeps keys for the current session only and tells you plainly. It never silently saves plaintext keys to disk.

## Models

The default classifier (`yiyanghkust/finbert-esg`) downloads on first use into a per-user cache and is reused later. Progress is visible; if a download is interrupted, run **Prepare FinBERT for class** again—it continues from what was already cached.

## Jobs

The bottom panel shows the queue. Cancelled or interrupted jobs keep completed rows. Use **Resume / retry failed** to continue. Choosing a new output destination is required if the previous output file changed.

## Updating and removing

Run the Option A line again, or `git pull` if you used Git. Research files, settings, jobs, and keys are kept.

To remove the workbench, first copy anything you want to keep out of `research_workspace`, then delete the `News_Workshop` folder. Saved keys can be removed first with **Remove** under **Connections**.

## Getting help

1. Read the last lines in the terminal window; setup problems start with **Setup stopped**.
2. Close the window and start again — setup resumes where it stopped.
3. Ask your instructor, or open an issue on the [project repository](https://github.com/TheAliAhmadi/News_Workshop/issues).

For classroom workflows and assignment ideas, see the [instructor guide](instructor-guide.md).
