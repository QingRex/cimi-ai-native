import {join} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {bytesAt,digest,readOriginalAgentWorkspaceOperation,readAgentWorkspaceIpcOriginals,readAgentRuntimeModelOriginals,
 readWorkspaceFileRunOriginals,AgentWorkspaceCheckHost,readAgentRuntimeNativeResult,parseGatewayJson,
 verifyOriginalTaskExecutionResult,readAgentRuntimeCancellationOriginal,verifyCollectedAgentRuntimeCancellation,agentWorkspaceIpcScopeDigest,type collectAgentRuntimeOperation,type readAgentRuntimeOriginalIdentity,type OriginalTaskDomainBasis} from '@cimiloop/runtime-adapter';
import type {Project,AgentRunRecord,AgentContextManifest} from '@cimiloop/protocol/v2';
import {classifyOriginalAgentExecutionFailure} from './agent-runtime-failure-local.js';
type Identity=ReturnType<typeof readAgentRuntimeOriginalIdentity>;
type Collection=Awaited<ReturnType<typeof collectAgentRuntimeOperation>>;
// Historical originals only. No dispatch, model request, cancellation, recovery
// or Task acceptance. The retained-binary reader checks this host's originals.
export function readOriginalAgentTerminal(root:string,project:Project,record:AgentRunRecord,context:AgentContextManifest,
 identity:Identity,collection:Collection,domain?:OriginalTaskDomainBasis){
 const registered=readOriginalAgentWorkspaceOperation({root,operation:identity.operation,scope:identity.scope});
 const {config,launch,resources}=registered,input=identity.input as Record<string,unknown>;
 const marker=readAgentRuntimeCancellationOriginal(root,identity.scope);
 const cancellation=verifyCollectedAgentRuntimeCancellation({scope_digest:agentWorkspaceIpcScopeDigest(identity.scope),owner:identity.claim.owner,operation_id:identity.claim.operation_id,cancellation_digest:marker?.digest.value??null,operation:identity.operation,input:identity.input,...(marker?{markerBytes:marker.bytes}:{})},collection);
 if(cancellation&&(!domain?.run||domain.run.id!==record.run_id||domain.run.project_id!==project.id||domain.run.record_ref.id!==record.id||domain.run.cancel_requested!==true))throw Error('Kernel original cancellation unproven');
 if(config.format!=='cimiloop/agent-workspace-sandbox-config/5.0.0'||launch?.format!=='cimiloop/agent-workspace-launcher/2.0.0'||
  !same(config.binary_original,input.binary_original)||!input.binary_original||!same(launch.launcher_original,input.sandbox_original)||!input.sandbox_original||
  config.prompt!==input.prompt||config.lifetime_policy!=='agent_task/1.0.0'||config.lifetime_policy!==input.lifetime_policy||config.deadline_uptime_ms!==input.deadline_uptime_ms||
  !same(config.owner,identity.claim.owner)||resources?.resources_disposed!==true||!['ended','recovered'].includes(String(resources.phase))||
  collection.status.status!=='Stopped'||collection.status.resources_disposed!==true||collection.status.cancellation_requested!==!!cancellation||
  collection.synthetic_model_responses!==null||collection.model?.status!=='Observed'||collection.model.unresolved!==0||collection.ipc.status!=='Observed'||collection.ipc.unresolved!==0)throw Error('Original retained terminal unavailable');
 const failure=cancellation?null:classifyOriginalAgentExecutionFailure(identity,collection);
 const names=['original-config.json','original-launcher.json','agent-sandbox-resources.json','agent-sandbox-original.json','agent-sandbox-cleanup.json','stdout.raw','stderr.raw',failure||cancellation?'incomplete.json':'result.json',...(cancellation?['agent-sandbox-cancellation.json']:[])];
 const native_bytes=names.map(name=>{
  const artifact=collection.artifacts.find(a=>a.name===name);if(!artifact)throw Error('Original terminal bytes missing');
  const current=digest(bytesAt(join(identity.operation,name),4*1024*1024));
  if(!same(current,artifact.reference.digest))throw Error('Original terminal bytes changed');return {name,digest:current};
 });
 const json=(name:string)=>structuredClone(parseGatewayJson(bytesAt(join(identity.operation,name),65536).toString('utf8'),65536)) as Record<string,unknown>;
 const suspended=json('agent-sandbox-original.json'),cleanup=json('agent-sandbox-cleanup.json');
 if(suspended.format!=='cimiloop/agent-workspace-sandbox/1.0.0'||suspended.phase!=='suspended'||suspended.nonce!==config.nonce||!same(suspended.supervisor,launch.supervisor)||!same(suspended.peer,resources.runtime)||
  cleanup.format!=='cimiloop/agent-workspace-sandbox/1.0.0'||cleanup.phase!=='ended'||cleanup.nonce!==config.nonce||cleanup.resources_disposed!==true||cleanup.formal_agent_execution_enabled!==false||
  !Array.isArray(cleanup.cleanup_errors)||cleanup.cleanup_errors.length||!failure&&!cancellation&&(cleanup.reason!=='exited'||cleanup.exit_code!==0))throw Error('Original Native cleanup unproven');
 if(cancellation){const incomplete=json('incomplete.json');if(incomplete.format!=='cimiloop/opencode-workspace-incomplete/1.0.0'||incomplete.nonce!==config.nonce||incomplete.original_scope_digest!==config.scope_digest||!same(incomplete.native_exit,{code:130,signal:null})||incomplete.interruption_reason!=='workspace_rehearsal_cancel_requested'||incomplete.completion_proven!==false)throw Error('Original cancelled execution unproven');}
 const read=()=>({ipc:readAgentWorkspaceIpcOriginals(root,identity.scope,String(config.pipe_nonce)),model:readAgentRuntimeModelOriginals(root,identity.scope),
  files:readWorkspaceFileRunOriginals(root,project,record),checks:AgentWorkspaceCheckHost.readRunOriginals(root,project,record)});
 const original=read();
 if(original.ipc.status!=='Observed'||original.ipc.unresolved!==0||!same(original.ipc.header?.scope,identity.scope)||original.model.status!=='Observed'||original.model.calls.some(c=>c.state!=='reply_recorded'||!c.response)||
  original.files.facts.unresolved!==0||original.checks.facts.unresolved!==0)throw Error('Original calls remain unresolved');
 const calls=original.ipc.exchanges.filter(e=>e.request&&typeof e.request==='object'&&'tool' in e.request&&e.request.tool==='model_step');
 if(calls.length!==original.model.calls.length||!calls.length||original.model.calls.some(c=>calls.filter(e=>same(c.request,e.request)&&e.reply&&typeof e.reply==='object'&&'outcome' in e.reply&&e.reply.outcome==='completed'&&'receipt' in e.reply&&same(c.response,e.reply.receipt)).length!==1))throw Error('Original model/IPC calls mismatch');
 const catalogArtifact=collection.artifacts.find(a=>a.name==='check-catalog.json');
 const catalog=catalogArtifact?structuredClone(parseGatewayJson(bytesAt(catalogArtifact.reference.locator,262144).toString('utf8'),262144)):undefined;
 if(catalogArtifact){const name='sandbox/config/check-catalog.json',current=digest(bytesAt(join(identity.operation,name),262144));if(!same(current,catalogArtifact.reference.digest))throw Error('Original check catalog changed');native_bytes.push({name,digest:current});}
 const native=readAgentRuntimeNativeResult(root,project,record,identity.scope,original.ipc,catalog);
 const frames=original.ipc.exchanges.length-calls.length;
 if(frames>0?(native.status!=='Verified'||native.matched_calls!==frames||native.unmatched_native_calls!==0||native.unresolved_native_calls!==0):original.files.calls.length!==0||original.checks.calls.length!==0)throw Error('Original Native/IPC effects unproven');
 const execution=failure||cancellation?null:verifyOriginalTaskExecutionResult(root,project,record,context,identity,collection,domain);
 if(!failure&&!cancellation&&!execution)throw Error('Original domain execution unproven');
 if(!same(read(),original)||!same(readOriginalAgentWorkspaceOperation({root,operation:identity.operation,scope:identity.scope}),registered)||native_bytes.some(b=>!same(digest(bytesAt(join(identity.operation,b.name),4*1024*1024)),b.digest)))throw Error('Original terminal changed during verification');
 if(cancellation){const again=readAgentRuntimeCancellationOriginal(root,identity.scope);if(!same(marker,again))throw Error('Original cancellation changed during verification');return {format:'cimiloop/agent-original-terminal/2.0.0' as const,status:'cancelled' as const,cancellation,native_bytes,original_calls_digest:digest(JSON.stringify(original)),failure:null,execution:null};}
 return {format:'cimiloop/agent-original-terminal/1.0.0' as const,status:failure?'failed' as const:'succeeded' as const,native_bytes,
  original_calls_digest:digest(JSON.stringify(original)),failure,execution};
}
