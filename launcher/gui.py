"""The small desktop window students see.

It shows startup progress, opens the workbench once the backend is genuinely
ready, and gives plain-language recovery options when something goes wrong.
"""
from __future__ import annotations

import json
import logging
import queue
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

import tkinter as tk
from tkinter import messagebox, scrolledtext, ttk

from workbench import paths
from workbench.version import DISPLAY_NAME, VERSION

from .service import BackendService

log = logging.getLogger(__name__)
HELP = ('Research Workbench runs entirely on this computer. Your files stay in your research folder, '
        'and your API keys are entered in the workbench itself.')


def reveal(folder):
    """Open a folder in Finder or File Explorer."""
    target = Path(folder)
    target.mkdir(parents=True, exist_ok=True)
    if sys.platform == 'darwin':
        subprocess.Popen(['open', str(target)])
    elif sys.platform.startswith('win'):
        subprocess.Popen(['explorer', str(target)])
    else:
        subprocess.Popen(['xdg-open', str(target)])


class LauncherWindow:
    def __init__(self, instance=None, log_file=None, preferred_port=None):
        self.instance = instance
        self.log_file = Path(log_file) if log_file else None
        self.service = BackendService(preferred=preferred_port or 8765)
        self.events = queue.Queue()
        self.ready = False
        self.opened = False
        self.stopping = False

        self.root = tk.Tk()
        self.root.title(DISPLAY_NAME)
        self.root.minsize(460, 250)
        self.root.protocol('WM_DELETE_WINDOW', self.quit)
        self._build()

    # -- layout ----------------------------------------------------------
    def _build(self):
        frame = ttk.Frame(self.root, padding=18)
        frame.pack(fill='both', expand=True)
        ttk.Label(frame, text=DISPLAY_NAME, font=('TkDefaultFont', 16, 'bold')).pack(anchor='w')
        ttk.Label(frame, text=f'Version {VERSION} · runs on this computer', foreground='#666').pack(anchor='w')

        self.status = tk.StringVar(value='Starting the local service…')
        ttk.Label(frame, textvariable=self.status, wraplength=420, justify='left').pack(anchor='w', pady=(14, 6))
        self.progress = ttk.Progressbar(frame, mode='indeterminate', length=420)
        self.progress.pack(anchor='w', pady=(0, 10))
        self.progress.start(12)

        self.address = tk.StringVar(value='')
        ttk.Label(frame, textvariable=self.address, foreground='#666').pack(anchor='w')

        buttons = ttk.Frame(frame)
        buttons.pack(anchor='w', pady=(16, 0))
        self.open_button = ttk.Button(buttons, text='Open workbench', command=self.open_workbench, state='disabled')
        self.open_button.grid(row=0, column=0, padx=(0, 8))
        ttk.Button(buttons, text='Open research folder', command=self.open_research_folder).grid(row=0, column=1, padx=(0, 8))
        ttk.Button(buttons, text='Troubleshooting', command=self.troubleshooting).grid(row=0, column=2, padx=(0, 8))
        ttk.Button(buttons, text='Quit', command=self.quit).grid(row=0, column=3)

    # -- startup ---------------------------------------------------------
    def start(self):
        threading.Thread(target=self._startup, name='workbench-startup', daemon=True).start()
        self.root.after(120, self._drain)
        self.root.mainloop()

    def _startup(self):
        try:
            url = self.service.start()
            self.events.put(('status', 'Waiting for the local service to answer…'))
            self.events.put(('address', url))
            self.service.wait_until_ready(timeout=180)
            if self.instance:
                self.instance.publish(url)
            self.events.put(('ready', url))
        except BaseException as exc:
            log.exception('Startup failed.')
            self.events.put(('failed', self._explain(exc)))

    def _explain(self, exc):
        if isinstance(exc, TimeoutError):
            return ('The local service did not finish starting. Security software sometimes delays a first launch. '
                    'Quit and open the application again; if it keeps happening, use Troubleshooting to save a report.')
        if isinstance(exc, OSError) and 'port' in str(exc).lower():
            return 'No local network port was available. Close other copies of the workbench and try again.'
        return f'{type(exc).__name__}: {exc}'

    def _drain(self):
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == 'status':
                    self.status.set(value)
                elif kind == 'address':
                    self.address.set(f'Local address: {value}')
                elif kind == 'ready':
                    self._on_ready(value)
                elif kind == 'failed':
                    self._on_failed(value)
        except queue.Empty:
            pass
        if not self.stopping:
            self.root.after(120, self._drain)

    def _on_ready(self, url):
        self.ready = True
        self.progress.stop()
        self.progress.configure(mode='determinate', value=100)
        self.status.set('Ready. The workbench is open in your browser. Keep this window open while you work.')
        self.open_button.configure(state='normal')
        if not self.opened:
            self.opened = True
            webbrowser.open(url)

    def _on_failed(self, message):
        self.progress.stop()
        self.progress.configure(mode='determinate', value=0)
        self.status.set(message)
        messagebox.showerror(DISPLAY_NAME, message, parent=self.root)

    # -- actions ---------------------------------------------------------
    def open_workbench(self):
        if self.ready:
            webbrowser.open(self.service.url)

    def open_research_folder(self):
        folder = paths.default_workspace_dir()
        try:
            settings = json.loads((paths.state_dir() / 'settings.json').read_text(encoding='utf-8'))
            folder = Path(settings.get('research_folder') or folder)
        except (OSError, ValueError):
            pass
        try:
            reveal(folder)
        except OSError as exc:
            messagebox.showerror(DISPLAY_NAME, f'The research folder could not be opened: {exc}', parent=self.root)

    def diagnostics(self):
        """Collect a sanitized report. Never includes keys or research content."""
        report = {'version': VERSION, 'address': self.service.url, 'ready': self.ready, 'locations': paths.describe()}
        try:
            report['health'] = self.service.health()
        except Exception as exc:
            report['health_error'] = f'{type(exc).__name__}: {exc}'
        try:
            import urllib.request
            with urllib.request.urlopen(self.service.url + '/api/diagnostics', timeout=3) as response:
                report['backend'] = json.loads(response.read().decode('utf-8'))
        except Exception as exc:
            report['backend_error'] = f'{type(exc).__name__}: {exc}'
        if self.log_file and self.log_file.exists():
            report['recent_log'] = self.log_file.read_text(encoding='utf-8', errors='replace')[-8000:]
        return report

    def troubleshooting(self):
        window = tk.Toplevel(self.root)
        window.title('Troubleshooting')
        window.minsize(560, 420)
        frame = ttk.Frame(window, padding=14)
        frame.pack(fill='both', expand=True)
        ttk.Label(frame, text=HELP, wraplength=520, justify='left').pack(anchor='w', pady=(0, 10))
        text = scrolledtext.ScrolledText(frame, height=18, wrap='word')
        text.pack(fill='both', expand=True)
        text.insert('1.0', json.dumps(self.diagnostics(), indent=2, default=str))
        text.configure(state='disabled')

        def save():
            target = paths.user_log_dir() / 'diagnostic-report.json'
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(self.diagnostics(), indent=2, default=str), encoding='utf-8')
            messagebox.showinfo('Troubleshooting', f'Saved to {target}', parent=window)
            reveal(target.parent)

        row = ttk.Frame(frame)
        row.pack(anchor='w', pady=(10, 0))
        ttk.Button(row, text='Save report', command=save).grid(row=0, column=0, padx=(0, 8))
        ttk.Button(row, text='Open logs folder', command=lambda: reveal(paths.user_log_dir())).grid(row=0, column=1, padx=(0, 8))
        ttk.Button(row, text='Close', command=window.destroy).grid(row=0, column=2)

    def quit(self):
        if self.stopping:
            return
        self.stopping = True
        self.status.set('Stopping the local service and worker…')
        self.open_button.configure(state='disabled')
        self.root.update_idletasks()
        try:
            self.service.stop()
        except Exception:
            log.exception('Shutdown reported an error.')
        finally:
            if self.instance:
                self.instance.release()
            self.root.destroy()
