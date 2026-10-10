import {isDeepStrictEqual} from 'node:util';
import {DedicatedAgentAccountLedger,parseAgentWorkspaceToolScope,type DedicatedAgentAccountPort,type DedicatedAgentBudgetRequest,type DedicatedAgentBudgetHold,type DedicatedModelConnection,type AgentWorkspaceToolScope} from '@cimiloop/runtime-adapter';
import {originalAgentWorkspaceScope} from './agent-workspace-tools-local.js';
import type {AgentRuntimeStartContext} from './agent-runtime-start-local.js';
import {LocalProjectError} from './errors.js';
import type {LocalProject} from './project.js';
export type AgentDedicatedModelContext=AgentRuntimeStartContext & {kernel:Pick<LocalProject['kernel'],'assessAgentRunModel'>};

// Shared trusted application service. Kernel remains the only business authority;
// account admission/holds never confer Run or tool authority. No HTTP/CLI JSON
// can install this service or choose its original account ledger.
export class LocalAgentDedicatedAccount implements DedicatedAgentAccountPort {
 private constructor(private readonly local:AgentDedicatedModelContext,private readonly scope:AgentWorkspaceToolScope,private readonly account:DedicatedAgentAccountLedger){}
 static open(local:AgentDedicatedModelContext,runId:string,account:DedicatedAgentAccountLedger){
  if(!(account instanceof DedicatedAgentAccountLedger))throw new LocalProjectError('原持久账户服务尚未安装','CAPABILITY_UNAVAILABLE','conflict');
  return new LocalAgentDedicatedAccount(local,structuredClone(originalAgentWorkspaceScope(local,runId)),account);
 }
 get admission_digest(){return this.account.admission_digest;}
 get profile(){return this.account.profile;}
 private guard(raw:AgentWorkspaceToolScope){const scope=parseAgentWorkspaceToolScope(raw);
  if(!isDeepStrictEqual(scope,this.scope)||!isDeepStrictEqual(originalAgentWorkspaceScope(this.local,this.scope.run_id),this.scope))throw new LocalProjectError('原账户调用范围不匹配','CAPABILITY_UNAVAILABLE','conflict');
  const assessment=this.local.kernel.assessAgentRunModel(structuredClone(scope));
  if(!('decision' in assessment)||assessment.decision!=='ALLOW')throw new LocalProjectError('原 Run 当前权限或准入不可证明','CAPABILITY_UNAVAILABLE','conflict');
  return scope;
 }
 async check(raw:AgentWorkspaceToolScope,connection:DedicatedModelConnection){const scope=this.guard(raw);await this.account.check(scope,connection);this.guard(scope);}
 async reserve(raw:AgentWorkspaceToolScope,request:DedicatedAgentBudgetRequest,body:Uint8Array){const scope=this.guard(raw),hold=await this.account.reserve(scope,structuredClone(request),Buffer.from(body),()=>{this.guard(scope);});this.guard(scope);return hold;}
 async verifyHold(raw:AgentWorkspaceToolScope,hold:DedicatedAgentBudgetHold){const scope=this.guard(raw);await this.account.verifyHold(scope,structuredClone(hold));this.guard(scope);}
}
