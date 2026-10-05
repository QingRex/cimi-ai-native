import type { ProjectReader } from "@cimiloop/store";
import type { ToolAuthorityRequest, ToolAuthorityAssessment } from "@cimiloop/protocol/v2";
import { callerMatchesActor, type CallerContext } from "./authorization.js";
import { activeToolScopeProblems, resourceContains, resourceIsBounded } from "./execution.js";
import { contentDigest } from "./intent.js";
import { runContextDigest, runIsSettled } from "./runs.js";

type Body = Omit<ToolAuthorityAssessment, "as_of_event_sequence">;
export const assessToolAuthority = (reader: ProjectReader, request: ToolAuthorityRequest, caller: CallerContext | undefined, now: string): Body => {
  const base = { schema_version: "2.0.0" as const, scope: "human_run_tool_assessment" as const, request,
    assessed_at: now, formal_agent_execution_enabled: false as const };
  const deny = (...reasons: string[]): Body => ({ ...base, decision: "DENY", authority: null, reasons });
  const project = reader.getProject(), actor = reader.getActor(request.executor_actor_id);
  if (!project || project.id !== request.project_id || !caller || caller.kind !== "local_operator" || !actor || !callerMatchesActor(caller, actor)) return deny("CALLER_IDENTITY_MISMATCH");
  const run = reader.getRun(request.run_id), record = run ? reader.getRuntimeRecord("run_record", run.record_ref.id) : undefined;
  const item = run ? reader.getExecutionObject("work_item", run.work_item_ref.id) : undefined;
  const task = item ? reader.getExecutionObject("task", item.task_id) : undefined;
  const context = record ? reader.getRuntimeRecord("context_manifest", record.context_ref.id) : undefined;
  if (!run || !record || !item || !task || !context) return deny("RUN_CONTEXT_REQUIRED");
  if (run.project_id !== project.id || record.project_id !== project.id || context.project_id !== project.id || record.run_kind !== "human" ||
    run.task_id !== task.id || run.change_id !== task.change_id || record.run_id !== run.id || record.task_id !== task.id || record.change_id !== task.change_id ||
    record.work_item_ref.id !== item.id || context.work_item_ref.id !== item.id || context.task_id !== task.id || context.change_id !== task.change_id ||
    record.operation_key !== request.operation_key || record.executor_ref.id !== actor.id || item.executor_ref.id !== actor.id || context.executor_ref.id !== actor.id ||
    contentDigest(record.input_digest).value !== contentDigest(request.context_digest).value || contentDigest(context.input_digest).value !== contentDigest(request.context_digest).value ||
    contentDigest(runContextDigest(context)).value !== contentDigest(request.context_digest).value ||
    [record, context].some(value => ["definition_ref", "contract_ref", "plan_ref"] .some(key =>
      contentDigest(value[key as "definition_ref"]).value !== contentDigest(task[key as "definition_ref"]).value)) ||
    contentDigest(record.source_snapshot_ref).value !== contentDigest(context.source_snapshot_ref).value ||
    contentDigest(record.workspace_before_ref).value !== contentDigest(context.workspace_snapshot_ref).value ||
    contentDigest(context.allowed_actions).value !== contentDigest(item.allowed_actions).value || contentDigest(context.allowed_resources).value !== contentDigest(item.allowed_resources).value) return deny("RUN_BINDING_MISMATCH");
  if (!["Reserved", "Running"].includes(run.status) || run.cancel_requested || run.reservation_released || !run.cost_known || task.active_run_ref?.id !== run.id ||
    reader.listRuns(task.change_id).some(other => other.task_id === task.id && other.id !== run.id && !runIsSettled(other))) return deny("RUN_NOT_ACTIVE");
  const reasons = activeToolScopeProblems(reader, task, item, now);
  if (!resourceIsBounded(request.resource) || request.resource.includes("*") || !item.allowed_actions.includes(request.action) ||
    !item.allowed_resources.some(bound => resourceContains(bound, request.resource)) ||
    (context.boundary === "manual_independent_read_only" && request.action !== "read_files")) reasons.push("TOOL_OUTSIDE_WORK_ITEM");
  if (reasons.length) return deny(...reasons);
  return { ...base, decision: "ALLOW", reasons: [], authority: { change_id: task.change_id, task_id: task.id, work_item_id: item.id,
    run_record_id: record.id, context_id: context.id, basis_digest: contentDigest({ request, record, context,
      work_item: { id: item.id, task_id: item.task_id, definition_ref: item.definition_ref, contract_ref: item.contract_ref, plan_ref: item.plan_ref,
        executor_ref: item.executor_ref, authorization_basis_refs: item.authorization_basis_refs, allowed_actions: item.allowed_actions,
        allowed_resources: item.allowed_resources, budget: item.budget, stop_conditions: item.stop_conditions } }) } };
};
