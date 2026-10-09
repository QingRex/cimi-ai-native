import {afterEach,describe,expect,it,vi} from "vitest";
import {selectAgentRuntimeLifetime} from "../src/agent-runtime-lifetime.js";
import {ExecutionLifetime} from "../src/execution-lifetime.js";
describe("bounded production Runtime inside original Task",()=>{
 afterEach(()=>vi.useRealTimers());
 it("retains the legacy default/cap and requires a finite original budget for production",()=>{
  expect(selectAgentRuntimeLifetime("rehearsal",undefined,undefined)).toEqual({policy:"workspace_rehearsal/1.0.0",requested_ms:45000,elapsed_ms:45000});
  expect(()=>selectAgentRuntimeLifetime("rehearsal",180001,undefined)).toThrow("workspace_rehearsal_input_invalid");
  expect(()=>selectAgentRuntimeLifetime("production",undefined,undefined)).toThrow("agent_runtime_task_budget_unavailable");
 });
 it("uses only original remaining time and caps a long approved Task at one hour",()=>{
  expect(selectAgentRuntimeLifetime("production",undefined,600000)).toEqual({policy:"agent_task/1.0.0",requested_ms:3600000,elapsed_ms:600000});
  expect(selectAgentRuntimeLifetime("production",900000,60000)).toEqual({policy:"agent_task/1.0.0",requested_ms:900000,elapsed_ms:60000});
  expect(selectAgentRuntimeLifetime("production",undefined,7200000).elapsed_ms).toBe(3600000);
  expect(selectAgentRuntimeLifetime("production",30000,600000).elapsed_ms).toBe(30000);
 });
 it.each([NaN,Infinity,-1,0,999,3600001,Number.MAX_SAFE_INTEGER])("refuses invalid production requests %s",value=>{
  expect(()=>selectAgentRuntimeLifetime("production",value,600000)).toThrow("workspace_rehearsal_input_invalid");
 });
 it("refuses expired/subsecond/invalid original budget and unknown policy without granting another interval",()=>{
  for(const remaining of [0,-1,999,NaN,Infinity])expect(()=>selectAgentRuntimeLifetime("production",undefined,remaining)).toThrow();
  expect(()=>selectAgentRuntimeLifetime("foreign" as never,undefined,600000)).toThrow("workspace_rehearsal_input_invalid");
 });
 it("keeps production preparation and execution in the same bounded lifetime and preserves legacy refusal",async()=>{
  vi.useFakeTimers();expect(()=>new ExecutionLifetime(180001)).toThrow("execution_lifetime_invalid");
  expect(()=>new ExecutionLifetime(3600001,undefined,"agent_task")).toThrow("execution_lifetime_invalid");
  const lifetime=new ExecutionLifetime(600000,undefined,"agent_task");
  try{
   await vi.advanceTimersByTimeAsync(590000);expect(lifetime.signal.aborted).toBe(false);
   const wait=lifetime.wait(new Promise<void>(()=>{})),result=expect(wait).rejects.toThrow("workspace_rehearsal_deadline");
   await vi.advanceTimersByTimeAsync(10000);await result;expect(lifetime.signal.aborted).toBe(true);
  }finally{lifetime.dispose();}
 });
});