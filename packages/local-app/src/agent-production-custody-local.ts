import {isDeepStrictEqual as same} from 'node:util';
import {requestDigest,readCurrentAgentProviderQualification,type AgentRunAdmissionInput,type AgentRunLaunchAuthorityInput,type AgentRunToolAuthorityInput,type ProviderVerifierPort} from '@cimiloop/kernel';
import {copyToolJson,parseGatewayJson,bytesAt,digest,withStartCustodyVerifyTurn,type FixedVolumeRuntimeStorage} from '@cimiloop/runtime-adapter';
import type {Project,AgentContextManifest} from '@cimiloop/protocol/v2';
import type {LocalProject} from './project.js';
import {installedProviderVerifier} from './project.js';
import type {InstalledCodexUsageBudget} from './agent-codex-usage-budget-local.js';
import type {CodexRuntimeLoginHome} from './agent-codex-login-home-local.js';
import type {AgentProductionCustodyPort} from './agent-runtime-admission-local.js';
import {assertCodexRuntimeWritableStorage} from './agent-codex-writable-storage-local.js';
import {LocalEvidenceVerifier} from './evidence-local.js';
import {LocalCodexNamedMethodOriginals} from './codex-named-method-originals-local.js';
import {LocalProjectError} from './errors.js';

const unavailable=(missing='当前完整 Runtime 原始控制依据')=>new LocalProjectError(`正式 Codex 宿主缺少${missing}；保留原请求，不启动模型或 Native`,'CAPABILITY_UNAVAILABLE','conflict',{production_admission:'unapproved',plan:'Codex login',missing:[missing]});
function basis(input:AgentRunAdmissionInput){const {task,work_item:item,source,workspace}=input;return{project_id:task.project_id,task_id:task.id,change_id:task.change_id,definition_ref:task.definition_ref,contract_ref:task.contract_ref,plan_ref:task.plan_ref,work_item_id:item.id,executor_ref:item.executor_ref,allowed_actions:item.allowed_actions,allowed_resources:item.allowed_resources,budget:item.budget,stop_conditions:item.stop_conditions,source_id:source.id,source_digest:source.source_digest,commit_id:source.commit_id,workspace_id:workspace.id,workspace_digest:workspace.state_digest,workspace_manifest_ref:workspace.manifest_ref,runtime_binding:input.runtime_binding,skill_bindings:input.skill_bindings};}
// Concrete host assembly. It re-reads qualifications through the installed
// verifier and native/account/volume leases, not a JSON full-admission flag.
// Four original Runtime control sources remain mandatory; absent sources fail.
export function createInstalledCodexProductionCustody(local:LocalProject,account:InstalledCodexUsageBudget,storage:FixedVolumeRuntimeStorage,home:CodexRuntimeLoginHome):AgentProductionCustodyPort&{guard():void;release():void}{
 const verifier=installedProviderVerifier(local);if(!verifier)throw unavailable();const port:ProviderVerifierPort=verifier;
 if(typeof port.readRuntimeControlEvidence!=='function')throw unavailable('网络／费用／全部物理配额／完整恢复的独立 Runtime 读取器');
 const identity={store:local.store,kernel:local.kernel,instance:structuredClone(local.instance),location:structuredClone(local.location)},installed=account.installation,budget=account.budget,accountGuard=account.guard,methods=new Map(['sourceDigest','schemaDigest','readProbe','readArtifact','readRuntimeControlEvidence','assessNamedSkillMethod'].map(name=>[name,Reflect.get(verifier,name)]));let released=false;
 const content=new LocalEvidenceVerifier(local.location.repositoryPath,local.location.dataDirectory),originals=new LocalCodexNamedMethodOriginals(local.location.repositoryPath,local.location.dataDirectory,installed);
 const guard=()=>withStartCustodyVerifyTurn(()=>{if(released||local.store!==identity.store||local.kernel!==identity.kernel||!same(local.instance,identity.instance)||!same(local.location,identity.location)||installedProviderVerifier(local)!==verifier||account.installation!==installed||account.budget!==budget||account.guard!==accountGuard||[...methods].some(([name,method])=>Reflect.get(verifier,name)!==method))throw unavailable();const result:unknown=accountGuard.call(account);if(result!==undefined){void Promise.resolve(result).catch(()=>{});throw unavailable();}});
 const capture=(project:Project,input:AgentRunAdmissionInput)=>withStartCustodyVerifyTurn(()=>{
  guard();if(project.id!==identity.instance.project_id||project.repository_path!==identity.location.repositoryPath||input.task.project_id!==project.id||input.work_item.project_id!==project.id)throw unavailable();
  const storageBasis=assertCodexRuntimeWritableStorage(local,account,storage,home),pins=[input.runtime_binding,...input.skill_bindings];
  const qualifications=verifier.withNamedOriginals(originals,guard,()=>pins.map(pin=>{const binding=local.store.getProviderBinding(pin.binding_ref.id);if(!binding||requestDigest(binding)!==pin.digest.value)throw unavailable();return readCurrentAgentProviderQualification(local.store,port,project,binding);}));
  const runtime=local.store.getProviderBinding(input.runtime_binding.binding_ref.id),descriptor=runtime&&local.store.getProviderDescriptor(runtime.descriptor_ref.id);
  if(!descriptor||descriptor.provider_kind!=='runtime'||descriptor.source_ref.digest?.value!==digest(bytesAt(installed.native_binary,512*1024*1024)).value)throw unavailable('与原安装一致的 Runtime 程序');
  const result={format:'cimiloop/codex-production-host-admission/1.0.0',basis:basis(input),installation_digest:installed.installation_digest,account:{account_digest:installed.account_digest,quota_account_digest:installed.quota_account_digest,policy_digest:budget.policy_digest,funding:budget.allocationProof()??null},storage:storageBasis,qualifications};guard();return structuredClone(result);
 });
 const verify=(project:Project,input:AgentRunAdmissionInput,reference:AgentContextManifest['host_admission_ref'])=>{const original=copyToolJson(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(content.readContent(reference)),65536)),current=capture(project,input);if(!same(original,current))throw unavailable();guard();if(!same(current,capture(project,input)))throw unavailable();return{algorithm:'sha256' as const,value:requestDigest(current)};};
 guard();return Object.freeze({guard,release(){released=true;},admit(project:Project,input:AgentRunAdmissionInput){const original=capture(project,input),reference=content.storeContent(Buffer.from(JSON.stringify(original)),'agent_host_admission');if(!same(original,capture(project,input)))throw unavailable();return reference;},verifyLaunch:(project:Project,input:AgentRunLaunchAuthorityInput,ref:AgentContextManifest['host_admission_ref'])=>verify(project,input,ref),verifyModel:(project:Project,input:AgentRunLaunchAuthorityInput,ref:AgentContextManifest['host_admission_ref'])=>verify(project,input,ref),verifyTool:(project:Project,input:AgentRunToolAuthorityInput,ref:AgentContextManifest['host_admission_ref'])=>verify(project,input,ref)});
}
