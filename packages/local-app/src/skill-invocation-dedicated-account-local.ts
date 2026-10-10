import {isDeepStrictEqual} from 'node:util';import {join} from 'node:path';
import {DedicatedAgentAccountLedger,createDedicatedAgentRuntimeModel,parseAgentWorkspaceToolScope,type DedicatedAgentSkillScope,type DedicatedAgentAccountPort,type DedicatedAgentBudgetRequest,type DedicatedAgentBudgetHold,type DedicatedModelConnection,type AgentWorkspaceToolScope} from '@cimiloop/runtime-adapter';
import {readOriginalSkillInvocation,type SkillInvocationExecutionContext} from './skill-invocation-execution-local.js';
import {LocalSkillInvocationStartCustody} from './skill-invocation-start-custody-local.js';
import {LocalProjectError} from './errors.js';
const fail=()=>new LocalProjectError('原 Skill 账户范围、宿主或当前准入不可证明','CAPABILITY_UNAVAILABLE','conflict');
// Shared code-only service. A child's model uses the original real parent Run,
// its own immutable operation key/input digest, and ONE original account cap.
// No default connection/admission, credential read, Run creation or DB upgrade.
export class LocalSkillInvocationDedicatedAccount implements DedicatedAgentAccountPort {
 private constructor(private readonly local:SkillInvocationExecutionContext,private readonly invocationId:string,private readonly account:DedicatedAgentAccountLedger,private readonly custody:LocalSkillInvocationStartCustody,private readonly relation:DedicatedAgentSkillScope){}
 static async open(local:SkillInvocationExecutionContext,invocationId:string,account:DedicatedAgentAccountLedger,custody:LocalSkillInvocationStartCustody){
  try{
   if(!(account instanceof DedicatedAgentAccountLedger)||!(custody instanceof LocalSkillInvocationStartCustody))throw fail();
   const original=readOriginalSkillInvocation(local,invocationId),relation=custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id);
   const service=new LocalSkillInvocationDedicatedAccount(local,invocationId,account,custody,structuredClone(relation));service.guard(relation.child);
   await account.registerSkillScope(relation,()=>{service.guard(relation.child);});service.guard(relation.child);return service;
  }catch{throw fail();}
 }
 get admission_digest(){return this.account.admission_digest;}
 get profile(){return this.account.profile;}
 get scope(){return structuredClone(this.relation.child);}
 get modelRoot(){return join(this.local.location.dataDirectory,'skill-runtime-originals',this.relation.parent.project_id,this.relation.child.operation_key);}
 private guard(raw:AgentWorkspaceToolScope){
  try{
   const scope=parseAgentWorkspaceToolScope(raw),original=readOriginalSkillInvocation(this.local,this.invocationId);
   const relation=this.custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id);
   if(!isDeepStrictEqual(scope,this.relation.child)||!isDeepStrictEqual(relation,this.relation))throw fail();
   const assessment=this.local.kernel.assessSkillInvocationExecution(structuredClone(original.request));
   if(!('decision' in assessment)||assessment.decision!=='ALLOW'||!assessment.authority||assessment.authority.invocation_id!==this.invocationId||assessment.authority.invocation_key!==scope.operation_key||!isDeepStrictEqual(assessment.authority.input_digest,scope.context_digest))throw fail();
   return scope;
  }catch{throw fail();}
 }
 async check(raw:AgentWorkspaceToolScope,connection:DedicatedModelConnection){const scope=this.guard(raw);await this.account.check(scope,connection);this.guard(scope);}
 async reserve(raw:AgentWorkspaceToolScope,request:DedicatedAgentBudgetRequest,body:Uint8Array){const scope=this.guard(raw),hold=await this.account.reserve(scope,structuredClone(request),Buffer.from(body),()=>{this.guard(scope);});this.guard(scope);return hold;}
 async verifyHold(raw:AgentWorkspaceToolScope,hold:DedicatedAgentBudgetHold){const scope=this.guard(raw);await this.account.verifyHold(scope,structuredClone(hold));this.guard(scope);}
 createModel(connection:DedicatedModelConnection){this.guard(this.relation.child);return createDedicatedAgentRuntimeModel({root:this.modelRoot,credentialBoundaryRoot:this.local.location.dataDirectory,repositoryPath:this.local.location.repositoryPath,scope:this.scope,connection,account:this});}
}
