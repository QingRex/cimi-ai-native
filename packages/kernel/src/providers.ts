import { SCHEMA_VERSION, type RegisterProviderCommand, type ProviderDescriptor, type ProviderCatalogResult,
  type Project, type InternalId, type CommandSuccess, type DomainError, type ProviderDependency, type ExternalReference, type ProviderBinding } from "@cimiloop/protocol/v2";
import type { ProjectReader, ProviderReader, StoreTransaction } from "@cimiloop/store";
import { contentDigest, IntentFailure } from "./intent.js";
import { providerEvaluationStatus } from "./provider-assessment.js";

const same = (left: unknown, right: unknown): boolean => contentDigest(left).value === contentDigest(right).value;
type Context = { project: Project; actorId: InternalId; now: string; id: () => InternalId };
export const registerProvider = (tx: StoreTransaction, command: RegisterProviderCommand, context: Context) => {
  const fail = (code: DomainError["code"], message: string): never => {
    throw new IntentFailure({ schema_version: SCHEMA_VERSION, code, message, category: "conflict", retryable: false,
      details: {}, correlation_id: command.correlation_id });
  };
  if (command.target.id !== context.project.id) fail("SCOPE_INVALID", "Provider 登记目标必须是当前项目");
  if (command.expected_revision !== context.project.revision) fail("REVISION_CONFLICT", "Project 已变化，须重新核对 Provider 登记");
  if (tx.listProviderDescriptors().some(record => record.project_id === context.project.id && record.provider_kind === command.payload.provider_kind &&
    record.name === command.payload.name && record.version === command.payload.version)) fail("PROVIDER_VERSION_CONFLICT", "同类、同名 Provider 的该版本已登记；内容变化须使用新版本");
  const dependencies = command.payload.dependencies;
  if (new Set(dependencies.map(d => d.descriptor_ref.id)).size !== dependencies.length) fail("DEPENDENCY_UNSATISFIED", "依赖不能对同一 Descriptor 声明多个摘要");
  for (const dependency of dependencies) {
    const record = tx.getProviderDescriptor(dependency.descriptor_ref.id);
    if (!record || record.project_id !== context.project.id || !same(contentDigest(record), dependency.digest)) fail("DEPENDENCY_UNSATISFIED", "依赖必须固定为当前项目已有 Descriptor 的实际摘要");
  }
  const descriptor: ProviderDescriptor = { ...command.payload, schema_version: SCHEMA_VERSION, id: context.id(),
    project_id: context.project.id, created_at: context.now, producer_actor_id: context.actorId, trust_status: "candidate" };
  const project = { ...context.project, revision: context.project.revision + 1, updated_at: context.now };
  tx.insertProviderDescriptor(descriptor); tx.updateProject(project, context.project.revision);
  const data = { project, descriptor };
  return { event_type: "ProviderRegistered", aggregate: { object_type: "project" as const, id: project.id }, revision: project.revision,
    data: data as CommandSuccess["data"], payload: { descriptor } };
};

// Explicit identity convention for future trusted Agent ingress. Matching native
// metadata does not authenticate a request or enable a runtime.
export const providerBindingIdentity = (binding: ProviderBinding): ExternalReference => ({
  provider: "cimiloop", resource_type: "provider_binding", locator: binding.id, digest: contentDigest(binding)
});
const dependencyBlockers = (reader: ProviderReader, projectId: string, dependencies: ProviderDependency[]): string[] => {
  const reasons: string[] = [];
  if (new Set(dependencies.map(d => d.descriptor_ref.id)).size !== dependencies.length) reasons.push("DEPENDENCY_DUPLICATE");
  for (const dependency of dependencies) {
    const actual = reader.getProviderDescriptor(dependency.descriptor_ref.id);
    if (!actual || actual.project_id !== projectId) reasons.push("DEPENDENCY_NOT_FOUND");
    else if (!same(contentDigest(actual), dependency.digest)) reasons.push("DEPENDENCY_DIGEST_MISMATCH");
    else if (!reader.listProviderEvaluations().some(e => e.descriptor_ref.id === actual.id && e.profile === "controlled_execution" && providerEvaluationStatus(reader, actual, e).length === 0)) reasons.push("DEPENDENCY_NOT_EVALUATED");
  }
  return [...new Set(reasons)];
};
export const agentBindingStatus = (reader: ProviderReader, projectId: string, identity: ExternalReference) => {
  const binding = identity.provider === "cimiloop" && identity.resource_type === "provider_binding" ? reader.getProviderBinding(identity.locator) : undefined;
  const owned = binding?.project_id === projectId ? binding : undefined;
  const descriptor = owned ? reader.getProviderDescriptor(owned.descriptor_ref.id) : undefined;
  const matches = !!owned && same(identity, providerBindingIdentity(owned));
  const blockers = ["AGENT_INGRESS_NOT_IMPLEMENTED", "AGENT_RUN_NOT_IMPLEMENTED"];
  if (!owned) blockers.push("PROVIDER_BINDING_NOT_FOUND");
  else {
    if (!matches) blockers.push("PROVIDER_IDENTITY_MISMATCH");
    if (!descriptor || descriptor.project_id !== projectId || !same(contentDigest(descriptor), owned.descriptor_digest)) blockers.push("PROVIDER_BINDING_STALE");
    if (descriptor?.provider_kind !== "runtime") blockers.push("RUNTIME_BINDING_REQUIRED");
    if (!owned.approval) blockers.push("PROVIDER_BINDING_NOT_APPROVED");
    else {
      if (owned.approval.binding_scope !== "task_execution") blockers.push("PROVIDER_BINDING_SCOPE_PROBE_ONLY");
      if (descriptor) blockers.push(...providerEvaluationStatus(reader, descriptor, reader.getProviderEvaluation(owned.approval.evaluation_ref.id)));
    }
  }
  return { binding: owned, matches, blockers };
};
export const providerCatalog = (reader: ProjectReader): Omit<ProviderCatalogResult, "schema_version" | "ok" | "as_of_event_sequence"> => {
  const project = reader.getProject()!;
  const descriptors = reader.listProviderDescriptors().filter(record => record.project_id === project.id);
  const bindings = reader.listProviderBindings().filter(record => record.project_id === project.id);
  const evaluations = reader.listProviderEvaluations().filter(record => record.project_id === project.id);
  return { descriptors, bindings, assessment_checks: evaluations.map(evaluation => {
    const descriptor = descriptors.find(d => d.id === evaluation.descriptor_ref.id);
    return { evaluation_ref: { object_type: "evaluation" as const, id: evaluation.id }, descriptor_ref: evaluation.descriptor_ref,
      profile: evaluation.profile, outcome: evaluation.outcome, input_digest: evaluation.input_digest,
      blockers: descriptor ? providerEvaluationStatus(reader, descriptor, evaluation) : ["PROVIDER_DESCRIPTOR_NOT_FOUND"] };
  }), admission: descriptors.map(descriptor => ({
    descriptor_ref: { object_type: "provider_descriptor", id: descriptor.id }, descriptor_digest: contentDigest(descriptor), execution_enabled: false,
    blockers: [...(!evaluations.some(e => e.descriptor_ref.id === descriptor.id && e.profile === "controlled_execution" && providerEvaluationStatus(reader, descriptor, e).length === 0) ? ["PROVIDER_CONTROLLED_EXECUTION_NOT_EVALUATED"] : []),
      ...dependencyBlockers(reader, project.id, descriptor.dependencies),
      ...(descriptor.provider_kind === "runtime" ? ["RUNTIME_ENFORCEMENT_INCOMPLETE"] : ["PROVIDER_EXECUTION_NOT_IMPLEMENTED"])]
  })), binding_checks: bindings.map(binding => {
    const descriptor = descriptors.find(d => d.id === binding.descriptor_ref.id), blockers: string[] = [];
    if (!descriptor || !same(contentDigest(descriptor), binding.descriptor_digest)) blockers.push("PROVIDER_BINDING_STALE");
    if (descriptor) {
      if (!binding.approval) {
        if (descriptor.trust_status !== "evaluated") blockers.push("PROVIDER_NOT_EVALUATED");
        else blockers.push("PROVIDER_EVALUATION_SCOPE_UNSUPPORTED");
      } else {
        const evaluation = reader.getProviderEvaluation(binding.approval.evaluation_ref.id);
        blockers.push(...providerEvaluationStatus(reader, descriptor, evaluation));
        if (evaluation && (!same(evaluation.input_digest, binding.approval.input_digest) || !same(evaluation.evidence_refs, binding.probe_evidence_refs))) blockers.push("PROVIDER_BINDING_STALE");
        if (binding.approval.binding_scope === "isolated_provider_probe") blockers.push("PROVIDER_BINDING_SCOPE_PROBE_ONLY");
        else if (evaluation?.profile !== "controlled_execution") blockers.push("PROVIDER_ASSESSMENT_PROFILE_MISMATCH");
      }
      if (!descriptor.capabilities.some(c => same(c, binding.capability))) blockers.push("CAPABILITY_NOT_DECLARED");
      if (!same(descriptor.input_schema_ref, binding.input_schema_ref) || !same(descriptor.output_schema_ref, binding.output_schema_ref)) blockers.push("SCHEMA_BINDING_MISMATCH");
      if (!same(descriptor.dependencies, binding.resolved_dependencies)) blockers.push("DEPENDENCY_BINDING_MISMATCH");
    }
    blockers.push(...dependencyBlockers(reader, project.id, binding.resolved_dependencies), "PERMISSION_ENFORCEMENT_UNVERIFIED");
    if (!binding.approval) blockers.push("PROVIDER_PROBE_EVIDENCE_SCOPE_UNSUPPORTED", "PROVIDER_BINDING_NOT_APPROVED");
    if (binding.runtime_binding_ref) {
      const runtime = bindings.find(b => b.id === binding.runtime_binding_ref!.id), runtimeDescriptor = runtime ? descriptors.find(d => d.id === runtime.descriptor_ref.id) : undefined;
      if (!runtime || runtime.id === binding.id || runtimeDescriptor?.provider_kind !== "runtime") blockers.push("RUNTIME_BINDING_REQUIRED");
    }
    return { binding_ref: { object_type: "provider_binding" as const, id: binding.id }, binding_digest: contentDigest(binding), execution_enabled: false as const, blockers: [...new Set(blockers)] };
  }), agent_bindings: reader.listActors().filter(actor => actor.project_id === project.id && actor.actor_type === "agent").map(actor => {
    if (actor.actor_type !== "agent") throw new Error("agent expected");
    const { binding, matches, blockers } = agentBindingStatus(reader, project.id, actor.provider_identity_ref);
    return { actor_ref: { object_type: "actor" as const, id: actor.id }, ...(binding ? { binding_ref: { object_type: "provider_binding" as const, id: binding.id } } : {}),
      identity_matches_binding: matches, execution_enabled: false as const, blockers };
  }) };
};
