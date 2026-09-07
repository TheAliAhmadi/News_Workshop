#!/bin/zsh
set -e
cd "${0:A:h}"
if ! command -v uv >/dev/null; then
  print "Install uv from https://docs.astral.sh/uv/getting-started/installation/ and run setup again."
  read "?Press Return to close."
  exit 1
fi
if [[ ! -d .venv ]]; then uv venv --python 3.12 .venv; fi
uv pip install --python .venv/bin/python -r requirements.txt
if [[ ! -f frontend/out/index.html ]]; then
  cd frontend
  npm ci
  npm run build
fi
print "Setup complete. Open Launch Workshop.command."
