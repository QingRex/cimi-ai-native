import {mkdtempSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {createInternalId} from '@cimiloop/protocol/v2';
import {openLocalProject,writeInstance,LocalPrePlanClarification,executeLocalCommand,type MattPlanClarificationVerification} from '../src/index.js';
import {createIntentProject,planBody} from '../../../tests/fixtures/intent-project.js';
import {flowSuccess} from '../../../tests/fixtures/flow-project.js';
import {CimiLoopKernel} from '@cimiloop/kernel';

// Actual Human/Kernel/SQLite. No real Matt, SDK, model, qualification or S1 proof.
describe('installed strict Plan admission shares the original Human ledger',()=>{
 let root:string,f:ReturnType<typeof createIntentProject>,local:ReturnType<typeof openLocalProject>;
 beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'cimiloop-plan-admission-'));f=createIntentProject(root,{databasePath:join(root,'.cimiloop','project.db')});
  writeInstance(join(root,'.cimiloop','instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
  local=openLocalProject({projectDir:root,planningClarification:{}});
 });
 // Retain only this test's owned originals; never bulk-clean Temp or old roots.
 afterEach(()=>{local?.store.close();f?.store.close();console.info('Retained D-263 owned local originals: '+root);});
 function prepared(){const change=f.create();f.prepareContract(change.id);const current=f.store.getChange(change.id)!;
  const body=planBody(change.id,current.contract_ref!);return {change:current,body};}
 function command(x:ReturnType<typeof prepared>){return{command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:'technical_owner',command_type:'SubmitPlanProposal',target:{object_type:'change',id:x.change.id},expected_revision:x.change.revision,payload:{base_version_ref:null,body:x.body}};}
 function decisionFor(changeId:string,proposal:ReturnType<typeof f.submitPlan>){
  const result=flowSuccess(local.kernel.execute(f.changeCommand('RequestDecision',f.store.getChange(changeId)!,{action:'confirm_plan',proposal_ref:{object_type:'plan_proposal',id:proposal.id,domain_version:proposal.proposal_revision}},'technical_owner')));
  if(result.command_type!=='RequestDecision')throw Error('Wrong request');const request=result.data.request;
  const decision=flowSuccess(local.kernel.execute(f.changeCommand('RecordDecision',f.store.getChange(changeId)!,{request_id:request.id,input_digest:request.input_digest,choice:'approve',conditions:[],reason:'Actual Human plan approval'},'technical_owner')));
  if(decision.command_type!=='RecordDecision')throw Error('Wrong decision');return {request,decision:decision.data.decision};
 }
 function round(){const x=prepared(),service=new LocalPrePlanClarification(local),session=service.begin(x.change.id,{request_id:createInternalId(),target:'plan',requirement:'Bounded implementation and verification',background:'Current real confirmed contract',constraints:['Keep original identity']}).session;
  const question={request_id:createInternalId(),expected_head:0,kind:'question',text:'What independently verifies A1?'};
  service.advance(x.change.id,session.id,question);service.advance(x.change.id,session.id,{request_id:createInternalId(),expected_head:1,kind:'answer',question_id:question.request_id,text:'Independent original evidence'});
  return {...x,service,session,candidate:{request_id:createInternalId(),expected_head:2,kind:'plan_candidate',requested_at:new Date().toISOString(),body:x.body}};
 }
 function install(verifyOriginal:MattPlanClarificationVerification['verifyOriginal']){
  local.store.close();local=openLocalProject({projectDir:root,planningClarification:{matt:{verifyOriginal}}});
 }
 it('blocks direct shared commands without original Human clarification and creates no plan/task/event',()=>{
  const x=prepared(),seq=f.store.asOfEventSequence();expect(executeLocalCommand(local,command(x))).toHaveProperty('code','EVIDENCE_MISSING');
  expect(f.store.listIntentRecords('plan_proposal',x.change.id)).toHaveLength(0);expect(f.store.listExecutionObjects('task',x.change.id)).toHaveLength(0);expect(f.store.asOfEventSequence()).toBe(seq);
 });
 it('requires actual Matt admission even after real Human answers and replays the original refusal',()=>{
  const x=prepared(),service=new LocalPrePlanClarification(local),session=service.begin(x.change.id,{request_id:createInternalId(),target:'plan',requirement:'Bounded implementation and verification',background:'Current real confirmed contract',constraints:['Keep original identity']}).session;
  const question={request_id:createInternalId(),expected_head:0,kind:'question',text:'What independently verifies A1?'};
  service.advance(x.change.id,session.id,question);service.advance(x.change.id,session.id,{request_id:createInternalId(),expected_head:1,kind:'answer',question_id:question.request_id,text:'Independent original evidence'});
  const candidate={request_id:createInternalId(),expected_head:2,kind:'plan_candidate',requested_at:new Date().toISOString(),body:x.body},seq=f.store.asOfEventSequence();
  const result=service.advance(x.change.id,session.id,candidate);expect(result.command_result).toHaveProperty('code','CAPABILITY_UNAVAILABLE');
  expect(service.advance(x.change.id,session.id,candidate)).toEqual(result);expect(f.store.asOfEventSequence()).toBe(seq);expect(f.store.listIntentRecords('plan_proposal',x.change.id)).toHaveLength(0);
 });
 it('blocks confirmation of a legacy Plan candidate lacking pre-plan evidence',()=>{
  const x=prepared(),proposal=f.submitPlan(x.change.id,x.body),{request,decision}=decisionFor(x.change.id,proposal),seq=f.store.asOfEventSequence();
  const result=local.kernel.execute(f.changeCommand('ConfirmPlan',f.store.getChange(x.change.id)!,f.confirmPayload(request,decision),'technical_owner'));
  expect(result).toHaveProperty('code','EVIDENCE_MISSING');expect(f.store.listIntentRecords('plan_version',x.change.id)).toHaveLength(0);expect(f.store.asOfEventSequence()).toBe(seq);
 });
 it('blocks generation of Tasks for a legacy Plan lacking pre-plan evidence',()=>{
  const x=prepared();f.preparePlan(x.change.id,x.body);const seq=f.store.asOfEventSequence();
  const result=local.kernel.execute(f.changeCommand('InitializePlanTasks',f.store.getChange(x.change.id)!,{plan_ref:f.store.getChange(x.change.id)!.plan_ref!},'technical_owner'));
  expect(result).toHaveProperty('code','EVIDENCE_MISSING');expect(f.store.listExecutionObjects('task',x.change.id)).toHaveLength(0);expect(f.store.asOfEventSequence()).toBe(seq);
 });
 it('creates one candidate, confirmed Plan and Tasks through three strict Kernel gates; original receipts do not reenter Matt',()=>{
  const seen:string[]=[],inputs:string[]=[];install((basis,human)=>{seen.push(basis.command.command_type);inputs.push(human.input_digest);
   expect(human.questions).toHaveLength(1);expect(human.questions[0]!.answer).toBe('Independent original evidence');expect(human.candidate.body).toEqual(basis.body);
  });
  const x=round(),first=x.service.advance(x.change.id,x.session.id,x.candidate),result=flowSuccess(first.command_result!);if(result.command_type!=='SubmitPlanProposal')throw Error('Wrong proposal');
  expect(x.service.advance(x.change.id,x.session.id,x.candidate)).toEqual(first);expect(seen).toEqual(['SubmitPlanProposal']);
  const {request,decision}=decisionFor(x.change.id,result.data.proposal),confirm=f.changeCommand('ConfirmPlan',f.store.getChange(x.change.id)!,f.confirmPayload(request,decision),'technical_owner');
  const confirmed=flowSuccess(local.kernel.execute(confirm));expect(local.kernel.execute(confirm)).toEqual(confirmed);
  const initialize=f.changeCommand('InitializePlanTasks',f.store.getChange(x.change.id)!,{plan_ref:f.store.getChange(x.change.id)!.plan_ref!},'technical_owner');
  const initialized=flowSuccess(local.kernel.execute(initialize));expect(local.kernel.execute(initialize)).toEqual(initialized);
  expect(seen).toEqual(['SubmitPlanProposal','ConfirmPlan','InitializePlanTasks']);expect(new Set(inputs).size).toBe(1);
  expect(f.store.listIntentRecords('plan_proposal',x.change.id)).toHaveLength(1);expect(f.store.listIntentRecords('plan_version',x.change.id)).toHaveLength(1);expect(f.store.listExecutionObjects('task',x.change.id)).toHaveLength(2);
 });
 it('passes detached copies to the controlled verifier without letting it change authoritative Plan inputs',()=>{
  install((basis,human)=>{basis.body.approach='Mutated verifier copy';basis.change.owner_actor_id=createInternalId();human.candidate.body.approach='Mutated transcript copy';});
  const x=round(),original=structuredClone(x.body),result=x.service.advance(x.change.id,x.session.id,x.candidate);
  expect(result.command_result).toHaveProperty('ok',true);expect(f.store.listIntentRecords('plan_proposal',x.change.id)[0]!.body).toEqual(original);expect(f.store.getChange(x.change.id)!.owner_actor_id).toBe(f.actor.id);
 });
 it('rejects another command identity even for identical Plan content',()=>{
  let calls=0;install(()=>{calls++;});const x=round();expect(x.service.advance(x.change.id,x.session.id,x.candidate).command_result).toHaveProperty('ok',true);
  const seq=f.store.asOfEventSequence();expect(executeLocalCommand(local,{...command(x),expected_revision:f.store.getChange(x.change.id)!.revision})).toHaveProperty('code','EVIDENCE_MISSING');
  expect(calls).toBe(1);expect(f.store.asOfEventSequence()).toBe(seq);expect(f.store.listIntentRecords('plan_proposal',x.change.id)).toHaveLength(1);
 });
 it('rejects changed content for the reserved candidate and resumes the exact original after a precommit refusal',()=>{
  let calls=0;install(()=>{calls++;});const x=round(),execute=local.kernel.execute.bind(local.kernel);local.kernel.execute=()=>{throw Error('Host stopped before Kernel command');};
  expect(()=>x.service.advance(x.change.id,x.session.id,x.candidate)).toThrow();local.kernel.execute=execute;
  const wrong=structuredClone(x.body);wrong.approach='Changed candidate';const seq=f.store.asOfEventSequence();
  expect(executeLocalCommand(local,{...command(x),command_id:x.candidate.request_id,requested_at:x.candidate.requested_at,payload:{base_version_ref:null,body:wrong}})).toHaveProperty('code','EVIDENCE_MISSING');
  expect(calls).toBe(0);expect(f.store.asOfEventSequence()).toBe(seq);
  // A precommit refusal has no command receipt. The private reserved request is
  // still authoritative and the exact original can continue without new effect.
  expect(x.service.advance(x.change.id,x.session.id,x.candidate).command_result).toHaveProperty('ok',true);expect(calls).toBe(1);
  expect(f.store.listIntentRecords('plan_proposal',x.change.id)[0]!.body).toEqual(x.body);
 });
 it('rechecks original Human bytes after the controlled Matt verifier and refuses missing originals',()=>{
  install(()=>{const path=join(local.location.dataDirectory,'pre-plan-clarifications','originals.sqlite');renameSync(path,path+'.held');});const x=round(),execute=local.kernel.execute.bind(local.kernel);local.kernel.execute=()=>{throw Error('Host stopped before Kernel command');};
  expect(()=>x.service.advance(x.change.id,x.session.id,x.candidate)).toThrow();local.kernel.execute=execute;const seq=f.store.asOfEventSequence();
  expect(executeLocalCommand(local,{...command(x),command_id:x.candidate.request_id,requested_at:x.candidate.requested_at})).toHaveProperty('code','EVIDENCE_MISSING');
  expect(f.store.asOfEventSequence()).toBe(seq);expect(f.store.listIntentRecords('plan_proposal',x.change.id)).toHaveLength(0);
 });
 it('keeps verifier error details private and does not turn a denial into a new Plan',()=>{
  install(()=>{throw Error('Private account/provider detail');});const x=round(),seq=f.store.asOfEventSequence(),result=x.service.advance(x.change.id,x.session.id,x.candidate);
  expect(result.command_result).toHaveProperty('code','EVIDENCE_MISSING');expect(JSON.stringify(result)).not.toContain('Private account/provider detail');expect(f.store.asOfEventSequence()).toBe(seq);
 });
 it('checks current Human authority before entering the verifier',()=>{
  let calls=0;install(()=>{calls++;});const x=round(),assignment=f.store.listAssignments().find(a=>a.role_key==='technical_owner'&&a.actor_id===f.actor.id)!;
  flowSuccess(f.kernel.execute(f.projectCommand('EndAssignment',{assignment_id:assignment.id,expected_assignment_revision:assignment.revision,reason:'Actual role revocation'})));
  const seq=f.store.asOfEventSequence();expect(x.service.advance(x.change.id,x.session.id,x.candidate).command_result).toHaveProperty('code','ROLE_NOT_ASSIGNED');expect(calls).toBe(0);expect(f.store.asOfEventSequence()).toBe(seq);
 });
 it('replays a lost successful candidate response through the same Kernel receipt without another verification or effect',()=>{
  let calls=0;install(()=>{calls++;});const x=round(),execute=local.kernel.execute.bind(local.kernel);local.kernel.execute=command=>{execute(command);throw Error('Response lost after commit');};
  expect(()=>x.service.advance(x.change.id,x.session.id,x.candidate)).toThrow();local.kernel.execute=execute;const seq=f.store.asOfEventSequence();
  const result=x.service.advance(x.change.id,x.session.id,x.candidate);expect(result.command_result).toHaveProperty('ok',true);expect(result.session.pending).toBe(false);
  expect(calls).toBe(1);expect(f.store.listIntentRecords('plan_proposal',x.change.id)).toHaveLength(1);expect(f.store.asOfEventSequence()).toBe(seq);
 });
 it('does not accept a serialized verified verdict from the installed verifier',()=>{
  install(()=>({verified:true}));const x=round(),seq=f.store.asOfEventSequence();expect(x.service.advance(x.change.id,x.session.id,x.candidate).command_result).toHaveProperty('code','EVIDENCE_MISSING');
  expect(f.store.asOfEventSequence()).toBe(seq);expect(f.store.listIntentRecords('plan_proposal',x.change.id)).toHaveLength(0);
 });
 it.each(['local','kernel'] as const)('rejects and consumes an asynchronous rejection at the %s verifier boundary',async boundary=>{
  const verifyOriginal=async()=>{throw Error('PUBLIC async verifier private detail');};
  if(boundary==='local')install(verifyOriginal);else{local.kernel=new CimiLoopKernel({store:local.store,caller:f.caller,planningClarification:{verifyOriginal}});}
  const x=round(),seq=f.store.asOfEventSequence(),result=x.service.advance(x.change.id,x.session.id,x.candidate);
  expect(result.command_result).toHaveProperty('code','EVIDENCE_MISSING');expect(JSON.stringify(result)).not.toContain('PUBLIC async verifier private detail');
  await new Promise<void>(resolve=>setImmediate(resolve));expect(f.store.asOfEventSequence()).toBe(seq);expect(f.store.listIntentRecords('plan_proposal',x.change.id)).toHaveLength(0);
 });
 it.each(['local','kernel'] as const)('refuses an asynchronous fulfilled verdict at the %s verifier boundary',boundary=>{
  const verifyOriginal=async()=>{};
  if(boundary==='local')install(verifyOriginal);else{local.kernel=new CimiLoopKernel({store:local.store,caller:f.caller,planningClarification:{verifyOriginal}});}
  const x=round(),seq=f.store.asOfEventSequence();expect(x.service.advance(x.change.id,x.session.id,x.candidate).command_result).toHaveProperty('code','EVIDENCE_MISSING');expect(f.store.asOfEventSequence()).toBe(seq);
 });
});
