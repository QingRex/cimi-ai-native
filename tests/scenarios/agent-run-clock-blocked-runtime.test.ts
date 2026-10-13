import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {createInternalId} from '../../packages/protocol/src/v2/index.js';
import {AgentRunBudget,openWindowsAgentRunClock} from '../../packages/runtime-adapter/dist/index.js';
import {digest} from '../../packages/runtime-adapter/src/files.js';
const blockMain=()=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,17000);
// Actual Windows clock; the second test's authority/budget basis is explicitly constructed.
// No model, qualification, Skill, or S1 acceptance is inferred.
describe.runIf(process.platform==='win32'&&process.arch==='x64')('original clock during synchronous host work',()=>{
 it('accepts a timely original Native reply when main consumes it after seventeen seconds',async()=>{
  const root=mkdtempSync(join(tmpdir(),'cimiloop-clock-blocked-'));console.error('Retain original clock fixture: '+root);
  const clock=await openWindowsAgentRunClock(root),identity=clock.snapshot();
  try{const pending=clock.read();void pending.catch(()=>{});await Promise.resolve();await Promise.resolve();blockMain();
   const first=await pending,next=await clock.read();expect(next.uptime_ms).toBeGreaterThanOrEqual(first.uptime_ms);
   expect(clock.snapshot()).toMatchObject({pid:identity.pid,requests_sent:2,replies_validated:2,process_exited:false});
  }finally{await clock.close();}
  expect(clock.snapshot()).toMatchObject({pid:identity.pid,process_exited:true,closed:true});
 },45000);
 it('charges main delay to the same immutable Task anchor without extending its original budget',async()=>{
  const root=mkdtempSync(join(tmpdir(),'cimiloop-clock-blocked-'));console.error('Retain original constructed Task basis fixture: '+root);
  const clock=await openWindowsAgentRunClock(root);
  try{const first=await clock.read(),basis={scope:{project_id:createInternalId(),run_id:createInternalId(),operation_key:createInternalId(),executor_actor_id:createInternalId(),context_digest:digest('public constructed context'),runtime_binding:{binding_ref:{object_type:'provider_binding' as const,id:createInternalId()},digest:digest('public constructed Runtime')},skill_bindings:[],host_admission_ref:{provider:'local_content' as const,resource_type:'agent_host_admission' as const,locator:digest('public constructed admission').value,digest:digest('public constructed admission')}},task_id:createInternalId(),first_started_at:first.utc,max_elapsed_ms:45000};
   const budget=await AgentRunBudget.open(root,{basis:()=>basis,readClock:clock.read}),original=readFileSync(budget.anchorPath),deadline=budget.nativeDeadlineUptimeMs;
   const pending=budget.remaining();void pending.catch(()=>{});await Promise.resolve();await Promise.resolve();blockMain();
   const remaining=await pending;expect(remaining).toBeGreaterThan(0);expect(remaining).toBeLessThanOrEqual(28000);
   expect(budget.nativeDeadlineUptimeMs).toBe(deadline);expect(budget.basis.max_elapsed_ms).toBe(45000);expect(readFileSync(budget.anchorPath)).toEqual(original);await budget.close();
  }finally{await clock.close();}
 },45000);
});
