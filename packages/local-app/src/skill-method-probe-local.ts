import {isDeepStrictEqual as same} from 'node:util';import {join} from 'node:path';
import {compileValidator,InternalIdSchema,SkillMethodInputSchema,SkillMethodInputReferenceSchema,ProviderDescriptorSchema,ProviderBindingSchema,NamedSkillMethodEvidenceSchema,type SkillMethodInput,type NamedSkillMethodEvidence,type NamedSkillMethodEvidenceReference} from '@cimiloop/protocol/v2';
import {requestDigest} from '@cimiloop/kernel';
import {AgentStartLedger,parseGatewayJson,parseAgentWorkspaceToolScope,queryAgentRuntimeOperation,collectAgentRuntimeOperation,requestAgentRuntimeCancellation,recoverAgentRuntimeOperation,digest,type AgentWorkspaceToolScope} from '@cimiloop/runtime-adapter';
import type {LocalProject} from './project.js';import {LocalProjectError} from './errors.js';
import {LocalSkillMethodInputs,type LocalSkillMethodPlan} from './skill-methods-local.js';
import {LocalNativeNamedMethodSamples} from './native-named-method-samples-local.js';
import {openInstalledCodexAgentRuntime} from './agent-codex-installation-local.js';
import {openSkillMethodProbeExecution} from './skill-method-probe-native-local.js';

const namespace='skill_method_probe_request',captureNamespace='skill_method_probe_capture',cancelNamespace='skill_method_probe_cancellation';
function fail():never{throw new LocalProjectError('原隔离 Skill 请求、Human 权限或固定输入不可核对；保留原身份，不重新派发','CAPABILITY_UNAVAILABLE','conflict');}
const hash=(value:unknown)=>({algorithm:'sha256' as const,value:requestDigest(value)});
const equal=(a:unknown,b:unknown)=>requestDigest(a)===requestDigest(b);
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const id=compileValidator<string>(InternalIdSchema);
export interface SkillMethodProbeRequest {request_id:string;descriptor_id:string;runtime_binding_id:string;method_name:string;input_ref:Parameters<LocalSkillMethodInputs['read']>[2]['input_ref'];max_elapsed_ms:number}
type Authority=Extract<ReturnType<LocalProject['kernel']['authorizeNamedSkillProbe']>,{ok:true}>;
export type SkillMethodProbeOriginal=Omit<Authority,'ok'>&{format:'cimiloop/isolated-skill-method-request/1.0.0';request:SkillMethodProbeRequest;started_at:string;installation_digest:string;scope:AgentWorkspaceToolScope;plan_digest:string};
export interface SkillMethodProbeExecutionLease {
 installation_digest:string;guard():void;release():void|Promise<void>;
 prepare(input:{original:SkillMethodProbeOriginal;plan:LocalSkillMethodPlan},beforeEffect:()=>void):Promise<{launch():Promise<void>;dispose():void|Promise<void>}>;
}
type OriginLease=Pick<NonNullable<Awaited<ReturnType<typeof openInstalledCodexAgentRuntime>>>,'origin'|'installation_digest'|'guard'|'release'>;
interface Services {openOrigin?:(local:LocalProject)=>Promise<OriginLease|undefined>;execution?:(local:LocalProject)=>Promise<SkillMethodProbeExecutionLease>;beforeEffect?:()=>void}
function request(raw:unknown):SkillMethodProbeRequest {
 if(!exact(raw,['request_id','descriptor_id','runtime_binding_id','method_name','input_ref','max_elapsed_ms'])||typeof raw.method_name!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(raw.method_name)||!Number.isSafeInteger(raw.max_elapsed_ms)||Number(raw.max_elapsed_ms)<1000||Number(raw.max_elapsed_ms)>600000)fail();
 const ref=compileValidator<SkillMethodProbeRequest['input_ref']>(SkillMethodInputReferenceSchema)(structuredClone(raw.input_ref));
 return{request_id:id(raw.request_id),descriptor_id:id(raw.descriptor_id),runtime_binding_id:id(raw.runtime_binding_id),method_name:raw.method_name,input_ref:{provider:ref.provider,resource_type:ref.resource_type,locator:ref.locator,digest:{algorithm:ref.digest.algorithm,value:ref.digest.value}},max_elapsed_ms:Number(raw.max_elapsed_ms)};
}
function sync(action:()=>void){const result:unknown=action();if(result!==undefined){void Promise.resolve(result).catch(()=>{});fail();}}

// The scope's run_id/task clock fields are transport identities equal to the
// technical request id. No business Actor, Plan, Task, Context or Run is created.
// Only Kernel authorizes the current Human request; receipts do not qualify it.
export class LocalHumanSkillMethodProbe {
 readonly #identity;readonly #ownerMethod;readonly #startMethod;readonly #services;readonly #inputs;readonly #requestGuard;
 constructor(private readonly local:LocalProject,services:Services={}){
  this.#identity={store:local.store,kernel:local.kernel,location:structuredClone(local.location),instance:structuredClone(local.instance)};
  this.#ownerMethod=local.kernel.authorizeProviderProbeControl;this.#startMethod=local.kernel.authorizeNamedSkillProbe;
  this.#services={openOrigin:services.openOrigin??openInstalledCodexAgentRuntime,execution:services.execution??openSkillMethodProbeExecution};this.#requestGuard=services.beforeEffect??(()=>{});this.#inputs=new LocalSkillMethodInputs(local.location.repositoryPath,local.location.dataDirectory);
 }
 private identity(){const o=this.#identity,l=this.local;sync(this.#requestGuard);if(l.store!==o.store||l.kernel!==o.kernel||!same(l.location,o.location)||!same(l.instance,o.instance)||l.kernel.authorizeProviderProbeControl!==this.#ownerMethod||l.kernel.authorizeNamedSkillProbe!==this.#startMethod)fail();}
 private owner(){this.identity();const p=this.#ownerMethod.call(this.local.kernel);this.identity();if('code'in p)throw p;if(p.project_id!==this.local.instance.project_id||p.actor_id!==this.local.instance.actor_id)fail();return p;}
 private authority(q:SkillMethodProbeRequest,purpose:string){this.identity();const p=this.#startMethod.call(this.local.kernel,q.descriptor_id,q.runtime_binding_id,purpose);this.identity();if('code'in p)throw p;return p;}
 private async withOrigin<T>(read:(origin:OriginLease,guard:()=>void)=>Promise<T>):Promise<T>{
  const human=this.owner(),lease=await this.#services.openOrigin(this.local);let result:T;
  if(!lease){this.owner();fail();}const origin=lease!.origin,method=lease!.guard,installation=lease!.installation_digest;
  const guard=()=>{if(!equal(this.owner(),human)||lease!.origin!==origin||lease!.guard!==method||lease!.installation_digest!==installation||!(origin instanceof AgentStartLedger))fail();sync(()=>Reflect.apply(method,lease!,[]));if(!equal(this.owner(),human)||lease!.origin!==origin||lease!.guard!==method||lease!.installation_digest!==installation)fail();};
  try{guard();result=await read(lease!,guard);guard();}finally{await lease!.release();if(!equal(this.owner(),human))fail();}return result;
 }
 private hostBody(o:Pick<SkillMethodProbeOriginal,'request'|'descriptor'|'runtime_binding'|'actor_id'|'project_id'>){return{format:'cimiloop/isolated-skill-method-host/1.0.0',scope_kind:'isolated_provider_probe',project_id:o.project_id,actor_id:o.actor_id,request:o.request,descriptor_digest:hash(o.descriptor),runtime_binding:{binding_ref:{object_type:'provider_binding',id:o.runtime_binding.id},digest:hash(o.runtime_binding)},business_execution_approved:false};}
 private capacityId(requestId:string){return requestDigest({format:'cimiloop/isolated-skill-method-history/1.0.0',project_id:this.local.instance.project_id,request_id:requestId});}
 private historyPolicy(origin:OriginLease,create=false){const binding={format:'cimiloop/isolated-skill-method-history/1.0.0',project_id:this.local.instance.project_id},key=requestDigest(binding),basis={format:'cimiloop/host-capacity-policy/1.0.0',binding,limits:{requests:64}},row=origin.origin.readExclusive('capacity_policy',key);if(row){if(!equal(row.basis,basis))fail();return row.ticket;}return create?origin.origin.issueExclusive('capacity_policy',key,basis):undefined;}
 private read(origin:OriginLease,requestId:string):SkillMethodProbeOriginal|undefined{
  const row=origin.origin.readExclusive(namespace,requestDigest(id(requestId))),policy=this.historyPolicy(origin),hold=policy&&origin.origin.readCapacity(policy).reservations.find(value=>value.id===this.capacityId(requestId));if(!hold){if(row)fail();return undefined;}if(row&&!equal(row.basis,hold.basis))fail();
  const raw=structuredClone(parseGatewayJson(JSON.stringify(hold.basis),65536));
  if(!exact(raw,['format','project_id','actor_id','assignment_id','assignment_revision','descriptor','runtime_binding','runtime_descriptor','request','started_at','installation_digest','scope','plan_digest'])||raw.format!=='cimiloop/isolated-skill-method-request/1.0.0')fail();
  const o=raw as unknown as SkillMethodProbeOriginal,q=request(o.request);id(o.actor_id);id(o.assignment_id);
  compileValidator(ProviderDescriptorSchema)(o.descriptor);compileValidator(ProviderDescriptorSchema)(o.runtime_descriptor);compileValidator(ProviderBindingSchema)(o.runtime_binding);const scope=parseAgentWorkspaceToolScope(o.scope),body=this.hostBody(o);
  if(q.request_id!==requestId||o.project_id!==this.local.instance.project_id||o.descriptor.id!==q.descriptor_id||o.runtime_binding.id!==q.runtime_binding_id||o.runtime_descriptor.id!==o.runtime_binding.descriptor_ref.id||o.installation_digest!==origin.installation_digest||
   !/^[a-f0-9]{64}$/.test(o.plan_digest)||!Number.isFinite(Date.parse(o.started_at))||!equal(scope,{project_id:o.project_id,run_id:q.request_id,operation_key:q.request_id,executor_actor_id:o.actor_id,context_digest:hash(body),runtime_binding:body.runtime_binding,skill_bindings:[],host_admission_ref:scope.host_admission_ref})||
   !equal(JSON.parse(this.#inputs.packages.content.readContent(scope.host_admission_ref).toString('utf8')),body))fail();return o;
 }
 private plan(o:SkillMethodProbeOriginal){const project=this.local.store.getProject();if(!project)fail();const plan=this.#inputs.read(project!,o.descriptor,{invocation_key:o.request.request_id,method_name:o.request.method_name,input_ref:o.request.input_ref});if(requestDigest(plan)!==o.plan_digest)fail();return plan;}
 private cancellation(origin:OriginLease,o:SkillMethodProbeOriginal){const row=origin.origin.readExclusive(cancelNamespace,requestDigest(o.request.request_id));if(!row)return false;if(!equal(row.basis,{format:'cimiloop/isolated-skill-method-cancel/1.0.0',request_id:o.request.request_id,scope_digest:hash(o.scope)}))fail();return true;}
 private async observe(o:SkillMethodProbeOriginal,action:'query'|'collect'|'cancel'|'recover',guard:()=>void){
  guard();let operation:unknown,outcome:'observed'|'unknown'='observed';try{const root=join(this.local.location.dataDirectory,'skill-method-probe-originals',o.project_id,o.request.request_id);operation=action==='query'?await queryAgentRuntimeOperation(root,o.scope):action==='collect'?await collectAgentRuntimeOperation(root,o.scope,undefined,{profile:this.plan(o).profile,files:this.plan(o).files}):action==='cancel'?requestAgentRuntimeCancellation(root,o.scope,guard):await recoverAgentRuntimeOperation(root,o.scope,guard);if(operation&&typeof operation==='object'&&('status'in operation&&operation.status==='Unknown'||'outcome'in operation&&operation.outcome==='unknown'))outcome='unknown';}catch{outcome='unknown';operation={reason:'isolated_skill_original_unavailable'};}guard();
  return{ok:true as const,request_id:o.request.request_id,operation_key:o.scope.operation_key,outcome,operation,run_created:false as const,completion_proven:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};
 }
 async start(raw:unknown){const q=request(raw);return this.withOrigin(async(origin,guard)=>{
  const prior=this.read(origin,q.request_id);if(prior){if(!equal(prior.request,q)||prior.actor_id!==this.local.instance.actor_id)fail();return this.observe(prior,'query',guard);}
  const project=this.local.store.getProject(),descriptor=this.local.store.getProviderDescriptor(q.descriptor_id);if(!project||!descriptor)fail();
  const plan=this.#inputs.read(project!,descriptor!,{invocation_key:q.request_id,method_name:q.method_name,input_ref:q.input_ref}),permission=this.authority(q,plan.request.input.purpose);
  const existingPolicy=this.historyPolicy(origin);if(existingPolicy&&origin.origin.readCapacity(existingPolicy).remaining.requests!<1)throw new LocalProjectError('隔离方法原历史容量64项已满；保留原请求和 Unknown，不自动清理或另建政策','CAPABILITY_UNAVAILABLE','conflict');
  const lease=await this.#services.execution(this.local);let staged:Awaited<ReturnType<SkillMethodProbeExecutionLease['prepare']>>|undefined;
  const method=lease?.guard,prepare=lease?.prepare;
  const current=()=>{guard();if(!lease||lease.guard!==method||lease.prepare!==prepare||lease.installation_digest!==origin.installation_digest||!equal(this.authority(q,plan.request.input.purpose),permission)||!equal(plan,this.#inputs.read(this.local.store.getProject()!,permission.descriptor,{invocation_key:q.request_id,method_name:q.method_name,input_ref:q.input_ref})))fail();sync(()=>Reflect.apply(method,lease,[]));guard();};
  try{
   current();const {ok:_,...authority}=permission,host=this.hostBody({...authority,request:q}),hostRef=this.#inputs.packages.content.storeContent(Buffer.from(JSON.stringify(host)),'agent_host_admission');
   const original:SkillMethodProbeOriginal={format:'cimiloop/isolated-skill-method-request/1.0.0',...authority,request:q,started_at:new Date().toISOString(),installation_digest:origin.installation_digest,scope:parseAgentWorkspaceToolScope({project_id:project!.id,run_id:q.request_id,operation_key:q.request_id,executor_actor_id:permission.actor_id,context_digest:hash(host),runtime_binding:host.runtime_binding,skill_bindings:[],host_admission_ref:hostRef}),plan_digest:requestDigest(plan)};
   current();let created=false;try{created=origin.origin.reserveCapacity(this.historyPolicy(origin,true)!,this.capacityId(q.request_id),{requests:1},original).created;}catch(error){const other=this.read(origin,q.request_id);if(!other||!equal(other.request,q)||other.actor_id!==permission.actor_id)throw error;return this.observe(other,'query',guard);}
   if(!created){const other=this.read(origin,q.request_id);if(!other||!equal(other.request,q))fail();return this.observe(other!,'query',guard);}
   // The atomic capacity insertion is the original dispatcher election. The
   // secondary index is optional for reads after a crash, never a new election.
   origin.origin.issueExclusive(namespace,requestDigest(q.request_id),original);
   const effect=()=>{current();if(!equal(this.read(origin,q.request_id),original)||this.cancellation(origin,original))fail();};
   try{staged=await Reflect.apply(prepare,lease,[{original,plan},effect]);effect();if(!staged||typeof staged.launch!=='function'||typeof staged.dispose!=='function')fail();await staged.launch();effect();}catch{guard();}
   return this.observe(original,'query',guard);
  }finally{try{await staged?.dispose();}finally{await lease.release();guard();}}
 });}
 async startFromInput(raw:Omit<SkillMethodProbeRequest,'input_ref'>&{input:SkillMethodInput}){
  this.owner();const {input,...q}=raw,parsed=compileValidator<SkillMethodInput>(SkillMethodInputSchema)(structuredClone(input)),bytes=Buffer.from(JSON.stringify(parsed));if(bytes.length>384*1024)fail();
  const input_ref=this.#inputs.packages.content.storeContent(bytes,'skill_method_input');this.owner();return this.start({...q,input_ref});
 }
 private control(requestId:string,action:'query'|'collect'|'cancel'|'recover'){return this.withOrigin(async(origin,guard)=>{
  const o=this.read(origin,id(requestId));if(!o)fail();guard();
  if(action==='cancel')origin.origin.issueExclusive(cancelNamespace,requestDigest(o.request.request_id),{format:'cimiloop/isolated-skill-method-cancel/1.0.0',request_id:o.request.request_id,scope_digest:hash(o.scope)});
  if(action==='recover'&&!this.cancellation(origin,o))fail();const result=await this.observe(o,action,guard);return{...result,cancellation_requested:this.cancellation(origin,o)};
 });}
 query(requestId:string){return this.control(requestId,'query');}collect(requestId:string){return this.control(requestId,'collect');}cancel(requestId:string){return this.control(requestId,'cancel');}recover(requestId:string){return this.control(requestId,'recover');}
 list(){return this.withOrigin(async(origin,guard)=>{const policy=this.historyPolicy(origin),rows=policy?origin.origin.readCapacity(policy).reservations:[];if(!policy&&origin.origin.listExclusive(namespace).length)fail();const requests=rows.map(row=>{const requestId=(row.basis as SkillMethodProbeOriginal).request.request_id,o=this.read(origin,requestId);if(!o)fail();return{request_id:requestId,descriptor_id:o!.descriptor.id,descriptor_name:o!.descriptor.name,method_name:o!.request.method_name,started_at:o!.started_at};});guard();return{ok:true as const,requests,run_created:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};});}
 async capture(requestIds:string[]){
  if(!Array.isArray(requestIds)||requestIds.length<1||requestIds.length>4||new Set(requestIds).size!==requestIds.length)fail();const ids=requestIds.map(value=>id(value)).sort();
  return this.withOrigin(async(origin,guard)=>{
   const records=ids.map(value=>this.read(origin,value));if(records.some(value=>!value))fail();const originals=records as SkillMethodProbeOriginal[],first=originals[0]!,project=this.local.store.getProject();if(!project)fail();
   if(originals.some(o=>!equal(o.descriptor,first.descriptor)||!equal(o.scope.runtime_binding,first.scope.runtime_binding)||o.request.method_name!==first.request.method_name))fail();
   const captureKey=requestDigest({project_id:project!.id,ids}),prior=origin.origin.readExclusive(captureNamespace,captureKey),retained=prior?.basis as {evidence_ref?:NamedSkillMethodEvidenceReference}|undefined;
   const saved=retained?.evidence_ref?compileValidator<NamedSkillMethodEvidence>(NamedSkillMethodEvidenceSchema)(JSON.parse(this.#inputs.packages.content.readContent(retained.evidence_ref).toString('utf8'))):undefined;
   const native=new LocalNativeNamedMethodSamples(this.local.location.repositoryPath,this.local.location.dataDirectory),samples=originals.map(o=>{guard();this.plan(o);return native.captureProbe(project!,o.descriptor,{invocation_key:o.request.request_id,method_name:o.request.method_name,input_ref:o.request.input_ref},o.scope);});guard();
   const evidence=compileValidator<NamedSkillMethodEvidence>(NamedSkillMethodEvidenceSchema)({format:'cimiloop/named-skill-method-evidence/1.0.0',project_id:project!.id,descriptor_ref:{object_type:'provider_descriptor',id:first.descriptor.id},descriptor_digest:hash(first.descriptor),runtime_binding:first.scope.runtime_binding,method_name:first.request.method_name,purpose:this.plan(first).request.input.purpose,observed_at:saved?.observed_at??new Date().toISOString(),samples});
   if(saved&&!equal(saved,evidence))fail();const evidence_ref=this.#inputs.packages.content.storeContent(Buffer.from(JSON.stringify(evidence)),'named_skill_method_evidence'),raw_result_ref={...evidence_ref,resource_type:'provider_probe_snapshot' as const},basis={format:'cimiloop/isolated-skill-method-capture/1.0.0',request_ids:ids,evidence_ref,raw_result_ref};
   origin.origin.issueExclusive(captureNamespace,captureKey,basis);guard();return{ok:true as const,request_ids:ids,evidence_ref,raw_result_ref,run_created:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};
  });
 }
}
