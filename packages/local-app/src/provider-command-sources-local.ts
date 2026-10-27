import {LocalCodexRuntimeControlOriginals} from './codex-runtime-control-originals-local.js';
import{isDeepStrictEqual as same}from'node:util';import{parseVersionedCommand}from'@cimiloop/protocol';import type{KernelResult}from'@cimiloop/kernel';
import type{LocalProject}from'./project.js';import type{LocalProviderVerifier}from'./providers-local.js';import{openInstalledCodexAgentRuntime}from'./agent-codex-installation-local.js';import{LocalCodexNamedMethodOriginals}from'./codex-named-method-originals-local.js';import{LocalProjectError}from'./errors.js';
import{LocalCodexRuntimeSdkOriginals}from'./codex-runtime-sdk-originals-local.js';
const unavailable=()=>new LocalProjectError('原Provider命令上下文或当前Human会话已变化','CAPABILITY_UNAVAILABLE','conflict');
// Opens existing protected source metadata only. No login read, model send,
// Provider approval, new Run or source selection from command JSON.
export async function executeProviderCommandWithSources(local:LocalProject,verifier:LocalProviderVerifier,raw:unknown,beforeCommit:()=>void=()=>{}):Promise<KernelResult>{
 let input:unknown;try{input=structuredClone(raw);}catch{input=raw;}
 const store=local.store,kernel=local.kernel,execute=kernel.execute,location=structuredClone(local.location),instance=structuredClone(local.instance);
 const guard=()=>{if(local.store!==store||local.kernel!==kernel||kernel.execute!==execute||!same(local.location,location)||!same(local.instance,instance))throw unavailable();const value:unknown=beforeCommit();if(value!==undefined){if(value instanceof Promise)void Promise.prototype.then.call(value,undefined,()=>{});throw unavailable();}if(local.store!==store||local.kernel!==kernel||kernel.execute!==execute)throw unavailable();};
 const run=()=>{guard();return Reflect.apply(execute,kernel,[input]) as KernelResult;};let command;
 try{command=parseVersionedCommand(input);}catch{return run();}
 if(command.schema_version!=='2.0.0'||!['RecordProviderEvidence','EvaluateProvider','RegisterProviderBinding'].includes(command.command_type))return run();
 // The Kernel still validates the original actor, payload and digest. A known
 // receipt must survive a missing installation without reopening a factory.
 if(store.transaction(tx=>tx.getCommandReceipt(command.command_id)))return run();
 if(command.command_type!=='RecordProviderEvidence'&&command.command_type!=='EvaluateProvider'&&command.command_type!=='RegisterProviderBinding')return run();
 const descriptor=store.getProviderDescriptor(command.payload.descriptor_ref.id);if(!descriptor||!['skill','runtime'].includes(descriptor.provider_kind))return run();
 const refs=command.command_type==='RecordProviderEvidence'?[command.payload.raw_result_ref]:command.command_type==='EvaluateProvider'?command.payload.evidence_refs.map(ref=>store.getProviderEvidence(ref.id)?.raw_result_ref):store.getProviderEvaluation(command.payload.evaluation_ref.id)?.evidence_refs.map(ref=>store.getProviderEvidence(ref.id)?.raw_result_ref)??[];
 let native=false;try{native=refs.some(ref=>{if(!ref)return false;const body=verifier.readProbe(store.getProject()!,ref);return !!body&&typeof body==='object'&&('format'in body&&body.format==='cimiloop/named-skill-method-evidence/1.0.0'||'evidence_refs'in body&&Array.isArray(body.evidence_refs)&&body.evidence_refs.some((value:unknown)=>!!value&&typeof value==='object'&&'version'in value&&value.version==='runtime-sdk-contract/1.0.0'));});}catch{return run();}if(!native)return run();
 guard();const installed=await openInstalledCodexAgentRuntime(local);
 try{guard();if(!installed)return run();installed.guard();const originals=new LocalCodexNamedMethodOriginals(location.repositoryPath,location.dataDirectory,installed),sdk=new LocalCodexRuntimeSdkOriginals(local,installed);return verifier.withRuntimeSdkOriginals(sdk,guard,()=>descriptor.provider_kind==='skill'?verifier.withNamedOriginals(originals,guard,run):verifier.withRuntimeControlOriginals(new LocalCodexRuntimeControlOriginals(local,installed),guard,run));}finally{installed?.release();}
}
