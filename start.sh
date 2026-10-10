#!/usr/bin/env bash
# Start the Research Workbench from this folder (macOS and Linux).
#
# The first run installs uv, Python 3.12, and the pinned packages into this
# folder; later runs only launch. Nothing else needs to be installed first.
set -euo pipefail
cd "$(dirname "$0")"

UV_HOME="$HOME/.local/bin"
export PATH="$UV_HOME:$PATH"

fail() {
  echo
  echo "Setup stopped: $1"
  echo "Ask your instructor for help and include the message above."
  exit 1
}

if [ "$(uname -s)" = Darwin ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" != 1 ]; then
  fail "this Mac has an Intel processor. PyTorch no longer supports Intel Macs; please use another computer."
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv (one time only)…"
  curl -LsSf https://astral.sh/uv/install.sh \
    | env UV_INSTALL_DIR="$UV_HOME" UV_NO_MODIFY_PATH=1 sh \
    || fail "could not download uv. Check your internet connection."
fi

if command -v shasum >/dev/null 2>&1; then
  wanted=$(shasum -a 256 requirements-tested.txt | cut -d' ' -f1)
else
  wanted=$(sha256sum requirements-tested.txt | cut -d' ' -f1)
fi
stamp=.venv/.requirements-sha256
if [ ! -x .venv/bin/python ] || [ "$(cat "$stamp" 2>/dev/null)" != "$wanted" ]; then
  echo "Preparing Python and packages (first run takes a few minutes)…"
  uv venv --quiet --clear --python 3.12 .venv || fail "could not create the Python environment."
  uv pip install --python .venv/bin/python -r requirements-tested.txt \
    || fail "could not install packages. Check your internet connection and run this again."
  echo "$wanted" > "$stamp"
fi

[ -f frontend/out/index.html ] || fail "the interface files are missing. Download the project again."

# Ignore settings inherited from an installed copy of the app.
unset WORKBENCH_PROJECT_DIR WORKBENCH_STATE_DIR WORKBENCH_WORKSPACE_DIR WORKBENCH_STATIC_DIR
echo "Starting the workbench. Keep this window open; close it to stop."
exec .venv/bin/python -m workbench "$@"
