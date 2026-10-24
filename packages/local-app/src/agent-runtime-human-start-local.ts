import {isDeepStrictEqual} from 'node:util';
import type {LocalProject} from './project.js';
import {readHumanOriginalAgentRunInputs} from './agent-runtime-control-local.js';
import {readLocalAgentRuntimeStartOriginal} from './agent-runtime-start-local.js';
import {LocalAgentRuntimeComposition} from './agent-runtime-composition-local.js';
import {LocalProjectError} from './errors.js';
// Trusted staging only: no effects, account creation or credential export.
// Release closes owned application handles AFTER start settles. It must not
// stop/dispose the original Native operation or erase any original evidence.
export interface AgentRuntimeLease {runtime:LocalAgentRuntimeComposition;release():void|Promise<void>}
export type HumanAgentRuntimeFactory=(runId:string,local:LocalProject)=>LocalAgentRuntimeComposition|AgentRuntimeLease|Promise<LocalAgentRuntimeComposition|AgentRuntimeLease>;
const unavailable=()=>new LocalProjectError('原 Agent 完整组合或资源释放尚待核对；保留原操作','CAPABILITY_UNAVAILABLE','conflict');
export class LocalHumanAgentRuntimeStart {
 readonly #identity:Pick<LocalProject,'location'|'instance'|'store'|'kernel'>;
 readonly #startMethod:LocalProject['kernel']['authorizeAgentRunStart'];
 readonly #authorizeStart:LocalProject['kernel']['authorizeAgentRunStart'];
 constructor(private readonly local:LocalProject,private readonly factory?:HumanAgentRuntimeFactory){
  this.#identity={location:structuredClone(local.location),instance:structuredClone(local.instance),store:local.store,kernel:local.kernel};
  this.#startMethod=local.kernel.authorizeAgentRunStart;
  this.#authorizeStart=this.#startMethod.bind(local.kernel);
 }
 #assertIdentity(){
  const original=this.#identity;
  if(this.local.store!==original.store||this.local.kernel!==original.kernel||original.kernel.authorizeAgentRunStart!==this.#startMethod||!isDeepStrictEqual(this.local.location,original.location)||!isDeepStrictEqual(this.local.instance,original.instance))
   throw new LocalProjectError('原Human启动身份或Kernel授权入口发生变化','INPUT_CHANGED','conflict');
 }
 #authorize(runId:string){this.#assertIdentity();const result=this.#authorizeStart(runId);this.#assertIdentity();return result;}
 async start(runId:string,requestGuard?:()=>void){
  this.#assertIdentity();
  const original=readHumanOriginalAgentRunInputs(this.local,runId);
  const authorized=this.#authorize(runId);if('code' in authorized)throw authorized;
  let checkError:unknown;
  const check=()=>{try{
   this.#assertIdentity();
   requestGuard?.();
   const fresh=this.#authorize(runId);if('code' in fresh)throw fresh;
   if(!isDeepStrictEqual(fresh,authorized)||!isDeepStrictEqual(readHumanOriginalAgentRunInputs(this.local,runId).scope,original.scope))
    throw new LocalProjectError('原启动请求权限或固定范围已改变','INPUT_CHANGED','conflict');
   this.#assertIdentity();
  }catch(error){checkError=error;throw error;}};
  check();
  // Read-only recovery does not need a new model/account/custody factory.
  // Absence grants nothing: the first-start path still requires full custody.
  const prior=readLocalAgentRuntimeStartOriginal(this.local.location.dataDirectory,original.scope);check();if(prior)return prior;
  if(!this.factory)throw unavailable();
  let staged:Awaited<ReturnType<HumanAgentRuntimeFactory>>;
  try{staged=await this.factory(runId,this.local);}catch(error){check();if(error instanceof LocalProjectError && error.details.production_admission==="unapproved")throw error;throw unavailable();}
  let runtime:LocalAgentRuntimeComposition,release:(()=>void|Promise<void>)|undefined;
  try{
   try{
    if(staged instanceof LocalAgentRuntimeComposition)runtime=staged;
    else {const method=staged?.release;if(typeof method!=='function')throw unavailable();release=method.bind(staged);runtime=staged.runtime;}
   }catch{throw unavailable();}
   check();
   let scope:ReturnType<LocalAgentRuntimeComposition['originalScope']>;
   if(!(runtime instanceof LocalAgentRuntimeComposition))throw new LocalProjectError('宿主组合与原 Agent 身份或项目不符','CALLER_IDENTITY_MISMATCH','forbidden');
   try{scope=runtime.originalScope(runId);}catch{throw unavailable();}
   if(!isDeepStrictEqual(scope,original.scope))
    throw new LocalProjectError('宿主组合与原 Agent 身份或项目不符','CALLER_IDENTITY_MISMATCH','forbidden');
   try{return await runtime.start(runId,check);}catch(error){if(error===checkError)throw error;throw unavailable();}
  }finally{
   let releaseFailed=false;
   try{await release?.();}catch{releaseFailed=true;}
   // Both staging and release may await; never return a stale authority result.
   check();if(releaseFailed)throw unavailable();
  }
 }
}
