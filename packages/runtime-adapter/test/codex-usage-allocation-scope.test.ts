import {mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect,it} from 'vitest';
import {createInternalId} from '@cimiloop/protocol/v2';
import {AgentStartLedger,CodexAgentUsageBudget,digest} from '../src/index.js';

it('keeps delegated spending in its original target project and refuses a wrongly attributed onward allocation',()=>{
 const root=mkdtempSync(join(tmpdir(),'codex-allocation-scope-')),host={machine_digest:'1'.repeat(64),principal_digest:'2'.repeat(64)},origins=['parent','child','other'].map(name=>AgentStartLedger.initialize(join(root,name),host));
 try{
  const account={account_digest:'3'.repeat(64),quota_account_digest:'4'.repeat(64)},source=createInternalId(),target=createInternalId(),parent=CodexAgentUsageBudget.initialize(origins[0]!,{...account,model_calls:2,output_tokens:4096}),context={request_id:createInternalId(),source_project_id:source,target_project_id:target,target_installation_digest:'5'.repeat(64),parent_policy_digest:parent.policy_digest,parent_identity_digest:parent.origin_identity_digest},child=CodexAgentUsageBudget.initializeDelegated(origins[1]!,{...account,model_calls:2,output_tokens:4096},context);
  child.fund(parent.allocateTo(child));
  const scope={project_id:source,run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest('PUBLIC context'),skill_bindings:[],runtime_binding:{binding_ref:{object_type:'provider_binding' as const,id:createInternalId()},digest:digest('PUBLIC runtime')},host_admission_ref:{provider:'local_content' as const,resource_type:'agent_host_admission' as const,locator:'6'.repeat(64),digest:digest('PUBLIC admission')}},request={scope,call_id:'wrong_project',request_digest:'7'.repeat(64),model_header_digest:'8'.repeat(64)};
  expect(()=>child.reserve(request,2048)).toThrow('codex_usage_allocation_project_mismatch');expect(child.snapshot().held.model_calls).toBe(0);
  const other=CodexAgentUsageBudget.initializeDelegated(origins[2]!,{...account,model_calls:1,output_tokens:2048},{...context,request_id:createInternalId(),source_project_id:source,target_project_id:createInternalId(),parent_policy_digest:child.policy_digest,parent_identity_digest:child.origin_identity_digest});
  expect(()=>child.allocateTo(other)).toThrow('codex_usage_allocation_project_mismatch');expect(child.snapshot().held.model_calls).toBe(0);
  expect(child.reserve({...request,scope:{...scope,project_id:target}},2048)).toMatchObject({created:true});
 }finally{for(const origin of origins)origin.close();}
});
