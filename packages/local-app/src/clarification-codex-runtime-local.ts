import {existsSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {requestDigest} from '@cimiloop/kernel';
import {BudgetedCodexPrePlanRuntime,CodexFactInvestigator,assertOrdinaryPath,directory,digestRuntimeBinaryFile,withStartCustodyVerifyTurn} from '@cimiloop/runtime-adapter';
import {openInstalledCodexUsageBudget,type InstalledCodexUsageBudget} from './agent-codex-usage-budget-local.js';
import {codexRuntimeInstallationProgramBundle,type InstalledCodexAgentRuntime} from './agent-codex-installation-local.js';
import {openCodexRuntimeStorage} from './agent-codex-storage-local.js';
import {openCodexRuntimeLoginHome,assertCodexRuntimeLoginHome,type CodexRuntimeLoginHome} from './agent-codex-login-home-local.js';
import {assertCodexRuntimeWritableStorage} from './agent-codex-writable-storage-local.js';
import {openOriginalCodexMattInstallation,type InstalledCodexMatt} from './clarification-codex-installation-local.js';
import {CodexMattClarificationHost} from './clarification-codex-host-local.js';
import type {MattClarificationHost,MattClarificationInput,MattClarificationOriginal} from './clarification-matt-local.js';
import type {LocalProject} from './project.js';
import {LocalProjectError} from './errors.js';
import {assertCodexExecutionSelected} from './agent-dedicated-installation-local.js';

const namespace='codex_matt_runtime_attachment',intentNamespace='codex_matt_runtime_attachment_intent';
const fail=():never=>{throw new LocalProjectError('受控 Matt 的原安装、账户、固定卷或原操作尚不可核对','CAPABILITY_UNAVAILABLE','conflict');};
const identity=(path:string)=>{const stat=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!stat.isDirectory()||stat.ino<=0n)fail();return{dev:String(stat.dev),ino:String(stat.ino),birth:String(stat.birthtimeNs)};};
const sync=(fn:()=>void)=>{const value:unknown=fn();if(value!==undefined){try{void Promise.prototype.then.call(value,undefined,()=>{});}catch{/* No thenable effects. */}fail();}};
interface Services {
 openDefinition?:typeof openOriginalCodexMattInstallation;
 openAccount?:typeof openInstalledCodexUsageBudget;
 openStorage?:typeof openCodexRuntimeStorage;
 openHome?:typeof openCodexRuntimeLoginHome;
}
function current(local:LocalProject){const snapshot={store:local.store,kernel:local.kernel,location:structuredClone(local.location),instance:structuredClone(local.instance)};
 return()=>{if(local.store!==snapshot.store||local.kernel!==snapshot.kernel||!same(local.location,snapshot.location)||!same(local.instance,snapshot.instance))fail();};
}
// Explicit prospective attachment. It neither replaces the source installation
// nor changes a historical method request, login, database or Provider approval.
// Existing sessions read both original transports, and never redispatch a loss.
async function assemble(local:LocalProject,definition:InstalledCodexMatt,activate:boolean,services:Services={}){
 const key=definition.installation_digest,prior=definition.origin.readExclusive(namespace,key),intent=definition.origin.readExclusive(intentNamespace,key);
 if(!activate&&!prior){if(intent)fail();return undefined;}
 const original=current(local),methods={guard:definition.guard,release:definition.release,readMethodSource:definition.readMethodSource,readOriginalSync:definition.readOriginalSync,readExecutionControls:definition.readExecutionControls},host=definition.host;let account:InstalledCodexUsageBudget|undefined,released=false;
 const guard=()=>withStartCustodyVerifyTurn(()=>{if(released||definition.host!==host||Object.entries(methods).some(([name,method])=>Reflect.get(definition,name)!==method))fail();original();sync(methods.guard.bind(definition));account&&sync(account.guard.bind(account));original();});
 try{
  guard();account=await(services.openAccount??openInstalledCodexUsageBudget)(local);guard();if(!account)fail();
  const installed=account!.installation,budget=account!.budget;
  if(installed.model!==definition.model||installed.account_digest!==definition.account_digest)fail();
  const storage=await(services.openStorage??openCodexRuntimeStorage)(local,installed);guard();if(!storage)fail();
  const home=await(services.openHome??openCodexRuntimeLoginHome)(local,installed,storage!);guard();if(!home)fail();
  const coverage=assertCodexRuntimeWritableStorage(local,account!,storage!,home!),login=assertCodexRuntimeLoginHome(home!,local,installed,storage!);
  const roots={root:join(local.location.dataDirectory,'matt-runtime-originals',key),process_root:join(local.location.dataDirectory,'matt-runtime-processes',key)};
  const source=definition.readMethodSource();guard();
  const request={format:'cimiloop/codex-matt-runtime-request/1.0.0',instance:structuredClone(local.instance),location:structuredClone(local.location),definition_digest:key,
   runtime_installation_digest:installed.installation_digest,policy_digest:budget.policy_digest,quota_account_digest:installed.quota_account_digest,source_digest:definition.source_digest,
   roots,login_home:login,quota_ticket:coverage!.proof.policy_ticket,runtime_ticket:coverage!.proof.runtime_ticket};
  if(activate&&!prior)definition.origin.claimExclusiveOnce(intentNamespace,key,request);
  if(!same(definition.origin.readExclusive(intentNamespace,key)?.basis,request))fail();
  if(prior){const body=prior.basis as {root_identity?:unknown;process_identity?:unknown};
   if(!existsSync(roots.root)||!existsSync(roots.process_root)||!same(identity(roots.root),body.root_identity)||!same(identity(roots.process_root),body.process_identity))fail();
  }else{directory(roots.root);directory(roots.process_root);}
  const runtime=new BudgetedCodexPrePlanRuntime({...roots,command:{file:installed.binary,args:[],sha256:digestRuntimeBinaryFile(installed.binary)},account_digest:installed.account_digest,disabled_mcp_servers:[...installed.disabled_mcp_servers],timeout_ms:180000,
   state_policy:'private_login_home/2.0.0',environment_policy:'private_user_directories/1.0.0',network_policy:'codex_chatgpt_tunnel/1.0.0',job_policy:'codex_memory_process/1.0.0',path_resolution:'original_volume_handles/1.0.0',package_policy:'explicit_package_access/1.0.0',login_home:login,process_custody:'owner_job/1.0.0'},
   installed.origin,storage!,codexRuntimeInstallationProgramBundle(installed),budget,{project_id:local.instance.project_id,actor_id:local.instance.actor_id,installation_digest:requestDigest(request),model:installed.model,account_digest:installed.account_digest,quota_account_digest:installed.quota_account_digest},guard);
  const attached={format:'cimiloop/codex-matt-runtime-attachment/1.0.0',request_digest:requestDigest(request),configuration_digest:requestDigest(runtime.originalConfiguration),root_identity:identity(roots.root),process_identity:identity(roots.process_root)};
  if(prior&&!same(prior.basis,attached))fail();
  const factSource=source.facts?new CodexFactInvestigator(runtime,installed.model,source.facts.files,source.facts.source_identity,installed.quota_account_digest):undefined;
  const concrete=new CodexMattClarificationHost({source:source.source,runtime,model:installed.model,origin:'external_model',ordinary_quota_account_digest:installed.quota_account_digest,...(factSource?{facts:factSource}:{})});
  if(activate&&!prior)definition.origin.issueExclusive(namespace,key,attached);
  const pin=definition.origin.readExclusive(namespace,key);if(!pin||!same(pin.basis,attached))fail();
  const fullGuard=()=>withStartCustodyVerifyTurn(()=>{guard();if(account!.installation!==installed||account!.budget!==budget||!same(definition.origin.readExclusive(namespace,key),pin)||!same(definition.origin.readExclusive(intentNamespace,key)?.basis,request)||!same(identity(roots.root),attached.root_identity)||!same(identity(roots.process_root),attached.process_identity))fail();
   assertCodexRuntimeWritableStorage(local,account!,storage!,home!);if(!same(assertCodexRuntimeLoginHome(home!,local,installed,storage!),login))fail();guard();});
  const operation=(input:MattClarificationInput)=>{fullGuard();if(input.basis.project_id!==local.instance.project_id||input.basis.actor_id!==local.instance.actor_id)fail();return{session_id:input.basis.id,invocation_key:input.invocation_key};};
  const read=(input:MattClarificationInput)=>withStartCustodyVerifyTurn(()=>{fullGuard();const old=methods.readOriginalSync.call(definition,input);fullGuard();const fresh=concrete.readOriginalSync(input);fullGuard();if(old&&fresh)fail();return{old,fresh};});
  const readOriginalSync=(input:MattClarificationInput)=>{const value=read(input);return value.fresh??value.old;};
  const verify=(input:MattClarificationInput,value:MattClarificationOriginal)=>withStartCustodyVerifyTurn(()=>{
   const retained=read(input),selected=retained.fresh?'contained' as const:retained.old?'legacy' as const:fail();
   if(!same(retained.fresh??retained.old,value))fail();
   if(selected==='contained')concrete.verifyOriginal(input,value);else host.verifyOriginal(input,value);
   fullGuard();if(!same(read(input),retained))fail();return selected;
  });
  const lease:InstalledCodexMatt={...definition,host:Object.freeze<MattClarificationHost>({
   prepare(input){assertCodexExecutionSelected(local);const op=operation(input);runtime.prepareOperation(op);concrete.prepare(input);fullGuard();assertCodexExecutionSelected(local);},
   async invoke(input,beforeEffect){assertCodexExecutionSelected(local);const op=operation(input);await runtime.withOperation(op,()=>concrete.invoke(input,()=>{assertCodexExecutionSelected(local);fullGuard();sync(beforeEffect);fullGuard();assertCodexExecutionSelected(local);}));fullGuard();assertCodexExecutionSelected(local);},
   async readOriginal(input){return readOriginalSync(input);},
   verifyOriginal(input,value){verify(input,value);}
  }),guard:fullGuard,readOriginalSync,readExecutionControls(input,value){return withStartCustodyVerifyTurn(()=>{const selected=verify(input,value),result=selected==='contained'?concrete.readExecutionControls(input,value):methods.readExecutionControls.call(definition,input,value);fullGuard();verify(input,value);return result;});},
   release(){if(!released){released=true;try{account!.release();}finally{methods.release.call(definition);}}}
  };fullGuard();return{lease,created:!prior,attachment_digest:requestDigest(attached)};
 }catch(error){try{account?.release();}finally{if(error instanceof LocalProjectError)throw error;fail();}}
}
export async function openCodexMattRuntime(local:LocalProject,definition:InstalledCodexMatt):Promise<InstalledCodexMatt|undefined>{return(await assemble(local,definition,false))?.lease;}
export async function installCodexMattRuntime(local:LocalProject,services:Services={}){
 const guard=current(local);let definition:InstalledCodexMatt|undefined,lease:InstalledCodexMatt|undefined;
 try{guard();definition=await(services.openDefinition??openOriginalCodexMattInstallation)(local);guard();if(!definition)fail();
  const result=await assemble(local,definition!,true,services);lease=result?.lease;guard();if(!result||!lease)fail();lease!.guard();
  return{ok:true as const,created:result!.created,attachment_digest:result!.attachment_digest,model:lease!.model,qualification:'unqualified_method_execution' as const,starts_run:false as const,costs_reconciled:false as const,model_dispatch_available:false as const,unavailable_reason:'codex_pre_plan_output_budget_unavailable' as const,formal_agent_execution_enabled:false as const};
 }finally{if(lease)lease.release();else definition?.release();}
}
