import {isAbsolute,join,parse,relative,resolve,sep} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {captureCodexLoginHome,assertFixedVolumeRuntimeStorage,assertFixedVolumeRuntimePath,digest,bytesAt,inspectCodexMethodLogin,type CodexLoginHome,type FixedVolumeRuntimeStorage} from '@cimiloop/runtime-adapter';
import {openInstalledCodexAgentRuntime,type InstalledCodexAgentRuntime} from './agent-codex-installation-local.js';
import {openCodexRuntimeStorage} from './agent-codex-storage-local.js';
import type {LocalProject} from './project.js';
import {LocalProjectError} from './errors.js';

type Context={location:Pick<LocalProject['location'],'repositoryPath'|'dataDirectory'>;store:Pick<LocalProject['store'],'getProject'>};
type Services={openInstallation?:typeof openInstalledCodexAgentRuntime;openStorage?:typeof openCodexRuntimeStorage;inspectLogin?:typeof inspectCodexMethodLogin};
const namespace='codex_runtime_login_home',requestNamespace=namespace+'_request';
const common={starts_run:false as const,provider_qualification_proven:false as const,credential_storage_proven:false as const,costs_reconciled:false as const};
const key=(installed:InstalledCodexAgentRuntime)=>digest(installed.installation_digest).value;
const fail=():never=>{throw new LocalProjectError('Codex原固定卷登录目录未绑定、待核对或已变化；保留原登记，不回退桌面登录','CAPABILITY_UNAVAILABLE','conflict');};
function guardNow(guard:()=>void){const value:unknown=guard();if(value!==undefined){void Promise.resolve(value).catch(()=>{});fail();}}
function scope(local:Context){const project=local.store.getProject();if(!project||resolve(project.repository_path)!==resolve(local.location.repositoryPath))fail();return{project_id:project!.id,repository_path:local.location.repositoryPath,data_directory:local.location.dataDirectory};}
function outside(parent:string,path:string){const rel=relative(resolve(parent),path);return isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep);}
function basis(local:Context,installed:InstalledCodexAgentRuntime,storage:FixedVolumeRuntimeStorage,path:string){
 const current=scope(local),proof=assertFixedVolumeRuntimeStorage(storage,current),home=captureCodexLoginHome(path);
 if(proof.runtime_ticket.identity_digest!==installed.origin.identityDigest||home.path===parse(home.path).root||!outside(current.repository_path,home.path)||!outside(current.data_directory,home.path)||!outside(installed.root,home.path))fail();
 assertFixedVolumeRuntimePath(storage,current,home.path);
 return{format:'cimiloop/codex-runtime-login-home/1.0.0' as const,installation_digest:installed.installation_digest,scope:current,home,quota_ticket:proof.policy_ticket,runtime_ticket:proof.runtime_ticket,account_digest:installed.account_digest,quota_account_digest:installed.quota_account_digest};
}
function read(local:Context,installed:InstalledCodexAgentRuntime,storage:FixedVolumeRuntimeStorage){
 const row=installed.origin.readExclusive(namespace,key(installed));if(!row)return undefined;
 const value=row.basis as ReturnType<typeof basis>;if(!value?.home||typeof value.home.path!=='string')fail();
 const expected=basis(local,installed,storage,value.home.path);if(!same(value,expected)||!same(installed.origin.readExclusive(requestNamespace,key(installed))?.basis,expected))fail();
 return{row,basis:expected};
}
const token=Symbol('original Codex login home');
const states=new WeakMap<object,{store:Context['store'];installed:InstalledCodexAgentRuntime;storage:FixedVolumeRuntimeStorage;home:CodexLoginHome;guard:()=>void}>();
// A directory descriptor or copied Host row cannot install this capability.
export class CodexRuntimeLoginHome {
 private constructor(value:symbol,state:NonNullable<ReturnType<typeof states.get>>){if(value!==token)fail();states.set(this,state);Object.freeze(this);}
}
export function assertCodexRuntimeLoginHome(value:unknown,local:Context,installed:InstalledCodexAgentRuntime,storage:FixedVolumeRuntimeStorage):CodexLoginHome{
 const state=value&&typeof value==='object'?states.get(value):undefined;
 if(!state||state.store!==local.store||state.installed!==installed||state.storage!==storage)fail();state!.guard();
 if(!same(basis(local,installed,storage,state!.home.path).home,state!.home))fail();state!.guard();return structuredClone(state!.home);
}
export async function openCodexRuntimeLoginHome(local:Context,installed:InstalledCodexAgentRuntime,storage:FixedVolumeRuntimeStorage){
 const originalGuard=installed.guard.bind(installed);guardNow(originalGuard);const original=read(local,installed,storage);
 if(!original){if(installed.origin.readExclusive(requestNamespace,key(installed)))fail();guardNow(originalGuard);return undefined;}
 const guard=()=>{guardNow(originalGuard);if(!same(read(local,installed,storage),original))fail();guardNow(originalGuard);};guard();
 return Reflect.construct(CodexRuntimeLoginHome,[token,{store:local.store,installed,storage,home:original.basis.home,guard}]) as CodexRuntimeLoginHome;
}
// Explicit attachment only. The official CLI owns sign-in and its credentials;
// this service never opens a credential file or sends a thread/model request.
export async function installCodexRuntimeLoginHome(local:LocalProject,raw:{path:string},services:Services={}){
 const input=structuredClone(raw);if(!input||Object.keys(input).join(',')!=='path'||typeof input.path!=='string'||!isAbsolute(input.path))fail();
 const installed=await(services.openInstallation??openInstalledCodexAgentRuntime)(local);if(!installed)fail();
 try{
  guardNow(installed!.guard.bind(installed));const storage=await(services.openStorage??openCodexRuntimeStorage)(local,installed!);if(!storage)fail();
  const expected=basis(local,installed!,storage!,input.path),prior=read(local,installed!,storage!);
  if(prior){if(!same(prior.basis,expected))fail();return{ok:true as const,created:false,home:expected.home,...common};}
  if(installed!.origin.readExclusive(requestNamespace,key(installed!)))fail();
  const claim=installed!.origin.claimExclusiveOnce(requestNamespace,key(installed!),expected);if(!claim.created)fail();
  const originalRequest={ticket:claim.ticket,basis:expected};
  const guard=()=>{guardNow(installed!.guard.bind(installed));if(!same(basis(local,installed!,storage!,input.path),expected)||!same(installed!.origin.readExclusive(requestNamespace,key(installed!)),originalRequest))fail();};
  guard();const inspected=await(services.inspectLogin??inspectCodexMethodLogin)({root:join(local.location.dataDirectory,'codex-login-inspections',key(installed!)),command:{file:installed!.binary,args:[],sha256:digest(bytesAt(installed!.binary,512*1024*1024)).value},disabled_mcp_servers:[...installed!.disabled_mcp_servers],login_home:expected.home,usage_policy:'require_ordinary_permission/1.0.0'},guard);
  guard();if(inspected.account_digest!==installed!.account_digest||inspected.quota_snapshot?.ordinary_usage_allowed!==true||inspected.quota_snapshot.account_id_digest!==installed!.quota_account_digest)fail();
  installed!.origin.issueExclusive(namespace,key(installed!),expected);const cap=await openCodexRuntimeLoginHome(local,installed!,storage!);if(!cap)fail();assertCodexRuntimeLoginHome(cap,local,installed!,storage!);return{ok:true as const,created:true,home:expected.home,...common};
 }finally{installed!.release();}
}
export async function inspectCodexRuntimeLoginHome(local:LocalProject,services:Services={}){
 let installed:InstalledCodexAgentRuntime|undefined;
 try{
  installed=await(services.openInstallation??openInstalledCodexAgentRuntime)(local);if(!installed)return{state:'missing' as const,...common};
  guardNow(installed.guard.bind(installed));const row=installed.origin.readExclusive(namespace,key(installed));
  if(!row)return{state:installed.origin.readExclusive(requestNamespace,key(installed))?'pending' as const:'missing' as const,...common};
  const storage=await(services.openStorage??openCodexRuntimeStorage)(local,installed);if(!storage)fail();const cap=await openCodexRuntimeLoginHome(local,installed,storage!);if(!cap)fail();return{state:'installed' as const,home:assertCodexRuntimeLoginHome(cap,local,installed,storage!),...common};
 }catch{return{state:'unavailable' as const,...common};}finally{installed?.release();}
}
