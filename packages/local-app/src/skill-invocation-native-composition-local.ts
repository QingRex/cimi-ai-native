import {codexRuntimeInstallationProgramBundle} from './agent-codex-installation-local.js';
import {isDeepStrictEqual as same} from 'node:util';import {join} from 'node:path';
import {assertAgentRuntimeNativeRoot,AgentRunBudget,openWindowsAgentRunClock,AgentNamedMethodHost,AgentRuntimeModelHost,AgentWorkspaceToolIpc,DedicatedAgentAccountLedger,validateFixedMethodContext,runOpenCodeWorkspaceRuntime,withinAgentRuntimeTaskBudget,CodexAgentUsageBudget,CodexOriginalMethodRuntime,createBudgetedCodexAgentRuntimeModel,assertFixedVolumeRuntimeStorage,bytesAt,digest,type FixedVolumeRuntimeStorage,type DedicatedModelConnection} from '@cimiloop/runtime-adapter';
import {readOriginalSkillInvocation,type SkillInvocationExecutionContext,type SkillInvocationExecutionInputs,type SkillInvocationExecutionPort} from './skill-invocation-execution-local.js';
import {LocalSkillInvocationStartCustody} from './skill-invocation-start-custody-local.js';
import {LocalSkillInvocationDedicatedAccount} from './skill-invocation-dedicated-account-local.js';
import {LocalSkillMethodInputs} from './skill-methods-local.js';
import {readLocalAgentRunBudgetBasis} from './agent-run-budget-local.js';
import {LocalProjectError} from './errors.js';
import {assertCodexRuntimeLoginHome,type CodexRuntimeLoginHome} from './agent-codex-login-home-local.js';
import type {InstalledCodexUsageBudget} from './agent-codex-usage-budget-local.js';
import {assertCodexRuntimeWritableStorage} from './agent-codex-writable-storage-local.js';
interface Base {local:SkillInvocationExecutionContext;custody:LocalSkillInvocationStartCustody;inputs:LocalSkillMethodInputs}
interface Options extends Base {binary:string;account:DedicatedAgentAccountLedger;connection:DedicatedModelConnection;runtimeGuard?:()=>void}
interface CodexOptions extends Base {account:InstalledCodexUsageBudget;storage:FixedVolumeRuntimeStorage;loginHome:CodexRuntimeLoginHome}
const fail=()=>new LocalProjectError('原命名方法、账户或 Native 组合准入不可证明','CAPABILITY_UNAVAILABLE','conflict');
function synchronous(guard:()=>void){const value:unknown=guard();if(value!==undefined){if(value instanceof Promise){try{void Promise.prototype.then.call(value,undefined,()=>{});}catch{}}throw fail();}}
// Code-only installation. Uses the original child operation and real parent Run,
// fixed immutable method materials, the parent's Task clock and shared account.
// This installs neither qualification nor credential/paid-model approval.
export class LocalSkillInvocationNativeComposition implements SkillInvocationExecutionPort {
 readonly custody:LocalSkillInvocationStartCustody;readonly inputs:LocalSkillMethodInputs;
 readonly #identity;readonly #assess:SkillInvocationExecutionContext['kernel']['assessSkillInvocationExecution'];
 private constructor(private readonly options:Options|CodexOptions){this.custody=options.custody;this.inputs=options.inputs;const local=options.local;this.#identity={store:local.store,kernel:local.kernel,location:structuredClone(local.location),caller:structuredClone(local.caller),assess:local.kernel.assessSkillInvocationExecution};this.#assess=this.#identity.assess.bind(local.kernel);}
 static open(options:Options){if(!(options.custody instanceof LocalSkillInvocationStartCustody)||!(options.inputs instanceof LocalSkillMethodInputs)||!(options.account instanceof DedicatedAgentAccountLedger)||typeof options.binary!=='string'||!options.binary)throw fail();return new LocalSkillInvocationNativeComposition({...options,connection:structuredClone(options.connection)});}
 // Installs transport only. The Kernel still decides the exact child's current
 // method/Native/account authority; installed login/capacity never supplies ALLOW.
 static openCodex(options:CodexOptions){try{if(Object.hasOwn(options,'connection')||!(options.custody instanceof LocalSkillInvocationStartCustody)||!(options.inputs instanceof LocalSkillMethodInputs)||!(options.account?.budget instanceof CodexAgentUsageBudget))throw fail();const result=new LocalSkillInvocationNativeComposition({...options});result.runtimeGuard();return result;}catch{throw fail();}}
 private assertIdentity(){const local=this.options.local,id=this.#identity;if(local.store!==id.store||local.kernel!==id.kernel||local.kernel.assessSkillInvocationExecution!==id.assess||!same(local.location,id.location)||!same(local.caller,id.caller))throw fail();}
 private runtimeGuard(){this.assertIdentity();if('connection'in this.options){if(this.options.runtimeGuard)synchronous(this.options.runtimeGuard);this.assertIdentity();return;}const {local,account,storage,loginHome}=this.options;synchronous(account.guard.bind(account));assertCodexRuntimeWritableStorage(local,account,storage,loginHome);synchronous(account.guard.bind(account));this.assertIdentity();}
 async prepare(input:SkillInvocationExecutionInputs,beforeEffect:()=>void){
  let budget:AgentRunBudget|undefined;
  try {
   input=structuredClone(input);this.runtimeGuard();
   const original=readOriginalSkillInvocation(this.options.local,input.invocation.id);
   if(!same(input.request,original.request)||!same(input.invocation,original.invocation)||!same(input.descriptor,original.descriptor))throw fail();
   const guard=()=>{
    this.runtimeGuard();synchronous(beforeEffect);this.runtimeGuard();const current=readOriginalSkillInvocation(this.options.local,input.invocation.id),assessment=this.#assess(structuredClone(original.request));this.runtimeGuard();
    if(!same(current,original)||!('decision' in assessment)||assessment.decision!=='ALLOW'||!assessment.authority||!same(assessment.request,original.request)||!same(assessment.authority,input.authority))throw fail();
    const fresh=this.inputs.readInvocation(original.project,original.descriptor,original.invocation);if(!same(fresh,input.plan))throw fail();
   };
   guard();validateFixedMethodContext(input.plan.profile,input.plan.files,original.invocation.invocation_key);
   const relation=this.custody.accountScope(original.project,original.invocation,original.request.parent,original.record_id);
   if(!('connection'in this.options)&&relation.admission_ticket.identity_digest!==this.options.account.installation.origin.identityDigest)throw fail();
   assertAgentRuntimeNativeRoot(join(this.options.local.location.dataDirectory,'skill-runtime-originals',relation.parent.project_id,relation.child.operation_key));
   const basis=()=>{guard();const parent=readLocalAgentRunBudgetBasis(this.options.local,original.invocation.run_ref.id);if(!same(parent.scope,relation.parent))throw fail();return {...parent,scope:relation.child};};
   const expected=basis(),clock=await openWindowsAgentRunClock(this.options.local.location.dataDirectory);
   try {if(!same(expected,basis()))throw fail();budget=await AgentRunBudget.open(this.options.local.location.dataDirectory,{basis,readClock:clock.read,closeClock:clock.close});}catch(error){await clock.close();throw error;}
   const originalBudget=budget;
   return await withinAgentRuntimeTaskBudget(originalBudget,async signal=>{
    guard();const root=join(this.options.local.location.dataDirectory,'skill-runtime-originals',relation.parent.project_id,relation.child.operation_key),scope=relation.child,options=this.options;
    const port=await(async()=>{
     if('connection'in options){const account=await LocalSkillInvocationDedicatedAccount.open(options.local,original.invocation.id,options.account,this.custody);signal.throwIfAborted();guard();if(!same(account.scope,scope)||account.modelRoot!==root)throw fail();return account.createModel(options.connection,guard);}
     const {account,storage,loginHome}=options,installed=account.installation;
     const runtime=new CodexOriginalMethodRuntime({root:join(root,'codex-runtime-originals'),command:{file:installed.binary,args:[],sha256:digest(bytesAt(installed.binary,512*1024*1024)).value},account_digest:installed.account_digest,disabled_mcp_servers:[...installed.disabled_mcp_servers],timeout_ms:180000,state_policy:'private_login_home/2.0.0',environment_policy:'private_user_directories/1.0.0',network_policy:'codex_chatgpt_tunnel/1.0.0',job_policy:'codex_memory_process/1.0.0',path_resolution:'original_volume_handles/1.0.0',package_policy:'explicit_package_access/1.0.0',login_home:assertCodexRuntimeLoginHome(loginHome,options.local,installed,storage),process_custody:'owner_job/1.0.0',process_root:join(options.local.location.dataDirectory,'codex-processes')},false,installed.origin,storage,codexRuntimeInstallationProgramBundle(installed));
     const authority={async check(current:typeof scope){if(!same(current,scope))throw fail();guard();},beforeEffect(current:typeof scope){if(!same(current,scope))throw fail();guard();}};
     return createBudgetedCodexAgentRuntimeModel({root,scope,runtime,model:installed.model,account_digest:installed.account_digest,quota_account_digest:installed.quota_account_digest,output_profile:installed.output_profile,usage_policy:installed.usage_policy,origin:'external_model',admission_digest:digest(JSON.stringify({scope,installation:installed.installation_digest,authority:input.authority})).value,permitted_tools:['cimi_invoke_skill','cimi_read_method_resource'],authority},account.budget);
    })();
    await port.check(scope);signal.throwIfAborted();guard();
    const prompt=JSON.stringify({format:'cimiloop/agent-runtime-named-method-packet/1.0.0',invocation:original.invocation,method_profile:input.plan.profile,instructions:input.plan.prompt},null,1);
    if(Buffer.byteLength(prompt)>32768||prompt.split(/\r?\n/).length>1000||prompt.split(/\r?\n/).some(line=>Buffer.byteLength(line)>1800))throw fail();
    const method=AgentNamedMethodHost.initialize(root,scope,input.plan.profile,input.plan.files,guard);
    const model=await AgentRuntimeModelHost.initialize(root,scope,port,['cimi_invoke_skill','cimi_read_method_resource'],prompt,signal);signal.throwIfAborted();guard();
    return {launch:async()=>{
     guard();await runOpenCodeWorkspaceRuntime({root,binary:'connection'in options?options.binary:options.account.installation.native_binary,scope,prompt,model,method,runBudget:originalBudget,beforeNativeEffect:guard,
      connect:(supervisor,originalSupervisor,peer,nonce,signal,originalModel)=>AgentWorkspaceToolIpc.open({toolsDirectory:root,scope,supervisor,originalSupervisor,originalPeer:peer,nonce,signal,model:originalModel,method,runBudget:originalBudget,execute:async()=>{throw fail();},cancel:async()=>{}})});
    },dispose:()=>originalBudget.close()};
   },staged=>staged.dispose());
  }catch{if(budget)await budget.close();throw fail();}
 }
}
