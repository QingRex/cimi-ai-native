import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { compileValidator, AgentContextManifestSchema, AgentRunRecordSchema, ProviderBindingSchema,
  SkillMethodInputReferenceSchema, SkillMethodQualificationReferenceSchema, SkillInvocationPreparationSchema,
  SkillInvocationSchema,
  type Project, type ProviderDescriptor, type ProviderBinding, type SkillInvocation, type SkillInvocationPreparation,
  type AgentContextManifest, type AgentRunRecord, type ExternalReference } from "@cimiloop/protocol/v2";
import { requestDigest, runContextDigest, type SkillInvocationVerifierPort } from "@cimiloop/kernel";
import { parseSkillMethodInput, fixedMethodInvocationPlan } from "@cimiloop/skill-adapter";
import { validateFixedMethodContext } from "@cimiloop/runtime-adapter";
import { LocalSkillPackageStore } from "./skills-local.js";
import type { ContentReference } from "./evidence-local.js";

const same = (a: unknown, b: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
const hash = requestDigest;
type PrepareInput = Parameters<SkillInvocationVerifierPort["prepare"]>[4];
export type LocalSkillMethodPlan = ReturnType<typeof fixedMethodInvocationPlan> & {
  input_ref: SkillInvocation["input_ref"];
  package_ref: SkillInvocation["package_ref"];
  input_schema_ref: SkillInvocation["input_schema_ref"];
  output_schema_ref: SkillInvocation["output_schema_ref"];
  harness_requirements: string[];
};
export interface LocalSkillMethodQualificationPort {
  // Trusted, read-only host admission. Re-read actual named-method qualification,
  // current WorkItem/Provider/budget authority, complete harness dependencies and
  // permission intersection. An imported report or an ALLOW label is insufficient.
  // There is deliberately no default implementation or serialized verified flag.
  verify(project: Project, record: AgentRunRecord, context: AgentContextManifest,
    binding: ProviderBinding, descriptor: ProviderDescriptor, plan: LocalSkillMethodPlan): SkillInvocation["method_qualification_ref"];
}

// Reads actual immutable content; it neither executes a method nor approves one.
// A production Skill port composes this preparer with its original-effect ledger.
export class LocalSkillMethodInputs {
  readonly packages: LocalSkillPackageStore;
  constructor(readonly repositoryPath: string, readonly dataDirectory: string) {
    this.packages = new LocalSkillPackageStore(repositoryPath, dataDirectory);
  }
  invocationPreparer(readDescriptor: (id: string) => ProviderDescriptor | undefined,
    qualification?: LocalSkillMethodQualificationPort): SkillInvocationVerifierPort["prepare"] {
    return (project, record, context, binding, input) => {
      const descriptor = readDescriptor(binding.descriptor_ref.id);
      if (!descriptor) throw new Error("Original Skill descriptor unavailable");
      const result = this.prepare(project, record, context, binding, descriptor, input, qualification);
      const current = readDescriptor(binding.descriptor_ref.id);
      if (!current || !same(descriptor, current)) throw new Error("Skill descriptor changed during admission");
      return result;
    };
  }
  read(project: Project, descriptor: ProviderDescriptor, input: PrepareInput): LocalSkillMethodPlan {
    if (resolve(project.repository_path) !== resolve(this.repositoryPath) || descriptor.project_id !== project.id) throw new Error("Skill method project mismatch");
    const input_ref = compileValidator<SkillInvocation["input_ref"]>(SkillMethodInputReferenceSchema)(structuredClone(input.input_ref));
    const bytes = this.packages.content.readContent(input_ref);
    if (bytes.length > 384 * 1024) throw new Error("Skill method input byte limit");
    const methodInput = parseSkillMethodInput(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    const verified = this.packages.inspect(descriptor);
    const artifacts = methodInput.purpose === "review" ? methodInput.artifact_refs.map(ref => ({ ref, bytes: this.readArtifact(ref) })) : [];
    const plan = fixedMethodInvocationPlan(verified, { format: "cimiloop/named-skill-method/1.0.0", invocation_key: input.invocation_key,
      method_name: input.method_name, source_digest: verified.source_digest, input: methodInput }, artifacts);
    // Apply the actual pinned SDK read bounds before creating any effect or claim.
    validateFixedMethodContext(plan.profile, plan.files, input.invocation_key);
    const { version: _version, ...package_ref } = descriptor.source_ref;
    return { ...plan, input_ref, package_ref: package_ref as SkillInvocation["package_ref"],
      input_schema_ref: structuredClone(descriptor.input_schema_ref), output_schema_ref: structuredClone(descriptor.output_schema_ref),
      harness_requirements: [...verified.package.spec.harness_requirements] };
  }
  private readArtifact(ref: ExternalReference): Buffer {
    if (ref.provider !== "local_content" || !["workspace_file", "workspace_diff", "provider_probe_artifact"].includes(ref.resource_type) ||
      !ref.digest || ref.digest.algorithm !== "sha256" || ref.locator !== ref.digest.value) throw new Error("Unsupported fixed skill artifact");
    const bytes = this.packages.content.readContent({ provider: "local_content", resource_type: ref.resource_type,
      locator: ref.locator, digest: ref.digest } as ContentReference);
    if (bytes.length > 256 * 1024) throw new Error("Skill method artifact byte limit");
    return bytes;
  }
  prepare(project: Project, rawRecord: AgentRunRecord, rawContext: AgentContextManifest, rawBinding: ProviderBinding,
    descriptor: ProviderDescriptor, input: PrepareInput, qualification?: LocalSkillMethodQualificationPort): SkillInvocationPreparation {
    if (!qualification) throw new Error("Named method qualification host unavailable");
    const record = compileValidator<AgentRunRecord>(AgentRunRecordSchema)(structuredClone(rawRecord));
    const context = compileValidator<AgentContextManifest>(AgentContextManifestSchema)(structuredClone(rawContext));
    const binding = compileValidator<ProviderBinding>(ProviderBindingSchema)(structuredClone(rawBinding));
    const selected = context.skill_bindings.find(pin => pin.binding_ref.id === binding.id);
    if (project.repository_kind !== "git" || record.project_id !== project.id || context.project_id !== project.id || record.context_ref.id !== context.id ||
      record.task_id !== context.task_id || record.work_item_ref.id !== context.work_item_ref.id || record.executor_ref.id !== context.executor_ref.id ||
      record.change_id !== context.change_id || !same(record.definition_ref, context.definition_ref) || !same(record.contract_ref, context.contract_ref) ||
      !same(record.plan_ref, context.plan_ref) || !same(record.source_snapshot_ref, context.source_snapshot_ref) || record.workspace_before_ref.id !== context.workspace_snapshot_ref.id ||
      !same(record.runtime_binding, context.runtime_binding) || !same(record.skill_bindings, context.skill_bindings) ||
      !same(record.host_admission_ref, context.host_admission_ref) || !same(record.input_digest, context.input_digest) ||
      !same(runContextDigest(context), context.input_digest) ||
      binding.project_id !== project.id || !selected || selected.digest.value !== hash(binding) || binding.runtime_binding_ref?.id !== record.runtime_binding.binding_ref.id ||
      binding.descriptor_ref.id !== descriptor.id || binding.descriptor_digest.value !== hash(descriptor) ||
      !same(binding.input_schema_ref, descriptor.input_schema_ref) || !same(binding.output_schema_ref, descriptor.output_schema_ref)) throw new Error("Skill preparation parent or Binding mismatch");
    const plan = this.read(project, descriptor, input);
    if (!binding.approval || binding.approval.binding_scope !== "task_execution" ||
      binding.capability.capability_id !== (plan.request.input.purpose === "review" ? "verification.review" : "intent.clarify") ||
      context.boundary === "agent_independent_read_only" && plan.request.input.purpose !== "review") throw new Error("Skill preparation capability or execution scope mismatch");
    const method_qualification_ref = compileValidator<SkillInvocation["method_qualification_ref"]>(SkillMethodQualificationReferenceSchema)(qualification.verify(
      structuredClone(project), structuredClone(record), structuredClone(context), structuredClone(binding), structuredClone(descriptor), structuredClone(plan)));
    this.packages.content.readContent(method_qualification_ref);
    // Admission is not allowed to mutate pinned bytes or the inspected packet.
    if (!same(plan, this.read(project, descriptor, input))) throw new Error("Skill method inputs changed during admission");
    return compileValidator<SkillInvocationPreparation>(SkillInvocationPreparationSchema)({ request: plan.request, package_ref: plan.package_ref,
      input_schema_ref: plan.input_schema_ref, output_schema_ref: plan.output_schema_ref, method_qualification_ref });
  }
  readInvocation(project: Project, descriptor: ProviderDescriptor, invocation: SkillInvocation): LocalSkillMethodPlan {
    invocation = compileValidator<SkillInvocation>(SkillInvocationSchema)(structuredClone(invocation));
    if (invocation.project_id !== project.id) throw new Error("Skill invocation project mismatch");
    const { input_digest, ...body } = invocation;
    if (input_digest.value !== hash(body)) throw new Error("Original skill invocation digest mismatch");
    const plan = this.read(project, descriptor, { invocation_key: invocation.invocation_key, method_name: invocation.request.method_name, input_ref: invocation.input_ref });
    if (!same(plan.request, invocation.request) || !same(plan.package_ref, invocation.package_ref) ||
      !same(plan.input_schema_ref, invocation.input_schema_ref) || !same(plan.output_schema_ref, invocation.output_schema_ref)) throw new Error("Original skill invocation inputs changed");
    return plan;
  }
}
