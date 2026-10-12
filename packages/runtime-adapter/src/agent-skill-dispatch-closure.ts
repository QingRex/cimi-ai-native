import {lstatSync} from 'node:fs';import {resolve} from 'node:path';import {isDeepStrictEqual as same} from 'node:util';
import {compileValidator,InternalIdSchema} from '@cimiloop/protocol/v2';import {AgentStartLedger,type AgentStartTicket} from './agent-start-ledger.js';
import {parseAgentWorkspaceToolScope} from './agent-workspace-authority.js';import {assertOrdinaryPath,bytesAt,digest,RuntimeAdapterError} from './files.js';import {parseGatewayJson} from './gateway-conversation.js';import type {DedicatedAgentSkillScope} from './agent-skill-account-scope.js';
function fail():never{throw new RuntimeAdapterError('agent_skill_dispatch_closure_unproven');}
const exact=(value:unknown,keys:string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export function skillDispatchAnchorIdentity(path:string){const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!s.isFile()||s.nlink!==1n||s.ino<=0n)fail();return digest(JSON.stringify({path:resolve(path),device:String(s.dev),inode:String(s.ino),created_ns:String(s.birthtimeNs)})).value;}
export interface OriginalSkillDispatchClosure {format:'cimiloop/original-skill-dispatch-closure/1.0.0';relation:DedicatedAgentSkillScope;dispatch_ticket:AgentStartTicket;anchor:{path:string;identity:string;digest:ReturnType<typeof digest>};dispatch_closed:true;zero_effects_proven:false;domain_observation_produced:false;starts_run:false}
// Immutable prospective dispatch barrier only. This reader does not infer
// Native absence, zero model fees, Skill eligibility or a domain NotStarted.
export function readOriginalSkillDispatchClosure(origin:AgentStartLedger,raw:DedicatedAgentSkillScope):OriginalSkillDispatchClosure|undefined {
 try{
  if(!(origin instanceof AgentStartLedger)||!exact(raw,['parent','child','invocation_id','admission_ticket']))fail();
  const relation:DedicatedAgentSkillScope={parent:parseAgentWorkspaceToolScope(raw.parent),child:parseAgentWorkspaceToolScope(raw.child),invocation_id:compileValidator<string>(InternalIdSchema)(raw.invocation_id),admission_ticket:structuredClone(raw.admission_ticket)};
  if(relation.parent.operation_key===relation.child.operation_key||!same({...relation.child,operation_key:relation.parent.operation_key,context_digest:relation.parent.context_digest},relation.parent))fail();
  const id=digest(JSON.stringify({invocation_key:relation.child.operation_key,project_id:relation.parent.project_id})).value,birth=origin.readTicket(relation.admission_ticket) as {format?:unknown;namespace?:unknown;id?:unknown;basis?:{format?:unknown;parent?:unknown;preparation?:{request?:{invocation_key?:unknown}}}};
  if(!exact(birth,['format','namespace','id','basis'])||birth.format!=='cimiloop/host-exclusive-ticket/1.0.0'||birth.namespace!=='skill_invocation_admission'||birth.id!==id||birth.basis?.format!=='cimiloop/skill-invocation-start-basis/1.0.0'||!same(birth.basis.parent,relation.parent)||birth.basis.preparation?.request?.invocation_key!==relation.child.operation_key)fail();
  const row=origin.readExclusive('skill_invocation_dispatch',id);if(!row)return undefined;
  const basis=row.basis as Record<string,unknown>;if(basis?.format!=='cimiloop/skill-invocation-dispatch-block/1.0.0')return undefined;
  if(!exact(basis,['format','ticket','scope','reason','anchor_path','anchor_identity'])||basis.reason!=='kernel_cancelled_before_dispatch'||!same(basis.ticket,relation.admission_ticket)||!same(basis.scope,relation.child)||typeof basis.anchor_path!=='string'||typeof basis.anchor_identity!=='string'||!/^[a-f0-9]{64}$/.test(basis.anchor_identity)||resolve(basis.anchor_path)!==basis.anchor_path||origin.readExclusive('skill_invocation_returned',id))fail();
  const path=assertOrdinaryPath(basis.anchor_path),bytes=bytesAt(path,65536),marker=structuredClone(parseGatewayJson(new TextDecoder('utf8',{fatal:true}).decode(bytes),65536));
  const expected={format:basis.format,ticket:relation.admission_ticket,scope:relation.child,reason:basis.reason};
  if(!same(marker,expected)||skillDispatchAnchorIdentity(path)!==basis.anchor_identity)fail();
  if(!same(origin.readTicket(relation.admission_ticket),birth)||!same(origin.readExclusive('skill_invocation_dispatch',id),row)||origin.readExclusive('skill_invocation_returned',id)||skillDispatchAnchorIdentity(path)!==basis.anchor_identity||!bytesAt(path,65536).equals(bytes))fail();
  return {format:'cimiloop/original-skill-dispatch-closure/1.0.0',relation,dispatch_ticket:structuredClone(row.ticket),anchor:{path,identity:basis.anchor_identity,digest:digest(bytes)},dispatch_closed:true,zero_effects_proven:false,domain_observation_produced:false,starts_run:false};
 }catch{return fail();}
}
