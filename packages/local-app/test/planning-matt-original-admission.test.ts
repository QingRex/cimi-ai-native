import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {createInternalId} from '@cimiloop/protocol/v2';
import * as app from '../src/index.js';
import {createIntentProject,planBody} from '../../../tests/fixtures/intent-project.js';
import {flowSuccess} from '../../../tests/fixtures/flow-project.js';

// Actual Human/Kernel/SQLite; explicitly controlled method and qualification
// ports. These fixtures are not real Matt, model, harness or S1 evidence.
describe('default planning admission consumes original Matt and Human history',()=>{
 let f:ReturnType<typeof createIntentProject>,local:app.LocalProject;
 beforeEach(()=>{const root=mkdtempSync(join(tmpdir(),'cimi-plan-matt-original-'));f=createIntentProject(root,{databasePath:join(root,'.cimiloop','project.db')});
  app.writeInstance(join(root,'.cimiloop','instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});local=app.openLocalProject({projectDir:root});});
 afterEach(()=>{local?.store.close();f?.store.close();});
 async function round(options:{unresolved?:string[];origin?:'external_model'|'public_fixture';review?:boolean;changed?:boolean}={}){
  const change=f.create();f.prepareContract(change.id);const current=f.store.getChange(change.id)!,body=planBody(change.id,current.contract_ref!),contract=f.store.getIntentRecord('contract_version',current.contract_ref!.id)!;
  const originals=new Map<string,app.MattClarificationOriginal>();let calls=0,reads=0,qualifications=0,qualificationAvailable=true;
  const host:app.MattClarificationHost={async invoke(input,guard){guard();calls++;originals.set(input.invocation_key,{format:'cimiloop/pre-plan-matt-original/2.0.0',qualification:'unqualified_method_execution',invocation_key:input.invocation_key,input_digest:input.input_digest,method_name:'grill-me',source_digest:{algorithm:'sha256',value:'a'.repeat(64)},origin:options.origin??'external_model',original_ref:{provider:'PUBLIC_fixture',resource_type:'method_original',locator:input.invocation_key,digest:{algorithm:'sha256',value:'b'.repeat(64)}},output:{purpose:'clarification',questions:[],unresolved:options.unresolved??[]}});},async readOriginal(input){return originals.get(input.invocation_key)??null;},verifyOriginal(input,original){reads++;expect(original).toEqual(originals.get(input.invocation_key));}};
  const service=new app.LocalPrePlanClarification(local,host),session=service.begin(change.id,{request_id:createInternalId(),target:'plan',requirement:'PUBLIC implementation',background:'Actual confirmed contract',constraints:['Keep original identity']}).session;
  const question={request_id:createInternalId(),expected_head:0,kind:'question',text:'How do we verify this Plan?'};service.advance(change.id,session.id,question);
  service.advance(change.id,session.id,{request_id:createInternalId(),expected_head:1,kind:'answer',question_id:question.request_id,text:'Use independent original evidence'});
  const request={request_id:createInternalId(),expected_head:2,kind:'matt',...(options.review===false?{}:{review_plan:{body,contract}})};
  await service.advanceAsync(change.id,session.id,request);
  const Constructor=Reflect.get(app,'LocalMattPlanClarificationVerification');expect(Constructor).toBeTypeOf('function');
  const verifier=new Constructor(local.location.dataDirectory,host,{verifyOriginal(){qualifications++;if(!qualificationAvailable)throw Error('PUBLIC original qualification unavailable');}});
  const withVerifier=Reflect.get(app,'withPlanningClarificationVerification');expect(withVerifier).toBeTypeOf('function');
  const candidate={request_id:createInternalId(),expected_head:3,kind:'plan_candidate',requested_at:new Date().toISOString(),body:options.changed?{...body,approach:'A different plan after Matt review'}:body};
  const run=()=>withVerifier(local,verifier,()=>service.advance(change.id,session.id,candidate));
  return{change,service,session,candidate,run,calls:()=>calls,reads:()=>reads,qualifications:()=>qualifications,host,verifier,withVerifier,body,setQualificationAvailable(value:boolean){qualificationAvailable=value;}};
 }
 it('admits the exact reviewed Plan through the default Kernel port and replays without a second effect',async()=>{
  const x=await round(),before=x.calls(),reads=x.reads(),result=x.run();expect(result.command_result).toHaveProperty('ok',true);expect(x.qualifications()).toBeGreaterThan(0);expect(x.reads()).toBeGreaterThan(reads);
  const events=f.store.asOfEventSequence();expect(x.run()).toEqual(result);expect(x.calls()).toBe(before);expect(f.store.asOfEventSequence()).toBe(events);expect(f.store.listIntentRecords('plan_proposal',x.change.id)).toHaveLength(1);
 });
 it('rechecks original Matt evidence for confirmation and Task creation',async()=>{
  const x=await round(),submitted=flowSuccess(x.run().command_result!);if(submitted.command_type!=='SubmitPlanProposal')throw Error('Wrong proposal');
  const proposal=submitted.data.proposal,requested=flowSuccess(local.kernel.execute(f.changeCommand('RequestDecision',f.store.getChange(x.change.id)!,{action:'confirm_plan',proposal_ref:{object_type:'plan_proposal',id:proposal.id,domain_version:proposal.proposal_revision}},'technical_owner')));
  if(requested.command_type!=='RequestDecision')throw Error('Wrong request');const request=requested.data.request;
  const decided=flowSuccess(local.kernel.execute(f.changeCommand('RecordDecision',f.store.getChange(x.change.id)!,{request_id:request.id,input_digest:request.input_digest,choice:'approve',conditions:[],reason:'PUBLIC actual Human approval'},'technical_owner')));
  if(decided.command_type!=='RecordDecision')throw Error('Wrong decision');const decision=decided.data.decision;
  const confirm=f.changeCommand('ConfirmPlan',f.store.getChange(x.change.id)!,f.confirmPayload(request,decision),'technical_owner');
  const confirmed=x.withVerifier(local,x.verifier,()=>local.kernel.execute(confirm));expect(confirmed).toHaveProperty('ok',true);
  const current=f.store.getChange(x.change.id)!,create=f.changeCommand('InitializePlanTasks',current,{plan_ref:current.plan_ref!},'technical_owner'),before=x.qualifications();
  const initialized=x.withVerifier(local,x.verifier,()=>local.kernel.execute(create));expect(initialized).toHaveProperty('ok',true);expect(x.qualifications()).toBeGreaterThan(before);
  expect(f.store.listExecutionObjects('task',x.change.id)).not.toHaveLength(0);expect(flowSuccess(local.kernel.execute(create))).toEqual(initialized);expect(x.calls()).toBe(1);
 });
 it('retains an unavailable candidate so the exact request can resume after source installation',async()=>{
  const x=await round(),before=f.store.asOfEventSequence(),denied=x.service.advance(x.change.id,x.session.id,x.candidate);
  expect(denied.command_result).toHaveProperty('code','CAPABILITY_UNAVAILABLE');expect(denied.session).toMatchObject({pending:true,submitted:false});expect(f.store.asOfEventSequence()).toBe(before);
  expect(x.run().command_result).toHaveProperty('ok',true);expect(x.calls()).toBe(1);expect(f.store.listIntentRecords('plan_proposal',x.change.id)).toHaveLength(1);
 });
 it('resumes the original candidate after missing qualification originals become readable',async()=>{
  const x=await round();x.setQualificationAvailable(false);const result=x.run();expect(result.command_result).toHaveProperty('code','EVIDENCE_MISSING');expect(result.session).toMatchObject({pending:true,submitted:false});
  x.setQualificationAvailable(true);expect(x.run().command_result).toHaveProperty('ok',true);expect(x.calls()).toBe(1);expect(f.store.listIntentRecords('plan_proposal',x.change.id)).toHaveLength(1);
 });
 it.each([{review:false},{changed:true},{origin:'public_fixture' as const},{unresolved:['Missing actual source fact']}])('refuses incomplete or unrelated original method evidence: %j',async options=>{
  const x=await round(options),events=f.store.asOfEventSequence();expect(x.run().command_result).toHaveProperty('code','EVIDENCE_MISSING');expect(f.store.asOfEventSequence()).toBe(events);expect(f.store.listIntentRecords('plan_proposal',x.change.id)).toHaveLength(0);
 });
 it('does not retain a scoped verifier as default authority for another command',async()=>{
  const x=await round();expect(x.run().command_result).toHaveProperty('ok',true);
  const y=await round();expect(y.service.advance(y.change.id,y.session.id,y.candidate).command_result).toHaveProperty('code','CAPABILITY_UNAVAILABLE');
 });
 it('rejects an asynchronous original verifier without invoking a model or creating a proposal',async()=>{
  const x=await round();x.host.verifyOriginal=async()=>{throw Error('PUBLIC async verification rejection');};
  // A verifier fixes its method at construction; changing the host cannot
  // replace the originally captured synchronous verifier.
  expect(x.run().command_result).toHaveProperty('code','EVIDENCE_MISSING');await new Promise<void>(resolve=>setImmediate(resolve));expect(x.calls()).toBe(1);
 });
});
