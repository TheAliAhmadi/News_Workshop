import copy
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from workbench.api import create_app
from workbench.configuration import validate_config
from workbench.designer import DesignRequest, decode_design, generate_design, RESPONSE_SCHEMA
from workbench.processors import llm_process
from test_workbench import context


def envelope():
    schema = {'type':'object','properties':{
        'product_name':{'type':['string','null']},
        'category':{'type':['string','null'],'enum':['hardware','software',None]},
        'features':{'type':'array','items':{'type':'object','properties':{'name':{'type':'string'},'confirmed':{'type':'boolean'}},'required':['name','confirmed'],'additionalProperties':False}},
    },'required':['product_name','category','features'],'additionalProperties':False}
    return {'kind':'design','message':'Extract product announcements. Categories distinguish hardware from software; unknown names are null.',
            'design':{'instructions':'Extract product announcements from the supplied record only. Use null when unknown.',
                      'named_enums':[{'name':'announcement_category','values':['hardware','software']}], 'schema_json':json.dumps(schema)}}


def fake_provider(monkeypatch, responses):
    calls=[]
    iterator=iter(responses)
    def create(**kwargs):
        calls.append(copy.deepcopy(kwargs))
        value=next(iterator)
        if isinstance(value,Exception):raise value
        return SimpleNamespace(status=value.get('status','completed'),output_text=value.get('raw',json.dumps(value)),model='actual-design-model',id='design-response')
    client=MagicMock();client.__enter__.return_value=client;client.responses.create.side_effect=create
    monkeypatch.setattr('workbench.designer.OpenAI',lambda **kwargs:client)
    return calls


@pytest.fixture
def api_client(tmp_path):
    app=create_app(tmp_path/'state',tmp_path/'research',start_worker=False)
    with TestClient(app) as c:
        boot=c.get('/api/bootstrap').json();c.headers['x-workbench-token']=boot['token']
        c.post('/api/connections',json={'openai':'test-only'})
        yield c


def test_independent_endpoint_returns_valid_custom_design(api_client,monkeypatch):
    calls=fake_provider(monkeypatch,[envelope()])
    response=api_client.post('/api/extraction-design',json={'model':'design-model','message':'Extract product announcements'})
    assert response.status_code==200,response.text
    design=response.json()['design']
    assert design['preset']=='custom' and design['enums']=={'announcement_category':['hardware','software']}
    assert design['schema']['properties']['features']['items']['properties']['confirmed']['type']=='boolean'
    assert api_client.get('/api/jobs').json()==[]
    assert calls[0]['store'] is False and calls[0]['text']['format']['schema']==RESPONSE_SCHEMA
    assert json.loads(calls[0]['input'][0]['content'])['current_design'] is None
    assert 'esg_relevant' not in calls[0]['input'][0]['content']


def test_new_mode_ignores_old_design_and_refine_uses_latest_manual_edit(monkeypatch):
    calls=fake_provider(monkeypatch,[envelope(),envelope()])
    old={'instructions':'ESG old prompt','schema':{'esg_relevant':True},'enums':{},'input':'NEVER FORWARD FILES'}
    generate_design(DesignRequest(model='chosen',message='Products',current_design=old), 'fake')
    current=decode_design(json.dumps(envelope()))['design'];current['instructions']='Manual edit wins'
    generate_design(DesignRequest(model='override',message='Keep my edits',mode='refine',current_design=current,
        history=[{'role':'assistant','content':'Older instructions'}]),'fake')
    assert 'ESG old prompt' not in calls[0]['input'][0]['content']
    payload=json.loads(calls[1]['input'][0]['content'])
    assert payload['current_design']['instructions']=='Manual edit wins'
    assert calls[1]['model']=='override' and set(payload['current_design'])=={'instructions','schema','enums'}


@pytest.mark.parametrize('keyword',['additionalProperties','$schema'])
def test_invalid_schema_repaired_once(monkeypatch,keyword):
    bad=envelope();schema=json.loads(bad['design']['schema_json']);schema[keyword]=True if keyword=='additionalProperties' else 'https://json-schema.org/draft/2020-12/schema';bad['design']['schema_json']=json.dumps(schema)
    calls=fake_provider(monkeypatch,[bad,envelope()])
    result=generate_design(DesignRequest(model='chosen',message='Products'),'fake')
    assert result['kind']=='design' and len(calls)==2
    assert keyword in calls[1]['input'][-1]['content']


@pytest.mark.parametrize('fault',['enum_mismatch','unused_list','duplicate_list','duplicate_values','unsupported_schema'])
def test_invalid_generated_design_never_applied(monkeypatch,fault):
    bad=envelope()
    if fault=='enum_mismatch':bad['design']['named_enums'][0]['values']=['new']
    if fault=='unused_list':bad['design']['named_enums'].append({'name':'unused','values':['unused']})
    if fault=='duplicate_list':bad['design']['named_enums']*=2
    if fault=='duplicate_values':bad['design']['named_enums'][0]['values']=['hardware','hardware']
    if fault=='unsupported_schema':
        schema=json.loads(bad['design']['schema_json']);schema['properties']['product_name']['format']='date';bad['design']['schema_json']=json.dumps(schema)
    calls=fake_provider(monkeypatch,[bad,bad])
    with pytest.raises(ValueError,match='after one repair attempt'):
        generate_design(DesignRequest(model='chosen',message='Products'),'fake')
    assert len(calls)==2


def test_clarification_returns_no_design(monkeypatch):
    calls=fake_provider(monkeypatch,[{'kind':'clarification','message':'What information would you like to extract?','design':None}])
    result=generate_design(DesignRequest(model='chosen',message='Help'),'fake')
    assert result['design'] is None and len(calls)==1


@pytest.mark.parametrize('response',[{'status':'incomplete','raw':''},{'raw':''},TimeoutError('private provider detail')])
def test_provider_failure_does_not_trigger_repair(monkeypatch,response):
    calls=fake_provider(monkeypatch,[response])
    with pytest.raises(ValueError) as error:generate_design(DesignRequest(model='chosen',message='Products'),'fake')
    assert len(calls)==1 and 'private provider detail' not in str(error.value)


def test_missing_credentials_and_dataset_fields_rejected(api_client,monkeypatch):
    # A blank field keeps the current key; removal is explicit.
    assert api_client.post('/api/connections',json={'openai':''}).json()['connections']['openai']
    assert not api_client.post('/api/connections',json={'remove':['openai']}).json()['connections']['openai']
    r=api_client.post('/api/extraction-design',json={'model':'m','message':'Products'})
    assert r.status_code==400 and 'Connections' in r.text
    r=api_client.post('/api/extraction-design',json={'model':'m','message':'Products','input':{'path':'data.csv'}})
    assert r.status_code==422
    assert api_client.post('/api/extraction-design',json={'model':'m','message':'Products'},headers={'x-workbench-token':'bad'}).status_code==403


def test_generated_design_runs_one_row_custom_extraction(tmp_path,monkeypatch):
    design=decode_design(json.dumps(envelope()))['design']
    output={'product_name':'Example','category':'software','features':[{'name':'offline mode','confirmed':True}]}
    create=MagicMock(return_value=SimpleNamespace(status='completed',output_text=json.dumps(output),id='one-row',model='extract-model',usage=None))
    monkeypatch.setattr('openai.OpenAI',lambda **kwargs:SimpleNamespace(responses=SimpleNamespace(create=create)))
    df=pd.DataFrame([{'body':'Example is a software product with offline mode.'},{'body':'Excluded by one-row test.'}])
    config=validate_config('llm',{**design,'columns':['body'],'model':'extract-model','prefix':'custom_','row_limit':1},df)
    result=llm_process(context(tmp_path,{'openai':'fake'}),df,config)
    assert result.iloc[0]['custom_result']==output and result.iloc[0]['custom_status']=='ok'
    assert result.iloc[1]['custom_status']=='filtered_or_limited' and create.call_count==1
    assert create.call_args.kwargs['text']['format']['schema']==design['schema']
