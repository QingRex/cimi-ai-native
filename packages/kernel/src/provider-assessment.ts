import { createHash } from "node:crypto";
import { compileValidator, RuntimeProbeResultSchema, SkillProbeResultSchema, ProviderEvidenceSchema, SCHEMA_VERSION, type AnyCommand, type ProviderDescriptor,
  type ProviderEvidence, type ProviderEvaluation, type ProviderProbeReference, type RuntimeProbeResult, type ExternalReference,
  type Digest, type Project, type InternalId, type DomainError, type CommandSuccess, type ProviderBinding, type SkillProbeResult } from "@cimiloop/protocol/v2";
import type { ProviderReader, StoreTransaction } from "@cimiloop/store";
import { resolveAssignment } from "./authorization.js";
import { contentDigest, IntentFailure } from "./intent.js";
import { assessSkillProvider, readSkillSample, skillRuntimeBinding, skillAssessmentRule } from "./skill-assessment.js";
import {readRuntimeControlEvidence,runtimeControlKeys,type RuntimeControlEvidencePort} from './runtime-control-evidence.js';
export type {RuntimeControlEvidencePort,RuntimeControlEvidence,RuntimeControlKey} from './runtime-control-evidence.js';

// Trusted host IO only. Commands cannot supply verified flags or install a port.
export interface ProviderVerifierPort extends Partial<RuntimeControlEvidencePort> {
  readProbe(project: Project, ref: ProviderProbeReference): unknown;
  readArtifact(project: Project, ref: ExternalReference): Uint8Array;
  sourceDigest(project: Project, descriptor: ProviderDescriptor): Digest;
  schemaDigest(schemaId: string): Digest;
  readSkillPackage?(project: Project, descriptor: ProviderDescriptor): Uint8Array;
  validateSkillRequest?(project: Project, request: unknown): void;
}
type Command = Extract<AnyCommand, { command_type: "RecordProviderEvidence" | "EvaluateProvider" | "RegisterProviderBinding" }>;
type Context = { project: Project; actorId: InternalId; now: string; id: () => InternalId };
const same = (a: unknown, b: unknown) => contentDigest(a).value === contentDigest(b).value;
const parseProbe = compileValidator<RuntimeProbeResult>(RuntimeProbeResultSchema);
const text = (bytes: Uint8Array): string => Buffer.from(bytes).toString("utf8");
const rule = "provider-assessment/1.0.0" as const;
const controlRule = "runtime-control-evidence/1.0.0" as const;
const usesControlEvidence=(evaluation:ProviderEvaluation)=>evaluation.assessments.some(check=>check.key===controlRule);
const allRefs = (probe: RuntimeProbeResult) => [...probe.evidence_refs, ...probe.boundaries.flatMap(b => b.raw_refs), ...probe.model_operations.flatMap(o => [...o.raw_refs, ...o.outputs])];
const readSample = (port: ProviderVerifierPort, project: Project, descriptor: ProviderDescriptor, evidence: ProviderEvidence) => {
  const probe = parseProbe(port.readProbe(project, evidence.raw_result_ref));
  if (evidence.purpose !== "provider_probe" || !same(probe.provider.binary_digest, descriptor.source_ref.digest) || probe.provider.version !== descriptor.version ||
    probe.provider.version !== descriptor.source_ref.version || descriptor.provider_kind !== "runtime" || descriptor.name.toLowerCase() !== probe.provider.name) throw new Error("Probe source mismatch");
  if (!same(port.sourceDigest(project, descriptor), descriptor.source_ref.digest) ||
    !same(port.schemaDigest(descriptor.input_schema_ref.schema_id), descriptor.input_schema_ref.digest) ||
    !same(port.schemaDigest(descriptor.output_schema_ref.schema_id), descriptor.output_schema_ref.digest)) throw new Error("Source or schema changed");
  const bytes = new Map<string, Uint8Array>();
  if (allRefs(probe).length > 64) throw new Error("Probe artifact limit");
  for (const ref of allRefs(probe)) {
    const value = port.readArtifact(project, ref);
    if (!ref.digest || ref.digest.algorithm !== "sha256" || createHash("sha256").update(value).digest("hex") !== ref.digest.value) throw new Error("Artifact digest mismatch");
    bytes.set(contentDigest(ref).value, value);
  }
  const raw = (refs: ExternalReference[], tag: string): string => {
    const found = refs.filter(r => r.version === tag); if (found.length !== 1) throw new Error("Unique raw artifact required");
    return text(bytes.get(contentDigest(found[0]!).value)!);
  };
  const ended = (refs: ExternalReference[], tag: string) => {
    try { const p = JSON.parse(raw(refs, tag)) as Record<string, unknown>; return p.phase === "ended" && p.reason === "exited" && p.exit_code === 0 && typeof p.profile === "string" && p.profile.startsWith("CimiLoop."); }
    catch { return false; }
  };
  const events = (refs: ExternalReference[], tag: string) => raw(refs, tag).split(/\r?\n/).filter(l => l.trim().startsWith("{")).map(l => JSON.parse(l) as Record<string, unknown>);
  const values: Record<string, boolean | undefined> = {};
  values.version = ended(probe.evidence_refs, "sandbox_proof") && raw(probe.evidence_refs, "probe_stdout").split(/\r?\n/).includes(probe.provider.version);
  for (const mode of ["write", "read"] as const) {
    const boundaries = probe.boundaries.filter(b => b.mode === mode);
    let valid = false;
    if (boundaries.length === 1) {
      const b = boundaries[0]!;
      const canaries = events(b.raw_refs, "probe_stdout").filter(e => e.event === "sandbox.canary");
      const flags = ["outside_read_denied", "outside_write_denied", "subprocess_denied", "inside_readable", "inside_writable", "loopback_denied"] as const;
      valid = b.passed && ended(b.raw_refs, "sandbox_proof") && canaries.length === 1 && flags.every(k => canaries[0]![k] === b[k]) &&
        b.outside_read_denied && b.outside_write_denied && b.subprocess_denied && b.inside_readable && b.loopback_denied && b.inside_writable === (mode === "write");
    }
    values[`boundary_${mode}`] = valid;
  }
  const [edit, review] = probe.model_operations;
  const unproven = (op: typeof edit) => !op || ["Unknown", "NotStarted", "Running", "Reserved"].includes(op.status);
  const completed = (op: NonNullable<typeof edit>) => {
    const es = events(op.raw_refs, "stdout.raw"), sessions = [...new Set(es.map(e => e.sessionID).filter(v => typeof v === "string"))];
    const final = es.filter(e => e.type === "step_finish").at(-1)?.part as { reason?: string } | undefined;
    return op.status === "Succeeded" && op.exit_code === 0 && !op.cancel_requested && ended(op.raw_refs, "native-proof.json") &&
      sessions.length === 1 && sessions[0] === op.session_id && !es.some(e => e.type === "error") && ["stop", "end_turn"].includes(final?.reason ?? "");
  };
  values.real_edit = unproven(edit) ? undefined : !!edit && completed(edit) && raw(edit.outputs, "input.txt") === "after\n";
  values.independent_review = unproven(edit) || unproven(review) ? undefined : !!edit && !!review && completed(review) && edit.operation_key !== review.operation_key && edit.session_id !== review.session_id &&
    JSON.parse(raw(edit.raw_refs, "native-proof.json")).profile !== JSON.parse(raw(review.raw_refs, "native-proof.json")).profile &&
    raw(review.outputs, "input.txt") === "after\n" &&
    (events(review.raw_refs, "stdout.raw").filter(e => e.type === "text").at(-1)?.part as { text?: string } | undefined)?.text?.trim() === "PROBE_ACCEPT";
  return { probe, values };
};
const verifySkillRuntime = (port: ProviderVerifierPort, reader: ProviderReader, project: Project, binding: ProviderBinding) => {
  const descriptor = reader.getProviderDescriptor(binding.descriptor_ref.id)!, evaluation = reader.getProviderEvaluation(binding.approval!.evaluation_ref.id)!;
  const evidence = evaluation.evidence_refs.map(ref => reader.getProviderEvidence(ref.id));
  if (evidence.some(value => !value)) throw new Error("Runtime probe evidence missing");
  const computed = assessProvider(port, project, descriptor, evidence as ProviderEvidence[], evaluation.profile, reader, usesControlEvidence(evaluation)?controlRule:rule);
  if (!same(computed, { input_digest: evaluation.input_digest, outcome: evaluation.outcome, reasons: evaluation.reasons, assessments: evaluation.assessments })) throw new Error("Runtime qualification changed");
};
export const assessProvider = (port: ProviderVerifierPort, project: Project, descriptor: ProviderDescriptor, evidence: ProviderEvidence[], profile: ProviderEvaluation["profile"], reader?: ProviderReader, ruleVersion:typeof rule|typeof controlRule=rule): Pick<ProviderEvaluation, "input_digest" | "outcome" | "reasons" | "assessments"> => {
  if (descriptor.provider_kind === "skill") {
    if (!reader) throw new Error("Native Skill binding reader required");
    return assessSkillProvider(port, reader, project, descriptor, evidence, profile, binding => verifySkillRuntime(port, reader, project, binding));
  }
  const checks: ProviderEvaluation["assessments"] = [];
  const samples = evidence.map(e => readSample(port, project, descriptor, e));
  for (const key of ["version", "boundary_write", "boundary_read", "real_edit", "independent_review"]) checks.push({ key,
    result: samples.some(s => s.values[key] === false) ? "refutes" : samples.some(s => s.values[key] === undefined) ? "inconclusive" : "supports",
    evidence_refs: evidence.map(e => ({ object_type: "evidence", id: e.id })) });
  let control:ReturnType<typeof readRuntimeControlEvidence>|undefined;
  if(ruleVersion===controlRule&&profile!=='controlled_execution')throw Error('Controlled Runtime rule requires controlled_execution');
  if (profile === "controlled_execution") {
    if(ruleVersion===controlRule){control=readRuntimeControlEvidence(port,project,descriptor,evidence);checks.push(...control.checks,{key:controlRule,result:'supports',evidence_refs:evidence.map(e=>({object_type:'evidence',id:e.id}))});}
    else for (const key of runtimeControlKeys) checks.push({ key, result: "inconclusive", evidence_refs: [] });
  }
  const outcome = checks.some(c => c.result === "refutes") ? "DENY" : checks.some(c => c.result === "inconclusive") ? "NEED_MORE_EVIDENCE" : "ALLOW";
  const reasons = checks.filter(c => c.result !== "supports").map(c => c.key);
  const input_digest = contentDigest({ rule_version: rule, profile, descriptor_digest: contentDigest(descriptor),
    evidence: evidence.map(e => ({ id: e.id, digest: contentDigest(e) })), assessments: checks,...(control?{control_rule:controlRule,control_evidence:control.basis}:{}) });
  return { input_digest, outcome, reasons, assessments: checks } as Pick<ProviderEvaluation, "input_digest" | "outcome" | "reasons" | "assessments">;
};
export const providerEvaluationStatus = (reader: ProviderReader, descriptor: ProviderDescriptor, evaluation: ProviderEvaluation | undefined): string[] => {
  if (!evaluation || evaluation.purpose !== "provider_assessment" || evaluation.project_id !== descriptor.project_id ||
    evaluation.descriptor_ref.id !== descriptor.id || !same(evaluation.descriptor_digest, contentDigest(descriptor))) return ["PROVIDER_EVALUATION_NOT_FOUND_OR_STALE"];
  if (evaluation.rule_version !== (descriptor.provider_kind === "skill" ? skillAssessmentRule : rule)) return ["PROVIDER_ASSESSMENT_RULE_UNSUPPORTED"];
  if(usesControlEvidence(evaluation)&&(descriptor.provider_kind!=='runtime'||evaluation.profile!=='controlled_execution'))return ['PROVIDER_ASSESSMENT_PROFILE_MISMATCH'];
  if (evaluation.evidence_refs.some(ref => { const e = reader.getProviderEvidence(ref.id); return !e || e.project_id !== descriptor.project_id || e.descriptor_ref.id !== descriptor.id || !same(e.descriptor_digest, contentDigest(descriptor)); })) return ["PROVIDER_PROBE_EVIDENCE_NOT_FOUND_OR_STALE"];
  return evaluation.outcome === "ALLOW" ? [] : ["PROVIDER_NOT_EVALUATED", ...evaluation.reasons];
};
export const executeProviderAssessment = (tx: StoreTransaction, command: Command, context: Context, port: ProviderVerifierPort | undefined) => {
  const fail = (code: DomainError["code"], message: string, details: Record<string, unknown> = {}): never => {
    throw new IntentFailure({ schema_version: SCHEMA_VERSION, code, message, category: "conflict", retryable: false, details, correlation_id: command.correlation_id });
  };
  if (command.target.id !== context.project.id) fail("SCOPE_INVALID", "Provider 操作必须指向当前项目");
  if (command.expected_revision !== context.project.revision) fail("REVISION_CONFLICT", "Project 已变化，须重新核对 Provider 操作");
  const descriptor = tx.getProviderDescriptor(command.payload.descriptor_ref.id);
  if (!descriptor || descriptor.project_id !== context.project.id) return fail("OBJECT_NOT_FOUND", "未找到当前项目 Provider Descriptor");
  if (!same(command.payload.descriptor_digest, contentDigest(descriptor))) fail("PROVIDER_BINDING_STALE", "Provider Descriptor 摘要已变化");
  if (!port) return fail("CAPABILITY_UNAVAILABLE", "没有可信 Provider 原始字节核验入口");
  const metadata = { schema_version: SCHEMA_VERSION, id: context.id(), project_id: context.project.id, created_at: context.now, producer_actor_id: context.actorId };
  let event_type: string, record: { evidence: ProviderEvidence } | { evaluation: ProviderEvaluation } | { binding: ProviderBinding };
  if (command.command_type === "RecordProviderEvidence") {
    let probe: { observed_at: string };
    try { probe = compileValidator(descriptor.provider_kind === "skill" ? SkillProbeResultSchema : RuntimeProbeResultSchema)(port.readProbe(context.project, command.payload.raw_result_ref)) as { observed_at: string }; }
    catch { return fail("PROVIDER_OUTPUT_INVALID", "Provider 原始探针不可核对"); }
    if (!Number.isFinite(Date.parse(probe.observed_at)) || Date.parse(probe.observed_at) > Date.parse(context.now)) fail("PROVIDER_OUTPUT_INVALID", "探针观测必须是有效的既有时间");
    const evidence = compileValidator<ProviderEvidence>(ProviderEvidenceSchema)({ ...metadata, purpose: descriptor.provider_kind === "skill" ? "skill_probe" : "provider_probe", descriptor_ref: command.payload.descriptor_ref,
      descriptor_digest: command.payload.descriptor_digest, origin: descriptor.provider_kind === "skill" ? "local_skill_observation" : "local_probe_observation", raw_result_ref: command.payload.raw_result_ref, observed_at: probe.observed_at });
    try {
      if (descriptor.provider_kind === "skill") readSkillSample(port, tx, context.project, descriptor, evidence, binding => verifySkillRuntime(port, tx, context.project, binding));
      else readSample(port, context.project, descriptor, evidence);
    }
    catch { return fail("PROVIDER_OUTPUT_INVALID", "Provider 来源、Schema 或原始字节不匹配"); }
    tx.insertProviderEvidence(evidence); event_type = "ProviderEvidenceRecorded"; record = { evidence };
  } else {
    const evaluation = command.command_type === "RegisterProviderBinding" ? tx.getProviderEvaluation(command.payload.evaluation_ref.id) : undefined;
    const evidenceRefs = command.command_type === "EvaluateProvider" ? command.payload.evidence_refs : evaluation?.evidence_refs ?? [];
    const evidence = evidenceRefs.map(ref => tx.getProviderEvidence(ref.id));
    if (!evidence.length || evidence.some(e => !e || e.project_id !== context.project.id || e.descriptor_ref.id !== descriptor.id || !same(e.descriptor_digest, contentDigest(descriptor)))) return fail("EVIDENCE_MISSING", "须使用该固定 Descriptor 的 Provider 作用域证据");
    const records = evidence as ProviderEvidence[];
    const profile = command.command_type === "EvaluateProvider" ? command.payload.profile : evaluation?.profile;
    if (!profile) return fail("PROVIDER_NOT_EVALUATED", "未找到正式 Provider 评测");
    const runtimeRule=descriptor.provider_kind==='runtime'&&(command.command_type==='EvaluateProvider'
      ? profile==='controlled_execution'&&typeof port.readRuntimeControlEvidence==='function'
      : evaluation&&usesControlEvidence(evaluation))?controlRule:rule;
    let computed: ReturnType<typeof assessProvider>;
    try {
      computed = assessProvider(port, context.project, descriptor, records, profile, tx,runtimeRule);
      if(runtimeRule===controlRule&&!same(computed,assessProvider(port,context.project,descriptor,records,profile,tx,runtimeRule)))throw Error('Runtime control evidence changed during evaluation');
    }
    catch { return fail("PROVIDER_OUTPUT_INVALID", "Provider 原始来源或证据已失效"); }
    if (command.command_type === "EvaluateProvider") {
      const value: ProviderEvaluation = { ...metadata, purpose: "provider_assessment", descriptor_ref: command.payload.descriptor_ref,
        descriptor_digest: command.payload.descriptor_digest, profile, rule_version: descriptor.provider_kind === "skill" ? skillAssessmentRule : rule, evidence_refs: evidenceRefs, ...computed };
      tx.insertProviderEvaluation(value); event_type = "ProviderEvaluated"; record = { evaluation: value };
    } else {
      if (!evaluation || providerEvaluationStatus(tx, descriptor, evaluation).length || !same(computed, { input_digest: evaluation.input_digest,
        outcome: evaluation.outcome, reasons: evaluation.reasons, assessments: evaluation.assessments }) || !same(command.payload.input_digest, computed.input_digest)) return fail("PROVIDER_NOT_EVALUATED", "须使用当前、完整且允许的 Provider 评测", { blockers: computed.reasons });
      const taskExecution=command.payload.binding_scope==='task_execution';
      if(taskExecution?(descriptor.provider_kind!=='runtime'||profile!=='controlled_execution'||runtimeRule!==controlRule||command.payload.capability.capability_id!=='runtime.execute'):profile!=='technical_contract')return fail('CAPABILITY_UNAVAILABLE','Task 执行绑定需要完整 Runtime 受控评估与执行能力；Skill 正式绑定尚未装载');
      if (!descriptor.capabilities.some(c => same(c, command.payload.capability))) fail("CAPABILITY_UNAVAILABLE", "Provider 未声明该能力");
      if (!same(descriptor.required_permissions, command.payload.effective_permissions)) fail("CAPABILITY_PERMISSION_DENIED", "Provider 绑定须精确保持声明权限；Task 当前授权交集仍须逐次核验");
      if (descriptor.dependencies.length) fail("DEPENDENCY_UNSATISFIED", "本批 Runtime 探针不支持依赖装配");
      let runtimeBinding: ProviderBinding | undefined;
      if (descriptor.provider_kind === "skill") {
        if (!("runtime_binding_ref" in command.payload)) return fail("CAPABILITY_UNAVAILABLE", "技能批准须固定实际 Runtime Binding");
        try { runtimeBinding = skillRuntimeBinding(tx, context.project, command.payload); }
        catch { return fail("PROVIDER_BINDING_STALE", "技能 Runtime Binding 不可核对"); }
        for (const value of records) {
          const observed = compileValidator<SkillProbeResult>(SkillProbeResultSchema)(port.readProbe(context.project, value.raw_result_ref));
          if (observed.runtime_binding_ref.id !== runtimeBinding.id || !same(observed.runtime_binding_digest, contentDigest(runtimeBinding)) || !same(observed.capability, command.payload.capability)) return fail("PROVIDER_BINDING_STALE", "技能评测与请求 Binding 或能力不一致");
        }
      } else if ("runtime_binding_ref" in command.payload) return fail("PROVIDER_BINDING_STALE", "Runtime 探针批准不能携带技能装配字段");
      const assignment = resolveAssignment(tx.listAssignments(context.actorId), { projectId: context.project.id, actorId: context.actorId,
        role: "project_owner", scope: { kind: "project", id: context.project.id }, now: context.now });
      if (!assignment) return fail("ROLE_NOT_ASSIGNED", "批准需要当前 Human Project Owner 指派");
      const binding: ProviderBinding = { ...metadata, descriptor_ref: command.payload.descriptor_ref, descriptor_digest: command.payload.descriptor_digest,
        capability: command.payload.capability, resolved_dependencies: [], input_schema_ref: descriptor.input_schema_ref, output_schema_ref: descriptor.output_schema_ref,
        effective_permissions: command.payload.effective_permissions, probe_evidence_refs: evidenceRefs,
        ...(runtimeBinding ? { runtime_binding_ref: { object_type: "provider_binding" as const, id: runtimeBinding.id } } : {}),
        approval: { assignment_ref: { object_type: "assignment", id: assignment.id }, evaluation_ref: command.payload.evaluation_ref,
          input_digest: computed.input_digest, binding_scope: command.payload.binding_scope } };
      tx.insertProviderBinding(binding); event_type = "ProviderBindingRegistered"; record = { binding };
    }
  }
  const project = { ...context.project, revision: context.project.revision + 1, updated_at: context.now };
  tx.updateProject(project, context.project.revision);
  return { event_type, aggregate: { object_type: "project" as const, id: project.id }, revision: project.revision,
    payload: record, data: { project, ...record } as CommandSuccess["data"] };
};
