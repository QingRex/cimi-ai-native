import { lstatSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { compileValidator, SkillInvocationPreparationSchema, SkillMethodQualificationReferenceSchema, InternalIdSchema, type Project, type AgentRunRecord, type AgentContextManifest, type ProviderBinding, type SkillInvocation, type SkillInvocationPreparation } from '@cimiloop/protocol/v2';
import { requestDigest } from '@cimiloop/kernel';
import { AgentStartLedger, parseDedicatedAgentSkillAccountScope, parseAgentWorkspaceToolScope, assertOrdinaryPath, bytesAt, parseGatewayJson, type AgentStartTicket, type AgentWorkspaceToolScope, type DedicatedAgentSkillScope } from '@cimiloop/runtime-adapter';
import { LocalEvidenceVerifier } from './evidence-local.js';
const fail=():never=>{throw Error('Original Skill start custody unavailable');};
const sha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const equal=(a:unknown,b:unknown)=>isDeepStrictEqual(a,b);
const read=(path:string)=>structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytesAt(path,65536)),65536));
function save(path:string,body:unknown) {
 assertOrdinaryPath(path);const bytes=Buffer.from(JSON.stringify(body));if(bytes.length>65536)fail();const fd=openSync(path,'wx');try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
}
function identity(path:string) { assertOrdinaryPath(path);const value=lstatSync(path,{bigint:true});if(!value.isFile()||value.ino<=0n)fail();return requestDigest({path:resolve(path),device:String(value.dev),inode:String(value.ino),created_ns:String(value.birthtimeNs)}); }
interface Admission {
 format:'cimiloop/skill-invocation-start-admission/1.0.0'; original_method_qualification_ref:SkillInvocation['method_qualification_ref'];
 ticket:AgentStartTicket; admission_anchor_identity:string;
}

const custodyPaths=(dataDirectory:string,projectId:string,key:string)=>{compileValidator<string>(InternalIdSchema)(projectId);compileValidator<string>(InternalIdSchema)(key);const root=join(dataDirectory,'skill-invocation-start-originals',projectId,key);assertOrdinaryPath(root);return{root,admission:join(root,'admission.json'),dispatch:join(root,'dispatch.json'),id:requestDigest({project_id:projectId,invocation_key:key})};};
const custodyBasis=(parent:AgentWorkspaceToolScope,record_id:string,context_id:string,skill_binding:SkillInvocation['skill_binding'],input_ref:SkillInvocation['input_ref'],preparation:SkillInvocationPreparation)=>({format:'cimiloop/skill-invocation-start-basis/1.0.0',parent,record_id,context_id,skill_binding,input_ref,preparation});
const readAdmission=(content:LocalEvidenceVerifier,invocation:SkillInvocation)=>{const raw=structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(content.readContent(invocation.method_qualification_ref)),65536)) as Admission;if(!raw||Object.keys(raw).sort().join(',')!=='admission_anchor_identity,format,original_method_qualification_ref,ticket'||raw.format!=='cimiloop/skill-invocation-start-admission/1.0.0'||!sha(raw.admission_anchor_identity))fail();return raw;};
// Read-only reuse of the same original birth/basis and independent file anchor.
export function readOriginalSkillStartAdmission(repositoryPath:string,dataDirectory:string,project:Project,invocation:SkillInvocation,parent:AgentWorkspaceToolScope,recordId:string,stored:unknown) {
  const content=new LocalEvidenceVerifier(repositoryPath,dataDirectory);
  if(project.id!==invocation.project_id||resolve(project.repository_path)!==resolve(repositoryPath))fail();
  const raw=structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(content.readContent(invocation.method_qualification_ref)),65536)) as Admission;
  if(!raw||Object.keys(raw).sort().join(',')!=='admission_anchor_identity,format,original_method_qualification_ref,ticket'||raw.format!=='cimiloop/skill-invocation-start-admission/1.0.0'||!sha(raw.admission_anchor_identity))fail();
  const original=structuredClone(compileValidator<SkillInvocation['method_qualification_ref']>(SkillMethodQualificationReferenceSchema)(raw.original_method_qualification_ref));content.readContent(original);
  const path=custodyPaths(dataDirectory,project.id,invocation.invocation_key);
  if(identity(path.admission)!==raw.admission_anchor_identity||!equal(read(path.admission),{format:'cimiloop/skill-invocation-admission-anchor/1.0.0',ticket:raw.ticket}))fail();
  const prepared={request:invocation.request,package_ref:invocation.package_ref,input_schema_ref:invocation.input_schema_ref,output_schema_ref:invocation.output_schema_ref,method_qualification_ref:original};
  const expected=custodyBasis(parent,recordId,invocation.context_ref.id,invocation.skill_binding,invocation.input_ref,prepared);
  // Match the original parent RunRecord supplied by the shared snapshot.
  const receipt=stored as {format:string;namespace:string;id:string;basis:Record<string,unknown>};
  if(!receipt||receipt.format!=='cimiloop/host-exclusive-ticket/1.0.0'||receipt.namespace!=='skill_invocation_admission'||receipt.id!==path.id||!receipt.basis||typeof receipt.basis.record_id!=='string')fail();
  if(!equal(receipt.basis,expected))fail();
  return {path,ticket:structuredClone(raw.ticket),original};
 }

const ns='skill_invocation_dispatch',returned='skill_invocation_returned';
// Explicit prospective composition at original preparation only. An old
// reserved invocation is never upgraded/wrapped on start or on a new machine.
// This wrapper pins an original Host ticket and independently retained anchor;
// it adds no method/model qualification and changes no user DB/wire schema.
export class LocalSkillInvocationStartCustody {
 private readonly content:LocalEvidenceVerifier;
 constructor(private readonly repositoryPath:string,private readonly dataDirectory:string,private readonly ledger:AgentStartLedger) {
  if(!(ledger instanceof AgentStartLedger))fail();this.content=new LocalEvidenceVerifier(repositoryPath,dataDirectory);
 }
 private paths(projectId:string,key:string) {
  compileValidator<string>(InternalIdSchema)(projectId);compileValidator<string>(InternalIdSchema)(key);
  const root=join(this.dataDirectory,'skill-invocation-start-originals',projectId,key);assertOrdinaryPath(root);
  return {root,admission:join(root,'admission.json'),dispatch:join(root,'dispatch.json'),id:requestDigest({project_id:projectId,invocation_key:key})};
 }
 private basis(scope:AgentWorkspaceToolScope,recordId:string,contextId:string,skill:SkillInvocation['skill_binding'],inputRef:SkillInvocation['input_ref'],prepared:SkillInvocationPreparation) {
  return {format:'cimiloop/skill-invocation-start-basis/1.0.0',parent:scope,record_id:recordId,context_id:contextId,skill_binding:skill,input_ref:inputRef,preparation:prepared};
 }
 bindPreparation(project:Project,record:AgentRunRecord,context:AgentContextManifest,binding:ProviderBinding,input:{invocation_key:string;method_name:string;input_ref:SkillInvocation['input_ref']},raw:SkillInvocationPreparation):SkillInvocationPreparation {
  const prepared=structuredClone(compileValidator<SkillInvocationPreparation>(SkillInvocationPreparationSchema)(raw)),selected=context.skill_bindings.find(pin=>pin.binding_ref.id===binding.id);
  if(resolve(project.repository_path)!==resolve(this.repositoryPath)||record.project_id!==project.id||context.project_id!==project.id||record.context_ref.id!==context.id||!selected||
   prepared.request.invocation_key!==input.invocation_key||prepared.request.method_name!==input.method_name)fail();
  this.content.readContent(prepared.method_qualification_ref);
  const parent=parseAgentWorkspaceToolScope({project_id:project.id,run_id:record.run_id,operation_key:record.operation_key,executor_actor_id:record.executor_ref.id,context_digest:record.input_digest,
   runtime_binding:record.runtime_binding,skill_bindings:record.skill_bindings,host_admission_ref:record.host_admission_ref});
  const path=this.paths(project.id,input.invocation_key),basis=this.basis(parent,record.id,context.id,selected!,input.input_ref,prepared),ticket=this.ledger.issueExclusive('skill_invocation_admission',path.id,basis);
  const anchor={format:'cimiloop/skill-invocation-admission-anchor/1.0.0',ticket};
  // No automatic repair of partial/missing admission after any failure. Only
  // this original preparer creates the directory before Kernel reservation.
  if(existsSync(path.root)) {if(!equal(read(path.admission),anchor))fail();}
  else {mkdirSync(path.root,{recursive:true});save(path.admission,anchor);}
  const admission:Admission={format:'cimiloop/skill-invocation-start-admission/1.0.0',original_method_qualification_ref:prepared.method_qualification_ref,ticket,admission_anchor_identity:identity(path.admission)};
  const reference=this.content.storeContent(Buffer.from(JSON.stringify(admission)),'skill_method_qualification');
  return {...prepared,method_qualification_ref:reference};
 }
 private original(project:Project,invocation:SkillInvocation,parent:AgentWorkspaceToolScope,recordId:string) {
  const raw=readAdmission(this.content,invocation);return readOriginalSkillStartAdmission(this.repositoryPath,this.dataDirectory,project,invocation,parent,recordId,this.ledger.readTicket(raw.ticket));
 }
 accountScope(project:Project,invocation:SkillInvocation,parent:AgentWorkspaceToolScope,recordId:string):DedicatedAgentSkillScope {
  const original=this.original(project,invocation,parent,recordId);
  return {parent:structuredClone(parent),child:parseDedicatedAgentSkillAccountScope({...parent,operation_key:invocation.invocation_key,context_digest:invocation.input_digest}),invocation_id:invocation.id,admission_ticket:original.ticket};
 }
 originalQualification(project:Project,invocation:SkillInvocation,parent:AgentWorkspaceToolScope,recordId:string) {return structuredClone(this.original(project,invocation,parent,recordId).original);}
 inspect(project:Project,invocation:SkillInvocation,parent:AgentWorkspaceToolScope,recordId:string) {
  const original=this.original(project,invocation,parent,recordId),claimed=this.ledger.readExclusive(ns,original.path.id),receipt=this.ledger.readExclusive(returned,original.path.id),present=existsSync(original.path.dispatch);
  if(!claimed&&!receipt&&!present)return {state:'unclaimed' as const,ticket:original.ticket};
  let marker:unknown;try {marker=present?read(original.path.dispatch):undefined;} catch {return {state:'unknown' as const,ticket:original.ticket};}
  if(!marker||typeof marker!=='object'||!('material_digest' in marker)||!sha(marker.material_digest)||!equal(marker,{format:'cimiloop/skill-invocation-dispatch-anchor/1.0.0',ticket:original.ticket,material_digest:marker.material_digest}))return {state:'unknown' as const,ticket:original.ticket};
  if(!claimed||!equal(claimed.basis,marker))return {state:'unknown' as const,ticket:original.ticket};
  if(receipt&&!equal(receipt.basis,{dispatch_ticket:claimed.ticket,admission_ticket:original.ticket}))return {state:'unknown' as const,ticket:original.ticket};
  return {state:receipt?'returned' as const:'unknown' as const,ticket:claimed.ticket,material_digest:marker.material_digest};
 }
 claim(project:Project,invocation:SkillInvocation,parent:AgentWorkspaceToolScope,recordId:string,material:string,beforeEffect:()=>void) {
  if(!sha(material))fail();const original=this.original(project,invocation,parent,recordId),prior=this.inspect(project,invocation,parent,recordId);
  if(prior.state!=='unclaimed')return {created:false,ticket:prior.ticket};
  const marker={format:'cimiloop/skill-invocation-dispatch-anchor/1.0.0',ticket:original.ticket,material_digest:material};beforeEffect();
  try {save(original.path.dispatch,marker);} catch(error) {if(error&&typeof error==='object'&&'code' in error&&error.code==='EEXIST')return {created:false,ticket:this.inspect(project,invocation,parent,recordId).ticket};throw error;}
  // Crashing between the independent file and SQLite writer leaves Unknown.
  // Nothing repairs either half, and no duplicate caller dispatches it again.
  beforeEffect();const claim=this.ledger.claimExclusiveOnce(ns,original.path.id,marker);
  return {created:claim.created,ticket:claim.ticket};
 }
 markReturned(project:Project,invocation:SkillInvocation,parent:AgentWorkspaceToolScope,recordId:string) {
  const original=this.original(project,invocation,parent,recordId),state=this.inspect(project,invocation,parent,recordId);
  if(state.state==='unclaimed'||!('material_digest' in state))fail();
  this.ledger.issueExclusive(returned,original.path.id,{dispatch_ticket:state.ticket,admission_ticket:original.ticket});
 }
}
