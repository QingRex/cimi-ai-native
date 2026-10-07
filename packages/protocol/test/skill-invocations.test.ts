import { expect, it } from "vitest";
import * as v2 from "../src/v2/index.js";
const id = () => v2.createInternalId(), hash = { algorithm: "sha256", value: "a".repeat(64) };
const ref = (object_type: string) => ({ object_type, id: id() });
const report = { format: "cimiloop/skill-invocation/1.0.0", invocation_ref: ref("skill_invocation"), invocation_key: id(),
  run_ref: ref("run"), run_operation_key: id(), producer_actor_id: id(), input_digest: hash, observed_at: "2026-10-07T00:00:00.000Z",
  basis: "direct_observation", usage: { cost_known: true, cost_micros: 10, currency: "USD" }, resolves_observation_refs: [],
  result_proof_ref: { provider: "local_content", resource_type: "skill_invocation_proof", locator: hash.value, digest: hash } };
it("requires strict method output for success and excludes authority fields and output from non-success observations", () => {
  const parse = v2.compileValidator(v2.RawSkillInvocationObservationSchema);
  const valid = { ...report, status: "succeeded", output: { purpose: "review", findings: [], limitations: [] } };
  expect(parse(valid)).toEqual(valid); expect(() => parse({ ...report, status: "succeeded" })).toThrow();
  expect(() => parse({ ...valid, output: { ...valid.output, task_status: "Satisfied" } })).toThrow();
  expect(() => parse({ ...valid, status: "unknown" })).toThrow();
  expect(parse({ ...report, status: "unknown", usage: { cost_known: false } })).toMatchObject({ usage: { cost_known: false } });
  expect(() => parse({ ...report, status: "unknown", usage: { cost_known: false, cost_micros: 0 } })).toThrow();
});
it("lets only the host assign original invocation keys, qualification, packages and binding digests", () => {
  const command = { schema_version: "2.0.0", command_id: id(), correlation_id: id(), requested_at: report.observed_at,
    source: { origin: "agent", producer: "host" }, project_id: id(), actor_id: id(), acting_role: "executor", command_type: "ReserveSkillInvocation",
    target: report.run_ref, expected_revision: 1, payload: { skill_binding_ref: ref("provider_binding"), method_name: "review",
      input_ref: { provider: "local_content", resource_type: "skill_method_input", locator: hash.value, digest: hash } } };
  expect(v2.parseCommand(command)).toEqual(command);
  for (const field of ["invocation_key", "method_qualification_ref", "verified", "package_ref", "input_digest"])
    expect(() => v2.parseCommand({ ...command, payload: { ...command.payload, [field]: "self-asserted" } })).toThrow();
});
it("separates Skill raw/proof content references from Run reports and existing isolated rehearsal observations", () => {
  const parse = v2.compileValidator(v2.RawSkillInvocationObservationSchema), valid = { ...report, status: "failed" };
  expect(parse(valid)).toEqual(valid);
  expect(() => parse({ ...valid, result_proof_ref: { ...report.result_proof_ref, resource_type: "agent_run_proof" } })).toThrow();
  expect(() => parse({ ...valid, format: "cimiloop/fixed-method-observation/1.0.0", formal_execution_enabled: false })).toThrow();
  expect(() => v2.compileValidator(v2.SkillInvocationRawReferenceSchema)({ ...report.result_proof_ref, resource_type: "agent_run" })).toThrow();
});
