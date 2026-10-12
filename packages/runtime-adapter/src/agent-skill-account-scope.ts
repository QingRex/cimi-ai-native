import {readdirSync,lstatSync,openSync,writeFileSync,fsyncSync,closeSync} from 'node:fs';
import {join} from 'node:path';import {isDeepStrictEqual} from 'node:util';
import {compileValidator,InternalIdSchema} from '@cimiloop/protocol/v2';
import {AgentStartLedger,type AgentStartTicket} from './agent-start-ledger.js';
import {parseAgentWorkspaceToolScope,type AgentWorkspaceToolScope} from './agent-workspace-authority.js';
import {assertOrdinaryPath,bytesAt,digest,RuntimeAdapterError} from './files.js';
import {parseGatewayJson} from './gateway-conversation.js';
// Internal trusted composition relation, never an approval or a wire schema.
export interface DedicatedAgentSkillScope {parent:AgentWorkspaceToolScope;child:AgentWorkspaceToolScope;invocation_id:string;admission_ticket:AgentStartTicket}
const namespace='dedicated_account_skill_scope',intentNamespace='dedicated_account_skill_scope_intent',format='cimiloop/dedicated-account-skill-scope/1.0.0';
const same=isDeepStrictEqual,copy=<T>(x:T):T=>structuredClone(x);
const fail=(reason='agent_account_skill_scope_original_missing'):never=>{throw new RuntimeAdapterError(reason);};
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;
// Stable encoding is prospective for new child scopes; legacy parent/hold bytes stay unchanged.
export function parseDedicatedAgentSkillAccountScope(raw:unknown):AgentWorkspaceToolScope {return parseAgentWorkspaceToolScope(canonical(parseAgentWorkspaceToolScope(raw)));}
const scopeDigest=(scope:AgentWorkspaceToolScope)=>digest(JSON.stringify(canonical(scope))).value;
const read=(path:string)=>structuredClone(parseGatewayJson(new TextDecoder('utf-8',{fatal:true}).decode(bytesAt(path,65536)),65536));
const identity=(path:string)=>{const stat=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!stat.isFile()||stat.nlink!==1n||stat.ino<=0n)fail();return digest(JSON.stringify({device:String(stat.dev),inode:String(stat.ino),created_ns:String(stat.birthtimeNs)})).value;};
export class DedicatedAgentSkillScopeRegistry {
 private cut=false;
 private records:ReturnType<AgentStartLedger['readExclusiveNamespaces']>|undefined;
 private relations:DedicatedAgentSkillScope[]|undefined;
 beginCut(){if(this.cut)fail();this.cut=true;this.refreshCut();}
 refreshCut(){this.records=undefined;this.relations=undefined;}
 endCut(){this.refreshCut();this.cut=false;}
 private view(){if(this.cut&&this.records)return copy(this.records);const rows=this.origin.readExclusiveNamespaces([namespace,intentNamespace,'skill_invocation_admission','skill_invocation_dispatch']);if(this.cut)this.records=copy(rows);return rows;}
 constructor(private readonly root:string,private readonly origin:AgentStartLedger,private readonly accountDigest:string,private readonly accountTicket:AgentStartTicket){}
 private id(relation:DedicatedAgentSkillScope){return digest(JSON.stringify({account_digest:this.accountDigest,scope_digest:scopeDigest(relation.child)})).value;}
 private path(id:string){return assertOrdinaryPath(join(this.root,'skill-scope-'+id+'.json'));}
 private intentPath(id:string){return assertOrdinaryPath(join(this.root,'skill-scope-intent-'+id+'.json'));}
 private marker(relation:DedicatedAgentSkillScope){return{format,account_digest:this.accountDigest,account_ticket:this.accountTicket,relation};}
 validate(raw:DedicatedAgentSkillScope):DedicatedAgentSkillScope {
  try{
   if(!raw||Object.keys(raw).sort().join(',')!=='admission_ticket,child,invocation_id,parent')fail();
   const relation:DedicatedAgentSkillScope={parent:parseAgentWorkspaceToolScope(raw.parent),child:parseDedicatedAgentSkillAccountScope(raw.child),invocation_id:compileValidator<string>(InternalIdSchema)(raw.invocation_id),admission_ticket:copy(raw.admission_ticket)};
   const {parent,child}=relation;
   if(parent.operation_key===child.operation_key||!same({...child,operation_key:parent.operation_key,context_digest:parent.context_digest},parent))fail();
   const row=this.view().find(r=>r.namespace==='skill_invocation_admission'&&same(r.ticket,relation.admission_ticket));if(!row)return fail();
   const birth={format:'cimiloop/host-exclusive-ticket/1.0.0',...row,basis:row.basis as {format:string;parent:unknown;preparation:{request:{invocation_key:string}}}};
   const birthId=digest(JSON.stringify(canonical({project_id:parent.project_id,invocation_key:child.operation_key}))).value;
   if(birth.format!=='cimiloop/host-exclusive-ticket/1.0.0'||birth.namespace!=='skill_invocation_admission'||birth.id!==birthId||birth.basis.format!=='cimiloop/skill-invocation-start-basis/1.0.0'||!same(birth.basis.parent,parent)||birth.basis.preparation.request.invocation_key!==child.operation_key)fail();
   return relation;
  }catch{return fail();}
 }
 audit():DedicatedAgentSkillScope[] {
  if(this.cut&&this.relations)return copy(this.relations);
  try{
   const originals=this.view(),rows=originals.filter(row=>row.namespace===namespace&&(row.basis as {account_digest?:unknown})?.account_digest===this.accountDigest);
   const names=readdirSync(assertOrdinaryPath(this.root)).filter(name=>name.startsWith('skill-scope-')),intents=originals.filter(row=>row.namespace===intentNamespace&&(row.basis as {account_digest?:unknown})?.account_digest===this.accountDigest);
   if(rows.length*2!==names.length||rows.length!==intents.length||rows.length>1023)fail();
   const result=rows.map(row=>{
    const body=row.basis as {format:string;account_digest:string;account_ticket:AgentStartTicket;relation:DedicatedAgentSkillScope;anchor_identity:string};
    if(!body||Object.keys(body).sort().join(',')!=='account_digest,account_ticket,anchor_identity,format,relation')fail();
    const relation=this.validate(body.relation),id=this.id(relation),path=this.path(id),marker=this.marker(relation),intent=intents.find(r=>r.id===id),intentPath=this.intentPath(id);
    if(!intent||!same(intent.basis,{...marker,anchor_identity:identity(intentPath)})||!same(read(intentPath),marker))fail();
    if(row.id!==id||!same({...body,anchor_identity:undefined},{...marker,anchor_identity:undefined})||identity(path)!==body.anchor_identity||!same(read(path),marker))fail();
    return relation;
   });
   for(const r of result){if(result.filter(other=>same(other.parent,r.parent)).length>64||result.some(other=>other!==r&&(other.invocation_id===r.invocation_id||other.child.operation_key===r.child.operation_key)))fail();}
   if(this.cut)this.relations=copy(result);return copy(result);
  }catch{return fail();}
 }
 register(raw:DedicatedAgentSkillScope,beforeEffect:()=>void){
  const relation=this.validate(raw),all=this.audit(),prior=all.find(r=>scopeDigest(r.child)===scopeDigest(relation.child));
  if(prior){if(!same(prior,relation))fail();return copy(prior);}
  if(all.some(r=>r.invocation_id===relation.invocation_id||r.child.operation_key===relation.child.operation_key||r.parent.run_id===relation.parent.run_id&&!same(r.parent,relation.parent)))fail();
  if(all.filter(r=>same(r.parent,relation.parent)).length>=64)fail('agent_account_skill_scope_capacity_exhausted');
  const id=this.id(relation),path=this.path(id),marker=this.marker(relation),bytes=Buffer.from(JSON.stringify(marker));if(bytes.length>65536)fail();
  const save=(target:string)=>{beforeEffect();this.refreshCut();const fd=openSync(target,'wx');try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);this.refreshCut();}};
  const intentPath=this.intentPath(id);save(intentPath);beforeEffect();this.origin.issueExclusive(intentNamespace,id,{...marker,anchor_identity:identity(intentPath)});
  save(path);
  // File FIRST; partial creation or failure before Host commit stays Unknown.
  // The account writer lock elects one registrant. Ordinary open never repairs.
  beforeEffect();this.origin.issueExclusive(namespace,id,{...marker,anchor_identity:identity(path)});this.refreshCut();this.audit();return copy(relation);
 }
 // Conservative prospective effect denial even when the physical closure
 // anchor has subsequently vanished. History remains readable, not repaired.
 assertOpen(scope:AgentWorkspaceToolScope){const id=digest(JSON.stringify(canonical({project_id:scope.project_id,invocation_key:scope.operation_key}))).value;
  if(this.view().some(row=>row.namespace==='skill_invocation_dispatch'&&row.id===id&&(row.basis as {format?:unknown})?.format==='cimiloop/skill-invocation-dispatch-block/1.0.0'))fail('agent_account_skill_scope_closed');
 }
 relation(scope:AgentWorkspaceToolScope){const all=this.audit(),found=all.find(r=>same(r.child,scope));
  if(!found&&all.some(r=>r.child.operation_key===scope.operation_key))fail('agent_account_scope_conflict');if(found&&JSON.stringify(scope)!==JSON.stringify(found.child))fail('agent_account_skill_scope_encoding_changed');return found;
 }
 assertCompatible(scope:AgentWorkspaceToolScope,others:AgentWorkspaceToolScope[]){
  const all=this.audit(),relation=all.find(r=>same(r.child,scope)),parent=relation?.parent??scope;
  const family=[parent,...all.filter(r=>same(r.parent,parent)).map(r=>r.child)];
  if(all.some(r=>r.child.operation_key===scope.operation_key&&!same(r.child,scope)||r.parent.run_id===scope.run_id&&!same(r.parent,parent)))fail('agent_account_scope_conflict');
  for(const other of others){if(same(other,scope))continue;if(other.operation_key===scope.operation_key||other.run_id===scope.run_id&&!family.some(s=>same(s,other)))fail('agent_account_scope_conflict');}
 }
 isKnownChild(scope:AgentWorkspaceToolScope){return this.view().filter(row=>row.namespace==='skill_invocation_admission').some(row=>{
  const body=row.basis as {parent?:AgentWorkspaceToolScope;preparation?:{request?:{invocation_key?:string}}};
  return body?.parent?.project_id===scope.project_id&&body.preparation?.request?.invocation_key===scope.operation_key;
 });}
 registrationTicket(scope:AgentWorkspaceToolScope){const relation=this.relation(scope);if(!relation)return undefined;const stored=this.view().find(row=>row.namespace===namespace&&row.id===this.id(relation));if(!stored)return fail();return copy(stored.ticket);}
 children(parent:AgentWorkspaceToolScope){const all=this.audit();if(all.some(r=>r.parent.run_id===parent.run_id&&!same(r.parent,parent)||same(r.child,parent)))fail('agent_account_scope_conflict');return all.filter(r=>same(r.parent,parent)).map(r=>copy(r.child));}
}
