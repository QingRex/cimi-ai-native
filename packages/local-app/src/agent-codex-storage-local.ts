import {join,parse,resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {isDeepStrictEqual as same} from 'node:util';
import {FixedVolumeQuota,openHostFixedVolumeReader,assertOrdinaryPath,digest,type FixedVolumeRuntimeScope} from '@cimiloop/runtime-adapter';
import {openInstalledCodexAgentRuntime,type InstalledCodexAgentRuntime} from './agent-codex-installation-local.js';
import type {LocalProject} from './project.js';
import {LocalProjectError} from './errors.js';

const namespace='codex_runtime_storage';
type Context=Pick<LocalProject,'location'|'store'>;
export interface CodexRuntimeStorageInput {image:string;volume_root:string;maximum_bytes:number}
const fail=():never=>{throw new LocalProjectError('Codex Runtime原固定卷与项目写入范围不可核对；保留原卷和原操作','CAPABILITY_UNAVAILABLE','conflict');};
const key=(installed:InstalledCodexAgentRuntime)=>digest(installed.installation_digest).value;
const tools=(installed:InstalledCodexAgentRuntime)=>join(installed.root,'storage-tools');
function scope(local:Context):FixedVolumeRuntimeScope {
 const project=local.store.getProject();if(!project||resolve(project.repository_path)!==resolve(local.location.repositoryPath))fail();
 return{project_id:project!.id,repository_path:assertOrdinaryPath(local.location.repositoryPath),data_directory:assertOrdinaryPath(local.location.dataDirectory)};
}

// Borrow the existing protected installation. Query never installs a policy,
// compiles a missing reader, repairs an original or opens login credentials.
export async function openCodexRuntimeStorage(local:Context,installed:InstalledCodexAgentRuntime){
 installed.guard();const binding=scope(local),row=installed.origin.readExclusive(namespace,key(installed));
 if(!row){
  if(installed.origin.readExclusive('fixed_volume_reader',key(installed))||installed.origin.readExclusive('fixed_volume_reader_ready',key(installed))||installed.origin.readExclusive('fixed_volume_runtime',digest(binding.project_id).value)||installed.origin.listExclusive('fixed_volume_quota').length||existsSync(assertOrdinaryPath(tools(installed))))fail();
  installed.guard();return undefined;
 }
 const body=row.basis as {format?:unknown;installation_digest?:unknown;volume_root?:unknown;quota_ticket?:unknown;runtime_ticket?:unknown;input?:unknown};
 if(!body||Object.keys(body).sort().join(',')!=='format,input,installation_digest,quota_ticket,runtime_ticket,volume_root'||body.format!=='cimiloop/codex-runtime-storage/1.0.0'||body.installation_digest!==installed.installation_digest||typeof body.volume_root!=='string')fail();
 const reader=await openHostFixedVolumeReader(installed.origin,tools(installed),key(installed),{installation_digest:installed.installation_digest,scope:binding,input:body.input},{readOnly:true});installed.guard();
 const storage=FixedVolumeQuota.open(installed.origin,reader,body.volume_root as string).openRuntime(binding),proof=storage.assertRuntime(binding.project_id,binding.repository_path,binding.data_directory);
 if(!same(proof.policy_ticket,body.quota_ticket)||!same(proof.runtime_ticket,body.runtime_ticket)||!same(installed.origin.readExclusive(namespace,key(installed)),row))fail();installed.guard();return storage;
}

// Explicit new-project placement; no database migration, VHD attach/format,
// model call or automatic fallback to a directory on the system volume.
export async function installCodexRuntimeStorage(local:LocalProject,raw:CodexRuntimeStorageInput){
 const input=structuredClone(raw),binding=scope(local);
 if(!input||Object.keys(input).sort().join(',')!=='image,maximum_bytes,volume_root'||typeof input.volume_root!=='string'||!/^([D-Z]):\\$/i.test(input.volume_root)||typeof input.image!=='string'||!Number.isSafeInteger(input.maximum_bytes)||input.maximum_bytes<64*1024**2||input.maximum_bytes>8*1024**3||input.maximum_bytes%(1024**2)!==0)fail();
 const volume=input.volume_root.toUpperCase();
 input.volume_root=volume;input.image=resolve(input.image);
 if([binding.repository_path,binding.data_directory].some(path=>parse(path).root.toUpperCase()!==volume))fail();
 const installed=await openInstalledCodexAgentRuntime(local);if(!installed)fail();
 try{
  installed!.guard();const prior=installed!.origin.readExclusive(namespace,key(installed!));let storage;
  if(prior){storage=await openCodexRuntimeStorage(local,installed!);const proof=storage?.read();if(!proof||proof.observation.image_path!==resolve(input.image)||proof.observation.volume_root!==volume||proof.maximum_bytes!==input.maximum_bytes)fail();}
  else{
   if(!installed!.origin.readExclusive('fixed_volume_reader',key(installed!))&&(installed!.origin.listExclusive('fixed_volume_quota').length||installed!.origin.readExclusive('fixed_volume_runtime',digest(binding.project_id).value)))fail();
   const reader=await openHostFixedVolumeReader(installed!.origin,tools(installed!),key(installed!),{installation_digest:installed!.installation_digest,scope:binding,input});installed!.guard();
   storage=FixedVolumeQuota.initialize(installed!.origin,reader,{...input,volume_root:volume}).bindRuntime(binding);const proof=storage.read();
   installed!.origin.issueExclusive(namespace,key(installed!),{format:'cimiloop/codex-runtime-storage/1.0.0',installation_digest:installed!.installation_digest,volume_root:volume,input,quota_ticket:proof.policy_ticket,runtime_ticket:proof.runtime_ticket});
   installed!.guard();storage=await openCodexRuntimeStorage(local,installed!);
  }
  if(!storage)fail();return{ok:true as const,created:!prior,proof:storage!.read(),starts_run:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};
 }finally{installed!.release();}
}
export async function inspectCodexRuntimeStorage(local:LocalProject){
 let installed:InstalledCodexAgentRuntime|undefined;const common={starts_run:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};
 try{installed=await openInstalledCodexAgentRuntime(local);if(!installed)return{...common,state:'missing' as const};const storage=await openCodexRuntimeStorage(local,installed);return storage?{...common,state:'installed' as const,proof:storage.read()}:{...common,state:'missing' as const};}
 catch{return{...common,state:'unavailable' as const};}finally{installed?.release();}
}
