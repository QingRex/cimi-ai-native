import {codexRuntimeInstallationProgramBundle} from './agent-codex-installation-local.js';
import {join} from 'node:path';import {writeFileSync,existsSync} from 'node:fs';import {isDeepStrictEqual as same} from 'node:util';
import {AgentRunBudget,AgentRuntimeModelHost,AgentWorkspaceToolIpc,CodexOriginalMethodRuntime,RuntimeContractFileHost,createBudgetedCodexAgentRuntimeModel,openWindowsAgentRunClock,runOpenCodeWorkspaceRuntime,withinAgentRuntimeTaskBudget,assertAgentRuntimeNativeRoot,bytesAt,digest,directory,runOpenCodeProbe} from '@cimiloop/runtime-adapter';
import type {LocalProject} from './project.js';import {LocalProjectError} from './errors.js';
import {openInstalledCodexUsageBudget} from './agent-codex-usage-budget-local.js';import {openCodexRuntimeStorage} from './agent-codex-storage-local.js';
import {openCodexRuntimeLoginHome,assertCodexRuntimeLoginHome} from './agent-codex-login-home-local.js';import {assertCodexRuntimeWritableStorage} from './agent-codex-writable-storage-local.js';
import {LocalProviderVerifier} from './providers-local.js';
import {runtimeContractPhaseRoot,runtimeContractRequestRoot,type RuntimeContractExecutionLease} from './runtime-contract-local.js';
import {runtimeContractPrompt,readRuntimeContractPhase,type RuntimeContractPhaseResult} from '@cimiloop/runtime-adapter';import {requestDigest} from '@cimiloop/kernel';

function fail():never{throw new LocalProjectError('固定 Runtime 契约需要原 Codex 账户、完整同卷写入范围与原登录目录','CAPABILITY_UNAVAILABLE','conflict');}
// Code-owned execution using the same Native/SDK/model/account primitives as
// production. The sole file authority is the current Kernel technical grant;
// no fabricated Agent tool assessment or business Task/Binding is installed.
export async function openRuntimeContractExecution(local:LocalProject):Promise<RuntimeContractExecutionLease>{
 const account=await openInstalledCodexUsageBudget(local);if(!account)fail();
 try{
  const installed=account.installation,storage=await openCodexRuntimeStorage(local,installed);if(!storage)fail();account.guard();
  const home=await openCodexRuntimeLoginHome(local,installed,storage);if(!home)fail();
  const guard=()=>{account.guard();assertCodexRuntimeWritableStorage(local,account,storage,home);account.guard();};guard();
  return{installation_digest:installed.installation_digest,guard,release:()=>account.release(),async execute(original,phase,beforeEffect){
   let predecessor:RuntimeContractPhaseResult|undefined;
   const current=()=>{guard();const value:unknown=beforeEffect();if(value!==undefined){if(value instanceof Promise)void Promise.prototype.then.call(value,undefined,()=>{});fail();}guard();const verifier=new LocalProviderVerifier(local.location.repositoryPath,local.location.dataDirectory);if(verifier.sourceDigest(local.store.getProject()!,original.authority.descriptor).value!==digest(bytesAt(installed.native_binary,512*1024*1024)).value)fail();
    if(phase.mode==='review'){const edit=original.phases[0];if(!edit||edit.mode!=='edit')fail();const currentEdit=readRuntimeContractPhase(runtimeContractPhaseRoot(local,edit),edit.scope,installed.origin,'edit');if(currentEdit.status!=='Observed'||predecessor&&!same(currentEdit,predecessor))fail();predecessor=currentEdit;}
   };
   current();const scope=phase.scope,root=runtimeContractPhaseRoot(local,phase);assertAgentRuntimeNativeRoot(root);let budget:AgentRunBudget|undefined,files:RuntimeContractFileHost|undefined;
   const clock=await openWindowsAgentRunClock(root);try{
    current();budget=await AgentRunBudget.open(root,{basis:()=>{current();return{scope,task_id:original.request.request_id,first_started_at:original.started_at,max_elapsed_ms:original.request.max_elapsed_ms};},readClock:clock.read,closeClock:clock.close});
    await withinAgentRuntimeTaskBudget(budget,async signal=>{
     current();signal.throwIfAborted();
     // The first phase fixes actual version/canary originals once. A lost
     // completion never elects another boundary probe at the same request id.
     const boundaryId=requestDigest({request:original.request,installation:original.installation_digest}),prior=installed.origin.readExclusive('runtime_contract_boundary_result',boundaryId),boundaryRoot=runtimeContractRequestRoot(local,original);
     if(!prior){if(phase.mode!=='edit'||!installed.origin.claimExclusiveOnce('runtime_contract_boundary_intent',boundaryId,{request_digest:requestDigest(original)}).created)fail();
      const probe=await runOpenCodeProbe({root:boundaryRoot,binary:installed.native_binary,modelProbe:false,privateStorage:true,beforeNativeEffect:()=>{current();signal.throwIfAborted();}});current();signal.throwIfAborted();
      if(probe.provider.version!==original.authority.descriptor.version||probe.provider.binary_digest.value!==original.authority.descriptor.source_ref.digest?.value||!probe.boundaries.every(value=>value.passed&&value.outside_read_denied&&value.outside_write_denied&&value.subprocess_denied&&value.loopback_denied))fail();
      installed.origin.issueExclusive('runtime_contract_boundary_result',boundaryId,{request_digest:requestDigest(original),probe_digest:digest(bytesAt(join(boundaryRoot,'probe-result.json'),1024*1024)).value});
     }else if(!same(prior.basis,{request_digest:requestDigest(original),probe_digest:digest(bytesAt(join(boundaryRoot,'probe-result.json'),1024*1024)).value}))fail();
     current();signal.throwIfAborted();const material=phase.mode==='edit'?Buffer.from('before\n'):bytesAt(join(runtimeContractPhaseRoot(local,original.phases[0]!),'files','input.txt'),16384);if(phase.mode==='review'&&material.toString('utf8')!=='after\n')fail();
     const workspace=directory(join(root,'files'));if(existsSync(join(workspace,'input.txt')))fail();writeFileSync(join(workspace,'input.txt'),material,{flag:'wx'});current();
     files=await RuntimeContractFileHost.open({workspace,tools:root,origin:installed.origin,scope,mode:phase.mode,authority:()=>{current();return requestDigest(original.authority);}});current();signal.throwIfAborted();
     const runtime=new CodexOriginalMethodRuntime({root:join(root,'codex-runtime-originals'),command:{file:installed.binary,args:[],sha256:digest(bytesAt(installed.binary,512*1024*1024)).value},account_digest:installed.account_digest,disabled_mcp_servers:[...installed.disabled_mcp_servers],timeout_ms:180000,state_policy:'private_login_home/2.0.0',environment_policy:'private_user_directories/1.0.0',network_policy:'codex_chatgpt_tunnel/1.0.0',job_policy:'codex_memory_process/1.0.0',path_resolution:'original_volume_handles/1.0.0',package_policy:'explicit_package_access/1.0.0',login_home:assertCodexRuntimeLoginHome(home,local,installed,storage),process_custody:'owner_job/1.0.0',process_root:join(root,'codex-processes')},false,installed.origin,storage,codexRuntimeInstallationProgramBundle(installed));
     const permitted=phase.mode==='edit'?['cimi_read','cimi_replace']:['cimi_read'],port=createBudgetedCodexAgentRuntimeModel({root,scope,runtime,model:installed.model,account_digest:installed.account_digest,quota_account_digest:installed.quota_account_digest,output_profile:installed.output_profile,usage_policy:installed.usage_policy,origin:'external_model',admission_digest:requestDigest({format:'cimiloop/runtime-contract-model-admission/1.0.0',original,phase}),permitted_tools:permitted,authority:{async check(value){if(!same(value,scope))fail();current();},beforeEffect(value){if(!same(value,scope))fail();current();}}},account.budget);
     const prompt=runtimeContractPrompt(phase.mode),model=await AgentRuntimeModelHost.initialize(root,scope,port,permitted,prompt,signal);current();signal.throwIfAborted();const host=files,runBudget=budget!;
     await runOpenCodeWorkspaceRuntime({root,binary:installed.native_binary,scope,prompt,model,runBudget,beforeNativeEffect:current,connect:(supervisor,originalSupervisor,peer,nonce,signal,originalModel)=>AgentWorkspaceToolIpc.open({toolsDirectory:root,scope,supervisor,originalSupervisor,originalPeer:peer,nonce,signal,model:originalModel,runBudget,execute:input=>host.execute(input),cancel:()=>host.close()})});
    });
   }finally{try{await files?.close();}finally{if(budget)await budget.close();else await clock.close();}}
  }};
 }catch(error){account.release();throw error;}
}
