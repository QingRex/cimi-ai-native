import {CodexOriginalMethodRuntime,type CodexOriginalMethodOptions,type CodexMethodRequest,type CodexMethodOriginal,type CodexMethodToolContext,type CodexMethodAdmission} from './codex-original-method.js';
import {CodexAgentUsageBudget,type CodexUsageAccount} from './codex-agent-usage-budget.js';
import type {AgentStartLedger} from './agent-start-ledger.js';
import type {FixedVolumeRuntimeStorage} from './fixed-volume-quota.js';
import type {CodexProgramBundle} from './codex-program-bundle.js';
import {digest,RuntimeAdapterError} from './files.js';
import {parseGatewayJson} from './gateway-conversation.js';

export interface CodexPrePlanBudgetBinding extends CodexUsageAccount {project_id:string;actor_id:string;installation_digest:string;model:string}
export interface CodexPrePlanOperation {session_id:string;invocation_key:string}
const fail=(code='codex_pre_plan_budget_unproven'):never=>{throw new RuntimeAdapterError(code);};
const uuid=(s:string)=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const sync=(fn:()=>void)=>{const value:unknown=fn();if(value!==undefined){try{void Promise.prototype.then.call(value,undefined,()=>{});}catch{/* Never execute arbitrary thenables. */}fail();}};
// A transport for a genuine pre-plan operation, not a synthetic Agent Run.
// Native confinement still comes from the real constructor capabilities.
// Shares the original finite account, without inventing an Agent Run.
// Current Codex transport has no enforceable whole-turn output ceiling.
// New dispatch is therefore denied BEFORE any reservation or model effect.
export class BudgetedCodexPrePlanRuntime extends CodexOriginalMethodRuntime {
 readonly #budget:CodexAgentUsageBudget;readonly #binding:CodexPrePlanBudgetBinding;readonly #guard:()=>void;
 #active:CodexPrePlanOperation|undefined;
 constructor(options:CodexOriginalMethodOptions,origin:AgentStartLedger,storage:FixedVolumeRuntimeStorage|undefined,programs:CodexProgramBundle|undefined,budget:CodexAgentUsageBudget,binding:CodexPrePlanBudgetBinding,guard:()=>void){
  super(options,false,origin,storage,programs);
  if(!(budget instanceof CodexAgentUsageBudget)||!binding||Object.keys(binding).sort().join(',')!=='account_digest,actor_id,installation_digest,model,project_id,quota_account_digest'||![binding.project_id,binding.actor_id].every(uuid)||!['account_digest','quota_account_digest','installation_digest'].every(key=>/^[a-f0-9]{64}$/.test(Reflect.get(binding,key)))||!binding.model||typeof guard!=='function')fail();
  this.#budget=budget;this.#binding=Object.freeze(structuredClone(binding));this.#guard=guard;this.#check();
 }
 #check(){sync(this.#guard);this.#budget.assertAccount({account_digest:this.#binding.account_digest,quota_account_digest:this.#binding.quota_account_digest});sync(this.#guard);}
 prepareOperation(raw:CodexPrePlanOperation){
  this.#check();this.#operation(raw);if(this.#active)fail('codex_pre_plan_busy');const state=this.#budget.snapshot();
  if(state.held.model_calls!+1>state.limits.model_calls!||state.held.output_tokens!+2048>state.limits.output_tokens!)fail('codex_pre_plan_capacity_exhausted');
  fail('codex_pre_plan_output_budget_unavailable');
 }
 #operation(raw:CodexPrePlanOperation){if(!raw||Object.keys(raw).sort().join(',')!=='invocation_key,session_id'||!uuid(raw.session_id)||!raw.invocation_key.startsWith(raw.session_id+'_')||!uuid(raw.invocation_key.slice(raw.session_id.length+1)))fail();return structuredClone(raw);}
 async withOperation<T>(raw:CodexPrePlanOperation,run:()=>Promise<T>):Promise<T>{
  this.#check();if(this.#active)fail('codex_pre_plan_busy');const operation=this.#operation(raw);this.#active=operation;
  try{const result=await run();this.#check();return result;}finally{if(this.#active!==operation)fail();this.#active=undefined;}
 }
 override async execute(raw:CodexMethodRequest,tool:(name:string,args:unknown,original:CodexMethodToolContext)=>string|Promise<string>,beforeEffect:()=>void,signal?:AbortSignal,parentAdmission?:CodexMethodAdmission):Promise<CodexMethodOriginal>{
  const operation=this.#active;this.#check();if(!operation)fail();const request=structuredClone(raw),binding=this.#binding;
  if(request.model!==binding.model||request.usage_policy!=='require_ordinary_permission/1.0.0'||request.quota_account_digest!==binding.quota_account_digest)fail();
  if(request.operation_key!==operation!.invocation_key){
   const body=parseGatewayJson(request.prompt,1024*1024) as {format?:unknown;parent?:{operation_key?:unknown;model?:unknown;account_digest?:unknown};call_id?:unknown};
   if(body?.format!=='cimiloop/codex-fact-request/1.0.0'||body.parent?.operation_key!==operation!.invocation_key||body.parent.model!==binding.model||body.parent.account_digest!==binding.account_digest||typeof body.call_id!=='string'||request.operation_key!==digest(JSON.stringify({parent_operation_key:operation!.invocation_key,call_id:body.call_id})).value)fail();
  }
  signal?.throwIfAborted();
  // Prompt guidance, a post-response assertion and a bounded account hold do
  // not limit server output (including reasoning), retries or tool continuations.
  // Do not reach super.execute until that complete send-side policy is installed.
  return fail('codex_pre_plan_output_budget_unavailable');
 }
}
