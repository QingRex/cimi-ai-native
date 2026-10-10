import{isDeepStrictEqual as same}from'node:util';import{join}from'node:path';import{existsSync}from'node:fs';
import{bytesAt,digest,RuntimeAdapterError}from'./files.js';import{parseGatewayJson}from'./gateway-conversation.js';import{copyToolJson}from'./tool-journal.js';import{validWorkspaceWorkerIdentity}from'./workspace-files.js';
const fail=():never=>{throw new RuntimeAdapterError('agent_runtime_cancellation_original_unproven');};
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const phases=['registered','profile_intent','grants_intent','granted','mapped','process_create_intent','runtime_created','suspended','running'];
export interface AgentCancellationBasis{scope_digest:string;owner:unknown;operation_id:string;cancellation_digest:string|null}
// Historical bytes only. The collector independently queries retained OS
// identities; the Kernel separately supplies its authoritative cancellation.
export function verifyAgentRuntimeCancellation(basis:AgentCancellationBasis,read:(name:string)=>Buffer|undefined){
 const raw=read('agent-sandbox-cancellation.json');if(raw===undefined)return undefined;
 const parse=(bytes:Buffer|undefined):Record<string,unknown>=>{if(!bytes||bytes.length>65536)fail();const value=copyToolJson(parseGatewayJson(new TextDecoder('utf8',{fatal:true}).decode(bytes!),65536));if(!value||typeof value!=='object'||Array.isArray(value))fail();return value as Record<string,unknown>;};
 const proof=parse(raw),markerBytes=read('agent-runtime-cancel.json'),marker=parse(markerBytes),configBytes=read('original-config.json'),config=parse(configBytes),launch=parse(read('original-launcher.json')),resources=parse(read('agent-sandbox-resources.json')),cleanup=parse(read('agent-sandbox-cleanup.json'));
 if(!exact(proof,['format','nonce','operation_id','cancellation_digest','scope_digest','config_digest','owner','supervisor','runtime','phase','runtime_resumed','reason'])||proof.format!=='cimiloop/agent-workspace-cancellation/1.0.0'||proof.reason!=='agent_sandbox_cancel_requested'||
  !exact(marker,['format','operation_id','scope_digest'])||marker.format!=='cimiloop/agent-runtime-cancel/1.0.0'||marker.operation_id!==basis.operation_id||marker.scope_digest!==basis.scope_digest||proof.operation_id!==basis.operation_id||proof.cancellation_digest!==basis.cancellation_digest||!basis.cancellation_digest||digest(markerBytes!).value!==basis.cancellation_digest||
  !phases.includes(String(proof.phase))||proof.runtime_resumed!==(proof.phase==='running')||proof.scope_digest!==basis.scope_digest||config.scope_digest!==basis.scope_digest||!same(proof.owner,basis.owner)||
  !validWorkspaceWorkerIdentity(proof.owner)||!validWorkspaceWorkerIdentity(proof.supervisor)||!same(config.owner,proof.owner)||!same(launch.owner,proof.owner)||!same(resources.owner,proof.owner)||!same(launch.supervisor,proof.supervisor)||!same(resources.supervisor,proof.supervisor)||
  proof.config_digest!==digest(configBytes!).value||resources.config_digest!==proof.config_digest||resources.scope_digest!==proof.scope_digest||typeof proof.nonce!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(proof.nonce)||[config,launch,resources,cleanup].some(v=>v.nonce!==proof.nonce)||
  config.format!=='cimiloop/agent-workspace-sandbox-config/5.0.0'||launch.format!=='cimiloop/agent-workspace-launcher/2.0.0'||resources.format!=='cimiloop/agent-workspace-resources/1.0.0'||resources.phase!=='ended'||resources.resources_disposed!==true||!same(resources.runtime,proof.runtime)||
  cleanup.format!=='cimiloop/agent-workspace-sandbox/1.0.0'||cleanup.phase!=='ended'||cleanup.reason!==proof.reason||cleanup.exit_code!==130||cleanup.resources_disposed!==true||cleanup.formal_agent_execution_enabled!==false||!Array.isArray(cleanup.cleanup_errors)||cleanup.cleanup_errors.length)fail();
 const created=['runtime_created','suspended','running'].includes(String(proof.phase));if(created?!validWorkspaceWorkerIdentity(proof.runtime):proof.runtime!==null)fail();
 if(proof.phase==='suspended'||proof.phase==='running'){const original=parse(read('agent-sandbox-original.json'));if(original.format!=='cimiloop/agent-workspace-sandbox/1.0.0'||original.phase!=='suspended'||original.nonce!==proof.nonce||!same(original.supervisor,proof.supervisor)||!same(original.peer,proof.runtime))fail();}
 return{status:'Observed' as const,phase:String(proof.phase),runtime_resumed:proof.phase==='running',reason:'agent_sandbox_cancel_requested' as const,operation_id:basis.operation_id,cancellation_digest:basis.cancellation_digest,completion_proven:false as const,costs_reconciled:false as const};
}
export function verifyCollectedAgentRuntimeCancellation(basis:AgentCancellationBasis&{operation:string;input:unknown;markerBytes?:Buffer},collection:{artifacts:{name:string;reference:{locator:string;digest?:{value:string}}}[];cancellation?:unknown}){
 const names=new Set<string>();for(const artifact of collection.artifacts){if(names.has(artifact.name))fail();names.add(artifact.name);}
 if(existsSync(join(basis.operation,'agent-sandbox-cancellation.json'))!==names.has('agent-sandbox-cancellation.json'))fail();
 const proof=verifyAgentRuntimeCancellation(basis,name=>{const a=collection.artifacts.find(a=>a.name===name);if(!a)return undefined;const bytes=bytesAt(a.reference.locator,65536);if(digest(bytes).value!==a.reference.digest?.value)fail();return bytes;});
 if(proof===undefined?'cancellation' in collection:!same(proof,collection.cancellation))fail();
 if(proof){
  const marker=collection.artifacts.find(a=>a.name==='agent-runtime-cancel.json');if(!basis.markerBytes||!marker||digest(basis.markerBytes).value!==marker.reference.digest?.value)fail();
  for(const name of ['original-config.json','original-launcher.json','agent-sandbox-resources.json','agent-sandbox-cancellation.json','agent-sandbox-cleanup.json',...(['suspended','running'].includes(proof.phase)?['agent-sandbox-original.json']:[])]){const a=collection.artifacts.find(a=>a.name===name);if(!a||digest(bytesAt(join(basis.operation,name),65536)).value!==a.reference.digest?.value)fail();}
  const config=copyToolJson(parseGatewayJson(bytesAt(join(basis.operation,'original-config.json'),65536).toString('utf8'),65536)) as Record<string,unknown>,launch=copyToolJson(parseGatewayJson(bytesAt(join(basis.operation,'original-launcher.json'),65536).toString('utf8'),65536)) as Record<string,unknown>,input=basis.input as Record<string,unknown>;
  if(!input||!input.binary_original||!input.sandbox_original||!same(config.binary_original,input.binary_original)||!same(launch.launcher_original,input.sandbox_original))fail();
 }
 return proof;
}
