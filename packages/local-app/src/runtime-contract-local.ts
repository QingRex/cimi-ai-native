import {isDeepStrictEqual as same} from 'node:util';import {join} from 'node:path';
import {compileValidator,InternalIdSchema,ProviderDescriptorSchema,createInternalId,type ProviderDescriptor} from '@cimiloop/protocol/v2';
import {requestDigest} from '@cimiloop/kernel';
import {AgentStartLedger,CodexAgentUsageBudget,readCodexAgentRunUsage,parseAgentWorkspaceToolScope,readRuntimeContractPhase,requestAgentRuntimeCancellation,recoverAgentRuntimeOperation,bytesAt,digest,parseRuntimeProbe,type AgentWorkspaceToolScope,type RuntimeContractMode,type RuntimeContractPhaseResult} from '@cimiloop/runtime-adapter';
import type {LocalProject} from './project.js';import {LocalProjectError} from './errors.js';import {LocalEvidenceVerifier} from './evidence-local.js';
import {openInstalledCodexAgentRuntime} from './agent-codex-installation-local.js';import {openRuntimeContractExecution} from './runtime-contract-native-local.js';
import {LocalProviderVerifier} from './providers-local.js';import type {RuntimeSdkContractMarker} from './codex-runtime-sdk-originals-local.js';
import {openInstalledCodexUsageBudget,type InstalledCodexUsageBudget} from './agent-codex-usage-budget-local.js';

const namespace='runtime_contract_request',phaseNamespace='runtime_contract_phase',cancelNamespace='runtime_contract_cancel';
const id=compileValidator<string>(InternalIdSchema),hash=(value:unknown)=>({algorithm:'sha256' as const,value:requestDigest(value)});
function fail():never{throw new LocalProjectError('原 Runtime 契约请求、固定材料或当前 Human 权限不可核对；保留原身份','CAPABILITY_UNAVAILABLE','conflict');}
const exact=(raw:unknown,keys:string[]):raw is Record<string,unknown>=>!!raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).sort().join(',')===[...keys].sort().join(',');
function sync(fn:()=>void){const value:unknown=fn();if(value!==undefined){if(value instanceof Promise)void Promise.prototype.then.call(value,undefined,()=>{});fail();}}
export interface RuntimeContractRequest{request_id:string;descriptor_id:string;max_elapsed_ms:number}
type Permission=Extract<ReturnType<LocalProject['kernel']['authorizeRuntimeContractProbe']>,{ok:true}>;
export interface RuntimeContractPhase{mode:RuntimeContractMode;scope:AgentWorkspaceToolScope}
export interface RuntimeContractOriginal{format:'cimiloop/runtime-contract-original/1.0.0';request:RuntimeContractRequest;authority:Permission;started_at:string;installation_digest:string;phases:RuntimeContractPhase[]}
type OriginLease=Pick<NonNullable<Awaited<ReturnType<typeof openInstalledCodexAgentRuntime>>>,'origin'|'guard'|'release'|'installation_digest'>;
export interface RuntimeContractExecutionLease{installation_digest:string;guard():void;release():void|Promise<void>;execute(original:RuntimeContractOriginal,phase:RuntimeContractPhase,beforeEffect:()=>void):Promise<void>}
interface Services{openOrigin?:(local:LocalProject)=>Promise<OriginLease|undefined>;openUsageBudget?:(local:LocalProject)=>Promise<InstalledCodexUsageBudget|undefined>;execution?:(local:LocalProject)=>Promise<RuntimeContractExecutionLease>;readPhase?:(root:string,scope:AgentWorkspaceToolScope,origin:AgentStartLedger,mode:RuntimeContractMode)=>RuntimeContractPhaseResult;beforeEffect?:()=>void}
export const runtimeContractPhaseRoot=(local:Pick<LocalProject,'location'>,phase:RuntimeContractPhase)=>join(local.location.dataDirectory,'rt-contract',phase.scope.operation_key);
export const runtimeContractRequestRoot=(local:Pick<LocalProject,'location'>,original:RuntimeContractOriginal)=>join(local.location.dataDirectory,'rt-contract',original.request.request_id);
function request(raw:unknown):RuntimeContractRequest{if(!exact(raw,['request_id','descriptor_id','max_elapsed_ms'])||!Number.isSafeInteger(raw.max_elapsed_ms)||Number(raw.max_elapsed_ms)<1000||Number(raw.max_elapsed_ms)>600000)fail();return{request_id:id(raw.request_id),descriptor_id:id(raw.descriptor_id),max_elapsed_ms:Number(raw.max_elapsed_ms)};}

// First Runtime contract needs no approved Runtime or Skill. Technical UUIDs
// occupy transport Run fields only; no domain Run/Actor/Context is created.
// runtime_binding is a descriptor transport pin here, never a saved Binding or
// an execution grant. Business Kernel requests cannot resolve this carrier.
export class LocalHumanRuntimeContract{
 private readonly identity;private readonly ownerMethod;private readonly permissionMethod;private readonly services;private readonly content;
 constructor(private readonly local:LocalProject,services:Services={}){this.identity={store:local.store,kernel:local.kernel,instance:structuredClone(local.instance),location:structuredClone(local.location)};this.ownerMethod=local.kernel.authorizeProviderProbeControl;this.permissionMethod=local.kernel.authorizeRuntimeContractProbe;this.services={openOrigin:services.openOrigin??openInstalledCodexAgentRuntime,openUsageBudget:services.openUsageBudget??openInstalledCodexUsageBudget,execution:services.execution??openRuntimeContractExecution,readPhase:services.readPhase??readRuntimeContractPhase,beforeEffect:services.beforeEffect??(()=>{})};this.content=new LocalEvidenceVerifier(local.location.repositoryPath,local.location.dataDirectory);}
 private current(){sync(this.services.beforeEffect);const o=this.identity,l=this.local;if(l.store!==o.store||l.kernel!==o.kernel||!same(l.instance,o.instance)||!same(l.location,o.location)||l.kernel.authorizeProviderProbeControl!==this.ownerMethod||l.kernel.authorizeRuntimeContractProbe!==this.permissionMethod)fail();}
 private owner(){this.current();const value=this.ownerMethod.call(this.local.kernel);this.current();if('code'in value)throw value;return value;}
 private permission(q:RuntimeContractRequest){this.current();const value=this.permissionMethod.call(this.local.kernel,q.descriptor_id);this.current();if('code'in value)throw value;return value;}
 private async withOrigin<T>(action:(lease:OriginLease,guard:()=>void)=>Promise<T>){const human=this.owner(),lease=await this.services.openOrigin(this.local);if(!lease)fail();const origin=lease.origin,guardMethod=lease.guard,installation=lease.installation_digest;
  const guard=()=>{if(!same(this.owner(),human)||lease.origin!==origin||lease.guard!==guardMethod||lease.installation_digest!==installation||!(origin instanceof AgentStartLedger))fail();sync(()=>guardMethod.call(lease));this.current();};
  try{guard();const result=await action(lease,guard);guard();return result;}finally{await lease.release();if(!same(this.owner(),human))fail();}
 }
 private policy(lease:OriginLease,create=false){const binding={format:'cimiloop/runtime-contract-history/1.0.0',project_id:this.local.instance.project_id},key=requestDigest(binding),basis={format:'cimiloop/host-capacity-policy/1.0.0',binding,limits:{requests:64}},row=lease.origin.readExclusive('capacity_policy',key);if(row){if(!same(row.basis,basis))fail();return row.ticket;}return create?lease.origin.issueExclusive('capacity_policy',key,basis):undefined;}
 private read(lease:OriginLease,requestId:string){const policy=this.policy(lease),key=requestDigest({project_id:this.local.instance.project_id,request_id:requestId}),hold=policy&&lease.origin.readCapacity(policy).reservations.find(row=>row.id===key);if(!hold)return undefined;
  const raw=structuredClone(hold.basis);if(!exact(raw,['format','request','authority','started_at','installation_digest','phases'])||raw.format!=='cimiloop/runtime-contract-original/1.0.0')fail();const o=raw as unknown as RuntimeContractOriginal,q=request(o.request);compileValidator<ProviderDescriptor>(ProviderDescriptorSchema)(o.authority.descriptor);
  if(q.request_id!==requestId||o.authority.project_id!==this.local.instance.project_id||o.authority.descriptor.id!==q.descriptor_id||o.authority.boundary!=='fixed_runtime_contract'||o.installation_digest!==lease.installation_digest||!Number.isFinite(Date.parse(o.started_at))||!Array.isArray(o.phases)||o.phases.length!==2||o.phases[0]?.mode!=='edit'||o.phases[1]?.mode!=='review'||new Set(o.phases.map(p=>p.scope.operation_key)).size!==2)fail();
  for(const phase of o.phases){const scope=parseAgentWorkspaceToolScope(phase.scope);if(scope.project_id!==o.authority.project_id||scope.executor_actor_id!==o.authority.actor_id||scope.run_id!==scope.operation_key||scope.runtime_binding.binding_ref.id!==o.authority.descriptor.id||!same(scope.runtime_binding.digest,hash(o.authority.descriptor))||scope.skill_bindings.length)fail();const body=JSON.parse(this.content.readContent(scope.host_admission_ref).toString('utf8'));if(!same(body,this.admission(q,o.authority,phase.mode))||!same(scope.context_digest,hash(body)))fail();}
  const index=lease.origin.readExclusive(namespace,key);if(index&&!same(index.basis,o))fail();return o;
 }
 private admission(q:RuntimeContractRequest,authority:Permission,mode:RuntimeContractMode){return{format:'cimiloop/runtime-contract-admission/1.0.0',scope:'isolated_provider_probe',request:q,authority,mode,runtime_binding_is_descriptor_transport_pin:true,business_execution_approved:false};}
 private phaseKey(o:RuntimeContractOriginal,p:RuntimeContractPhase){return requestDigest({request_id:o.request.request_id,scope:p.scope});}
 private intent(lease:OriginLease,o:RuntimeContractOriginal,p:RuntimeContractPhase){const row=lease.origin.readExclusive(phaseNamespace,this.phaseKey(o,p));if(row&&!same(row.basis,{request_digest:hash(o),scope:p.scope}))fail();return row;}
 private cancelled(lease:OriginLease,o:RuntimeContractOriginal){const row=lease.origin.readExclusive(cancelNamespace,requestDigest(o.request.request_id));if(row&&!same(row.basis,{format:'cimiloop/runtime-contract-cancel/1.0.0',request_digest:hash(o)}))fail();return!!row;}
 private readPhase(lease:OriginLease,o:RuntimeContractOriginal,p:RuntimeContractPhase,guard:()=>void){guard();if(!this.intent(lease,o,p))return{mode:p.mode,status:'not_requested' as const,effect_reverified:false,costs_reconciled:false,business_execution_approved:false};const result=this.services.readPhase(runtimeContractPhaseRoot(this.local,p),p.scope,lease.origin,p.mode);guard();return result;}
 private observe(lease:OriginLease,o:RuntimeContractOriginal,guard:()=>void){const phases=o.phases.map(p=>this.readPhase(lease,o,p,guard));guard();return{ok:true as const,request_id:o.request.request_id,phases,cancellation_requested:this.cancelled(lease,o),outcome:phases.every(p=>p.status==='Observed')?'observed' as const:'unknown' as const,run_created:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};}
 private async advance(lease:OriginLease,o:RuntimeContractOriginal,guard:()=>void){
  for(const p of o.phases){guard();if(this.cancelled(lease,o))break;if(this.intent(lease,o,p)){if(this.readPhase(lease,o,p,guard).status!=='Observed')break;continue;}
   if(!same(this.permission(o.request),o.authority))fail();const execution=await this.services.execution(this.local),method=execution.guard,execute=execution.execute;
   const current=()=>{guard();if(!same(this.permission(o.request),o.authority)||this.cancelled(lease,o)||execution.guard!==method||execution.execute!==execute||execution.installation_digest!==lease.installation_digest||!same(this.read(lease,o.request.request_id),o))fail();sync(()=>method.call(execution));guard();};
   try{current();const elected=lease.origin.claimExclusiveOnce(phaseNamespace,this.phaseKey(o,p),{request_digest:hash(o),scope:p.scope});if(!elected.created)break;try{current();await execute.call(execution,o,p,current);current();}catch{guard();}if(this.readPhase(lease,o,p,guard).status!=='Observed')break;}finally{await execution.release();guard();}
  }
  return this.observe(lease,o,guard);
 }
 start(raw:unknown){const q=request(raw);return this.withOrigin(async(lease,guard)=>{const previous=this.read(lease,q.request_id);if(previous){if(!same(previous.request,q)||previous.authority.actor_id!==this.local.instance.actor_id)fail();return this.observe(lease,previous,guard);}
  const authority=this.permission(q),phases:RuntimeContractPhase[]=(['edit','review'] as const).map(mode=>{const body=this.admission(q,authority,mode),ref=this.content.storeContent(Buffer.from(JSON.stringify(body)),'agent_host_admission'),operation=createInternalId();return{mode,scope:parseAgentWorkspaceToolScope({project_id:authority.project_id,run_id:operation,operation_key:operation,executor_actor_id:authority.actor_id,context_digest:hash(body),runtime_binding:{binding_ref:{object_type:'provider_binding',id:authority.descriptor.id},digest:hash(authority.descriptor)},skill_bindings:[],host_admission_ref:ref})};});
  const o:RuntimeContractOriginal={format:'cimiloop/runtime-contract-original/1.0.0',request:q,authority,started_at:new Date().toISOString(),installation_digest:lease.installation_digest,phases};guard();if(!same(this.permission(q),authority))fail();const key=requestDigest({project_id:authority.project_id,request_id:q.request_id});let hold;
  try{hold=lease.origin.reserveCapacity(this.policy(lease,true)!,key,{requests:1},o);}catch(error){const elected=this.read(lease,q.request_id);if(!elected||!same(elected.request,q)||elected.authority.actor_id!==authority.actor_id)throw error;return this.observe(lease,elected,guard);}
  if(!hold.created){const old=this.read(lease,q.request_id);if(!old||!same(old.request,q))fail();return this.observe(lease,old,guard);}lease.origin.issueExclusive(namespace,key,o);return this.advance(lease,o,guard);
 });}
 query(requestId:string){return this.withOrigin(async(lease,guard)=>{const o=this.read(lease,id(requestId));if(!o)fail();return this.observe(lease,o,guard);});}
 // Query the two original technical scopes through the installed account.
 // Missing/corrupt model originals stay unavailable; a held reservation is
 // neither an invoice nor permission to release capacity or dispatch again.
 usage(requestId:string){return this.withOrigin(async(lease,guard)=>{
  const o=this.read(lease,id(requestId));if(!o)fail();const account=await this.services.openUsageBudget(this.local);
  try{
   guard();if(!account||account.installation.installation_digest!==o.installation_digest||!(account.budget instanceof CodexAgentUsageBudget))fail();
   const budget=account.budget,installation=account.installation,method=account.guard;
   const current=()=>{guard();if(account.budget!==budget||account.installation!==installation||account.guard!==method||installation.installation_digest!==o.installation_digest)fail();sync(()=>method.call(account));guard();};
   current();const before=budget.snapshot();
   const read=()=>o.phases.map(p=>{const requested=!!this.intent(lease,o,p);let usage:ReturnType<typeof readCodexAgentRunUsage>|null=null;
    try{usage=readCodexAgentRunUsage(runtimeContractPhaseRoot(this.local,p),p.scope,budget);}catch{/* Unavailable original usage remains Unknown. */}
    if(usage&&!requested)fail();return{mode:p.mode,operation_key:p.scope.operation_key,requested,usage};
   });
   const phases=read();current();if(!same(before,budget.snapshot())||!same(phases,read())||!same(before,budget.snapshot())||!same(o,this.read(lease,o.request.request_id)))fail();
   return{ok:true as const,request_id:o.request.request_id,policy_digest:before.policy_digest,capacity:{scope:'installed_account' as const,limits:before.limits,held:before.held,remaining:before.remaining},phases,usage_complete:phases.every(p=>p.usage?.usage_complete===true),cost_known:false as const,cash_charged_micros:null,credit_charged_micro_units:null,costs_reconciled:false as const,provider_qualification_proven:false as const,starts_model:false as const,run_created:false as const};
  }finally{try{await account?.release();}finally{guard();}}
 });}
 continue(requestId:string){return this.withOrigin(async(lease,guard)=>{const o=this.read(lease,id(requestId));if(!o)fail();return this.advance(lease,o,guard);});}
 private control(requestId:string,action:'cancel'|'recover'){return this.withOrigin(async(lease,guard)=>{const o=this.read(lease,id(requestId));if(!o)fail();if(action==='cancel')lease.origin.issueExclusive(cancelNamespace,requestDigest(o.request.request_id),{format:'cimiloop/runtime-contract-cancel/1.0.0',request_digest:hash(o)});if(!this.cancelled(lease,o))fail();
  const operations=[];for(const p of o.phases){guard();if(!this.intent(lease,o,p))continue;try{operations.push(action==='cancel'?requestAgentRuntimeCancellation(runtimeContractPhaseRoot(this.local,p),p.scope):await recoverAgentRuntimeOperation(runtimeContractPhaseRoot(this.local,p),p.scope));}catch{operations.push({outcome:'unknown'});}guard();}return{...this.observe(lease,o,guard),operations};});}
 cancel(requestId:string){return this.control(requestId,'cancel');}recover(requestId:string){return this.control(requestId,'recover');}
 list(){return this.withOrigin(async(lease,guard)=>{const policy=this.policy(lease),rows=policy?lease.origin.readCapacity(policy).reservations:[];const requests=rows.map(row=>{const raw=row.basis as RuntimeContractOriginal,o=this.read(lease,raw.request.request_id);if(!o)fail();return{request_id:o.request.request_id,descriptor_id:o.request.descriptor_id,started_at:o.started_at};});guard();return{ok:true as const,requests,run_created:false as const,provider_qualification_proven:false as const};});}
 capture(requestId:string){return this.withOrigin(async(lease,guard)=>{
  const o=this.read(lease,id(requestId)),project=this.local.store.getProject();if(!o||!project)fail();const proofs=o.phases.map(p=>this.readPhase(lease,o,p,guard));if(proofs.some(p=>p.status!=='Observed'||!p.effect_reverified||!('basis_digest'in p)||!p.basis_digest))fail();
  const root=runtimeContractRequestRoot(this.local,o),file=join(root,'probe-result.json'),boundaryBytes=bytesAt(file,1024*1024),boundary=lease.origin.readExclusive('runtime_contract_boundary_result',requestDigest({request:o.request,installation:o.installation_digest}));if(!boundary||!same(boundary.basis,{request_digest:requestDigest(o),probe_digest:digest(boundaryBytes).value}))fail();
  const key=requestDigest(o.request.request_id),previous=lease.origin.readExclusive('runtime_contract_capture',key),verifier=new LocalProviderVerifier(this.local.location.repositoryPath,this.local.location.dataDirectory),body=previous?.basis as {raw_result_ref?:Parameters<typeof verifier.readProbe>[1]}|undefined;
  const old=body?.raw_result_ref?parseRuntimeProbe(verifier.readProbe(project,body.raw_result_ref)):undefined,baseRef=verifier.importProbe(file,root),probe=parseRuntimeProbe(verifier.readProbe(project,baseRef));if(probe.model_operations.length)fail();
  const marker:RuntimeSdkContractMarker={format:'cimiloop/runtime-sdk-contract-marker/1.0.0',project_id:project.id,request_id:o.request.request_id,descriptor_digest:hash(o.authority.descriptor),installation_digest:o.installation_digest,original_digest:requestDigest(o),boundary_digest:digest(boundaryBytes).value,phases:o.phases.map((p,i)=>({...p,basis_digest:(proofs[i] as RuntimeContractPhaseResult).basis_digest!}))};
  const ref=this.content.storeContent(Buffer.from(JSON.stringify(marker)),'provider_probe_artifact'),model=(proofs[0] as RuntimeContractPhaseResult).model_account?.model;if(!model)fail();probe.evidence_refs.push({...ref,version:'runtime-sdk-contract/1.0.0'});probe.provider.model='codex/'+model;probe.observed_at=old?.observed_at??new Date().toISOString();probe.contract_probe_passed=true;probe.gaps=['runtime_network_controls_pending','runtime_billing_pending','runtime_disk_controls_pending','runtime_recovery_controls_pending'];
  const raw_result_ref=this.content.storeContent(Buffer.from(JSON.stringify(parseRuntimeProbe(probe))),'provider_probe_snapshot'),captured={format:'cimiloop/runtime-contract-capture/1.0.0',request_id:o.request.request_id,raw_result_ref};
  if(old&&!same(old,probe))fail();guard();if(o.phases.some((p,i)=>!same(this.readPhase(lease,o,p,guard),proofs[i]))||!boundaryBytes.equals(bytesAt(file,1024*1024)))fail();lease.origin.issueExclusive('runtime_contract_capture',key,captured);guard();return{ok:true as const,...captured,run_created:false as const,provider_qualification_proven:false as const,costs_reconciled:false as const};
 });}
}
