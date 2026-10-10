import type { ProjectReader } from "@cimiloop/store";
import { callerMatchesActor, type CallerContext } from "./authorization.js";
import { activeToolScopeProblems } from "./execution.js";
import { contentDigest } from "./intent.js";
import { agentRunBindingBlockers } from "./agent-runs.js";
import { runContextDigest, runIsSettled, type AgentRunLaunchRequest } from "./runs.js";
import type { SkillInvocation } from "@cimiloop/protocol/v2";
import { skillInvocationInputDigest, runSkillInvocationFacts } from "./skill-invocation-facts.js";
const same = (a: unknown, b: unknown) => contentDigest(a).value === contentDigest(b).value;
export const originalAgentRunAuthority = (reader: ProjectReader, request: AgentRunLaunchRequest, caller: CallerContext | undefined, now: string, permittedChild?: SkillInvocation) => {
  const project = reader.getProject(), actor = reader.getActor(request.executor_actor_id);
  if (!project || project.id !== request.project_id || !caller || caller.kind !== "agent" || !actor || !callerMatchesActor(caller, actor)) return { reasons: ["CALLER_IDENTITY_MISMATCH"] };
  const run = reader.getRun(request.run_id), record = run && reader.getRuntimeRecord("run_record", run.record_ref.id), item = run && reader.getExecutionObject("work_item", run.work_item_ref.id);
  const task = item && reader.getExecutionObject("task", item.task_id), context = record && reader.getRuntimeRecord("context_manifest", record.context_ref.id);
  if (!run || !record || !item || !task || !context) return { reasons: ["RUN_CONTEXT_REQUIRED"] };
  if (record.run_kind !== "agent" || !("runtime_binding" in context) || actor.actor_type !== "agent" ||
    [run, record, item, task, context].some(value => value.project_id !== project.id || value.change_id !== task.change_id) ||
    run.task_id !== task.id || record.run_id !== run.id || record.task_id !== task.id || context.task_id !== task.id ||
    record.work_item_ref.id !== item.id || context.work_item_ref.id !== item.id || record.operation_key !== request.operation_key ||
    [record, item, context].some(value => value.executor_ref.id !== actor.id) || !same(record.input_digest, request.context_digest) || !same(context.input_digest, request.context_digest) ||
    !same(runContextDigest(context), request.context_digest) || [record, context].some(value => ["definition_ref", "contract_ref", "plan_ref"].some(key => !same(value[key as "definition_ref"], task[key as "definition_ref"]))) ||
    !same(record.source_snapshot_ref, context.source_snapshot_ref) || !same(record.workspace_before_ref, context.workspace_snapshot_ref) ||
    !same(context.allowed_actions, item.allowed_actions) || !same(context.allowed_resources, item.allowed_resources) ||
    [record, context].some(value => !same(value.runtime_binding, request.runtime_binding) || !same(value.skill_bindings, request.skill_bindings) || !same(value.host_admission_ref, request.host_admission_ref))) return { reasons: ["RUN_BINDING_MISMATCH"] };
  if (!["Reserved", "Running"].includes(run.status) || run.cancel_requested || run.reservation_released || !run.cost_known || task.active_run_ref?.id !== run.id ||
    reader.listRuns(task.change_id).some(other => other.task_id === task.id && other.id !== run.id && !runIsSettled(other))) return { reasons: ["RUN_NOT_ACTIVE"] };
  const problems = [...activeToolScopeProblems(reader, task, item, now), ...agentRunBindingBlockers(reader, project, actor, item, request, now)];
  const runtime = reader.getProviderBinding(request.runtime_binding.binding_ref.id), skills = request.skill_bindings.map(pin => reader.getProviderBinding(pin.binding_ref.id));
  // A parent request cannot bypass the narrower permissions/current method of
  // an unresolved child. Skill-scoped transport will have its own original pin.
  const children = runSkillInvocationFacts(reader, run).unresolved;
  if (permittedChild) {
    // Only this exact stored child can cross the child-specific authority path.
    // Parent callers never supply this parameter, so their guard stays closed.
    if (children.length !== 1 || !same(children[0]!.invocation, permittedChild) ||
      !same(permittedChild.input_digest, skillInvocationInputDigest(permittedChild)) ||
      permittedChild.project_id !== project.id || permittedChild.change_id !== task.change_id || permittedChild.task_id !== task.id ||
      permittedChild.run_ref.id !== run.id || permittedChild.run_operation_key !== record.operation_key || permittedChild.context_ref.id !== context.id ||
      permittedChild.executor_ref.id !== actor.id || permittedChild.producer_actor_id !== actor.id || !same(permittedChild.work_item_ref, record.work_item_ref) ||
      !same(permittedChild.runtime_binding, record.runtime_binding) || !same(permittedChild.host_admission_ref, record.host_admission_ref) ||
      ['definition_ref', 'contract_ref', 'plan_ref'].some(key => !same(permittedChild[key as 'definition_ref'], record[key as 'definition_ref'])) ||
      !context.skill_bindings.some(pin => same(pin, permittedChild.skill_binding))) problems.push('SKILL_TOOL_CONTEXT_UNAVAILABLE');
  } else if (children.length) problems.push('SKILL_TOOL_CONTEXT_UNAVAILABLE');
  const source = reader.getVerificationRecord("source_snapshot", context.source_snapshot_ref.id), workspace = reader.getRuntimeRecord("workspace_snapshot", context.workspace_snapshot_ref.id);
  if (!source || !workspace || source.project_id !== project.id || source.change_id !== task.change_id || source.repository_ref.id !== project.id || workspace.project_id !== project.id ||
    workspace.change_id !== task.change_id || workspace.task_id !== task.id || workspace.work_item_ref.id !== item.id || !same(workspace.source_snapshot_ref, context.source_snapshot_ref) ||
    ["definition_ref", "contract_ref", "plan_ref"].some(key => !same(workspace[key as "definition_ref"], task[key as "definition_ref"]))) problems.push("ORIGINAL_SOURCE_OR_WORKSPACE_MISSING");
  if (record.reserved_cost_micros <= 0 || !item.budget.max_cost || record.cost_currency !== item.budget.max_cost.currency) problems.push("AGENT_COST_RESERVATION_UNPROVEN");
  if (problems.length) return { reasons: [...new Set(problems)].slice(0, 32) };
  return { facts: { project, actor, run, record, item, task, context, source: source!, workspace: workspace!, runtime: runtime!, skills: skills.filter((value): value is NonNullable<typeof value> => !!value) } };
};
