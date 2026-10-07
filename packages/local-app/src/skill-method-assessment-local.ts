import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { compileValidator, NamedSkillMethodEvidenceSchema, NamedSkillMethodEvidenceReferenceSchema, NamedSkillMethodAssessmentSchema,
  ProviderArtifactReferenceSchema, type Project, type ProviderDescriptor, type NamedSkillMethodEvidence, type NamedSkillMethodEvidenceReference,
  type NamedSkillMethodAssessment, type NamedSkillMethodSample, type AgentRunRecord, type AgentContextManifest, type ProviderBinding } from "@cimiloop/protocol/v2";
import { requestDigest } from "@cimiloop/kernel";
import { replayFixedMethodTranscript, verifyFixedMethodSdkEffects, parseGatewayJson } from "@cimiloop/runtime-adapter";
import { LocalSkillMethodInputs, type LocalSkillMethodPlan, type LocalSkillMethodQualificationPort } from "./skill-methods-local.js";

const same = (a: unknown, b: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
const digest = (value: unknown) => ({ algorithm: "sha256" as const, value: requestDigest(value) });
type Assessment = NamedSkillMethodAssessment["assessments"][number];
type OriginalInput = { descriptor: ProviderDescriptor; evidence: NamedSkillMethodEvidence; sample: NamedSkillMethodSample; plan: LocalSkillMethodPlan;
  session_id: string; native_pid: number; native_profile: string };
// Installed only by trusted application composition. Imported reports cannot
// implement this port or upgrade a public rehearsal to an external-model run.
export interface NamedSkillMethodOriginalsPort {
  verify(project: Project, input: OriginalInput): {
    origin: "external_model" | "public_fixture";
    // Re-read original protected runtime/IPC/account ledger entries for EVERY
    // exchange, and the original context, SDK/native effects and billing proof.
    checks: { runtime_custody: "passed" | "failed" | "inconclusive";
      independent_context: "passed" | "failed" | "inconclusive";
      provider_dependencies: "passed" | "failed" | "inconclusive";
      permission_intersection: "passed" | "failed" | "inconclusive";
      cost_accounting_and_cap: "passed" | "failed" | "inconclusive";
      invocation_recovery: "passed" | "failed" | "inconclusive";
      behavior: "passed" | "failed" | "inconclusive";
      harness: Record<string, "passed" | "failed" | "inconclusive"> };
  };
}
export interface NamedSkillMethodExecutionAdmission {
  evidence(project: Project, descriptor: ProviderDescriptor, methodName: string): NamedSkillMethodEvidenceReference;
  originals: NamedSkillMethodOriginalsPort;
  // Must re-read live WorkItem/Provider/budget/entitlement, qualification age,
  // resource scope and full permission intersection; a reservation is no grant.
  admitCurrent(project: Project, record: AgentRunRecord, context: AgentContextManifest, binding: ProviderBinding,
    descriptor: ProviderDescriptor, plan: LocalSkillMethodPlan, assessment: NamedSkillMethodAssessment): void;
}

export class LocalNamedSkillMethodAssessment {
  readonly inputs: LocalSkillMethodInputs;
  constructor(readonly repositoryPath: string, readonly dataDirectory: string) { this.inputs = new LocalSkillMethodInputs(repositoryPath, dataDirectory); }
  private bytes(ref: NamedSkillMethodSample["transcript_ref"], limit: number) {
    ref = compileValidator<NamedSkillMethodSample["transcript_ref"]>(ProviderArtifactReferenceSchema)(structuredClone(ref));
    const bytes = this.inputs.packages.content.readContent(ref); if (bytes.length > limit) throw new Error("Named method artifact byte limit"); return bytes;
  }
  private json(bytes: Uint8Array, limit: number): unknown { return parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes), limit); }
  evaluate(project: Project, descriptor: ProviderDescriptor, rawRef: NamedSkillMethodEvidenceReference,
    profile: NamedSkillMethodAssessment["profile"] = "method_contract", originals?: NamedSkillMethodOriginalsPort): NamedSkillMethodAssessment {
    if (resolve(project.repository_path) !== resolve(this.repositoryPath) || descriptor.project_id !== project.id) throw new Error("Named method assessment project mismatch");
    const evidence_ref = compileValidator<NamedSkillMethodEvidenceReference>(NamedSkillMethodEvidenceReferenceSchema)(structuredClone(rawRef));
    const bytes = this.inputs.packages.content.readContent(evidence_ref);
    const evidence = compileValidator<NamedSkillMethodEvidence>(NamedSkillMethodEvidenceSchema)(this.json(bytes, 384 * 1024));
    if (evidence.project_id !== project.id || evidence.descriptor_ref.id !== descriptor.id || !same(evidence.descriptor_digest, digest(descriptor))) throw new Error("Named method descriptor pin mismatch");
    const assessments: Assessment[] = [], add = (key: string, result: Assessment["result"]) => assessments.push({ key, result });
    const sessions = new Set<string>(), nativeContexts = new Set<string>(), operations = new Set<string>(), originalChecks: unknown[] = [];
    add("fixed_source_and_schemas", "passed");
    for (const [index, sample] of evidence.samples.entries()) {
      if (operations.has(sample.invocation_key)) throw new Error("Named method original invocation repeated"); operations.add(sample.invocation_key);
      const plan = this.inputs.read(project, descriptor, { ...sample, method_name: evidence.method_name });
      if (plan.request.input.purpose !== evidence.purpose) throw new Error("Named method purpose mismatch");
      const replay = replayFixedMethodTranscript(plan.profile, plan.files, this.json(this.bytes(sample.transcript_ref, 4 * 1024 * 1024), 4 * 1024 * 1024), plan.prompt);
      const effects = verifyFixedMethodSdkEffects(replay, this.bytes(sample.stdout_ref, 2 * 1024 * 1024), this.json(this.bytes(sample.native_proof_ref, 16384), 16384));
      if (sessions.has(effects.session_id)) throw new Error("Named method original session repeated"); sessions.add(effects.session_id);
      if (nativeContexts.has(effects.native_profile)) throw new Error("Named method original context repeated"); nativeContexts.add(effects.native_profile);
      add(`sample_${index}_named_read_contract`, "passed");
      if (profile === "controlled_execution") {
        const checked = originals?.verify(structuredClone(project), structuredClone({ descriptor, evidence, sample, plan, ...effects }));
        originalChecks.push(checked ?? null);
        if (checked && !["external_model", "public_fixture"].includes(checked.origin)) throw new Error("Named method original origin invalid");
        add(`sample_${index}_real_model`, checked ? checked.origin === "external_model" ? "passed" : "failed" : "inconclusive");
        for (const key of ["runtime_custody", "independent_context", "provider_dependencies", "permission_intersection", "cost_accounting_and_cap", "invocation_recovery", "behavior"] as const) {
          const result = checked?.checks[key] ?? "inconclusive";
          if (!["passed", "failed", "inconclusive"].includes(result)) throw new Error("Named method original check invalid"); add(`sample_${index}_${key}`, result);
        }
        for (const requirement of plan.harness_requirements) {
          const result = checked?.checks.harness[requirement] ?? "inconclusive";
          if (!["passed", "failed", "inconclusive"].includes(result)) throw new Error("Named method harness check invalid"); add(`sample_${index}_harness_${requirement}`, result);
        }
      }
      // Re-read all imported bytes after trusted verification, guarding callbacks
      // and changing content. The snapshot is never the qualification authority.
      if (!same(plan, this.inputs.read(project, descriptor, { ...sample, method_name: evidence.method_name })) ||
        !same(replay, replayFixedMethodTranscript(plan.profile, plan.files, this.json(this.bytes(sample.transcript_ref, 4 * 1024 * 1024), 4 * 1024 * 1024), plan.prompt)) ||
        !same(effects, verifyFixedMethodSdkEffects(replay, this.bytes(sample.stdout_ref, 2 * 1024 * 1024), this.json(this.bytes(sample.native_proof_ref, 16384), 16384)))) throw new Error("Named method evidence changed during assessment");
    }
    if (!same(bytes, this.inputs.packages.content.readContent(evidence_ref))) throw new Error("Named method evidence changed during assessment");
    if (profile === "controlled_execution") add("independent_samples", sessions.size >= 2 ? "passed" : "inconclusive");
    const outcome = assessments.some(item => item.result === "failed") ? "DENY" : assessments.some(item => item.result === "inconclusive") ? "NEED_MORE_EVIDENCE" : "ALLOW";
    return compileValidator<NamedSkillMethodAssessment>(NamedSkillMethodAssessmentSchema)({ format: "cimiloop/named-skill-method-assessment/1.0.0",
      rule_version: "named-skill-method-assessment/1.0.0", profile, project_id: project.id, descriptor_ref: evidence.descriptor_ref, descriptor_digest: evidence.descriptor_digest,
      runtime_binding: evidence.runtime_binding, method_name: evidence.method_name, purpose: evidence.purpose, evidence_ref,
      input_digest: digest({ rule: "named-skill-method-assessment/1.0.0", profile, descriptor, evidence, originalChecks, assessments }), outcome, assessments,
      builtin_skill_qualified: false, formal_execution_enabled: false });
  }
  qualificationVerifier(host: NamedSkillMethodExecutionAdmission): LocalSkillMethodQualificationPort {
    return { verify: (project, record, context, binding, descriptor, plan) => {
      const evidence_ref = host.evidence(structuredClone(project), structuredClone(descriptor), plan.request.method_name);
      const assessment = this.evaluate(project, descriptor, evidence_ref, "controlled_execution", host.originals);
      if (assessment.outcome !== "ALLOW" || assessment.method_name !== plan.request.method_name || !same(assessment.runtime_binding, record.runtime_binding) || assessment.purpose !== plan.request.input.purpose) throw new Error("Named method controlled qualification unavailable");
      host.admitCurrent(structuredClone(project), structuredClone(record), structuredClone(context), structuredClone(binding), structuredClone(descriptor), structuredClone(plan), structuredClone(assessment));
      const current = this.evaluate(project, descriptor, evidence_ref, "controlled_execution", host.originals);
      if (!same(current, assessment) || !same(evidence_ref, host.evidence(structuredClone(project), structuredClone(descriptor), plan.request.method_name))) throw new Error("Named method qualification changed during admission");
      host.admitCurrent(structuredClone(project), structuredClone(record), structuredClone(context), structuredClone(binding), structuredClone(descriptor), structuredClone(plan), structuredClone(current));
      return this.inputs.packages.content.storeContent(Buffer.from(JSON.stringify(assessment)), "skill_method_qualification");
    } };
  }
}
