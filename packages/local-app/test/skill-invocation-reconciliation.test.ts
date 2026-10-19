import {mkdtempSync,mkdirSync,writeFileSync,renameSync,rmSync,existsSync} from 'node:fs';
import{pinBinary}from'../../runtime-adapter/src/native.js';import{claimAgentRuntimeOperation}from'../../runtime-adapter/src/agent-runtime-operation.js';import{readRuntimeBinaryOriginal}from'@cimiloop/runtime-adapter';
import {tmpdir} from 'node:os';import {join,dirname,basename} from 'node:path';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.setConfig({testTimeout:120000,hookTimeout:120000});
const readers=vi.hoisted(()=>({method:vi.fn(),provider:vi.fn(),model:vi.fn(),costs:vi.fn(),cancel:vi.fn(),collect:vi.fn()}));
vi.mock('@cimiloop/runtime-adapter',async original=>({...await original<typeof import('@cimiloop/runtime-adapter')>(),readAgentRuntimeNamedMethodResult:readers.method,readDedicatedAgentModelOriginals:readers.provider,readAgentRuntimeModelOriginals:readers.model,readOriginalDedicatedAgentRunCosts:readers.costs,withOriginalDedicatedAgentRunCostRead:(root:string,scope:unknown,account:unknown,consume:(read:(...args:unknown[])=>unknown)=>unknown,close?:()=>void)=>{const before=readers.costs(root,scope,account),value=consume((...args:unknown[])=>{expect(args).toEqual([root,scope,account]);return structuredClone(before);});expect(readers.costs(root,scope,account)).toEqual(before);close?.();return value;},readAgentRuntimeNamedMethodCancellation:readers.cancel,collectAgentRuntimeOperation:readers.collect}));
import {AgentStartLedger,digest} from '@cimiloop/runtime-adapter';
import {LocalSkillInvocationResultCollection} from '../src/skill-invocation-result-local.js';
import {LocalSkillInvocationStartCustody} from '../src/skill-invocation-start-custody-local.js';
import {LocalSkillMethodInputs} from '../src/skill-methods-local.js';
import {LocalNamedSkillMethodAssessment} from '../src/skill-method-assessment-local.js';
import {readOriginalSkillInvocation} from '../src/skill-invocation-execution-local.js';
import {writeInstance,openLocalProject,type HumanSkillReconciliationFactory} from '../src/index.js';
import {CimiLoopKernel,requestDigest} from '../../kernel/src/index.js';
import {createSkillInvocationProject} from '../../../tests/fixtures/skill-invocation-project.js';
import {createAccountBillingEntry} from '../../../tests/fixtures/agent-account-billing-entry.js';
import {flowSuccess} from '../../../tests/fixtures/flow-project.js';
// Actual Kernel/content/custody. Native/method/cost/qualification readers are
// deliberately constructed here; real Native coverage is a separate full file.
let root:string,f:ReturnType<typeof createSkillInvocationProject>,ledger:AgentStartLedger,account:ReturnType<typeof createAccountBillingEntry>,collector:LocalSkillInvocationResultCollection,invocation:any,local:any,inputs:LocalSkillMethodInputs,custody:LocalSkillInvocationStartCustody,options:any;let human:ReturnType<typeof openLocalProject>|undefined;
const output={purpose:'review',findings:[],limitations:['Public constructed reader fixture only']};
let runtimeBinaryPath:string;
const capture=(c=collector)=>{const method=Reflect.get(c,'captureReconciliation');expect(method).toBeTypeOf('function');return method.call(c,invocation.id,f.actor.id);};
beforeEach(()=>{
 vi.resetAllMocks();root=mkdtempSync(join(tmpdir(),'cimiloop-skill-reconciliation-'));f=createSkillInvocationProject(root);ledger=AgentStartLedger.initialize(join(dirname(f.path),'child-host'),{machine_digest:digest('constructed machine').value,principal_digest:digest('constructed principal').value});
 custody=new LocalSkillInvocationStartCustody(root,dirname(f.path),ledger);const prepare=f.runPort.agent.skills!.prepare.bind(f.runPort.agent.skills);
 f.runPort.agent.skills!.prepare=(...args)=>custody.bindPreparation(...args,prepare(...args));invocation=f.reserveSkill().invocation;
 local={location:{repositoryKind:'git',repositoryPath:root,dataDirectory:dirname(f.path),databasePath:f.path,instancePath:join(dirname(f.path),'instance.json')},store:f.store,caller:f.caller,kernel:f.kernel};
 inputs=new LocalSkillMethodInputs(root,dirname(f.path));const plan={request:invocation.request,profile:{constructed:true},files:[],input_ref:invocation.input_ref};vi.spyOn(inputs,'readInvocation').mockReturnValue(plan as any);
 const original=readOriginalSkillInvocation(local,invocation.id);custody.claim(original.project,invocation,original.request.parent,original.record_id,requestDigest(plan),()=>{});
 const relation=custody.accountScope(original.project,invocation,original.request.parent,original.record_id),modelRoot=join(dirname(f.path),'skill-runtime-originals',f.project.id,invocation.invocation_key);mkdirSync(modelRoot,{recursive:true});const path=join(modelRoot,'original.json'),bytes=Buffer.from('PUBLIC original');writeFileSync(path,bytes);
 const calls=[{call_id:'model_0001'}];readers.method.mockReturnValue({status:'Observed',method_result_reverified:true,output,artifacts:[{name:'original.json',path,digest:digest(bytes).value}]});readers.provider.mockReturnValue({summary:{status:'Observed',original_requirement_pinned:true,budget_identity_pinned:true,unresolved:0},calls,artifacts:[]});readers.model.mockReturnValue({status:'Observed',calls});
 account=createAccountBillingEntry({currency:'USD',credentialOutside:true});readers.costs.mockReturnValue({costs:{cash_charged_micros:12,credit_charged_micro_units:4,currency:'USD',costs_reconciled:true},calls,scope:relation.child});
 vi.spyOn(LocalNamedSkillMethodAssessment.prototype,'verifyHistoricalQualification').mockReturnValue({qualification_ref:custody.originalQualification(original.project,invocation,original.request.parent,original.record_id),assessment:{profile:'controlled_execution',outcome:'ALLOW'}} as any);
 options={local,custody,inputs,account:account.account,qualificationOriginals:{verify:()=>{throw Error('Reader mocked explicitly in this unit fixture');}}};collector=new LocalSkillInvocationResultCollection(options);
 // Actual immutable claim/pin registry over PUBLIC constructed binary bytes;
 // no Native launch or real model/Skill qualification is implied.
 const nodePath=join(root,'PUBLIC-node.exe'),controllerPath=join(root,'PUBLIC-controller.exe');writeFileSync(nodePath,'PUBLIC fixed Node original');writeFileSync(controllerPath,'PUBLIC fixed controller original');const node=pinBinary(modelRoot,nodePath),controller=pinBinary(modelRoot,controllerPath);runtimeBinaryPath=node.path;
 claimAgentRuntimeOperation(modelRoot,relation.child,{prompt:'PUBLIC immutable original prompt',binary_original:readRuntimeBinaryOriginal(modelRoot,node.path,node.digest.value),sandbox_original:readRuntimeBinaryOriginal(modelRoot,controller.path,controller.digest.value)},{pid:1234,creation_ticks:'123456',image:process.execPath});
 flowSuccess(f.observeSkill(invocation,'unknown',{usage:{cost_known:false}}));
});
afterEach(()=>{human?.store.close();human=undefined;vi.restoreAllMocks();account?.close();ledger?.close();f?.store.close();if(root){if(dirname(root)!==tmpdir()||!basename(root).startsWith('cimiloop-skill-reconciliation-'))throw Error('Unsafe cleanup');rmSync(root,{recursive:true,force:true});}});
it.each(['Runtime binary','admission.json','dispatch.json'])('rejects Human reconciliation original %s moved by the final account callback',kind=>{
 const result=capture();expect(collector.readResult(f.project,invocation,result.reference)).toEqual(result.report);
 const costs=readers.costs.getMockImplementation()!(),path=kind==='Runtime binary'?runtimeBinaryPath:join(dirname(f.path),'skill-invocation-start-originals',f.project.id,invocation.invocation_key,kind),retained=path+'.PUBLIC-retained',sequence=f.store.asOfEventSequence();let checks=0,moved=false;
 readers.costs.mockImplementation(()=>{if(++checks===2){renameSync(path,retained);moved=true;}return costs;});
 try{expect(()=>collector.readResult(f.project,invocation,result.reference)).toThrow();expect(checks).toBe(2);expect(moved).toBe(true);expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.currentRun().status).toBe('Unknown');}
 finally{if(moved)renameSync(retained,path);}
});
it('captures exact original success/output/costs and covers all prior unknown observations without domain mutation',()=>{
 const sequence=f.store.asOfEventSequence(),prior=f.store.listRuntimeRecords('skill_invocation_observation',f.change.id),result=capture();
 expect(result.report).toMatchObject({status:'succeeded',basis:'reconciliation',producer_actor_id:f.actor.id,output,usage:{cost_known:true,cost_micros:12,currency:'USD'},resolves_observation_refs:prior.map(o=>({object_type:'skill_invocation_observation',id:o.id}))});
 expect(vi.mocked(LocalNamedSkillMethodAssessment.prototype.verifyHistoricalQualification).mock.calls[0]![2].method_qualification_ref).toEqual(custody.originalQualification(f.project,invocation,readOriginalSkillInvocation(local,invocation.id).request.parent,readOriginalSkillInvocation(local,invocation.id).record_id));
 expect(capture()).toEqual(result);expect(collector.readResult(f.project,invocation,result.reference)).toEqual(result.report);expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.currentRun().status).toBe('Unknown');
});
it('requires installed original qualification and complete authenticated billing before terminal capture',()=>{
 expect(()=>capture(new LocalSkillInvocationResultCollection({...options,qualificationOriginals:undefined}))).toThrow();expect(()=>capture(new LocalSkillInvocationResultCollection({...options,account:undefined}))).toThrow();readers.costs.mockImplementation(()=>{throw Error('Original bill absent');});expect(()=>capture()).toThrow();
});
it('rejects missing Native/method result and an Agent masquerading as Human reconciliation producer',()=>{
 readers.method.mockReturnValueOnce({status:'Unknown',artifacts:[]});expect(()=>capture()).toThrow();const method=Reflect.get(collector,'captureReconciliation');expect(()=>method.call(collector,invocation.id,f.agent.id)).toThrow();
});
it('commits child reconciliation through Kernel once, retains parent reservation and never satisfies the Task',()=>{
 const result=capture();f.runPort.agent.skills!.readResult=collector.readResult.bind(collector);const kernel=new CimiLoopKernel({store:f.store,caller:{kind:'local_operator',project_id:f.project.id,actor_id:f.actor.id},now:()=>new Date().toISOString(),runVerifier:f.runPort});
 const command=f.humanCommand('ReconcileSkillInvocation','run',invocation.run_ref.id,{invocation_ref:{object_type:'skill_invocation',id:invocation.id},raw_result_ref:result.reference},'technical_owner'),sequence=f.store.asOfEventSequence(),receipt=flowSuccess(kernel.execute(command));
 expect(receipt).toMatchObject({command_type:'ReconcileSkillInvocation',data:{observation:{resulting_status:'Succeeded'},run:{status:'Unknown',reservation_released:false}}});expect(kernel.execute(command)).toEqual(receipt);expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.task().status).not.toBe('Satisfied');expect(f.task().usage.pending_reconciliation).toBe(true);expect(collector.readResult(f.project,invocation,result.reference)).toEqual(result.report);
});
it('refuses forged success/cash/output/original-reference substitutions and qualification drift on reread',()=>{
 const result=capture(),store=(raw:unknown)=>inputs.packages.content.storeContent(Buffer.from(JSON.stringify(raw)),'skill_invocation_report');
 for(const raw of [{...result.report,output:{...output,limitations:['forged']}},{...result.report,usage:{cost_known:true,cost_micros:0,currency:'USD'}},{...result.report,resolves_observation_refs:[]}])expect(()=>collector.readResult(f.project,invocation,store(raw))).toThrow();
 vi.mocked(LocalNamedSkillMethodAssessment.prototype.verifyHistoricalQualification).mockImplementation(()=>{throw Error('Original qualification drift');});expect(()=>collector.readResult(f.project,invocation,result.reference)).toThrow();
});

const humanService=async(factory?:HumanSkillReconciliationFactory)=>{
 writeInstance(join(dirname(f.path),'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});human??=openLocalProject({projectDir:root});
 const module=await import('../src/index.js'),Service=Reflect.get(module,'LocalHumanSkillInvocationReconciliation');expect(Service).toBeTypeOf('function');return new Service(human,factory);
};
const humanRequest=()=>({command_id:f.humanCommand('ReconcileSkillInvocation','run',invocation.run_ref.id,{},'technical_owner').command_id,requested_at:new Date().toISOString(),acting_role:'technical_owner',command_type:'ReconcileSkillInvocation',target:{object_type:'run',id:invocation.run_ref.id},expected_revision:f.currentRun().revision,payload:{invocation_ref:{object_type:'skill_invocation',id:invocation.id}}});
it('shared Human service commits once and restores the original command without reopening a collector after restart',async()=>{
 let opens=0,releases=0;const service=await humanService(()=>{opens++;return{collector,release(){releases++;}};}),request=humanRequest(),sequence=f.store.asOfEventSequence(),receipt=await service.reconcile(request);
 expect(receipt).toMatchObject({command_type:'ReconcileSkillInvocation',data:{observation:{resulting_status:'Succeeded'}}});expect(await service.reconcile(request)).toEqual(receipt);human!.store.close();human=undefined;
 const restarted=await humanService();expect(await restarted.reconcile(request)).toEqual(receipt);expect(opens).toBe(1);expect(releases).toBe(1);expect(f.store.asOfEventSequence()).toBe(sequence+1);
});
it('shared Human service refuses serialized terminal/evidence/root overrides before opening a collector',async()=>{
 const factory=vi.fn(()=>({collector,release(){}})),service=await humanService(factory),request=humanRequest(),sequence=f.store.asOfEventSequence();
 for(const raw of [{...request,actor_id:f.agent.id},{...request,payload:{...request.payload,status:'succeeded'}},{...request,payload:{...request.payload,raw_result_ref:invocation.input_ref}},{...request,account_root:root}])await expect(service.reconcile(raw)).rejects.toMatchObject({code:'INVALID_COMMAND'});
 expect(factory).not.toHaveBeenCalled();expect(f.store.asOfEventSequence()).toBe(sequence);
});
it('shared Human service keeps the committed original receipt when releasing its read-only lease loses the response',async()=>{
 const service=await humanService(()=>({collector,release(){throw Error('PUBLIC response lost after commit');}})),request=humanRequest(),sequence=f.store.asOfEventSequence();await expect(service.reconcile(request)).rejects.toThrow();
 expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(await(await humanService()).reconcile(request)).toMatchObject({command_type:'ReconcileSkillInvocation'});expect(f.store.asOfEventSequence()).toBe(sequence+1);
});

it('rechecks a synchronous installed guard after a delayed factory and releases without capturing or committing on denial',async()=>{
 let enter!:()=>void,resume!:(value:any)=>void;const entered=new Promise<void>(r=>enter=r),pending=new Promise<any>(r=>resume=r),release=vi.fn(),guard=vi.fn(()=>{throw Error('PUBLIC authority expired');}),service=await humanService(async()=>{enter();return pending;}),request=humanRequest(),sequence=f.store.asOfEventSequence(),captureSpy=vi.spyOn(collector,'captureReconciliation');
 const result=service.reconcile(request,guard);await entered;resume({collector,release});await expect(result).rejects.toThrow('PUBLIC authority expired');expect(guard).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledTimes(1);expect(captureSpy).not.toHaveBeenCalled();expect(f.store.asOfEventSequence()).toBe(sequence);expect(f.currentRun().status).toBe('Unknown');
 expect(await service.reconcile(request,()=>{})).toMatchObject({command_type:'ReconcileSkillInvocation'});expect(f.store.asOfEventSequence()).toBe(sequence+1);
});

it('reconciles an independently proven original method-output failure with final bills and no accepted output',async()=>{
 readers.method.mockReturnValue({status:'Observed',method_result_reverified:false,method_failure_reverified:true,failure:{code:'agent_named_method_output_invalid',returned_text_digest:digest('PUBLIC original invalid output')},artifacts:readers.method.mock.results[0]?.value?.artifacts??[]});
 expect(()=>capture(new LocalSkillInvocationResultCollection({...options,qualificationOriginals:undefined}))).toThrow();expect(()=>capture(new LocalSkillInvocationResultCollection({...options,account:undefined}))).toThrow();readers.costs.mockImplementationOnce(()=>{throw Error('PUBLIC original final bill missing');});expect(()=>capture()).toThrow();
 const sequence=f.store.asOfEventSequence(),result=capture();expect(result.report).toMatchObject({status:'failed',basis:'reconciliation',usage:{cost_known:true,cost_micros:12,currency:'USD'}});expect(result.report).not.toHaveProperty('output');expect(collector.readResult(f.project,invocation,result.reference)).toEqual(result.report);
 const service=await humanService(()=>({collector,release(){}})),request=humanRequest(),receipt=await service.reconcile(request);expect(receipt).toMatchObject({command_type:'ReconcileSkillInvocation',data:{observation:{resulting_status:'Failed'},run:{status:'Unknown',reservation_released:false}}});expect(await(await humanService()).reconcile(request)).toEqual(receipt);expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.task().status).not.toBe('Satisfied');
});
it('refuses ambiguous, unknown, cancellation or unstarted labels as method-output failure and refuses forged failure evidence',()=>{
 const original={status:'Observed',method_result_reverified:false,method_failure_reverified:true,failure:{code:'agent_named_method_output_invalid',returned_text_digest:digest('PUBLIC original invalid output')},artifacts:[]};
 for(const method of [{...original,status:'Unknown'},{...original,method_result_reverified:true,output},{...original,failure:{...original.failure,code:'cancelled'}},{...original,failure:{...original.failure,code:'not_started'}},{...original,method_failure_reverified:false}]){readers.method.mockReturnValue(method);expect(()=>capture()).toThrow();}
 readers.method.mockReturnValue(original);const result=capture(),proof=JSON.parse(inputs.packages.content.readContent(result.report.result_proof_ref).toString());proof.method.failure.returned_text_digest=digest('PUBLIC forged failure text');const ref=inputs.packages.content.storeContent(Buffer.from(JSON.stringify(proof)),'skill_invocation_proof'),report=inputs.packages.content.storeContent(Buffer.from(JSON.stringify({...result.report,result_proof_ref:ref})),'skill_invocation_report');expect(()=>collector.readResult(f.project,invocation,report)).toThrow();
});

const cancelParent=()=>flowSuccess(new CimiLoopKernel({store:f.store,caller:{kind:'local_operator',project_id:f.project.id,actor_id:f.actor.id},now:()=>new Date().toISOString(),runVerifier:f.runPort}).execute(f.humanCommand('CancelRun','run',invocation.run_ref.id,{reason:'PUBLIC original child cancellation'},'technical_owner')));
const installCancellation=()=>{
 readers.method.mockReturnValue({status:'Unknown',method_result_reverified:false,artifacts:[]});
 readers.cancel.mockReturnValue({format:'cimiloop/original-named-cancellation/1.0.0',status:'Observed',reason:'agent_named_cancellation_reverified',cancellation_reverified:true,method_result_reverified:false,matched_calls:0,costs_reconciled:false,domain_observation_produced:false,formal_agent_execution_enabled:false,artifacts:[]});
 readers.collect.mockResolvedValue({format:'PUBLIC constructed original cancellation collection'});
};
const captureCancelled=async()=>{const method=Reflect.get(collector,'captureCancellationReconciliation');expect(method).toBeTypeOf('function');return method.call(collector,invocation.id,f.actor.id);};
it('captures original cancelled child with final original bills and historical qualification, never succeeds or releases parent budget',async()=>{
 cancelParent();installCancellation();const sequence=f.store.asOfEventSequence(),result=await captureCancelled();expect(result.report).toMatchObject({status:'cancelled',basis:'reconciliation',producer_actor_id:f.actor.id,usage:{cost_known:true,cost_micros:12,currency:'USD'}});expect(result.report).not.toHaveProperty('output');expect(f.store.asOfEventSequence()).toBe(sequence);
 expect(collector.readResult(f.project,invocation,result.reference)).toEqual(result.report);
 const service=await humanService(()=>({collector,release(){}})),request=humanRequest(),receipt=await service.reconcile(request);expect(receipt).toMatchObject({data:{observation:{resulting_status:'Cancelled'},run:{status:'Unknown',reservation_released:false}}});
 expect(await(await humanService()).reconcile(request)).toEqual(receipt);expect(f.store.asOfEventSequence()).toBe(sequence+1);expect(f.task().status).not.toBe('Satisfied');expect(f.task().usage.pending_reconciliation).toBe(true);
});
it.each(['kernel_cancel_missing','original_unknown','final_bill_missing','qualification_missing','agent_producer','no_calls'])('refuses %s cancelled capture without mutating Kernel',async kind=>{
 if(kind!=='kernel_cancel_missing')cancelParent();installCancellation();if(kind==='original_unknown')readers.cancel.mockReturnValue({status:'Unknown',cancellation_reverified:false,artifacts:[]});if(kind==='final_bill_missing')readers.costs.mockImplementation(()=>{throw Error('PUBLIC missing original final bill');});if(kind==='qualification_missing')options.qualificationOriginals=undefined;if(kind==='no_calls')readers.provider.mockReturnValue({summary:{status:'Observed',original_requirement_pinned:true,budget_identity_pinned:true,unresolved:0},calls:[],artifacts:[]});
 const sequence=f.store.asOfEventSequence();collector=new LocalSkillInvocationResultCollection(options);const method=Reflect.get(collector,'captureCancellationReconciliation');expect(method).toBeTypeOf('function');await expect(method.call(collector,invocation.id,kind==='agent_producer'?f.agent.id:f.actor.id)).rejects.toThrow();expect(f.store.asOfEventSequence()).toBe(sequence);
});
it('rejects altered cancellation proof, costs and inserted output on historical reread',async()=>{
 cancelParent();installCancellation();const result=await captureCancelled(),content=inputs.packages.content;
 for(const changes of [{status:'succeeded',output},{output},{usage:{cost_known:true,cost_micros:0,currency:'USD'}}]){const ref=content.storeContent(Buffer.from(JSON.stringify({...result.report,...changes})),'skill_invocation_report');expect(()=>collector.readResult(f.project,invocation,ref)).toThrow();}
 const proof=JSON.parse(content.readContent(result.report.result_proof_ref).toString());proof.method.cancellation_reverified=false;const p=content.storeContent(Buffer.from(JSON.stringify(proof)),'skill_invocation_proof'),ref=content.storeContent(Buffer.from(JSON.stringify({...result.report,result_proof_ref:p})),'skill_invocation_report');expect(()=>collector.readResult(f.project,invocation,ref)).toThrow();
});
it('shared cancellation capture rechecks guard and releases after awaited original collection before saving or committing',async()=>{
 cancelParent();installCancellation();let enter!:()=>void,resume!:(v:unknown)=>void;const entered=new Promise<void>(r=>enter=r),pending=new Promise<unknown>(r=>resume=r);readers.collect.mockImplementation(()=>{enter();return pending;});let expired=false;const release=vi.fn(),service=await humanService(()=>({collector,release})),request=humanRequest(),sequence=f.store.asOfEventSequence();
 const result=service.reconcile(request,()=>{if(expired)throw Error('PUBLIC original session expired after collection');});await entered;expired=true;resume({format:'PUBLIC constructed original collection'});await expect(result).rejects.toThrow('PUBLIC original session expired after collection');expect(release).toHaveBeenCalledTimes(1);expect(f.store.asOfEventSequence()).toBe(sequence);
});

it('keeps original Human location fixed after a collector factory mutates the data root',async()=>{
 const release=vi.fn(),service=await humanService(()=>{human!.location.dataDirectory=join(root,'PUBLIC foreign data');return{collector,release};}),request=humanRequest(),sequence=f.store.asOfEventSequence();await expect(service.reconcile(request)).rejects.toThrow();expect(release).toHaveBeenCalledTimes(1);expect(f.store.asOfEventSequence()).toBe(sequence);
});

it('refuses Human location drift after awaited cancellation capture before publishing prepared original',async()=>{
 cancelParent();installCancellation();let enter!:()=>void,resume!:(v:unknown)=>void;const entered=new Promise<void>(r=>enter=r),pending=new Promise<unknown>(r=>resume=r);readers.collect.mockImplementation(()=>{enter();return pending;});const release=vi.fn(),service=await humanService(()=>({collector,release})),request=humanRequest(),sequence=f.store.asOfEventSequence();
 const result=service.reconcile(request);await entered;human!.location.dataDirectory=join(root,'PUBLIC foreign root');resume({format:'PUBLIC original collection'});await expect(result).rejects.toThrow();expect(existsSync(join(dirname(f.path),'skill-reconciliation-originals',f.project.id,invocation.id,request.command_id,'prepared.json'))).toBe(false);expect(release).toHaveBeenCalledTimes(1);expect(f.store.asOfEventSequence()).toBe(sequence);
});
it('refuses release-time Human root drift while retaining the committed original receipt for exact recovery',async()=>{
 const oldData=dirname(f.path),release=vi.fn(()=>{human!.location.dataDirectory=join(root,'PUBLIC release drift');}),service=await humanService(()=>({collector,release})),request=humanRequest(),sequence=f.store.asOfEventSequence();await expect(service.reconcile(request)).rejects.toThrow();expect(release).toHaveBeenCalledTimes(1);expect(f.store.asOfEventSequence()).toBe(sequence+1);human!.location.dataDirectory=oldData;expect(await(await humanService()).reconcile(request)).toMatchObject({command_type:'ReconcileSkillInvocation'});expect(f.store.asOfEventSequence()).toBe(sequence+1);
});
