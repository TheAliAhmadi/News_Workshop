#!/usr/bin/env bash
# Run the browser tests against a throwaway workbench.
#
# Starts the backend with temporary state and research folders (first-run
# guide already completed, no keychain access), runs Playwright, and stops it.
# Usage from frontend/: npm run test:e2e:local [-- playwright args]
set -euo pipefail
cd "$(dirname "$0")/../.."
python=${PYTHON:-.venv/bin/python}
scratch=$(mktemp -d)
mkdir -p "$scratch/state" "$scratch/research" "$scratch/home"
echo '{"first_run_complete": true}' > "$scratch/state/settings.json"
port=${E2E_PORT:-8790}

# HOME is temporary too, so the folder picker never touches real folders.
HOME="$scratch/home" USERPROFILE="$scratch/home" \
WORKBENCH_STATE_DIR="$scratch/state" WORKBENCH_WORKSPACE_DIR="$scratch/research" \
WORKBENCH_SECURE_STORAGE=0 NEWS_API_KEY= OPENAI_API_KEY= WORKBENCH_ENV_FILE="$scratch/none.env" \
  "$python" -m workbench --no-browser --port "$port" > "$scratch/server.log" 2>&1 &
server=$!
cleanup() {
  kill $server 2>/dev/null || true
  wait $server 2>/dev/null || true
  # E2E_KEEP_LOG=<file> keeps the server log for debugging.
  if [ -n "${E2E_KEEP_LOG:-}" ]; then cp "$scratch/server.log" "$E2E_KEEP_LOG"; fi
  rm -rf "$scratch"
}
trap cleanup EXIT

for _ in $(seq 1 60); do grep -q 'ready at' "$scratch/server.log" && break; sleep 1; done
url=$(grep -o 'http://[^ ]*' "$scratch/server.log" | tail -1)
[ -n "$url" ] || { cat "$scratch/server.log"; exit 1; }
cd frontend
WORKBENCH_URL="$url" npx playwright test "$@"
