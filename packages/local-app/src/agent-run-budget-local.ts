import { isDeepStrictEqual } from "node:util";
import { AgentRunBudget, openWindowsAgentRunClock, RuntimeAdapterError, type AgentRunBudgetBasis } from "@cimiloop/runtime-adapter";
import { originalAgentWorkspaceScope, type AgentWorkspaceToolLocalContext } from "./agent-workspace-tools-local.js";

// Trusted local composition consumes native facts. Human CLI/workbench callers
// cannot create this context; no constructed qualification is promoted here.
export async function openLocalAgentRunBudget(local: AgentWorkspaceToolLocalContext, runId: string, signal?: AbortSignal): Promise<AgentRunBudget> {
  const basis = (): AgentRunBudgetBasis => {
    const scope = originalAgentWorkspaceScope(local, runId), run = local.store.getRun(runId), record = run && local.store.getRuntimeRecord("run_record", run.record_ref.id),
      context = record && local.store.getRuntimeRecord("context_manifest", record.context_ref.id), task = run && local.store.getExecutionObject("task", run.task_id),
      item = run && local.store.getExecutionObject("work_item", run.work_item_ref.id);
    if (run?.cancel_requested) throw new RuntimeAdapterError("agent_run_cancel_requested");
    if (!run || !record || record.run_kind !== "agent" || !context || !("runtime_binding" in context) || !task || !item ||
      !["Reserved", "Running"].includes(run.status) || run.cancel_requested || run.reservation_released || task.status !== "InProgress" || item.status !== "Active" ||
      task.active_run_ref?.id !== run.id || task.active_work_item_ref?.id !== item.id || !task.usage.first_started_at ||
      item.project_id !== run.project_id || item.task_id !== task.id || item.change_id !== run.change_id || item.executor_ref.id !== scope.executor_actor_id ||
      ["definition_ref", "contract_ref", "plan_ref"].some(key => [item, record, context].some(value => !isDeepStrictEqual(value[key as "definition_ref"], task[key as "definition_ref"])))) throw Error("Agent original active budget unavailable");
    return { scope, task_id: task.id, first_started_at: task.usage.first_started_at, max_elapsed_ms: item.budget.max_elapsed_ms };
  };
  const original = basis(), clock = await openWindowsAgentRunClock(local.location.dataDirectory, signal);
  if (!isDeepStrictEqual(basis(), original)) throw Error("Agent original budget changed during clock preparation");
  return AgentRunBudget.open(local.location.dataDirectory, { basis, readClock: clock.read }, signal);
}
