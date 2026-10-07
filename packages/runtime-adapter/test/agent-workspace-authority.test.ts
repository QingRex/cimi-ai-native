import { isDeepStrictEqual } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId, type AgentToolAuthorityAssessment, type ToolAuthorityAssessment } from "@cimiloop/protocol/v2";
import { digest } from "../src/files.js";
import { parseAgentWorkspaceToolScope, agentWorkspaceToolAuthorityRequest, parseAgentToolAssessment } from "../src/agent-workspace-authority.js";
import { parseWorkspaceToolInvocation } from "../src/workspace-files.js";
import { WorkspaceToolJournal, WORKSPACE_TOOL_SLOT_BYTES, workspaceToolAuthorityRequest, type WorkspaceToolPolicy } from "../src/workspace-tool-journal.js";

// Constructed permission/owner inputs only. Actual Kernel/Windows effects live
// in agent-workspace-tool-runtime.test; these tests grant no Runtime admission.
describe("independent Agent workspace authority and shared effect barriers", () => {
  const roots: string[] = [], journals: WorkspaceToolJournal[] = [];
  afterEach(() => { while (journals.length) journals.pop()!.close(); while (roots.length) { const root = roots.pop()!;
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-agent-workspace-contract-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); } });
  const fixture = () => {
    const input = parseWorkspaceToolInvocation({ format: "cimiloop/workspace-tool-invocation/1.0.0", project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(),
      executor_actor_id: createInternalId(), context_digest: digest("constructed pinned context"), call_id: "original", tool: "read_file", path: "src/query.ts", expected_digest: digest("original\n").value });
    const scope = parseAgentWorkspaceToolScope({ project_id: input.project_id, run_id: input.run_id, operation_key: input.operation_key, executor_actor_id: input.executor_actor_id, context_digest: input.context_digest,
      runtime_binding: { binding_ref: { object_type: "provider_binding", id: createInternalId() }, digest: digest("runtime") }, skill_bindings: [],
      host_admission_ref: { provider: "local_content", resource_type: "agent_host_admission", locator: digest("admission").value, digest: digest("admission") } });
    const request = agentWorkspaceToolAuthorityRequest(scope, input);
    const assessment: AgentToolAuthorityAssessment = { schema_version: "2.0.0", scope: "agent_run_tool_assessment", request, assessed_at: "2026-10-07T00:00:00.000Z", as_of_event_sequence: 1,
      decision: "ALLOW", reasons: [], authority: { change_id: createInternalId(), task_id: createInternalId(), work_item_id: createInternalId(), run_record_id: createInternalId(), context_id: createInternalId(),
        host_admission_ref: scope.host_admission_ref, host_validation_digest: digest("constructed current host"), basis_digest: digest("constructed Agent basis") } };
    return { input, scope, request, assessment };
  };
  it("pins the entire original Agent scope, rejects extra frames and never accepts Human or foreign assessments", () => {
    const f = fixture(); expect(parseAgentToolAssessment(f.assessment, f.request)).toEqual(f.assessment);
    const copy = parseAgentWorkspaceToolScope(f.scope); copy.runtime_binding.digest.value = "a".repeat(64); expect(isDeepStrictEqual(copy, f.scope)).toBe(false);
    for (const value of [{ ...f.scope, action: "read_files" }, { ...f.scope, caller: {} }, { ...f.scope, host_admission_ref: undefined }]) expect(() => parseAgentWorkspaceToolScope(value)).toThrow("agent_workspace_scope_invalid");
    for (const fields of [{ run_id: createInternalId() }, { operation_key: createInternalId() }, { executor_actor_id: createInternalId() }, { context_digest: digest("foreign") }])
      expect(() => agentWorkspaceToolAuthorityRequest(f.scope, { ...f.input, ...fields })).toThrow("agent_workspace_run_mismatch");
    for (const fields of [{ resource: "other.ts" }, { runtime_binding: { ...f.scope.runtime_binding, digest: digest("foreign") } }, { host_admission_ref: { ...f.scope.host_admission_ref, locator: "a".repeat(64) } }])
      expect(() => parseAgentToolAssessment({ ...f.assessment, request: { ...f.request, ...fields } }, f.request)).toThrow("tool_authority_unproven");
    expect(() => parseAgentToolAssessment({ ...f.assessment, scope: "human_run_tool_assessment", formal_agent_execution_enabled: false }, f.request)).toThrow("tool_authority_unproven");
    if (f.assessment.decision !== "ALLOW") throw Error("Constructed allowance expected");
    expect(() => parseAgentToolAssessment({ ...f.assessment, authority: { ...f.assessment.authority, host_admission_ref: { ...f.scope.host_admission_ref, locator: "a".repeat(64) } } }, f.request)).toThrow("tool_authority_unproven");
    expect(() => parseAgentToolAssessment({ ...f.assessment, decision: "DENY", reasons: ["Unproven host"], authority: null }, f.request)).toThrow("tool_authority_denied");
    const executable = Object.defineProperty({}, "scope", { enumerable: true, get() { throw Error("Getter must not execute"); } }); expect(() => parseAgentToolAssessment(executable, f.request)).toThrow("tool_authority_unproven");
  });
  it("does not reinterpret an Agent assessment as Human and preserves the same Unknown barrier for both entrances", () => {
    const f = fixture(), root = mkdtempSync(join(tmpdir(), "cimiloop-agent-workspace-contract-")); roots.push(root);
    const policy: WorkspaceToolPolicy = { format: "cimiloop/workspace-tool-journal/1.0.0", scope: "authorized_workspace", project_id: f.input.project_id,
      repository_path_digest: digest(root).value, root_identity: { volume_serial: "12345678", file_index: "0000000000000001" }, scope_digest: digest("scope").value,
      maximum_entries: 8, maximum_bytes: 8 * WORKSPACE_TOOL_SLOT_BYTES };
    const journal = new WorkspaceToolJournal(join(root, "tools.sqlite"), policy, { identity: { pid: process.pid, creation_ticks: "1", image: process.execPath } }); journals.push(journal);
    expect(() => journal.claim(f.input, f.assessment)).toThrow("tool_authority_unproven"); expect(journal.facts().invocations).toBe(0);
    const claim = journal.claimAgent(f.input, f.scope, f.assessment); if (!claim.permit) throw Error("Expected original permit");
    journal.prepare(claim.permit, { format: "cimiloop/workspace-native/1.0.0", phase: "prepared", nonce: "12345678-1234-1234-1234-123456789012", input_digest: digest(JSON.stringify(f.input)).value,
      root_identity: policy.root_identity, file_identity: { volume_serial: "12345678", file_index: "0000000000000002" }, replacement_identity: null,
      before_digest: f.input.expected_digest, worker: { pid: process.pid, creation_ticks: "2", image: process.execPath } }); journal.dispatch(claim.permit); journal.stop(claim.permit, true);
    const humanInput = { ...f.input, run_id: createInternalId(), executor_actor_id: createInternalId(), call_id: "human" };
    const human: ToolAuthorityAssessment = { schema_version: "2.0.0", scope: "human_run_tool_assessment", request: workspaceToolAuthorityRequest(humanInput), assessed_at: f.assessment.assessed_at,
      as_of_event_sequence: 1, formal_agent_execution_enabled: false, decision: "ALLOW", reasons: [], authority: { change_id: createInternalId(), task_id: createInternalId(), work_item_id: createInternalId(),
        run_record_id: createInternalId(), context_id: createInternalId(), basis_digest: digest("constructed Human authority") } };
    expect(() => journal.claim(humanInput, human)).toThrow("workspace_tool_effect_in_flight");
    expect(() => journal.claimAgent(f.input, f.scope, human)).toThrow("tool_authority_unproven");
    expect(() => journal.claimAgent(f.input, f.scope, f.assessment)).toThrow("workspace_tool_outcome_unproven");
    expect(journal.facts()).toMatchObject({ invocations: 1, unresolved: 1, states: { unknown: 1 } });
  });
});
