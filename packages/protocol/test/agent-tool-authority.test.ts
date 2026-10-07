import { describe, it, expect } from "vitest";
import * as v2 from "../src/v2/index.js";
const digest = { algorithm: "sha256" as const, value: "a".repeat(64) };
const request = (): v2.AgentToolAuthorityRequest => ({ project_id: v2.createInternalId(), run_id: v2.createInternalId(), operation_key: v2.createInternalId(), executor_actor_id: v2.createInternalId(),
  context_digest: digest, action: "read_files", resource: "src/query.ts", runtime_binding: { binding_ref: { object_type: "provider_binding", id: v2.createInternalId() }, digest }, skill_bindings: [],
  host_admission_ref: { provider: "local_content", resource_type: "agent_host_admission", locator: digest.value, digest } });
describe("independent Agent original tool authority contracts", () => {
  it("requires exact original Agent pins and rejects imported admission flags or Human contracts", () => {
    const parse = v2.compileValidator(v2.AgentToolAuthorityRequestSchema), input = request(); expect(parse(input)).toEqual(input);
    for (const value of [{ ...input, host_admission_ref: undefined }, { ...input, runtime_binding: undefined }, { ...input, verified: true }, { ...input, skill_invocation_ref: null },
      { ...input, runtime_binding: { ...input.runtime_binding, effective_permissions: {} } }]) expect(() => parse(value)).toThrow(v2.ProtocolValidationError);
    expect(() => v2.compileValidator(v2.ToolAuthorityRequestSchema)(input)).toThrow(v2.ProtocolValidationError);
  });
  it("cannot mix denied authority, fabricated host proof or Human formal-execution flags", () => {
    const parse = v2.compileValidator(v2.AgentToolAuthorityAssessmentSchema), input = { schema_version: "2.0.0", scope: "agent_run_tool_assessment", request: request(), assessed_at: "2026-10-07T00:00:00.000Z", as_of_event_sequence: 0,
      decision: "DENY", reasons: ["AGENT_TOOL_HOST_UNAVAILABLE"], authority: null };
    expect(parse(input)).toEqual(input);
    for (const value of [{ ...input, decision: "ALLOW" }, { ...input, reasons: [] }, { ...input, formal_agent_execution_enabled: true }, { ...input, scope: "human_run_tool_assessment" }]) expect(() => parse(value)).toThrow(v2.ProtocolValidationError);
    const allowed = { ...input, decision: "ALLOW", reasons: [], authority: { change_id: v2.createInternalId(), task_id: v2.createInternalId(), work_item_id: v2.createInternalId(), run_record_id: v2.createInternalId(),
      context_id: v2.createInternalId(), host_admission_ref: input.request.host_admission_ref, host_validation_digest: digest, basis_digest: digest } };
    expect(parse(allowed)).toEqual(allowed); expect(() => parse({ ...allowed, authority: { ...allowed.authority, host_validation_digest: undefined } })).toThrow(v2.ProtocolValidationError);
  });
  it("accepts only the versioned workspace permission namespace, with no file-content proof or arbitrary provider", () => {
    const parse = v2.compileValidator(v2.WorkspaceToolResourceGrantSchema), input = { provider: "cimiloop_workspace", resource_type: "repository_path", locator: "src/**", version: "1.0.0" }; expect(parse(input)).toEqual(input);
    for (const extra of [{ provider: "fixture" }, { resource_type: "url" }, { version: "2.0.0" }, { digest }, { execute_shell: true }]) expect(() => parse({ ...input, ...extra })).toThrow(v2.ProtocolValidationError);
  });
});
