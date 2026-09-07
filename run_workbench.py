"""Frozen application entry point.

Multiprocessing initialization runs before any application import. The job
worker restarts this executable to create its process; `freeze_support` serves
that request and exits, so a worker never reaches the launcher window.
"""
import multiprocessing
import sys

if __name__ == '__main__':
    try:
        multiprocessing.freeze_support()
        from launcher.main import main
        result = main()
    except Exception:
        # Windowed PyInstaller otherwise opens a modal error dialog, hanging CI
        # and spawned workers indefinitely. Always write the actual traceback.
        import traceback
        from launcher.main import attach_streams, _report_startup_error
        from workbench import paths
        log_file = attach_streams(paths.user_log_dir())
        traceback.print_exc()
        if not any(arg in sys.argv for arg in ('--headless', '--self-test', '--multiprocessing-fork')):
            _report_startup_error('The application could not start. See the diagnostic log.', log_file)
        result = 1
    sys.exit(result)
