import { compileValidator, DigestSchema, WorkspaceToolResourceGrantSchema, type Digest, type WorkspaceToolResourceGrant, type AgentToolAuthorityRequest, type AgentToolAuthorityAssessment } from "@cimiloop/protocol/v2";
import type { ProjectReader } from "@cimiloop/store";
import { callerMatchesActor, type CallerContext } from "./authorization.js";
import { activeToolScopeProblems, resourceContains, resourceIsBounded } from "./execution.js";
import { contentDigest } from "./intent.js";
import { agentRunBindingBlockers } from "./agent-runs.js";
import { runContextDigest, runIsSettled, type AgentRunVerifierPort } from "./runs.js";
import { runSkillInvocationFacts } from "./skill-invocation-facts.js";
const same = (a: unknown, b: unknown) => contentDigest(a).value === contentDigest(b).value;
const resourceGrant = compileValidator<WorkspaceToolResourceGrant>(WorkspaceToolResourceGrantSchema);
type Body = Omit<AgentToolAuthorityAssessment, "as_of_event_sequence">;
export const assessAgentToolAuthority = (reader: ProjectReader, request: AgentToolAuthorityRequest, caller: CallerContext | undefined, now: string, host?: AgentRunVerifierPort): Body => {
  const base = { schema_version: "2.0.0" as const, scope: "agent_run_tool_assessment" as const, request, assessed_at: now };
  const deny = (...reasons: string[]): Body => ({ ...base, decision: "DENY", authority: null, reasons: [...new Set(reasons)].slice(0, 32) });
  const project = reader.getProject(), actor = reader.getActor(request.executor_actor_id);
  if (!project || project.id !== request.project_id || !caller || caller.kind !== "agent" || !actor || !callerMatchesActor(caller, actor)) return deny("CALLER_IDENTITY_MISMATCH");
  const run = reader.getRun(request.run_id), record = run && reader.getRuntimeRecord("run_record", run.record_ref.id), item = run && reader.getExecutionObject("work_item", run.work_item_ref.id);
  const task = item && reader.getExecutionObject("task", item.task_id), context = record && reader.getRuntimeRecord("context_manifest", record.context_ref.id);
  if (!run || !record || !item || !task || !context) return deny("RUN_CONTEXT_REQUIRED");
  if (record.run_kind !== "agent" || !("runtime_binding" in context) || actor.actor_type !== "agent" ||
    [run, record, item, task, context].some(value => value.project_id !== project.id || value.change_id !== task.change_id) ||
    run.task_id !== task.id || record.run_id !== run.id || record.task_id !== task.id || context.task_id !== task.id ||
    record.work_item_ref.id !== item.id || context.work_item_ref.id !== item.id || record.operation_key !== request.operation_key ||
    [record, item, context].some(value => value.executor_ref.id !== actor.id) || !same(record.input_digest, request.context_digest) || !same(context.input_digest, request.context_digest) ||
    !same(runContextDigest(context), request.context_digest) || [record, context].some(value => ["definition_ref", "contract_ref", "plan_ref"].some(key => !same(value[key as "definition_ref"], task[key as "definition_ref"]))) ||
    !same(record.source_snapshot_ref, context.source_snapshot_ref) || !same(record.workspace_before_ref, context.workspace_snapshot_ref) ||
    !same(context.allowed_actions, item.allowed_actions) || !same(context.allowed_resources, item.allowed_resources) ||
    [record, context].some(value => !same(value.runtime_binding, request.runtime_binding) || !same(value.skill_bindings, request.skill_bindings) || !same(value.host_admission_ref, request.host_admission_ref))) return deny("RUN_BINDING_MISMATCH");
  if (!["Reserved", "Running"].includes(run.status) || run.cancel_requested || run.reservation_released || !run.cost_known || task.active_run_ref?.id !== run.id ||
    reader.listRuns(task.change_id).some(other => other.task_id === task.id && other.id !== run.id && !runIsSettled(other))) return deny("RUN_NOT_ACTIVE");
  const problems = [...activeToolScopeProblems(reader, task, item, now), ...agentRunBindingBlockers(reader, project, actor, item, request, now)];
  const runtime = reader.getProviderBinding(request.runtime_binding.binding_ref.id), skills = request.skill_bindings.map(pin => reader.getProviderBinding(pin.binding_ref.id));
  if (!resourceIsBounded(request.resource) || request.resource.includes("*") || request.resource.split("/").some(part => [".git", ".cimiloop"].includes(part.toLowerCase())) ||
    !item.allowed_actions.includes(request.action) || !item.allowed_resources.some(bound => resourceContains(bound, request.resource)) ||
    !runtime?.effective_permissions.actions.includes(request.action) || !runtime.effective_permissions.resources.some(bound => { try { return resourceContains(resourceGrant(bound).locator, request.resource); } catch { return false; } }) ||
    (context.boundary === "agent_independent_read_only" && request.action !== "read_files")) problems.push("TOOL_OUTSIDE_WORK_ITEM_OR_PROVIDER");
  // A parent request cannot bypass the narrower permissions/current method of
  // an unresolved child. Skill-scoped transport will have its own original pin.
  if (runSkillInvocationFacts(reader, run).unresolved.length) problems.push("SKILL_TOOL_CONTEXT_UNAVAILABLE");
  const source = reader.getVerificationRecord("source_snapshot", context.source_snapshot_ref.id), workspace = reader.getRuntimeRecord("workspace_snapshot", context.workspace_snapshot_ref.id);
  if (!source || !workspace || source.project_id !== project.id || source.change_id !== task.change_id || source.repository_ref.id !== project.id || workspace.project_id !== project.id ||
    workspace.change_id !== task.change_id || workspace.task_id !== task.id || workspace.work_item_ref.id !== item.id || !same(workspace.source_snapshot_ref, context.source_snapshot_ref) ||
    ["definition_ref", "contract_ref", "plan_ref"].some(key => !same(workspace[key as "definition_ref"], task[key as "definition_ref"]))) problems.push("ORIGINAL_SOURCE_OR_WORKSPACE_MISSING");
  if (record.reserved_cost_micros <= 0 || !item.budget.max_cost || record.cost_currency !== item.budget.max_cost.currency) problems.push("AGENT_COST_RESERVATION_UNPROVEN");
  if (problems.length) return deny(...problems);
  if (!host?.checkToolAuthority) return deny("AGENT_TOOL_HOST_UNAVAILABLE");
  let validation: Digest;
  try { validation = structuredClone(compileValidator<Digest>(DigestSchema)(host.checkToolAuthority(structuredClone(project), structuredClone({ request, record, context, task, work_item: item,
    source: source!, workspace: workspace!, runtime_binding: request.runtime_binding, skill_bindings: request.skill_bindings, runtime: runtime!, skills: skills.filter((value): value is NonNullable<typeof value> => !!value) })))); }
  catch { return deny("AGENT_TOOL_HOST_PROOF_UNPROVEN"); }
  return { ...base, decision: "ALLOW", reasons: [], authority: { change_id: task.change_id, task_id: task.id, work_item_id: item.id, run_record_id: record.id,
    context_id: context.id, host_admission_ref: structuredClone(record.host_admission_ref), host_validation_digest: validation,
    basis_digest: contentDigest({ request, record, context, work_item: item, runtime, skills, host_validation_digest: validation }) } };
};
