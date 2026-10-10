import json
import time
from pathlib import Path
from types import SimpleNamespace
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from workbench.api import create_app
from workbench.files import read_dataset, save_dataset, digest
from workbench.configuration import news_query, domains, text_input, validate_schema, validate_config, templates
from workbench.jobs import Context, JobManager, run_job
from workbench.processors import hf_process, llm_process, news_process

@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path/'state', tmp_path/'research', start_worker=False)
    with TestClient(app) as client:
        b=client.get('/api/bootstrap').json()
        client.headers['x-workbench-token']=b['token']
        client.root=b['roots'][0]['id']; client.workspace=app.state.workspace; client.manager=app.state.jobs
        yield client

def upload(c, name='input.csv', data='title,description,content\nHeadline,Lead,Article text\nSecond,Other,More text\n'):
    r=c.post('/api/upload', data={'root':c.root},files={'file':(name,data)})
    assert r.status_code==200, r.text
    return r.json()

def dest(c,name='result.json'):
    return {'root':c.root,'path':'','filename':name,'format':Path(name).suffix[1:]}

def context(tmp_path,keys=None):
    folder=tmp_path/'job';folder.mkdir(parents=True)
    (folder/'status.json').write_text(json.dumps({'state':'running','completed':0}),encoding='utf-8')
    return Context(folder,keys or {})

def test_explorer_upload_pagination_rename_save_as_and_conflicts(client):
    ref=upload(client)
    p=client.get('/api/preview',params={**ref,'offset':1,'limit':1}).json()
    assert p['total']==2 and p['rows'][0]['title']=='Second'
    assert client.post('/api/upload',data={'root':client.root},files={'file':('input.csv','x\n1')}).status_code==400
    renamed=client.post('/api/rename',json={'file':ref,'name':'new.csv'}).json()
    assert client.get('/api/download',params=renamed).text.startswith('title,')
    assert client.post('/api/folders',json={'root':client.root,'path':'presets'}).status_code==200
    cfg={'root':client.root,'path':'presets/instructions.md'}
    v=client.post('/api/text',json={'file':cfg,'content':'Instructions'}).json()
    assert client.post('/api/text',json={'file':cfg,'content':'Edited','overwrite':True,'expected_hash':v['hash']}).status_code==200
    assert client.post('/api/text',json={'file':cfg,'content':'Stale','overwrite':True,'expected_hash':v['hash']}).status_code==400
    assert client.post('/api/text',json={'file':renamed,'content':'Changed','overwrite':True}).status_code==400

@pytest.mark.parametrize('path',['../state/roots.json','.env','/tmp/a.csv','C:\\\\Windows\\\\system.ini','sub/../../secret.json'])
def test_paths_confined(client,path):
    assert client.get('/api/preview',params={'root':client.root,'path':path}).status_code==400

def test_symlink_escape_blocked(client,tmp_path):
    target=tmp_path/'outside.csv';target.write_text('x\nprivate',encoding='utf-8')
    root=Path(client.workspace.roots[client.root])
    try:
        (root/'escape.csv').symlink_to(target)
    except (OSError,NotImplementedError):
        pytest.skip('This account cannot create symbolic links; Windows needs Developer Mode.')
    assert client.get('/api/preview',params={'root':client.root,'path':'escape.csv'}).status_code==400

def test_origin_and_token_protection(client):
    assert client.post('/api/folders',json={'root':client.root,'path':'bad'},headers={'origin':'https://evil.example'}).status_code==403
    assert client.post('/api/folders',json={'root':client.root,'path':'bad'},headers={'x-workbench-token':'bad'}).status_code==403

def test_attach_detach_preserves_files(client,tmp_path):
    extra=tmp_path/'extra';extra.mkdir();(extra/'data.csv').write_text('x\n1',encoding='utf-8')
    root=client.post('/api/roots',json={'path':str(extra)}).json()
    assert client.post('/api/roots/detach',json={'root':root['id']}).status_code==200
    assert (extra/'data.csv').exists()
    assert client.post('/api/roots/detach',json={'root':client.root}).status_code==400

def test_queries_and_domains():
    assert news_query('Microsoft','layoffs OR "new hiring"')=='"Microsoft" AND (layoffs OR "new hiring")'
    assert domains(['https://www.reuters.com/news','reuters.com','ft.com'])==['reuters.com','ft.com']
    for company, query in [('', 'hiring'),('Microsoft',''),('X','x'*500)]:
        with pytest.raises(ValueError):news_query(company,query)

def test_ordered_actual_text_and_budget():
    row={'title':'one two','description':'three four','content':'five six'}
    assert text_input(row,['content','title'],3)['text']=='five six one'
    assert text_input(row,['title','content'],3)['text']=='one two five'
    assert text_input(row,['title','description','content'],3)['word_truncated']

@pytest.mark.parametrize('kind',['string','number','integer','boolean'])
def test_nested_nullable_types(kind):
    child={'type':['object','null'],'properties':{'value':{'type':[kind,'null']}},'required':['value'],'additionalProperties':False}
    schema={'type':'object','properties':{'items':{'type':'array','items':child}},'required':['items'],'additionalProperties':False}
    assert validate_schema(schema)==schema

@pytest.mark.parametrize('change',[{'additionalProperties':True},{'required':[]},{'patternProperties':{}}])
def test_invalid_schema_rejected(change):
    schema={**templates()['blank']['schema'],**change}
    with pytest.raises(ValueError):validate_schema(schema)

def test_esg_schema_isolation_and_prefix_protection():
    validate_schema(templates()['esg']['schema'],templates()['esg']['enums'])
    df=pd.DataFrame([{'body':'An independently uploaded article'}])
    cfg={'columns':['body'],'prefix':'x_','model':'test','instructions':'Custom','schema':templates()['blank']['schema'],'preset':'custom'}
    assert validate_config('llm',cfg,df)['preset']=='custom'
    with pytest.raises(ValueError):validate_config('llm',{**cfg,'preset':'esg'},df)
    with pytest.raises(ValueError):validate_config('llm',{**cfg,'prefix':'bo'},df)

def test_invalid_json_draft_remains_editable(client):
    ref=upload(client,'draft.json','{"broken":')
    p=client.get('/api/preview',params=ref).json()
    assert p['kind']=='text'
    assert client.post('/api/text',json={'file':ref,'content':'{}','overwrite':True,'expected_hash':p['hash']}).status_code==200

def test_job_snapshot_cancel_resume_output_conflict(client):
    ref=upload(client)
    request={'tool':'clean','input':ref,'config':{'columns':['title'],'normalize':True},'destination':dest(client)}
    job=client.post('/api/jobs',json=request).json();folder=client.manager.folder(job['id'])
    client.workspace.resolve(ref).write_text('title\nChanged after submission\n',encoding='utf-8')
    assert 'Headline' in (folder/'input.csv').read_text(encoding='utf-8')
    assert client.post('/api/jobs',json=request).status_code==400
    assert client.post(f'/api/jobs/{job["id"]}/cancel').json()['state']=='cancelled'
    assert client.post(f'/api/jobs/{job["id"]}/resume',json={}).json()['state']=='queued'
    run_job(folder,{})
    status=Context(folder,{}).status
    assert status['state']=='completed',status
    assert read_dataset(client.workspace.resolve(status['output'])).iloc[0]['title']=='Headline'
    assert client.post('/api/jobs',json=request).status_code==400
    assert client.get(f'/api/jobs/{job["id"]}/checkpoint').status_code==200

def test_restart_requires_explicit_resume(client):
    ref=upload(client)
    j=client.post('/api/jobs',json={'tool':'clean','input':ref,'config':{},'destination':dest(client)}).json()
    manager=JobManager(client.workspace,{},start=False)
    assert manager.list()[0]['state']=='interrupted'
    assert manager.resume(j['id'])['state']=='queued'

def test_changed_output_preserved(client):
    ref=upload(client);target=client.workspace.resolve({'root':client.root,'path':'result.json'})
    target.write_text('[]',encoding='utf-8')
    j=client.post('/api/jobs',json={'tool':'clean','input':ref,'config':{},'destination':{**dest(client),'overwrite':True}}).json()
    target.write_text('[{"modified":true}]',encoding='utf-8')
    run_job(client.manager.folder(j['id']),{})
    assert Context(client.manager.folder(j['id']),{}).status['state']=='failed'
    assert json.loads(target.read_text(encoding='utf-8'))==[{'modified':True}]

@pytest.mark.parametrize('labels',[['Environmental','Social','Governance','None'],['positive','negative','neutral']])
def test_hf_native_labels_without_history(tmp_path,monkeypatch,labels):
    class Tokenizer:
        model_max_length=5
        def __call__(self,text,**kw):return {'input_ids':list(range(len(text.split())+2))[:kw.get('max_length',999)]}
        def decode(self,ids,**kw):return 'effective token input'
    class Classifier:
        tokenizer=Tokenizer();model=SimpleNamespace(config=SimpleNamespace(max_position_embeddings=5))
        def __call__(self,texts,**kw):return [[{'label':s,'score':.9 if i==0 else .05} for i,s in enumerate(labels)] for _ in texts]
    monkeypatch.setattr('workbench.processors.load_classifier',lambda c:(Classifier(),'commit123'))
    df=pd.DataFrame([{'body':'one two three four five six'},{'body':''}]);ctx=context(tmp_path)
    result=hf_process(ctx,df,{'columns':['body'],'model':'repo/model','prefix':'hf_','word_limit':150,'batch_size':2})
    assert result.iloc[0]['hf_label']==labels[0]
    assert result.iloc[0]['hf_token_truncated']
    assert result.iloc[1]['hf_status']=='failed'
    assert result['body'].tolist()==df['body'].tolist()

def test_llm_nested_output_retry_only_failed_rows(tmp_path,monkeypatch):
    responses=iter(['{"summary":"first"}','invalid json','{"summary":"second"}']);calls=[]
    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(status='completed',output_text=next(responses),id='resp1',model='actual-model',usage=None)
    monkeypatch.setattr('openai.OpenAI',lambda **kw:SimpleNamespace(responses=SimpleNamespace(create=create)))
    ctx=context(tmp_path,{'openai':'fake-test-key'})
    cfg={**templates()['blank'],'columns':['body'],'model':'test-model','prefix':'custom_','word_limit':150}
    df=pd.DataFrame([{'body':'First standalone article'},{'body':'Second standalone article'}])
    result=llm_process(ctx,df,cfg)
    assert result.custom_status.tolist()==['ok','failed']
    result=llm_process(ctx,df,cfg)
    assert result.custom_status.tolist()==['ok','ok'] and len(calls)==3
    assert calls[0]['text']['format']['schema']==cfg['schema']
    assert 'FinBERT' not in calls[0]['input']
    path=tmp_path/'nested.json';save_dataset(result,path)
    assert json.loads(path.read_text(encoding='utf-8'))[0]['custom_result']=={'summary':'first'}
    path=tmp_path/'nested.csv';save_dataset(result,path)
    assert json.loads(read_dataset(path).iloc[0].custom_result)=={'summary':'first'}

def test_news_partial_pages_retained_and_domains_only(tmp_path,monkeypatch):
    calls=[]
    def get(url,**kw):
        calls.append(kw)
        if len(calls)==2:return SimpleNamespace(status_code=429,json=lambda:{'code':'rateLimited'})
        return SimpleNamespace(status_code=200,json=lambda:{'status':'ok','totalResults':101,'articles':[{'title':str(i)} for i in range(100)]})
    monkeypatch.setattr('workbench.processors.requests.get',get)
    ctx=context(tmp_path,{'news':'fake'})
    with pytest.raises(ValueError,match='limiting requests'):news_process(ctx,{'company':'Acme','combined_query':'"Acme" AND (anything)','domains':['reuters.com'],'max_results':101})
    assert len(ctx.rows)==100 and ctx.status['next_page']==2
    assert calls[0]['params']['domains']=='reuters.com' and 'sources' not in calls[0]['params']

def test_news_plan_limit_finishes_with_retrieved_articles(tmp_path,monkeypatch):
    calls=[]
    def get(url,**kw):
        calls.append(kw)
        if len(calls)==2:return SimpleNamespace(status_code=426,json=lambda:{'status':'error','code':'maximumResultsReached','message':'Developer accounts are limited to 100 results.'})
        return SimpleNamespace(status_code=200,json=lambda:{'status':'ok','totalResults':500,'articles':[{'title':str(i)} for i in range(100)]})
    monkeypatch.setattr('workbench.processors.requests.get',get)
    ctx=context(tmp_path,{'news':'fake'})
    result=news_process(ctx,{'company':'Acme','combined_query':'"Acme" AND (x)','max_results':500})
    assert len(result)==100 and ctx.status['plan_limit_reached'] and ctx.status['total']==100

def test_news_errors_explain_what_to_do(tmp_path,monkeypatch):
    monkeypatch.setattr('workbench.processors.requests.get',lambda url,**kw:SimpleNamespace(status_code=401,json=lambda:{'status':'error','code':'apiKeyInvalid','message':'Your API key is invalid or incorrect.'}))
    with pytest.raises(ValueError,match='Check your NewsAPI key under Connections. NewsAPI says: Your API key is invalid'):
        news_process(context(tmp_path/'a',{'news':'fake'}),{'company':'Acme','combined_query':'"Acme" AND (x)'})
    monkeypatch.setattr('workbench.processors.requests.get',lambda url,**kw:SimpleNamespace(status_code=426,json=lambda:{'status':'error','code':'maximumResultsReached'}))
    with pytest.raises(ValueError,match='at most 100 articles'):
        news_process(context(tmp_path/'b',{'news':'fake'}),{'company':'Acme','combined_query':'"Acme" AND (x)'})

def test_provider_errors_are_plain_and_never_echo_details():
    from workbench.processors import safe_error
    assert 'no longer exists' in safe_error(FileNotFoundError(2, 'No such file', '/Users/x/secret.csv'))
    class APIError(Exception):
        def __init__(self,status):super().__init__('Bearer sk-secret leaked');self.status_code=status
    assert safe_error(APIError(401)).startswith('The API key was rejected')
    assert 'Rate limit' in safe_error(APIError(429)) and 'temporarily unavailable' in safe_error(APIError(503))
    class APIConnectionError(Exception):pass
    assert 'internet connection' in safe_error(APIConnectionError('sk-secret'))
    assert all('sk-secret' not in safe_error(e) for e in (APIError(400),APIError(401),APIConnectionError('sk-secret')))

def test_browse_folders_by_clicking(client,tmp_path,monkeypatch):
    monkeypatch.setattr(Path,'home',classmethod(lambda cls:tmp_path))
    (tmp_path/'Documents'/'Research').mkdir(parents=True);(tmp_path/'.hidden').mkdir();(tmp_path/'notes.txt').write_text('x')
    home=client.post('/api/browse',json={}).json()
    assert home['path']==str(tmp_path.resolve()) and [f['name'] for f in home['folders']]==['Documents','research','state']
    assert {'name':'Documents','path':str(tmp_path/'Documents')} in home['shortcuts']
    docs=client.post('/api/browse',json={'path':str(tmp_path/'Documents')}).json()
    assert docs['parent']==str(tmp_path.resolve()) and docs['folders'][0]['name']=='Research'
    made=client.post('/api/browse/folder',json={'path':str(tmp_path/'Documents'),'name':'Class 2026'}).json()
    assert made['path'].endswith('Class 2026') and (tmp_path/'Documents'/'Class 2026').is_dir()
    assert client.post('/api/browse/folder',json={'path':str(tmp_path),'name':'../escape'}).status_code==400
    assert client.post('/api/browse',json={'path':str(tmp_path/'missing')}).status_code==400
    # Browsing needs the session token, like any change.
    assert client.post('/api/browse',json={},headers={'x-workbench-token':'bad'}).status_code==403

def test_chosen_research_folder_becomes_primary_now(client,tmp_path):
    chosen=tmp_path/'chosen'
    r=client.post('/api/research-folder',json={'path':str(chosen),'create':True}).json()
    assert r['roots'][0]['path']==str(chosen.resolve()) and r['locations']['research']==str(chosen.resolve())
    assert client.get('/api/roots').json()[0]['path']==str(chosen.resolve())

def test_delete_files_and_clear_job_history(client):
    ref=upload(client)
    assert client.post('/api/delete',json={'file':ref}).json()=={'ok':True}
    assert not client.workspace.resolve(ref).exists()
    client.post('/api/folders',json={'root':client.root,'path':'empty'})
    assert client.post('/api/delete',json={'file':{'root':client.root,'path':'empty'}}).status_code==200
    assert client.post('/api/delete',json={'file':{'root':client.root,'path':''}}).status_code==400
    ref=upload(client)
    done=client.post('/api/jobs',json={'tool':'clean','input':ref,'config':{},'destination':dest(client,'a.csv')}).json()
    queued=client.post('/api/jobs',json={'tool':'clean','input':ref,'config':{},'destination':dest(client,'b.csv')}).json()
    Context(client.manager.folder(done['id']),{}).update(state='completed')
    cleared=client.post('/api/jobs/clear',json={}).json()
    assert cleared['removed']==1 and [j['id'] for j in cleared['jobs']]==[queued['id']]

def test_real_spawned_worker_queue(tmp_path):
    app=create_app(tmp_path/'state',tmp_path/'research',start_worker=True)
    with TestClient(app) as c:
        b=c.get('/api/bootstrap').json();c.headers['x-workbench-token']=b['token'];c.root=b['roots'][0]['id']
        ref=upload(c)
        jobs=[c.post('/api/jobs',json={'tool':'clean','input':ref,'config':{},'destination':dest(c,f'out{i}.csv')}).json() for i in range(2)]
        deadline=time.time()+20
        while time.time()<deadline:
            states=c.get('/api/jobs').json()
            if all(j['state']=='completed' for j in states):break
            time.sleep(.15)
        assert len(states)==2 and all(j['state']=='completed' for j in states),states
        assert all(j['completed']==2 for j in states)

@pytest.mark.parametrize('extension',['CSV','JSON'])
def test_uppercase_dataset_extensions_stay_read_only(client,tmp_path,extension):
    data='body\nArticle\n' if extension=='CSV' else '[{"body":"Article"}]'
    ref=upload(client,'input.'+extension,data)
    preview=client.get('/api/preview',params=ref).json()
    assert preview['kind']=='dataset' and preview['total']==1
    assert client.post('/api/text',json={'file':ref,'content':'changed','overwrite':True,'expected_hash':preview['hash']}).status_code==400
    target=tmp_path/('output.'+extension)
    save_dataset(pd.DataFrame([{'body':'Article'}]),target)
    assert read_dataset(target).iloc[0]['body']=='Article'

def test_news_resume_uses_checkpoint_page_not_stale_status(tmp_path,monkeypatch):
    ctx=context(tmp_path,{'news':'fake'})
    ctx.rows=[{'title':str(i),'newsapi_page':1} for i in range(100)]
    ctx.status['next_page']=1
    def get(url,**kwargs):
        assert kwargs['params']['page']==2
        return SimpleNamespace(status_code=200,json=lambda:{'status':'ok','totalResults':101,'articles':[{'title':'last'}]})
    monkeypatch.setattr('workbench.processors.requests.get',get)
    result=news_process(ctx,{'company':'Acme','combined_query':'"Acme" AND (anything)','max_results':101})
    assert len(result)==101 and result.iloc[-1]['newsapi_page']==2

def test_cancel_before_worker_starts_does_not_process(client):
    ref=upload(client)
    job=client.manager.submit({'tool':'clean','input':ref,'config':{},'destination':dest(client)})
    folder=client.manager.folder(job['id']);(folder/'cancel').touch()
    run_job(folder,{})
    assert Context(folder,{}).status['state']=='cancelled'
    assert not client.workspace.resolve(job['output']).exists()

def test_llm_cancellation_keeps_completed_rows_for_resume(tmp_path,monkeypatch):
    ctx=context(tmp_path,{'openai':'fake'})
    calls=[]
    def create(**kwargs):
        calls.append(kwargs)
        if len(calls)==1:(ctx.folder/'cancel').touch()
        return SimpleNamespace(status='completed',output_text='{"summary":"done"}',id='test',model='test',usage=None)
    monkeypatch.setattr('openai.OpenAI',lambda **kw:SimpleNamespace(responses=SimpleNamespace(create=create)))
    cfg={**templates()['blank'],'columns':['body'],'model':'test','prefix':'llm_'}
    df=pd.DataFrame([{'body':'first'},{'body':'second'}])
    result=llm_process(ctx,df,cfg)
    assert result.llm_status.tolist()==['ok','pending'] and len(calls)==1
    (ctx.folder/'cancel').unlink()
    result=llm_process(ctx,df,cfg)
    assert result.llm_status.tolist()==['ok','ok'] and len(calls)==2

def test_two_backends_never_run_the_same_job(client):
    ref=upload(client)
    job=client.post('/api/jobs',json={'tool':'clean','input':ref,'config':{},'destination':dest(client,'once.csv')}).json()
    other=JobManager(client.workspace,{},start=False)
    assert client.manager._claim(job['id']) and not other._claim(job['id'])
    Context(client.manager.folder(job['id']),{}).update(state='failed')
    client.manager.resume(job['id'])
    assert other._claim(job['id'])  # Resuming releases the claim for one new run.

def test_second_start_reopens_the_running_workbench(monkeypatch,capsys):
    import workbench.__main__ as entry
    from launcher.instance import SingleInstance
    opened=[]
    monkeypatch.setattr(entry.webbrowser,'open',opened.append)
    monkeypatch.setattr('launcher.service.BackendService.start',lambda self:pytest.fail('a second backend was started'))
    with SingleInstance() as running:
        running.publish('http://127.0.0.1:8765')
        assert entry.main([])==0
    assert opened==['http://127.0.0.1:8765'] and 'already running' in capsys.readouterr().out

def test_saving_keys_checks_them_first(client,monkeypatch):
    results={'good-key-123456':'ok','typo-key-123456':'rejected','offline-key-1234':'unchecked'}
    monkeypatch.setattr('workbench.api.check_key',lambda name,value:{'state':results[value],'message':results[value]})
    r=client.post('/api/connections',json={'openai':'  good-key-123456\n','news':'typo-key-123456'}).json()
    assert r['checks']['openai']['state']=='ok' and r['checks']['news']['state']=='rejected'
    assert r['connections']=={'news':False,'openai':True} and r['hints']['openai']=='…3456'
    assert 'good-key' not in json.dumps(r)  # Only the last four characters are ever returned.
    # A rejected replacement never overwrites a working key.
    r=client.post('/api/connections',json={'openai':'typo-key-123456'}).json()
    assert r['connections']['openai'] and r['hints']['openai']=='…3456'
    r=client.post('/api/connections',json={'news':'offline-key-1234'}).json()
    assert r['checks']['news']['state']=='unchecked' and r['connections']['news']
    assert client.post('/api/connections/check',json={'name':'openai'}).json()['checks']['openai']['state']=='ok'

def test_key_checks_read_provider_answers(monkeypatch):
    from workbench.credentials import check_key
    answers={'ok':{'status':'ok','sources':[]},'bad':{'status':'error','code':'apiKeyInvalid'},'used':{'status':'error','code':'apiKeyExhausted'}}
    monkeypatch.setattr('requests.get',lambda url,headers,timeout:SimpleNamespace(status_code=200,json=lambda:answers[headers['X-Api-Key']]))
    assert [check_key('news',k)['state'] for k in ('ok','bad','used')]==['ok','rejected','ok']
    import openai
    class Rejecting:
        def __init__(self,**kw):
            error=Exception('Incorrect API key provided: sk-abc');error.status_code=401
            self.models=SimpleNamespace(list=lambda:(_ for _ in ()).throw(error))
    monkeypatch.setattr(openai,'OpenAI',Rejecting)
    result=check_key('openai','sk-abc')
    assert result['state']=='rejected' and 'sk-abc' not in result['message']
