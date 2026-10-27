import {isDeepStrictEqual as same} from 'node:util';
import {readCurrentAgentProviderQualification,type PlanningClarificationBasis} from '@cimiloop/kernel';
import type {NamedSkillMethodEvidence} from '@cimiloop/protocol/v2';
import {LocalMattPlanClarificationVerification} from './planning-clarification-local.js';
import {openInstalledCodexMatt} from './clarification-codex-installation-local.js';
import {openInstalledCodexAgentRuntime,codexRuntimeInstallationProgramBundle} from './agent-codex-installation-local.js';
import {assertCodexProgramBundle,digestRuntimeBinaryFile} from '@cimiloop/runtime-adapter';
import {openCodexRuntimeControlOriginals} from './codex-runtime-control-originals-local.js';
import {LocalCodexNamedMethodOriginals} from './codex-named-method-originals-local.js';
import {LocalCodexRuntimeSdkOriginals} from './codex-runtime-sdk-originals-local.js';
import {installedProviderVerifier,needsInstalledPlanningClarification,withPlanningClarificationVerification,type LocalProject} from './project.js';
import {LocalProjectError} from './errors.js';

const fail=():never=>{throw new LocalProjectError('原 Matt 计划复查或完整方法资格尚不可核对','CAPABILITY_UNAVAILABLE','conflict');};
// Shared CLI/UI composition. Open existing protected sources before entering
// Kernel; the scoped transaction below is strictly synchronous and effect-free.
// Neither this function nor its verifier invokes a model or installs an account.
export async function withInstalledPlanningClarification<T>(local:LocalProject,run:()=>T,beforeCommit:()=>void=()=>{},commandId?:string):Promise<T>{
 const original={store:local.store,kernel:local.kernel,execute:local.kernel.execute,location:structuredClone(local.location),instance:structuredClone(local.instance)};
 const guard=()=>{
  if(local.store!==original.store||local.kernel!==original.kernel||local.kernel.execute!==original.execute||!same(local.location,original.location)||!same(local.instance,original.instance))fail();
  const result:unknown=beforeCommit();if(result!==undefined){try{void Promise.prototype.then.call(result,undefined,()=>{});}catch{/* No thenable effects. */}fail();}
  if(local.store!==original.store||local.kernel!==original.kernel||local.kernel.execute!==original.execute||!same(local.location,original.location)||!same(local.instance,original.instance))fail();
 };
 const execute=()=>{guard();const result=run();guard();return result;};guard();
 if(!needsInstalledPlanningClarification(local)||commandId&&original.store.transaction(tx=>tx.getCommandReceipt(commandId)))return execute();
 const matt=await openInstalledCodexMatt(local);
 let installed:Awaited<ReturnType<typeof openInstalledCodexAgentRuntime>>;
 let controls:Awaited<ReturnType<typeof openCodexRuntimeControlOriginals>>|undefined;
 try{
  guard();if(!matt)return execute();
  installed=await openInstalledCodexAgentRuntime(local);guard();if(!installed)return execute();
  const runtime=installed,verifier=installedProviderVerifier(local);if(!verifier)fail();
  if(matt.model!==runtime.model||matt.account_digest!==runtime.account_digest)fail();
  controls=await openCodexRuntimeControlOriginals(local,runtime,guard);guard();
  const source=controls,sdk=new LocalCodexRuntimeSdkOriginals(local,runtime),named=new LocalCodexNamedMethodOriginals(local.location.repositoryPath,local.location.dataDirectory,runtime);
  const sourceGuard=()=>{guard();source.guard();runtime.guard();matt.guard();};
  const historical=new LocalMattPlanClarificationVerification(local.location.dataDirectory,matt.host,{verifyOriginal(basis:PlanningClarificationBasis,input,method){
   sourceGuard();if(method.source_digest.value!==matt.source_digest||input.basis.project_id!==basis.project.id)fail();
   // Qualification samples cannot authorize a different pre-plan harness.
   // Re-read this actual operation's completed protected process originals.
   // Legacy unconfined Matt installations fail here; matching model/source/
   // account alone never upgrades them to the contained Runtime qualification.
   const actual=matt.readExecutionControls(input,method),config=actual.configuration;
   const programs=assertCodexProgramBundle(codexRuntimeInstallationProgramBundle(runtime),{file:runtime.binary,args:[],sha256:digestRuntimeBinaryFile(runtime.binary)});
   for(const member of [actual,...actual.investigations]){const control=member.control;
   if(config.account_digest!==runtime.account_digest||config.command.file!==runtime.binary||config.command.sha256!==programs.programs[0].sha256||!same(config.command.args,[])||
    !same(config.disabled_mcp_servers??[],runtime.disabled_mcp_servers)||member.request.usage_policy!==runtime.usage_policy||member.request.quota_account_digest!==runtime.quota_account_digest||
    member.original.ordinary_quota?.before.ordinary_usage_allowed!==true||member.original.ordinary_quota.before.account_id_digest!==runtime.quota_account_digest||member.original.ordinary_quota.after.account_id_digest!==runtime.quota_account_digest||
    config.process_custody!=='owner_job/1.0.0'||config.state_policy!=='private_login_home/2.0.0'||
    config.environment_policy!=='private_user_directories/1.0.0'||config.path_resolution!=='original_volume_handles/1.0.0'||config.package_policy!=='explicit_package_access/1.0.0'||
    control.job_policy!=='codex_memory_process/1.0.0'||!same(control.job_limits,{policy:'codex_memory_process/1.0.0',flags:0x2208,job_memory_bytes:2147483648,active_process_limit:8})||control.network_policy!=='codex_chatgpt_tunnel/1.0.0'||!same(control.program_bundle,programs)||
    !same(control.write_confinement?.scope,{project_id:basis.project.id,repository_path:original.location.repositoryPath,data_directory:original.location.dataDirectory})||
    control.network?.stopped!==true||control.network?.boundary_failed!==false||control.network?.limit_exceeded!==false)fail();
   }
   const matches=original.store.listProviderBindings().filter(binding=>{
    const descriptor=original.store.getProviderDescriptor(binding.descriptor_ref.id);
    return binding.project_id===basis.project.id&&descriptor?.provider_kind==='skill'&&descriptor.source_ref.digest?.value===method.source_digest.value;
   });
   // All matches must be unambiguous at the full method-evidence level, not
   // selected by a browser binding ID or an imported "approved" field.
   const matching=matches.filter(binding=>binding.probe_evidence_refs.some(ref=>{
    const evidence=original.store.getProviderEvidence(ref.id);if(!evidence)return false;
    const probe=verifier!.readProbe(basis.project,evidence.raw_result_ref) as NamedSkillMethodEvidence;
    return probe?.format==='cimiloop/named-skill-method-evidence/1.0.0'&&probe.method_name===method.method_name&&probe.purpose==='clarification';
   }));
   if(matching.length!==1)fail();
   const qualification=readCurrentAgentProviderQualification(original.store,verifier!,basis.project,matching[0]!);
   sourceGuard();if(!qualification.qualification_digest)fail();
  }});
  return verifier!.withRuntimeControlOriginals(source.source,sourceGuard,()=>verifier!.withRuntimeSdkOriginals(sdk,sourceGuard,()=>verifier!.withNamedOriginals(named,sourceGuard,()=>withPlanningClarificationVerification(local,historical,execute))));
 }finally{try{controls?.release();}finally{try{installed?.release();}finally{matt?.release();guard();}}}
}
