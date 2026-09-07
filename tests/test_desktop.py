"""Desktop packaging behaviour: platform paths, credentials, user storage, and the launcher."""
import json
import os
import socket
import sys
from pathlib import Path

import pytest

from launcher.instance import AlreadyRunning, SingleInstance
from launcher.service import reserve_port
from workbench import paths
from workbench.credentials import CredentialStore
from workbench.preferences import UserStore
from workbench.version import VERSION, platform_key


# -- platform locations ------------------------------------------------------

def test_source_run_keeps_repository_locations(monkeypatch):
    for name in ('WORKBENCH_STATE_DIR', 'WORKBENCH_WORKSPACE_DIR', 'WORKBENCH_MODEL_CACHE'):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv('WORKBENCH_PACKAGED', '0')
    assert paths.state_dir() == paths.resource_dir() / '.workbench'
    assert paths.default_workspace_dir() == paths.resource_dir() / 'research_workspace'
    assert paths.model_cache_dir() == paths.resource_dir() / '.cache' / 'huggingface'


def test_installed_run_uses_per_user_locations(monkeypatch):
    for name in ('WORKBENCH_STATE_DIR', 'WORKBENCH_WORKSPACE_DIR', 'WORKBENCH_MODEL_CACHE'):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv('WORKBENCH_PACKAGED', '1')
    application = paths.resource_dir()
    # Nothing writable may live inside the installed application directory.
    for location in (paths.state_dir(), paths.default_workspace_dir(), paths.model_cache_dir()):
        assert not location.is_relative_to(application), location
        assert location.is_relative_to(paths.home()), location
    assert paths.default_workspace_dir() == paths.home() / 'ResearchWorkbench'


def test_environment_overrides_win(monkeypatch, tmp_path):
    monkeypatch.setenv('WORKBENCH_STATE_DIR', str(tmp_path / 'state'))
    monkeypatch.setenv('WORKBENCH_MODEL_CACHE', str(tmp_path / 'models'))
    monkeypatch.setenv('WORKBENCH_PACKAGED', '1')
    assert paths.state_dir() == tmp_path / 'state'
    assert paths.model_cache_dir() == tmp_path / 'models'


def test_release_asset_name_matches_this_platform():
    key = platform_key()
    assert key.startswith(('macOS-', 'Windows-', 'Linux-'))
    assert f'ResearchWorkbench-{VERSION}-{key}'.count(' ') == 0


# -- credentials -------------------------------------------------------------

class FakeKeyring:
    """Stands in for the macOS Keychain or Windows Credential Manager."""

    def __init__(self, failing=False):
        self.store, self.failing = {}, failing

    def get_password(self, service, account):
        if self.failing:
            raise RuntimeError('locked')
        return self.store.get((service, account))

    def set_password(self, service, account, value):
        if self.failing:
            raise RuntimeError('locked')
        self.store[(service, account)] = value

    def delete_password(self, service, account):
        self.store.pop((service, account), None)


@pytest.fixture
def store(monkeypatch):
    fake = FakeKeyring()
    monkeypatch.setattr('workbench.credentials._backend', lambda: (fake, 'test.Keyring'))
    credentials = CredentialStore()
    credentials.load()
    credentials.backing = fake
    return credentials


def test_remembered_key_returns_after_restart(store, monkeypatch):
    store.apply({'openai': 'student-key'}, remember=True)
    assert store.status()['remembered']['openai'] is True
    monkeypatch.setattr('workbench.credentials._backend', lambda: (store.backing, 'test.Keyring'))
    restarted = CredentialStore()
    restarted.load()
    assert restarted.keys['openai'] == 'student-key'
    assert restarted.status()['connections'] == {'news': False, 'openai': True}


def test_session_only_key_is_not_written(store, monkeypatch):
    store.apply({'openai': 'session-key'}, remember=False)
    assert store.keys['openai'] == 'session-key'
    assert store.status()['remembered']['openai'] is False
    monkeypatch.setattr('workbench.credentials._backend', lambda: (store.backing, 'test.Keyring'))
    restarted = CredentialStore()
    restarted.load()
    assert restarted.keys['openai'] == ''


def test_removing_a_key_clears_both_session_and_storage(store):
    store.apply({'news': 'remembered'}, remember=True)
    store.apply({}, remove=['news'])
    assert store.keys['news'] == '' and store.status()['remembered']['news'] is False
    assert store.backing.store == {}


def test_switching_to_session_only_forgets_the_stored_key(store):
    store.apply({'news': 'first'}, remember=True)
    store.apply({'news': 'second'}, remember=False)
    assert store.backing.store == {}
    assert store.keys['news'] == 'second'


def test_blank_value_keeps_the_current_key(store):
    store.apply({'news': 'kept'}, remember=False)
    store.apply({'news': '   '})
    assert store.keys['news'] == 'kept'


def test_unavailable_storage_keeps_keys_for_the_session_only(monkeypatch):
    # The environment switch is the same path a machine without secure storage takes.
    monkeypatch.setenv('WORKBENCH_SECURE_STORAGE', '0')
    credentials = CredentialStore()
    credentials.load()
    status = credentials.apply({'openai': 'session'}, remember=True)
    assert credentials.keys['openai'] == 'session'
    assert status['connections']['openai'] is True
    assert status['remembered']['openai'] is False
    assert status['secure_storage']['available'] is False
    # The interface has to be able to explain this to the student.
    assert 'session only' in status['secure_storage']['detail']


def test_storage_failure_degrades_instead_of_raising(monkeypatch):
    failing = FakeKeyring(failing=True)
    monkeypatch.setattr('workbench.credentials._backend', lambda: (failing, 'test.Keyring'))
    credentials = CredentialStore()
    credentials.load()
    assert credentials.available is False
    assert credentials.apply({'news': 'value'}, remember=True)['remembered']['news'] is False


def test_status_never_exposes_key_values(store):
    store.apply({'openai': 'secret-value'}, remember=True)
    assert 'secret-value' not in json.dumps(store.status())


# -- user storage ------------------------------------------------------------

def test_preferences_and_sessions_persist(tmp_path):
    user = UserStore(tmp_path)
    user.save_preferences({'llm': {'word_limit': 200}})
    user.save_session('abc123', {'history': [{'role': 'user', 'content': 'design'}]})
    reopened = UserStore(tmp_path)
    assert reopened.preferences()['llm']['word_limit'] == 200
    assert reopened.session('abc123')['history'][0]['content'] == 'design'


def test_damaged_preferences_do_not_block_startup(tmp_path):
    (tmp_path / 'preferences.json').write_text('{not json', encoding='utf-8')
    assert UserStore(tmp_path).preferences() == {}


def test_unknown_workspace_identifier_rejected(tmp_path):
    user = UserStore(tmp_path)
    for bad in ('../escape', 'a' * 65, '', 'has space'):
        with pytest.raises(ValueError):
            user.session(bad)


def test_oversized_preferences_rejected(tmp_path):
    with pytest.raises(ValueError, match='2 MB'):
        UserStore(tmp_path).save_preferences({'llm': {'notes': 'x' * (3 * 1024 * 1024)}})


def test_browser_import_runs_once_and_preserves_later_edits(tmp_path):
    user = UserStore(tmp_path)
    assert user.import_browser_state({'llm': {'instructions': 'from browser'}},
                                     {'abc123': {'history': [{'role': 'user', 'content': 'earlier'}]}})['imported']
    assert user.preferences()['llm']['instructions'] == 'from browser'
    assert user.session('abc123')['history'][0]['content'] == 'earlier'

    user.save_preferences({'llm': {'instructions': 'edited since'}})
    assert not user.import_browser_state({'llm': {'instructions': 'stale browser copy'}}, {})['imported']
    assert user.preferences()['llm']['instructions'] == 'edited since'


def test_settings_round_trip_and_ignore_unknown_keys(tmp_path):
    user = UserStore(tmp_path)
    saved = user.update_settings({'research_folder': str(tmp_path / 'papers'), 'unexpected': 'ignored'})
    assert saved['research_folder'] == str(tmp_path / 'papers')
    assert 'unexpected' not in saved
    assert UserStore(tmp_path).settings()['first_run_complete'] is False


# -- launcher ----------------------------------------------------------------

def test_preferred_port_used_when_free():
    sock, port = reserve_port(preferred=0)
    sock.close()
    sock, chosen = reserve_port(preferred=port)
    try:
        assert chosen == port
    finally:
        sock.close()


def test_occupied_port_falls_back_to_another():
    blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    blocker.bind(('127.0.0.1', 0))
    blocker.listen(1)
    taken = blocker.getsockname()[1]
    try:
        sock, chosen = reserve_port(preferred=taken)
        try:
            assert chosen != taken and chosen > 0
        finally:
            sock.close()
    finally:
        blocker.close()


def test_reserved_port_binds_only_to_loopback():
    sock, port = reserve_port(preferred=0)
    try:
        assert sock.getsockname()[0] == '127.0.0.1'
    finally:
        sock.close()


def test_second_instance_is_refused_and_told_where_to_look(tmp_path):
    lock = tmp_path / 'instance.lock'
    first = SingleInstance(lock).acquire()
    first.publish('http://127.0.0.1:8765')
    try:
        with pytest.raises(AlreadyRunning) as refused:
            SingleInstance(lock).acquire()
        assert refused.value.url == 'http://127.0.0.1:8765'
    finally:
        first.release()
    # Once released, the next launch takes over normally.
    second = SingleInstance(lock).acquire()
    second.release()


def test_instance_lock_lives_beside_the_state_it_protects(monkeypatch, tmp_path):
    monkeypatch.setenv('WORKBENCH_STATE_DIR', str(tmp_path / 'state'))
    assert SingleInstance().path.parent == tmp_path / 'state'


@pytest.mark.skipif(sys.platform == 'win32', reason='POSIX signal handling differs on Windows')
def test_service_starts_stops_and_leaves_no_worker(tmp_path, monkeypatch):
    from launcher.service import BackendService

    monkeypatch.setenv('WORKBENCH_STATE_DIR', str(tmp_path / 'state'))
    monkeypatch.setenv('WORKBENCH_WORKSPACE_DIR', str(tmp_path / 'research'))
    service = BackendService(preferred=0)
    url = service.start()
    try:
        health = service.wait_until_ready(timeout=120)
        assert health['worker_ready'] and health['version'] == VERSION
        assert url.startswith('http://127.0.0.1:')
    finally:
        service.stop()
    assert not service.thread.is_alive()
    assert service.app.state.jobs.process is None or not service.app.state.jobs.process.is_alive()


def test_launcher_reports_its_version(capsys):
    from launcher.main import main
    assert main(['--version']) == 0
    assert capsys.readouterr().out.strip() == VERSION


def test_diagnostics_report_excludes_credentials(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from workbench.api import create_app

    with TestClient(create_app(tmp_path / 'state', tmp_path / 'research', start_worker=False)) as client:
        token = client.get('/api/bootstrap').json()['token']
        client.headers['x-workbench-token'] = token
        client.post('/api/connections', json={'openai': 'secret-value-abc'})
        report = client.get('/api/diagnostics').json()
        assert 'secret-value-abc' not in json.dumps(report)
        assert report['connections']['openai'] is True
        assert report['build']['version'] == VERSION
        assert Path(report['locations']['data']) == tmp_path / 'state'


def test_bootstrap_reports_version_platform_and_storage(tmp_path):
    from fastapi.testclient import TestClient
    from workbench.api import create_app

    with TestClient(create_app(tmp_path / 'state', tmp_path / 'research', start_worker=False)) as client:
        boot = client.get('/api/bootstrap').json()
    assert boot['build']['version'] == VERSION
    assert boot['build']['platform'] == platform_key()
    assert boot['secure_storage']['available'] is False
    assert boot['remembered'] == {'news': False, 'openai': False}
    assert boot['settings']['first_run_complete'] is False
    assert boot['default_classifier']


def test_research_folder_choice_persists_and_survives_a_missing_folder(tmp_path):
    from fastapi.testclient import TestClient
    from workbench.api import create_app

    state, first, chosen = tmp_path / 'state', tmp_path / 'first', tmp_path / 'chosen folder'
    with TestClient(create_app(state, first, start_worker=False)) as client:
        client.headers['x-workbench-token'] = client.get('/api/bootstrap').json()['token']
        response = client.post('/api/research-folder', json={'path': str(chosen), 'create': True})
        assert response.status_code == 200, response.text
        assert chosen.is_dir()

    # A later start uses the chosen folder without being told again.
    with TestClient(create_app(state, None, start_worker=False)) as client:
        boot = client.get('/api/bootstrap').json()
        assert any(Path(root['path']) == chosen for root in boot['roots'])
        assert boot['settings']['research_folder'] == str(chosen)

    # If that folder disappears, the application still opens.
    chosen.rmdir()
    with TestClient(create_app(state, None, start_worker=False)) as client:
        assert client.get('/api/bootstrap').json()['roots']


def test_upgrade_preserves_jobs_settings_and_preferences(tmp_path):
    """An upgrade replaces application files; per-user data must be untouched."""
    from fastapi.testclient import TestClient
    from workbench.api import create_app

    state, research = tmp_path / 'state', tmp_path / 'research'
    with TestClient(create_app(state, research, start_worker=False)) as client:
        client.headers['x-workbench-token'] = client.get('/api/bootstrap').json()['token']
        root = client.get('/api/roots').json()[0]['id']
        client.post('/api/preferences', json={'tools': {'hf': {'word_limit': 175}}})
        client.post('/api/designer-sessions/' + root, json={'history': [{'role': 'user', 'content': 'kept'}]})
        client.post('/api/upload', data={'root': root}, files={'file': ('data.csv', 'title\nRecord\n')})
        job = client.post('/api/jobs', json={'tool': 'clean', 'input': {'root': root, 'path': 'data.csv'},
                                             'config': {}, 'destination': {'root': root, 'path': '', 'filename': 'out.csv', 'format': 'csv'}}).json()

    # A new application build, same per-user directories.
    with TestClient(create_app(state, research, start_worker=False)) as client:
        client.headers['x-workbench-token'] = client.get('/api/bootstrap').json()['token']
        assert client.get('/api/preferences').json()['tools']['hf']['word_limit'] == 175
        assert client.get('/api/designer-sessions/' + root).json()['history'][0]['content'] == 'kept'
        assert any(j['id'] == job['id'] for j in client.get('/api/jobs').json())
        assert (research / 'data.csv').exists()


def test_paths_with_spaces_and_non_ascii_characters(tmp_path):
    from fastapi.testclient import TestClient
    from workbench.api import create_app

    research = tmp_path / 'Recherche Wörkbench 研究'
    research.mkdir()
    with TestClient(create_app(tmp_path / 'state', research, start_worker=False)) as client:
        boot = client.get('/api/bootstrap').json()
        client.headers['x-workbench-token'] = boot['token']
        root = boot['roots'][0]['id']
        reference = client.post('/api/upload', data={'root': root},
                                files={'file': ('donnée été.csv', 'title\nRésumé économique\n')}).json()
        preview = client.get('/api/preview', params=reference).json()
        assert preview['rows'][0]['title'] == 'Résumé économique'
        assert (research / 'donnée été.csv').read_text(encoding='utf-8').startswith('title')


def test_model_preparation_reports_progress_and_reuses_the_cache(tmp_path, monkeypatch):
    from workbench.models import ModelPreparer

    downloaded = []

    class Sibling:
        def __init__(self, name, size):
            self.rfilename, self.size = name, size

    def model_info(model, revision=None, files_metadata=False):
        return type('Info', (), {'sha': 'commit-abc', 'siblings': [
            Sibling('model.safetensors', 400), Sibling('pytorch_model.bin', 400),
            Sibling('config.json', 10), Sibling('vocab.txt', 20)]})()

    monkeypatch.setattr('huggingface_hub.HfApi', lambda *a, **k: type('Api', (), {'model_info': staticmethod(model_info)})())
    monkeypatch.setattr('huggingface_hub.hf_hub_download', lambda *a, **k: downloaded.append(a[1]) or str(tmp_path / a[1]))
    monkeypatch.setattr('huggingface_hub.try_to_load_from_cache', lambda *a, **k: None)
    monkeypatch.setattr(ModelPreparer, '_verify', lambda self, model, revision: {'0': 'Environmental'})

    preparer = ModelPreparer(cache_dir=tmp_path / 'models')
    preparer.start('example/classifier')
    preparer.thread.join(timeout=30)
    status = preparer.status()
    assert status['state'] == 'completed', status
    assert status['labels'] == {'0': 'Environmental'}
    # One weight format only; downloading both would double the class download.
    assert 'model.safetensors' in downloaded and 'pytorch_model.bin' not in downloaded
    assert status['total'] == 430


def test_model_preparation_surfaces_failures_without_leaking_details(tmp_path, monkeypatch):
    from workbench.models import ModelPreparer

    def explode(*args, **kwargs):
        raise RuntimeError('token=hf_secret_value')

    monkeypatch.setattr('huggingface_hub.HfApi', lambda *a, **k: type('Api', (), {'model_info': staticmethod(explode)})())
    preparer = ModelPreparer(cache_dir=tmp_path / 'models')
    preparer.start('example/classifier')
    preparer.thread.join(timeout=30)
    status = preparer.status()
    assert status['state'] == 'failed'
    assert 'hf_secret_value' not in status['error']


def test_unattended_launcher_error_exits_without_a_dialog(monkeypatch, tmp_path):
    import runpy
    import launcher.main as launcher_main
    monkeypatch.setenv('WORKBENCH_LOG_DIR', str(tmp_path / 'logs'))
    monkeypatch.setattr(sys, 'argv', ['run_workbench.py', '--self-test'])
    def fail():
        raise RuntimeError('simulated missing packaged dependency')
    monkeypatch.setattr(launcher_main, 'main', fail)
    monkeypatch.setattr(launcher_main, '_report_startup_error', lambda *a: pytest.fail('Unattended process opened a dialog'))
    with pytest.raises(SystemExit) as exited:
        runpy.run_path(str(Path(__file__).resolve().parents[1] / 'run_workbench.py'), run_name='__main__')
    assert exited.value.code == 1


def test_self_test_writes_report_without_a_console(monkeypatch, tmp_path):
    import launcher.main as launcher_main
    class Service:
        def __init__(self, **kwargs):
            pass
        def start(self):
            pass
        def stop(self):
            pass
    monkeypatch.setattr('launcher.service.BackendService', Service)
    monkeypatch.setattr(launcher_main, 'attach_streams', lambda *a: None)
    monkeypatch.setattr(launcher_main, 'self_test', lambda *a: {'interface_bundled': True})
    report = tmp_path / 'report.json'
    assert launcher_main.main(['--self-test', '--report-file', str(report)]) == 0
    assert json.loads(report.read_text())['interface_bundled'] is True
