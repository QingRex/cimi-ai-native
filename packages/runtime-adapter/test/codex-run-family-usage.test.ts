import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createInternalId } from '@cimiloop/protocol/v2';
import * as runtime from '../src/index.js';

// Actual protected-capacity implementation, PUBLIC identity and interrupted
// reservations. No model process, token estimate or authenticated bill exists.
const close:(()=>void)[]=[];
afterEach(()=>{while(close.length)close.pop()!();});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'cimiloop-codex-family-usage-'));
 const origin=runtime.AgentStartLedger.initialize(join(root,'account'),{machine_digest:runtime.digest('PUBLIC machine').value,principal_digest:runtime.digest('PUBLIC user').value});close.push(()=>origin.close());
 const budget=runtime.CodexAgentUsageBudget.initialize(origin,{account_digest:'1'.repeat(64),quota_account_digest:'2'.repeat(64),model_calls:8,output_tokens:16384});
 const parent=runtime.parseAgentWorkspaceToolScope({project_id:createInternalId(),run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:runtime.digest('PUBLIC context'),runtime_binding:{binding_ref:{object_type:'provider_binding',id:createInternalId()},digest:runtime.digest('PUBLIC runtime')},skill_bindings:[],host_admission_ref:{provider:'local_content',resource_type:'agent_host_admission',locator:'3'.repeat(64),digest:{algorithm:'sha256',value:'3'.repeat(64)}}});
 const child={...parent,operation_key:createInternalId(),context_digest:runtime.digest('PUBLIC child')};
 const reserve=(scope:typeof parent)=>budget.reserve({scope,call_id:'model_0001',request_digest:'4'.repeat(64),model_header_digest:'5'.repeat(64)},2048);
 const read=(children:typeof parent[]= [child])=>{const method=Reflect.get(runtime,'readCodexAgentRunFamilyUsage');expect(method).toBeTypeOf('function');return method(root,parent,budget,children);};
 return{root,origin,budget,parent,child,reserve,read};
}
it('includes interrupted parent and legitimate child reservations once without claiming fees, releasing holds or repairing originals',()=>{
 const f=fixture();f.reserve(f.parent);f.reserve(f.child);const before=f.budget.snapshot(),result=f.read();
 expect(result).toMatchObject({format:'cimiloop/codex-run-family-usage/1.0.0',coverage:'original_run_family',state:'unknown',holds:2,held_output_tokens:4096,unresolved:2,observed_tokens:null,cost_known:false,cash_charged_micros:null,credit_charged_micro_units:null,costs_reconciled:false,run_family_costs_reconciled:false});
 expect(result.scopes).toHaveLength(2);expect(result.scopes.map((row:any)=>row.operation_key).sort()).toEqual([f.parent.operation_key,f.child.operation_key].sort());expect(f.read()).toEqual(result);expect(f.budget.snapshot()).toEqual(before);expect(existsSync(join(f.root,'agent-runtime-model-originals'))).toBe(false);
});
it('preserves strict single-scope reading and rejects an omitted same-Run reservation in the family',()=>{
 const f=fixture();f.reserve(f.parent);f.reserve(f.child);expect(()=>runtime.readCodexAgentRunUsage(f.root,f.parent,f.budget)).toThrow();expect(()=>f.read([])).toThrow();
});
it('keeps a reserved child without any model hold visible instead of silently dropping the original invocation',()=>{
 const f=fixture();f.reserve(f.parent);const result=f.read();expect(result.scopes).toHaveLength(2);expect(result).toMatchObject({state:'unknown',usage_complete:false,holds:1});expect(result.scopes.find((row:any)=>row.operation_key===f.child.operation_key)).toMatchObject({usage:{holds:0,state:'unknown',usage_complete:false,observed_tokens:null}});
});
it('does not disclose reservations from another project or Run',()=>{
 const f=fixture();f.reserve(f.parent);const foreign={...f.parent,project_id:createInternalId(),run_id:createInternalId()};f.reserve(foreign);const result=f.read([]);expect(result.holds).toBe(1);expect(JSON.stringify(result)).not.toContain(foreign.project_id);expect(JSON.stringify(result)).not.toContain(foreign.run_id);
});
it('refuses duplicate, foreign and unrelated child scopes rather than widening the declared family',()=>{
 const f=fixture();f.reserve(f.parent);
 for(const children of [[f.child,f.child],[f.parent],[{...f.child,run_id:createInternalId()}],[{...f.child,executor_actor_id:createInternalId()}],[{...f.child,runtime_binding:{...f.child.runtime_binding,digest:runtime.digest('PUBLIC other runtime')}}]])expect(()=>f.read(children)).toThrow();
});

it('keeps allocated project capacity held while reading only actual model reservations',()=>{
 const f=fixture(),childOrigin=runtime.AgentStartLedger.initialize(join(f.root,'delegated-account'),{machine_digest:runtime.digest('PUBLIC machine').value,principal_digest:runtime.digest('PUBLIC user').value});close.push(()=>childOrigin.close());
 const child=runtime.CodexAgentUsageBudget.initializeDelegated(childOrigin,{account_digest:'1'.repeat(64),quota_account_digest:'2'.repeat(64),model_calls:2,output_tokens:4096},{request_id:createInternalId(),source_project_id:f.parent.project_id,target_project_id:createInternalId(),target_installation_digest:'6'.repeat(64),parent_policy_digest:f.budget.policy_digest,parent_identity_digest:f.origin.identityDigest});
 f.reserve(f.parent);child.fund(f.budget.allocateTo(child));const before=f.budget.snapshot(),result=f.read([]);
 expect(result).toMatchObject({holds:1,held_output_tokens:2048,usage_complete:false,costs_reconciled:false});expect(before.held).toEqual({model_calls:3,output_tokens:6144});expect(f.budget.snapshot()).toEqual(before);
});
it('does not hide an unproven capacity row merely because it names the allocation format',()=>{
 const f=fixture();f.reserve(f.parent);const policy=f.origin.listExclusive('capacity_policy')[0]!;
 f.origin.reserveCapacity(policy.ticket,runtime.digest('PUBLIC-invalid-allocation').value,{model_calls:1,output_tokens:2048},{format:'cimiloop/codex-usage-allocation/1.0.0'});
 expect(()=>f.read([])).toThrow('codex_usage_allocation_original_changed');expect(f.budget.snapshot().held.model_calls).toBe(2);
});
