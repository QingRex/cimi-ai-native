import {existsSync} from 'node:fs';import {join} from 'node:path';import {isDeepStrictEqual} from 'node:util';
import {requestDigest,type AgentRunLaunchAuthorityInput} from '@cimiloop/kernel';import type {Project,Digest} from '@cimiloop/protocol/v2';
import {bytesAt,parseGatewayJson,readWorkspaceFileRunOriginals,inspectAgentRuntimeOriginalRegistration,readAgentWorkspaceIpcOriginals,readAgentRuntimeNativeResult,AgentWorkspaceCheckHost,digest} from '@cimiloop/runtime-adapter';
import {LocalRunVerifier} from './runs-local.js';import {LocalAgentStartCustody} from './agent-start-custody-local.js';import {LocalAgentCheckAdmission} from './agent-check-admission-local.js';
// Explicit trusted composition, closed without an independent live verifyModel
// custody port. No UI JSON can install it or reinterpret a new workspace base.
export class LocalAgentModelAdmission {
 private readonly runs:LocalRunVerifier;
 private fixed?:{key:string;manifest:ReturnType<LocalRunVerifier['readWorkspace']>;admitted:ReturnType<LocalAgentCheckAdmission['forRun']>};
 constructor(private readonly repositoryPath:string,private readonly dataDirectory:string,private readonly custody:LocalAgentStartCustody,private readonly checks:LocalAgentCheckAdmission){this.runs=new LocalRunVerifier(repositoryPath,dataDirectory);}
 checkModelAuthority(project:Project,raw:AgentRunLaunchAuthorityInput):Digest {
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
   const workspace=this.runs.modelWorkspace(project,input.workspace,files.calls,editable,manifest);
   let ipc:ReturnType<typeof readAgentWorkspaceIpcOriginals>|null=null;
   if(runtime.status==='original'){
    const configPath=join(runtime.identity.operation,'original-config.json');
    if(existsSync(configPath)){const config=parseGatewayJson(bytesAt(configPath,65536).toString('utf8'),65536) as Record<string,unknown>;ipc=readAgentWorkspaceIpcOriginals(this.dataDirectory,scope,String(config.pipe_nonce));}
   }
   if(files.calls.length||checkCalls.calls.length){
    if(runtime.status!=='original'||ipc?.status!=='Observed')throw Error('Native effects lack original Runtime/IPC');
    if(ipc.exchanges.some((exchange,index)=>exchange.state==='unknown'&&(index!==ipc!.exchanges.length-1||!(exchange.request&&typeof exchange.request==='object'&&'tool' in exchange.request&&exchange.request.tool==='model_step'))))throw Error('Original IPC effect reply unresolved');
    const prefix={...ipc,exchanges:ipc.exchanges.filter(exchange=>!(exchange.request&&typeof exchange.request==='object'&&'tool' in exchange.request&&exchange.request.tool==='model_step')),unresolved:0};
    const catalog={format:admitted.recipes.some(recipe=>!!recipe.source_policy)?'cimiloop/workspace-check-catalog/2.0.0':'cimiloop/workspace-check-catalog/1.0.0',scope_digest:digest(JSON.stringify(scope)).value,node_digest:admitted.node_digest,policy_digest:admitted.policy_digest,recipes:admitted.recipes};
    // Read the actual installed catalog from its original admission. Its digest
    // is the exact one pinned by the authenticated IPC header, never caller data.
    const native=readAgentRuntimeNativeResult(this.dataDirectory,project,input.record,scope,prefix,{...catalog,catalog_digest:digest(JSON.stringify(catalog)).value});
    if(native.status!=='Verified')throw Error('Native/IPC prefix unproven: '+native.reason);
   }else if(ipc?.exchanges.some(exchange=>exchange.request&&typeof exchange.request==='object'&&'tool' in exchange.request&&exchange.request.tool!=='model_step'))throw Error('IPC effects missing from original Native ledgers');
   return {workspace,files,checks:checkCalls,runtime,ipc,admitted};
  };
  const before=read(),live=this.custody.checkModelAuthority(project,input),after=read();if(!isDeepStrictEqual(before,after))throw Error('Original model authority changed during verification');
  return {algorithm:'sha256',value:requestDigest({original:before,live})};
 }
}
