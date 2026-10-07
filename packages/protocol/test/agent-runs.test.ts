import { expect, it } from "vitest";
import * as v2 from "../src/v2/index.js";
const hash = { algorithm: "sha256", value: "a".repeat(64) };
const id = () => v2.createInternalId();
const ref = (object_type: string) => ({ object_type, id: id() });
const content = (resource_type: string) => ({ provider: "local_content", resource_type, locator: hash.value, digest: hash });
const common = { schema_version: "2.0.0", id: id(), project_id: id(), change_id: id(), task_id: id(), producer_actor_id: id(), created_at: "2026-10-07T00:00:00.000Z",
  work_item_ref: ref("work_item"), definition_ref: { ...ref("task_definition"), domain_version: 1 }, contract_ref: { ...ref("contract_version"), domain_version: 1 }, plan_ref: { ...ref("plan_version"), domain_version: 1 } };
const pins = { runtime_binding: { binding_ref: ref("provider_binding"), digest: hash }, skill_bindings: [{ binding_ref: ref("provider_binding"), digest: hash }] };
const human = { ...common, source_snapshot_ref: ref("source_snapshot"), workspace_snapshot_ref: ref("workspace_snapshot"), executor_ref: ref("actor"), boundary: "manual_scoped",
  input_refs: [ref("source_snapshot"), ref("workspace_snapshot"), common.definition_ref, common.contract_ref, common.plan_ref], allowed_actions: ["read_files"], allowed_resources: ["src/query.ts"], input_digest: hash };
const agent = { ...human, boundary: "agent_scoped", ...pins, host_admission_ref: content("agent_host_admission") };
it("preserves the strict Human Context and requires all Agent binding/admission fields", () => {
  expect(v2.compileValidator(v2.HumanContextManifestSchema)(human)).toEqual(human); expect(v2.compileValidator(v2.ContextManifestSchema)(agent)).toEqual(agent);
  expect(() => v2.compileValidator(v2.HumanContextManifestSchema)(agent)).toThrow();
  expect(() => v2.compileValidator(v2.ContextManifestSchema)({ ...human, ...pins })).toThrow();
  const { host_admission_ref: _ref, ...missing } = agent; expect(() => v2.compileValidator(v2.AgentContextManifestSchema)(missing)).toThrow();
});
it("separates Human and Agent Run records and bounds fixed Skill binding sets", () => {
  const original = { ...common, run_id: id(), run_kind: "human", attempt_no: 1, operation_key: id(), context_ref: ref("context_manifest"), source_snapshot_ref: human.source_snapshot_ref,
    workspace_before_ref: human.workspace_snapshot_ref, executor_ref: human.executor_ref, reserved_at: common.created_at, input_digest: hash, reserved_cost_micros: 100, cost_currency: "USD" };
  expect(v2.compileValidator(v2.HumanRunRecordSchema)(original)).toEqual(original);
  expect(v2.compileValidator(v2.RunRecordSchema)({ ...original, run_kind: "agent", ...pins, host_admission_ref: agent.host_admission_ref })).toMatchObject({ run_kind: "agent" });
  expect(() => v2.compileValidator(v2.RunRecordSchema)({ ...original, run_kind: "agent" })).toThrow();
  expect(() => v2.compileValidator(v2.AgentRunBindingsSchema)({ ...pins, skill_bindings: Array.from({ length: 9 }, () => ({ binding_ref: ref("provider_binding"), digest: hash })) })).toThrow();
});
it("requires explicit Agent proof provenance and refuses cross-shaped raw observations", () => {
  const original = { format: "cimiloop/manual-run/1.0.0", run_id: id(), operation_key: id(), producer_actor_id: id(), observed_at: common.created_at, input_digest: hash,
    basis: "direct_observation", status: "succeeded", usage: { cost_known: true, cost_micros: 25, currency: "USD" }, method: "Fixture", observation: "Structure test only", resolves_observation_refs: [] };
  const report = { ...original, format: "cimiloop/agent-run/1.0.0", context_ref: ref("context_manifest"), ...pins, host_admission_ref: agent.host_admission_ref, result_proof_ref: content("agent_run_proof") };
  expect(v2.compileValidator(v2.RawRunObservationSchema)(original)).toEqual(original); expect(v2.compileValidator(v2.RawRunObservationSchema)(report)).toEqual(report);
  expect(() => v2.compileValidator(v2.RawHumanRunObservationSchema)(report)).toThrow(); expect(() => v2.compileValidator(v2.RawAgentRunObservationSchema)({ ...original, format: "cimiloop/agent-run/1.0.0" })).toThrow();
  const observation = { ...common, run_ref: ref("run"), raw_result_ref: content("agent_run"), report, received_at: common.created_at, workspace_received_ref: ref("workspace_snapshot"), applicability: "current", resulting_status: "Succeeded" };
  expect(v2.compileValidator(v2.RunObservationSchema)(observation)).toEqual(observation);
  expect(() => v2.compileValidator(v2.RunObservationSchema)({ ...observation, raw_result_ref: content("manual_run") })).toThrow();
});
