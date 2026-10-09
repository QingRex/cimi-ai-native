import {RuntimeAdapterError} from "./files.js";
import {ExecutionLifetime} from "./execution-lifetime.js";
import {AgentRunBudget} from "./agent-run-budget.js";
export const AGENT_RUNTIME_MAX_ELAPSED_MS=3600000;
export const REHEARSAL_MAX_ELAPSED_MS=180000;
export function selectAgentRuntimeLifetime(kind:"production"|"rehearsal",requested:number|undefined,remaining:number|undefined){
 if(kind!=="production"&&kind!=="rehearsal")throw new RuntimeAdapterError("workspace_rehearsal_input_invalid");
 const maximum=kind==="production"?AGENT_RUNTIME_MAX_ELAPSED_MS:REHEARSAL_MAX_ELAPSED_MS;
 const requested_ms=requested??(kind==="production"?maximum:45000);
 if(!Number.isSafeInteger(requested_ms)||requested_ms<1000||requested_ms>maximum)throw new RuntimeAdapterError("workspace_rehearsal_input_invalid");
 if(kind==="production"&&remaining===undefined)throw new RuntimeAdapterError("agent_runtime_task_budget_unavailable");
 if(remaining!==undefined&&(!Number.isSafeInteger(remaining)||remaining<1000))throw new RuntimeAdapterError("agent_run_budget_exhausted");
 return {policy:kind==="production"?"agent_task/1.0.0" as const:"workspace_rehearsal/1.0.0" as const,requested_ms,elapsed_ms:Math.min(requested_ms,remaining??requested_ms)};
}
// Staging shares the original Task clock and cancellation. Late resources are
// closed; a late qualification can never authorize launch or renew a budget.
export async function withinAgentRuntimeTaskBudget<T>(budget:AgentRunBudget,work:(signal:AbortSignal)=>Promise<T>,late?:(value:T)=>void|Promise<void>):Promise<T>{
 if(!(budget instanceof AgentRunBudget))throw new RuntimeAdapterError("agent_runtime_task_budget_unavailable");
 budget.assertScope(budget.basis.scope);
 const policy=selectAgentRuntimeLifetime("production",undefined,await budget.remaining());
 const lifetime=new ExecutionLifetime(policy.elapsed_ms,undefined,"agent_task"),stop=budget.watch(reason=>lifetime.stop(reason));
 try{return await lifetime.wait(Promise.resolve().then(()=>{lifetime.check();return work(lifetime.signal);}),late);}
 finally{stop();lifetime.dispose();}
}