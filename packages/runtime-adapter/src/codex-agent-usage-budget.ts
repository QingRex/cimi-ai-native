import { isDeepStrictEqual as same } from 'node:util';
import { AgentStartLedger, type AgentStartTicket } from './agent-start-ledger.js';
import { digest, RuntimeAdapterError } from './files.js';
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from './agent-workspace-authority.js';

export interface CodexUsageAccount {account_digest:string;quota_account_digest:string}
export interface CodexUsageBudgetPolicy extends CodexUsageAccount {model_calls:number;output_tokens:number}
export interface CodexUsageReservation {scope:AgentWorkspaceToolScope;call_id:string;request_digest:string;model_header_digest:string}
const sha=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function fail(reason='codex_usage_budget_unproven'):never{throw new RuntimeAdapterError(reason);}
function account(raw:CodexUsageAccount){if(!raw||!sha(raw.account_digest)||!sha(raw.quota_account_digest))fail();return{account_digest:raw.account_digest,quota_account_digest:raw.quota_account_digest};}
const binding=(raw:CodexUsageAccount)=>({format:'cimiloop/codex-usage-budget/1.0.0',...account(raw)});
const key=(raw:CodexUsageAccount)=>digest(JSON.stringify(binding(raw))).value;

// One account policy shared by all projects/models using the same protected
// origin. These finite holds are NOT provider quota reservations or invoices.
// Unknown remains held. No reset, rolling policy, release or automatic repair.
export class CodexAgentUsageBudget {
 private constructor(private readonly origin:AgentStartLedger,private readonly ticket:AgentStartTicket,private readonly fixed:ReturnType<typeof binding>,readonly policy_digest:string){Object.freeze(this.ticket);Object.freeze(this.fixed);Object.freeze(this);}
 static initialize(origin:AgentStartLedger,raw:CodexUsageBudgetPolicy){
  if(!(origin instanceof AgentStartLedger)||!raw||Object.keys(raw).sort().join(',')!=='account_digest,model_calls,output_tokens,quota_account_digest'||!Number.isSafeInteger(raw.model_calls)||raw.model_calls<1||raw.model_calls>512||!Number.isSafeInteger(raw.output_tokens)||raw.output_tokens<1||raw.output_tokens>1000000000)fail('codex_usage_policy_invalid');
  const fixed=binding(raw);origin.issueExclusive('capacity_policy',key(raw),{format:'cimiloop/host-capacity-policy/1.0.0',binding:fixed,limits:{model_calls:raw.model_calls,output_tokens:raw.output_tokens}});
  const budget=this.open(origin,raw);budget.snapshot();return budget;
 }
 static open(origin:AgentStartLedger,raw:CodexUsageAccount){
  if(!(origin instanceof AgentStartLedger))fail();const fixed=binding(raw),row=origin.readExclusive('capacity_policy',key(raw));if(!row)fail('codex_usage_budget_missing');
  const state=origin.readCapacity(row.ticket);if(!same(state.binding,fixed)||Object.keys(state.limits).sort().join(',')!=='model_calls,output_tokens'||state.limits.model_calls!>512)fail();
  return new CodexAgentUsageBudget(origin,row.ticket,fixed,digest(JSON.stringify({host:origin.identityDigest,ticket:row.ticket,binding:fixed,limits:state.limits})).value);
 }
 assertAccount(raw:CodexUsageAccount){if(!same(binding(raw),this.fixed))fail('codex_usage_account_mismatch');this.snapshot();}
 snapshot(){const state=this.origin.readCapacity(this.ticket);if(!same(state.binding,this.fixed))fail();return{...state,policy_digest:this.policy_digest,costs_reconciled:false as const,provider_quota_reserved:false as const};}
 reserve(raw:CodexUsageReservation,maximumOutput:number){
  if(!raw||Object.keys(raw).sort().join(',')!=='call_id,model_header_digest,request_digest,scope'||typeof raw.call_id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(raw.call_id)||!sha(raw.request_digest)||!sha(raw.model_header_digest)||!Number.isSafeInteger(maximumOutput)||maximumOutput<1||maximumOutput>2048)fail('codex_usage_request_invalid');
  const request={scope:parseAgentWorkspaceToolScope(raw.scope),call_id:raw.call_id,request_digest:raw.request_digest,model_header_digest:raw.model_header_digest};
  const id=digest(JSON.stringify({account:this.fixed,project_id:request.scope.project_id,run_id:request.scope.run_id,operation_key:request.scope.operation_key,call_id:request.call_id})).value;
  this.snapshot();return this.origin.reserveCapacity(this.ticket,id,{model_calls:1,output_tokens:maximumOutput},request);
 }
}
