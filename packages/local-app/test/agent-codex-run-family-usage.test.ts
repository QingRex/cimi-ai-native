import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtempSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as app from '../src/index.js';
import { AgentStartLedger, CodexAgentUsageBudget, digest } from '@cimiloop/runtime-adapter';
import { createInternalId } from '@cimiloop/protocol/v2';
import { createAgentRunProject } from '../../../tests/fixtures/agent-run-project.js';
import { installConstructedNativeFamilySkill } from '../../../tests/fixtures/agent-run-family-skill.js';
import type { OriginalNativeParentPreparation } from '../../../tests/fixtures/agent-run-family-native.js';
import { flowSuccess } from '../../../tests/fixtures/flow-project.js';
import { readHumanOriginalAgentRunInputs } from '../src/agent-runtime-control-local.js';

// Real Kernel, imported package, immutable start-admission anchor and capacity
// store. Qualification is PUBLIC; there is no Native/model execution or bill.
let f:ReturnType<typeof createAgentRunProject>,local:ReturnType<typeof app.openLocalProject>,origin:AgentStartLedger,budget:CodexAgentUsageBudget,runId:string,scope:ReturnType<typeof readHumanOriginalAgentRunInputs>['scope'],child:ReturnType<ReturnType<typeof installConstructedNativeFamilySkill>['custody']['accountScope']>;
beforeAll(()=>{
 const root=mkdtempSync(join(tmpdir(),'cimiloop-codex-local-family-'));f=createAgentRunProject(root);const dataDirectory=dirname(f.path);origin=AgentStartLedger.initialize(join(dataDirectory,'origin'),{machine_digest:digest('PUBLIC machine').value,principal_digest:digest('PUBLIC user').value});
 const method=installConstructedNativeFamilySkill({f,dataDirectory,ledger:origin} as unknown as OriginalNativeParentPreparation),reserved=f.reserveAgent(f.prepareAgent());runId=reserved.run.id;
 app.writeInstance(join(dataDirectory,'instance.json'),{schema_version:'1.0.0',instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at});local=app.openLocalProject({projectDir:root});scope=readHumanOriginalAgentRunInputs(local,runId).scope;
 const result=flowSuccess(f.kernel.execute(f.command('ReserveSkillInvocation','run',runId,{skill_binding_ref:{object_type:'provider_binding',id:method.binding.id},method_name:'entry',input_ref:method.input_ref})));if(result.command_type!=='ReserveSkillInvocation')throw Error('Original child required');child=method.custody.accountScope(f.project,result.data.invocation,scope,reserved.record.id);
 budget=CodexAgentUsageBudget.initialize(origin,{account_digest:'1'.repeat(64),quota_account_digest:'2'.repeat(64),model_calls:4,output_tokens:8192});for(const selected of [scope,child.child])budget.reserve({scope:selected,call_id:'model_0001',request_digest:'4'.repeat(64),model_header_digest:'5'.repeat(64)},2048);
},120000);
afterAll(()=>{local?.store.close();f?.store.close();origin?.close();});
const read=()=>{const method=Reflect.get(app,'readOriginalLocalCodexRunUsage');expect(method).toBeTypeOf('function');return method(local,runId,budget,origin);};
it('reads the exact Kernel child through its real start birth and preserves all effects, reservations and immutable records',()=>{
 const before=f.store.asOfEventSequence(),held=budget.snapshot(),first=read();expect(first).toMatchObject({coverage:'original_run_family',state:'unknown',holds:2,cost_known:false,usage_complete:false});expect(read()).toEqual(first);expect(f.store.asOfEventSequence()).toBe(before);expect(budget.snapshot()).toEqual(held);expect(f.store.listRuns(f.change.id)).toHaveLength(1);
});
it('refuses a lost original child birth anchor without reconstructing it from Kernel metadata',()=>{
 const path=join(local.location.dataDirectory,'skill-invocation-start-originals',scope.project_id,child.child.operation_key,'admission.json');renameSync(path,path+'.retained-original');try{expect(()=>read()).toThrow();}finally{renameSync(path+'.retained-original',path);}
});
it('connects the protected family to the shared Human costs query while retaining Unknown fees',async()=>{
 let releases=0;const before=f.store.asOfEventSequence(),service=new app.LocalHumanAgentAccountBilling(local,()=>({codex_usage:{budget,origin,guard(){}},release(){releases++;}}));const result=await service.query(runId);expect(result).toMatchObject({outcome:'unknown',reason:'codex_bill_original_unavailable',codex_usage:{coverage:'original_run_family',holds:2,cost_known:false},starts_run:false,kernel_costs_reconciled:false});expect(releases).toBe(1);expect(f.store.asOfEventSequence()).toBe(before);
});
it('suppresses usage if the visible original child set changes during awaited account release',async()=>{
 const before=budget.snapshot(),read=local.store.listRuntimeRecords.bind(local.store);let changed=false;
 const spy=vi.spyOn(local.store,'listRuntimeRecords').mockImplementation((...args)=>{const result=Reflect.apply(read,local.store,args);return changed&&args[0]==='skill_invocation'?[]:result;});
 const service=new app.LocalHumanAgentAccountBilling(local,()=>({codex_usage:{budget,origin,guard(){}},async release(){await Promise.resolve();changed=true;}}));
 try{await expect(service.query(runId)).rejects.toMatchObject({code:'INPUT_CHANGED'});expect(f.store.listRuntimeRecords('skill_invocation',f.change.id)).toHaveLength(1);expect(budget.snapshot()).toEqual(before);}finally{spy.mockRestore();}
});
it('rejects an unrelated same-Run operation hold even when every declared Kernel child is present',()=>{
 budget.reserve({scope:{...scope,operation_key:createInternalId()},call_id:'model_0001',request_digest:'4'.repeat(64),model_header_digest:'5'.repeat(64)},2048);expect(()=>read()).toThrow();expect(budget.snapshot().held.model_calls).toBe(3);
});
