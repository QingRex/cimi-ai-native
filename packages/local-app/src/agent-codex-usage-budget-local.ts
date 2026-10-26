import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';
import { CodexAgentUsageBudget, digest, directory, initializeWindowsAgentStartLedger, openWindowsAgentStartLedger, type AgentStartLedger } from '@cimiloop/runtime-adapter';
import { openInstalledCodexAgentRuntime, type InstalledCodexAgentRuntime } from './agent-codex-installation-local.js';
import { LocalProjectError } from './errors.js';
import type { LocalProject } from './project.js';

function fail():never{throw new LocalProjectError('Codex原账户容量政策或预约不可核对；保留原账户和原操作，不自动重建','CAPABILITY_UNAVAILABLE','conflict');}
function layout(installed:InstalledCodexAgentRuntime){const appData=process.env.LOCALAPPDATA;if(!appData||!isAbsolute(appData))fail();const account={account_digest:installed.account_digest,quota_account_digest:installed.quota_account_digest},id=digest(JSON.stringify(account)).value;return{account,id,root:join(appData!,'CimiLoop','codex-usage-accounts',id),registry:join(appData!,'CimiLoop','codex-usage-registry'),tools:join(appData!,'CimiLoop','codex-usage-tools')};}
const attachment='codex_usage_account',intentNamespace='codex_usage_account_intent';
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
  installed=await openInstalledCodexAgentRuntime(local);if(!installed)fail();installed!.guard();const where=layout(installed!),basis={format:'cimiloop/codex-usage-account-intent/1.0.0',root:where.root,registry_root:where.registry,account:where.account,limits};
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
 try{installed=await openInstalledCodexAgentRuntime(local);if(!installed)return undefined;const installation=installed,where=layout(installation),row=installation.origin.readExclusive(attachment,where.id),intent=installation.origin.readExclusive(intentNamespace,where.id);
  if(!row){if(intent)fail();installation.release();return undefined;}if(!intent)fail();
  registry=await openWindowsAgentStartLedger(where.registry,where.tools);origin=await openWindowsAgentStartLedger(where.root,where.tools);const accountOrigin=origin,registryOrigin=registry,budget=CodexAgentUsageBudget.open(accountOrigin,where.account),state=budget.snapshot();
  const expectedIntent={format:'cimiloop/codex-usage-account-intent/1.0.0',root:where.root,registry_root:where.registry,account:where.account,limits:state.limits},globalRecord={format:'cimiloop/codex-usage-account-origin/1.0.0',root:where.root,host_identity_digest:accountOrigin.identityDigest,policy_digest:budget.policy_digest},record={...globalRecord,format:'cimiloop/codex-usage-account-attachment/1.0.0',intent:intent!.ticket,registry_identity_digest:registryOrigin.identityDigest,registry_ticket:registryOrigin.readExclusive(attachment,where.id)?.ticket};let released=false;
  const guard=()=>{if(released)fail();installation.guard();budget.assertAccount(where.account);if(!same(installation.origin.readExclusive(attachment,where.id)?.basis,record)||!same(installation.origin.readExclusive(intentNamespace,where.id)?.basis,expectedIntent)||!same(registryOrigin.readExclusive(attachment,where.id)?.basis,globalRecord)||!same(registryOrigin.readExclusive(intentNamespace,where.id)?.basis,expectedIntent))fail();};guard();
  const lease=Object.freeze({installation,budget,root:where.root,guard,release(){if(!released){released=true;accountOrigin.close();registryOrigin.close();installation.release();}}});
  writableScopes.set(lease,Object.freeze([where.root,where.registry,where.tools]));return lease;
 }catch{origin?.close();registry?.close();installed?.release();return fail();}
}

export async function inspectCodexUsageBudget(local:LocalProject){let lease:InstalledCodexUsageBudget|undefined;try{lease=await openInstalledCodexUsageBudget(local);if(!lease)return{state:'missing' as const,starts_run:false as const};lease.guard();const state=lease.budget.snapshot();return{state:'installed' as const,policy_digest:state.policy_digest,limits:state.limits,held:state.held,remaining:state.remaining,costs_reconciled:false as const,provider_quota_reserved:false as const,starts_run:false as const};}catch{return{state:'unavailable' as const,starts_run:false as const};}finally{lease?.release();}}
