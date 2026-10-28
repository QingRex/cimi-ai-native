import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {AgentStartLedger,CodexAgentUsageBudget,digest} from '@cimiloop/runtime-adapter';
import * as app from '../src/index.js';
import {installedRunVerifier} from '../src/project.js';
import {createAgentRunProject} from '../../../tests/fixtures/agent-run-project.js';
import {flowTime} from '../../../tests/fixtures/flow-project.js';
import * as productionCustody from '../src/agent-production-custody-local.js';
vi.setConfig({testTimeout:120000});

const seam=vi.hoisted(()=>({account:undefined as app.InstalledCodexUsageBudget|undefined,onOpen:undefined as (()=>void)|undefined,opens:0,full:undefined as app.AgentProductionCustodyPort|undefined,closed:0,installation:undefined as app.InstalledCodexAgentRuntime|undefined}));
vi.mock('../src/agent-codex-installation-local.js',async load=>({...await load<typeof import('../src/agent-codex-installation-local.js')>(),openInstalledCodexAgentRuntime:async()=>seam.installation}));
vi.mock('../src/agent-codex-usage-budget-local.js',async load=>({...await load<typeof import('../src/agent-codex-usage-budget-local.js')>(),openInstalledCodexUsageBudget:async()=>{seam.opens++;seam.onOpen?.();return seam.account;}}));
vi.mock('../src/agent-codex-storage-local.js',async load=>({...await load<typeof import('../src/agent-codex-storage-local.js')>(),openCodexRuntimeStorage:async()=>({PUBLIC:true})}));
vi.mock('../src/agent-codex-login-home-local.js',async load=>({...await load<typeof import('../src/agent-codex-login-home-local.js')>(),openCodexRuntimeLoginHome:async()=>({PUBLIC:true})}));
vi.mock('../src/agent-codex-writable-storage-local.js',()=>({assertCodexRuntimeWritableStorage(){return{proof:{PUBLIC:'current full writable-source projection'},paths:[]};}}));
// The complete custody seam is introduced after the entry-point red run. It is
// PUBLIC qualification/storage only, never real production admission evidence.
const closers:(()=>void)[]=[];
afterEach(()=>{vi.restoreAllMocks();while(closers.length)closers.pop()!();vi.useRealTimers();seam.account=undefined;seam.onOpen=undefined;seam.opens=0;seam.full=undefined;seam.closed=0;seam.installation=undefined;});
function fixture(){
 vi.useFakeTimers({now:new Date(flowTime),toFake:['Date']});const root=mkdtempSync(join(tmpdir(),'cimiloop-default-host-')),f=createAgentRunProject(root,'task_execution',100,[{provider:'cimiloop_workspace',resource_type:'repository_path',locator:'src/**',version:'1.0.0'}],['read_files','run_checks'],['src/**']);closers.push(()=>f.store.close());
 const check="import{query}from'./query.ts';if(query()!==1)throw Error('PUBLIC check');\n";writeFileSync(join(root,'src/check.mjs'),check);f.git('add','src/check.mjs');f.git('commit','--quiet','-m','PUBLIC checks');const source=f.capture(),data=dirname(f.path);
 app.writeInstance(join(data,'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});const local=app.openLocalProject({projectDir:root});closers.push(()=>local.store.close());
 const origin=AgentStartLedger.initialize(join(data,'PUBLIC-origin'),{machine_digest:'1'.repeat(64),principal_digest:'2'.repeat(64)});closers.push(()=>origin.close());const budget=CodexAgentUsageBudget.initialize(origin,{account_digest:'3'.repeat(64),quota_account_digest:'4'.repeat(64),model_calls:2,output_tokens:4096});let released=false;
 const templates=[{check_id:'query_test',profile:'node_test' as const,entry:'src/check.mjs',inputs:[{path:'src/check.mjs',expected_digest:digest(check).value},{path:'src/query.ts'}],max_elapsed_ms:1000,max_output_bytes:4096}];
 seam.installation={origin,root:data,binary:process.execPath,native_binary:process.execPath,node_binary:process.execPath,model:'gpt-6-luna',account_digest:'3'.repeat(64),quota_account_digest:'4'.repeat(64),output_profile:'bounded_2048/1.0.0',usage_policy:'require_ordinary_permission/1.0.0',disabled_mcp_servers:[],checks:templates,installation_digest:'5'.repeat(64),guard(){if(released)throw Error('PUBLIC closed');},release(){}};
 seam.account={installation:seam.installation,budget,root:join(data,'PUBLIC-budget'),guard(){if(released)throw Error('PUBLIC closed');},release(){released=true;seam.closed++;}};
 const original=f.runPort.agent.admitContext.bind(f.runPort.agent);seam.full={admit:original,verifyLaunch:()=>digest('PUBLIC launch'),verifyModel:()=>digest('PUBLIC model'),verifyTool:()=>digest('PUBLIC tools')};
 const command={...f.prepareCommand(),actor_id:local.instance.actor_id,acting_role:'technical_owner' as const,source:{origin:'human_cli' as const,producer:'cimiloop-cli',repository_path:root},payload:{...f.pins,source_snapshot_ref:{object_type:'source_snapshot' as const,id:source.id}}};return{f,local,origin,budget,command,verifier:installedRunVerifier(local)!};
}
const entry=()=>{const method=Reflect.get(app,'executeHumanAgentRunCommandAsync');expect(method).toBeTypeOf('function');return method as (local:app.LocalProject,command:unknown,guard?:()=>void)=>Promise<unknown>;};
it('provides the shared asynchronous default host entry without requiring callers to construct a full port',()=>{entry();expect(Reflect.get(app,'openInstalledCodexProductionHost')).toBeTypeOf('function');});
it('rejects a new Codex preparation before account open after explicit local selection',async()=>{
 const f=fixture(),before=f.local.store.asOfEventSequence();mkdirSync(join(f.local.location.dataDirectory,'dedicated-runtime-placement'));
 await expect(entry()(f.local,f.command)).rejects.toMatchObject({code:'CAPABILITY_UNAVAILABLE',details:{plan:'local OpenAI-compatible'}});
 expect(seam.opens).toBe(0);expect(f.local.store.asOfEventSequence()).toBe(before);
});
it('revokes an already borrowed Codex execution host when local selection appears',async()=>{
 const f=fixture();vi.spyOn(productionCustody,'createInstalledCodexProductionCustody').mockReturnValue({...seam.full!,guard(){},release(){}});
 const host=await app.openInstalledCodexProductionHost(f.local);if(!host)throw Error('Expected old original host');
 try{mkdirSync(join(f.local.location.dataDirectory,'dedicated-runtime-placement'));expect(()=>host.guard()).toThrow();expect(()=>host.admission.guard()).toThrow();}
 finally{host.release();}expect(seam.closed).toBe(1);expect(f.budget.snapshot().held.model_calls).toBe(0);
});
it('recovers an original Human preparation receipt without reopening the model account or full qualification',async()=>{
 const execute=entry(),f=fixture(),admission=await app.LocalAgentRuntimeAdmission.open(f.local,{origin:f.origin,nodeBinary:process.execPath,templates:seam.installation!.checks,full:seam.full!});let first:unknown;
 try{first=app.executeHumanAgentRunCommand(f.local,f.command);expect(first).toHaveProperty('command_type','PrepareRunContext');}finally{admission.release();}
 const before=f.local.store.asOfEventSequence();seam.account=undefined;expect(await execute(f.local,f.command)).toEqual(first);expect(seam.opens).toBe(0);expect(f.local.store.asOfEventSequence()).toBe(before);expect(f.local.store.listRuntimeRecords('context_manifest',f.f.change.id)).toHaveLength(1);
 await expect(execute(f.local,{...f.command,payload:{...f.command.payload,source_snapshot_ref:{object_type:'source_snapshot',id:f.f.source.id}}})).rejects.toMatchObject({code:'COMMAND_ID_REUSED'});
});
it('retains an original receipt but refuses a missing original Human-to-Agent mapping instead of executing a new request',async()=>{
 const execute=entry(),f=fixture();const other={...f.f.context('change_owner'),command_type:'PauseChange',target:{object_type:'change',id:f.f.change.id},expected_revision:f.f.store.getChange(f.f.change.id)!.revision,payload:{reason:'PUBLIC unrelated receipt'}};const result=f.f.humanKernel.execute(other);expect(result).toHaveProperty('command_type','PauseChange');
 const before=f.local.store.asOfEventSequence();await expect(execute(f.local,{...f.command,command_id:other.command_id})).rejects.toThrow();expect(seam.opens).toBe(0);expect(f.local.store.asOfEventSequence()).toBe(before);
});
it('reads the active trusted host original on a lost response without requiring a separate installed Codex origin',async()=>{
 const f=fixture(),admission=await app.LocalAgentRuntimeAdmission.open(f.local,{origin:f.origin,nodeBinary:process.execPath,templates:seam.installation!.checks,full:seam.full!});
 try{const first=app.executeHumanAgentRunCommand(f.local,f.command);expect(first).toHaveProperty('command_type','PrepareRunContext');seam.installation=undefined;seam.full!.verifyModel=()=>{throw Error('PUBLIC qualification removed');};expect(()=>admission.guard()).toThrow();const before=f.local.store.asOfEventSequence();expect(await entry()(f.local,f.command)).toEqual(first);expect(seam.opens).toBe(0);expect(f.local.store.asOfEventSequence()).toBe(before);expect(()=>admission.guard()).toThrow();}finally{admission.release();}
});
it('refuses default installation while the installed control source set is incomplete, without installing verifier slots or consuming capacity',async()=>{
 const f=fixture(),prior=Object.getOwnPropertyDescriptor(f.verifier.agent,'admitContext'),before=f.local.store.asOfEventSequence();
 await expect(app.openInstalledCodexProductionHost(f.local)).rejects.toMatchObject({details:{production_admission:'unapproved',missing:['cost_accounting_and_cap','crash_recovery']}});
 expect(Object.getOwnPropertyDescriptor(f.verifier.agent,'admitContext')).toEqual(prior);expect(seam.closed).toBe(1);expect(f.budget.snapshot().held.model_calls).toBe(0);expect(f.local.store.asOfEventSequence()).toBe(before);
});
it('shares one cold host across concurrent borrowers and restores slots only after its last reference closes',async()=>{
 const f=fixture(),prior=Object.getOwnPropertyDescriptor(f.verifier.agent,'admitContext');let fullClosed=0;const full={...seam.full!,guard(){},release(){fullClosed++;}};
 vi.spyOn(productionCustody,'createInstalledCodexProductionCustody').mockReturnValue(full);
 const [first,second]=await Promise.all([app.openInstalledCodexProductionHost(f.local),app.openInstalledCodexProductionHost(f.local)]);if(!first||!second)throw Error('Expected default host');expect(seam.opens).toBe(1);expect(first.admission).toBe(second.admission);expect(app.LocalAgentRuntimeAdmission.current(f.local)).toBe(first.admission);
 first.release();expect(seam.closed).toBe(0);second.guard();second.release();expect(fullClosed).toBe(1);expect(seam.closed).toBe(1);expect(app.LocalAgentRuntimeAdmission.current(f.local)).toBeUndefined();expect(Object.getOwnPropertyDescriptor(f.verifier.agent,'admitContext')).toEqual(prior);expect(()=>first.guard()).toThrow();
});
it('opens the default shared host for an ordinary Human preparation and releases it after the original Agent command',async()=>{
 const f=fixture(),prior=Object.getOwnPropertyDescriptor(f.verifier.agent,'admitContext');vi.spyOn(productionCustody,'createInstalledCodexProductionCustody').mockReturnValue({...seam.full!,guard(){},release(){}});
 const result=await entry()(f.local,f.command);expect(result).toHaveProperty('command_type','PrepareRunContext');expect(seam.opens).toBe(1);expect(seam.closed).toBe(1);expect(f.local.store.listRuntimeRecords('context_manifest',f.f.change.id)).toHaveLength(1);expect(f.origin.listExclusive('human_agent_preparation')).toHaveLength(1);expect(Object.getOwnPropertyDescriptor(f.verifier.agent,'admitContext')).toEqual(prior);expect(f.budget.snapshot().held.model_calls).toBe(0);
});
it('rejects replacement of the original Kernel authorization method after account-open await and closes only the returned account',async()=>{
 const f=fixture(),original=f.local.kernel.authorizeAgentRunPreparation,full=vi.spyOn(productionCustody,'createInstalledCodexProductionCustody').mockReturnValue({...seam.full!,guard(){},release(){}});seam.onOpen=()=>{f.local.kernel.authorizeAgentRunPreparation=original.bind(f.local.kernel);};
 try{await expect(entry()(f.local,f.command)).rejects.toThrow();expect(full).not.toHaveBeenCalled();expect(seam.closed).toBe(1);expect(f.local.store.listRuntimeRecords('context_manifest',f.f.change.id)).toHaveLength(0);expect(f.budget.snapshot().held.model_calls).toBe(0);}finally{f.local.kernel.authorizeAgentRunPreparation=original;}
});
it('rejects a Human identity changed by the final response guard while retaining the already committed original for recovery',async()=>{
 const f=fixture(),original=structuredClone(f.local.instance);vi.spyOn(productionCustody,'createInstalledCodexProductionCustody').mockReturnValue({...seam.full!,guard(){},release(){}});
 try{await expect(entry()(f.local,f.command,()=>{if(seam.closed)f.local.instance={...original,actor_id:f.f.agent.id};})).rejects.toThrow();expect(seam.closed).toBe(1);expect(f.local.store.listRuntimeRecords('context_manifest',f.f.change.id)).toHaveLength(1);expect(f.origin.listExclusive('human_agent_preparation')).toHaveLength(1);expect(f.budget.snapshot().held.model_calls).toBe(0);}finally{f.local.instance=original;}
});
it('keeps the original request immutable when the caller changes its object during account opening',async()=>{
 const f=fixture(),original=structuredClone(f.command);vi.spyOn(productionCustody,'createInstalledCodexProductionCustody').mockReturnValue({...seam.full!,guard(){},release(){}});seam.onOpen=()=>{f.command.expected_revision++;};
 expect(await entry()(f.local,f.command)).toHaveProperty('command_type','PrepareRunContext');expect(f.command.expected_revision).not.toBe(original.expected_revision);expect(f.local.store.listRuntimeRecords('context_manifest',f.f.change.id)).toHaveLength(1);expect((f.origin.listExclusive('human_agent_preparation')[0]!.basis as {human_request:unknown}).human_request).toEqual(original);expect(f.budget.snapshot().held.model_calls).toBe(0);
});
