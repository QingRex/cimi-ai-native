// Existing composition tests use PUBLIC storage projections. Keep their old
// source/identity guards; the complete physical path intersection has its own tests.
vi.mock('../src/agent-codex-writable-storage-local.js',async()=>{
 const runtime=await import('@cimiloop/runtime-adapter'),home=await import('../src/agent-codex-login-home-local.js');
 return{assertCodexRuntimeWritableStorage(local:any,account:any,storage:any,loginHome:any){
  const project=local.store.getProject();if(!project)throw Error('PUBLIC project unavailable');
  const proof=runtime.assertFixedVolumeRuntimeStorage(storage,{project_id:project.id,repository_path:local.location.repositoryPath,data_directory:local.location.dataDirectory});
  if(proof.runtime_ticket.identity_digest!==account.installation.origin.identityDigest)throw Error('PUBLIC storage origin mismatch');
  home.assertCodexRuntimeLoginHome(loginHome,local,account.installation,storage);return{proof,paths:[]};
 }};
});
import {installConstructedNativeFamilySkill} from '../../../tests/fixtures/agent-run-family-skill.js';
import type {OriginalNativeParentPreparation} from '../../../tests/fixtures/agent-run-family-native.js';
import {constructedNamedTranscript} from '../../../tests/fixtures/named-method-transcript.js';
import {createInternalId} from '@cimiloop/protocol/v2';
import {readOriginalAgentRunInputs} from '../src/agent-workspace-tools-local.js';
import { existsSync,mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CimiLoopKernel,requestDigest } from '@cimiloop/kernel';
import { AgentStartLedger, CodexAgentUsageBudget, digest,type FixedVolumeRuntimeStorage } from '@cimiloop/runtime-adapter';
import type {CodexRuntimeLoginHome} from '../src/agent-codex-login-home-local.js';
import type { InstalledCodexUsageBudget } from '../src/agent-codex-usage-budget-local.js';
import type { AgentRuntimeLease } from '../src/agent-runtime-human-start-local.js';
import * as Public from '../src/index.js';
import { executeLocalCommand, installedRunVerifier } from '../src/project.js';
import { createAgentRunProject } from '../../../tests/fixtures/agent-run-project.js';
import { flowSuccess, flowTime } from '../../../tests/fixtures/flow-project.js';

vi.setConfig({testTimeout:120000});
const seam=vi.hoisted(()=>({installed:false,account:undefined as InstalledCodexUsageBudget|undefined,onOpen:undefined as undefined|(()=>void),opens:0,storage:undefined as FixedVolumeRuntimeStorage|undefined,onStorage:undefined as undefined|(()=>void),home:undefined as CodexRuntimeLoginHome|undefined,onHome:undefined as undefined|(()=>void),launches:[] as any[]}));
vi.mock('../src/agent-codex-installation-local.js',async load=>({...await load<typeof import('../src/agent-codex-installation-local.js')>(),hasInstalledCodexAgentRuntime:()=>seam.installed}));
vi.mock('../src/agent-codex-usage-budget-local.js',async load=>({...await load<typeof import('../src/agent-codex-usage-budget-local.js')>(),openInstalledCodexUsageBudget:async()=>{seam.opens++;seam.onOpen?.();return seam.account;}}));
vi.mock('../src/agent-codex-storage-local.js',async load=>({...await load<typeof import('../src/agent-codex-storage-local.js')>(),openCodexRuntimeStorage:async()=>{seam.onStorage?.();return seam.storage;}}));
vi.mock('../src/agent-codex-login-home-local.js',async load=>{const original=await load<typeof import('../src/agent-codex-login-home-local.js')>(),runtime=await import('@cimiloop/runtime-adapter');return{...original,openCodexRuntimeLoginHome:async()=>{seam.onHome?.();return seam.home;},assertCodexRuntimeLoginHome:(...args:Parameters<typeof original.assertCodexRuntimeLoginHome>)=>{if(seam.home&&args[0]===seam.home)return runtime.captureCodexLoginHome(tmpdir());return original.assertCodexRuntimeLoginHome(...args);}};});
vi.mock('@cimiloop/runtime-adapter',async load=>{const original=await load<typeof import('@cimiloop/runtime-adapter')>();return{...original,openWindowsAgentRunClock:async()=>({read:async()=>({format:'cimiloop/agent-run-clock/1.0.0',utc:flowTime,boot_utc:'2026-10-01T00:00:00.000Z',uptime_ms:100000000,machine_digest:digest('PUBLIC clock').value}),close:async()=>{}}),runOpenCodeWorkspaceRuntime:async(input:unknown)=>{seam.launches.push(input);},assertFixedVolumeRuntimeStorage(value:unknown,scope:Parameters<typeof original.assertFixedVolumeRuntimeStorage>[1]){if(value!==undefined&&value===seam.storage&&seam.account)return{runtime_ticket:{identity_digest:seam.account.installation.origin.identityDigest}};return original.assertFixedVolumeRuntimeStorage(value,scope);}};});
// Actual Kernel/project SQLite/check installation/custody. Complete Provider and
// full host/storage proofs are PUBLIC seams; no model/Native or S1 admission is claimed.
const close:(()=>void)[]=[];afterEach(()=>{while(close.length)close.pop()!();vi.useRealTimers();seam.account=undefined;seam.onOpen=undefined;seam.installed=false;seam.opens=0;seam.storage=undefined;seam.onStorage=undefined;seam.home=undefined;seam.onHome=undefined;seam.launches=[];});
function fixture(){
 vi.useFakeTimers({now:new Date(flowTime),toFake:['Date']});
 const root=mkdtempSync(join(tmpdir(),'cimiloop-runtime-admission-')),f=createAgentRunProject(root,'task_execution',100,[{provider:'cimiloop_workspace',resource_type:'repository_path',locator:'src/**',version:'1.0.0'}],['read_files','run_checks'],['src/**']);close.push(()=>f.store.close());
 const harness="import{query}from'./query.ts';if(query()!==1)throw Error('PUBLIC check');\n";writeFileSync(join(root,'src/check.mjs'),harness);f.git('add','src/check.mjs');f.git('commit','--quiet','-m','PUBLIC original checks');const source=f.capture(),dataDirectory=dirname(f.path);
 Public.writeInstance(join(dataDirectory,'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});
 const local=Public.openLocalProject({projectDir:root});close.push(()=>local.store.close());const verifier=installedRunVerifier(local)!;
 const agent=new CimiLoopKernel({store:local.store,caller:f.caller,now:()=>flowTime,runVerifier:verifier});
 const origin=AgentStartLedger.initialize(join(dataDirectory,'PUBLIC-origin'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC user').value});close.push(()=>origin.close());
 const original=f.runPort.agent.admitContext.bind(f.runPort.agent);let active=true,admissions=0;
 const full={admit:(...args:Parameters<typeof original>)=>{admissions++;if(!active)throw Error('PUBLIC host lost');return original(...args);},verifyLaunch:()=>{if(!active)throw Error('PUBLIC host lost');return digest('PUBLIC full launch');},verifyTool:()=>{if(!active)throw Error('PUBLIC host lost');return digest('PUBLIC full tools');},verifyModel:()=>{if(!active)throw Error('PUBLIC host lost');return digest('PUBLIC full model');}};
 const options={origin,nodeBinary:process.execPath,templates:[{check_id:'query_test',profile:'node_test' as const,entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:digest(harness).value},{path:'src/query.ts'}],max_elapsed_ms:1000,max_output_bytes:4096}],full,guard:()=>{if(!active)throw Error('PUBLIC installation lost');}};
 const open=()=>{const Class=Reflect.get(Public,'LocalAgentRuntimeAdmission');expect(Class).toBeTypeOf('function');return Reflect.apply(Class.open,Class,[local,options]) as Promise<{custody:unknown;checks:unknown;guard():void;release():void}>;};
 const prepare=()=>agent.execute({...f.prepareCommand(),payload:{...f.pins,source_snapshot_ref:{object_type:'source_snapshot',id:source.id}}});
 return{f,local,verifier,origin,full,options,open,prepare,agent,setActive:(value:boolean)=>{active=value;},admissions:()=>admissions};
}
function installMethodFixture(f:ReturnType<typeof fixture>){
 const prepared={f:f.f,dataDirectory:f.local.location.dataDirectory,ledger:f.origin} as unknown as OriginalNativeParentPreparation,s=installConstructedNativeFamilySkill(prepared),content=s.inputs.packages.content;
 const artifact=(value:unknown)=>content.storeContent(Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)),'provider_probe_artifact');
 const samples=Array.from({length:2},()=>{const invocation_key=createInternalId(),plan=s.inputs.read(f.f.project,s.descriptor,{invocation_key,method_name:'entry',input_ref:s.input_ref}),original=constructedNamedTranscript(plan.profile,plan.files,{purpose:'review',findings:[],limitations:['PUBLIC qualification only']},plan.prompt);return{invocation_key,input_ref:s.input_ref,transcript_ref:artifact(original.transcript),stdout_ref:artifact(original.stdout),native_proof_ref:artifact(original.native)};});
 const evidence=content.storeContent(Buffer.from(JSON.stringify({format:'cimiloop/named-skill-method-evidence/1.0.0',project_id:f.f.project.id,descriptor_ref:{object_type:'provider_descriptor',id:s.descriptor.id},descriptor_digest:{algorithm:'sha256',value:requestDigest(s.descriptor)},runtime_binding:f.f.pins.runtime_binding,method_name:'entry',purpose:'review',observed_at:flowTime,samples})),'named_skill_method_evidence');
 let admits=0,available=true;
 const methods={evidence:()=>{if(!available)throw Error('PUBLIC original method proof unavailable');return evidence;},originals:s.qualificationOriginals,admitCurrent(){admits++;}};
 Reflect.set(f.options,'skills',{methods,catalog(_project:unknown,record:{run_id:string}){const scope=readOriginalAgentRunInputs(f.local,record.run_id).scope,body={format:'cimiloop/agent-parent-skill-catalog/2.0.0',scope_digest:digest(JSON.stringify(scope)).value,entries:[{skill_alias:'review',method_name:'entry',input_alias:'current',skill_binding:scope.skill_bindings[0],input_recipe:{format:'cimiloop/original-run-candidate/1.0.0',goal:'Review complete original current source',spec:'PUBLIC fixture specification',standards:'PUBLIC fixture standards',required_check_ids:['query_test']}}]};return{...body,catalog_digest:digest(JSON.stringify(body)).value};}});
 return{s,methods,admits:()=>admits,setAvailable:(value:boolean)=>{available=value;}};
}

describe('shared original Runtime admission lease',()=>{
 it('keeps the Human original in Host1, prepares as the fixed Agent and reserves only once across host reopening',async()=>{const f=fixture();let lease=await f.open();try{
  const original={...f.f.prepareCommand(),actor_id:f.f.actor.id,acting_role:'technical_owner',source:{origin:'human_ui',producer:'cimiloop-workbench',repository_path:f.local.location.repositoryPath},payload:{...f.f.pins,source_snapshot_ref:{object_type:'source_snapshot',id:f.f.capture().id}}};
  const input=(command:typeof original)=>({command_id:command.command_id,requested_at:command.requested_at,acting_role:command.acting_role,command_type:command.command_type,target:command.target,expected_revision:command.expected_revision,payload:command.payload});
  const prepared=flowSuccess(executeLocalCommand(f.local,input(original)));if(prepared.command_type!=='PrepareRunContext'||!('runtime_binding' in prepared.data.context))throw Error('Agent expected');
  expect(prepared.data.context).toMatchObject({producer_actor_id:f.f.agent.id,executor_ref:{id:f.f.agent.id}});
  expect(f.origin.listExclusive('human_agent_preparation')).toMatchObject([{basis:{human_request:{...original,correlation_id:original.command_id},agent_command:{actor_id:f.f.agent.id,source:{origin:'agent'}}}}]);
  lease.release();lease=await f.open();expect(executeLocalCommand(f.local,input(original))).toEqual(prepared);
  expect(executeLocalCommand(f.local,{...input(original),requested_at:'2026-10-04T00:00:00.000Z'})).toEqual(prepared);expect(f.admissions()).toBe(1);
  expect(Public.executeHumanAgentRunCommand(f.local,{...original,correlation_id:f.f.prepareCommand().correlation_id,requested_at:'2026-10-05T00:00:00.000Z'})).toEqual(prepared);expect(f.admissions()).toBe(1);
  const reserve={...f.f.reserveCommand({...prepared.data,context:prepared.data.context}),actor_id:f.f.actor.id,acting_role:'technical_owner',source:original.source};
  const reserveInput={command_id:reserve.command_id,requested_at:reserve.requested_at,acting_role:reserve.acting_role,command_type:reserve.command_type,target:reserve.target,expected_revision:reserve.expected_revision,payload:reserve.payload};
  const reserved=flowSuccess(executeLocalCommand(f.local,reserveInput));expect(executeLocalCommand(f.local,reserveInput)).toEqual(reserved);expect(f.local.store.listRuns(f.f.change.id)).toHaveLength(1);expect(f.local.store.getExecutionObject('task',f.f.item.task_id)?.usage.attempts_consumed).toBe(1);
  expect(()=>executeLocalCommand(f.local,{...input(original),payload:{...original.payload,skill_bindings:[]}})).toThrow(expect.objectContaining({code:'COMMAND_ID_REUSED'}));
 }finally{lease.release();}});
 it('refuses to manufacture the Human original for an existing Agent receipt',async()=>{const f=fixture(),lease=await f.open();try{
  const command={...f.f.prepareCommand(),payload:{...f.f.pins,source_snapshot_ref:{object_type:'source_snapshot',id:f.f.capture().id}}};flowSuccess(f.agent.execute(command));
  expect(()=>Public.executeHumanAgentRunCommand(f.local,{...command,actor_id:f.f.actor.id,acting_role:'technical_owner',source:{origin:'human_cli',producer:'cimiloop-cli',repository_path:f.local.location.repositoryPath}})).toThrow(expect.objectContaining({code:'CAPABILITY_UNAVAILABLE'}));
  expect(f.origin.listExclusive('human_agent_preparation')).toEqual([]);expect(f.local.store.listRuntimeRecords('context_manifest',f.f.change.id)).toHaveLength(1);expect(f.admissions()).toBe(1);
 }finally{lease.release();}});
 it('refuses a replaced Human authorization callback without creating a Host claim',async()=>{const f=fixture(),lease=await f.open(),original=f.local.kernel.authorizeAgentRunPreparation;try{
  vi.spyOn(f.local.kernel,'authorizeAgentRunPreparation').mockImplementation(original.bind(f.local.kernel));
  const command={...f.f.prepareCommand(),actor_id:f.f.actor.id,acting_role:'technical_owner',source:{origin:'human_ui',producer:'cimiloop-workbench',repository_path:f.local.location.repositoryPath}};
  expect(()=>Public.executeHumanAgentRunCommand(f.local,command)).toThrow(expect.objectContaining({code:'CAPABILITY_UNAVAILABLE'}));expect(f.origin.listExclusive('human_agent_preparation')).toEqual([]);expect(f.admissions()).toBe(0);
 }finally{vi.restoreAllMocks();lease.release();}});
 it('installs admission before Context creation, replays one command, and restores the prior ports on release',async()=>{const f=fixture(),before=f.verifier.agent.admitContext;expect(f.prepare()).toMatchObject({code:'CAPABILITY_UNAVAILABLE'});const lease=await f.open();try{const command={...f.f.prepareCommand(),payload:{...f.f.pins,source_snapshot_ref:{object_type:'source_snapshot',id:f.f.capture().id}}};const kernel=new CimiLoopKernel({store:f.local.store,caller:f.f.caller,now:()=>flowTime,runVerifier:f.verifier});const result=flowSuccess(kernel.execute(command));expect(result.command_type).toBe('PrepareRunContext');expect(kernel.execute(command)).toEqual(result);expect(f.admissions()).toBe(1);expect(f.verifier.agent.checkRunAuthority).toBeTypeOf('function');expect(f.verifier.agent.checkToolAuthority).toBeTypeOf('function');expect(f.verifier.agent.checkModelAuthority).toBeTypeOf('function');lease.guard();}finally{lease.release();}expect(f.verifier.agent.admitContext).toBe(before);expect(()=>lease.guard()).toThrow();lease.release();});
 it('rejects overlapping leases and loses admission immediately when the full installation guard changes',async()=>{const f=fixture(),lease=await f.open();try{await expect(f.open()).rejects.toThrow();f.setActive(false);expect(f.prepare()).toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(f.admissions()).toBe(0);}finally{lease.release();}});
 it('does not overwrite another service on release and leaves the borrowed Host alive',async()=>{const f=fixture(),lease=await f.open(),foreign=()=>digest('PUBLIC foreign callback');f.verifier.agent.checkRunAuthority=foreign;expect(()=>lease.release()).toThrow();expect(f.verifier.agent.checkRunAuthority).toBe(foreign);expect(f.origin.listExclusive('untouched')).toEqual([]);const next=await f.open();next.release();});
 it('refuses an incomplete full port before installing Context admission',async()=>{const f=fixture(),before=f.verifier.agent.admitContext;Reflect.set(f.full,'verifyModel',undefined);await expect(f.open()).rejects.toThrow();expect(f.verifier.agent.admitContext).toBe(before);expect(f.prepare()).toMatchObject({code:'CAPABILITY_UNAVAILABLE'});});
 it('keeps all prior descriptors intact when a later callback slot is non-writable',async()=>{const f=fixture(),before=Object.getOwnPropertyDescriptor(f.verifier.agent,'admitContext'),foreign=()=>digest('PUBLIC fixed callback');Object.defineProperty(f.verifier.agent,'checkRunAuthority',{value:foreign,writable:false,configurable:true,enumerable:true});await expect(f.open()).rejects.toThrow();expect(Object.getOwnPropertyDescriptor(f.verifier.agent,'admitContext')).toEqual(before);expect(f.verifier.agent.checkRunAuthority).toBe(foreign);Reflect.deleteProperty(f.verifier.agent,'checkRunAuthority');const lease=await f.open();lease.release();});
 it('refuses an asynchronous full proof without persisting a Context or leaving an unhandled rejection',async()=>{const f=fixture();Reflect.set(f.full,'admit',async()=>{throw Error('PUBLIC asynchronous proof denied');});const lease=await f.open();try{expect(f.prepare()).toMatchObject({code:'CAPABILITY_UNAVAILABLE'});await Promise.resolve();expect(f.local.store.listRuntimeRecords('context_manifest',f.f.change.id)).toHaveLength(0);}finally{lease.release();}});
 it('does not install through an asynchronous guard and permits a later valid lease',async()=>{const f=fixture(),prior=Object.getOwnPropertyDescriptor(f.verifier.agent,'admitContext'),guard=f.options.guard;Reflect.set(f.options,'guard',async()=>{});await expect(f.open()).rejects.toThrow();expect(Object.getOwnPropertyDescriptor(f.verifier.agent,'admitContext')).toEqual(prior);f.options.guard=guard;const lease=await f.open();lease.release();});
 it('narrows the default production model catalog to the original WorkItem actions',async()=>{const f=fixture(),admission=await f.open();try{
  const prepared=flowSuccess(f.prepare());if(prepared.command_type!=='PrepareRunContext'||!('runtime_binding' in prepared.data.context))throw Error('Expected Agent context');
  const reserved=flowSuccess(f.agent.execute(f.f.reserveCommand({...prepared.data,context:prepared.data.context})));if(reserved.command_type!=='ReserveRun')throw Error('Expected original Run');
  const account_digest=digest('PUBLIC Codex login').value,quota_account_digest=digest('PUBLIC Codex quota').value,budget=CodexAgentUsageBudget.initialize(f.origin,{account_digest,quota_account_digest,model_calls:2,output_tokens:4096});let released=false;
  seam.account={root:'PUBLIC shared account',budget,installation:{origin:f.origin,root:'PUBLIC copied bundle',binary:process.execPath,native_binary:process.execPath,node_binary:process.execPath,model:'gpt-6-luna',account_digest,quota_account_digest,output_profile:'bounded_2048/1.0.0',usage_policy:'require_ordinary_permission/1.0.0',disabled_mcp_servers:[],checks:f.options.templates,installation_digest:digest('PUBLIC copied bundle').value,guard(){if(released)throw Error('PUBLIC account released');},release(){}},guard(){if(released)throw Error('PUBLIC account released');},release(){released=true;}};
  await expect(Public.productionAgentRuntime(reserved.data.run.id,f.local)).rejects.toMatchObject({details:{missing:['Codex 原固定卷运行范围']}});expect(released).toBe(true);expect(budget.snapshot().held.model_calls).toBe(0);
  released=false;seam.storage={} as FixedVolumeRuntimeStorage;
  await expect(Public.productionAgentRuntime(reserved.data.run.id,f.local)).rejects.toMatchObject({details:{missing:['Codex 原固定卷登录目录']}});expect(released).toBe(true);expect(budget.snapshot().held.model_calls).toBe(0);released=false;seam.home={} as CodexRuntimeLoginHome;
  const lease=await Public.productionAgentRuntime(reserved.data.run.id,f.local) as AgentRuntimeLease;try{expect(lease.runtime.originalScope(reserved.data.run.id).run_id).toBe(reserved.data.run.id);expect(existsSync(join(f.local.location.dataDirectory,'codex-runtime-originals',f.local.instance.project_id,reserved.data.run.id))).toBe(true);expect(budget.snapshot().held.model_calls).toBe(0);expect(seam.opens).toBe(3);
   expect(await lease.runtime.start(reserved.data.run.id)).toMatchObject({outcome:'unknown',completion_proven:false});expect(seam.launches).toHaveLength(1);expect(seam.launches[0].model.toolNames).toEqual(['cimi_read','cimi_check']);expect(JSON.parse(seam.launches[0].prompt).work_item.allowed_actions).toEqual(['read_files','run_checks']);expect(budget.snapshot().held.model_calls).toBe(0);
  }finally{await lease.release();}expect(released).toBe(true);admission.guard();expect(budget.snapshot().held.model_calls).toBe(0);
 }finally{admission.release();}});
 it('refuses an installed Codex without a complete admission lease instead of choosing the old HTTP connection',async()=>{const f=fixture();seam.installed=true;await expect(Public.productionAgentRuntime('PUBLIC not launched',f.local)).rejects.toMatchObject({details:{production_admission:'unapproved',missing:['Codex Context 前完整准入']}});expect(seam.opens).toBe(0);});
 it('refuses a missing Codex account policy while keeping the shared admission owned by its caller',async()=>{const f=fixture(),admission=await f.open();try{await expect(Public.productionAgentRuntime('PUBLIC no effect',f.local)).rejects.toMatchObject({details:{production_admission:'unapproved',missing:['Codex 原账户容量政策']}});admission.guard();}finally{admission.release();}});
 it('rechecks the admission after account-open await and releases only the returned account on failure',async()=>{const f=fixture(),admission=await f.open();let released=0;seam.account={release(){released++;}} as unknown as InstalledCodexUsageBudget;seam.onOpen=()=>admission.release();await expect(Public.productionAgentRuntime('PUBLIC no effect',f.local)).rejects.toThrow();expect(released).toBe(1);expect(()=>admission.guard()).toThrow();});
 it('rechecks the shared admission after storage-open await and releases the account without a Runtime',async()=>{const f=fixture(),admission=await f.open();let released=0;seam.account={installation:{},guard(){},release(){released++;}} as unknown as InstalledCodexUsageBudget;seam.storage={} as FixedVolumeRuntimeStorage;seam.onStorage=()=>admission.release();await expect(Public.productionAgentRuntime('PUBLIC no effect',f.local)).rejects.toThrow();expect(released).toBe(1);expect(()=>admission.guard()).toThrow();});
 it('installs real Skill preparation/current/result ports and parent history in the same owned lease, then restores both original slots',async()=>{
  const f=fixture(),prior=Object.getOwnPropertyDescriptor(f.verifier.agent,'skills'),parent=Object.getOwnPropertyDescriptor(f.local,'agentParentSkillResults');
  const methods={evidence:()=>{throw Error('PUBLIC original evidence absent');},originals:{verify:()=>{throw Error('PUBLIC original method absent');}},admitCurrent(){}};
  Reflect.set(f.options,'skills',{methods,catalog:()=>{throw Error('PUBLIC no catalog selected');}});
  const lease=await f.open();try{expect(f.verifier.agent.skills?.prepare).toBeTypeOf('function');expect(f.verifier.agent.skills?.readResult).toBeTypeOf('function');expect(f.verifier.agent.skills?.checkExecutionAuthority).toBeTypeOf('function');expect(f.verifier.agent.skills?.verifyParentCandidate).toBeTypeOf('function');expect(Object.isFrozen(f.verifier.agent.skills)).toBe(true);expect(f.local.agentParentSkillResults?.forOriginal).toBeTypeOf('function');lease.guard();}finally{lease.release();}
  expect(Object.getOwnPropertyDescriptor(f.verifier.agent,'skills')).toEqual(prior);expect(Object.getOwnPropertyDescriptor(f.local,'agentParentSkillResults')).toEqual(parent);
 });
 it('refuses incomplete method originals instead of silently installing an ordinary Runtime without requested Skill support',async()=>{
  const f=fixture(),prior=Object.getOwnPropertyDescriptor(f.verifier.agent,'skills');Reflect.set(f.options,'skills',{methods:{evidence(){},admitCurrent(){}},catalog(){}});
  await expect(f.open()).rejects.toThrow();expect(Object.getOwnPropertyDescriptor(f.verifier.agent,'skills')).toEqual(prior);expect(f.admissions()).toBe(0);
 });
 it('revokes the shared Skill installation on replacement and restores its owned ports without closing the borrowed Host',async()=>{
  const f=fixture(),methods={evidence:()=>{throw Error('PUBLIC no proof');},originals:{verify:()=>{throw Error('PUBLIC no proof');}},admitCurrent(){}};Reflect.set(f.options,'skills',{methods,catalog:()=>{throw Error('PUBLIC no catalog');}});
  const lease=await f.open();methods.originals.verify=()=>{throw Error('PUBLIC substituted proof');};try{expect(()=>lease.guard()).toThrow();expect(f.prepare()).toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(f.admissions()).toBe(0);}finally{lease.release();}expect(f.origin.listExclusive('untouched')).toEqual([]);
 });

 it('prepares the actual imported method and rechecks its pinned qualification through the original Agent Kernel before child effects',async()=>{
  const f=fixture(),m=installMethodFixture(f),lease=await f.open();try{
   const prepared=flowSuccess(f.prepare());if(prepared.command_type!=='PrepareRunContext'||!('runtime_binding'in prepared.data.context))throw Error('Agent context');
   const reserved=flowSuccess(f.agent.execute(f.f.reserveCommand({...prepared.data,context:prepared.data.context})));if(reserved.command_type!=='ReserveRun')throw Error('Original Run');
   const command=f.f.command('ReserveSkillInvocation','run',reserved.data.run.id,{skill_binding_ref:{object_type:'provider_binding',id:m.s.binding.id},method_name:'entry',input_ref:m.s.input_ref}),child=flowSuccess(f.agent.execute(command));if(child.command_type!=='ReserveSkillInvocation')throw Error('Original child');
   const invocation=child.data.invocation,scope=readOriginalAgentRunInputs(f.local,reserved.data.run.id).scope,request={parent:scope,invocation_ref:{object_type:'skill_invocation' as const,id:invocation.id},input_digest:invocation.input_digest},sequence=f.local.store.asOfEventSequence();
   expect(f.agent.assessSkillInvocationExecution(request)).toMatchObject({decision:'ALLOW',authority:{invocation_id:invocation.id,invocation_key:invocation.invocation_key}});expect(m.admits()).toBeGreaterThanOrEqual(4);expect(f.local.store.asOfEventSequence()).toBe(sequence);expect(f.origin.listExclusive('skill_invocation_admission')).toHaveLength(1);expect(f.local.store.listRuns(f.f.change.id)).toHaveLength(1);expect(seam.launches).toHaveLength(0);
   m.methods.admitCurrent=()=>{throw Error('PUBLIC current entitlement revoked');};expect(f.agent.assessSkillInvocationExecution(request)).toMatchObject({decision:'DENY'});expect(f.origin.listExclusive('skill_invocation_dispatch')).toHaveLength(0);
  }finally{lease.release();}
 });
 it('automatically composes parent Skill tools in the default factory without a caller-supplied parent Host',async()=>{
  const f=fixture(),m=installMethodFixture(f),admission=await f.open();try{
   const prepared=flowSuccess(f.prepare());if(prepared.command_type!=='PrepareRunContext'||!('runtime_binding'in prepared.data.context))throw Error('Agent context');const reserved=flowSuccess(f.agent.execute(f.f.reserveCommand({...prepared.data,context:prepared.data.context})));if(reserved.command_type!=='ReserveRun')throw Error('Original Run');
   const account_digest=digest('PUBLIC login').value,quota_account_digest=digest('PUBLIC quota').value,budget=CodexAgentUsageBudget.initialize(f.origin,{account_digest,quota_account_digest,model_calls:4,output_tokens:8192});let released=false;
   seam.account={root:'PUBLIC budget',budget,installation:{origin:f.origin,root:f.local.location.dataDirectory,binary:process.execPath,native_binary:process.execPath,node_binary:process.execPath,model:'gpt-6-luna',account_digest,quota_account_digest,output_profile:'bounded_2048/1.0.0',usage_policy:'require_ordinary_permission/1.0.0',disabled_mcp_servers:[],checks:f.options.templates,installation_digest:digest('PUBLIC installed bundle').value,guard(){if(released)throw Error('PUBLIC released account');},release(){}},guard(){if(released)throw Error('PUBLIC released account');},release(){released=true;}};seam.storage={} as FixedVolumeRuntimeStorage;seam.home={} as CodexRuntimeLoginHome;
   m.setAvailable(false);await expect(Public.productionAgentRuntime(reserved.data.run.id,f.local)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE'});expect(released).toBe(true);expect(seam.launches).toHaveLength(0);expect(budget.snapshot().held.model_calls).toBe(0);m.setAvailable(true);released=false;
   const lease=await Public.productionAgentRuntime(reserved.data.run.id,f.local) as AgentRuntimeLease;try{const started=await lease.runtime.start(reserved.data.run.id);/* PUBLIC launch creates no Native claim: it must remain Unknown. */expect(started).toMatchObject({outcome:'unknown',completion_proven:false});expect(seam.launches).toHaveLength(1);const packet=JSON.parse(seam.launches[0].prompt);expect(packet).toMatchObject({format:'cimiloop/agent-runtime-task-packet/3.0.0',parent_skill_catalog:{entries:[{skill_alias:'review',method_name:'entry',input_alias:'current'}]}});expect(seam.launches[0].parentSkill.sdkCatalog).toEqual(packet.parent_skill_catalog);expect(budget.snapshot().held.model_calls).toBe(0);expect(f.local.store.listRuntimeRecords('skill_invocation',f.f.change.id)).toHaveLength(0);expect(m.admits()).toBe(0);}finally{await lease.release();}
   expect(released).toBe(true);admission.guard();
  }finally{admission.release();}
 });

});
