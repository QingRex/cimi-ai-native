import{isDeepStrictEqual as same}from'node:util';import{existsSync,openSync,closeSync,fsyncSync,writeFileSync,mkdirSync}from'node:fs';import{join}from'node:path';
import{commandDigest}from'@cimiloop/kernel';
import{SCHEMA_VERSION,parseCommand,compileValidator,SkillMethodInputReferenceSchema,type SkillInvocation,type AnyCommand}from'@cimiloop/protocol/v2';
import{digest,bytesAt,directory,assertOrdinaryPath,copyToolJson,parseGatewayJson}from'@cimiloop/runtime-adapter';
import{originalAgentWorkspaceScope}from'./agent-workspace-tools-local.js';import type{SkillInvocationExecutionContext}from'./skill-invocation-execution-local.js';
import type{LocalProject}from'./project.js';import{LocalProjectError}from'./errors.js';
type Local=Omit<SkillInvocationExecutionContext,'kernel'>&{kernel:Pick<LocalProject['kernel'],'execute'>};
type OriginalWriter=Parameters<Parameters<Local['store']['transaction']>[0]>[0];
export type ParentSkillOriginalReader=Pick<OriginalWriter,'getCurrentProject'|'getActor'|'getRun'|'getRuntimeRecord'|'getCommandReceipt'|'listRuntimeRecords'|'getExecutionObject'|'getVerificationRecord'>;
export function parentSkillOriginalMetadata(reader:ParentSkillOriginalReader){return{getProject:()=>reader.getCurrentProject(),getActor:reader.getActor.bind(reader),getRun:reader.getRun.bind(reader),getRuntimeRecord:reader.getRuntimeRecord.bind(reader),listRuntimeRecords:reader.listRuntimeRecords.bind(reader),getExecutionObject:reader.getExecutionObject.bind(reader),getVerificationRecord:reader.getVerificationRecord.bind(reader)};}
interface Entry{skill_alias:string;method_name:string;input_alias:string;skill_binding:ReturnType<typeof originalAgentWorkspaceScope>['skill_bindings'][number];input_ref:SkillInvocation['input_ref']}
interface Catalog{format:'cimiloop/agent-parent-skill-catalog/1.0.0';scope_digest:string;entries:Entry[];catalog_digest:string}
interface Options{local:Local;runId:string;catalog:Catalog;beforeReservation:()=>void;beforeReply?:()=>void;now?:()=>string}
const token=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v),id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
function fail():never{throw new LocalProjectError('原父SDK Skill调用、固定输入或原命令不可证明','CAPABILITY_UNAVAILABLE','conflict');}
function synchronous(guard:()=>void){const value:unknown=guard();if(value!==undefined){if(value instanceof Promise)void Promise.prototype.then.call(value,undefined,()=>{});fail();}}
function read(path:string){const bytes=bytesAt(path,65536),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),value=copyToolJson(parseGatewayJson(text,65536));if(JSON.stringify(value)!==text)fail();return value;}
function saveOnce(path:string,value:unknown):boolean{const bytes=Buffer.from(JSON.stringify(value));if(!bytes.length||bytes.length>65536)fail();assertOrdinaryPath(path);let fd:number;try{fd=openSync(path,'wx');}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='EEXIST')return false;throw error;}try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}return true;}
// Run-bound derived UUIDv7: its time field is the immutable original Run
// creation millisecond, never a hash or a claim about new call birth time.
// Stable original command identity also survives loss of every file-only
// call record. Kernel receipt/input equality then refuses a second effect.
function originalCommandId(scope:ReturnType<typeof originalAgentWorkspaceScope>,call_id:string,bornAt:string):string{const milliseconds=Date.parse(bornAt);if(!Number.isSafeInteger(milliseconds)||milliseconds<0||milliseconds>=281474976710656||new Date(milliseconds).toISOString()!==bornAt)fail();const hash=(milliseconds.toString(16).padStart(12,'0')+digest(JSON.stringify({format:'cimiloop/agent-parent-sdk-command-key/1.0.0',scope,call_id})).value.slice(12,32)).split('');hash[12]='7';hash[16]=((Number.parseInt(hash[16]!,16)&3)|8).toString(16);const h=hash.join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
// Trusted application service only. The caller/Run/catalog and synchronous live
// host guard are installed by code. No HTTP or model field selects an actor,
// binding, input reference, revision or Kernel command. This stage reserves a
// child only; Native execution and independently verified return are separate.
export class LocalAgentParentSkillCalls{
 private readonly location:Local["location"];private readonly caller:Local["caller"];private readonly bornAt:string;private readonly scope:ReturnType<typeof originalAgentWorkspaceScope>;private readonly catalog:Catalog;private readonly options:Options;
 private constructor(options:Options,scope:ReturnType<typeof originalAgentWorkspaceScope>,catalog:Catalog){this.options={...options,beforeReservation:options.beforeReservation,now:options.now??(()=>new Date().toISOString())};this.scope=scope;this.catalog=catalog;this.location=structuredClone(options.local.location);this.caller=structuredClone(options.local.caller);const run=options.local.store.getRun(scope.run_id);if(!run)fail();this.bornAt=run.created_at;originalCommandId(scope,'validate',this.bornAt);}
 static open(options:Options){
  if(typeof options.beforeReservation!=='function'||options.beforeReply!==undefined&&typeof options.beforeReply!=='function'||options.now!==undefined&&typeof options.now!=='function')fail();
  const scope=structuredClone(originalAgentWorkspaceScope(options.local,options.runId)),raw=copyToolJson(options.catalog);
  if(!exact(raw,['format','scope_digest','entries','catalog_digest'])||raw.format!=='cimiloop/agent-parent-skill-catalog/1.0.0'||raw.scope_digest!==digest(JSON.stringify(scope)).value||!Array.isArray(raw.entries)||!raw.entries.length||raw.entries.length>64)fail();
  const keys=new Set<string>();
  for(const entry of raw.entries){if(!exact(entry,['skill_alias','method_name','input_alias','skill_binding','input_ref'])||![entry.skill_alias,entry.method_name,entry.input_alias].every(token)||!scope.skill_bindings.some(pin=>same(pin,entry.skill_binding)))fail();const key=[entry.skill_alias,entry.method_name,entry.input_alias].join('/');if(keys.has(key))fail();keys.add(key);compileValidator<SkillInvocation['input_ref']>(SkillMethodInputReferenceSchema)(entry.input_ref);}
  const body={format:raw.format,scope_digest:raw.scope_digest,entries:raw.entries};if(raw.catalog_digest!==digest(JSON.stringify(body)).value||Buffer.byteLength(JSON.stringify(raw))>65536)fail();
  return new LocalAgentParentSkillCalls(options,scope,raw as unknown as Catalog);
 }
 // Trusted composition metadata only; raw input references and bindings stay
 // outside the SDK alias projection. These getters grant no effect authority.
 get originalIdentity(){return structuredClone({scope:this.scope,location:this.location,caller:this.caller,born_at:this.bornAt});}
 get sdkCatalog(){return {scope_digest:this.catalog.scope_digest,catalog_digest:this.catalog.catalog_digest,entries:this.catalog.entries.map(({skill_alias,method_name,input_alias})=>({skill_alias,method_name,input_alias}))};}
 // Historical evidence reader: never creates directories or executes a command.
 // File anchors bind original bytes; only the immutable Kernel command receipt
 // establishes that the saved intent actually reserved this exact child.
 readOriginal(raw:unknown){return this.options.local.store.transaction(reader=>this.readOriginalFromReader(raw,reader));}
 // Kernel supplies its already active Writer. This core never begins/ends a
 // transaction and reads all original records from that same reader.
 readOriginalFromReader(raw:unknown,reader:ParentSkillOriginalReader){
  const frame=copyToolJson(raw);if(!exact(frame,['format','scope_digest','catalog_digest','call_id','tool','skill_alias','method_name','input_alias'])||frame.format!=='cimiloop/agent-parent-skill-request/1.0.0'||frame.scope_digest!==this.catalog.scope_digest||frame.catalog_digest!==this.catalog.catalog_digest||frame.tool!=='run_skill'||!id(frame.call_id))fail();
  const entry=this.catalog.entries.find(e=>e.skill_alias===frame.skill_alias&&e.method_name===frame.method_name&&e.input_alias===frame.input_alias);if(!entry)fail();
  const identity=()=>{if(!same(this.options.local.location,this.location)||!same(this.options.local.caller,this.caller)||reader.getRun(this.scope.run_id)?.created_at!==this.bornAt||!same(originalAgentWorkspaceScope({...this.options.local,store:parentSkillOriginalMetadata(reader)},this.scope.run_id),this.scope))fail();};identity();
  const root=assertOrdinaryPath(join(this.location.dataDirectory,'agent-parent-skill-call-originals',this.scope.project_id,this.scope.run_id)),headerPath=join(root,'header.json'),path=join(root,frame.call_id,'request.json'),anchorPath=join(root,frame.call_id+'.anchor.json'),header={format:'cimiloop/agent-parent-skill-call-header/1.0.0',scope:this.scope,catalog:this.catalog};
  if(!same(read(headerPath),header))fail();const intent=read(path);if(!exact(intent,['format','frame','command'])||intent.format!=='cimiloop/agent-parent-skill-reservation-intent/1.0.0'||!same(intent.frame,frame))fail();const anchor=read(anchorPath);if(!same(anchor,{format:'cimiloop/agent-parent-skill-call-anchor/1.0.0',scope_digest:this.catalog.scope_digest,call_id:frame.call_id,intent_digest:digest(JSON.stringify(intent)).value}))fail();
  const command=parseCommand(intent.command);if(command.command_id!==originalCommandId(this.scope,frame.call_id,this.bornAt)||command.correlation_id!==command.command_id||command.command_type!=='ReserveSkillInvocation'||command.project_id!==this.scope.project_id||command.actor_id!==this.scope.executor_actor_id||command.acting_role!=='executor'||command.target.object_type!=='run'||command.target.id!==this.scope.run_id||command.source.origin!=='agent'||command.source.producer!=='cimiloop-parent-sdk-skill'||!same(command.payload,{skill_binding_ref:entry.skill_binding.binding_ref,method_name:entry.method_name,input_ref:entry.input_ref}))fail();
  const invocation=(()=>{const receipt=reader.getCommandReceipt(command.command_id);if(!receipt||receipt.command_id!==command.command_id||receipt.request_digest!==commandDigest(command)||!('ok'in receipt.result)||receipt.result.ok!==true||!('command_type'in receipt.result)||receipt.result.command_type!=='ReserveSkillInvocation')fail();const value=receipt.result.data.invocation;if(!same(reader.getRuntimeRecord('skill_invocation',value.id),value))fail();return value;})();
  if(invocation.run_ref.id!==this.scope.run_id||invocation.run_operation_key!==this.scope.operation_key||invocation.executor_ref.id!==this.scope.executor_actor_id||!same(invocation.skill_binding,entry.skill_binding)||!same(invocation.input_ref,entry.input_ref)||invocation.request.method_name!==entry.method_name)fail();
  identity();if(!same(read(headerPath),header)||!same(read(path),intent)||!same(read(anchorPath),anchor))fail();identity();return structuredClone({frame:frame as Record<string,unknown>&{call_id:string},command,invocation});
 }
 reserve(raw:unknown,signal?:AbortSignal):{invocation:SkillInvocation;replay:boolean}{
  signal?.throwIfAborted();const frame=copyToolJson(raw);if(!exact(frame,['format','scope_digest','catalog_digest','call_id','tool','skill_alias','method_name','input_alias'])||frame.format!=='cimiloop/agent-parent-skill-request/1.0.0'||frame.scope_digest!==this.catalog.scope_digest||frame.catalog_digest!==this.catalog.catalog_digest||frame.tool!=='run_skill'||!id(frame.call_id))fail();
  const entry=this.catalog.entries.find(e=>e.skill_alias===frame.skill_alias&&e.method_name===frame.method_name&&e.input_alias===frame.input_alias);if(!entry)fail();
  const identity=()=>{if(!same(this.options.local.location,this.location)||!same(this.options.local.caller,this.caller)||this.options.local.store.getRun(this.scope.run_id)?.created_at!==this.bornAt||!same(originalAgentWorkspaceScope(this.options.local,this.scope.run_id),this.scope))fail();};const guard=()=>{signal?.throwIfAborted();identity();synchronous(this.options.beforeReservation);signal?.throwIfAborted();identity();};guard();
  const root=directory(join(this.location.dataDirectory,'agent-parent-skill-call-originals',this.scope.project_id,this.scope.run_id)),header={format:'cimiloop/agent-parent-skill-call-header/1.0.0',scope:this.scope,catalog:this.catalog},headerPath=join(root,'header.json');saveOnce(headerPath,header);if(!same(read(headerPath),header))fail();
  const callRoot=assertOrdinaryPath(join(root,frame.call_id)),path=join(callRoot,'request.json'),anchorPath=join(root,frame.call_id+'.anchor.json');let fresh=false;
  try{mkdirSync(callRoot);fresh=true;}catch(error){if(!error||typeof error!=='object'||!('code'in error)||error.code!=='EEXIST')throw error;}
  directory(callRoot);
  if(fresh){
   if(existsSync(anchorPath))fail();
   const run=this.options.local.store.getRun(this.scope.run_id);if(!run)fail();const commandId=originalCommandId(this.scope,frame.call_id,this.bornAt),command=parseCommand({schema_version:SCHEMA_VERSION,command_id:commandId,correlation_id:commandId,requested_at:this.options.now!(),source:{origin:'agent',producer:'cimiloop-parent-sdk-skill'},project_id:this.scope.project_id,actor_id:this.scope.executor_actor_id,acting_role:'executor',command_type:'ReserveSkillInvocation',target:{object_type:'run',id:this.scope.run_id},expected_revision:run.revision,payload:{skill_binding_ref:entry.skill_binding.binding_ref,method_name:entry.method_name,input_ref:entry.input_ref}});
   const intent={format:'cimiloop/agent-parent-skill-reservation-intent/1.0.0',frame,command},anchor={format:'cimiloop/agent-parent-skill-call-anchor/1.0.0',scope_digest:this.catalog.scope_digest,call_id:frame.call_id,intent_digest:digest(JSON.stringify(intent)).value};
   if(!saveOnce(anchorPath,anchor)||!saveOnce(path,intent))fail();
  }
  const intent=read(path);if(!exact(intent,['format','frame','command'])||intent.format!=='cimiloop/agent-parent-skill-reservation-intent/1.0.0'||!same(intent.frame,frame))fail();
  const anchor=read(anchorPath);if(!same(anchor,{format:'cimiloop/agent-parent-skill-call-anchor/1.0.0',scope_digest:this.catalog.scope_digest,call_id:frame.call_id,intent_digest:digest(JSON.stringify(intent)).value}))fail();
  const command:AnyCommand=parseCommand(intent.command);if(command.command_id!==originalCommandId(this.scope,frame.call_id,this.bornAt)||command.correlation_id!==command.command_id||command.command_type!=='ReserveSkillInvocation'||command.project_id!==this.scope.project_id||command.actor_id!==this.scope.executor_actor_id||command.acting_role!=='executor'||command.target.id!==this.scope.run_id||command.source.origin!=='agent'||command.source.producer!=='cimiloop-parent-sdk-skill'||!same(command.payload,{skill_binding_ref:entry.skill_binding.binding_ref,method_name:entry.method_name,input_ref:entry.input_ref}))fail();
  const replay=this.options.local.store.transaction(tx=>!!tx.getCommandReceipt(command.command_id));guard();
  const result=this.options.local.kernel.execute(command);if(!('ok'in result)||result.ok!==true||!('command_type'in result)||result.command_type!=='ReserveSkillInvocation')fail();
  const invocation=result.data.invocation;if(invocation.run_ref.id!==this.scope.run_id||invocation.run_operation_key!==this.scope.operation_key||invocation.executor_ref.id!==this.scope.executor_actor_id||!same(invocation.skill_binding,entry.skill_binding)||!same(invocation.input_ref,entry.input_ref)||invocation.request.method_name!==entry.method_name)fail();
  const originals=()=>{identity();if(!same(read(headerPath),header)||!same(read(path),intent)||!same(read(anchorPath),anchor))fail();};originals();signal?.throwIfAborted();if(this.options.beforeReply)synchronous(this.options.beforeReply);signal?.throwIfAborted();originals();return{invocation:structuredClone(invocation),replay};
 }
}
