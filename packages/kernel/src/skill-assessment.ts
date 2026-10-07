import { createHash } from "node:crypto";
import { compileValidator, SkillProbeResultSchema, type SkillProbeResult, type ProviderEvidence, type ProviderDescriptor,
  type ProviderEvaluation, type Project, type ExternalReference, type ProviderBinding } from "@cimiloop/protocol/v2";
import { verifySkillPackageBytes, parseSkillMethodInput, parseSkillMethodOutput, skillInvocationPlan } from "@cimiloop/skill-adapter";
import type { ProviderReader } from "@cimiloop/store";
import type { ProviderVerifierPort } from "./provider-assessment.js";
import { contentDigest } from "./intent.js";

export const skillAssessmentRule = "skill-provider-assessment/1.0.0" as const;
const same = (a: unknown, b: unknown) => contentDigest(a).value === contentDigest(b).value;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const text = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const parseProbe = compileValidator<SkillProbeResult>(SkillProbeResultSchema);
export const skillRuntimeBinding = (reader: ProviderReader, project: Project, probe: Pick<SkillProbeResult, "runtime_binding_ref" | "runtime_binding_digest">): ProviderBinding => {
  const binding = reader.getProviderBinding(probe.runtime_binding_ref.id), runtime = binding && reader.getProviderDescriptor(binding.descriptor_ref.id);
  const evaluation = binding?.approval && reader.getProviderEvaluation(binding.approval.evaluation_ref.id);
  if (!binding || binding.project_id !== project.id || !same(contentDigest(binding), probe.runtime_binding_digest) || !runtime || runtime.provider_kind !== "runtime" ||
    !same(contentDigest(runtime), binding.descriptor_digest) || !binding.approval || binding.approval.binding_scope !== "isolated_provider_probe" ||
    !evaluation || evaluation.rule_version !== "provider-assessment/1.0.0" || evaluation.profile !== "technical_contract" || evaluation.outcome !== "ALLOW" ||
    evaluation.descriptor_ref.id !== runtime.id || !same(evaluation.descriptor_digest, binding.descriptor_digest) || !same(evaluation.input_digest, binding.approval.input_digest) ||
    !same(evaluation.evidence_refs, binding.probe_evidence_refs) || !evaluation.evidence_refs.length || evaluation.evidence_refs.some(ref => {
      const evidence = reader.getProviderEvidence(ref.id); return !evidence || evidence.purpose !== "provider_probe" || evidence.descriptor_ref.id !== runtime.id || !same(evidence.descriptor_digest, binding.descriptor_digest);
    })) throw new Error("Approved fixed Runtime probe binding required");
  return binding;
};
export const readSkillSample = (port: ProviderVerifierPort, reader: ProviderReader, project: Project, descriptor: ProviderDescriptor, evidence: ProviderEvidence, verifyRuntime: (binding: ProviderBinding) => void) => {
  if (descriptor.provider_kind !== "skill" || evidence.purpose !== "skill_probe" || !port.readSkillPackage || !port.validateSkillRequest) throw new Error("Skill observation host required");
  const probe = parseProbe(port.readProbe(project, evidence.raw_result_ref));
  if (probe.descriptor_ref.id !== descriptor.id || !same(probe.descriptor_digest, contentDigest(descriptor)) || !descriptor.capabilities.some(capability => same(capability, probe.capability))) throw new Error("Skill probe source mismatch");
  const runtimeBinding = skillRuntimeBinding(reader, project, probe), runtime = reader.getProviderDescriptor(runtimeBinding.descriptor_ref.id)!;
  verifyRuntime(runtimeBinding);
  for (const value of [descriptor, runtime]) if (!same(port.sourceDigest(project, value), value.source_ref.digest) ||
    !same(port.schemaDigest(value.input_schema_ref.schema_id), value.input_schema_ref.digest) || !same(port.schemaDigest(value.output_schema_ref.schema_id), value.output_schema_ref.digest)) throw new Error("Provider source or schema changed");
  const verified = verifySkillPackageBytes(port.readSkillPackage(project, descriptor), descriptor.source_ref.digest);
  const read = (ref: ExternalReference, maximum = 1024 * 1024) => {
    const bytes = port.readArtifact(project, ref);
    if (bytes.length > maximum || ref.digest?.algorithm !== "sha256" || hash(bytes) !== ref.digest.value) throw new Error("Skill raw artifact digest or limit mismatch");
    return bytes;
  };
  const values: Record<string, boolean | undefined> = { fixed_source: true, method_io: true, skill_loaded: true, real_invocation: true, independent_sessions: true };
  const sessions = new Set<string>(), operations = new Set<string>(); let purpose: string | undefined;
  for (const call of probe.calls) {
    const operation = call.operation;
    if (operations.has(operation.operation_key) || !Number.isFinite(Date.parse(operation.observed_at)) || Date.parse(operation.observed_at) > Date.parse(probe.observed_at)) throw new Error("Skill invocation identity or time mismatch");
    operations.add(operation.operation_key);
    if (call.input_ref.version !== "skill-input.json" || call.request_ref.version !== "request.json") throw new Error("Skill artifact role mismatch");
    const input = parseSkillMethodInput(JSON.parse(text(read(call.input_ref, 384 * 1024))));
    if (purpose && input.purpose !== purpose || probe.capability.capability_id !== (input.purpose === "clarification" ? "intent.clarify" : "verification.review")) throw new Error("Skill capability or purpose mismatch");
    purpose = input.purpose;
    const artifacts = input.purpose === "review" ? input.artifact_refs.map(ref => ({ ref, bytes: read(ref, 256 * 1024) })) : [];
    const plan = skillInvocationPlan(verified, input, artifacts), request = JSON.parse(text(read(call.request_ref, 2 * 1024 * 1024))) as {
      input: { operation_key: string; mode: string; prompt: string; files: unknown; skill_profile: unknown }; input_digest: unknown;
      driver: { kind: string; binary_digest: unknown; model: string };
    };
    const rawDigest = { algorithm: "sha256", value: hash(Buffer.from(JSON.stringify({ input: request.input, driver: request.driver }))) };
    if (typeof request.driver.model !== "string" || !request.driver.model || request.driver.model.length > 256) throw new Error("Skill Runtime model identity missing");
    port.validateSkillRequest(project, request);
    if (request.input.operation_key !== operation.operation_key || request.input.mode !== "read" || !same(request.input_digest, operation.input_digest) || !same(rawDigest, operation.input_digest) ||
      !same(request.driver.binary_digest, runtime.source_ref.digest) || !same(request.input.skill_profile, plan.profile) || request.input.prompt !== plan.prompt || !same(request.input.files, plan.files)) throw new Error("Skill operation does not match fixed method context");
    if (operation.raw_refs.length + operation.outputs.length > 16) throw new Error("Skill runtime artifact limit");
    for (const ref of [...operation.raw_refs, ...operation.outputs]) read(ref, 2 * 1024 * 1024);
    const unknown = ["Reserved", "Running", "Unknown", "NotStarted"].includes(operation.status);
    const raw = (tag: string) => {
      const refs = operation.raw_refs.filter(ref => ref.version === tag);
      if (unknown && !refs.length) return "";
      if (refs.length !== 1) throw new Error("Unique skill runtime artifact required"); return text(read(refs[0]!, 2 * 1024 * 1024));
    };
    const proof = JSON.parse(raw("native-proof.json") || "{}") as { phase?: string; reason?: string; exit_code?: number; profile?: string };
    const events = raw("stdout.raw").split(/\r?\n/).filter(line => line.trim().startsWith("{")).map(line => JSON.parse(line) as {
      type?: string; sessionID?: string; part?: { reason?: string; text?: string; tool?: string; state?: { status?: string; input?: { name?: string }; output?: string } };
    });
    const actualSessions = new Set(events.map(event => event.sessionID).filter(session => typeof session === "string"));
    const complete = operation.status === "Succeeded" && operation.exit_code === 0 && !operation.cancel_requested && proof.phase === "ended" && proof.reason === "exited" && proof.exit_code === 0 &&
      typeof proof.profile === "string" && proof.profile.startsWith("CimiLoop.") && actualSessions.size === 1 && !!operation.session_id && actualSessions.has(operation.session_id) &&
      !events.some(event => event.type === "error") && ["stop", "end_turn"].includes(events.filter(event => event.type === "step_finish").at(-1)?.part?.reason ?? "");
    const real = request.driver.kind === "opencode" && !/^(?:fixture|synthetic|cimiloop-(?:gateway|transport|conversation))\//.test(request.driver.model);
    if (!real || unknown) values.real_invocation = values.real_invocation === false ? false : undefined;
    else if (!complete) values.real_invocation = false;
    if (operation.session_id) { if (sessions.has(operation.session_id)) values.independent_sessions = false; sessions.add(operation.session_id); }
    const loaded = events.filter(event => event.type === "tool_use" && event.part?.tool === "skill" && event.part.state?.status === "completed");
    const entry = verified.modules.find(module => module.path === verified.package.spec.entry_path)!;
    const selected = new Map(verified.modules.map(module => [module.name, module]));
    const loadNames = loaded.map(event => event.part!.state!.input?.name);
    const loadedCorrectly = loaded.length >= verified.modules.length && loadNames[0] === entry.name && loaded.every(event => {
      const module = selected.get(event.part!.state!.input?.name ?? ""); return !!module && typeof event.part!.state!.output === "string" && event.part!.state!.output!.includes(module.body.trim());
    }) && verified.modules.every(module => loadNames.includes(module.name));
    if (unknown) { values.skill_loaded = values.skill_loaded === false ? false : undefined; values.method_io = values.method_io === false ? false : undefined; }
    else {
      if (!loadedCorrectly) values.skill_loaded = false;
      try {
        if (!complete) throw new Error("No completed method output");
        const output = parseSkillMethodOutput(input, JSON.parse(events.filter(event => event.type === "text").at(-1)?.part?.text ?? ""));
        if (input.purpose === "review" && output.purpose === "review" && output.findings.some(finding => finding.basis_refs.some(ref => !input.artifact_refs.some(actual => same(actual, ref))))) throw new Error("Unsupported finding basis");
      } catch { values.method_io = false; }
    }
  }
  if (purpose === "review" && probe.calls.length < 2) values.independent_sessions = undefined;
  return { probe, values, runtimeBinding };
};
export const assessSkillProvider = (port: ProviderVerifierPort, reader: ProviderReader, project: Project, descriptor: ProviderDescriptor, evidence: ProviderEvidence[], profile: ProviderEvaluation["profile"], verifyRuntime: (binding: ProviderBinding) => void) => {
  const samples = evidence.map(value => readSkillSample(port, reader, project, descriptor, value, verifyRuntime)), assessments: ProviderEvaluation["assessments"] = [];
  for (const key of ["fixed_source", "method_io", "skill_loaded", "real_invocation", "independent_sessions"]) assessments.push({ key,
    result: samples.some(sample => sample.values[key] === false) ? "refutes" : samples.some(sample => sample.values[key] === undefined) ? "inconclusive" : "supports",
    evidence_refs: evidence.map(value => ({ object_type: "evidence", id: value.id })) });
  if (profile === "controlled_execution") for (const key of ["harness_coverage", "permission_intersection", "cost_accounting_and_cap", "invocation_recovery"]) assessments.push({ key, result: "inconclusive", evidence_refs: [] });
  const outcome = assessments.some(value => value.result === "refutes") ? "DENY" : assessments.some(value => value.result === "inconclusive") ? "NEED_MORE_EVIDENCE" : "ALLOW";
  const reasons = assessments.filter(value => value.result !== "supports").map(value => value.key);
  const input_digest = contentDigest({ rule_version: skillAssessmentRule, profile, descriptor_digest: contentDigest(descriptor),
    runtime_bindings: samples.map(sample => ({ id: sample.runtimeBinding.id, digest: contentDigest(sample.runtimeBinding) })),
    evidence: evidence.map(value => ({ id: value.id, digest: contentDigest(value) })), assessments });
  return { input_digest, outcome, reasons, assessments } as Pick<ProviderEvaluation, "input_digest" | "outcome" | "reasons" | "assessments">;
};
