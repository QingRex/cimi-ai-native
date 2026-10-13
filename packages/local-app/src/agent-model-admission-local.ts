import {existsSync} from 'node:fs';import {join} from 'node:path';import {isDeepStrictEqual} from 'node:util';
import {requestDigest,type AgentRunLaunchAuthorityInput,type AgentRunOriginalResultReader} from '@cimiloop/kernel';import type {Project,Digest} from '@cimiloop/protocol/v2';
import {bytesAt,parseGatewayJson,readWorkspaceFileRunOriginals,inspectAgentRuntimeOriginalRegistration,readAgentWorkspaceIpcOriginals,readAgentRuntimeNativeResult,AgentWorkspaceCheckHost,digest,validWorkspaceWorkerIdentity,assertOrdinaryPath,readAgentWorkspaceIpcCurrentRequest,projectAgentWorkspaceIpcCausalPrefix,type AgentParentSkillHistoricalResultReader} from '@cimiloop/runtime-adapter';
import {captureLocalAgentParentSkillResults} from './agent-parent-skill-results-local.js';
import {LocalRunVerifier} from './runs-local.js';import {LocalAgentStartCustody} from './agent-start-custody-local.js';import {LocalAgentCheckAdmission} from './agent-check-admission-local.js';

// A model admission during Native preparation grants no model send. A missing
// IPC ledger is legal only while the original controller still waits for host
// release; running, disposed, lost and partial histories stay closed.
function preIpcPreparation(root:string,scope:Parameters<typeof readAgentWorkspaceIpcOriginals>[1],identity:Extract<ReturnType<typeof inspectAgentRuntimeOriginalRegistration>,{status:'original'}>['identity'],ipc:ReturnType<typeof readAgentWorkspaceIpcOriginals>){
 const read=(name:string)=>{const path=join(identity.operation,name),bytes=bytesAt(path,65536),value=structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),65536)) as Record<string,unknown>;return{path,bytes,value};};
 const config=read('original-config.json'),launcher=read('original-launcher.json'),resources=read('agent-sandbox-resources.json'),c=config.value,l=launcher.value,r=resources.value;
 const path=assertOrdinaryPath(join(root,'agent-workspace-ipc-originals',(scope as {project_id:string}).project_id,(scope as {run_id:string}).run_id,String(c.pipe_nonce)));
 if(ipc.status!=='Unknown'||ipc.reason!=='agent_ipc_original_registration_missing'||ipc.path!==path||ipc.header!==null||ipc.exchanges.length||ipc.artifacts.length||ipc.unresolved||existsSync(path))throw Error('Original pre-IPC registration unproven');
 const phases=['registered','profile_intent','grants_intent','granted','mapped','process_create_intent','runtime_created','suspended'];
 if(!['cimiloop/agent-workspace-sandbox-config/5.0.0','cimiloop/agent-workspace-sandbox-config/6.0.0','cimiloop/agent-workspace-sandbox-config/7.0.0'].includes(String(c.format))||!phases.includes(String(r.phase))||r.resources_disposed!==false||r.format!=='cimiloop/agent-workspace-resources/1.0.0'||l.format!=='cimiloop/agent-workspace-launcher/2.0.0'||c.scope_digest!==digest(JSON.stringify(scope)).value||r.scope_digest!==c.scope_digest||r.config_digest!==digest(config.bytes).value||r.nonce!==c.nonce||l.nonce!==c.nonce||!validWorkspaceWorkerIdentity(c.owner)||!validWorkspaceWorkerIdentity(l.supervisor)||!isDeepStrictEqual(c.owner,identity.claim.owner)||!isDeepStrictEqual(l.owner,c.owner)||!isDeepStrictEqual(r.owner,c.owner)||!isDeepStrictEqual(r.supervisor,l.supervisor))throw Error('Original pre-IPC preparation unproven');
 const created=['runtime_created','suspended'].includes(String(r.phase));if(created?!validWorkspaceWorkerIdentity(r.runtime):r.runtime!==null)throw Error('Original pre-IPC Runtime unproven');
 const suspensionPath=join(identity.operation,'agent-sandbox-original.json'),snapshots=[config,launcher,resources];
 if(r.phase==='suspended'){const suspension=read('agent-sandbox-original.json'),s=suspension.value;if(s.format!=='cimiloop/agent-workspace-sandbox/1.0.0'||s.phase!=='suspended'||s.nonce!==c.nonce||!isDeepStrictEqual(s.supervisor,l.supervisor)||!isDeepStrictEqual(s.peer,r.runtime))throw Error('Original pre-IPC suspension unproven');snapshots.push(suspension);}else if(existsSync(suspensionPath))throw Error('Original pre-IPC suspension already recorded');
 if(existsSync(path)||snapshots.some(s=>!bytesAt(s.path,65536).equals(s.bytes)))throw Error('Original pre-IPC bytes changed');
 return snapshots.map(({path,bytes})=>({path,digest:digest(bytes).value}));
}

// Explicit trusted composition, closed without an independent live verifyModel
// custody port. No UI JSON can install it or reinterpret a new workspace base.
export class LocalAgentModelAdmission {
 private readonly runs:LocalRunVerifier;
 private readonly parentResults:ReturnType<typeof captureLocalAgentParentSkillResults>;
 private fixed?:{key:string;manifest:ReturnType<LocalRunVerifier['readWorkspace']>;admitted:ReturnType<LocalAgentCheckAdmission['forRun']>};
 constructor(private readonly repositoryPath:string,private readonly dataDirectory:string,private readonly custody:LocalAgentStartCustody,private readonly checks:LocalAgentCheckAdmission,private readonly parentReader?:(reader:AgentRunOriginalResultReader)=>AgentParentSkillHistoricalResultReader){this.runs=new LocalRunVerifier(repositoryPath,dataDirectory);const factory=parentReader;this.parentResults=captureLocalAgentParentSkillResults(factory?{forOriginal:(_scope,writer)=>{if(!writer)throw Error('Original model snapshot reader missing');return factory(writer);}}:undefined);}
 checkModelAuthority(project:Project,raw:AgentRunLaunchAuthorityInput,reader?:AgentRunOriginalResultReader):Digest {
  const input=structuredClone(raw),scope=input.request;
  const key=requestDigest({project,input:{request:scope,context:input.context,record:{id:input.record.id,workspace:input.record.workspace_before_ref},workspace:input.workspace,source:input.source,actions:input.work_item.allowed_actions,resources:input.work_item.allowed_resources}});
  if(!this.fixed){this.fixed={key,manifest:this.runs.readWorkspace(project,input.workspace),admitted:this.checks.forRun(project,{task:input.task,work_item:input.work_item,source:input.source,workspace:input.workspace,runtime_binding:input.runtime_binding,skill_bindings:input.skill_bindings},input.record,input.context,scope,this.custody)};}
  if(this.fixed.key!==key)throw Error('Original model inputs changed');
  this.checks.verifyInstallation();
  const read=()=>{
   const files=readWorkspaceFileRunOriginals(this.dataDirectory,project,input.record),checkCalls=AgentWorkspaceCheckHost.readRunOriginals(this.dataDirectory,project,input.record),runtime=inspectAgentRuntimeOriginalRegistration(this.dataDirectory,scope);
   if(runtime.status==='unknown'||files.facts.unresolved||checkCalls.facts.unresolved)throw Error('Original execution is unresolved');
   const {admitted,manifest}=this.fixed!;
   const fixed=new Set(admitted.recipes.flatMap(recipe=>recipe.inputs.filter(file=>!(recipe.editable_inputs??[]).some(path=>path.toUpperCase()===file.path.toUpperCase())).map(file=>file.path.toUpperCase())));
   const editable=input.work_item.allowed_actions.includes('edit_files')?manifest.files.filter(f=>f.state==='present'&&!fixed.has(f.path.toUpperCase())).map(f=>f.path):[];
   // Installed Native/child callbacks run before the complete current source
   // read. A cut performs one full Git/source projection, then pure original
   // closure; no earlier duplicate projection is reused as authority.
   let ipc:ReturnType<typeof readAgentWorkspaceIpcOriginals>|null=null;
   if(runtime.status==='original'){
    const configPath=join(runtime.identity.operation,'original-config.json');
    if(!existsSync(configPath))throw Error('Original registered Runtime config missing');
    {const config=parseGatewayJson(bytesAt(configPath,65536).toString('utf8'),65536) as Record<string,unknown>;ipc=readAgentWorkspaceIpcOriginals(this.dataDirectory,scope,String(config.pipe_nonce));}
   }
   const current=readAgentWorkspaceIpcCurrentRequest();let preparation:ReturnType<typeof preIpcPreparation>|null=null;
   if(ipc?.status==='Unknown'){if(current||files.calls.length||checkCalls.calls.length||runtime.status!=='original')throw Error('Original IPC effects missing');preparation=preIpcPreparation(this.dataDirectory,scope,runtime.identity,ipc);}
   const causal=ipc?.status==='Observed'?projectAgentWorkspaceIpcCausalPrefix(ipc,current):null;if(current&&!causal)throw Error('Current original IPC missing');
   if(files.calls.length||checkCalls.calls.length||causal?.prefix.exchanges.length){
    if(runtime.status!=='original'||ipc?.status!=='Observed')throw Error('Native effects lack original Runtime/IPC');
    if(!causal)throw Error('Original IPC causal prefix missing');
    const prefix=causal.prefix;
    const catalog={format:admitted.recipes.some(recipe=>!!recipe.source_policy)?'cimiloop/workspace-check-catalog/2.0.0':'cimiloop/workspace-check-catalog/1.0.0',scope_digest:digest(JSON.stringify(scope)).value,node_digest:admitted.node_digest,policy_digest:admitted.policy_digest,recipes:admitted.recipes};
    // Read the actual installed catalog from its original admission. Its digest
    // is the exact one pinned by the authenticated IPC header, never caller data.
    const historical=prefix.exchanges.some(exchange=>exchange.request&&typeof exchange.request==='object'&&'tool'in exchange.request&&exchange.request.tool==='run_skill');
    if(historical&&(!reader||!this.parentResults))throw Error('Independent current Kernel reader for original children missing');
    const child=historical?this.parentResults!(scope,reader!):undefined;
    const native=readAgentRuntimeNativeResult(this.dataDirectory,project,input.record,scope,prefix,{...catalog,catalog_digest:digest(JSON.stringify(catalog)).value},child);
    if(native.status!=='Verified')throw Error('Native/IPC prefix unproven: '+native.reason);
   }
   if(ipc&&runtime.status==='original'){const config=parseGatewayJson(bytesAt(join(runtime.identity.operation,'original-config.json'),65536).toString('utf8'),65536) as Record<string,unknown>;if(!isDeepStrictEqual(readAgentWorkspaceIpcOriginals(this.dataDirectory,scope,String(config.pipe_nonce)),ipc))throw Error('Original IPC bytes changed during child verification');}
   if(!isDeepStrictEqual(readAgentWorkspaceIpcCurrentRequest(),current))throw Error('Original IPC current request changed');
   const workspace=this.runs.modelWorkspace(project,input.workspace,files.calls,editable,manifest);
   // Source reading may be slow. Close original Native/check/Runtime/IPC and
   // the authenticated ticket after it, with no installed callback afterwards.
   if(!isDeepStrictEqual(readWorkspaceFileRunOriginals(this.dataDirectory,project,input.record),files)||!isDeepStrictEqual(AgentWorkspaceCheckHost.readRunOriginals(this.dataDirectory,project,input.record),checkCalls)||!isDeepStrictEqual(inspectAgentRuntimeOriginalRegistration(this.dataDirectory,scope),runtime)||!isDeepStrictEqual(readAgentWorkspaceIpcCurrentRequest(),current))throw Error('Original model evidence changed after workspace read');
   if(ipc&&runtime.status==='original'){const config=parseGatewayJson(bytesAt(join(runtime.identity.operation,'original-config.json'),65536).toString('utf8'),65536) as Record<string,unknown>;if(!isDeepStrictEqual(readAgentWorkspaceIpcOriginals(this.dataDirectory,scope,String(config.pipe_nonce)),ipc))throw Error('Original IPC changed after workspace read');}
   // No external callback follows this final original-byte closure. Source
   // verification may take long enough for Native cleanup or a partial IPC
   // registration to advance; neither is a fresh preparation authorization.
   if(preparation){
    if(runtime.status!=='original'||!ipc||!isDeepStrictEqual(inspectAgentRuntimeOriginalRegistration(this.dataDirectory,scope),runtime)||!isDeepStrictEqual(readAgentWorkspaceIpcCurrentRequest(),current))throw Error('Original preparation identity changed');
    if(!isDeepStrictEqual(preIpcPreparation(this.dataDirectory,scope,runtime.identity,ipc),preparation))throw Error('Original preparation changed after workspace read');
   }
   return {workspace,files,checks:checkCalls,runtime,ipc,admitted,current,causal,preparation};
  };
  const before=read(),live=this.custody.checkModelAuthority(project,input),after=read();if(!isDeepStrictEqual(before,after))throw Error('Original model authority changed during verification');
  return {algorithm:'sha256',value:requestDigest({original:before,live})};
 }
}
