import { isDeepStrictEqual as same } from 'node:util';
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope, type CodexAgentModelAuthority } from '@cimiloop/runtime-adapter';
import type { AgentRuntimeStartContext } from './agent-runtime-start-local.js';
import type { LocalProject } from './project.js';
import { originalAgentWorkspaceScope } from './agent-workspace-tools-local.js';
import { LocalProjectError } from './errors.js';

export type AgentCodexModelContext=AgentRuntimeStartContext & {kernel:Pick<LocalProject['kernel'],'assessAgentRunModel'>};
const unavailable=()=>new LocalProjectError('原 Codex 模型的当前 Kernel 权威不可证明','CAPABILITY_UNAVAILABLE','conflict');

// Own the original Kernel object and assessment method. An installation, local
// capacity policy, launch permission or caller-provided ALLOW is insufficient.
export class LocalAgentCodexModelAuthority implements CodexAgentModelAuthority {
 readonly #local:AgentCodexModelContext;
 readonly #scope:AgentWorkspaceToolScope;
 readonly #identity:{store:AgentCodexModelContext['store'];kernel:AgentCodexModelContext['kernel'];caller:AgentCodexModelContext['caller'];location:AgentCodexModelContext['location'];assess:AgentCodexModelContext['kernel']['assessAgentRunModel']};
 readonly #assess:AgentCodexModelContext['kernel']['assessAgentRunModel'];
 private constructor(local:AgentCodexModelContext,scope:AgentWorkspaceToolScope){
  this.#local=local;this.#scope=structuredClone(scope);
  this.#identity={store:local.store,kernel:local.kernel,caller:structuredClone(local.caller),location:structuredClone(local.location),assess:local.kernel.assessAgentRunModel};
  if(typeof this.#identity.assess!=='function')throw unavailable();
  this.#assess=this.#identity.assess.bind(this.#identity.kernel);Object.freeze(this);
 }
 static open(local:AgentCodexModelContext,runId:string){return new LocalAgentCodexModelAuthority(local,originalAgentWorkspaceScope(local,runId));}
 #identityUnchanged(){const local=this.#local,id=this.#identity;if(local.store!==id.store||local.kernel!==id.kernel||local.kernel.assessAgentRunModel!==id.assess||!same(local.caller,id.caller)||!same(local.location,id.location))throw unavailable();}
 #guard(raw:AgentWorkspaceToolScope){
  this.#identityUnchanged();const scope=parseAgentWorkspaceToolScope(raw);
  if(!same(scope,this.#scope)||!same(originalAgentWorkspaceScope(this.#local,this.#scope.run_id),this.#scope))throw unavailable();
  this.#identityUnchanged();const decision=this.#assess(structuredClone(scope));this.#identityUnchanged();
  if(!('decision' in decision)||decision.decision!=='ALLOW')throw unavailable();
 }
 async check(scope:AgentWorkspaceToolScope){this.#guard(scope);}
 beforeEffect(scope:AgentWorkspaceToolScope){this.#guard(scope);}
}
