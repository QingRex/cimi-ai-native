import { SCHEMA_VERSION, type Actor, type AnyCommand, type Assignment, type CommandSuccess,
  type DomainError, type InternalId, type Project } from "@cimiloop/protocol/v2";
import type { StoreTransaction } from "@cimiloop/store";
import { assignmentIntervalsOverlap, assignmentIsEffective, scopeAllowsRole } from "./authorization.js";
import { loadSettings } from "./flow.js";

export type GovernanceCommand = Extract<AnyCommand, { command_type:
  "RegisterActor" | "AssignResponsibility" | "EndAssignment" | "TransferChangeResponsibility" }>;
interface Context { project: Project; actorId: InternalId; now: string; id: () => InternalId }
interface Mutation {
  aggregate: CommandSuccess["aggregate"]; revision: number; data: CommandSuccess["data"];
  event_type: string; payload: Record<string, unknown>;
}
const validUtcInstant = (value: string): boolean => {
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) && instant.toISOString() === (value.length === 20 ? value.replace("Z", ".000Z") : value);
};
export const newAssignment = (context: Context, input: Pick<Assignment, "actor_id" | "role_key" | "scope"> & {
  effective_at?: string; expires_at?: string;
}): Assignment => ({
  schema_version: SCHEMA_VERSION, id: context.id(), project_id: context.project.id,
  ...input, effective_at: input.effective_at ?? context.now, granted_by: context.actorId,
  revision: 1, created_at: context.now, updated_at: context.now
});

export const executeGovernance = (tx: StoreTransaction, command: GovernanceCommand, context: Context): Mutation | DomainError => {
  const fail = (code: DomainError["code"], message: string, category: DomainError["category"] = "validation",
    details: Record<string, unknown> = {}): DomainError => ({
    schema_version: SCHEMA_VERSION, code, message, category, retryable: false, details, correlation_id: command.correlation_id
  });
  const human = (id: InternalId): Actor | DomainError => {
    const actor = tx.getActor(id);
    if (!actor || actor.project_id !== context.project.id) return fail("ACTOR_NOT_FOUND", "参与者未在当前 Project 注册", "not_found");
    if (actor.actor_type !== "human") return fail("HUMAN_RESPONSIBILITY_REQUIRED", "责任角色必须由 Human Actor 承担", "forbidden");
    return actor;
  };
  const projectMutation = (eventType: string, payload: Record<string, unknown>, data: Record<string, unknown>): Mutation => {
    const project = { ...context.project, revision: context.project.revision + 1, updated_at: context.now };
    tx.updateProject(project, context.project.revision);
    return { event_type: eventType, payload, aggregate: { object_type: "project", id: project.id },
      revision: project.revision, data: { project, ...data } as CommandSuccess["data"] };
  };
  if (command.command_type !== "TransferChangeResponsibility") {
    if (command.target.id !== context.project.id) return fail("SCOPE_INVALID", "治理命令目标必须是当前 Project");
    if (command.expected_revision !== context.project.revision) return fail("REVISION_CONFLICT", "Project 已被修改", "conflict", { current_revision: context.project.revision });
  }
  switch (command.command_type) {
    case "RegisterActor": {
      const actor: Actor = { ...command.payload, schema_version: SCHEMA_VERSION, id: context.id(),
        project_id: context.project.id, revision: 1, created_at: context.now, updated_at: context.now };
      // A runtime identity must not be registered twice under different Actor IDs.
      if (actor.actor_type === "agent" && tx.listActors().some(existing => existing.actor_type === "agent" &&
        existing.provider_identity_ref.provider === actor.provider_identity_ref.provider &&
        existing.provider_identity_ref.resource_type === actor.provider_identity_ref.resource_type &&
        existing.provider_identity_ref.locator === actor.provider_identity_ref.locator)) {
        return fail("ASSIGNMENT_CONFLICT", "Runtime 身份已有注册 Actor", "conflict");
      }
      tx.insertActor(actor);
      return projectMutation("ActorRegistered", { actor }, { actor });
    }
    case "AssignResponsibility": {
      const actor = human(command.payload.actor_id); if ("code" in actor) return actor;
      const { scope, role_key: role } = command.payload;
      if (!scopeAllowsRole(role, scope.kind)) return fail("SCOPE_INVALID", "角色不适用于该作用域");
      if (scope.kind === "project") {
        if (scope.id !== context.project.id) return fail("SCOPE_INVALID", "指派不能跨 Project");
      } else if (scope.kind === "change") {
        const change = tx.getChange(scope.id);
        if (!change || change.project_id !== context.project.id) return fail("SCOPE_INVALID", "Change 不属于当前 Project");
        if (role === "change_owner" || role === "requirement_owner") {
          const owner = role === "change_owner" ? change.owner_actor_id : change.requirement_owner_actor_id;
          if (owner !== actor.id) return fail("RESPONSIBILITY_HANDOFF_REQUIRED", "更换或首次设置责任人须使用责任移交命令", "conflict");
          if (command.payload.expires_at || (command.payload.effective_at && Date.parse(command.payload.effective_at) !== Date.parse(context.now))) {
            return fail("ASSIGNMENT_INTERVAL_INVALID", "Change 责任须立即生效且持续到明确移交");
          }
        }
      } else return fail("CAPABILITY_UNAVAILABLE", "发布批次与环境尚未实现，不能向不存在的对象指派责任");
      const start = Date.parse(command.payload.effective_at ?? context.now), end = command.payload.expires_at ? Date.parse(command.payload.expires_at) : Infinity;
      if (!validUtcInstant(command.payload.effective_at ?? context.now) ||
        (command.payload.expires_at && !validUtcInstant(command.payload.expires_at)) || start < Date.parse(context.now) || end <= start) {
        return fail("ASSIGNMENT_INTERVAL_INVALID", "指派时间须为有效 UTC 日期，不得回溯生效，到期须晚于生效时间");
      }
      const assignment = newAssignment(context, command.payload);
      const exclusive = role === "change_owner" || role === "requirement_owner";
      const overlap = tx.listAssignments().some(existing => existing.project_id === context.project.id && existing.role_key === role &&
        existing.scope.kind === scope.kind && existing.scope.id === scope.id && (exclusive || existing.actor_id === actor.id) &&
        assignmentIntervalsOverlap(existing, assignment));
      if (overlap) return fail("ASSIGNMENT_CONFLICT", "同一责任指派的有效时间不能重叠", "conflict");
      tx.insertAssignment(assignment);
      return projectMutation("ResponsibilityAssigned", { assignment }, { assignment });
    }
    case "EndAssignment": {
      const assignment = tx.getAssignment(command.payload.assignment_id);
      if (!assignment || assignment.project_id !== context.project.id) return fail("ASSIGNMENT_NOT_FOUND", "未找到当前 Project 指派", "not_found");
      if (assignment.revision !== command.payload.expected_assignment_revision) return fail("REVISION_CONFLICT", "指派已被修改", "conflict", { current_revision: assignment.revision });
      if (assignment.ended_at) return fail("ASSIGNMENT_ALREADY_ENDED", "指派已结束", "conflict");
      if (assignment.scope.kind === "change" && ["change_owner", "requirement_owner"].includes(assignment.role_key)) {
        const change = tx.getChange(assignment.scope.id);
        if (!change || change.project_id !== context.project.id) return fail("SCOPE_INVALID", "指派的 Change 引用无效");
        const owner = assignment.role_key === "change_owner" ? change.owner_actor_id : change.requirement_owner_actor_id;
        if (!["Completed", "Terminated"].includes(change.lifecycle_state) && owner === assignment.actor_id) {
          return fail("RESPONSIBILITY_HANDOFF_REQUIRED", "当前 Change 责任不能留下空缺，请原子移交", "conflict");
        }
      }
      if (assignment.role_key === "project_owner" && assignmentIsEffective(assignment, context.now) &&
        !tx.listAssignments().some(other => other.id !== assignment.id && other.project_id === context.project.id &&
          other.role_key === "project_owner" && other.scope.kind === "project" && other.scope.id === context.project.id &&
          !other.expires_at && !other.ended_at && tx.getActor(other.actor_id)?.actor_type === "human" && assignmentIsEffective(other, context.now))) {
        return fail("RESPONSIBILITY_HANDOFF_REQUIRED", "不能结束最后一名有效 Project Owner", "conflict");
      }
      const settings = loadSettings(tx, context.project);
      if (settings && assignmentIsEffective(assignment, context.now) && assignment.scope.kind === "project" &&
        ((assignment.role_key === "flow_owner" && assignment.actor_id === settings.settings.flow_owner_actor_id) ||
          (assignment.role_key === "project_owner" && assignment.actor_id === settings.settings.priority_arbiter_actor_id))) {
        return fail("RESPONSIBILITY_HANDOFF_REQUIRED", "该指派仍承担设置中的协调或裁决责任，请先更新设置完成移交", "conflict");
      }
      const ended = { ...assignment, ended_at: context.now, updated_at: context.now, revision: assignment.revision + 1 };
      tx.endAssignment(ended, assignment.revision);
      return projectMutation("AssignmentEnded", { assignment: ended, reason: command.payload.reason }, { assignment: ended });
    }
    case "TransferChangeResponsibility": {
      const change = tx.getChange(command.target.id);
      if (!change || change.project_id !== context.project.id) return fail("CHANGE_NOT_FOUND", "未找到当前 Project Change", "not_found");
      if (change.revision !== command.expected_revision) return fail("REVISION_CONFLICT", "Change 已被修改", "conflict", { current_revision: change.revision });
      if (["Completed", "Terminated"].includes(change.lifecycle_state)) return fail("CAPABILITY_UNAVAILABLE", "已关闭 Change 不再移交责任");
      const actor = human(command.payload.new_actor_id); if ("code" in actor) return actor;
      for (const ref of command.payload.grant_basis_refs) {
        const basis = tx.getAssignment(ref.id);
        if (!basis || basis.project_id !== context.project.id || basis.actor_id !== context.actorId || basis.role_key !== "project_owner" ||
          basis.scope.kind !== "project" || basis.scope.id !== context.project.id || !assignmentIsEffective(basis, context.now)) {
          return fail("GRANT_BASIS_INVALID", "移交依据必须是操作者当前有效的 Project Owner 指派", "forbidden");
        }
      }
      const role = command.payload.role_key, previousActorId = role === "change_owner" ? change.owner_actor_id : change.requirement_owner_actor_id;
      const previous = tx.listAssignments().filter(assignment => assignment.project_id === context.project.id &&
        assignment.role_key === role && assignment.scope.kind === "change" && assignment.scope.id === change.id &&
        !assignment.ended_at && (!assignment.expires_at || Date.parse(assignment.expires_at) > Date.parse(context.now)));
      if (previousActorId === actor.id && previous.some(assignment => assignment.actor_id === actor.id && assignmentIsEffective(assignment, context.now))) {
        return fail("ASSIGNMENT_CONFLICT", "该参与者已承担此责任", "conflict");
      }
      const ended = previous.map(assignment => ({ ...assignment, ended_at: context.now, updated_at: context.now, revision: assignment.revision + 1 }));
      const assignment = newAssignment(context, { actor_id: actor.id, role_key: role, scope: { kind: "change", id: change.id } });
      const next = { ...change, ...(role === "change_owner" ? { owner_actor_id: actor.id } : { requirement_owner_actor_id: actor.id }),
        revision: change.revision + 1, updated_at: context.now };
      for (const old of ended) tx.endAssignment(old, old.revision - 1);
      tx.insertAssignment(assignment); tx.updateChange(next, change.revision);
      return { event_type: "ChangeResponsibilityTransferred", aggregate: { object_type: "change", id: change.id }, revision: next.revision,
        data: { change: next, assignment, ended_assignments: ended }, payload: {
          role_key: role, ...(previousActorId ? { previous_actor_id: previousActorId } : {}), new_actor_id: actor.id,
          assignment, ended_assignments: ended, grant_basis_refs: command.payload.grant_basis_refs, reason: command.payload.reason
        } };
    }
  }
};
