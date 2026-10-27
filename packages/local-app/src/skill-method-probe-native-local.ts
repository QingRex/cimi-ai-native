import {codexRuntimeInstallationProgramBundle} from './agent-codex-installation-local.js';
import {join} from 'node:path';import {isDeepStrictEqual as same} from 'node:util';
import {AgentRunBudget,AgentNamedMethodHost,AgentRuntimeModelHost,AgentWorkspaceToolIpc,CodexOriginalMethodRuntime,createBudgetedCodexAgentRuntimeModel,openWindowsAgentRunClock,runOpenCodeWorkspaceRuntime,withinAgentRuntimeTaskBudget,assertAgentRuntimeNativeRoot,bytesAt,digest} from '@cimiloop/runtime-adapter';
import type {LocalProject} from './project.js';import {LocalProjectError} from './errors.js';
import {openInstalledCodexUsageBudget} from './agent-codex-usage-budget-local.js';
import {openCodexRuntimeStorage} from './agent-codex-storage-local.js';import {openCodexRuntimeLoginHome,assertCodexRuntimeLoginHome} from './agent-codex-login-home-local.js';
import {assertCodexRuntimeWritableStorage} from './agent-codex-writable-storage-local.js';
import type {SkillMethodProbeExecutionLease} from './skill-method-probe-local.js';
import {LocalProviderVerifier} from './providers-local.js';
const fail=():never=>{throw new LocalProjectError('隔离 Skill 方法需要原 Codex 账户、完整同卷写入范围和原登录目录','CAPABILITY_UNAVAILABLE','conflict');};
// A real fixed-material Native execution. The local Human owner authorizes a
// technical candidate probe, not a business Run or controlled qualification.
export async function openSkillMethodProbeExecution(local:LocalProject):Promise<SkillMethodProbeExecutionLease>{
 const account=await openInstalledCodexUsageBudget(local);if(!account)fail();
 try{
  const installed=account!.installation,storage=await openCodexRuntimeStorage(local,installed);if(!storage)fail();account!.guard();
  const login=await openCodexRuntimeLoginHome(local,installed,storage!);if(!login)fail();
  const guard=()=>{account!.guard();assertCodexRuntimeWritableStorage(local,account!,storage!,login!);account!.guard();};guard();
  return{installation_digest:installed.installation_digest,guard,release:()=>account!.release(),async prepare(input,beforeEffect){
   let budget:AgentRunBudget|undefined;
   const current=()=>{guard();const value:unknown=beforeEffect();if(value!==undefined){void Promise.resolve(value).catch(()=>{});fail();}guard();
    const verifier=new LocalProviderVerifier(local.location.repositoryPath,local.location.dataDirectory);if(verifier.sourceDigest(local.store.getProject()!,input.original.runtime_descriptor).value!==digest(bytesAt(installed.native_binary,512*1024*1024)).value)fail();};
   try{
    current();const {original,plan}=input,scope=original.scope,root=join(local.location.dataDirectory,'skill-method-probe-originals',scope.project_id,scope.operation_key);assertAgentRuntimeNativeRoot(root);
    const clock=await openWindowsAgentRunClock(root);try{current();budget=await AgentRunBudget.open(root,{basis:()=>{current();return{scope,task_id:original.request.request_id,first_started_at:original.started_at,max_elapsed_ms:original.request.max_elapsed_ms};},readClock:clock.read,closeClock:clock.close});}catch(error){await clock.close();throw error;}
    const runBudget=budget;
    return await withinAgentRuntimeTaskBudget(runBudget,async signal=>{
     current();const runtime=new CodexOriginalMethodRuntime({root:join(root,'codex-runtime-originals'),command:{file:installed.binary,args:[],sha256:digest(bytesAt(installed.binary,512*1024*1024)).value},account_digest:installed.account_digest,disabled_mcp_servers:[...installed.disabled_mcp_servers],timeout_ms:180000,state_policy:'private_login_home/2.0.0',environment_policy:'private_user_directories/1.0.0',network_policy:'codex_chatgpt_tunnel/1.0.0',job_policy:'codex_memory_process/1.0.0',path_resolution:'original_volume_handles/1.0.0',login_home:assertCodexRuntimeLoginHome(login!,local,installed,storage!),process_custody:'owner_job/1.0.0',process_root:join(root,'codex-processes')},false,installed.origin,storage!,codexRuntimeInstallationProgramBundle(installed));
     const port=createBudgetedCodexAgentRuntimeModel({root,scope,runtime,model:installed.model,account_digest:installed.account_digest,quota_account_digest:installed.quota_account_digest,output_profile:installed.output_profile,usage_policy:installed.usage_policy,origin:'external_model',admission_digest:digest(JSON.stringify({format:'cimiloop/isolated-skill-method-admission/1.0.0',original})).value,permitted_tools:['cimi_invoke_skill','cimi_read_method_resource'],authority:{async check(value){if(!same(value,scope))fail();current();},beforeEffect(value){if(!same(value,scope))fail();current();}}},account!.budget);
     await port.check(scope);signal.throwIfAborted();current();const prompt=JSON.stringify({format:'cimiloop/agent-runtime-named-method-packet/1.0.0',method_profile:plan.profile,instructions:plan.prompt},null,1);
     if(Buffer.byteLength(prompt)>32768||prompt.split(/\r?\n/).length>1000||prompt.split(/\r?\n/).some(line=>Buffer.byteLength(line)>1800))fail();
     const method=AgentNamedMethodHost.initialize(root,scope,plan.profile,plan.files,current),model=await AgentRuntimeModelHost.initialize(root,scope,port,['cimi_invoke_skill','cimi_read_method_resource'],prompt,signal);signal.throwIfAborted();current();
     return{async launch(){current();await runOpenCodeWorkspaceRuntime({root,binary:installed.native_binary,scope,prompt,model,method,runBudget,beforeNativeEffect:current,connect:(supervisor,originalSupervisor,peer,nonce,signal,originalModel)=>AgentWorkspaceToolIpc.open({toolsDirectory:root,scope,supervisor,originalSupervisor,originalPeer:peer,nonce,signal,model:originalModel,method,runBudget,execute:async()=>fail(),cancel:async()=>{}})});},dispose:()=>runBudget.close()};
    },staged=>staged.dispose());
   }catch(error){if(budget)await budget.close();throw error;}
  }};
 }catch(error){account!.release();throw error;}
}
