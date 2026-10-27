import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {describe,it,expect,vi} from 'vitest';
import {createInternalId} from '@cimiloop/protocol/v2';
import * as runtime from '../src/index.js';
const hash=(s:string)=>runtime.digest(s).value;
// Actual protected-capacity algorithms, PUBLIC origin identity and transport.
// No login, Native execution, provider qualification or financial settlement.
describe('budgeted pre-plan Codex execution',()=>{
 function fixture(){const root=mkdtempSync(join(tmpdir(),'cimi-pre-plan-budget-')),binary=join(root,'PUBLIC.exe');writeFileSync(binary,'PUBLIC program fixture');
  const origin=runtime.AgentStartLedger.initialize(join(root,'host'),{machine_digest:hash('PUBLIC machine'),principal_digest:hash('PUBLIC principal')}),account={account_digest:hash('PUBLIC account'),quota_account_digest:hash('PUBLIC quota')};
  const budget=runtime.CodexAgentUsageBudget.initialize(origin,{...account,model_calls:2,output_tokens:4096}),binding={project_id:createInternalId(),actor_id:createInternalId(),installation_digest:hash('PUBLIC original installation'),model:'gpt-6-luna',...account},session=createInternalId(),operation={session_id:session,invocation_key:session+'_'+createInternalId()};
  const Constructor=Reflect.get(runtime,'BudgetedCodexPrePlanRuntime');expect(Constructor).toBeTypeOf('function');
  const client=new Constructor({root:join(root,'originals'),command:{file:binary,args:[],sha256:hash('PUBLIC program fixture')},account_digest:account.account_digest},origin,undefined,undefined,budget,binding,()=>{});
  const request={operation_key:operation.invocation_key,model:binding.model,instructions:'PUBLIC fixed method',prompt:'PUBLIC input',tools:[],output_schema:{type:'object'},usage_policy:'require_ordinary_permission/1.0.0' as const,quota_account_digest:account.quota_account_digest};
  return{origin,budget,binding,operation,client,request};
 }
 it('rejects before any effect or reservation when the actual transport cannot enforce the whole-turn output cap',async()=>{
  const x=fixture();let sends=0;const spy=vi.spyOn(runtime.CodexOriginalMethodRuntime.prototype,'execute').mockImplementation(async()=>{sends++;throw Error('PUBLIC lost response');});
  try{await expect(x.client.withOperation(x.operation,()=>x.client.execute(x.request,()=>'',()=>{}))).rejects.toThrow('codex_pre_plan_output_budget_unavailable');
   await expect(x.client.withOperation(x.operation,()=>x.client.execute(x.request,()=>'',()=>{}))).rejects.toThrow('codex_pre_plan_output_budget_unavailable');
   expect(sends).toBe(0);expect(x.budget.snapshot().held).toEqual({model_calls:0,output_tokens:0});expect(x.budget.modelSnapshot().reservations).toHaveLength(0);
  }finally{spy.mockRestore();x.origin.close();}
 });
 it('does not mistake a parent or fact prompt for a server-enforced output bound',async()=>{
  const x=fixture();const spy=vi.spyOn(runtime.CodexOriginalMethodRuntime.prototype,'execute').mockImplementation(async()=>({usage:{outputTokens:1}} as never));
  try{await x.client.withOperation(x.operation,async()=>{
   await expect(x.client.execute(x.request,()=>'',()=>{})).rejects.toThrow('codex_pre_plan_output_budget_unavailable');
   const parent={operation_key:x.operation.invocation_key,model:x.binding.model,account_digest:x.binding.account_digest},call_id='fact_1',child={...x.request,operation_key:hash(JSON.stringify({parent_operation_key:parent.operation_key,call_id})),prompt:JSON.stringify({format:'cimiloop/codex-fact-request/1.0.0',parent,call_id})};
   await expect(x.client.execute(child,()=>'',()=>{})).rejects.toThrow('codex_pre_plan_output_budget_unavailable');await expect(x.client.execute({...child,operation_key:'unrelated'},()=>'',()=>{})).rejects.toThrow();
  });expect(spy).not.toHaveBeenCalled();expect(x.budget.snapshot().held.model_calls).toBe(0);
  }finally{spy.mockRestore();x.origin.close();}
 });
 it('requires the current operation, model and quota account before reserving any capacity',async()=>{
  const x=fixture(),spy=vi.spyOn(runtime.CodexOriginalMethodRuntime.prototype,'execute').mockImplementation(async()=>{throw Error('PUBLIC must not send');});
  try{await expect(x.client.execute(x.request,()=>'',()=>{})).rejects.toThrow();
   const {usage_policy:_,...withoutPolicy}=x.request;await x.client.withOperation(x.operation,async()=>{for(const request of [{...x.request,model:'other'},{...x.request,quota_account_digest:hash('other')},withoutPolicy])await expect(x.client.execute(request,()=>'',()=>{})).rejects.toThrow();});
   expect(x.budget.snapshot().held.model_calls).toBe(0);expect(spy).not.toHaveBeenCalled();
  }finally{spy.mockRestore();x.origin.close();}
 });
});
