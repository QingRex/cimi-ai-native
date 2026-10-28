import {isDeepStrictEqual as same} from 'node:util';
import type {LocalProject} from './project.js';
import {LocalAgentRuntimeAdmission} from './agent-runtime-admission-local.js';
import {openInstalledCodexUsageBudget,type InstalledCodexUsageBudget} from './agent-codex-usage-budget-local.js';
import {openCodexRuntimeStorage} from './agent-codex-storage-local.js';
import {openCodexRuntimeLoginHome} from './agent-codex-login-home-local.js';
import {createInstalledCodexProductionCustody} from './agent-production-custody-local.js';
import {LocalProjectError} from './errors.js';
import {assertCodexExecutionSelected} from './agent-dedicated-installation-local.js';

const unavailable=(missing:string)=>new LocalProjectError(`正式 Codex 宿主缺少${missing}；保留原操作，不回退另一账户`,'CAPABILITY_UNAVAILABLE','conflict',{production_admission:'unapproved',plan:'Codex login',missing:[missing]});
async function create(local:LocalProject){
 let account:InstalledCodexUsageBudget|undefined,admission:LocalAgentRuntimeAdmission|undefined,full:ReturnType<typeof createInstalledCodexProductionCustody>|undefined;
 const original={store:local.store,kernel:local.kernel,execute:local.kernel.execute,authorize:local.kernel.authorizeAgentRunPreparation,location:structuredClone(local.location),instance:structuredClone(local.instance)};
 const identity=()=>{assertCodexExecutionSelected(local);if(local.store!==original.store||local.kernel!==original.kernel||local.kernel.execute!==original.execute||local.kernel.authorizeAgentRunPreparation!==original.authorize||!same(local.location,original.location)||!same(local.instance,original.instance))throw unavailable('原项目身份');};
 try{
  account=await openInstalledCodexUsageBudget(local);identity();if(!account)throw unavailable('Codex 原账户容量政策');const owned=account;
  const storage=await openCodexRuntimeStorage(local,owned.installation);identity();owned.guard();if(!storage)throw unavailable('Codex 原固定卷运行范围');
  const home=await openCodexRuntimeLoginHome(local,owned.installation,storage);identity();owned.guard();if(!home)throw unavailable('Codex 原固定卷登录目录');
  full=createInstalledCodexProductionCustody(local,owned,storage,home);const custody=full;
  const guard=()=>{identity();owned.guard();custody.guard();};guard();
  admission=await LocalAgentRuntimeAdmission.open(local,{origin:owned.installation.origin,nodeBinary:owned.installation.node_binary,templates:owned.installation.checks,full:custody,guard,codexAccount:owned});guard();const lease=admission;let released=false;
  return Object.freeze({local,admission:lease,account:owned,storage,home,guard(){if(released)throw unavailable('仍有效的宿主租约');guard();lease.guard();},release(){if(released)return;released=true;try{lease.release();}finally{try{custody.release();}finally{owned.release();}}}});
 }catch(error){try{admission?.release();}finally{try{full?.release();}finally{account?.release();}}throw error;}
}
type Host=Awaited<ReturnType<typeof create>>;
interface State{local:LocalProject;pending:Promise<Host>;host?:Host;users:number}
const active=new WeakMap<LocalProject['store'],State>();
// Default code-owned lifecycle. Concurrent requests borrow the same original
// host; the last borrower restores the owned verifier slots and closes handles.
// No callback, recipe, caller or full-admission object comes from HTTP/CLI JSON.
export async function openInstalledCodexProductionHost(local:LocalProject){
 assertCodexExecutionSelected(local);
 const store=local.store;let state=active.get(store);
 if(!state){if(LocalAgentRuntimeAdmission.current(local))return undefined;state={local,pending:create(local),users:0};active.set(store,state);}
 if(state.local!==local)throw unavailable('同一原应用上下文');const original=state;let host:Host|undefined;
 try{host=await original.pending;if(active.get(store)!==original||local.store!==store)throw unavailable('原宿主打开操作');host.guard();}catch(error){if(active.get(store)===original&&!original.users){active.delete(store);(original.host??host)?.release();}throw error;}
 original.host=host;original.users++;let released=false;
 return Object.freeze({admission:host.admission,account:host.account,storage:host.storage,home:host.home,guard(){if(released||active.get(store)!==original)throw unavailable('原宿主引用');host.guard();},release(){if(released)return;released=true;if(active.get(store)!==original)throw unavailable('原宿主所有权');original.users--;if(original.users===0){active.delete(store);host.release();}}});
}
