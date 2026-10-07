import type * as v2 from "../../packages/protocol/src/v2/index.js";
import { compileValidator, SkillMethodInputSchema } from "../../packages/protocol/src/v2/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { createAgentRunProject } from "./agent-run-project.js";
import { flowSuccess, flowTime } from "./flow-project.js";
import type { ContentReference } from "../../packages/local-app/src/evidence-local.js";

// Constructed Native domain fixture only. There is no real package qualification,
// SDK, model call or actual invoice behind this trusted fake host.
export const createSkillInvocationProject = (directory: string) => {
  const f = createAgentRunProject(directory), prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared);
  const content = <T extends ContentReference["resource_type"]>(value: unknown, kind: T) => f.runPort.content.storeContent(Buffer.from(JSON.stringify(value)), kind);
  const state = { prepare_calls: 0, result_calls: 0, qualification_available: true, proof_available: true, wrong_source: false, wrong_schema: false };
  f.runPort.agent.skills = {
    prepare(_project, _record, _context, binding, input) {
      state.prepare_calls++; if (!state.qualification_available) throw new Error("Constructed method qualification unavailable");
      const descriptor = f.store.getProviderDescriptor(binding.descriptor_ref.id)!;
      const methodInput = compileValidator<v2.SkillMethodInput>(SkillMethodInputSchema)(JSON.parse(f.runPort.content.readContent(input.input_ref).toString("utf8")));
      return { request: { format: "cimiloop/named-skill-method/1.0.0", invocation_key: input.invocation_key, method_name: input.method_name,
        source_digest: state.wrong_source ? contentDigest("wrong source") : descriptor.source_ref.digest, input: methodInput },
        // This fake reference deliberately has no real Git package bytes behind it.
        package_ref: { provider: "local_content", resource_type: "skill_package", locator: descriptor.source_ref.digest.value, digest: descriptor.source_ref.digest },
        input_schema_ref: state.wrong_schema ? { ...binding.input_schema_ref, digest: contentDigest("wrong schema") } : binding.input_schema_ref,
        output_schema_ref: binding.output_schema_ref, method_qualification_ref: content({ synthetic: true, binding_id: binding.id }, "skill_method_qualification") };
    },
    readResult(_project, invocation, reference) {
      state.result_calls++; if (!state.proof_available) throw new Error("Constructed original proof unavailable");
      const raw = JSON.parse(f.runPort.content.readContent(reference).toString("utf8")) as v2.RawSkillInvocationObservation;
      const proof = JSON.parse(f.runPort.content.readContent(raw.result_proof_ref).toString("utf8"));
      if (proof.synthetic !== true || proof.invocation_id !== invocation.id || proof.invocation_key !== invocation.invocation_key || proof.input_digest !== invocation.input_digest.value ||
        proof.output_digest !== contentDigest(raw.status === "succeeded" ? raw.output : null).value) throw new Error("Constructed original proof mismatch");
      return raw;
    }
  };
  const input: v2.SkillMethodInput = { purpose: "review", goal: "Review fixed change", spec: "Fixed specification", standards: "Fixed standards",
    artifact_refs: [{ provider: "fixture", resource_type: "fixed_diff", locator: "synthetic-diff", digest: contentDigest("synthetic diff") }] };
  const inputRef = content(input, "skill_method_input"), run = () => f.store.getRun(reserved.run.id)!;
  const command = (kind: string, payload: unknown) => f.command(kind, "run", reserved.run.id, payload);
  const reserveCommand = (overrides: Record<string, unknown> = {}) => command("ReserveSkillInvocation", {
    skill_binding_ref: { object_type: "provider_binding", id: f.skill.id }, method_name: "review", input_ref: inputRef, ...overrides });
  const reserve = () => { const result = flowSuccess(f.kernel.execute(reserveCommand())); if (result.command_type !== "ReserveSkillInvocation") throw new Error("Skill reservation expected"); return result.data; };
  const raw = (invocation: v2.SkillInvocation, status: v2.RawSkillInvocationObservation["status"], overrides: Record<string, unknown> = {}) => {
    const output: v2.SkillMethodOutput = { purpose: "review", findings: [], limitations: ["Constructed Native fixture only"] };
    const report = { format: "cimiloop/skill-invocation/1.0.0", invocation_ref: { object_type: "skill_invocation", id: invocation.id }, invocation_key: invocation.invocation_key,
      run_ref: invocation.run_ref, run_operation_key: invocation.run_operation_key, producer_actor_id: f.agent.id, input_digest: invocation.input_digest,
      observed_at: flowTime, basis: "direct_observation", status, usage: { cost_known: true, cost_micros: 10, currency: "USD" },
      ...(status === "succeeded" ? { output } : {}), resolves_observation_refs: [], ...overrides };
    const proof = content({ synthetic: true, invocation_id: invocation.id, invocation_key: invocation.invocation_key, input_digest: invocation.input_digest.value,
      output_digest: contentDigest(report.status === "succeeded" && "output" in report ? report.output : null).value }, "skill_invocation_proof");
    return { report: { ...report, result_proof_ref: proof }, reference: content({ ...report, result_proof_ref: proof }, "skill_invocation_report") };
  };
  const observe = (invocation: v2.SkillInvocation, status: v2.RawSkillInvocationObservation["status"], overrides: Record<string, unknown> = {}) =>
    f.kernel.execute(command("RecordSkillInvocationObservation", { invocation_ref: { object_type: "skill_invocation", id: invocation.id }, raw_result_ref: raw(invocation, status, overrides).reference }));
  const reconcile = (invocation: v2.SkillInvocation, status: v2.RawSkillInvocationObservation["status"], overrides: Record<string, unknown> = {}) => {
    const refs = f.store.listRuntimeRecords("skill_invocation_observation", f.change.id).filter(observation => observation.invocation_ref.id === invocation.id &&
      (observation.report.status === "unknown" || !observation.report.usage.cost_known || observation.applicability === "conflicting")).map(observation => ({ object_type: "skill_invocation_observation", id: observation.id }));
    return f.humanKernel.execute(f.humanCommand("ReconcileSkillInvocation", "run", run().id, { invocation_ref: { object_type: "skill_invocation", id: invocation.id },
      raw_result_ref: raw(invocation, status, { producer_actor_id: f.actor.id, basis: "reconciliation", resolves_observation_refs: refs, ...overrides }).reference }, "technical_owner"));
  };
  return { ...f, prepared, reserved, skillState: state, inputRef, methodInput: input, skillCommand: command, reserveSkillCommand: reserveCommand,
    reserveSkill: reserve, skillRaw: raw, observeSkill: observe, reconcileSkill: reconcile, currentRun: run };
};
