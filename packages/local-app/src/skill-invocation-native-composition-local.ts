import {isDeepStrictEqual as same} from 'node:util';import {join} from 'node:path';
import {assertAgentRuntimeNativeRoot,AgentRunBudget,openWindowsAgentRunClock,AgentNamedMethodHost,AgentRuntimeModelHost,AgentWorkspaceToolIpc,DedicatedAgentAccountLedger,validateFixedMethodContext,runOpenCodeWorkspaceRuntime,withinAgentRuntimeTaskBudget,type DedicatedModelConnection} from '@cimiloop/runtime-adapter';
import {readOriginalSkillInvocation,type SkillInvocationExecutionContext,type SkillInvocationExecutionInputs,type SkillInvocationExecutionPort} from './skill-invocation-execution-local.js';
import {LocalSkillInvocationStartCustody} from './skill-invocation-start-custody-local.js';
import {LocalSkillInvocationDedicatedAccount} from './skill-invocation-dedicated-account-local.js';
import {LocalSkillMethodInputs} from './skill-methods-local.js';
import {readLocalAgentRunBudgetBasis} from './agent-run-budget-local.js';
import {LocalProjectError} from './errors.js';
interface Options {local:SkillInvocationExecutionContext;binary:string;custody:LocalSkillInvocationStartCustody;inputs:LocalSkillMethodInputs;account:DedicatedAgentAccountLedger;connection:DedicatedModelConnection}
const fail=()=>new LocalProjectError('原命名方法、账户或 Native 组合准入不可证明','CAPABILITY_UNAVAILABLE','conflict');
function synchronous(guard:()=>void){const value:unknown=guard();if(value!==undefined){if(value instanceof Promise){try{void Promise.prototype.then.call(value,undefined,()=>{});}catch{}}throw fail();}}
// Code-only installation. Uses the original child operation and real parent Run,
// fixed immutable method materials, the parent's Task clock and shared account.
// This installs neither qualification nor credential/paid-model approval.
export class LocalSkillInvocationNativeComposition implements SkillInvocationExecutionPort {
 readonly custody:LocalSkillInvocationStartCustody;readonly inputs:LocalSkillMethodInputs;
 private constructor(private readonly options:Options){this.custody=options.custody;this.inputs=options.inputs;}
 static open(options:Options){if(!(options.custody instanceof LocalSkillInvocationStartCustody)||!(options.inputs instanceof LocalSkillMethodInputs)||!(options.account instanceof DedicatedAgentAccountLedger)||typeof options.binary!=='string'||!options.binary)throw fail();return new LocalSkillInvocationNativeComposition({...options,connection:structuredClone(options.connection)});}
 async prepare(input:SkillInvocationExecutionInputs,beforeEffect:()=>void){
  let budget:AgentRunBudget|undefined;
  try {
   const original=readOriginalSkillInvocation(this.options.local,input.invocation.id);
   if(!same(input.request,original.request)||!same(input.invocation,original.invocation)||!same(input.descriptor,original.descriptor))throw fail();
   const guard=()=>{
    synchronous(beforeEffect);const current=readOriginalSkillInvocation(this.options.local,input.invocation.id),assessment=this.options.local.kernel.assessSkillInvocationExecution(structuredClone(original.request));
    if(!same(current,original)||!('decision' in assessment)||assessment.decision!=='ALLOW'||!assessment.authority||!same(assessment.request,original.request)||!same(assessment.authority,input.authority))throw fail();
    const fresh=this.inputs.readInvocation(original.project,original.descriptor,original.invocation);if(!same(fresh,input.plan))throw fail();
   };
   guard();validateFixedMethodContext(input.plan.profile,input.plan.files,original.invocation.invocation_key);
   const relation=this.custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id);
   assertAgentRuntimeNativeRoot(join(this.options.local.location.dataDirectory,'skill-runtime-originals',relation.parent.project_id,relation.child.operation_key));
   const basis=()=>{guard();const parent=readLocalAgentRunBudgetBasis(this.options.local,original.invocation.run_ref.id);if(!same(parent.scope,relation.parent))throw fail();return {...parent,scope:relation.child};};
   const expected=basis(),clock=await openWindowsAgentRunClock(this.options.local.location.dataDirectory);
   try {if(!same(expected,basis()))throw fail();budget=await AgentRunBudget.open(this.options.local.location.dataDirectory,{basis,readClock:clock.read,closeClock:clock.close});}catch(error){await clock.close();throw error;}
   const originalBudget=budget;
   return await withinAgentRuntimeTaskBudget(originalBudget,async signal=>{
    guard();const account=await LocalSkillInvocationDedicatedAccount.open(this.options.local,original.invocation.id,this.options.account,this.custody);signal.throwIfAborted();guard();
    if(!same(account.scope,relation.child))throw fail();const port=account.createModel(this.options.connection);await port.check(account.scope);signal.throwIfAborted();guard();
    const prompt=JSON.stringify({format:'cimiloop/agent-runtime-named-method-packet/1.0.0',invocation:original.invocation,method_profile:input.plan.profile,instructions:input.plan.prompt},null,1);
    if(Buffer.byteLength(prompt)>32768||prompt.split(/\r?\n/).length>1000||prompt.split(/\r?\n/).some(line=>Buffer.byteLength(line)>1800))throw fail();
    const method=AgentNamedMethodHost.initialize(account.modelRoot,account.scope,input.plan.profile,input.plan.files,guard);
    const model=await AgentRuntimeModelHost.initialize(account.modelRoot,account.scope,port,['cimi_invoke_skill','cimi_read_method_resource'],prompt,signal);signal.throwIfAborted();guard();
    return {launch:async()=>{
     guard();await runOpenCodeWorkspaceRuntime({root:account.modelRoot,binary:this.options.binary,scope:account.scope,prompt,model,method,runBudget:originalBudget,beforeNativeEffect:guard,
      connect:(supervisor,originalSupervisor,peer,nonce,signal,originalModel)=>AgentWorkspaceToolIpc.open({toolsDirectory:account.modelRoot,scope:account.scope,supervisor,originalSupervisor,originalPeer:peer,nonce,signal,model:originalModel,method,runBudget:originalBudget,execute:async()=>{throw fail();},cancel:async()=>{}})});
    },dispose:()=>originalBudget.close()};
   },staged=>staged.dispose());
  }catch{if(budget)await budget.close();throw fail();}
 }
}
