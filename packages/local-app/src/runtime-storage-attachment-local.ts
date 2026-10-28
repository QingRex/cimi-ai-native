import {join,parse,resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {isDeepStrictEqual as same} from 'node:util';
import {FixedVolumeQuota,openHostFixedVolumeReader,assertOrdinaryPath,digest,type AgentStartLedger,type FixedVolumeRuntimeScope} from '@cimiloop/runtime-adapter';
import type {LocalProject} from './project.js';
import {LocalProjectError} from './errors.js';

type Context=Pick<LocalProject,'location'|'store'>;
export interface RuntimeStorageInstallation{origin:AgentStartLedger;root:string;installation_digest:string;guard():void}
export interface RuntimeStorageInput{image:string;volume_root:string;maximum_bytes:number}
type Profile='codex'|'dedicated';
function protocol(profile:Profile){
 if(profile!=='codex'&&profile!=='dedicated')throw new Error('runtime_storage_profile_invalid');
 return{namespace:profile+'_runtime_storage',format:'cimiloop/'+profile+'-runtime-storage/1.0.0'};
}
function fail(profile:Profile):never{throw new LocalProjectError(`${profile==='codex'?'Codex':'本地兼容'} Runtime原固定卷与项目写入范围不可核对；保留原卷和原操作`,'CAPABILITY_UNAVAILABLE','conflict');}
const key=(installed:RuntimeStorageInstallation)=>digest(installed.installation_digest).value;
const tools=(installed:RuntimeStorageInstallation)=>join(installed.root,'storage-tools');
function scope(local:Context,profile:Profile):FixedVolumeRuntimeScope{
 const project=local.store.getProject();if(!project||resolve(project.repository_path)!==resolve(local.location.repositoryPath))fail(profile);
 return{project_id:project.id,repository_path:assertOrdinaryPath(local.location.repositoryPath),data_directory:assertOrdinaryPath(local.location.dataDirectory)};
}
export function parseRuntimeStorageInput(local:Context,raw:RuntimeStorageInput,profile:Profile){
 protocol(profile);const input=structuredClone(raw),binding=scope(local,profile);
 if(!input||Object.keys(input).sort().join(',')!=='image,maximum_bytes,volume_root'||typeof input.volume_root!=='string'||!/^([D-Z]):\\$/i.test(input.volume_root)||typeof input.image!=='string'||!Number.isSafeInteger(input.maximum_bytes)||input.maximum_bytes<64*1024**2||input.maximum_bytes>8*1024**3||input.maximum_bytes%(1024**2)!==0)fail(profile);
 input.volume_root=input.volume_root.toUpperCase();input.image=resolve(input.image);
 if([binding.repository_path,binding.data_directory].some(path=>parse(path).root.toUpperCase()!==input.volume_root))fail(profile);return input;
}
// A code-selected profile preserves each transport's original namespace and
// format. The physical reader, volume identity and quota tickets are shared.
export async function openRuntimeStorageAttachment(local:Context,installed:RuntimeStorageInstallation,profile:Profile){
 const {namespace,format}=protocol(profile);installed.guard();const binding=scope(local,profile),row=installed.origin.readExclusive(namespace,key(installed));
 if(!row){
  if(installed.origin.readExclusive('fixed_volume_reader',key(installed))||installed.origin.readExclusive('fixed_volume_reader_ready',key(installed))||installed.origin.readExclusive('fixed_volume_runtime',digest(binding.project_id).value)||installed.origin.listExclusive('fixed_volume_quota').length||existsSync(assertOrdinaryPath(tools(installed))))fail(profile);
  installed.guard();return undefined;
 }
 const body=row.basis as {format?:unknown;installation_digest?:unknown;volume_root?:unknown;quota_ticket?:unknown;runtime_ticket?:unknown;input?:unknown};
 if(!body||Object.keys(body).sort().join(',')!=='format,input,installation_digest,quota_ticket,runtime_ticket,volume_root'||body.format!==format||body.installation_digest!==installed.installation_digest||typeof body.volume_root!=='string')fail(profile);
 const reader=await openHostFixedVolumeReader(installed.origin,tools(installed),key(installed),{installation_digest:installed.installation_digest,scope:binding,input:body.input},{readOnly:true});installed.guard();
 const storage=FixedVolumeQuota.open(installed.origin,reader,body.volume_root).openRuntime(binding),proof=storage.assertRuntime(binding.project_id,binding.repository_path,binding.data_directory);
 if(!same(proof.policy_ticket,body.quota_ticket)||!same(proof.runtime_ticket,body.runtime_ticket)||!same(installed.origin.readExclusive(namespace,key(installed)),row))fail(profile);installed.guard();return storage;
}
export async function bindRuntimeStorageAttachment(local:Context,installed:RuntimeStorageInstallation,raw:RuntimeStorageInput,profile:Profile){
 const {namespace,format}=protocol(profile),input=parseRuntimeStorageInput(local,raw,profile),binding=scope(local,profile);installed.guard();
 const prior=installed.origin.readExclusive(namespace,key(installed));let storage;
 if(prior){storage=await openRuntimeStorageAttachment(local,installed,profile);const proof=storage?.read();if(!proof||proof.observation.image_path!==input.image||proof.observation.volume_root!==input.volume_root||proof.maximum_bytes!==input.maximum_bytes)fail(profile);}
 else{
  if(!installed.origin.readExclusive('fixed_volume_reader',key(installed))&&(installed.origin.listExclusive('fixed_volume_quota').length||installed.origin.readExclusive('fixed_volume_runtime',digest(binding.project_id).value)))fail(profile);
  const reader=await openHostFixedVolumeReader(installed.origin,tools(installed),key(installed),{installation_digest:installed.installation_digest,scope:binding,input});installed.guard();
  storage=FixedVolumeQuota.initialize(installed.origin,reader,input).bindRuntime(binding);const proof=storage.read();
  installed.origin.issueExclusive(namespace,key(installed),{format,installation_digest:installed.installation_digest,volume_root:input.volume_root,input,quota_ticket:proof.policy_ticket,runtime_ticket:proof.runtime_ticket});
  installed.guard();storage=await openRuntimeStorageAttachment(local,installed,profile);
 }
 if(!storage)fail(profile);return{ok:true as const,created:!prior,proof:storage.read(),starts_run:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};
}
