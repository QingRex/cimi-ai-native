import { type AgentRunBindings, type Actor, type ProviderBinding, type Project, type WorkItem } from "@cimiloop/protocol/v2";
import type { StoreTransaction } from "@cimiloop/store";
import { assignmentIsEffective } from "./authorization.js";
import { contentDigest } from "./intent.js";
import { providerEvaluationStatus } from "./provider-assessment.js";
import { providerBindingIdentity } from "./providers.js";

const same = (a: unknown, b: unknown) => contentDigest(a).value === contentDigest(b).value;
// Native metadata is necessary, never sufficient: the trusted host must also
// re-read qualification bytes and prove the current enforcement configuration.
export const agentRunBindingBlockers = (tx: StoreTransaction, project: Project, actor: Actor, item: WorkItem, pins: AgentRunBindings, now: string): string[] => {
  const blockers: string[] = [];
  const checked = new Set<string>();
  const binding = (pin: AgentRunBindings["runtime_binding"], kind: "runtime" | "skill"): ProviderBinding | undefined => {
    const value = tx.getProviderBinding(pin.binding_ref.id), descriptor = value ? tx.getProviderDescriptor(value.descriptor_ref.id) : undefined;
    if (checked.has(pin.binding_ref.id)) blockers.push("PROVIDER_BINDING_DUPLICATE"); checked.add(pin.binding_ref.id);
    if (!value || value.project_id !== project.id || !same(pin.digest, contentDigest(value))) { blockers.push("PROVIDER_BINDING_NOT_FOUND_OR_STALE"); return undefined; }
    if (!descriptor || descriptor.project_id !== project.id || descriptor.provider_kind !== kind || !same(value.descriptor_digest, contentDigest(descriptor))) { blockers.push("PROVIDER_BINDING_KIND_OR_DIGEST_MISMATCH"); return undefined; }
    if (!value.approval || value.approval.binding_scope !== "task_execution") blockers.push("PROVIDER_BINDING_SCOPE_PROBE_ONLY");
    const evaluation = value.approval ? tx.getProviderEvaluation(value.approval.evaluation_ref.id) : undefined;
    blockers.push(...providerEvaluationStatus(tx, descriptor, evaluation));
    if (evaluation?.profile !== "controlled_execution" || !value.approval || !same(evaluation?.input_digest, value.approval.input_digest) || !same(evaluation?.evidence_refs, value.probe_evidence_refs)) blockers.push("PROVIDER_CONTROLLED_EXECUTION_NOT_EVALUATED");
    const assignment = value.approval ? tx.listAssignments(value.producer_actor_id).find(a => a.id === value.approval!.assignment_ref.id) : undefined;
    if (!assignment || assignment.project_id !== project.id || assignment.actor_id !== value.producer_actor_id || assignment.role_key !== "project_owner" || assignment.scope.kind !== "project" || assignment.scope.id !== project.id ||
      tx.getActor(assignment.actor_id)?.actor_type !== "human" || !assignmentIsEffective(assignment, now) || Date.parse(assignment.created_at) > Date.parse(value.created_at)) blockers.push("PROVIDER_APPROVAL_NOT_EFFECTIVE");
    if (!descriptor.capabilities.some(capability => same(capability, value.capability)) || !same(descriptor.input_schema_ref, value.input_schema_ref) || !same(descriptor.output_schema_ref, value.output_schema_ref) ||
      !same(descriptor.dependencies, value.resolved_dependencies) || !same(descriptor.required_permissions, value.effective_permissions)) blockers.push("PROVIDER_BINDING_CONTRACT_MISMATCH");
    // Descriptor dependency admission is not wired to the Agent host yet.
    if (value.resolved_dependencies.length) blockers.push("PROVIDER_DEPENDENCY_ADMISSION_UNAVAILABLE");
    if (kind === "runtime" && (value.runtime_binding_ref || value.capability.capability_id !== "runtime.execute")) blockers.push("RUNTIME_EXECUTION_CAPABILITY_REQUIRED");
    if (kind === "skill" && value.runtime_binding_ref?.id !== pins.runtime_binding.binding_ref.id) blockers.push("SKILL_RUNTIME_BINDING_MISMATCH");
    return value;
  };
  const runtime = binding(pins.runtime_binding, "runtime");
  const skills = pins.skill_bindings.map(pin => binding(pin, "skill")).filter((value): value is ProviderBinding => !!value);
  if (runtime) {
    if (item.allowed_actions.some(action => !runtime.effective_permissions.actions.includes(action)) || runtime.effective_permissions.environment_ids.length) blockers.push("RUNTIME_PERMISSION_SCOPE_MISMATCH");
    for (const skill of skills) {
      const permissions = skill.effective_permissions;
      if (permissions.actions.some(action => !item.allowed_actions.includes(action as WorkItem["allowed_actions"][number]) || !runtime.effective_permissions.actions.includes(action)) ||
        permissions.resources.some(resource => !runtime.effective_permissions.resources.some(bound => same(bound, resource))) || permissions.environment_ids.length ||
        permissions.network_hosts.some(host => !runtime.effective_permissions.network_hosts.includes(host))) blockers.push("SKILL_PERMISSION_SCOPE_MISMATCH");
    }
  }
  if (actor.actor_type !== "agent" || actor.id !== item.executor_ref.id || !runtime || !same(actor.provider_identity_ref, providerBindingIdentity(runtime))) blockers.push("PROVIDER_IDENTITY_MISMATCH");
  if (!item.budget.max_cost) blockers.push("AGENT_COST_BOUND_REQUIRED");
  return [...new Set(blockers)];
};
