#!/usr/bin/env bash
# One-line install for macOS/Linux:
#   curl -LsSf https://raw.githubusercontent.com/TheAliAhmadi/News_Workshop/main/scripts/install.sh | bash
#
# Downloads the project to ~/News_Workshop (or ${WORKBENCH_DIR}) and starts it.
# Running it again updates the program files and keeps research data and keys.
set -euo pipefail
REPO="${WORKBENCH_REPO:-TheAliAhmadi/News_Workshop}"
DEST="${WORKBENCH_DIR:-${HOME}/News_Workshop}"

if [ -d "${DEST}/.git" ]; then
  echo "${DEST} is a git checkout; updating with git pull."
  git -C "${DEST}" pull --ff-only
else
  echo "Downloading the Research Workbench into ${DEST}…"
  mkdir -p "${DEST}"
  curl -LsSf "https://github.com/${REPO}/archive/refs/heads/main.tar.gz" \
    | tar -xz --strip-components=1 -C "${DEST}"
fi
chmod +x "${DEST}/start.sh" "${DEST}/Start Workbench.command"
echo
echo "Next time, start it by double-clicking 'Start Workbench.command' in ${DEST}"
echo "(or run: ${DEST}/start.sh)"
echo
# stdin is the downloaded script under `curl | bash`, so give the app the
# terminal. AI assistants run commands without one; the app does not read
# input, so it starts the same way from an empty stdin.
if (exec </dev/tty) 2>/dev/null; then
  exec "${DEST}/start.sh" "$@" </dev/tty
fi
exec "${DEST}/start.sh" "$@" </dev/null
