import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,sep} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {CimiLoopKernel,readCurrentAgentProviderQualification} from '../../packages/kernel/src/index.js';
import {contentDigest} from '../../packages/kernel/src/intent.js';
import type {ProviderEvaluation,ProviderEvidence} from '../../packages/protocol/src/v2/index.js';
import {createFlowProject,flowSuccess,flowTime} from '../fixtures/flow-project.js';
import {createProviderProbe} from '../fixtures/provider-probe.js';

// Real Kernel/SQLite, PUBLIC control and probe observations. This exercises
// governance, never actual OS/model/fees or production Runtime qualification.
const owned:{root:string;close():void}[]=[];
afterEach(()=>{for(const entry of owned.splice(0)){entry.close();const root=resolve(entry.root);if(!root.startsWith(resolve(tmpdir())+sep+'cimiloop-controlled-'))throw Error('Unsafe fixture cleanup');rmSync(root,{recursive:true,force:true});}});
const keys=['network_host_limits','cost_accounting_and_cap','disk_limit','crash_recovery'] as const;
function fixture(controls=true){
 const root=mkdtempSync(join(tmpdir(),'cimiloop-controlled-')),f=createFlowProject(root),p=createProviderProbe(root,dirname(f.path));owned.push({root,close:()=>f.store.close()});
 let basis='PUBLIC initial control basis',changed=false,calls=0;
 const kernel=new CimiLoopKernel({store:f.store,caller:f.caller,now:()=>flowTime,providerVerifier:p.port});
 const registered=flowSuccess(kernel.execute(f.projectCommand('RegisterProvider',{...p.registration,capabilities:[{capability_id:'runtime.execute',version:'1.0.0'},...p.registration.capabilities]})));
 if(registered.command_type!=='RegisterProvider')throw Error('Registration expected');
 const descriptor=registered.data.descriptor,descriptor_ref={object_type:'provider_descriptor' as const,id:descriptor.id},descriptor_digest=contentDigest(descriptor);
 const report=(evidence:ProviderEvidence[])=>({format:'cimiloop/runtime-control-evidence/1.0.0',project_id:f.project.id,descriptor_digest,evidence_digest:contentDigest(evidence.map(e=>({id:e.id,digest:contentDigest(e)}))),checks:Object.fromEntries(keys.map(key=>[key,{result:'supports',basis_digest:contentDigest({key,basis})}]))});
 if(controls)Reflect.set(p.port,'readRuntimeControlEvidence',(_project:unknown,_descriptor:unknown,evidence:ProviderEvidence[])=>{calls++;const value=report(evidence);if(changed)basis='PUBLIC changed '+calls;return value;});
 const recorded=flowSuccess(kernel.execute(f.projectCommand('RecordProviderEvidence',{descriptor_ref,descriptor_digest,raw_result_ref:p.save()})));if(recorded.command_type!=='RecordProviderEvidence')throw Error('Evidence expected');const evidence=recorded.data.evidence;
 const evaluate=(profile='controlled_execution')=>kernel.execute(f.projectCommand('EvaluateProvider',{descriptor_ref,descriptor_digest,profile,evidence_refs:[{object_type:'evidence',id:evidence.id}]}));
 const evaluation=()=>{const result=flowSuccess(evaluate());if(result.command_type!=='EvaluateProvider')throw Error('Evaluation expected');return result.data.evaluation;};
 const binding=(value:ProviderEvaluation,extra={})=>f.projectCommand('RegisterProviderBinding',{descriptor_ref,descriptor_digest,evaluation_ref:{object_type:'evaluation',id:value.id},input_digest:value.input_digest,binding_scope:'task_execution',capability:descriptor.capabilities[0],effective_permissions:descriptor.required_permissions,...extra});
 return{...f,...p,kernel,descriptor,evidence,report,evaluate,evaluation,binding,setBasis:(value:string)=>{basis=value;},setUnstable:()=>{changed=true;}};
}
it('evaluates independently supplied controls and atomically registers one exact Human-approved execution binding',()=>{
 const f=fixture(),evaluation=f.evaluation();expect(evaluation).toMatchObject({rule_version:'provider-assessment/1.0.0',profile:'controlled_execution',outcome:'ALLOW',reasons:[]});expect(evaluation.assessments).toContainEqual({key:'runtime-control-evidence/1.0.0',result:'supports',evidence_refs:[{object_type:'evidence',id:f.evidence.id}]});
 const before=f.store.listEvents().length,command=f.binding(evaluation),result=flowSuccess(f.kernel.execute(command));if(result.command_type!=='RegisterProviderBinding')throw Error('Binding expected');
 expect(result.data.binding.approval).toMatchObject({binding_scope:'task_execution',assignment_ref:{id:f.assignment.id},input_digest:evaluation.input_digest});expect(f.kernel.execute(command)).toEqual(result);expect(f.store.listEvents()).toHaveLength(before+1);expect(f.store.listProviderBindings()).toHaveLength(1);
});
it('recomputes an approved Agent binding from original control material instead of trusting its saved ALLOW',()=>{
 const f=fixture(),evaluation=f.evaluation(),result=flowSuccess(f.kernel.execute(f.binding(evaluation)));if(result.command_type!=='RegisterProviderBinding')throw Error('Binding expected');const binding=result.data.binding,before=f.store.listEvents().length;
 expect(readCurrentAgentProviderQualification(f.store,f.port,f.store.getProject()!,binding)).toMatchObject({binding_digest:contentDigest(binding),qualification_digest:evaluation.input_digest});expect(f.store.listEvents()).toHaveLength(before);
 f.setBasis('PUBLIC different original basis, same supports labels');expect(()=>readCurrentAgentProviderQualification(f.store,f.port,f.store.getProject()!,binding)).toThrow();expect(f.store.getProviderEvaluation(evaluation.id)).toEqual(evaluation);expect(f.store.listEvents()).toHaveLength(before);
});
it('refuses a currently changed executable even when the approved binding and saved qualification are intact',()=>{
 const f=fixture(),evaluation=f.evaluation(),result=flowSuccess(f.kernel.execute(f.binding(evaluation)));if(result.command_type!=='RegisterProviderBinding')throw Error('Binding expected');const binding=result.data.binding,before=f.store.listEvents().length;
 writeFileSync(f.binary,'PUBLIC changed executable bytes');expect(()=>readCurrentAgentProviderQualification(f.store,f.port,f.store.getProject()!,binding)).toThrow();expect(f.store.getProviderBinding(binding.id)).toEqual(binding);expect(f.store.listEvents()).toHaveLength(before);
});
it('retains legacy evaluation semantics without a trusted control reader',()=>{
 const f=fixture(false),evaluation=f.evaluation();expect(evaluation).toMatchObject({rule_version:'provider-assessment/1.0.0',outcome:'NEED_MORE_EVIDENCE',reasons:[...keys]});
 expect(f.kernel.execute(f.binding(evaluation))).toHaveProperty('code');expect(f.store.listProviderBindings()).toEqual([]);
});
it('keeps missing control boundaries inconclusive while recording independently proven disk limits',()=>{
 const f=fixture();Reflect.set(f.port,'readRuntimeControlEvidence',(_p:unknown,_d:unknown,evidence:ProviderEvidence[])=>{const report=f.report(evidence);for(const key of keys.filter(k=>k!=='disk_limit'))Reflect.set(report.checks,key,{result:'inconclusive'});return report;});
 const evaluation=f.evaluation();expect(evaluation).toMatchObject({outcome:'NEED_MORE_EVIDENCE',reasons:keys.filter(k=>k!=='disk_limit')});expect(f.kernel.execute(f.binding(evaluation))).toHaveProperty('code');
});
it.each(['project','evidence','thenable','rejected_thenable','missing_basis','unknown_key','wrapped_result'])('refuses %s control material without recording evaluation or binding',mode=>{
 const f=fixture();Reflect.set(f.port,'readRuntimeControlEvidence',(_p:unknown,_d:unknown,evidence:ProviderEvidence[])=>{const report=f.report(evidence);if(mode==='project')report.project_id='foreign';if(mode==='evidence')report.evidence_digest=contentDigest('foreign');if(mode==='missing_basis')Reflect.set(report.checks,'disk_limit',{result:'supports'});if(mode==='unknown_key')Reflect.set(report.checks,'claimed_success',{result:'supports'});if(mode==='wrapped_result')Reflect.set(report.checks.disk_limit!,'result',new String('refutes'));return mode==='thenable'?Promise.resolve(report):mode==='rejected_thenable'?Promise.reject(Error('PUBLIC unavailable original')):report;});
 const before=f.store.listEvents().length;expect(f.evaluate()).toMatchObject({code:'PROVIDER_OUTPUT_INVALID'});expect(f.store.listEvents()).toHaveLength(before);expect(f.store.listProviderEvaluations()).toEqual([]);expect(f.store.listProviderBindings()).toEqual([]);
});
it('refuses changed original control basis even when every result still says supports',()=>{
 const f=fixture(),evaluation=f.evaluation(),before=f.store.listEvents().length;f.setBasis('PUBLIC replacement');expect(f.kernel.execute(f.binding(evaluation))).toMatchObject({code:'PROVIDER_NOT_EVALUATED'});expect(f.store.listEvents()).toHaveLength(before);expect(f.store.listProviderBindings()).toEqual([]);
});
it('refuses a control observation that changes during the evaluation turn',()=>{
 const f=fixture();f.setUnstable();expect(f.evaluate()).toMatchObject({code:'PROVIDER_OUTPUT_INVALID'});expect(f.store.listProviderEvaluations()).toEqual([]);
});
it('requires the execute capability, exact permissions and a current Human owner for Task binding',()=>{
 const f=fixture(),evaluation=f.evaluation();
 for(const extra of[{binding_scope:'isolated_provider_probe'},{capability:f.descriptor.capabilities[1]},{effective_permissions:{...f.descriptor.required_permissions,actions:['arbitrary_shell']}}])expect(f.kernel.execute(f.binding(evaluation,extra))).toHaveProperty('code');
 const replacement=flowSuccess(f.kernel.execute(f.projectCommand('RegisterActor',{actor_type:'human',identity_source:'local_operator',display_name:'PUBLIC next owner'})));if(replacement.command_type!=='RegisterActor')throw Error('Actor expected');
 flowSuccess(f.kernel.execute(f.projectCommand('AssignResponsibility',{actor_id:replacement.data.actor.id,role_key:'project_owner',scope:{kind:'project',id:f.project.id}})));
 flowSuccess(f.kernel.execute(f.projectCommand('EndAssignment',{assignment_id:f.assignment.id,expected_assignment_revision:f.assignment.revision,reason:'PUBLIC revoke original owner'})));
 expect(f.kernel.execute(f.binding(evaluation))).toMatchObject({code:'ROLE_NOT_ASSIGNED'});expect(f.store.listProviderBindings()).toEqual([]);
});
it('reuses a legacy technical evaluation only for its original isolated scope after a control reader is installed',()=>{
 const f=fixture(false),result=flowSuccess(f.evaluate('technical_contract'));if(result.command_type!=='EvaluateProvider')throw Error('Evaluation expected');
 Reflect.set(f.port,'readRuntimeControlEvidence',()=>{throw Error('Legacy evaluation must retain its original rule');});
 expect(flowSuccess(f.kernel.execute(f.binding(result.data.evaluation,{binding_scope:'isolated_provider_probe'})))).toHaveProperty('command_type','RegisterProviderBinding');
});
it('derives DENY from independent control counterevidence and refuses a Task binding',()=>{
 const f=fixture();Reflect.set(f.port,'readRuntimeControlEvidence',(_p:unknown,_d:unknown,evidence:ProviderEvidence[])=>{const report=f.report(evidence);report.checks.disk_limit!.result='refutes';return report;});
 const evaluation=f.evaluation();expect(evaluation).toMatchObject({outcome:'DENY',reasons:['disk_limit']});expect(f.kernel.execute(f.binding(evaluation))).toMatchObject({code:'PROVIDER_NOT_EVALUATED'});
});
it('cannot downgrade an extended evaluation to the legacy rule after its original control reader is removed',()=>{
 const f=fixture(),evaluation=f.evaluation();Reflect.deleteProperty(f.port,'readRuntimeControlEvidence');expect(f.kernel.execute(f.binding(evaluation))).toMatchObject({code:'PROVIDER_OUTPUT_INVALID'});expect(f.store.listProviderBindings()).toEqual([]);
});
it('does not reinterpret an old inconclusive evaluation when control evidence becomes available later',()=>{
 const f=fixture(false),evaluation=f.evaluation();Reflect.set(f.port,'readRuntimeControlEvidence',(_p:unknown,_d:unknown,evidence:ProviderEvidence[])=>f.report(evidence));expect(f.kernel.execute(f.binding(evaluation))).toMatchObject({code:'PROVIDER_NOT_EVALUATED'});expect(f.store.getProviderEvaluation(evaluation.id)).toEqual(evaluation);
});
