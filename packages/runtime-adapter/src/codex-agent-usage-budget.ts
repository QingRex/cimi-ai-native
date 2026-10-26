import { isDeepStrictEqual as same } from 'node:util';
import { AgentStartLedger, type AgentStartTicket } from './agent-start-ledger.js';
import { digest, RuntimeAdapterError } from './files.js';
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from './agent-workspace-authority.js';

export interface CodexUsageAccount {account_digest:string;quota_account_digest:string}
export interface CodexUsageBudgetPolicy extends CodexUsageAccount {model_calls:number;output_tokens:number}
export interface CodexUsageReservation {scope:AgentWorkspaceToolScope;call_id:string;request_digest:string;model_header_digest:string}
export interface CodexUsageDelegationContext {request_id:string;source_project_id:string;target_project_id:string;target_installation_digest:string;parent_policy_digest:string;parent_identity_digest:string}
interface AllocationProof {format:'cimiloop/codex-usage-allocation/1.0.0';account:CodexUsageAccount;parent_policy_digest:string;parent_identity_digest:string;child_policy_digest:string;child_identity_digest:string;limits:{model_calls:number;output_tokens:number};context:CodexUsageDelegationContext}
export interface CodexUsageAllocation {created:boolean;allocation_id:string;proof:AllocationProof;ticket:AgentStartTicket;allocation_digest:string}
const capabilities=new WeakMap<CodexUsageAllocation,{parent:CodexAgentUsageBudget;child:CodexAgentUsageBudget}>();
const delegationNamespace='codex_usage_budget_delegation',fundingNamespace='codex_usage_budget_funding';
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function fail(reason='codex_usage_budget_unproven'):never{throw new RuntimeAdapterError(reason);}
function account(raw:CodexUsageAccount){if(!raw||!sha(raw.account_digest)||!sha(raw.quota_account_digest))fail();return{account_digest:raw.account_digest,quota_account_digest:raw.quota_account_digest};}
const binding=(raw:CodexUsageAccount)=>({format:'cimiloop/codex-usage-budget/1.0.0',...account(raw)});
const key=(raw:CodexUsageAccount)=>digest(JSON.stringify(binding(raw))).value;
function policy(raw:CodexUsageBudgetPolicy){if(!raw||Object.keys(raw).sort().join(',')!=='account_digest,model_calls,output_tokens,quota_account_digest'||!Number.isSafeInteger(raw.model_calls)||raw.model_calls<1||raw.model_calls>512||!Number.isSafeInteger(raw.output_tokens)||raw.output_tokens<1||raw.output_tokens>1000000000)fail('codex_usage_policy_invalid');account(raw);return structuredClone(raw);}
function delegation(raw:CodexUsageDelegationContext){if(!raw||Object.keys(raw).sort().join(',')!=='parent_identity_digest,parent_policy_digest,request_id,source_project_id,target_installation_digest,target_project_id'||![raw.request_id,raw.source_project_id,raw.target_project_id].every(value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))||raw.source_project_id===raw.target_project_id||![raw.parent_identity_digest,raw.parent_policy_digest,raw.target_installation_digest].every(sha))fail('codex_usage_allocation_context_invalid');return structuredClone(raw);}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const allocationHash=(value:unknown):string=>{const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,item])=>[k,canonical(item)])):v;return digest(JSON.stringify(canonical(value))).value;};

// One account policy shared by all projects/models using the same protected
// origin. These finite holds are NOT provider quota reservations or invoices.
// Unknown remains held. No reset, rolling policy, release or automatic repair.
export class CodexAgentUsageBudget {
 private constructor(private readonly origin:AgentStartLedger,private readonly ticket:AgentStartTicket,private readonly fixed:ReturnType<typeof binding>,readonly policy_digest:string,private readonly delegated?:CodexUsageDelegationContext){Object.freeze(this.ticket);Object.freeze(this.fixed);if(delegated)freeze(delegated);Object.freeze(this);}
 get origin_identity_digest(){return this.origin.identityDigest;}
 static initialize(origin:AgentStartLedger,raw:CodexUsageBudgetPolicy){
  if(!(origin instanceof AgentStartLedger))fail('codex_usage_policy_invalid');policy(raw);if(origin.readExclusive(delegationNamespace,key(raw)))fail('codex_usage_delegated_policy_no_reset');
  const fixed=binding(raw);origin.issueExclusive('capacity_policy',key(raw),{format:'cimiloop/host-capacity-policy/1.0.0',binding:fixed,limits:{model_calls:raw.model_calls,output_tokens:raw.output_tokens}});
  const budget=this.open(origin,raw);budget.snapshot();return budget;
 }
 static initializeDelegated(origin:AgentStartLedger,raw:CodexUsageBudgetPolicy,context:CodexUsageDelegationContext){
  if(!(origin instanceof AgentStartLedger))fail();const limits=policy(raw),fixed=binding(raw),body=delegation(context),prior=origin.readExclusive(delegationNamespace,key(raw));
  if(!prior&&origin.readExclusive('capacity_policy',key(raw)))fail('codex_usage_existing_policy_not_delegatable');
  const intent=origin.claimExclusiveOnce(delegationNamespace,key(raw),body);if(!intent.created){const budget=this.open(origin,raw);if(!same(budget.snapshot().limits,{model_calls:limits.model_calls,output_tokens:limits.output_tokens}))fail();return budget;}
  origin.issueExclusive('capacity_policy',key(raw),{format:'cimiloop/host-capacity-policy/1.0.0',binding:fixed,limits:{model_calls:limits.model_calls,output_tokens:limits.output_tokens}});return this.open(origin,raw);
 }
 static open(origin:AgentStartLedger,raw:CodexUsageAccount){
  if(!(origin instanceof AgentStartLedger))fail();const fixed=binding(raw),row=origin.readExclusive('capacity_policy',key(raw));if(!row)fail('codex_usage_budget_missing');
  const state=origin.readCapacity(row.ticket);if(!same(state.binding,fixed)||Object.keys(state.limits).sort().join(',')!=='model_calls,output_tokens'||state.limits.model_calls!>512)fail();
  const delegated=origin.readExclusive(delegationNamespace,key(raw));return new CodexAgentUsageBudget(origin,row.ticket,fixed,digest(JSON.stringify({host:origin.identityDigest,ticket:row.ticket,binding:fixed,limits:state.limits})).value,delegated?delegation(delegated.basis as CodexUsageDelegationContext):undefined);
 }
 assertAccount(raw:CodexUsageAccount){if(!same(binding(raw),this.fixed))fail('codex_usage_account_mismatch');this.snapshot();if(this.delegated)this.allocationProof();}
 allocateTo(child:CodexAgentUsageBudget):CodexUsageAllocation{
  this.assertAccount(this.fixed);if(!(child instanceof CodexAgentUsageBudget)||!child.delegated||child.origin.identityDigest===this.origin.identityDigest||!same(child.fixed,this.fixed)||child.delegated.parent_policy_digest!==this.policy_digest||child.delegated.parent_identity_digest!==this.origin.identityDigest)fail('codex_usage_allocation_target_mismatch');
  if(this.delegated&&child.delegated.source_project_id!==this.delegated.target_project_id)fail('codex_usage_allocation_project_mismatch');
  const state=child.snapshot(),proof:AllocationProof={format:'cimiloop/codex-usage-allocation/1.0.0',account:account(this.fixed),parent_policy_digest:this.policy_digest,parent_identity_digest:this.origin.identityDigest,child_policy_digest:child.policy_digest,child_identity_digest:child.origin.identityDigest,limits:{model_calls:state.limits.model_calls!,output_tokens:state.limits.output_tokens!},context:structuredClone(child.delegated)},allocation_id=allocationHash(proof);
  const existing=this.snapshot().reservations.find(row=>row.id===allocation_id);if(!existing&&(state.held.model_calls!==0||state.held.output_tokens!==0))fail('codex_usage_allocation_target_already_used');
  const result=this.origin.reserveCapacity(this.ticket,allocation_id,proof.limits,proof),body={allocation_id,proof,ticket:result.ticket},value=freeze({...result,...body,allocation_digest:allocationHash(body)});capabilities.set(value,{parent:this,child});return value;
 }
 fund(value:CodexUsageAllocation){
  const capability=capabilities.get(value);if(!capability||capability.child!==this)fail('codex_usage_allocation_capability_unproven');const parent=capability.parent;parent.assertAccount(this.fixed);
  const original=parent.snapshot().reservations.find(row=>row.id===value.allocation_id);if(!original||!same(original.ticket,value.ticket)||!same(original.basis,value.proof)||!same(original.units,value.proof.limits))fail('codex_usage_allocation_original_changed');
  const {created:_,...body}=value,ticket=this.origin.issueExclusive(fundingNamespace,key(this.fixed),{format:'cimiloop/codex-usage-funding/1.0.0',...body});this.allocationProof();return ticket;
 }
 allocationProof(){
  if(!this.delegated)return undefined;const row=this.origin.readExclusive(fundingNamespace,key(this.fixed));if(!row)fail('codex_usage_allocation_unfunded');
  const body=structuredClone(row.basis) as {format?:string;allocation_id:string;proof:AllocationProof;ticket:AgentStartTicket;allocation_digest:string},proof=body.proof,state=this.snapshot();
  if(!body||Object.keys(body).sort().join(',')!=='allocation_digest,allocation_id,format,proof,ticket'||body.format!=='cimiloop/codex-usage-funding/1.0.0'||!proof||proof.format!=='cimiloop/codex-usage-allocation/1.0.0'||!same(proof.context,this.delegated)||!same(proof.account,account(this.fixed))||!same(proof.limits,state.limits)||proof.child_policy_digest!==this.policy_digest||proof.child_identity_digest!==this.origin.identityDigest||proof.parent_policy_digest!==this.delegated.parent_policy_digest||proof.parent_identity_digest!==this.delegated.parent_identity_digest||body.ticket?.identity_digest!==proof.parent_identity_digest||body.allocation_id!==allocationHash(proof)||body.allocation_digest!==allocationHash({allocation_id:body.allocation_id,proof,ticket:body.ticket}))fail('codex_usage_allocation_proof_unproven');
  return{ticket:structuredClone(row.ticket),basis:body};
 }
 snapshot(){const state=this.origin.readCapacity(this.ticket);if(!same(state.binding,this.fixed))fail();return{...state,policy_digest:this.policy_digest,costs_reconciled:false as const,provider_quota_reserved:false as const};}
 reserve(raw:CodexUsageReservation,maximumOutput:number){
  if(this.delegated)this.allocationProof();
  if(!raw||Object.keys(raw).sort().join(',')!=='call_id,model_header_digest,request_digest,scope'||typeof raw.call_id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(raw.call_id)||!sha(raw.request_digest)||!sha(raw.model_header_digest)||!Number.isSafeInteger(maximumOutput)||maximumOutput<1||maximumOutput>2048)fail('codex_usage_request_invalid');
  const request={scope:parseAgentWorkspaceToolScope(raw.scope),call_id:raw.call_id,request_digest:raw.request_digest,model_header_digest:raw.model_header_digest};
  if(this.delegated&&request.scope.project_id!==this.delegated.target_project_id)fail('codex_usage_allocation_project_mismatch');
  const id=digest(JSON.stringify({account:this.fixed,project_id:request.scope.project_id,run_id:request.scope.run_id,operation_key:request.scope.operation_key,call_id:request.call_id})).value;
  this.snapshot();return this.origin.reserveCapacity(this.ticket,id,{model_calls:1,output_tokens:maximumOutput},request);
 }
}
