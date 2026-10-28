import {isDeepStrictEqual} from 'node:util';import {join} from 'node:path';
import {DedicatedAgentAccountLedger,openDedicatedLedgerModelAccountPort,createDedicatedAgentRuntimeModel,parseAgentWorkspaceToolScope,type DedicatedAgentSkillScope,type DedicatedAgentAccountPort,type DedicatedAgentBudgetRequest,type DedicatedAgentBudgetHold,type DedicatedModelConnection,type AgentWorkspaceToolScope} from '@cimiloop/runtime-adapter';
import {readOriginalSkillInvocation,type SkillInvocationExecutionContext} from './skill-invocation-execution-local.js';
import {LocalSkillInvocationStartCustody} from './skill-invocation-start-custody-local.js';
import {LocalProjectError} from './errors.js';
const fail=()=>new LocalProjectError('原 Skill 账户范围、宿主或当前准入不可证明','CAPABILITY_UNAVAILABLE','conflict');
// Shared code-only service. A child's model uses the original real parent Run,
// its own immutable operation key/input digest, and ONE original account cap.
// No default connection/admission, credential read, Run creation or DB upgrade.
export class LocalSkillInvocationDedicatedAccount implements DedicatedAgentAccountPort {
 readonly #local:SkillInvocationExecutionContext;readonly #invocationId:string;readonly #account:DedicatedAgentAccountLedger;readonly #custody:LocalSkillInvocationStartCustody;readonly #relation:DedicatedAgentSkillScope;
 readonly #identity:{store:SkillInvocationExecutionContext['store'];kernel:SkillInvocationExecutionContext['kernel'];caller:SkillInvocationExecutionContext['caller'];location:SkillInvocationExecutionContext['location'];assessment:SkillInvocationExecutionContext['kernel']['assessSkillInvocationExecution']};
 readonly #assess:SkillInvocationExecutionContext['kernel']['assessSkillInvocationExecution'];
 private constructor(local:SkillInvocationExecutionContext,invocationId:string,account:DedicatedAgentAccountLedger,custody:LocalSkillInvocationStartCustody,relation:DedicatedAgentSkillScope){this.#local=local;this.#invocationId=invocationId;this.#account=account;this.#custody=custody;this.#relation=relation;this.#identity={store:local.store,kernel:local.kernel,caller:structuredClone(local.caller),location:structuredClone(local.location),assessment:local.kernel.assessSkillInvocationExecution};this.#assess=this.#identity.assessment.bind(this.#identity.kernel);}
 static async open(local:SkillInvocationExecutionContext,invocationId:string,account:DedicatedAgentAccountLedger,custody:LocalSkillInvocationStartCustody){
  try{
   if(!(account instanceof DedicatedAgentAccountLedger)||!(custody instanceof LocalSkillInvocationStartCustody))throw fail();
   const original=readOriginalSkillInvocation(local,invocationId),relation=custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id);
   const service=new LocalSkillInvocationDedicatedAccount(local,invocationId,account,custody,structuredClone(relation));service.#guard(relation.child);
   await account.registerSkillScope(relation,()=>{service.#guard(relation.child);});service.#guard(relation.child);return service;
  }catch{throw fail();}
 }
 get admission_digest(){return this.#account.admission_digest;}
 get profile(){return this.#account.profile;}
 get scope(){return structuredClone(this.#relation.child);}
 get modelRoot(){return join(this.#local.location.dataDirectory,'skill-runtime-originals',this.#relation.parent.project_id,this.#relation.child.operation_key);}
 // Trusted code may use controlled transport with the SAME original owner
 // port. This carries no approval, credential or broader parent authority.
 modelAccountPort(){this.#guard(this.#relation.child);return this.#modelAccountPort();}
 #modelAccountPort(beforeEffect?:()=>void){const guard=()=>{const value:unknown=beforeEffect?.();if(value!==undefined){try{void Promise.prototype.then.call(value,undefined,()=>{});}catch{}throw fail();}};return openDedicatedLedgerModelAccountPort(this.#account,this.#relation.child,()=>{guard();this.#guard(this.#relation.child);guard();});}
 #assertIdentity(){const local=this.#local,original=this.#identity;if(local.store!==original.store||local.kernel!==original.kernel||local.kernel.assessSkillInvocationExecution!==original.assessment||!isDeepStrictEqual(local.caller,original.caller)||!isDeepStrictEqual(local.location,original.location))throw fail();}
 #guard(raw:AgentWorkspaceToolScope){
  try{
   this.#assertIdentity();
   const scope=parseAgentWorkspaceToolScope(raw),original=readOriginalSkillInvocation(this.#local,this.#invocationId);
   const relation=this.#custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id);
   if(!isDeepStrictEqual(scope,this.#relation.child)||!isDeepStrictEqual(relation,this.#relation))throw fail();
   this.#assertIdentity();const assessment=this.#assess(structuredClone(original.request));this.#assertIdentity();
   if(!('decision' in assessment)||assessment.decision!=='ALLOW'||!assessment.authority||assessment.authority.invocation_id!==this.#invocationId||assessment.authority.invocation_key!==scope.operation_key||!isDeepStrictEqual(assessment.authority.input_digest,scope.context_digest))throw fail();
   return scope;
  }catch{throw fail();}
 }
 async check(raw:AgentWorkspaceToolScope,connection:DedicatedModelConnection){const scope=this.#guard(raw);await this.#account.check(scope,connection);this.#guard(scope);}
 async reserve(raw:AgentWorkspaceToolScope,request:DedicatedAgentBudgetRequest,body:Uint8Array){const scope=this.#guard(raw),hold=await this.#account.reserve(scope,structuredClone(request),Buffer.from(body),()=>{this.#guard(scope);});this.#guard(scope);return hold;}
 async verifyHold(raw:AgentWorkspaceToolScope,hold:DedicatedAgentBudgetHold){const scope=this.#guard(raw);await this.#account.verifyHold(scope,structuredClone(hold));this.#guard(scope);}
 createModel(connection:DedicatedModelConnection,beforeEffect?:()=>void){this.#guard(this.#relation.child);return createDedicatedAgentRuntimeModel({root:this.modelRoot,credentialBoundaryRoot:this.#local.location.dataDirectory,repositoryPath:this.#local.location.repositoryPath,scope:this.scope,connection,account:this.#modelAccountPort(beforeEffect),methodTools:"fixed_named_method/1.0.0"});}
}
