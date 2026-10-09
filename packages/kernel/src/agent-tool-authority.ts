import { compileValidator, DigestSchema, WorkspaceToolResourceGrantSchema, type Digest, type WorkspaceToolResourceGrant, type AgentToolAuthorityRequest, type AgentToolAuthorityAssessment } from "@cimiloop/protocol/v2";
import type { ProjectReader } from "@cimiloop/store";
import type { CallerContext } from "./authorization.js";
import { resourceContains, resourceIsBounded } from "./execution.js";
import { contentDigest } from "./intent.js";
import type { AgentRunVerifierPort } from "./runs.js";
import { originalAgentRunAuthority } from "./agent-run-authority.js";
const resourceGrant = compileValidator<WorkspaceToolResourceGrant>(WorkspaceToolResourceGrantSchema);
type Body = Omit<AgentToolAuthorityAssessment, "as_of_event_sequence">;
export const assessAgentToolAuthority = (reader: ProjectReader, request: AgentToolAuthorityRequest, caller: CallerContext | undefined, now: string, host?: AgentRunVerifierPort): Body => {
  const base = { schema_version: "2.0.0" as const, scope: "agent_run_tool_assessment" as const, request, assessed_at: now };
  const deny = (...reasons: string[]): Body => ({ ...base, decision: "DENY", authority: null, reasons: [...new Set(reasons)].slice(0, 32) });
  const original = originalAgentRunAuthority(reader, request, caller, now);
  if (!original.facts) return deny(...original.reasons);
  const { project, record, item, task, context, source, workspace, runtime, skills } = original.facts;
  if (!resourceIsBounded(request.resource) || request.resource.includes("*") || request.resource.split("/").some(part => [".git", ".cimiloop"].includes(part.toLowerCase())) ||
    !item.allowed_actions.includes(request.action) || !item.allowed_resources.some(bound => resourceContains(bound, request.resource)) ||
    !runtime?.effective_permissions.actions.includes(request.action) || !runtime.effective_permissions.resources.some(bound => { try { return resourceContains(resourceGrant(bound).locator, request.resource); } catch { return false; } }) ||
    (context.boundary === "agent_independent_read_only" && request.action !== "read_files")) return deny("TOOL_OUTSIDE_WORK_ITEM_OR_PROVIDER");
  if (!host?.checkToolAuthority) return deny("AGENT_TOOL_HOST_UNAVAILABLE");
  let validation: Digest;
  try { validation = structuredClone(compileValidator<Digest>(DigestSchema)(host.checkToolAuthority(structuredClone(project), structuredClone({ request, record, context, task, work_item: item,
    source: source!, workspace: workspace!, runtime_binding: request.runtime_binding, skill_bindings: request.skill_bindings, runtime: runtime!, skills: skills.filter((value): value is NonNullable<typeof value> => !!value) })))); }
  catch { return deny("AGENT_TOOL_HOST_PROOF_UNPROVEN"); }
  return { ...base, decision: "ALLOW", reasons: [], authority: { change_id: task.change_id, task_id: task.id, work_item_id: item.id, run_record_id: record.id,
    context_id: context.id, host_admission_ref: structuredClone(record.host_admission_ref), host_validation_digest: validation,
    basis_digest: contentDigest({ request, record, context, work_item: item, runtime, skills, host_validation_digest: validation }) } };
};
