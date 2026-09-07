"""Explicit live model smoke test; not part of the offline pytest suite.

Run with the local application started: .venv/bin/python tests/live_hf_smoke.py
Creates a temporary attached research directory of clearly fictional test records.
"""
import json
import os
import tempfile
import time
from pathlib import Path
import requests

base=os.environ.get('WORKBENCH_URL','http://127.0.0.1:8765')
session=requests.Session()
boot=session.get(base+'/api/bootstrap').json()
session.headers['x-workbench-token']=boot['token']
folder=Path(tempfile.mkdtemp(prefix='workbench-live-hf-'))
response=session.post(base+'/api/roots',json={'path':str(folder)});response.raise_for_status();root=response.json()['id']
source='title,description,content,synthetic\nFictional environmental announcement,Fictional software test,The company reduced carbon emissions through renewable energy.,true\nFictional governance announcement,Fictional software test,The board appointed three independent directors.,true\n'
response=session.post(base+'/api/upload',data={'root':root},files={'file':('fictional_input.csv',source)});response.raise_for_status();ref=response.json()
config={'model':'yiyanghkust/finbert-esg','revision':'f79fefa034aa8a969379e23b755369a94c4cd0d3','columns':['content','title'],'word_limit':150,'batch_size':1,'device':'cpu','prefix':'hf_'}
response=session.post(base+'/api/jobs',json={'tool':'hf','input':ref,'config':config,'destination':{'root':root,'path':'','filename':'verified_finbert.json','format':'json'}});response.raise_for_status();job=response.json()
phases=[]
for _ in range(240):
    status=session.get(base+'/api/jobs/'+job['id']).json()['status']
    signature=(status['state'],status.get('phase'),status['completed'])
    if signature not in phases:phases.append(signature);print(signature,flush=True)
    if status['state'] in ('completed','failed','cancelled'):break
    time.sleep(.5)
assert status['state']=='completed' and status['completed']==2 and status['failed']==0,status
rows=json.loads((folder/'verified_finbert.json').read_text(encoding='utf-8'))
assert all(row['hf_status']=='ok' for row in rows)
assert all(row['hf_model_revision']==config['revision'] for row in rows)
assert rows[0]['hf_input_text']=='The company reduced carbon emissions through renewable energy. Fictional environmental announcement'
assert all(row['hf_label'] in {'Environmental','Social','Governance','None'} for row in rows)
assert all(row['synthetic']=='true' for row in rows)
print(json.dumps({'job':job['id'],'folder':str(folder),'rows':len(rows),'labels':[row['hf_label'] for row in rows],'revision':config['revision'],'phases':phases},indent=2))
