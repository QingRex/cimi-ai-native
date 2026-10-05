import { SCHEMA_VERSION, type AnyCommand, type Change, type CommandSuccess, type DomainError, type InternalId,
  type Project, type ProjectSettingsVersion, type TargetVersion } from "@cimiloop/protocol/v2";
import type { PlanningReader, StoreTransaction } from "@cimiloop/store";
import { resolveAssignment } from "./authorization.js";
import { admissionFailure, lifecycleRecord } from "./intent.js";

export const isWip = (change: Change): boolean => change.operating_status === "Active" && ["Executing", "ReadyForDelivery"].includes(change.lifecycle_state);
export const loadSettings = (reader: PlanningReader, project: Project): ProjectSettingsVersion | undefined => {
  if (!project.settings_ref) return undefined;
  const settings = reader.getSettingsVersion(project.settings_ref.id);
  if (!settings || settings.project_id !== project.id || settings.version !== project.settings_ref.domain_version) throw new Error("Project settings pointer is inconsistent");
  return settings;
};
const fail = (command: { correlation_id: InternalId }, code: DomainError["code"], message: string,
  category: DomainError["category"] = "validation", details: Record<string, unknown> = {}): DomainError => ({
  schema_version: SCHEMA_VERSION, correlation_id: command.correlation_id, code, message, category, retryable: false, details
});
// The check and the caller's capacity-consuming write must share the same Store transaction.
export const checkWipCapacity = (tx: StoreTransaction, projectId: InternalId, limit: number, correlationId: InternalId): DomainError | undefined => {
  const used = tx.listChanges().filter(change => change.project_id === projectId && isWip(change)).length;
  if (used >= limit) return fail({ correlation_id: correlationId }, "WIP_LIMIT_EXCEEDED", "在制容量已满，等待评审、测试和发布仍计在制", "conflict", { used, limit, required: 1 });
};
export const validWindow = (window: { starts_at: string; ends_at: string }): boolean => {
  const valid = (value: string) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.length === 20 ? value.replace("Z", ".000Z") : value);
  return valid(window.starts_at) && valid(window.ends_at) && Date.parse(window.starts_at) < Date.parse(window.ends_at);
};
type FlowCommand = Extract<AnyCommand, { command_type: "UpdateProjectSettings" | "CreateTargetVersion" | "CloseTargetVersion" | "ChangePlanning" | "StartChange" }>;
interface Context { project: Project; actorId: InternalId; now: string; id: () => InternalId }
interface Mutation { event_type: string; payload: Record<string, unknown>; aggregate: CommandSuccess["aggregate"]; revision: number; data: CommandSuccess["data"] }
const hasRole = (tx: StoreTransaction, context: Context, actorId: InternalId, role: "project_owner" | "flow_owner", continuous = false): boolean => {
  if (tx.getActor(actorId)?.actor_type !== "human") return false;
  const assignment = resolveAssignment(tx.listAssignments(actorId), { actorId, projectId: context.project.id, role,
    scope: { kind: "project", id: context.project.id }, now: context.now });
  return !!assignment && (!continuous || (!assignment.expires_at && !assignment.ended_at));
};
export const requireFlowOwner = (tx: StoreTransaction, command: Exclude<AnyCommand, { command_type: "InitializeProject" }>, context: Context): ProjectSettingsVersion | DomainError => {
  const settings = loadSettings(tx, context.project);
  if (!settings) return fail(command, "PROJECT_SETTINGS_REQUIRED", "请先明确协调人、裁决人和在制上限", "conflict");
  if (command.acting_role !== "flow_owner" || context.actorId !== settings.settings.flow_owner_actor_id || !hasRole(tx, context, context.actorId, "flow_owner")) {
    return fail(command, "FLOW_OWNER_REQUIRED", "需要设置指定的当前 Human Flow Owner", "forbidden");
  }
  return settings;
};

export const executeFlow = (tx: StoreTransaction, command: FlowCommand, context: Context): Mutation | DomainError => {
  const previousSettings = loadSettings(tx, context.project);
  const projectCommand = ["UpdateProjectSettings", "CreateTargetVersion", "CloseTargetVersion"].includes(command.command_type);
  if (projectCommand) {
    if (command.target.id !== context.project.id) return fail(command, "SCOPE_INVALID", "命令目标必须是当前 Project");
    if (command.expected_revision !== context.project.revision) return fail(command, "REVISION_CONFLICT", "Project 已被修改", "conflict", { current_revision: context.project.revision });
  }
  const projectMutation = (eventType: string, payload: Record<string, unknown>, data: Record<string, unknown>, settingsRef?: Project["settings_ref"]): Mutation => {
    const project = { ...context.project, ...(settingsRef ? { settings_ref: settingsRef } : {}), revision: context.project.revision + 1, updated_at: context.now };
    tx.updateProject(project, context.project.revision);
    return { event_type: eventType, payload, aggregate: { object_type: "project", id: project.id }, revision: project.revision,
      data: { project, ...data } as CommandSuccess["data"] };
  };
  if (command.command_type === "UpdateProjectSettings") {
    if (command.acting_role !== "project_owner" || !hasRole(tx, context, context.actorId, "project_owner") || !hasRole(tx, context, context.actorId, "flow_owner") ||
      (previousSettings && previousSettings.settings.flow_owner_actor_id !== context.actorId)) {
      return fail(command, "FLOW_OWNER_REQUIRED", "设置变更需要操作者独立的 Project Owner 与当前 Flow Owner 指派", "forbidden");
    }
    const base = command.payload.base_settings_ref;
    if (previousSettings ? !base || base.id !== previousSettings.id || base.domain_version !== previousSettings.version : base !== null) {
      return fail(command, "SETTINGS_BASE_CONFLICT", "设置前置版本已变化，请刷新后重试", "conflict", { current_settings_ref: context.project.settings_ref ?? null });
    }
    const settings = command.payload.settings;
    if (settings.policy_ref) return fail(command, "CAPABILITY_UNAVAILABLE", "正式策略版本尚未实现，不能把任意引用作为有效策略");
    if (!hasRole(tx, context, settings.flow_owner_actor_id, "flow_owner", true)) return fail(command, "FLOW_OWNER_REQUIRED", "协调人须有当前持续有效的 Human Flow Owner 指派", "forbidden");
    if (!hasRole(tx, context, settings.priority_arbiter_actor_id, "project_owner", true)) return fail(command, "PRIORITY_ARBITER_REQUIRED", "裁决人须有当前持续有效的 Human Project Owner 指派", "forbidden");
    const used = tx.listChanges().filter(change => change.project_id === context.project.id && isWip(change)).length;
    if (settings.wip_limit < used) return fail(command, "WIP_LIMIT_EXCEEDED", "不能将上限降到当前在制数量以下", "conflict", { used, limit: settings.wip_limit });
    const version: ProjectSettingsVersion = { schema_version: SCHEMA_VERSION, id: context.id(), project_id: context.project.id,
      created_at: context.now, producer_actor_id: context.actorId, settings, version: (previousSettings?.version ?? 0) + 1,
      ...(context.project.settings_ref ? { predecessor_ref: context.project.settings_ref } : {}) };
    tx.insertSettingsVersion(version);
    return projectMutation("ProjectSettingsUpdated", { settings_version: version }, { settings_version: version },
      { object_type: "project_settings_version", id: version.id, domain_version: version.version });
  }
  if (command.command_type === "ChangePlanning" && command.payload.arbitration) {
    if (command.payload.priority === undefined || command.payload.target_version_id !== undefined) {
      return fail(command, "PRIORITY_ARBITER_REQUIRED", "争议裁决仅调整优先级；目标版本规划须使用 Flow Owner", "forbidden");
    }
    if (!previousSettings) return fail(command, "PROJECT_SETTINGS_REQUIRED", "请先明确裁决责任", "conflict");
    if (command.acting_role !== "project_owner" || context.actorId !== previousSettings.settings.priority_arbiter_actor_id || !hasRole(tx, context, context.actorId, "project_owner")) {
      return fail(command, "PRIORITY_ARBITER_REQUIRED", "排序争议须由设置指定的 Human 裁决人处理", "forbidden");
    }
  } else {
    const qualified = requireFlowOwner(tx, command, context); if ("code" in qualified) return qualified;
  }
  switch (command.command_type) {
    case "CreateTargetVersion": {
      if (command.payload.planned_window && !validWindow(command.payload.planned_window)) return fail(command, "INVALID_COMMAND", "规划窗口须为有效 UTC 日期且开始早于结束");
      if (tx.listTargetVersions().some(target => target.project_id === context.project.id && target.name === command.payload.name)) {
        return fail(command, "TARGET_VERSION_NAME_CONFLICT", "项目内目标版本名称已存在", "conflict");
      }
      const target: TargetVersion = { ...command.payload, schema_version: SCHEMA_VERSION, id: context.id(), project_id: context.project.id,
        status: "open", revision: 1, created_at: context.now, updated_at: context.now };
      tx.insertTargetVersion(target); return projectMutation("TargetVersionCreated", { target_version: target }, { target_version: target });
    }
    case "CloseTargetVersion": {
      const target = tx.getTargetVersion(command.payload.target_version_id);
      if (!target || target.project_id !== context.project.id) return fail(command, "TARGET_VERSION_NOT_FOUND", "未找到当前 Project 的目标版本", "not_found");
      if (target.revision !== command.payload.expected_target_revision) return fail(command, "REVISION_CONFLICT", "目标版本已变化", "conflict", { current_revision: target.revision });
      if (target.status === "closed") return fail(command, "TARGET_VERSION_CLOSED", "目标版本已关闭", "conflict");
      const closed: TargetVersion = { ...target, status: "closed", closed_reason: command.payload.reason, revision: target.revision + 1, updated_at: context.now };
      tx.updateTargetVersion(closed, target.revision); return projectMutation("TargetVersionClosed", { target_version: closed }, { target_version: closed });
    }
    case "ChangePlanning": case "StartChange": {
      const change = tx.getChange(command.target.id);
      if (!change || change.project_id !== context.project.id) return fail(command, "CHANGE_NOT_FOUND", "未找到当前 Project Change", "not_found");
      if (change.revision !== command.expected_revision) return fail(command, "REVISION_CONFLICT", "Change 已变化", "conflict", { current_revision: change.revision });
      if (command.command_type === "StartChange") {
        if (change.lifecycle_state !== "IntentReady" || change.operating_status !== "Active") return fail(command, "CHANGE_STATE_INVALID", "只有约定就绪且未暂停的 Change 可以申请开工", "conflict");
        if (!change.plan_ref || change.plan_ref.id !== command.payload.plan_ref.id || change.plan_ref.domain_version !== command.payload.plan_ref.domain_version || !change.contract_ref) {
          return fail(command, "EVIDENCE_MISSING", "缺少当前正式 Contract / Plan 确认依据", "conflict");
        }
        const settings = previousSettings!;
        if (command.payload.emergency_capacity_override) return fail(command, "CAPABILITY_UNAVAILABLE", "紧急超额准入需要真实决定与恢复安排核验，尚未接通");
        const capacity = checkWipCapacity(tx, context.project.id, settings.settings.wip_limit, command.correlation_id); if (capacity) return capacity;
        const baseline = admissionFailure(tx, command, change); if (baseline) return baseline;
        const next: Change = { ...change, lifecycle_state: "Executing", revision: change.revision + 1, updated_at: context.now };
        const transition = lifecycleRecord(change, "Executing", command, context, command.payload.opening_reason, [change.contract_ref, command.payload.plan_ref]);
        tx.insertIntentRecord("lifecycle_transition_record", transition); tx.updateChange(next, change.revision);
        return { event_type: "ChangeStarted", payload: { lifecycle_transition: transition }, aggregate: { object_type: "change", id: change.id }, revision: next.revision, data: { change: next } };
      }
      if (["Completed", "Terminated"].includes(change.lifecycle_state)) return fail(command, "CHANGE_STATE_INVALID", "已关闭 Change 不再调整规划", "conflict");
      const targetId = command.payload.target_version_id === undefined ? change.target_version_id : command.payload.target_version_id ?? undefined;
      if (targetId && command.payload.target_version_id !== undefined) {
        const target = tx.getTargetVersion(targetId);
        if (!target || target.project_id !== context.project.id) return fail(command, "TARGET_VERSION_NOT_FOUND", "目标版本不属于当前 Project", "not_found");
        if (target.status !== "open") return fail(command, "TARGET_VERSION_CLOSED", "不能新纳入已关闭目标版本", "conflict");
      }
      const priority = command.payload.priority ?? change.priority;
      if (priority === change.priority && targetId === change.target_version_id) return fail(command, "PLANNING_UNCHANGED", "规划内容没有变化", "conflict");
      const { target_version_id: _target, ...fields } = change;
      const next: Change = { ...fields, ...(targetId ? { target_version_id: targetId } : {}), priority, revision: change.revision + 1, updated_at: context.now };
      tx.updateChange(next, change.revision);
      return { event_type: "ChangePlanningUpdated", aggregate: { object_type: "change", id: change.id }, revision: next.revision, data: { change: next },
        payload: { previous_priority: change.priority, priority, ...(change.target_version_id ? { previous_target_version_id: change.target_version_id } : {}),
          ...(targetId ? { target_version_id: targetId } : {}), arbitration: command.payload.arbitration ?? false, reason: command.payload.reason } };
    }
  }
};
