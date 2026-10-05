import { describe, expect, it } from "vitest";
import { compileValidator, createInternalId, ProtocolValidationError, ToolAuthorityRequestSchema, ToolAuthorityAssessmentSchema } from "../src/v2/index.js";
const request = () => ({ project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(),
  context_digest: { algorithm: "sha256", value: "a".repeat(64) }, action: "read_files", resource: "src/query.ts" });
describe("independent native Human tool authority query schemas", () => {
  it("validates strict requests and refuses foreign fields, action or identity", () => {
    const parse = compileValidator(ToolAuthorityRequestSchema), input = request(); expect(parse(input)).toEqual(input);
    for (const extra of [{ shell: "inert" }, { action: "execute_shell" }, { executor_actor_id: "self-reported" }, { context_digest: { ...input.context_digest, approval: true } }]) expect(() => parse({ ...input, ...extra })).toThrow(ProtocolValidationError);
  });
  it("cannot mix a denial with authority or present a Human query as formal Agent admission", () => {
    const parse = compileValidator(ToolAuthorityAssessmentSchema), input = { schema_version: "2.0.0", scope: "human_run_tool_assessment", request: request(), assessed_at: "2026-10-05T00:00:00.000Z",
      as_of_event_sequence: 1, formal_agent_execution_enabled: false, decision: "DENY", reasons: ["RUN_NOT_ACTIVE"], authority: null };
    expect(parse(input)).toEqual(input);
    for (const extra of [{ decision: "ALLOW" }, { reasons: [] }, { formal_agent_execution_enabled: true }, { authority: {} }, { admission_ready: true }]) expect(() => parse({ ...input, ...extra })).toThrow(ProtocolValidationError);
  });
});
