import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { CodexAgentUsageBudget, assertFixedVolumeRuntimePaths, assertOrdinaryPath, digest, directory, initializeWindowsAgentStartLedger, openWindowsAgentStartLedger, type AgentStartLedger, type CodexUsageDelegationContext } from '@cimiloop/runtime-adapter';
import { openInstalledCodexAgentRuntime, codexRuntimeInstallationWritablePaths, type InstalledCodexAgentRuntime } from './agent-codex-installation-local.js';
import { openCodexRuntimeStorage } from './agent-codex-storage-local.js';
import { openLocalProject } from './project.js';
import { readInstance } from './instance.js';
import { LocalProjectError } from './errors.js';
import type { LocalProject } from './project.js';

function fail(stage?:string):never{throw new LocalProjectError('Codex原账户容量政策或预约不可核对；保留原账户和原操作，不自动重建'+(stage?`（${stage}）`:''),'CAPABILITY_UNAVAILABLE','conflict',stage?{stage}:{});}
function layout(installed:InstalledCodexAgentRuntime){const appData=process.env.LOCALAPPDATA;if(!appData||!isAbsolute(appData))fail();const account={account_digest:installed.account_digest,quota_account_digest:installed.quota_account_digest},id=digest(JSON.stringify(account)).value;return{account,id,root:join(appData!,'CimiLoop','codex-usage-accounts',id),registry:join(appData!,'CimiLoop','codex-usage-registry'),tools:join(appData!,'CimiLoop','codex-usage-tools')};}
const attachment='codex_usage_account',intentNamespace='codex_usage_account_intent';
const allocationIntentNamespace='codex_usage_allocation_intent';
const writableScopes=new WeakMap<object,readonly string[]>();
export interface CodexUsageBudgetLimits{model_calls:number;output_tokens:number}
export interface InstalledCodexUsageBudget{installation:InstalledCodexAgentRuntime;budget:CodexAgentUsageBudget;root:string;guard():void;release():void}
export function codexUsageBudgetWritablePaths(account:InstalledCodexUsageBudget){const paths=writableScopes.get(account);if(!paths||account.root!==paths[0])fail();account.guard();return [...paths!];}
// Keep the installed source identity when a Runtime adds a stricter lease
// guard. A copied JSON object or an uninstalled account gets no path authority.
export function borrowCodexUsageBudget(account:InstalledCodexUsageBudget,guard:()=>void):InstalledCodexUsageBudget{
 const borrowed=Object.freeze({...account,guard(){const value:unknown=guard();if(value!==undefined){void Promise.resolve(value).catch(()=>{});fail();}account.guard();const after:unknown=guard();if(after!==undefined){void Promise.resolve(after).catch(()=>{});fail();}}});
 const paths=writableScopes.get(account);if(paths)writableScopes.set(borrowed,paths);return borrowed;
}

// Explicit operator action. A retained intent whose account root is missing is
// Unknown, not a fresh account. Query and model start never initialize accounts.
export async function installCodexUsageBudget(local:LocalProject,raw:CodexUsageBudgetLimits){
 let installed:InstalledCodexAgentRuntime|undefined,origin:AgentStartLedger|undefined,registry:AgentStartLedger|undefined;
 try{if(!raw||Object.keys(raw).sort().join(',')!=='model_calls,output_tokens'||!Number.isSafeInteger(raw.model_calls)||raw.model_calls<1||raw.model_calls>512||!Number.isSafeInteger(raw.output_tokens)||raw.output_tokens<1||raw.output_tokens>1000000000)fail();const limits=structuredClone(raw);
  installed=await openInstalledCodexAgentRuntime(local);if(!installed)fail();installed!.guard();if(installed!.origin.listExclusive(allocationIntentNamespace).length)fail();const where=layout(installed!),basis={format:'cimiloop/codex-usage-account-intent/1.0.0',root:where.root,registry_root:where.registry,account:where.account,limits};
  const intent=installed!.origin.claimExclusiveOnce(intentNamespace,where.id,basis),prior=installed!.origin.readExclusive(attachment,where.id);
  if(!existsSync(where.registry)){if(!intent.created||prior||existsSync(where.root))fail();directory(join(where.registry,'..'));registry=await initializeWindowsAgentStartLedger(where.registry,where.tools);}else registry=await openWindowsAgentStartLedger(where.registry,where.tools);
  installed!.guard();const registryIntent=registry.claimExclusiveOnce(intentNamespace,where.id,basis),registered=registry.readExclusive(attachment,where.id);
  if(!existsSync(where.root)){if(!registryIntent.created||registered||prior)fail();directory(join(where.root,'..'));origin=await initializeWindowsAgentStartLedger(where.root,where.tools);}
  else{origin=await openWindowsAgentStartLedger(where.root,where.tools);CodexAgentUsageBudget.open(origin,where.account);}
  installed!.guard();const budget=CodexAgentUsageBudget.initialize(origin,{...where.account,...limits}),globalRecord={format:'cimiloop/codex-usage-account-origin/1.0.0',root:where.root,host_identity_digest:origin.identityDigest,policy_digest:budget.policy_digest};registry.issueExclusive(attachment,where.id,globalRecord);
  const record={...globalRecord,format:'cimiloop/codex-usage-account-attachment/1.0.0',intent:installed!.origin.readExclusive(intentNamespace,where.id)!.ticket,registry_identity_digest:registry.identityDigest,registry_ticket:registry.readExclusive(attachment,where.id)!.ticket};
  const claimed=installed!.origin.claimExclusiveOnce(attachment,where.id,record);installed!.guard();budget.assertAccount(where.account);if(!same(registry.readExclusive(attachment,where.id)?.basis,globalRecord))fail();
  return{ok:true as const,created:claimed.created,policy_digest:budget.policy_digest,limits,costs_reconciled:false as const,provider_quota_reserved:false as const,starts_run:false as const};
 }catch{fail();}finally{origin?.close();registry?.close();installed?.release();}
}

export async function openInstalledCodexUsageBudget(local:LocalProject):Promise<InstalledCodexUsageBudget|undefined>{
 let installed:InstalledCodexAgentRuntime|undefined,origin:AgentStartLedger|undefined,registry:AgentStartLedger|undefined;
 try{installed=await openInstalledCodexAgentRuntime(local);if(!installed)return undefined;const installation=installed;
  if(installation.origin.listExclusive(allocationIntentNamespace).length){const lease=await openAllocatedBudget(local,installation);writableScopes.set(lease,Object.freeze([lease.root,allocationTools(installation)]));return lease;}
  const where=layout(installation),row=installation.origin.readExclusive(attachment,where.id),intent=installation.origin.readExclusive(intentNamespace,where.id);
  if(!row){if(intent)fail();installation.release();return undefined;}if(!intent)fail();
  registry=await openWindowsAgentStartLedger(where.registry,where.tools);origin=await openWindowsAgentStartLedger(where.root,where.tools);const accountOrigin=origin,registryOrigin=registry,budget=CodexAgentUsageBudget.open(accountOrigin,where.account),state=budget.snapshot();
  const expectedIntent={format:'cimiloop/codex-usage-account-intent/1.0.0',root:where.root,registry_root:where.registry,account:where.account,limits:state.limits},globalRecord={format:'cimiloop/codex-usage-account-origin/1.0.0',root:where.root,host_identity_digest:accountOrigin.identityDigest,policy_digest:budget.policy_digest},record={...globalRecord,format:'cimiloop/codex-usage-account-attachment/1.0.0',intent:intent!.ticket,registry_identity_digest:registryOrigin.identityDigest,registry_ticket:registryOrigin.readExclusive(attachment,where.id)?.ticket};let released=false;
  const guard=()=>{if(released)fail();installation.guard();budget.assertAccount(where.account);if(!same(installation.origin.readExclusive(attachment,where.id)?.basis,record)||!same(installation.origin.readExclusive(intentNamespace,where.id)?.basis,expectedIntent)||!same(registryOrigin.readExclusive(attachment,where.id)?.basis,globalRecord)||!same(registryOrigin.readExclusive(intentNamespace,where.id)?.basis,expectedIntent))fail();};guard();
  const lease=Object.freeze({installation,budget,root:where.root,guard,release(){if(!released){released=true;accountOrigin.close();registryOrigin.close();installation.release();}}});
  writableScopes.set(lease,Object.freeze([where.root,where.registry,where.tools]));return lease;
 }catch{origin?.close();registry?.close();installed?.release();return fail();}
}

export interface CodexUsageAllocationInput extends CodexUsageBudgetLimits {source_project_dir:string;request_id:string}
type AllocationIntent={format:'cimiloop/codex-usage-allocation-intent/1.0.0';request:CodexUsageAllocationInput;context:CodexUsageDelegationContext;account:{account_digest:string;quota_account_digest:string};root:string;tools:string};
function allocationRequest(raw:CodexUsageAllocationInput):CodexUsageAllocationInput{
 if(!raw||Object.keys(raw).sort().join(',')!=='model_calls,output_tokens,request_id,source_project_dir'||typeof raw.source_project_dir!=='string'||!isAbsolute(raw.source_project_dir)||typeof raw.request_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(raw.request_id)||!Number.isSafeInteger(raw.model_calls)||raw.model_calls<1||raw.model_calls>512||!Number.isSafeInteger(raw.output_tokens)||raw.output_tokens<1||raw.output_tokens>1000000000)fail();
 return {...structuredClone(raw),source_project_dir:assertOrdinaryPath(resolve(raw.source_project_dir))};
}
function allocationTools(installed:InstalledCodexAgentRuntime){const paths=codexRuntimeInstallationWritablePaths(installed);if(paths.length!==2||!paths[1])fail();return join(paths[1]!,'usage');}
function allocationLayout(installed:InstalledCodexAgentRuntime,requestId:string){const account={account_digest:installed.account_digest,quota_account_digest:installed.quota_account_digest},id=digest(JSON.stringify(account)).value;return {account,id,root:join(installed.root,'usage-capacity',requestId),tools:allocationTools(installed)};}
// Reuse Kernel's current Human/project-owner authority. A budget attachment is
// technical configuration, never a business execution or spending approval.
function humanGuard(local:LocalProject){
 const original={store:local.store,kernel:local.kernel,instance:structuredClone(local.instance),location:structuredClone(local.location)},method=local.kernel.authorizeProviderProbeControl;
 const read=()=>{if(local.store!==original.store||local.kernel!==original.kernel||local.kernel.authorizeProviderProbeControl!==method||!same(local.instance,original.instance)||!same(local.location,original.location)||!same(readInstance(local.location.instancePath),original.instance))fail();const permission=method.call(original.kernel);if('code'in permission)throw permission;if(permission.project_id!==original.instance.project_id||permission.actor_id!==original.instance.actor_id)fail();return permission;};
 const permission=read();return()=>{if(!same(read(),permission))fail();};
}
async function allocationStorage(local:LocalProject,installed:InstalledCodexAgentRuntime,paths:string[]){
 installed.guard();const storage=await openCodexRuntimeStorage(local,installed);installed.guard();if(!storage)fail();
 const proof=assertFixedVolumeRuntimePaths(storage,{project_id:local.instance.project_id,repository_path:local.location.repositoryPath,data_directory:local.location.dataDirectory},[...codexRuntimeInstallationWritablePaths(installed),...paths]);
 // The real storage reader already pins this identity. Do not accept an
 // independent volume's attachment as coverage for this installation.
 if(proof.runtime_ticket.identity_digest!==installed.origin.identityDigest)fail();return storage!;
}
function allocatedRecord(intent:NonNullable<ReturnType<AgentStartLedger['readExclusive']>>,budget:CodexAgentUsageBudget){
 const proof=budget.allocationProof();if(!proof)fail();return {format:'cimiloop/codex-usage-account-attachment/2.0.0',intent_ticket:intent.ticket,host_identity_digest:budget.origin_identity_digest,policy_digest:budget.policy_digest,funding:proof};
}
async function openAllocatedBudget(local:LocalProject,installed:InstalledCodexAgentRuntime):Promise<InstalledCodexUsageBudget>{
 let origin:AgentStartLedger|undefined;
 try{
  const intents=installed.origin.listExclusive(allocationIntentNamespace);if(intents.length!==1)fail();const {id:intentId,...intent}=intents[0]!,body=structuredClone(intent.basis) as AllocationIntent,q=allocationRequest(body.request),where=allocationLayout(installed,q.request_id);
  if(body.format!=='cimiloop/codex-usage-allocation-intent/1.0.0'||!same(body,{format:body.format,request:q,context:body.context,account:where.account,root:where.root,tools:where.tools})||body.context?.request_id!==q.request_id||body.context.target_project_id!==local.instance.project_id||body.context.target_installation_digest!==installed.installation_digest||intentId!==where.id||installed.origin.readExclusive(intentNamespace,where.id))fail();
  await allocationStorage(local,installed,[where.root,where.tools]);origin=await openWindowsAgentStartLedger(where.root,where.tools);const accountOrigin=origin,budget=CodexAgentUsageBudget.open(accountOrigin,where.account),expected=allocatedRecord(intent,budget),proof=budget.allocationProof();let released=false;
  if(!same(proof!.basis.proof.context,body.context)||!same(budget.snapshot().limits,{model_calls:q.model_calls,output_tokens:q.output_tokens}))fail();
  const guard=()=>{if(released)fail();installed.guard();budget.assertAccount(where.account);if(!same(installed.origin.readExclusive(allocationIntentNamespace,where.id),intent)||!same(installed.origin.readExclusive(attachment,where.id)?.basis,expected)||!same(allocatedRecord(intent,budget),expected))fail();};guard();
  return Object.freeze({installation:installed,budget,root:where.root,guard,release(){if(!released){released=true;accountOrigin.close();installed.release();}}});
 }catch{origin?.close();return fail();}
}
// Explicit finite transfer. The source permanently holds these units before
// the destination can spend them. Missing originals are never recreated. A
// complete replay and subsequent Runtime use need only the local funding proof.
export async function allocateCodexUsageBudget(local:LocalProject,raw:CodexUsageAllocationInput){
 const q=allocationRequest(raw),guardTarget=humanGuard(local);let installed:InstalledCodexAgentRuntime|undefined,source:LocalProject|undefined,parent:InstalledCodexUsageBudget|undefined,origin:AgentStartLedger|undefined,stage='open_installation';
 try{
  installed=await openInstalledCodexAgentRuntime(local);guardTarget();if(!installed)fail();const target=installed!,where=allocationLayout(target,q.request_id),prior=target.origin.readExclusive(allocationIntentNamespace,where.id),attached=target.origin.readExclusive(attachment,where.id);
  const report=(budget:CodexAgentUsageBudget,created:boolean)=>({ok:true as const,created,policy_digest:budget.policy_digest,limits:{model_calls:q.model_calls,output_tokens:q.output_tokens},costs_reconciled:false as const,provider_quota_reserved:false as const,starts_run:false as const});
  if(attached){if(!prior||!same((prior.basis as AllocationIntent).request,q))fail();const lease=await openAllocatedBudget(local,target);try{guardTarget();lease.guard();return report(lease.budget,false);}finally{lease.release();}}
  if(target.origin.readExclusive(intentNamespace,where.id))fail();if(prior&&!same((prior.basis as AllocationIntent).request,q))fail();
  stage='read_target_storage';await allocationStorage(local,target,[where.root,where.tools]);guardTarget();stage='open_source_project';source=openLocalProject({projectDir:q.source_project_dir});if(source.instance.project_id===local.instance.project_id||resolve(source.location.repositoryPath)!==q.source_project_dir)fail();const guardSource=humanGuard(source);
  stage='open_source_account';parent=await openInstalledCodexUsageBudget(source);guardSource();guardTarget();if(!parent)fail();const sourceAccount=parent!;
  const context:CodexUsageDelegationContext={request_id:q.request_id,source_project_id:source.instance.project_id,target_project_id:local.instance.project_id,target_installation_digest:target.installation_digest,parent_policy_digest:sourceAccount.budget.policy_digest,parent_identity_digest:sourceAccount.budget.origin_identity_digest};
  const basis:AllocationIntent={format:'cimiloop/codex-usage-allocation-intent/1.0.0',request:q,context,account:where.account,root:where.root,tools:where.tools};
  const guard=()=>{guardSource();guardTarget();sourceAccount.guard();target.guard();if(sourceAccount.installation.account_digest!==where.account.account_digest||sourceAccount.installation.quota_account_digest!==where.account.quota_account_digest)fail();};guard();
  // Pin intent before creating the destination. If interrupted before it has
  // a complete original policy, later attempts remain Unknown, not fresh money.
  stage='record_target_intent';if(!prior&&existsSync(where.root))fail();const intent=target.origin.claimExclusiveOnce(allocationIntentNamespace,where.id,basis);guard();
  stage='open_target_origin';if(!existsSync(where.root)){if(!intent.created)fail();directory(join(where.root,'..'));origin=await initializeWindowsAgentStartLedger(where.root,where.tools);}else origin=await openWindowsAgentStartLedger(where.root,where.tools);
  stage='open_target_policy';guard();const budget=intent.created?CodexAgentUsageBudget.initializeDelegated(origin,{...where.account,model_calls:q.model_calls,output_tokens:q.output_tokens},context):CodexAgentUsageBudget.open(origin,where.account);
  const original=target.origin.readExclusive(allocationIntentNamespace,where.id)!;if(!same(original.basis,basis)||!same(budget.snapshot().limits,{model_calls:q.model_calls,output_tokens:q.output_tokens}))fail();
  stage='reserve_source_capacity';guard();const allocation=sourceAccount.budget.allocateTo(budget);guard();stage='fund_target_capacity';budget.fund(allocation);guard();
  stage='attach_target_account';const completed=target.origin.claimExclusiveOnce(attachment,where.id,allocatedRecord(original,budget));budget.assertAccount(where.account);guard();return report(budget,completed.created);
 }catch{fail(stage);}finally{origin?.close();parent?.release();source?.store.close();installed?.release();}
}

export async function inspectCodexUsageBudget(local:LocalProject){let lease:InstalledCodexUsageBudget|undefined;try{lease=await openInstalledCodexUsageBudget(local);if(!lease)return{state:'missing' as const,starts_run:false as const};lease.guard();const state=lease.budget.snapshot();return{state:'installed' as const,policy_digest:state.policy_digest,limits:state.limits,held:state.held,remaining:state.remaining,costs_reconciled:false as const,provider_quota_reserved:false as const,starts_run:false as const};}catch{return{state:'unavailable' as const,starts_run:false as const};}finally{lease?.release();}}
