import {isDeepStrictEqual} from 'node:util';
import {DedicatedAgentAccountLedger,openDedicatedLedgerModelAccountPort,parseAgentWorkspaceToolScope,type DedicatedAgentAccountPort,type DedicatedAgentBudgetRequest,type DedicatedAgentBudgetHold,type DedicatedModelConnection,type AgentWorkspaceToolScope} from '@cimiloop/runtime-adapter';
import {originalAgentWorkspaceScope} from './agent-workspace-tools-local.js';
import type {AgentRuntimeStartContext} from './agent-runtime-start-local.js';
import {LocalProjectError} from './errors.js';
import type {LocalProject} from './project.js';
export type AgentDedicatedModelContext=AgentRuntimeStartContext & {kernel:Pick<LocalProject['kernel'],'assessAgentRunModel'>};

// Shared trusted application service. Kernel remains the only business authority;
// account admission/holds never confer Run or tool authority. No HTTP/CLI JSON
// can install this service or choose its original account ledger.
export class LocalAgentDedicatedAccount implements DedicatedAgentAccountPort {
 readonly #local:AgentDedicatedModelContext;readonly #scope:AgentWorkspaceToolScope;readonly #account:DedicatedAgentAccountLedger;
 readonly #identity:{store:AgentDedicatedModelContext['store'];kernel:AgentDedicatedModelContext['kernel'];caller:AgentDedicatedModelContext['caller'];location:AgentDedicatedModelContext['location'];assessment:AgentDedicatedModelContext['kernel']['assessAgentRunModel']};
 readonly #assess:AgentDedicatedModelContext['kernel']['assessAgentRunModel'];
 private constructor(local:AgentDedicatedModelContext,scope:AgentWorkspaceToolScope,account:DedicatedAgentAccountLedger){this.#local=local;this.#scope=scope;this.#account=account;this.#identity={store:local.store,kernel:local.kernel,caller:structuredClone(local.caller),location:structuredClone(local.location),assessment:local.kernel.assessAgentRunModel};this.#assess=this.#identity.assessment.bind(this.#identity.kernel);}
 static open(local:AgentDedicatedModelContext,runId:string,account:DedicatedAgentAccountLedger){
  if(!(account instanceof DedicatedAgentAccountLedger))throw new LocalProjectError('原持久账户服务尚未安装','CAPABILITY_UNAVAILABLE','conflict');
  return new LocalAgentDedicatedAccount(local,structuredClone(originalAgentWorkspaceScope(local,runId)),account);
 }
 modelAccountPort(beforeEffect?:()=>void){
  const guard=()=>{const value:unknown=beforeEffect?.();if(value!==undefined){try{void Promise.prototype.then.call(value,undefined,()=>{});}catch{}throw new LocalProjectError('原专用账户宿主租约不可证明','CAPABILITY_UNAVAILABLE','conflict');}};
  return openDedicatedLedgerModelAccountPort(this.#account,this.#scope,()=>{guard();this.#guard(this.#scope);guard();});
 }
 get admission_digest(){return this.#account.admission_digest;}
 get profile(){return this.#account.profile;}
 #assertIdentity(){const local=this.#local,original=this.#identity;if(local.store!==original.store||local.kernel!==original.kernel||local.kernel.assessAgentRunModel!==original.assessment||!isDeepStrictEqual(local.caller,original.caller)||!isDeepStrictEqual(local.location,original.location))throw new LocalProjectError('原账户 Kernel 与调用方身份已改变','CAPABILITY_UNAVAILABLE','conflict');}
 #guard(raw:AgentWorkspaceToolScope){this.#assertIdentity();const scope=parseAgentWorkspaceToolScope(raw);
  if(!isDeepStrictEqual(scope,this.#scope)||!isDeepStrictEqual(originalAgentWorkspaceScope(this.#local,this.#scope.run_id),this.#scope))throw new LocalProjectError('原账户调用范围不匹配','CAPABILITY_UNAVAILABLE','conflict');
  this.#assertIdentity();const assessment=this.#assess(structuredClone(scope));this.#assertIdentity();
  if(!('decision' in assessment)||assessment.decision!=='ALLOW')throw new LocalProjectError('原 Run 当前权限或准入不可证明','CAPABILITY_UNAVAILABLE','conflict');
  return scope;
 }
 async check(raw:AgentWorkspaceToolScope,connection:DedicatedModelConnection){const scope=this.#guard(raw);await this.#account.check(scope,connection);this.#guard(scope);}
 async reserve(raw:AgentWorkspaceToolScope,request:DedicatedAgentBudgetRequest,body:Uint8Array){const scope=this.#guard(raw),hold=await this.#account.reserve(scope,structuredClone(request),Buffer.from(body),()=>{this.#guard(scope);});this.#guard(scope);return hold;}
 async verifyHold(raw:AgentWorkspaceToolScope,hold:DedicatedAgentBudgetHold){const scope=this.#guard(raw);await this.#account.verifyHold(scope,structuredClone(hold));this.#guard(scope);}
}
