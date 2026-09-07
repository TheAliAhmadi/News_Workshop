"""Source-based entry point: `python -m workbench`.

Installed builds start through the desktop launcher instead. Both share the
same service supervisor, so port selection and readiness behave identically.
"""
import argparse
import multiprocessing
import sys
import time
import webbrowser


def main(argv=None):
    from launcher.service import BackendService

    parser = argparse.ArgumentParser(description='Local file-based research workbench')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args(argv)

    service = BackendService(preferred=args.port)
    url = service.start()
    try:
        service.wait_until_ready(timeout=180)
    except (TimeoutError, RuntimeError) as exc:
        service.stop()
        print(f'The workbench did not start: {exc}', file=sys.stderr)
        return 1
    print(f'Research Workbench is ready at {url}', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print('\nStopping the local service and worker…', flush=True)
    finally:
        service.stop()
    return 0


if __name__ == '__main__':
    multiprocessing.freeze_support()
    sys.exit(main())
