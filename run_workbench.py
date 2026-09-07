"""Frozen application entry point.

Multiprocessing initialization runs before any application import. The job
worker restarts this executable to create its process; `freeze_support` serves
that request and exits, so a worker never reaches the launcher window.
"""
import multiprocessing
import sys

if __name__ == '__main__':
    multiprocessing.freeze_support()
    from launcher.main import main
    sys.exit(main())
