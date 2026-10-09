import { compileValidator, DigestSchema, AgentToolAuthorityRequestSchema, type Digest, type AgentToolAuthorityRequest, type AgentToolAuthorityAssessment } from "@cimiloop/protocol/v2";
import type { ProjectReader } from "@cimiloop/store";
import type { CallerContext } from "./authorization.js";
import { contentDigest } from "./intent.js";
import { originalAgentRunAuthority } from "./agent-run-authority.js";
import type { AgentRunLaunchRequest, RunVerifierPort } from "./runs.js";
export type AgentRunLaunchAssessment = Omit<AgentToolAuthorityAssessment, "scope" | "request"> & {
  scope: "agent_run_launch_assessment"; request: AgentRunLaunchRequest;
};
const keys = ["project_id", "run_id", "operation_key", "executor_actor_id", "context_digest", "runtime_binding", "skill_bindings", "host_admission_ref"];
export const parseAgentRunLaunchRequest = (input: unknown): AgentRunLaunchRequest => {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).sort().join(",") !== [...keys].sort().join(",")) throw Error("Invalid original launch scope");
  // Reuse strict validation of the existing pin fields; dummy tool fields are
  // removed immediately and never grant permission or become launch inputs.
  const { action: _action, resource: _resource, ...request } = compileValidator<AgentToolAuthorityRequest>(AgentToolAuthorityRequestSchema)(
    { ...structuredClone(input), action: "read_files", resource: "launch-validation-marker" });
  return structuredClone(request);
};
export const assessAgentRunLaunch = (reader: ProjectReader, request: AgentRunLaunchRequest, caller: CallerContext | undefined,
  now: string, host?: RunVerifierPort): Omit<AgentRunLaunchAssessment, "as_of_event_sequence"> => {
  const base = { schema_version: "2.0.0" as const, scope: "agent_run_launch_assessment" as const, request, assessed_at: now };
  const deny = (...reasons: string[]) => ({ ...base, decision: "DENY" as const, authority: null, reasons: [...new Set(reasons)].slice(0, 32) });
  const original = originalAgentRunAuthority(reader, request, caller, now);
  if (!original.facts) return deny(...original.reasons);
  const { project, record, context, task, item, source, workspace, runtime, skills } = original.facts;
  if (!host?.agent?.checkRunAuthority) return deny("AGENT_LAUNCH_HOST_UNAVAILABLE");
  let validation: Digest;
  try {
    if (!host.sourceIsCurrent(structuredClone(project), structuredClone(source)) || !host.workspaceIsCurrent(structuredClone(project), structuredClone(workspace)))
      return deny("LAUNCH_SOURCE_OR_WORKSPACE_CHANGED");
    validation = structuredClone(compileValidator<Digest>(DigestSchema)(host.agent.checkRunAuthority(structuredClone(project), structuredClone({ request, record, context, task,
      work_item: item, source, workspace, runtime_binding: request.runtime_binding, skill_bindings: request.skill_bindings, runtime, skills }))));
  } catch { return deny("AGENT_LAUNCH_HOST_PROOF_UNPROVEN"); }
  return { ...base, decision: "ALLOW", reasons: [], authority: { change_id: task.change_id, task_id: task.id, work_item_id: item.id, run_record_id: record.id,
    context_id: context.id, host_admission_ref: structuredClone(record.host_admission_ref), host_validation_digest: validation,
    basis_digest: contentDigest({ request, record, context, task, work_item: item, source, workspace, runtime, skills, host_validation_digest: validation }) } };
};
