import { mkdtempSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as runtime from '../src/index.js';
import { createInternalId } from '@cimiloop/protocol/v2';
const hash=(v:string)=>runtime.digest(v).value;
const binding={account_digest:hash('PUBLIC account'),quota_account_digest:hash('PUBLIC quota')};
const host={machine_digest:hash('PUBLIC machine'),principal_digest:hash('PUBLIC principal')};
function fixture(){const root=join(mkdtempSync(join(tmpdir(),'cimiloop-codex-budget-')),'origin'),origin=runtime.AgentStartLedger.initialize(root,host);const scope={project_id:createInternalId(),run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:runtime.digest('PUBLIC context'),skill_bindings:[],runtime_binding:{binding_ref:{object_type:'provider_binding' as const,id:createInternalId()},digest:runtime.digest('PUBLIC runtime')},host_admission_ref:{provider:'local_content' as const,resource_type:'agent_host_admission' as const,locator:hash('PUBLIC admission'),digest:runtime.digest('PUBLIC admission')}};return{root,origin,scope};}
describe('Codex account shared original usage budget',()=>{
 it('shares finite capacity with pre-plan methods without manufacturing a Run or hiding their account usage',()=>{
  const f=fixture();try{
   const budget=runtime.CodexAgentUsageBudget.initialize(f.origin,{...binding,model_calls:2,output_tokens:4096}),session=createInternalId(),request={project_id:f.scope.project_id,actor_id:createInternalId(),session_id:session,invocation_key:session+'_'+createInternalId(),call_id:'PUBLIC_pre_plan',request_digest:hash('PUBLIC method request'),installation_digest:hash('PUBLIC installation')};
   const reserve=Reflect.get(budget,'reservePrePlan');expect(reserve).toBeTypeOf('function');
   expect(reserve.call(budget,request,2048)).toMatchObject({created:true});expect(reserve.call(budget,request,2048)).toMatchObject({created:false});
   expect(budget.snapshot().held).toEqual({model_calls:1,output_tokens:2048});expect(budget.modelSnapshot().reservations).toHaveLength(0);expect(budget.snapshot().reservations[0]!.basis).not.toHaveProperty('scope');
   expect(()=>reserve.call(budget,{...request,request_digest:hash('changed original')},2048)).toThrow();
   budget.reserve({scope:f.scope,call_id:'actual_run_call',request_digest:hash('PUBLIC run request'),model_header_digest:hash('PUBLIC run header')},2048);
   expect(budget.modelSnapshot().reservations).toHaveLength(1);expect(budget.snapshot().held.model_calls).toBe(2);
   expect(()=>reserve.call(budget,{...request,call_id:'over_account_limit'},2048)).toThrow('agent_capacity_exhausted');
  }finally{f.origin.close();}
 });
 it('rejects malformed pre-plan identities before reserving capacity',()=>{
  const f=fixture();try{
   const budget=runtime.CodexAgentUsageBudget.initialize(f.origin,{...binding,model_calls:2,output_tokens:4096}),session=createInternalId(),request={project_id:f.scope.project_id,actor_id:createInternalId(),session_id:session,invocation_key:session+'_'+createInternalId(),call_id:'PUBLIC_pre_plan',request_digest:hash('PUBLIC request'),installation_digest:hash('PUBLIC installation')};
   const reserve=Reflect.get(budget,'reservePrePlan');expect(reserve).toBeTypeOf('function');
   for(const bad of [{...request,invocation_key:createInternalId()},{...request,session_id:createInternalId()},{...request,run_id:createInternalId()},{...request,request_digest:'invalid'}])expect(()=>reserve.call(budget,bad,2048)).toThrow();
   expect(budget.snapshot().held.model_calls).toBe(0);
  }finally{f.origin.close();}
 });
 it('allocates finite capacity to another original without releasing Unknown or granting an unfunded or copied allocation',()=>{
  const f=fixture(),g=fixture();try{
   const parent=runtime.CodexAgentUsageBudget.initialize(f.origin,{...binding,model_calls:4,output_tokens:8192}),request={scope:f.scope,call_id:'model_old_unknown',request_digest:hash('PUBLIC original request'),model_header_digest:hash('PUBLIC original header')};parent.reserve(request,2048);
   const initialize=Reflect.get(runtime.CodexAgentUsageBudget,'initializeDelegated');expect(initialize).toBeTypeOf('function');
   const context={request_id:createInternalId(),source_project_id:f.scope.project_id,target_project_id:g.scope.project_id,target_installation_digest:hash('PUBLIC target installation'),parent_policy_digest:parent.policy_digest,parent_identity_digest:f.origin.identityDigest};
   const child=Reflect.apply(initialize,runtime.CodexAgentUsageBudget,[g.origin,{...binding,model_calls:2,output_tokens:4096},context]) as runtime.CodexAgentUsageBudget;
   expect(()=>child.reserve({...request,scope:g.scope},2048)).toThrow('codex_usage_allocation_unfunded');
   const allocate=Reflect.get(parent,'allocateTo'),fund=Reflect.get(child,'fund');expect(allocate).toBeTypeOf('function');expect(fund).toBeTypeOf('function');
   const allocation=Reflect.apply(allocate,parent,[child]);expect(parent.snapshot().held).toEqual({model_calls:3,output_tokens:6144});
   expect(()=>Reflect.apply(fund,child,[structuredClone(allocation)])).toThrow();Reflect.apply(fund,child,[allocation]);
   expect(child.reserve({...request,scope:g.scope},2048)).toMatchObject({created:true});expect(child.reserve({...request,scope:g.scope},2048)).toMatchObject({created:false});
   const again=Reflect.apply(allocate,parent,[runtime.CodexAgentUsageBudget.open(g.origin,binding)]);expect(again).toMatchObject({created:false});expect(parent.snapshot().held.model_calls).toBe(3);
   expect(()=>parent.reserve({...request,call_id:'another_old_call'},2048)).not.toThrow();expect(()=>parent.reserve({...request,call_id:'over_original_limit'},2048)).toThrow('agent_capacity_exhausted');
   expect(()=>runtime.CodexAgentUsageBudget.initialize(g.origin,{...binding,model_calls:2,output_tokens:4096})).toThrow();
  }finally{f.origin.close();g.origin.close();}
 });
 it('binds allocated capacity to the original destination policy and account, never a new directory with the same declared limits',()=>{
  const f=fixture(),g=fixture(),h=fixture();try{
   const parent=runtime.CodexAgentUsageBudget.initialize(f.origin,{...binding,model_calls:2,output_tokens:4096}),initialize=Reflect.get(runtime.CodexAgentUsageBudget,'initializeDelegated');expect(initialize).toBeTypeOf('function');
   const context={request_id:createInternalId(),source_project_id:f.scope.project_id,target_project_id:g.scope.project_id,target_installation_digest:hash('PUBLIC target'),parent_policy_digest:parent.policy_digest,parent_identity_digest:f.origin.identityDigest};
   const child=Reflect.apply(initialize,runtime.CodexAgentUsageBudget,[g.origin,{...binding,model_calls:1,output_tokens:2048},context]) as runtime.CodexAgentUsageBudget,other=Reflect.apply(initialize,runtime.CodexAgentUsageBudget,[h.origin,{...binding,model_calls:1,output_tokens:2048},context]) as runtime.CodexAgentUsageBudget;
   const allocation=Reflect.get(parent,'allocateTo').call(parent,child);expect(()=>Reflect.get(other,'fund').call(other,allocation)).toThrow();expect(parent.snapshot().held.model_calls).toBe(1);
  }finally{f.origin.close();g.origin.close();h.origin.close();}
 });
 it('requires an explicitly installed account policy and does not create it while opening',()=>{const f=fixture();try{expect(()=>runtime.CodexAgentUsageBudget.open(f.origin,binding)).toThrow('codex_usage_budget_missing');expect(f.origin.listExclusive('capacity_policy')).toHaveLength(0);}finally{f.origin.close();}});
 it('shares the same account limit across projects and retains unknown reservations after restart',()=>{const f=fixture(),policy={...binding,model_calls:2,output_tokens:3000};let budget=runtime.CodexAgentUsageBudget.initialize(f.origin,policy);const request={scope:f.scope,call_id:'model_0001',request_digest:hash('request'),model_header_digest:hash('header')};expect(budget.reserve(request,2048)).toMatchObject({created:true});expect(budget.reserve(request,2048)).toMatchObject({created:false});f.origin.close();const origin=runtime.AgentStartLedger.open(f.root,host);try{budget=runtime.CodexAgentUsageBudget.open(origin,binding);expect(budget.snapshot()).toMatchObject({held:{model_calls:1,output_tokens:2048},costs_reconciled:false});expect(()=>budget.reserve({...request,scope:{...f.scope,project_id:createInternalId(),run_id:createInternalId()}},2048)).toThrow('agent_capacity_exhausted');}finally{origin.close();}});
 it('refuses changed policy, wrong accounts, changed call bodies and oversized requests',()=>{const f=fixture();try{const budget=runtime.CodexAgentUsageBudget.initialize(f.origin,{...binding,model_calls:2,output_tokens:4096}),request={scope:f.scope,call_id:'model_0001',request_digest:hash('request'),model_header_digest:hash('header')};budget.reserve(request,2048);expect(()=>runtime.CodexAgentUsageBudget.initialize(f.origin,{...binding,model_calls:3,output_tokens:4096})).toThrow();expect(()=>budget.assertAccount({...binding,quota_account_digest:hash('other')})).toThrow();expect(()=>budget.reserve({...request,request_digest:hash('changed')},2048)).toThrow();expect(()=>budget.reserve({...request,call_id:'model_0002'},2049)).toThrow('codex_usage_request_invalid');expect(budget.snapshot().held.model_calls).toBe(1);}finally{f.origin.close();}});
 it('never re-creates a lost original account on read',()=>{const f=fixture();runtime.CodexAgentUsageBudget.initialize(f.origin,{...binding,model_calls:2,output_tokens:4096});f.origin.close();renameSync(f.root,f.root+'.retained');expect(()=>runtime.AgentStartLedger.open(f.root,host)).toThrow('agent_start_original_missing');});
});
