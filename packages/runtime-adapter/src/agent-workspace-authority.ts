import { isDeepStrictEqual } from "node:util";
import { compileValidator, AgentToolAuthorityRequestSchema, AgentToolAuthorityAssessmentSchema,
  type AgentToolAuthorityRequest, type AgentToolAuthorityAssessment } from "@cimiloop/protocol/v2";
import { copyToolJson } from "./tool-journal.js";
import { parseWorkspaceToolInvocation, type WorkspaceToolInvocation } from "./workspace-files.js";
import { RuntimeAdapterError } from "./files.js";

// Installed once from the original Native Agent Run by a trusted composition;
// tool frames contain neither these pins nor a selectable caller/assessment.
export type AgentWorkspaceToolScope = Omit<AgentToolAuthorityRequest, "action" | "resource">;
const requestParser = compileValidator<AgentToolAuthorityRequest>(AgentToolAuthorityRequestSchema);
const assessmentParser = compileValidator<AgentToolAuthorityAssessment>(AgentToolAuthorityAssessmentSchema);
export function parseAgentWorkspaceToolScope(raw: unknown): AgentWorkspaceToolScope {
  try {
    const value = copyToolJson(raw);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !==
      "context_digest,executor_actor_id,host_admission_ref,operation_key,project_id,run_id,runtime_binding,skill_bindings") throw Error("Original scope fields required");
    const { action: _action, resource: _resource, ...scope } = requestParser({ ...value, action: "read_files", resource: "scope-validation" });
    return structuredClone(scope);
  } catch { throw new RuntimeAdapterError("agent_workspace_scope_invalid"); }
}
export function agentWorkspaceToolAuthorityRequest(scope: AgentWorkspaceToolScope, raw: WorkspaceToolInvocation): AgentToolAuthorityRequest {
  const original = parseAgentWorkspaceToolScope(scope), input = parseWorkspaceToolInvocation(raw);
  if (["project_id", "run_id", "operation_key", "executor_actor_id"].some(key => input[key as "run_id"] !== original[key as "run_id"]) ||
    !isDeepStrictEqual(input.context_digest, original.context_digest)) throw new RuntimeAdapterError("agent_workspace_run_mismatch");
  return requestParser({ ...original, action: input.tool === "read_file" ? "read_files" : "edit_files", resource: input.path });
}
export function parseAgentToolAssessment(raw: unknown, request: AgentToolAuthorityRequest): AgentToolAuthorityAssessment {
  let result: AgentToolAuthorityAssessment;
  try { result = assessmentParser(copyToolJson(raw)); if (!isDeepStrictEqual(result.request, request) ||
    result.decision === "ALLOW" && !isDeepStrictEqual(result.authority.host_admission_ref, request.host_admission_ref)) throw Error("Original request/admission mismatch"); }
  catch { throw new RuntimeAdapterError("tool_authority_unproven"); }
  if (result.decision !== "ALLOW") throw new RuntimeAdapterError("tool_authority_denied");
  return result;
}
