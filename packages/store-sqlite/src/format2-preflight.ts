import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import * as v2 from "@cimiloop/protocol/v2";
import { parseVersionedCommandResult, parseVersionedRecord } from "@cimiloop/protocol";
import { initializeFormat2Database, initializeFormat3Database, initializeFormat4Database, initializeFormat5Database, initializeFormat6Database, initializeFormat7Database, MigrationError } from "./database-format.js";

type Row = Record<string, unknown>;
const unsafe = (message: string): never => { throw new MigrationError("MIGRATION_UNSAFE", message); };
const rows = (db: DatabaseSync, table: string): Row[] => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
const json = (row: Row, field = "payload_json"): unknown => JSON.parse(String(row[field]));
const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry: unknown) => entry && typeof entry === "object" && !Array.isArray(entry)
  ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
const signature = (db: DatabaseSync) => db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
  .all().map(row => ({ ...row, sql: String(row.sql).replace(/IF NOT EXISTS /gi, "").replace(/[\s"`]/g, "").toLowerCase() }));
const match = (row: Row, value: object, fields: string[]): void => {
  const record = value as Record<string, unknown>;
  if (fields.some(field => row[field] !== record[field])) unsafe("格式2索引与协议载荷不一致");
};
export const validateFormat2 = (db: DatabaseSync, now: string) => validateGovernanceFormat(db, now, 2);
export const validateFormat3 = (db: DatabaseSync, now: string) => validateGovernanceFormat(db, now, 3);
export const validateFormat4 = (db: DatabaseSync, now: string) => validateGovernanceFormat(db, now, 4);
export const validateFormat5 = (db: DatabaseSync, now: string) => validateGovernanceFormat(db, now, 5);
export const validateFormat6 = (db: DatabaseSync, now: string) => validateGovernanceFormat(db, now, 6);
export const validateFormat7 = (db: DatabaseSync, now: string) => validateGovernanceFormat(db, now, 7);
const validateGovernanceFormat = (db: DatabaseSync, now: string, format: 2 | 3 | 4 | 5 | 6 | 7) => {
  const reference = new DatabaseSync(":memory:");
  try { (format === 2 ? initializeFormat2Database : format === 3 ? initializeFormat3Database : format === 4 ? initializeFormat4Database : format === 5 ? initializeFormat5Database : format === 6 ? initializeFormat6Database : initializeFormat7Database)(reference); if (canonical(signature(db)) !== canonical(signature(reference))) unsafe(`格式${format}表、索引或触发器不匹配`); }
  finally { reference.close(); }
  if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) unsafe("格式2完整性检查失败");
  const projects = rows(db, "projects"); if (projects.length !== 1) unsafe("格式2迁移须有唯一 Project");
  const project = v2.compileValidator<v2.Project>(v2.ProjectSchema)(json(projects[0]!));
  match(projects[0]!, project, ["id", "revision"]);
  if (format === 2 && project.settings_ref) unsafe("格式2不能包含尚未实现的设置版本指针");
  const actors = new Map<string, v2.Actor>(), changes = new Map<string, v2.Change>(), assignments: v2.Assignment[] = [];
  const roles = new Map<string, v2.Role>();
  for (const row of rows(db, "actors")) {
    const actor = v2.compileValidator<v2.Actor>(v2.ActorSchema)(json(row)); match(row, actor, ["id", "revision"]);
    if (actor.project_id !== project.id) unsafe("Actor 跨项目"); actors.set(actor.id, actor);
  }
  for (const row of rows(db, "roles")) {
    const role = v2.compileValidator<v2.Role>(v2.RoleSchema)(json(row)); match(row, role, ["id", "role_key", "revision"]);
    if (role.project_id !== project.id) unsafe("Role 跨项目"); roles.set(role.id, role);
  }
  const settings = new Map<string, v2.ProjectSettingsVersion>(), targets = new Map<string, v2.TargetVersion>();
  if (format >= 3) {
    for (const row of rows(db, "project_settings_versions")) {
      const value = v2.compileValidator<v2.ProjectSettingsVersion>(v2.ProjectSettingsVersionSchema)(json(row)); match(row, value, ["id", "project_id", "version"]);
      if (value.project_id !== project.id || !actors.has(value.producer_actor_id) || value.settings.policy_ref) unsafe("设置版本来源无效");
      const prior = [...settings.values()].at(-1);
      if (value.version !== (prior?.version ?? 0) + 1 || canonical(value.predecessor_ref ?? null) !== canonical(prior ? { object_type: "project_settings_version", id: prior.id, domain_version: prior.version } : null)) unsafe("设置前驱链不连续");
      settings.set(value.id, value);
    }
    const latest = [...settings.values()].at(-1);
    if (canonical(project.settings_ref ?? null) !== canonical(latest ? { object_type: "project_settings_version", id: latest.id, domain_version: latest.version } : null)) unsafe("当前设置指针不一致");
    for (const row of rows(db, "target_versions")) {
      const value = v2.compileValidator<v2.TargetVersion>(v2.TargetVersionSchema)(json(row)); match(row, value, ["id", "project_id", "name", "revision", "status"]);
      if (value.project_id !== project.id) unsafe("目标版本跨项目"); targets.set(value.id, value);
    }
  }
  for (const row of rows(db, "changes")) {
    const change = v2.compileValidator<v2.Change>(v2.ChangeSchema)(json(row)); match(row, change, ["id", "project_id", "display_key", "lifecycle_state", "operating_status", "revision"]);
    if (change.project_id !== project.id || actors.get(change.owner_actor_id)?.actor_type !== "human" ||
      (change.requirement_owner_actor_id && actors.get(change.requirement_owner_actor_id)?.actor_type !== "human") ||
      (change.target_version_id && (format === 2 || !targets.has(change.target_version_id))) || (format < 4 && (change.contract_ref || change.plan_ref || change.lifecycle_state !== "Draft")) ||
      (format >= 4 && !["Draft", "IntentReady", "Executing", ...(format >= 6 ? ["ReadyForDelivery"] : [])].includes(change.lifecycle_state))) unsafe("旧格式Change身份、状态或未实现引用无效");
    changes.set(change.id, change);
  }
  for (const row of rows(db, "assignments")) {
    const assignment = v2.compileValidator<v2.Assignment>(v2.AssignmentSchema)(json(row)); match(row, assignment, ["id", "project_id", "actor_id", "revision"]);
    if ((row.role_id ?? undefined) !== assignment.role_id || assignment.project_id !== project.id || !actors.has(assignment.actor_id) || !actors.has(assignment.granted_by) ||
      (assignment.role_id && roles.get(assignment.role_id)?.role_key !== assignment.role_key) ||
      (assignment.scope.kind === "project" ? assignment.scope.id !== project.id : assignment.scope.kind !== "change" || !changes.has(assignment.scope.id))) unsafe("格式2指派引用无效");
    assignments.push(assignment);
  }
  const authorizedActors = assignments.filter(assignment => assignment.role_key === "project_owner" && assignment.scope.kind === "project" &&
    actors.get(assignment.actor_id)?.actor_type === "human" && Date.parse(assignment.effective_at) <= Date.parse(now) &&
    (!assignment.expires_at || Date.parse(assignment.expires_at) > Date.parse(now)) && (!assignment.ended_at || Date.parse(assignment.ended_at) > Date.parse(now)))
    .map(assignment => assignment.actor_id);
  if (!authorizedActors.length) unsafe("没有可执行迁移的有效 Human Project Owner");
  const allowedEvents = new Set(["ProjectInitialized", "ProjectMigrated", "ChangeCreated", "ChangePaused", "ChangeResumed",
    "ActorRegistered", "ResponsibilityAssigned", "AssignmentEnded", "ChangeResponsibilityTransferred"]);
  if (format >= 3) for (const type of ["ProjectSettingsUpdated", "TargetVersionCreated", "TargetVersionClosed", "ChangePlanningUpdated"]) allowedEvents.add(type);
  const intentEvents: Record<string, [string, v2.IntentRecordType | undefined]> = { ContractProposalSubmitted: ["proposal", "contract_proposal"], PlanProposalSubmitted: ["proposal", "plan_proposal"],
    RiskAssessed: ["risk_assessment", "risk_assessment"], DecisionRequested: ["request", "decision_request"], DecisionRecorded: ["decision", "decision"], ContractConfirmed: ["contract_version", "contract_version"], PlanConfirmed: ["plan_version", "plan_version"], ChangeStarted: ["lifecycle_transition", "lifecycle_transition_record"] };
  if (format >= 4) for (const type of Object.keys(intentEvents)) allowedEvents.add(type);
  const executionObjects = new Map<string, v2.ExecutionObjects[v2.ExecutionObjectType]>(), executionRecords = new Map<string, { kind: v2.ExecutionRecordType; value: v2.ExecutionRecords[v2.ExecutionRecordType] }>();
  if (format >= 5) {
    for (const type of ["PlanTasksInitialized", "StandingAuthorizationPublished", "StandingAuthorizationRevoked", "WorkItemCreated", "WorkItemRevoked"]) allowedEvents.add(type);
    for (const row of rows(db, "execution_objects")) {
      const kind = String(row.object_type) as v2.ExecutionObjectType;
      if (!Object.hasOwn(v2.executionObjectSchemas, kind)) unsafe("未知执行对象");
      const value = v2.compileValidator<v2.ExecutionObjects[v2.ExecutionObjectType]>(v2.executionObjectSchemas[kind])(json(row)); match(row, value, ["id", "project_id", "revision"]);
      if (value.project_id !== project.id || ("change_id" in value && !changes.has(value.change_id)) || (format < 7 && ((kind === "task" && (format < 6 ? ["Satisfied", "InProgress"] : ["InProgress"]).includes((value as v2.Task).status)) || (kind === "work_item" && (format < 6 ? ["Active", "Closed"] : ["Active"]).includes((value as v2.WorkItem).status))))) unsafe("旧格式执行状态或作用域超出已实现历史");
      if (format < 7 && kind === "task" && ((value as v2.Task).active_run_ref || (value as v2.Task).usage.attempts_released !== undefined || (value as v2.Task).usage.cost_reserved_micros !== undefined)) unsafe("旧格式不能包含运行字段");
      executionObjects.set(value.id, value);
    }
    for (const row of rows(db, "execution_records")) {
      const kind = String(row.object_type) as v2.ExecutionRecordType;
      if (!Object.hasOwn(v2.executionRecordSchemas, kind)) unsafe("未知执行记录");
      const value = v2.compileValidator<v2.ExecutionRecords[v2.ExecutionRecordType]>(v2.executionRecordSchemas[kind])(json(row)); match(row, value, ["id", "project_id", "producer_actor_id"]);
      if (value.project_id !== project.id || !actors.has(value.producer_actor_id)) unsafe("执行记录来源无效"); executionRecords.set(value.id, { kind, value });
    }
  }
  const runtimeCommands: Record<string, string> = { RunContextPrepared: "PrepareRunContext", RunReserved: "ReserveRun", RunObserved: "RecordRunObservation",
    RunReconciled: "ReconcileRun", RunCancellationRequested: "CancelRun", HandoffSaved: "SaveHandoff", ResumptionChecked: "CheckResumption" };
  const runtimeKeys: Record<string, v2.RuntimeRecordType> = { workspace: "workspace_snapshot", context: "context_manifest", record: "run_record", observation: "run_observation", handoff: "handoff_record", resumption: "resumption_record" };
  const runObjects = new Map<string, v2.Run>(), runtimeRecords = new Map<string, { kind: v2.RuntimeRecordType; value: v2.RuntimeRecords[v2.RuntimeRecordType] }>();
  if (format >= 7) {
    allowedEvents.add("ProviderRegistered"); for (const name of Object.keys(runtimeCommands)) allowedEvents.add(name);
    for (const row of rows(db, "run_objects")) {
      const value = v2.compileValidator<v2.Run>(v2.RunSchema)(json(row)); match(row, value, ["id", "project_id", "change_id", "revision"]);
      if (value.project_id !== project.id || !changes.has(value.change_id)) unsafe("运行作用域无效"); runObjects.set(value.id, value);
    }
    for (const row of rows(db, "run_records")) {
      const kind = String(row.object_type) as v2.RuntimeRecordType;
      if (!Object.hasOwn(v2.runtimeRecordSchemas, kind)) unsafe("未知运行记录");
      const value = v2.compileValidator<v2.RuntimeRecords[v2.RuntimeRecordType]>(v2.runtimeRecordSchemas[kind])(json(row));
      match(row, value, ["id", "project_id", "change_id", "producer_actor_id"]);
      if (value.project_id !== project.id || !changes.has(value.change_id) || !actors.has(value.producer_actor_id)) unsafe("运行记录作用域无效");
      runtimeRecords.set(value.id, { kind, value });
    }
  }
  const verificationKeys: Record<string, v2.VerificationRecordType> = { source_snapshot: "source_snapshot", evidence: "evidence", policy_snapshot: "policy_snapshot", requirement_set: "requirement_set_record", context: "evaluation_context", evaluation: "evaluation", satisfaction: "task_satisfaction_record", readiness: "integration_readiness_record" };
  const verificationFacts = new Map<string, { kind: v2.VerificationRecordType; value: Row }>();
  if (format >= 6) for (const type of ["SourceSnapshotCaptured", "EvidenceRecorded", "TaskEvaluationPrepared", "TaskEvaluated", "TaskSatisfied", "IntegrationEvaluated", "ChangeReadyForDelivery"]) allowedEvents.add(type);
  const eventRows = rows(db, "event_ledger").sort((a, b) => Number(a.event_sequence) - Number(b.event_sequence)), events = new Map<string, v2.EventEnvelope>();
  for (const [index, row] of eventRows.entries()) {
    const event = parseVersionedRecord("event", json(row, "envelope_json")) as v2.EventEnvelope;
    if (format < 7 && event.event_type === "ChangeResumed" && event.payload.reconciliation_refs !== undefined) unsafe("旧格式不能包含运行接续事实");
    match(row, event, ["event_id", "project_id", "event_sequence", "aggregate_revision", "event_type", "occurred_at"]);
    if (!allowedEvents.has(event.event_type) || event.event_sequence !== index + 1 || event.project_id !== project.id ||
      row.aggregate_type !== event.aggregate.object_type || row.aggregate_id !== event.aggregate.id || !actors.has(event.actor_id) ||
      (event.aggregate.object_type === "project" ? event.aggregate.id !== project.id : event.aggregate.object_type === "change" ? !changes.has(event.aggregate.id) : event.aggregate.object_type === "run" ? !runObjects.has(event.aggregate.id) : format < 5 || !executionObjects.has(event.aggregate.id))) unsafe("格式2事件序列或引用无效");
    if (event.event_type === "ProjectMigrated" && (event.payload.to_format > format || event.payload.from_format >= format)) unsafe("旧格式迁移事件不一致");
    events.set(event.event_id, event);
  }
  const counters = rows(db, "project_counters"), maximum = Math.max(0, ...[...changes.values()].map(change => Number(change.display_key.slice(4))));
  if (counters.length !== 1 || counters[0]!.project_id !== project.id || counters[0]!.event_sequence !== events.size || Number(counters[0]!.change_number) < maximum) unsafe("格式2计数器与事实不一致");
  const transitions = rows(db, "transition_records");
  for (const row of transitions) {
    const record = parseVersionedRecord("transition_record", json(row)) as v2.TransitionRecord;
    match(row, record, ["id", "project_id", "change_id", "command_id", "occurred_at"]);
    const event = [...events.values()].find(item => item.command_id === record.command_id);
    if (record.project_id !== project.id || !changes.has(record.change_id) || !actors.has(record.actor_id) || !event ||
      event.aggregate.id !== record.change_id || event.actor_id !== record.actor_id || event.occurred_at !== record.occurred_at ||
      event.event_type !== (record.transition_type === "change_paused" ? "ChangePaused" : "ChangeResumed") ||
      record.from_status !== (record.transition_type === "change_paused" ? "Active" : "Paused") ||
      record.to_status !== (record.transition_type === "change_paused" ? "Paused" : "Active") ||
      (event.event_type === "ChangePaused" && record.reason !== event.payload.reason)) unsafe("Transition 引用或状态事实无效");
  }
  const eventCommands: Record<string, string> = { ProjectInitialized: "InitializeProject", ChangeCreated: "CreateChange", ChangePaused: "PauseChange",
    ChangeResumed: "ResumeChange", ActorRegistered: "RegisterActor", ResponsibilityAssigned: "AssignResponsibility", AssignmentEnded: "EndAssignment", ChangeResponsibilityTransferred: "TransferChangeResponsibility",
    ProjectSettingsUpdated: "UpdateProjectSettings", TargetVersionCreated: "CreateTargetVersion", TargetVersionClosed: "CloseTargetVersion", ChangePlanningUpdated: "ChangePlanning",
    ContractProposalSubmitted: "SubmitContractProposal", PlanProposalSubmitted: "SubmitPlanProposal", RiskAssessed: "RecordRiskAssessment", DecisionRequested: "RequestDecision", DecisionRecorded: "RecordDecision", ContractConfirmed: "ConfirmContract", PlanConfirmed: "ConfirmPlan", ChangeStarted: "StartChange",
    PlanTasksInitialized: "InitializePlanTasks", StandingAuthorizationPublished: "PublishStandingAuthorization", StandingAuthorizationRevoked: "RevokeStandingAuthorization", WorkItemCreated: "CreateWorkItem", WorkItemRevoked: "RevokeWorkItem",
    SourceSnapshotCaptured: "CaptureSourceSnapshot", EvidenceRecorded: "RecordEvidence", TaskEvaluationPrepared: "PrepareTaskEvaluation", TaskEvaluated: "EvaluateTask", TaskSatisfied: "SatisfyTask", IntegrationEvaluated: "EvaluateIntegration", ChangeReadyForDelivery: "MarkReadyForIntegration",
    ProviderRegistered: "RegisterProvider", ...runtimeCommands };
  const receipts = new Map<string, { command_type: string; data: Record<string, unknown> }>();
  for (const row of rows(db, "command_receipts")) {
    const result = parseVersionedCommandResult(json(row, "result_json"));
    if (!/^[0-9a-f]{64}$/.test(String(row.request_digest))) unsafe("Receipt 摘要无效");
    if ("ok" in result) {
      if (result.command_id !== row.command_id || result.events.length !== 1 || result.events.some(event =>
        canonical(event) !== canonical(events.get(event.event_id)) || event.command_id !== row.command_id || event.aggregate_revision !== result.revision ||
        canonical(event.aggregate) !== canonical(result.aggregate))) unsafe("Receipt 与事件不一致");
      receipts.set(result.command_id, { command_type: "command_type" in result ? result.command_type : eventCommands[result.events[0]!.event_type]!, data: result.data });
    } else unsafe("格式2只能保存成功回执");
  }
  // Immutable receipts/events are the provenance of each current object. Schema-valid
  // JSON alone cannot justify a changed owner, revision, identity or assignment interval.
  const facts = { project: new Map<string, Row>(), actor: new Map<string, Row>(), role: new Map<string, Row>(), assignment: new Map<string, Row>(), change: new Map<string, Row>(), settings: new Map<string, Row>(), target: new Map<string, Row>() };
  const current = (kind: keyof typeof facts, input: unknown): Row => {
    const value = input as Row;
    if (value.schema_version === v2.SCHEMA_VERSION) return value;
    const converted: Row = { ...value, schema_version: v2.SCHEMA_VERSION };
    if (kind === "change") return { ...converted, kind: "requirement", priority: 0 };
    converted.updated_at = value.created_at;
    if (kind === "actor" || kind === "role") converted.project_id = project.id;
    if (kind === "assignment") {
      delete converted.scope_type; delete converted.scope_id;
      converted.role_key = "project_owner"; converted.scope = { kind: value.scope_type, id: value.scope_id }; converted.granted_by = value.actor_id;
    }
    return converted;
  };
  const remember = (kind: keyof typeof facts, value: unknown) => { const object = current(kind, value); facts[kind].set(String(object.id), object); };
  const intentFacts = new Map<string, { kind: v2.IntentRecordType; value: Row }>();
  const executionFacts = new Map<string, Row>(), executionRecordFacts = new Map<string, { kind: v2.ExecutionRecordType; value: Row }>();
  const runFacts = new Map<string, Row>(), runtimeFacts = new Map<string, { kind: v2.RuntimeRecordType; value: Row }>();
  const rememberRuntime = (kind: v2.RuntimeRecordType, value: Row, event: v2.EventEnvelope) => {
    if (value.project_id !== project.id || value.producer_actor_id !== event.actor_id || value.created_at !== event.occurred_at || !changes.has(String(value.change_id)) ||
      runtimeFacts.has(String(value.id))) unsafe("运行记录来源或原子事实无效");
    runtimeFacts.set(String(value.id), { kind, value });
  };
  const rememberExecution = (value: Row) => {
    const previous = executionFacts.get(String(value.id));
    if (previous && canonical(previous) === canonical(value)) return;
    if (value.project_id !== project.id || value.revision !== Number(previous?.revision ?? 0) + 1 || (previous && (value.created_at !== previous.created_at || canonical(value.scope) !== canonical(previous.scope)))) unsafe("执行对象身份或历史版本不连续");
    executionFacts.set(String(value.id), value);
  };
  const rememberExecutionRecord = (kind: v2.ExecutionRecordType, value: Row, event: v2.EventEnvelope) => {
    if (!value || value.project_id !== project.id || value.producer_actor_id !== event.actor_id || value.created_at !== event.occurred_at || executionRecordFacts.has(String(value.id))) unsafe("执行记录来源与事件不一致");
    executionRecordFacts.set(String(value.id), { kind, value });
  };
  let receiptEvents = 0;
  for (const event of events.values()) {
    if (event.event_type === "ProjectMigrated") continue;
    const receipt = receipts.get(event.command_id);
    if (!receipt || receipt.command_type !== eventCommands[event.event_type]) unsafe("事件缺少匹配的成功回执");
    receiptEvents++;
    for (const [key, kind] of Object.entries(runtimeCommands[event.event_type] ? {} : verificationKeys)) {
      const value = (event.payload as Row)[key] as Row | undefined;
      if (!value) continue;
      if (value.project_id !== project.id || value.producer_actor_id !== event.actor_id || value.created_at !== event.occurred_at || !changes.has(String(value.change_id)) || verificationFacts.has(String(value.id)) || canonical(value) !== canonical(receipt!.data[key])) unsafe("验证事实与事件/回执来源不符");
      verificationFacts.set(String(value.id), { kind, value });
    }
    if (runtimeCommands[event.event_type]) {
      const payload = event.payload as Row;
      if (canonical(payload) !== canonical(receipt!.data)) unsafe("运行事件与原始回执不一致");
      for (const [key, kind] of Object.entries(runtimeKeys)) if (payload[key]) rememberRuntime(kind, payload[key] as Row, event);
      if (event.event_type === "RunReserved") {
        const ref = (payload.record as Row).workspace_before_ref as Row, workspace = runtimeRecords.get(String(ref.id));
        if (workspace?.kind !== "workspace_snapshot") unsafe("预约前工作区记录缺失");
        const existing = runtimeFacts.get(String(ref.id));
        if (!existing) rememberRuntime("workspace_snapshot", workspace!.value as unknown as Row, event);
        else if (existing.kind !== "workspace_snapshot" || canonical(existing.value) !== canonical(workspace!.value)) unsafe("预约工作区与此前固定事实不一致");
      }
      if (payload.run) {
        const value = payload.run as Row, old = runFacts.get(String(value.id));
        if (value.revision !== Number(old?.revision ?? 0) + 1 || value.project_id !== project.id || !changes.has(String(value.change_id)) ||
          (old && (value.created_at !== old.created_at || value.task_id !== old.task_id || canonical(value.record_ref) !== canonical(old.record_ref) || canonical(value.work_item_ref) !== canonical(old.work_item_ref)))) unsafe("运行身份或版本历史不连续");
        runFacts.set(String(value.id), value);
      }
    }
    if (event.aggregate.object_type !== "project" && event.aggregate.object_type !== "change") {
      const payload = event.payload as Row, data = receipt!.data;
      for (const key of ["task", "work_item", "authorization", "authorization_version", "revocation"]) if (data[key] && canonical(data[key]) !== canonical(payload[key])) unsafe("执行事件与回执事实不一致");
      const aggregateKey = event.aggregate.object_type === "task" ? "task" : event.aggregate.object_type === "work_item" ? "work_item" : event.aggregate.object_type === "run" ? "run" : "authorization";
      const aggregate = payload[aggregateKey] as Row ?? executionFacts.get(event.aggregate.id);
      if (!aggregate || aggregate.id !== event.aggregate.id || aggregate.revision !== event.aggregate_revision) unsafe("执行聚合目标无效");
      for (const key of ["task", "work_item", ...(event.aggregate.object_type === "standing_authorization" ? ["authorization"] : [])]) if (payload[key]) rememberExecution(payload[key] as Row);
      if (event.event_type === "StandingAuthorizationPublished") {
        const version = payload.authorization_version as Row, previous = executionRecordFacts.get(String((version.predecessor_ref as Row | undefined)?.id));
        if (version.version !== Number(previous?.value.version ?? 0) + 1 || version.authorization_id !== aggregate.id || version.source_project_revision !== facts.project.get(project.id)?.revision || canonical(aggregate.current_version_ref) !== canonical({ object_type: "standing_authorization_version", id: version.id, domain_version: version.version })) unsafe("常规授权版本前驱或项目基准不一致");
        rememberExecutionRecord("standing_authorization_version", version, event);
      }
      if (event.event_type === "StandingAuthorizationRevoked") rememberExecutionRecord("authorization_revocation_record", payload.revocation as Row, event);
      if (event.event_type === "WorkItemCreated" && payload.authorization) rememberExecutionRecord("work_item_authorization_record", payload.authorization as Row, event);
      continue;
    }
    const resultData = receipt!.data, kind = event.aggregate.object_type === "project" ? "project" : "change";
    const previous = facts[kind].get(event.aggregate.id), object = current(kind, resultData[kind] ?? previous);
    const recordOnly = ["RiskAssessed", "DecisionRequested", "DecisionRecorded", "SourceSnapshotCaptured", "IntegrationEvaluated"].includes(event.event_type);
    if (object.id !== event.aggregate.id || object.revision !== event.aggregate_revision ||
      object.revision !== Number(previous?.revision ?? 0) + (recordOnly ? 0 : 1) || (recordOnly && canonical(previous) !== canonical(object))) unsafe("回执当前状态与聚合版本不连续");
    remember(kind, object);
    if (resultData.actor) remember("actor", resultData.actor);
    if (resultData.assignment) remember("assignment", resultData.assignment);
    if (resultData.settings_version) remember("settings", resultData.settings_version);
    if (resultData.target_version) {
      const target = resultData.target_version as Row, previousTarget = facts.target.get(String(target.id));
      if (target.revision !== Number(previousTarget?.revision ?? 0) + 1) unsafe("目标版本历史不连续");
      remember("target", target);
    }
    for (const value of (resultData.ended_assignments ?? []) as unknown[]) remember("assignment", value);
    const payload = event.payload as Row;
    if (event.event_type === "ChangeReadyForDelivery") {
      const transition = payload.lifecycle_transition as Row;
      if (!previous || transition.from_state !== previous.lifecycle_state || transition.to_state !== object.lifecycle_state || transition.change_id !== object.id || transition.project_id !== project.id || transition.command_id !== event.command_id || transition.producer_actor_id !== event.actor_id || transition.created_at !== event.occurred_at || object.lifecycle_state !== "ReadyForDelivery") unsafe("集成准入生命周期来源不符");
      intentFacts.set(String(transition.id), { kind: "lifecycle_transition_record", value: transition });
    }
    if (event.event_type === "PlanTasksInitialized") {
      if (canonical(payload.tasks) !== canonical(resultData.tasks) || canonical(payload.definitions) !== canonical(resultData.definitions)) unsafe("任务初始化事件与回执不一致");
      for (const task of payload.tasks as Row[]) rememberExecution(task);
      for (const definition of payload.definitions as Row[]) rememberExecutionRecord("task_definition", definition, event);
    }
    const intent = intentEvents[event.event_type];
    if (intent) {
      const [key, recordKind] = intent, record = payload[key] as Row;
      if (!record || record.project_id !== project.id || record.change_id !== object.id || record.producer_actor_id !== event.actor_id || record.created_at !== event.occurred_at || intentFacts.has(String(record.id))) unsafe("意图记录来源与事件不一致");
      if (key !== "lifecycle_transition" && canonical(record) !== canonical(resultData[key])) unsafe("意图事件与回执不一致");
      intentFacts.set(String(record.id), { kind: recordKind!, value: record });
      const transition = payload.lifecycle_transition as v2.LifecycleTransitionRecord | undefined;
      if (transition) {
        if (!previous || transition.from_state !== previous.lifecycle_state || transition.to_state !== object.lifecycle_state || transition.change_id !== object.id || transition.project_id !== project.id || transition.command_id !== event.command_id || transition.producer_actor_id !== event.actor_id || transition.created_at !== event.occurred_at) unsafe("生命周期记录前后事实不一致");
        if (key !== "lifecycle_transition") intentFacts.set(transition.id, { kind: "lifecycle_transition_record", value: transition });
      }
      if (event.event_type === "ContractConfirmed" || event.event_type === "PlanConfirmed") {
        const ref = object[event.event_type === "ContractConfirmed" ? "contract_ref" : "plan_ref"];
        if (canonical(ref) !== canonical({ object_type: recordKind, id: record.id, domain_version: record.version })) unsafe("正式版本指针与确认事实不一致");
      }
      if (event.event_type === "ChangeStarted" && (previous?.lifecycle_state !== "IntentReady" || object.lifecycle_state !== "Executing" || !transition)) unsafe("开工记录缺少正式生命周期前置事实");
    }
    for (const key of ["actor", "assignment", "ended_assignments", "settings_version", "target_version"]) {
      if (payload[key] && canonical(payload[key]) !== canonical(resultData[key])) unsafe("治理事件与回执快照不一致");
    }
    if (event.event_type === "ProjectInitialized") {
      const assignment = current("assignment", resultData.assignment), actor = current("actor", resultData.actor);
      if (event.event_sequence !== 1 || event.actor_id !== actor.id || assignment.actor_id !== actor.id || assignment.project_id !== project.id ||
        payload.project_name !== object.name || payload.repository_kind !== object.repository_kind) unsafe("初始化身份事实不一致");
      remember("role", { schema_version: v2.SCHEMA_VERSION, id: assignment.role_id, project_id: project.id, role_key: "project_owner",
        display_name: "项目负责人", created_at: assignment.created_at, updated_at: assignment.created_at, revision: 1 });
    }
    if (event.event_type === "ChangeCreated") {
      if (payload.display_key !== object.display_key || object.operating_status !== "Active" || object.owner_actor_id !== event.actor_id) unsafe("Change 创建事实不一致");
      for (const key of ["owner_assignment", "requirement_assignment"]) if (payload[key]) remember("assignment", payload[key]);
    }
    if (event.event_type === "ChangePaused" || event.event_type === "ChangeResumed") {
      const paused = event.event_type === "ChangePaused";
      if (!previous || previous.operating_status !== (paused ? "Active" : "Paused") || object.operating_status !== (paused ? "Paused" : "Active") ||
        object.pause_reason !== (paused ? payload.reason : undefined)) unsafe("Change 暂停 / 恢复事实不一致");
    }
    if (event.event_type === "ChangePlanningUpdated" && (!previous || previous.priority !== payload.previous_priority || object.priority !== payload.priority ||
      previous.target_version_id !== payload.previous_target_version_id || object.target_version_id !== payload.target_version_id)) unsafe("规划前后事实不一致");
  }
  if (format >= 7) {
    if (runObjects.size !== runFacts.size || runtimeRecords.size !== runtimeFacts.size) unsafe("运行记录与不可变事件未原子保存");
    for (const [id, value] of runObjects) {
      const record = runtimeRecords.get(value.record_ref.id);
      if (canonical(value) !== canonical(runFacts.get(id)) || record?.kind !== "run_record" || (record.value as v2.RunRecord).run_id !== id ||
        record.value.task_id !== value.task_id || record.value.work_item_ref.id !== value.work_item_ref.id) unsafe("运行对象与预约事实不一致");
      if (value.latest_observation_ref && runtimeRecords.get(value.latest_observation_ref.id)?.kind !== "run_observation") unsafe("运行观测指针无效");
    }
    for (const [id, record] of runtimeRecords) {
      const fact = runtimeFacts.get(id), task = executionObjects.get(record.value.task_id), item = executionObjects.get(record.value.work_item_ref.id);
      if (!fact || fact.kind !== record.kind || canonical(record.value) !== canonical(fact.value) || !task || !item ||
        !("task_id" in item) || item.task_id !== record.value.task_id) unsafe("运行记录与原始事实不一致");
    }
  }
  if (receiptEvents !== receipts.size || transitions.length !== [...events.values()].filter(event => ["ChangePaused", "ChangeResumed"].includes(event.event_type)).length) unsafe("事件、回执或 Transition 原子记录不完整");
  for (const [kind, values] of Object.entries({ project: [project], actor: [...actors.values()], role: [...roles.values()], assignment: assignments, change: [...changes.values()], settings: [...settings.values()], target: [...targets.values()] })) {
    const expected = facts[kind as keyof typeof facts];
    if (values.length !== expected.size || values.some(value => canonical(value) !== canonical(expected.get(value.id)))) unsafe("当前对象与不可变历史事实不一致");
  }
  if (format >= 5) {
    if (executionObjects.size !== executionFacts.size || executionRecords.size !== executionRecordFacts.size) unsafe("执行对象、记录与事件未原子保存");
    for (const [id, value] of executionObjects) if (canonical(value) !== canonical(executionFacts.get(id))) unsafe("执行对象与不可变历史不一致");
    for (const [id, value] of executionRecords) {
      const fact = executionRecordFacts.get(id); if (!fact || fact.kind !== value.kind || canonical(fact.value) !== canonical(value.value)) unsafe("执行记录与不可变历史不一致");
    }
  }
  if (format >= 4) {
    const records = rows(db, "intent_records");
    if (records.length !== intentFacts.size) unsafe("意图记录与历史事件未原子保存");
    for (const row of records) {
      const kind = String(row.object_type) as v2.IntentRecordType;
      if (!Object.hasOwn(v2.intentRecordSchemas, kind)) unsafe("未知意图记录类型");
      const record = parseVersionedRecord(kind, json(row)) as v2.IntentRecords[v2.IntentRecordType];
      if (format < 6 && ((kind === "decision_request" && ((record as v2.DecisionRequest).policy_version !== "intent-confirmation/1.0.0" || !["confirm_contract", "confirm_plan"].includes((record as v2.DecisionRequest).action) || (record as v2.DecisionRequest).professional_subject_ref)) ||
        (kind === "decision" && (record as v2.Decision).review) || ((kind === "contract_version" || kind === "plan_version") && (record as v2.ContractVersion | v2.PlanVersion).condition_verification_refs))) unsafe("旧格式不能声明专业复核或已核验批准条件");
      match(row, record, ["id", "project_id", "change_id", "producer_actor_id"]);
      const fact = intentFacts.get(record.id);
      if (!fact || fact.kind !== kind || canonical(fact.value) !== canonical(record)) unsafe("意图记录与确认历史不一致");
    }
    for (const change of changes.values()) for (const ref of [change.contract_ref, change.plan_ref]) if (ref) {
      const fact = intentFacts.get(ref.id);
      if (!fact || fact.kind !== ref.object_type || fact.value.version !== ref.domain_version || fact.value.change_id !== change.id) unsafe("当前正式版本引用无效");
    }
  }
  if (format >= 6) {
    const records = rows(db, "verification_records");
    if (records.length !== verificationFacts.size) unsafe("验证事实与事件未原子保存");
    for (const row of records) {
      const kind = String(row.object_type) as v2.VerificationRecordType;
      if (!Object.hasOwn(v2.verificationRecordSchemas, kind)) unsafe("未知验证记录");
      const value = v2.compileValidator<v2.VerificationRecords[v2.VerificationRecordType]>(v2.verificationRecordSchemas[kind])(json(row));
      match(row, value, ["id", "project_id", "change_id", "producer_actor_id"]);
      const fact = verificationFacts.get(value.id); if (!fact || fact.kind !== kind || canonical(value) !== canonical(fact.value)) unsafe("验证记录与不可变事实不符");
    }
  }
  for (const row of rows(db, "immutable_records")) {
    const record = parseVersionedRecord(String(row.object_type), json(row)) as v2.ProviderDescriptor | v2.ProviderBinding;
    match(row, record, ["id", "project_id"]);
    if (record.project_id !== project.id || !actors.has(record.producer_actor_id)) unsafe("Provider 元数据引用无效");
    const registrations = [...events.values()].filter(e => e.event_type === "ProviderRegistered" && e.payload.descriptor.id === record.id);
    if (registrations.length && (registrations.length !== 1 || registrations[0]!.event_type !== "ProviderRegistered" || canonical(registrations[0]!.payload.descriptor) !== canonical(record))) unsafe("Provider 候选与登记事件不一致");
    if ("approval" in record) unsafe("旧格式不能包含新的 Provider 批准事实");
  }
  for (const row of rows(db, "migration_runs")) {
    const manifest = JSON.parse(String(row.manifest_json)) as { migration_id: string; from_format: number; to_format: number; database: { digest: string } };
    if (Number(row.from_format) >= Number(row.to_format) || Number(row.to_format) > format || !actors.has(String(row.actor_id)) || manifest.migration_id !== row.id ||
      manifest.from_format !== row.from_format || manifest.to_format !== row.to_format || manifest.database.digest !== row.backup_digest ||
      ![...events.values()].some(event => event.event_type === "ProjectMigrated" && event.payload.migration_id === row.id && event.payload.backup_digest.value === row.backup_digest)) unsafe("历史迁移记录不一致");
  }
  if (rows(db, "migration_runs").length !== [...events.values()].filter(event => event.event_type === "ProjectMigrated").length) unsafe("历史迁移事件缺少对应运行记录");
  for (const row of rows(db, "migration_origins")) {
    const original = parseVersionedRecord(String(row.object_type), JSON.parse(String(row.source_json))) as { id: string; schema_version: string };
    if (original.id !== row.object_id || original.schema_version !== row.source_schema_version ||
      createHash("sha256").update(String(row.source_json)).digest("hex") !== row.source_digest) unsafe("历史迁移来源摘要不一致");
  }
  const effectEvents = new Set<string>();
  for (const row of rows(db, "outbox_messages")) {
    const { target_ref_json, lease_until, delivered_at, ...fields } = row;
    const message = v2.compileValidator<v2.OutboxMessage>(v2.OutboxMessageSchema)({ ...fields, schema_version: v2.SCHEMA_VERSION,
      target_ref: JSON.parse(String(target_ref_json)), ...(lease_until ? { lease_until } : {}), ...(delivered_at ? { delivered_at } : {}) });
    if (message.project_id !== project.id || !events.has(message.event_id) || message.target_ref.object_type !== "event" || message.target_ref.id !== message.event_id ||
      (message.status === "processing" && (!message.lease_until || Date.parse(message.lease_until) > Date.parse(now))) ||
      (message.status === "delivered" && !message.delivered_at)) unsafe("Outbox 引用、状态或有效租约不满足迁移条件");
    effectEvents.add(message.event_id);
  }
  if ([...events.values()].some(event => event.event_type !== "ProjectMigrated" && !effectEvents.has(event.event_id))) unsafe("业务事件缺少同事务 Outbox 效果");
  const counts = Object.fromEntries(["projects", "actors", "roles", "assignments", "changes", "transition_records", "event_ledger", "command_receipts", "outbox_messages", "immutable_records", ...(format >= 3 ? ["project_settings_versions", "target_versions"] : []), ...(format >= 4 ? ["intent_records"] : []), ...(format >= 5 ? ["execution_objects", "execution_records"] : []), ...(format >= 6 ? ["verification_records"] : []), ...(format >= 7 ? ["run_objects", "run_records"] : [])]
    .map(table => [table, rows(db, table).length]));
  return { project, authorizedActors, mutable: [], counts };
};
