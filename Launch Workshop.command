#!/bin/zsh
set -e
cd "${0:A:h}"
if [[ ! -x .venv/bin/python || ! -f frontend/out/index.html ]]; then
  print "Run Setup Workshop.command once before launching."
  read "?Press Return to close."
  exit 1
fi
# Ignore inherited settings from an older installation.
unset WORKBENCH_PROJECT_DIR WORKBENCH_STATE_DIR WORKBENCH_WORKSPACE_DIR WORKBENCH_STATIC_DIR
exec .venv/bin/python -m workbench "$@"
