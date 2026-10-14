import {agentWorkspaceConfigBaseFormat} from '@cimiloop/runtime-adapter';
import {existsSync} from 'node:fs';
import {assertAgentParentSkillConfig,parseAgentParentSkillSdkCatalog,isAgentParentSkillToolSet,type AgentParentSkillHistoricalResultReader} from '@cimiloop/runtime-adapter';
import {captureLocalAgentParentSkillResults} from './agent-parent-skill-results-local.js';
import {join} from 'node:path';
import {isDeepStrictEqual as same} from 'node:util';
import {readOriginalAgentJobObservation,isOriginalAgentNativeSuspension,bytesAt,digest,readOriginalAgentWorkspaceOperation,readAgentWorkspaceIpcOriginals,readAgentRuntimeModelOriginals,
 readWorkspaceFileRunOriginals,AgentWorkspaceCheckHost,readAgentRuntimeNativeResult,parseGatewayJson,
 verifyOriginalTaskExecutionResult,readAgentRuntimeCancellationOriginal,verifyCollectedAgentRuntimeCancellation,agentWorkspaceIpcScopeDigest,type collectAgentRuntimeOperation,type readAgentRuntimeOriginalIdentity,type OriginalTaskDomainBasis} from '@cimiloop/runtime-adapter';
import type {Project,AgentRunRecord,AgentContextManifest} from '@cimiloop/protocol/v2';
import {classifyOriginalAgentExecutionFailure} from './agent-runtime-failure-local.js';
type Identity=ReturnType<typeof readAgentRuntimeOriginalIdentity>;
type Collection=Awaited<ReturnType<typeof collectAgentRuntimeOperation>>;
// Historical originals only. No dispatch, model request, cancellation, recovery
// or Task acceptance. The retained-binary reader checks this host's originals.
export function readOriginalAgentTerminal(root:string,project:Project,record:AgentRunRecord,context:AgentContextManifest,
 identity:Identity,collection:Collection,domain?:OriginalTaskDomainBasis,parentReader?:AgentParentSkillHistoricalResultReader){
 const basis=structuredClone({project,record,context,identity,collection,domain});
 const registered=readOriginalAgentWorkspaceOperation({root,operation:identity.operation,scope:identity.scope});
 const {config,launch,resources}=registered,input=identity.input as Record<string,unknown>;
 const parent=assertAgentParentSkillConfig(config,input),installedParent=parent?captureLocalAgentParentSkillResults(parentReader?{forOriginal:()=>parentReader}:undefined)?.(identity.scope):undefined;
 const parentCatalog=installedParent?parseAgentParentSkillSdkCatalog(installedParent.sdkCatalog,identity.scope):undefined;
 if(parent&&!parentCatalog||!same({project,record,context,identity,collection,domain},basis))throw Error('Original parent terminal reader unavailable');
 const marker=readAgentRuntimeCancellationOriginal(root,identity.scope);
 const cancellation=verifyCollectedAgentRuntimeCancellation({scope_digest:agentWorkspaceIpcScopeDigest(identity.scope),owner:identity.claim.owner,operation_id:identity.claim.operation_id,cancellation_digest:marker?.digest.value??null,operation:identity.operation,input:identity.input,...(marker?{markerBytes:marker.bytes}:{})},collection);
 if(cancellation&&(!domain?.run||domain.run.id!==record.run_id||domain.run.project_id!==project.id||domain.run.record_ref.id!==record.id||domain.run.cancel_requested!==true))throw Error('Kernel original cancellation unproven');
 if((parent?agentWorkspaceConfigBaseFormat(config)!=='cimiloop/agent-workspace-sandbox-config/7.0.0':agentWorkspaceConfigBaseFormat(config)!=='cimiloop/agent-workspace-sandbox-config/5.0.0')||launch?.format!=='cimiloop/agent-workspace-launcher/2.0.0'||
  !same(config.binary_original,input.binary_original)||!input.binary_original||!same(launch.launcher_original,input.sandbox_original)||!input.sandbox_original||
  config.prompt!==input.prompt||config.lifetime_policy!=='agent_task/1.0.0'||config.lifetime_policy!==input.lifetime_policy||config.deadline_uptime_ms!==input.deadline_uptime_ms||
  !same(config.owner,identity.claim.owner)||resources?.resources_disposed!==true||!['ended','recovered'].includes(String(resources.phase))||
  collection.status.status!=='Stopped'||collection.status.resources_disposed!==true||collection.status.cancellation_requested!==!!cancellation||
  collection.synthetic_model_responses!==null||collection.model?.status!=='Observed'||collection.model.unresolved!==0||collection.ipc.status!=='Observed'||collection.ipc.unresolved!==0)throw Error('Original retained terminal unavailable');
 const failure=cancellation?null:classifyOriginalAgentExecutionFailure(identity,collection);
 const names=['original-config.json','original-launcher.json','agent-sandbox-resources.json','agent-sandbox-original.json','agent-sandbox-cleanup.json','stdout.raw','stderr.raw',failure||cancellation?'incomplete.json':'result.json',...(cancellation?['agent-sandbox-cancellation.json']:[])];
 const job=readOriginalAgentJobObservation(root,identity.operation,input,config,launch!,resources!);if(job)names.push('agent-job-observation.json');
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
 if(!isOriginalAgentNativeSuspension(suspended,{nonce:config.nonce,supervisor:launch.supervisor,peer:resources.runtime,appcontainer_sid:original.ipc.header?.endpoint.appcontainer_sid})||!same(suspended.peer,original.ipc.header?.endpoint.peer)||!same(suspended.supervisor,original.ipc.header?.endpoint.supervisor))throw Error("Original Native isolation unproven");
 if(original.ipc.status!=='Observed'||original.ipc.unresolved!==0||!same(original.ipc.header?.scope,identity.scope)||original.model.status!=='Observed'||original.model.calls.some(c=>c.state!=='reply_recorded'||!c.response)||
  original.files.facts.unresolved!==0||original.checks.facts.unresolved!==0)throw Error('Original calls remain unresolved');
 const calls=original.ipc.exchanges.filter(e=>e.request&&typeof e.request==='object'&&'tool' in e.request&&e.request.tool==='model_step');
 if(calls.length!==original.model.calls.length||!calls.length||original.model.calls.some(c=>calls.filter(e=>same(c.request,e.request)&&e.reply&&typeof e.reply==='object'&&'outcome' in e.reply&&e.reply.outcome==='completed'&&'receipt' in e.reply&&same(c.response,e.reply.receipt)).length!==1))throw Error('Original model/IPC calls mismatch');
 const catalogArtifact=collection.artifacts.find(a=>a.name==='check-catalog.json');
 const catalog=catalogArtifact?structuredClone(parseGatewayJson(bytesAt(catalogArtifact.reference.locator,262144).toString('utf8'),262144)):undefined;
 if(catalogArtifact){const name='sandbox/config/check-catalog.json',current=digest(bytesAt(join(identity.operation,name),262144));if(!same(current,catalogArtifact.reference.digest))throw Error('Original check catalog changed');native_bytes.push({name,digest:current});}
 if(parent){
  const artifact=collection.artifacts.find(a=>a.name==='parent-skill-catalog.json'),name='sandbox/config/parent-skill-catalog.json',bytes=bytesAt(join(identity.operation,name),16384),binding=config.parent_skill_original_binding as Record<string,unknown>;
  if(!artifact||!same(digest(bytes),artifact.reference.digest)||!bytes.equals(bytesAt(artifact.reference.locator,16384))||digest(bytes).value!==binding.sdk_catalog_digest||!same(parseAgentParentSkillSdkCatalog(structuredClone(parseGatewayJson(bytes.toString('utf8'),16384)),identity.scope),parentCatalog)||binding.catalog_digest!==parentCatalog!.catalog_digest||original.ipc.header?.format!=='cimiloop/agent-workspace-ipc-originals/2.0.0'||original.ipc.header.endpoint.parent_skill_catalog_digest!==parentCatalog!.catalog_digest)throw Error('Original parent terminal catalog unproven');
  const modelArtifact=original.model.artifacts.find(a=>a.name==='header.json');if(!modelArtifact)throw Error('Original parent model header missing');
  const headerBytes=bytesAt(modelArtifact.path,65536);if(digest(headerBytes).value!==modelArtifact.digest)throw Error('Original parent model header changed');
  const header=structuredClone(parseGatewayJson(headerBytes.toString('utf8'),65536)) as Record<string,unknown>;
  if(!header||!['cimiloop/agent-runtime-model-originals/3.0.0','cimiloop/agent-runtime-model-originals/4.0.0'].includes(String(header.format))||header.parent_skill_tools!=='fixed_parent_skill/1.0.0'||!Array.isArray(header.permitted)||!isAgentParentSkillToolSet(header.permitted as string[])||header.task_packet_digest!==digest(String(input.prompt)).value)throw Error('Original parent model mode unproven');
  native_bytes.push({name,digest:digest(bytes)});
 }
 const native=readAgentRuntimeNativeResult(root,project,record,identity.scope,original.ipc,catalog,installedParent);
 const frames=original.ipc.exchanges.length-calls.length;
 if(frames>0?(native.status!=='Verified'||native.matched_calls!==frames||native.unmatched_native_calls!==0||native.unresolved_native_calls!==0):original.files.calls.length!==0||original.checks.calls.length!==0)throw Error('Original Native/IPC effects unproven');
 const execution=failure||cancellation?null:verifyOriginalTaskExecutionResult(root,project,record,context,identity,collection,domain,installedParent);
 if(!failure&&!cancellation&&!execution)throw Error('Original domain execution unproven');
 // Finish every installed child/catalog callback before the final physical,
 // original input and Job rereads. Never call an installed getter afterwards.
 if(parent&&!same(readAgentRuntimeNativeResult(root,project,record,identity.scope,original.ipc,catalog,installedParent),native))throw Error('Original parent Native terminal changed');
 if(!same(readOriginalAgentJobObservation(root,identity.operation,input,config,launch!,resources!),job)||!same({project,record,context,identity,collection,domain},basis))throw Error('Original terminal basis or Job changed');
 if(!same(read(),original)||!same(readOriginalAgentWorkspaceOperation({root,operation:identity.operation,scope:identity.scope}),registered)||native_bytes.some(b=>!same(digest(bytesAt(join(identity.operation,b.name),4*1024*1024)),b.digest)))throw Error('Original terminal changed during verification');
 if(parent){const again=readAgentRuntimeCancellationOriginal(root,identity.scope);if(!same(marker,again))throw Error('Original parent cancellation changed');return {format:'cimiloop/agent-original-terminal/3.0.0' as const,status:cancellation?'cancelled' as const:failure?'failed' as const:'succeeded' as const,cancellation:cancellation??null,parent_skill_catalog_digest:parentCatalog!.catalog_digest,native_bytes,original_calls_digest:digest(JSON.stringify(original)),failure,execution};}
 if(cancellation){const again=readAgentRuntimeCancellationOriginal(root,identity.scope);if(!same(marker,again))throw Error('Original cancellation changed during verification');return {format:'cimiloop/agent-original-terminal/2.0.0' as const,status:'cancelled' as const,cancellation,native_bytes,original_calls_digest:digest(JSON.stringify(original)),failure:null,execution:null};}
 return {format:'cimiloop/agent-original-terminal/1.0.0' as const,status:failure?'failed' as const:'succeeded' as const,native_bytes,
  original_calls_digest:digest(JSON.stringify(original)),failure,execution};
}

// Recheck a previously independently verified terminal after fee callbacks.
// This reads owned original files and ledgers only; it never invokes a parent
// Skill, bill authenticator, domain port, tool, model or recovery action.
export function verifyOriginalAgentTerminalSnapshot(root:string,project:Project,record:AgentRunRecord,identity:Identity,collection:Collection,terminal:ReturnType<typeof readOriginalAgentTerminal>){
 const basis=structuredClone({project,record,identity,collection,terminal}),registered=readOriginalAgentWorkspaceOperation({root,operation:identity.operation,scope:identity.scope}),{config,launch,resources}=registered;
 if(!launch||!resources)throw Error('Original final terminal registration missing');
 const mandatory=['original-config.json','original-launcher.json','agent-sandbox-resources.json','agent-sandbox-original.json','agent-sandbox-cleanup.json','stdout.raw','stderr.raw',terminal.status==='succeeded'?'result.json':'incomplete.json'],allowed=new Set([...mandatory,'agent-job-observation.json','agent-sandbox-cancellation.json','sandbox/config/check-catalog.json','sandbox/config/parent-skill-catalog.json']),seen=new Set<string>();
 for(const row of terminal.native_bytes){if(!allowed.has(row.name)||seen.has(row.name))throw Error('Original final terminal byte scope');seen.add(row.name);}
 if(mandatory.some(name=>!seen.has(name))||terminal.format==='cimiloop/agent-original-terminal/3.0.0'&&!seen.has('sandbox/config/parent-skill-catalog.json'))throw Error('Original final terminal bytes incomplete');
 const calls={ipc:readAgentWorkspaceIpcOriginals(root,identity.scope,String(config.pipe_nonce)),model:readAgentRuntimeModelOriginals(root,identity.scope),files:readWorkspaceFileRunOriginals(root,project,record),checks:AgentWorkspaceCheckHost.readRunOriginals(root,project,record)};
 if(!same(digest(JSON.stringify(calls)),terminal.original_calls_digest))throw Error('Original final terminal calls changed');
 const job=readOriginalAgentJobObservation(root,identity.operation,identity.input as Record<string,unknown>,config,launch,resources),jobBytes=terminal.native_bytes.find(row=>row.name==='agent-job-observation.json');
 if(job?!jobBytes||!same(job.digest,jobBytes.digest):!!jobBytes)throw Error('Original final terminal Job changed');
 const marker=readAgentRuntimeCancellationOriginal(root,identity.scope),cancellation=verifyCollectedAgentRuntimeCancellation({scope_digest:agentWorkspaceIpcScopeDigest(identity.scope),owner:identity.claim.owner,operation_id:identity.claim.operation_id,cancellation_digest:marker?.digest.value??null,operation:identity.operation,input:identity.input,...(marker?{markerBytes:marker.bytes}:{})},collection),expected=terminal.format==='cimiloop/agent-original-terminal/1.0.0'?null:terminal.cancellation;
 if(!same(cancellation??null,expected??null))throw Error('Original final terminal cancellation changed');
 for(const row of terminal.native_bytes){const name=row.name==='sandbox/config/check-catalog.json'?'check-catalog.json':row.name==='sandbox/config/parent-skill-catalog.json'?'parent-skill-catalog.json':row.name,artifact=collection.artifacts.find(a=>a.name===name);if(!artifact||!same(artifact.reference.digest,row.digest)||!same(digest(bytesAt(artifact.reference.locator,4*1024*1024)),row.digest)||!same(digest(bytesAt(join(identity.operation,row.name),4*1024*1024)),row.digest))throw Error('Original final terminal bytes changed');}
 if(!same({project,record,identity,collection,terminal},basis))throw Error('Original final terminal basis changed');
}

// A direct Unknown fee observation may also carry independently read execution
// evidence. Preserve the old captured-byte meaning of result1 and require the
// already proved physical originals of result2. Absence is never cleanup proof.
export function captureOriginalAgentExecutionSnapshot(root:string,project:Project,record:AgentRunRecord,identity:Identity,collection:Collection,parent:boolean){
 const basis=structuredClone({project,record,identity,collection}),names=['original-config.json','original-launcher.json','agent-sandbox-resources.json','agent-sandbox-original.json','agent-sandbox-cleanup.json','result.json','stdout.raw','stderr.raw','check-catalog.json','parent-skill-catalog.json','agent-job-observation.json'];
 const originals=names.flatMap(name=>{const artifact=collection.artifacts.find(a=>a.name===name);if(!artifact){if(['original-config.json','original-launcher.json','agent-sandbox-resources.json','agent-sandbox-original.json','agent-sandbox-cleanup.json','result.json','stdout.raw'].includes(name))throw Error('Original execution snapshot missing');return[];}const reference=structuredClone(artifact.reference),bytes=bytesAt(reference.locator,4*1024*1024);if(!same(digest(bytes),reference.digest))throw Error('Original execution snapshot digest');const file=join(identity.operation,name==='check-catalog.json'?'sandbox/config/check-catalog.json':name==='parent-skill-catalog.json'?'sandbox/config/parent-skill-catalog.json':name),present=existsSync(file);if(parent&&['original-config.json','original-launcher.json','agent-sandbox-resources.json','agent-sandbox-original.json','agent-sandbox-cleanup.json','result.json','stdout.raw','parent-skill-catalog.json'].includes(name)&&!present)throw Error('Original parent execution bytes missing');if(present&&!bytesAt(file,4*1024*1024).equals(bytes))throw Error('Original execution physical bytes changed');return[{name,reference,bytes:Buffer.from(bytes),file,present}];});
 const json=(name:string)=>structuredClone(parseGatewayJson(originals.find(a=>a.name===name)!.bytes.toString('utf8'),65536)) as Record<string,unknown>,config=json('original-config.json'),launch=json('original-launcher.json'),resources=json('agent-sandbox-resources.json');
 const read=()=>({ipc:readAgentWorkspaceIpcOriginals(root,identity.scope,String(config.pipe_nonce)),model:readAgentRuntimeModelOriginals(root,identity.scope),files:readWorkspaceFileRunOriginals(root,project,record),checks:AgentWorkspaceCheckHost.readRunOriginals(root,project,record)}),calls=read(),job=readOriginalAgentJobObservation(root,identity.operation,identity.input as Record<string,unknown>,config,launch,resources);
 return()=>{
  if(!same({project,record,identity,collection},basis)||!same(read(),calls)||!same(readOriginalAgentJobObservation(root,identity.operation,identity.input as Record<string,unknown>,config,launch,resources),job))throw Error('Original execution snapshot changed after fees');
  for(const original of originals){const reference=collection.artifacts.find(a=>a.name===original.name)?.reference;if(!same(reference,original.reference)||!bytesAt(original.reference.locator,4*1024*1024).equals(original.bytes)||existsSync(original.file)!==original.present||original.present&&!bytesAt(original.file,4*1024*1024).equals(original.bytes))throw Error('Original execution bytes changed after fees');}
 };
}
