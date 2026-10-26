import {isDeepStrictEqual as same} from 'node:util';
import {AgentStartLedger,type AgentStartTicket} from './agent-start-ledger.js';
import {digest,RuntimeAdapterError} from './files.js';
import {parseAgentWorkspaceToolScope,agentWorkspaceToolAuthorityRequest,type AgentWorkspaceToolScope} from './agent-workspace-authority.js';
import {WindowsWorkspaceFileBroker,parseWorkspaceToolInvocation,parseWorkspacePreparation,parseWorkspaceCompletion,type WorkspaceToolInvocation,type PreparedWorkspaceEffect} from './workspace-files.js';
import type {WorkspaceToolReceipt} from './workspace-tool-journal.js';

const preparation='runtime_contract_file_prepared',dispatch='runtime_contract_file_dispatch',completion='runtime_contract_file_completed';
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
const hash=(value:unknown)=>digest(JSON.stringify(canonical(value))).value;
// The Native/SDK contract hashes the parser's fixed wire order. Host1 sorts
// object keys for storage, so its canonical ticket hash is a different identity.
const invocationDigest=(input:WorkspaceToolInvocation)=>digest(JSON.stringify(parseWorkspaceToolInvocation(input))).value;
function fail():never{throw new RuntimeAdapterError('runtime_contract_file_original_unproven');}
interface Options{workspace:string;tools:string;origin:AgentStartLedger;scope:AgentWorkspaceToolScope;mode:'edit'|'review';authority:()=>string}
interface Basis{scope:AgentWorkspaceToolScope;mode:'edit'|'review';workspace_scope_digest:string;authority_basis_digest:string}
interface CallBasis{input:WorkspaceToolInvocation;authority_basis_digest:string;workspace_scope_digest:string}

// A separate technical workspace, not the project's business tool journal.
// The application installs a current Kernel owner/descriptor authorization.
// Immutable Host1 reservations elect one dispatcher BEFORE native preparation;
// a missing completion is Unknown and can never elect another sender.
export class RuntimeContractFileHost{
 private readonly abort=new AbortController();private closed=false;
 private readonly pending=new Map<string,{input:WorkspaceToolInvocation;result:Promise<{receipt:WorkspaceToolReceipt;replay:boolean}>}>();
 private constructor(private readonly origin:AgentStartLedger,private readonly files:WindowsWorkspaceFileBroker,private readonly ticket:AgentStartTicket,private readonly basis:Basis,private readonly authority:()=>string){}
 static async open(raw:Options){
  if(!(raw.origin instanceof AgentStartLedger)||!['edit','review'].includes(raw.mode)||typeof raw.authority!=='function')fail();
  const {origin,authority,workspace,tools,mode}=raw,scope=parseAgentWorkspaceToolScope(raw.scope);
  const authorize=()=>{const result:unknown=authority();if(typeof result!=='string'||!/^[a-f0-9]{64}$/.test(result)){if(result instanceof Promise)void Promise.prototype.then.call(result,undefined,()=>{});fail();}return result;};
  const admitted=authorize(),files=await WindowsWorkspaceFileBroker.open(workspace,tools);if(authorize()!==admitted)fail();
  const basis:Basis={scope,mode,workspace_scope_digest:files.scopeDigest,authority_basis_digest:admitted};
  const key=hash({format:'cimiloop/runtime-contract-files/1.0.0',scope});
  const ticket=origin.issueExclusive('capacity_policy',key,{format:'cimiloop/host-capacity-policy/1.0.0',binding:{format:'cimiloop/runtime-contract-files/1.0.0',...basis},limits:{calls:16}});
  const host=new RuntimeContractFileHost(origin,files,ticket,structuredClone(basis),authorize);host.guard();return host;
 }
 private guard(){if(this.closed||this.abort.signal.aborted||this.authority()!==this.basis.authority_basis_digest||this.files.scopeDigest!==this.basis.workspace_scope_digest)fail();}
 private input(raw:unknown){const input=parseWorkspaceToolInvocation(canonical(raw));agentWorkspaceToolAuthorityRequest(this.basis.scope,input);
  if(input.path!=='input.txt'||![digest('before\n').value,digest('after\n').value].includes(input.expected_digest)||this.basis.mode==='review'&&(input.tool!=='read_file'||input.expected_digest!==digest('after\n').value)||input.tool==='replace_file'&&(this.basis.mode!=='edit'||input.expected_digest!==digest('before\n').value||input.replacement_utf8!=='after\n'))fail();return input;}
 private key(input:WorkspaceToolInvocation){return hash({scope:this.basis.scope,call_id:input.call_id});}
 originals(){return readRuntimeContractFileOriginals(this.origin,this.basis.scope);}
 async execute(raw:unknown){this.guard();const input=this.input(raw),key=this.key(input),prior=this.pending.get(key);if(prior){if(!same(prior.input,input))fail();return prior.result;}
  const result=this.perform(input,key);this.pending.set(key,{input,result});void result.finally(()=>this.pending.delete(key)).catch(()=>{});return result;
 }
 private async perform(input:WorkspaceToolInvocation,key:string):Promise<{receipt:WorkspaceToolReceipt;replay:boolean}>{
  this.guard();const state=this.originals();if(state.calls.some(call=>call.id!==key&&call.state==='unknown')||input.tool==='replace_file'&&state.calls.some(call=>call.id!==key&&call.input.tool==='replace_file'))fail();
  const body:CallBasis={input,authority_basis_digest:this.basis.authority_basis_digest,workspace_scope_digest:this.basis.workspace_scope_digest};
  const reservation=this.origin.reserveCapacity(this.ticket,key,{calls:1},body);
  if(!reservation.created){const call=this.originals().calls.find(value=>value.id===key);if(!call||call.state!=='completed'||!call.receipt||!same(call.input,input))fail();this.guard();return{receipt:call.receipt!,replay:true};}
  let effect:PreparedWorkspaceEffect|undefined;
  try{
   this.guard();effect=await this.files.prepare(input,this.abort.signal);this.guard();
   this.origin.issueExclusive(preparation,key,{input_digest:invocationDigest(input),native:effect.proof});this.guard();
   if(!this.origin.claimExclusiveOnce(dispatch,key,{input_digest:invocationDigest(input),preparation_digest:hash(effect.proof)}).created)fail();
   this.guard();const native=await this.files.commit(effect);effect=undefined;
   const receipt:WorkspaceToolReceipt={format:'cimiloop/workspace-tool-receipt/1.0.0',scope:'authorized_workspace',run_id:input.run_id,call_id:input.call_id,input_digest:invocationDigest(input),authority_basis_digest:this.basis.authority_basis_digest,native,formal_agent_execution_enabled:false};
   // Preserve an actual effect even if authority is revoked after native commit.
   this.origin.issueExclusive(completion,key,receipt);this.guard();return{receipt,replay:false};
  }finally{if(effect)await this.files.discard(effect);}
 }
 async close(){this.closed=true;this.abort.abort();await Promise.allSettled([...this.pending.values()].map(value=>value.result));}
}

// Read only against the exact retained Host1. No broker, permit, missing root,
// receipt repair, current permission callback or model request is opened here.
export function readRuntimeContractFileOriginals(origin:AgentStartLedger,rawScope:AgentWorkspaceToolScope){
 if(!(origin instanceof AgentStartLedger))fail();const scope=parseAgentWorkspaceToolScope(rawScope),key=hash({format:'cimiloop/runtime-contract-files/1.0.0',scope}),policy=origin.readExclusive('capacity_policy',key);if(!policy)fail();
 const state=origin.readCapacity(policy!.ticket),binding=state.binding as Basis&{format?:string};
 if(binding.format!=='cimiloop/runtime-contract-files/1.0.0'||!same(binding.scope,scope)||!['edit','review'].includes(binding.mode)||!same(state.limits,{calls:16}))fail();
 const calls=state.reservations.map(row=>{
  const body=row.basis as CallBasis,input=parseWorkspaceToolInvocation(body.input);agentWorkspaceToolAuthorityRequest(scope,input);
  if(row.id!==hash({scope,call_id:input.call_id})||!same(row.units,{calls:1})||body.authority_basis_digest!==binding.authority_basis_digest||body.workspace_scope_digest!==binding.workspace_scope_digest)fail();
  const prepared=origin.readExclusive(preparation,row.id),sent=origin.readExclusive(dispatch,row.id),completed=origin.readExclusive(completion,row.id);let receipt:WorkspaceToolReceipt|undefined;
  if(prepared){if(!prepared.basis||typeof prepared.basis!=='object'||!('input_digest'in prepared.basis)||prepared.basis.input_digest!==invocationDigest(input)||!('native'in prepared.basis))fail();
   const native=parseWorkspacePreparation(prepared.basis.native);if(native.input_digest!==invocationDigest(input)||native.before_digest!==input.expected_digest||(input.tool==='replace_file')!==(native.replacement_identity!==null))fail();
  }
  if(sent&&(!prepared||!same(sent.basis,{input_digest:invocationDigest(input),preparation_digest:hash((prepared.basis as {native:unknown}).native)})))fail();
  if(completed){if(!prepared||!sent)fail();receipt=structuredClone(completed.basis) as WorkspaceToolReceipt;
   if(!same({...receipt,native:null},{format:'cimiloop/workspace-tool-receipt/1.0.0',scope:'authorized_workspace',run_id:input.run_id,call_id:input.call_id,input_digest:invocationDigest(input),authority_basis_digest:binding.authority_basis_digest,native:null,formal_agent_execution_enabled:false}))fail();
   parseWorkspaceCompletion(receipt.native,(prepared.basis as {native:Parameters<typeof parseWorkspaceCompletion>[1]}).native,input);
  }
  return{id:row.id,input,state:receipt?'completed' as const:'unknown' as const,...(receipt?{receipt}:{})};
 });
 if(!same(state,origin.readCapacity(policy!.ticket)))fail();return{binding:structuredClone(binding),calls};
}
