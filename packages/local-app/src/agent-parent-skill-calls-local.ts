import{isDeepStrictEqual as same}from'node:util';import{existsSync,openSync,closeSync,fsyncSync,writeFileSync,mkdirSync}from'node:fs';import{dirname,join}from'node:path';
import{commandDigest}from'@cimiloop/kernel';
import{SCHEMA_VERSION,parseCommand,compileValidator,SkillMethodInputReferenceSchema,type SkillInvocation,type AnyCommand}from'@cimiloop/protocol/v2';
import{digest,bytesAt,directory,assertOrdinaryPath,copyToolJson,parseGatewayJson,parseAgentParentSkillIpcRequest,parseAgentParentCurrentInput,type AgentParentCurrentInput}from'@cimiloop/runtime-adapter';
import{originalAgentWorkspaceScope}from'./agent-workspace-tools-local.js';import type{SkillInvocationExecutionContext}from'./skill-invocation-execution-local.js';
import type{LocalProject}from'./project.js';import{LocalProjectError}from'./errors.js';
type Local=Omit<SkillInvocationExecutionContext,'kernel'>&{kernel:Pick<LocalProject['kernel'],'execute'>};
type OriginalWriter=Parameters<Parameters<Local['store']['transaction']>[0]>[0];
export type ParentSkillOriginalReader=Pick<OriginalWriter,'getCurrentProject'|'getActor'|'getRun'|'getRuntimeRecord'|'getCommandReceipt'|'listRuntimeRecords'|'getExecutionObject'|'getVerificationRecord'>;
export function parentSkillOriginalMetadata(reader:ParentSkillOriginalReader){return{getProject:()=>reader.getCurrentProject(),getActor:reader.getActor.bind(reader),getRun:reader.getRun.bind(reader),getRuntimeRecord:reader.getRuntimeRecord.bind(reader),listRuntimeRecords:reader.listRuntimeRecords.bind(reader),getExecutionObject:reader.getExecutionObject.bind(reader),getVerificationRecord:reader.getVerificationRecord.bind(reader)};}
export interface AgentParentSkillCandidateRecipe{format:'cimiloop/original-run-candidate/1.0.0';goal:string;spec:string;standards:string;required_check_ids:string[]}
export interface AgentParentSkillResolvedCandidate{format:'cimiloop/agent-parent-skill-candidate/1.0.0';scope_digest:string;command_id:string;recipe_digest:string;input_ref:SkillInvocation['input_ref'];proof_ref:{provider:'local_content';resource_type:'skill_invocation_proof';locator:string;digest:SkillInvocation['input_digest']};candidate_digest:string}
export interface AgentParentSkillCandidateRequest{scope:ReturnType<typeof originalAgentWorkspaceScope>;command_id:string;frame:Record<string,unknown>&{call_id:string};recipe:AgentParentSkillCandidateRecipe}
export interface AgentParentSkillCandidatePort{
 // Installed code resolves the actual original Native candidate once before
 // reservation. History reads do not recapture a changed current workspace.
 resolveOriginal(input:AgentParentSkillCandidateRequest):AgentParentSkillResolvedCandidate;
 readOriginal(input:AgentParentSkillCandidateRequest&{candidate:AgentParentSkillResolvedCandidate;reader?:ParentSkillOriginalReader}):AgentParentSkillResolvedCandidate;
 readCurrentOriginal?(input:AgentParentSkillCandidateRequest&{candidate:AgentParentSkillResolvedCandidate;reader:ParentSkillOriginalReader}):AgentParentCurrentInput;
}
interface EntryBase{skill_alias:string;method_name:string;input_alias:string;skill_binding:ReturnType<typeof originalAgentWorkspaceScope>['skill_bindings'][number]}
type Entry=(EntryBase&{input_ref:SkillInvocation['input_ref']})|(EntryBase&{input_recipe:AgentParentSkillCandidateRecipe});
interface Catalog{format:'cimiloop/agent-parent-skill-catalog/1.0.0'|'cimiloop/agent-parent-skill-catalog/2.0.0';scope_digest:string;entries:Entry[];catalog_digest:string}
interface Options{local:Local;runId:string;catalog:Catalog;candidates?:AgentParentSkillCandidatePort;beforeReservation:()=>void;beforeReply?:()=>void;now?:()=>string}
const token=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(v),id=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
function fail():never{throw new LocalProjectError('原父SDK Skill调用、固定输入或原命令不可证明','CAPABILITY_UNAVAILABLE','conflict');}
function synchronous(guard:()=>void){const value:unknown=guard();if(value!==undefined){if(value instanceof Promise)void Promise.prototype.then.call(value,undefined,()=>{});fail();}}
function syncValue<T>(value:T):T{if(value instanceof Promise){void Promise.prototype.then.call(value,undefined,()=>{});fail();}if(value!==null&&(typeof value==='object'||typeof value==='function')){let then:unknown;try{then=Reflect.get(value,'then');}catch{void Promise.resolve(value).then(undefined,()=>{});fail();}if(typeof then==='function'){void Promise.resolve(value).then(undefined,()=>{});fail();}}return value;}
function withOriginalReader<T>(reader:ParentSkillOriginalReader,read:(scoped:ParentSkillOriginalReader)=>T):T{
 let active=true;const take=<V>(read:()=>V):V=>{if(!active)fail();return structuredClone(read());};
 const scoped:ParentSkillOriginalReader=Object.freeze({getCurrentProject:()=>take(()=>reader.getCurrentProject()),getActor:id=>take(()=>reader.getActor(id)),getRun:id=>take(()=>reader.getRun(id)),getRuntimeRecord:(kind,id)=>take(()=>reader.getRuntimeRecord(kind,id)),listRuntimeRecords:(kind,changeId)=>take(()=>reader.listRuntimeRecords(kind,changeId)),getCommandReceipt:id=>take(()=>reader.getCommandReceipt(id)),getExecutionObject:(kind,id)=>take(()=>reader.getExecutionObject(kind,id)),getVerificationRecord:(kind,id)=>take(()=>reader.getVerificationRecord(kind,id))});
 try{return syncValue(read(scoped));}finally{active=false;}
}
function recipe(raw:unknown):AgentParentSkillCandidateRecipe{const value=copyToolJson(raw);if(!exact(value,['format','goal','spec','standards','required_check_ids'])||value.format!=='cimiloop/original-run-candidate/1.0.0'||![value.goal,value.spec,value.standards].every(v=>typeof v==='string'&&v.trim().length>0&&v.length<=32768)||!Array.isArray(value.required_check_ids)||!value.required_check_ids.length||value.required_check_ids.length>16||value.required_check_ids.some(v=>!token(v))||new Set(value.required_check_ids).size!==value.required_check_ids.length)fail();return value as unknown as AgentParentSkillCandidateRecipe;}
function candidate(raw:unknown,request:AgentParentSkillCandidateRequest):AgentParentSkillResolvedCandidate{const value=copyToolJson(syncValue(raw));if(!exact(value,['format','scope_digest','command_id','recipe_digest','input_ref','proof_ref','candidate_digest'])||value.format!=='cimiloop/agent-parent-skill-candidate/1.0.0'||value.scope_digest!==digest(JSON.stringify(request.scope)).value||value.command_id!==request.command_id||value.recipe_digest!==digest(JSON.stringify(request.recipe)).value)fail();compileValidator<SkillInvocation['input_ref']>(SkillMethodInputReferenceSchema)(value.input_ref);const proof=value.proof_ref;if(!exact(proof,['provider','resource_type','locator','digest'])||proof.provider!=='local_content'||proof.resource_type!=='skill_invocation_proof'||!exact(proof.digest,['algorithm','value'])||proof.digest.algorithm!=='sha256'||typeof proof.digest.value!=='string'||!/^[a-f0-9]{64}$/.test(proof.digest.value)||proof.locator!==proof.digest.value)fail();const {candidate_digest,...body}=value;if(candidate_digest!==digest(JSON.stringify(body)).value)fail();return value as unknown as AgentParentSkillResolvedCandidate;}
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
 private readonly location:Local["location"];private readonly caller:Local["caller"];private readonly bornAt:string;private readonly scope:ReturnType<typeof originalAgentWorkspaceScope>;private readonly catalog:Catalog;private readonly options:Options;private readonly store:Local['store'];private readonly kernel:Local['kernel'];private readonly candidates:AgentParentSkillCandidatePort|undefined;
 private constructor(options:Options,scope:ReturnType<typeof originalAgentWorkspaceScope>,catalog:Catalog){this.options={...options,beforeReservation:options.beforeReservation,now:options.now??(()=>new Date().toISOString())};this.scope=scope;this.catalog=catalog;this.store=options.local.store;this.kernel=options.local.kernel;this.candidates=options.candidates?{resolveOriginal:options.candidates.resolveOriginal.bind(options.candidates),readOriginal:options.candidates.readOriginal.bind(options.candidates),...(options.candidates.readCurrentOriginal?{readCurrentOriginal:options.candidates.readCurrentOriginal.bind(options.candidates)}:{})}:undefined;this.location=structuredClone(options.local.location);this.caller=structuredClone(options.local.caller);const run=options.local.store.getRun(scope.run_id);if(!run)fail();this.bornAt=run.created_at;originalCommandId(scope,'validate',this.bornAt);}
 static open(options:Options){
  if(typeof options.beforeReservation!=='function'||options.beforeReply!==undefined&&typeof options.beforeReply!=='function'||options.now!==undefined&&typeof options.now!=='function')fail();
  const scope=structuredClone(originalAgentWorkspaceScope(options.local,options.runId)),raw=copyToolJson(options.catalog);
  if(!exact(raw,['format','scope_digest','entries','catalog_digest'])||!['cimiloop/agent-parent-skill-catalog/1.0.0','cimiloop/agent-parent-skill-catalog/2.0.0'].includes(String(raw.format))||raw.scope_digest!==digest(JSON.stringify(scope)).value||!Array.isArray(raw.entries)||!raw.entries.length||raw.entries.length>64)fail();
  const current=raw.format==='cimiloop/agent-parent-skill-catalog/2.0.0';if(current?typeof options.candidates?.resolveOriginal!=='function'||typeof options.candidates?.readOriginal!=='function':options.candidates!==undefined)fail();
  const keys=new Set<string>();
  for(const entry of raw.entries){if(!exact(entry,['skill_alias','method_name','input_alias','skill_binding',current?'input_recipe':'input_ref'])||![entry.skill_alias,entry.method_name,entry.input_alias].every(token)||!scope.skill_bindings.some(pin=>same(pin,entry.skill_binding)))fail();const key=[entry.skill_alias,entry.method_name,entry.input_alias].join('/');if(keys.has(key))fail();keys.add(key);if(current)recipe(entry.input_recipe);else compileValidator<SkillInvocation['input_ref']>(SkillMethodInputReferenceSchema)(entry.input_ref);}
  const body={format:raw.format,scope_digest:raw.scope_digest,entries:raw.entries};if(raw.catalog_digest!==digest(JSON.stringify(body)).value||Buffer.byteLength(JSON.stringify(raw))>65536)fail();
  return new LocalAgentParentSkillCalls(options,scope,raw as unknown as Catalog);
 }
 // Trusted composition metadata only; raw input references and bindings stay
 // outside the SDK alias projection. These getters grant no effect authority.
 get originalIdentity(){return structuredClone({scope:this.scope,location:this.location,caller:this.caller,born_at:this.bornAt});}
 get sdkCatalog(){return this.#sdkCatalogProjection();}
 #sdkCatalogProjection(){return {scope_digest:this.catalog.scope_digest,catalog_digest:this.catalog.catalog_digest,entries:this.catalog.entries.map(({skill_alias,method_name,input_alias})=>({skill_alias,method_name,input_alias}))};}
 // Historical evidence reader: never creates directories or executes a command.
 // File anchors bind original bytes; only the immutable Kernel command receipt
 // establishes that the saved intent actually reserved this exact child.
 readOriginal(raw:unknown){return this.options.local.store.transaction(reader=>this.#readOriginalCore(raw,reader,false,true));}
 // Kernel supplies its already active Writer. This core never begins/ends a
 // transaction and reads all original records from that same reader.
 #resolved(entry:Entry,frame:Record<string,unknown>&{call_id:string},command_id:string,original?:unknown,reader?:ParentSkillOriginalReader,verifyOriginal=true){
  if('input_ref'in entry){if(original!==undefined)fail();return{input_ref:entry.input_ref,input_candidate:undefined};}
  if(!this.candidates)fail();const request:AgentParentSkillCandidateRequest=structuredClone({scope:this.scope,command_id,frame,recipe:entry.input_recipe});
  if(!verifyOriginal&&original===undefined)fail();
  const value=candidate(original===undefined?syncValue(this.candidates.resolveOriginal(structuredClone(request))):original,request);
  if(!verifyOriginal)return{input_ref:value.input_ref,input_candidate:value};
  const readCandidate=(scoped?:ParentSkillOriginalReader)=>this.candidates!.readOriginal({...structuredClone(request),candidate:structuredClone(value),...(scoped?{reader:scoped}:{})});
  const read=candidate(reader?withOriginalReader(reader,readCandidate):syncValue(readCandidate()),request);if(!same(value,read))fail();
  return{input_ref:value.input_ref,input_candidate:value};
 }
 // A synchronous resolve intent is born outside the call-record directory
 // before the live resolver. Missing/partial call originals never refresh it.
 // This local birth anchor does not prove preservation after loss of all host
 // data; the production Native candidate port must also prove its Host ticket.
 private candidateBirth(frame:Record<string,unknown>&{call_id:string}){
  const command_id=originalCommandId(this.scope,frame.call_id,this.bornAt);
  return{path:assertOrdinaryPath(join(this.location.dataDirectory,'agent-parent-skill-candidate-births',this.scope.project_id,this.scope.run_id,frame.call_id+'.json')),
   value:{format:'cimiloop/agent-parent-skill-candidate-birth/1.0.0',scope_digest:this.catalog.scope_digest,catalog_digest:this.catalog.catalog_digest,call_id:frame.call_id,command_id,frame_digest:digest(JSON.stringify(frame)).value}};
 }
 private producer(){return this.catalog.format==='cimiloop/agent-parent-skill-catalog/2.0.0'?'cimiloop-parent-sdk-skill-current-candidate':'cimiloop-parent-sdk-skill';}
 #saved(entry:Entry,frame:Record<string,unknown>&{call_id:string},intent:unknown,reader?:ParentSkillOriginalReader,verifyOriginal=true){
  const current='input_recipe'in entry;if(!exact(intent,['format','frame','command',...(current?['input_candidate']:[])])||intent.format!==(current?'cimiloop/agent-parent-skill-reservation-intent/2.0.0':'cimiloop/agent-parent-skill-reservation-intent/1.0.0')||!same(intent.frame,frame))fail();
  const command=parseCommand(intent.command),command_id=originalCommandId(this.scope,frame.call_id,this.bornAt);
  // A saved current-candidate intent must never invoke its live resolver.
  if(current&&intent.input_candidate===undefined)fail();
  return{intent,command,...this.#resolved(entry,frame,command_id,current?intent.input_candidate:undefined,reader,verifyOriginal)};
 }
 readOriginalFromReader(raw:unknown,reader:ParentSkillOriginalReader,current=false){return this.#readOriginalCore(raw,reader,current,true);}
 // Fixed original file/Kernel relationship only. No live candidate resolver or
 // installed historical/current source callback runs in this preliminary read.
 // It grants no execution or qualification; Host must complete those readers.
 readOriginalReservationFromReader(raw:unknown,reader:ParentSkillOriginalReader){return this.#readOriginalCore(raw,reader,false,false);}
 #readOriginalCore(raw:unknown,reader:ParentSkillOriginalReader,current:boolean,verifyOriginal:boolean){
  const frame=copyToolJson(raw);if(!exact(frame,['format','scope_digest','catalog_digest','call_id','tool','skill_alias','method_name','input_alias'])||frame.format!=='cimiloop/agent-parent-skill-request/1.0.0'||frame.scope_digest!==this.catalog.scope_digest||frame.catalog_digest!==this.catalog.catalog_digest||frame.tool!=='run_skill'||!id(frame.call_id))fail();
  const entry=this.catalog.entries.find(e=>e.skill_alias===frame.skill_alias&&e.method_name===frame.method_name&&e.input_alias===frame.input_alias);if(!entry)fail();
  const identity=()=>{if(this.options.local.store!==this.store||this.options.local.kernel!==this.kernel||!same(this.options.local.location,this.location)||!same(this.options.local.caller,this.caller)||reader.getRun(this.scope.run_id)?.created_at!==this.bornAt||!same(originalAgentWorkspaceScope({...this.options.local,store:parentSkillOriginalMetadata(reader)},this.scope.run_id),this.scope))fail();};identity();
  const birth='input_recipe'in entry?this.candidateBirth(frame as Record<string,unknown>&{call_id:string}):undefined;if(birth&&!same(read(birth.path),birth.value))fail();
  const root=assertOrdinaryPath(join(this.location.dataDirectory,'agent-parent-skill-call-originals',this.scope.project_id,this.scope.run_id)),headerPath=join(root,'header.json'),path=join(root,frame.call_id,'request.json'),anchorPath=join(root,frame.call_id+'.anchor.json'),header={format:'cimiloop/agent-parent-skill-call-header/1.0.0',scope:this.scope,catalog:this.catalog};
  if(!same(read(headerPath),header))fail();const saved=this.#saved(entry,frame as Record<string,unknown>&{call_id:string},read(path),reader,verifyOriginal),{intent,input_ref,input_candidate}=saved;const anchor=read(anchorPath);if(!same(anchor,{format:'cimiloop/agent-parent-skill-call-anchor/1.0.0',scope_digest:this.catalog.scope_digest,call_id:frame.call_id,intent_digest:digest(JSON.stringify(intent)).value}))fail();
  const command=saved.command;if(command.command_id!==originalCommandId(this.scope,frame.call_id,this.bornAt)||command.correlation_id!==command.command_id||command.command_type!=='ReserveSkillInvocation'||command.project_id!==this.scope.project_id||command.actor_id!==this.scope.executor_actor_id||command.acting_role!=='executor'||command.target.object_type!=='run'||command.target.id!==this.scope.run_id||command.source.origin!=='agent'||command.source.producer!==this.producer()||!same(command.payload,{skill_binding_ref:entry.skill_binding.binding_ref,method_name:entry.method_name,input_ref}))fail();
  const invocation=(()=>{const receipt=reader.getCommandReceipt(command.command_id);if(!receipt||receipt.command_id!==command.command_id||receipt.request_digest!==commandDigest(command)||!('ok'in receipt.result)||receipt.result.ok!==true||!('command_type'in receipt.result)||receipt.result.command_type!=='ReserveSkillInvocation')fail();const value=receipt.result.data.invocation;if(!same(reader.getRuntimeRecord('skill_invocation',value.id),value))fail();return value;})();
  if(invocation.run_ref.id!==this.scope.run_id||invocation.run_operation_key!==this.scope.operation_key||invocation.executor_ref.id!==this.scope.executor_actor_id||!same(invocation.skill_binding,entry.skill_binding)||!same(invocation.input_ref,input_ref)||invocation.request.method_name!==entry.method_name)fail();
  let current_input:AgentParentCurrentInput|undefined;
  if(current){
   if(!('input_recipe'in entry)||!input_candidate||!this.candidates?.readCurrentOriginal)fail();
   const request:AgentParentSkillCandidateRequest=structuredClone({scope:this.scope,command_id:command.command_id,frame:{...frame,call_id:String(frame.call_id)},recipe:entry.input_recipe});
   current_input=parseAgentParentCurrentInput(withOriginalReader(reader,scoped=>this.candidates!.readCurrentOriginal!({...request,candidate:structuredClone(input_candidate),reader:scoped})),parseAgentParentSkillIpcRequest(frame,this.#sdkCatalogProjection()));
   if(current_input.command_id!==command.command_id||current_input.candidate_digest!==input_candidate.candidate_digest||!same(current_input.input_ref,input_candidate.input_ref)||!same(current_input.proof_ref,input_candidate.proof_ref))fail();
   // Current-source verification is the last installed callback. Its result
   // cannot replace an original reservation or change its immutable input.
   const receipt=reader.getCommandReceipt(command.command_id);
   if(!receipt||receipt.request_digest!==commandDigest(command)||!('ok'in receipt.result)||receipt.result.ok!==true||!('command_type'in receipt.result)||receipt.result.command_type!=='ReserveSkillInvocation'||!same(receipt.result.data.invocation,invocation)||!same(reader.getRuntimeRecord('skill_invocation',invocation.id),invocation))fail();
  }
  identity();if(!same(read(headerPath),header)||!same(read(path),intent)||!same(read(anchorPath),anchor)||birth&&!same(read(birth.path),birth.value))fail();identity();return structuredClone({frame:frame as Record<string,unknown>&{call_id:string},command,invocation,...(input_candidate?{input_candidate}:{}),...(current_input?{current_input}:{})});
 }
 // Independent current applicability; no reservation, resolve or new effects.
 readCurrentOriginal(raw:unknown){return this.store.transaction(reader=>this.#readCurrentOriginal(raw,reader));}
 readCurrentOriginalFromReader(raw:unknown,reader:ParentSkillOriginalReader){return this.#readCurrentOriginal(raw,reader);}
 #readCurrentOriginal(raw:unknown,reader:ParentSkillOriginalReader){const original=this.#readOriginalCore(raw,reader,true,true);if(!original.current_input)fail();return{...original,current_input:original.current_input};}
 reserve(raw:unknown,signal?:AbortSignal):{invocation:SkillInvocation;replay:boolean}{
  signal?.throwIfAborted();const frame=copyToolJson(raw);if(!exact(frame,['format','scope_digest','catalog_digest','call_id','tool','skill_alias','method_name','input_alias'])||frame.format!=='cimiloop/agent-parent-skill-request/1.0.0'||frame.scope_digest!==this.catalog.scope_digest||frame.catalog_digest!==this.catalog.catalog_digest||frame.tool!=='run_skill'||!id(frame.call_id))fail();
  const entry=this.catalog.entries.find(e=>e.skill_alias===frame.skill_alias&&e.method_name===frame.method_name&&e.input_alias===frame.input_alias);if(!entry)fail();
  const identity=()=>{if(this.options.local.store!==this.store||this.options.local.kernel!==this.kernel||!same(this.options.local.location,this.location)||!same(this.options.local.caller,this.caller)||this.options.local.store.getRun(this.scope.run_id)?.created_at!==this.bornAt||!same(originalAgentWorkspaceScope(this.options.local,this.scope.run_id),this.scope))fail();};const guard=()=>{signal?.throwIfAborted();identity();synchronous(this.options.beforeReservation);signal?.throwIfAborted();identity();};guard();
  const birth='input_recipe'in entry?this.candidateBirth(frame as Record<string,unknown>&{call_id:string}):undefined;const originalCallPath=join(this.location.dataDirectory,'agent-parent-skill-call-originals',this.scope.project_id,this.scope.run_id,frame.call_id);if(birth&&existsSync(birth.path)&&!existsSync(originalCallPath))fail();
  const root=directory(join(this.location.dataDirectory,'agent-parent-skill-call-originals',this.scope.project_id,this.scope.run_id)),header={format:'cimiloop/agent-parent-skill-call-header/1.0.0',scope:this.scope,catalog:this.catalog},headerPath=join(root,'header.json');saveOnce(headerPath,header);if(!same(read(headerPath),header))fail();
  const callRoot=assertOrdinaryPath(join(root,frame.call_id)),path=join(callRoot,'request.json'),anchorPath=join(root,frame.call_id+'.anchor.json');let fresh=false;
  try{mkdirSync(callRoot);fresh=true;}catch(error){if(!error||typeof error!=='object'||!('code'in error)||error.code!=='EEXIST')throw error;}
  directory(callRoot);
  if(fresh){
   if(existsSync(anchorPath))fail();
   const run=this.options.local.store.getRun(this.scope.run_id);if(!run)fail();const commandId=originalCommandId(this.scope,frame.call_id,this.bornAt);if('input_recipe'in entry&&this.store.transaction(tx=>!!tx.getCommandReceipt(commandId)))fail();if(birth){directory(dirname(birth.path));if(!saveOnce(birth.path,birth.value))fail();}const resolved=this.#resolved(entry,frame as Record<string,unknown>&{call_id:string},commandId),{input_ref,input_candidate}=resolved;guard();const command=parseCommand({schema_version:SCHEMA_VERSION,command_id:commandId,correlation_id:commandId,requested_at:this.options.now!(),source:{origin:'agent',producer:this.producer()},project_id:this.scope.project_id,actor_id:this.scope.executor_actor_id,acting_role:'executor',command_type:'ReserveSkillInvocation',target:{object_type:'run',id:this.scope.run_id},expected_revision:run.revision,payload:{skill_binding_ref:entry.skill_binding.binding_ref,method_name:entry.method_name,input_ref}});
   const intent={format:input_candidate?'cimiloop/agent-parent-skill-reservation-intent/2.0.0':'cimiloop/agent-parent-skill-reservation-intent/1.0.0',frame,...(input_candidate?{input_candidate}:{}),command},anchor={format:'cimiloop/agent-parent-skill-call-anchor/1.0.0',scope_digest:this.catalog.scope_digest,call_id:frame.call_id,intent_digest:digest(JSON.stringify(intent)).value};
   if(!saveOnce(anchorPath,anchor)||!saveOnce(path,intent))fail();
  }
  const saved=this.#saved(entry,frame as Record<string,unknown>&{call_id:string},read(path)),{intent,input_ref}=saved;
  const anchor=read(anchorPath);if(!same(anchor,{format:'cimiloop/agent-parent-skill-call-anchor/1.0.0',scope_digest:this.catalog.scope_digest,call_id:frame.call_id,intent_digest:digest(JSON.stringify(intent)).value}))fail();
  const command:AnyCommand=saved.command;if(command.command_id!==originalCommandId(this.scope,frame.call_id,this.bornAt)||command.correlation_id!==command.command_id||command.command_type!=='ReserveSkillInvocation'||command.project_id!==this.scope.project_id||command.actor_id!==this.scope.executor_actor_id||command.acting_role!=='executor'||command.target.id!==this.scope.run_id||command.source.origin!=='agent'||command.source.producer!==this.producer()||!same(command.payload,{skill_binding_ref:entry.skill_binding.binding_ref,method_name:entry.method_name,input_ref}))fail();
  const originals=()=>{identity();if(!same(read(headerPath),header)||!same(read(path),intent)||!same(read(anchorPath),anchor)||birth&&!same(read(birth.path),birth.value))fail();};const replay=this.options.local.store.transaction(tx=>!!tx.getCommandReceipt(command.command_id));guard();originals();
  const result=this.options.local.kernel.execute(command);if(!('ok'in result)||result.ok!==true||!('command_type'in result)||result.command_type!=='ReserveSkillInvocation')fail();
  const invocation=result.data.invocation;if(invocation.run_ref.id!==this.scope.run_id||invocation.run_operation_key!==this.scope.operation_key||invocation.executor_ref.id!==this.scope.executor_actor_id||!same(invocation.skill_binding,entry.skill_binding)||!same(invocation.input_ref,input_ref)||invocation.request.method_name!==entry.method_name)fail();
  originals();signal?.throwIfAborted();if(this.options.beforeReply)synchronous(this.options.beforeReply);signal?.throwIfAborted();originals();return{invocation:structuredClone(invocation),replay};
 }
}

// Capture once in the owner after class initialization. Importers invoke these
// declarations only after module initialization; no replaceable lookup at open.
const fixedOriginalCalls=Object.freeze({reservation:LocalAgentParentSkillCalls.prototype.readOriginalReservationFromReader,history:LocalAgentParentSkillCalls.prototype.readOriginalFromReader,current:LocalAgentParentSkillCalls.prototype.readCurrentOriginalFromReader,identity:Object.getOwnPropertyDescriptor(LocalAgentParentSkillCalls.prototype,'originalIdentity')!.get!,catalog:Object.getOwnPropertyDescriptor(LocalAgentParentSkillCalls.prototype,'sdkCatalog')!.get!});
export function fixedOriginalReservation(this:LocalAgentParentSkillCalls,...args:Parameters<LocalAgentParentSkillCalls['readOriginalReservationFromReader']>):ReturnType<LocalAgentParentSkillCalls['readOriginalReservationFromReader']>{return fixedOriginalCalls.reservation.apply(this,args);}
export function fixedCallsHistory(this:LocalAgentParentSkillCalls,...args:Parameters<LocalAgentParentSkillCalls['readOriginalFromReader']>):ReturnType<LocalAgentParentSkillCalls['readOriginalFromReader']>{return fixedOriginalCalls.history.apply(this,args);}
export function fixedCallsCurrent(this:LocalAgentParentSkillCalls,...args:Parameters<LocalAgentParentSkillCalls['readCurrentOriginalFromReader']>):ReturnType<LocalAgentParentSkillCalls['readCurrentOriginalFromReader']>{return fixedOriginalCalls.current.apply(this,args);}
export function fixedCallsIdentity(this:LocalAgentParentSkillCalls):LocalAgentParentSkillCalls['originalIdentity']{return fixedOriginalCalls.identity.call(this);}
export function fixedCallsCatalog(this:LocalAgentParentSkillCalls):LocalAgentParentSkillCalls['sdkCatalog']{return fixedOriginalCalls.catalog.call(this);}
