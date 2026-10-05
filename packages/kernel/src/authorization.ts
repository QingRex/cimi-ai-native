import type { Actor, Assignment, ExternalReference, InternalId, RoleKey, Scope } from "@cimiloop/protocol/v2";
import { requestDigest } from "./canonical.js";

/** Supplied by a trusted composition root, never deserialized from a Command. */
export type CallerContext =
  | { kind: "bootstrap" }
  | { kind: "local_operator"; project_id: InternalId; actor_id: InternalId }
  | { kind: "agent"; project_id: InternalId; actor_id: InternalId; provider_identity_ref: ExternalReference }
  | { kind: "system"; project_id: InternalId; actor_id: InternalId };

export const callerMatchesActor = (caller: Exclude<CallerContext, { kind: "bootstrap" }>, actor: Actor): boolean => {
  if (caller.actor_id !== actor.id || caller.project_id !== actor.project_id) return false;
  switch (caller.kind) {
    case "local_operator": return actor.actor_type === "human" && ["local_operator", "git_config"].includes(actor.identity_source);
    case "agent": return actor.actor_type === "agent" && requestDigest(caller.provider_identity_ref) === requestDigest(actor.provider_identity_ref);
    case "system": return actor.actor_type === "system" && actor.identity_source === "local_service";
  }
};

const endsAt = (assignment: Assignment): number => Math.min(
  assignment.expires_at ? Date.parse(assignment.expires_at) : Infinity,
  assignment.ended_at ? Date.parse(assignment.ended_at) : Infinity
);
export const assignmentIsEffective = (assignment: Assignment, now: string): boolean =>
  Date.parse(assignment.effective_at) <= Date.parse(now) && Date.parse(now) < endsAt(assignment);

export const assignmentIntervalsOverlap = (left: Assignment, right: Assignment): boolean =>
  Math.max(Date.parse(left.effective_at), Date.parse(right.effective_at)) < Math.min(endsAt(left), endsAt(right));

export const scopeAllowsRole = (role: RoleKey, scope: Scope["kind"]): boolean => {
  switch (role) {
    case "project_owner": case "flow_owner": return scope === "project";
    case "change_owner": case "requirement_owner": return scope === "change";
    case "technical_owner": case "quality_owner": return scope === "project" || scope === "change" || scope === "release_batch";
    case "release_owner": return scope === "release_batch" || scope === "environment";
    case "policy_owner": case "exception_owner": return true;
  }
};

export const resolveAssignment = (assignments: Assignment[], input: {
  projectId: InternalId; actorId: InternalId; role: RoleKey; scope: Scope; now: string;
}): Assignment | undefined => assignments.find(assignment =>
  assignment.project_id === input.projectId && assignment.actor_id === input.actorId && assignment.role_key === input.role &&
  assignment.scope.kind === input.scope.kind && assignment.scope.id === input.scope.id && assignmentIsEffective(assignment, input.now));
