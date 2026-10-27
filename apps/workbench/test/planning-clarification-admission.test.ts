import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {beforeEach,afterEach,describe,expect,it} from 'vitest';
import {createInternalId} from '@cimiloop/protocol/v2';
import {writeInstance,openLocalProject,LocalPrePlanClarification} from '@cimiloop/local-app';
import {createIntentProject,planBody} from '../../../tests/fixtures/intent-project.js';
import {startWorkbench,type WorkbenchServer} from '../src/server.js';
describe('default strict planning admission in the existing HTTP paths',()=>{
 let root:string,f:ReturnType<typeof createIntentProject>,server:WorkbenchServer|undefined;
 beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'cimiloop-http-plan-admission-'));f=createIntentProject(root,{databasePath:join(root,'.cimiloop','project.db')});
  writeInstance(join(root,'.cimiloop','instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});});
 afterEach(async()=>{await server?.close();server=undefined;f?.store.close();console.info('Retained D-263 owned HTTP originals: '+root);});
 async function connection(){server=await startWorkbench({projectDir:root});
  const login=await fetch(server.origin+'/api/session',{method:'POST',headers:{Origin:server.origin,'Content-Type':'application/json'},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});
  const cookie=login.headers.get('set-cookie')!.split(';')[0]!,csrf=(await login.json() as {csrf:string}).csrf;
  return async(path:string,body:unknown)=>{const response=await fetch(server!.origin+path,{method:'POST',headers:{Origin:server!.origin,Cookie:cookie,'Content-Type':'application/json','X-CimiLoop-CSRF':csrf},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 }
 it('blocks a direct plan command that bypasses the Human page',async()=>{
  const change=f.create();f.prepareContract(change.id);const current=f.store.getChange(change.id)!,post=await connection(),seq=f.store.asOfEventSequence();
  const result=await post('/api/commands',{command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:'technical_owner',command_type:'SubmitPlanProposal',target:{object_type:'change',id:change.id},expected_revision:current.revision,payload:{base_version_ref:null,body:planBody(change.id,current.contract_ref!)}});
  expect(result).toMatchObject({status:409,body:{code:'EVIDENCE_MISSING'}});expect(f.store.asOfEventSequence()).toBe(seq);expect(f.store.listIntentRecords('plan_proposal',change.id)).toHaveLength(0);
 });
 it('keeps the Human candidate endpoint in strict mode and requires Matt after the actual questions',async()=>{
  const change=f.create();f.prepareContract(change.id);const current=f.store.getChange(change.id)!,local=openLocalProject({projectDir:root});let sessionId:string;
  try{const service=new LocalPrePlanClarification(local),session=service.begin(change.id,{request_id:createInternalId(),target:'plan',requirement:'Actual Human plan clarification',background:'Confirmed contract',constraints:['Original identity']}).session;sessionId=session.id;
   const question={request_id:createInternalId(),expected_head:0,kind:'question',text:'What proves A1?'};service.advance(change.id,session.id,question);service.advance(change.id,session.id,{request_id:createInternalId(),expected_head:1,kind:'answer',question_id:question.request_id,text:'Independent original test evidence'});
  }finally{local.store.close();}
  const post=await connection(),seq=f.store.asOfEventSequence(),request={request_id:createInternalId(),expected_head:2,kind:'plan_candidate',requested_at:new Date().toISOString(),body:planBody(change.id,current.contract_ref!)};
  const result=await post('/api/changes/'+change.id+'/clarifications/'+sessionId,request);
  expect(result).toMatchObject({status:409,body:{command_result:{code:'CAPABILITY_UNAVAILABLE'},session:{pending:true,submitted:false}}});
  const replay=await post('/api/changes/'+change.id+'/clarifications/'+sessionId,request);expect(replay).toMatchObject({status:409,body:{session:{pending:true,submitted:false,pending_request:request},command_result:{code:'CAPABILITY_UNAVAILABLE',correlation_id:request.request_id}}});expect(f.store.asOfEventSequence()).toBe(seq);expect(f.store.listIntentRecords('plan_proposal',change.id)).toHaveLength(0);
 });
});
