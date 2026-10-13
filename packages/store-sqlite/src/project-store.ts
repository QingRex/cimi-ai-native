import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  ActorSchema, AssignmentSchema, RoleSchema, TransitionRecordSchema, ProviderDescriptorSchema, ProviderBindingSchema, OutboxMessageSchema, UtcTimestampSchema,
  ChangeSchema,
  parseCommandResult,
  parseEvent,
  ProjectSchema,
  SCHEMA_VERSION,
  compileValidator,
  type ProviderDescriptor, type ProviderBinding, ProviderEvidenceSchema, ProviderEvaluationSchema, type ProviderEvidence, type ProviderEvaluation,
  type Actor,
  type Assignment,
  type Change,
  type CommandResult,
  type EventEnvelope,
  type InternalId,
  type Project,
  type Role,
  type TransitionRecord, ProjectSettingsVersionSchema, TargetVersionSchema, type ProjectSettingsVersion, type TargetVersion,
  intentRecordSchemas, type IntentRecordType, type IntentRecords,
  executionObjectSchemas, executionRecordSchemas, type ExecutionObjectType, type ExecutionObjects, type ExecutionRecordType, type ExecutionRecords,
  verificationRecordSchemas, type VerificationRecordType, type VerificationRecords,
  RunSchema, runtimeRecordSchemas, type Run, type RuntimeRecordType, type RuntimeRecords, type SkillInvocation, type SkillInvocationObservation
} from "@cimiloop/protocol/v2";
import {
  StoreConflictError,
  type ClaimedOutboxMessage, type OutboxClaim, type ProjectReader, type HistoricalEvent, type HistoricalTransition,
  type CommandReceipt,
  type NewCommandReceipt,
  type OutboxMessage,
  type ProjectStore,
  type ProposedEvent,
  type StoreTransaction
} from "@cimiloop/store";

const parseProject = compileValidator<Project>(ProjectSchema);
const parseChange = compileValidator<Change>(ChangeSchema);
const parseActor = compileValidator<Actor>(ActorSchema);
const parseRole = compileValidator<Role>(RoleSchema);
const parseAssignment = compileValidator<Assignment>(AssignmentSchema);
const parseTransition = compileValidator<TransitionRecord>(TransitionRecordSchema);
const parseOutbox = compileValidator<OutboxMessage>(OutboxMessageSchema);
const parseDescriptor = compileValidator<ProviderDescriptor>(ProviderDescriptorSchema);
const parseBinding = compileValidator<ProviderBinding>(ProviderBindingSchema);
const parseCurrentResult = parseCommandResult;
const parseTimestamp = compileValidator<string>(UtcTimestampSchema);

import { parseVersionedCommandResult, parseVersionedRecord } from "@cimiloop/protocol";
import { CURRENT_DATABASE_FORMAT, initializeCurrentDatabase, readFormat, requireCurrentFormat } from "./database-format.js";
const parseSettings = compileValidator<ProjectSettingsVersion>(ProjectSettingsVersionSchema);
const parseTarget = compileValidator<TargetVersion>(TargetVersionSchema);
const historicalEvent = (input: unknown): HistoricalEvent => parseVersionedRecord("event", input) as HistoricalEvent;
const historicalTransition = (input: unknown): HistoricalTransition => parseVersionedRecord("transition_record", input) as HistoricalTransition;
const historicalSuccess = (input: unknown): CommandReceipt["result"] => {
  const result = parseVersionedCommandResult(input);
  if (!("ok" in result) && !("schema_version" in result)) throw new Error("M0 receipts only contain successful results");
  return result;
};
type SqlRow = Record<string, unknown>;

const json = (value: unknown): string => JSON.stringify(value);
const parseJson = (value: unknown): unknown => JSON.parse(String(value));

class SqliteTransaction implements StoreTransaction {
  constructor(private readonly database: DatabaseSync) {}

  getRun(id: InternalId): Run | undefined {
    const row = this.database.prepare("SELECT * FROM run_objects WHERE id = ?").get(id);
    if (!row) return undefined;
    const value = compileValidator<Run>(RunSchema)(parseJson(row.payload_json));
    if (row.id !== value.id || row.project_id !== value.project_id || row.change_id !== value.change_id || row.revision !== value.revision) throw new StoreConflictError("Run index mismatch");
    return value;
  }
  listRuns(changeId: InternalId): Run[] { return this.database.prepare("SELECT id FROM run_objects WHERE change_id = ? ORDER BY rowid").all(changeId).map(row => this.getRun(String(row.id))!); }
  insertRun(input: Run): void {
    const value = compileValidator<Run>(RunSchema)(input);
    if (value.revision !== 1 || this.getChange(value.change_id)?.project_id !== value.project_id || this.getExecutionObject("task", value.task_id)?.change_id !== value.change_id || this.getRuntimeRecord("run_record", value.record_ref.id)?.run_id !== value.id) throw new StoreConflictError("Run scope mismatch");
    this.database.prepare("INSERT INTO run_objects VALUES (?, ?, ?, ?, ?)").run(value.id, value.project_id, value.change_id, value.revision, json(value));
  }
  updateRun(input: Run, expectedRevision: number): void {
    const value = compileValidator<Run>(RunSchema)(input), old = this.getRun(value.id);
    if (!old || old.revision !== expectedRevision || value.revision !== expectedRevision + 1 || value.project_id !== old.project_id || value.change_id !== old.change_id || value.task_id !== old.task_id || json(value.work_item_ref) !== json(old.work_item_ref) || json(value.record_ref) !== json(old.record_ref) || value.created_at !== old.created_at || value.cost_charged_micros < old.cost_charged_micros || (old.reservation_released && !value.reservation_released) || (old.release_reversed && !value.release_reversed) || (old.cancel_requested && !value.cancel_requested)) throw new StoreConflictError("Run identity, revision or usage conflict", old?.revision);
    if (Number(this.database.prepare("UPDATE run_objects SET revision = ?, payload_json = ? WHERE id = ? AND revision = ?").run(value.revision, json(value), value.id, expectedRevision).changes) !== 1) throw new StoreConflictError("Run revision conflict");
  }
  getRuntimeRecord<K extends RuntimeRecordType>(kind: K, id: InternalId): RuntimeRecords[K] | undefined {
    const row = this.database.prepare("SELECT * FROM run_records WHERE id = ? AND object_type = ?").get(id, kind);
    if (!row) return undefined;
    const value = compileValidator<RuntimeRecords[K]>(runtimeRecordSchemas[kind])(parseJson(row.payload_json));
    if (row.id !== value.id || row.project_id !== value.project_id || row.change_id !== value.change_id || row.producer_actor_id !== value.producer_actor_id) throw new StoreConflictError("Run record index mismatch");
    return value;
  }
  listRuntimeRecords<K extends RuntimeRecordType>(kind: K, changeId: InternalId): RuntimeRecords[K][] { return this.database.prepare("SELECT id FROM run_records WHERE object_type = ? AND change_id = ? ORDER BY rowid").all(kind, changeId).map(row => this.getRuntimeRecord(kind, String(row.id))!); }
  insertRuntimeRecord<K extends RuntimeRecordType>(kind: K, input: RuntimeRecords[K]): void {
    const value = compileValidator<RuntimeRecords[K]>(runtimeRecordSchemas[kind])(input);
    if (this.getActor(value.producer_actor_id)?.project_id !== value.project_id || this.getChange(value.change_id)?.project_id !== value.project_id || this.getExecutionObject("task", value.task_id)?.change_id !== value.change_id || this.getExecutionObject("work_item", value.work_item_ref.id)?.task_id !== value.task_id) throw new StoreConflictError("Run record scope mismatch");
    if (kind === "skill_invocation") {
      const invocation = value as SkillInvocation, run = this.getRun(invocation.run_ref.id), record = run ? this.getRuntimeRecord("run_record", run.record_ref.id) : undefined;
      const pinEquals = (a: SkillInvocation["skill_binding"], b: SkillInvocation["skill_binding"]) => a.binding_ref.id === b.binding_ref.id && a.digest.value === b.digest.value;
      if (!record || record.run_kind !== "agent" || record.project_id !== invocation.project_id || record.change_id !== invocation.change_id || record.task_id !== invocation.task_id ||
        record.work_item_ref.id !== invocation.work_item_ref.id || record.operation_key !== invocation.run_operation_key || record.context_ref.id !== invocation.context_ref.id ||
        record.executor_ref.id !== invocation.executor_ref.id || invocation.producer_actor_id !== invocation.executor_ref.id || invocation.request.invocation_key !== invocation.invocation_key ||
        !pinEquals(record.runtime_binding, invocation.runtime_binding) || !record.skill_bindings.some(pin => pinEquals(pin, invocation.skill_binding)) || record.host_admission_ref.locator !== invocation.host_admission_ref.locator ||
        ["definition_ref", "contract_ref", "plan_ref"].some(key => { const field = key as "definition_ref"; return record[field].id !== invocation[field].id || record[field].domain_version !== invocation[field].domain_version; })) throw new StoreConflictError("Skill invocation parent binding mismatch");
      if (this.database.prepare("SELECT 1 FROM run_records WHERE object_type = 'skill_invocation' AND json_extract(payload_json, '$.invocation_key') = ?").get(invocation.invocation_key)) throw new StoreConflictError("Skill invocation operation already reserved");
    }
    if (kind === "skill_invocation_observation") {
      const observation = value as SkillInvocationObservation, invocation = this.getRuntimeRecord("skill_invocation", observation.invocation_ref.id), report = observation.report;
      if (!invocation || invocation.project_id !== observation.project_id || invocation.change_id !== observation.change_id || invocation.task_id !== observation.task_id || invocation.work_item_ref.id !== observation.work_item_ref.id ||
        report.invocation_ref.id !== invocation.id || report.invocation_key !== invocation.invocation_key || report.run_ref.id !== invocation.run_ref.id || report.run_operation_key !== invocation.run_operation_key ||
        report.input_digest.value !== invocation.input_digest.value || report.producer_actor_id !== observation.producer_actor_id ||
        ["definition_ref", "contract_ref", "plan_ref"].some(key => { const field = key as "definition_ref"; return invocation[field].id !== observation[field].id || invocation[field].domain_version !== observation[field].domain_version; })) throw new StoreConflictError("Skill observation original invocation mismatch");
    }
    this.database.prepare("INSERT INTO run_records VALUES (?, ?, ?, ?, ?, ?)").run(value.id, value.project_id, value.change_id, value.producer_actor_id, kind, json(value));
  }

  getVerificationRecord<K extends VerificationRecordType>(kind: K, id: InternalId): VerificationRecords[K] | undefined {
    const row = this.database.prepare("SELECT * FROM verification_records WHERE id = ? AND object_type = ?").get(id, kind);
    if (!row) return undefined;
    const value = compileValidator<VerificationRecords[K]>(verificationRecordSchemas[kind])(parseJson(row.payload_json));
    if (row.id !== value.id || row.project_id !== value.project_id || row.change_id !== value.change_id || row.producer_actor_id !== value.producer_actor_id) throw new StoreConflictError("Verification index does not match payload");
    return value;
  }
  listVerificationRecords<K extends VerificationRecordType>(kind: K, changeId: InternalId): VerificationRecords[K][] {
    return this.database.prepare("SELECT id FROM verification_records WHERE object_type = ? AND change_id = ? ORDER BY rowid").all(kind, changeId).map(row => this.getVerificationRecord(kind, String(row.id))!);
  }
  insertVerificationRecord<K extends VerificationRecordType>(kind: K, input: VerificationRecords[K]): void {
    const value = compileValidator<VerificationRecords[K]>(verificationRecordSchemas[kind])(input);
    if (this.getActor(value.producer_actor_id)?.project_id !== value.project_id || this.getChange(value.change_id)?.project_id !== value.project_id) throw new StoreConflictError("Verification record belongs to another project");
    this.database.prepare("INSERT INTO verification_records VALUES (?, ?, ?, ?, ?, ?)").run(value.id, value.project_id, value.change_id, value.producer_actor_id, kind, json(value));
  }

  getExecutionObject<K extends ExecutionObjectType>(kind: K, id: InternalId): ExecutionObjects[K] | undefined {
    const row = this.database.prepare("SELECT * FROM execution_objects WHERE id = ? AND object_type = ?").get(id, kind) as SqlRow | undefined;
    if (!row) return undefined;
    const value = compileValidator<ExecutionObjects[K]>(executionObjectSchemas[kind])(parseJson(row.payload_json));
    if (row.id !== value.id || row.project_id !== value.project_id || row.revision !== value.revision) throw new StoreConflictError("Execution index does not match payload");
    return value;
  }
  listExecutionObjects<K extends ExecutionObjectType>(kind: K, changeId?: InternalId): ExecutionObjects[K][] {
    const entries = (changeId ? this.database.prepare("SELECT id FROM execution_objects WHERE object_type = ? AND json_extract(payload_json, '$.change_id') = ? ORDER BY rowid").all(kind, changeId)
      : this.database.prepare("SELECT id FROM execution_objects WHERE object_type = ? ORDER BY rowid").all(kind)) as SqlRow[];
    return entries.map(row => this.getExecutionObject(kind, String(row.id))!);
  }
  getExecutionRecord<K extends ExecutionRecordType>(kind: K, id: InternalId): ExecutionRecords[K] | undefined {
    const row = this.database.prepare("SELECT * FROM execution_records WHERE id = ? AND object_type = ?").get(id, kind) as SqlRow | undefined;
    if (!row) return undefined;
    const value = compileValidator<ExecutionRecords[K]>(executionRecordSchemas[kind])(parseJson(row.payload_json));
    if (row.id !== value.id || row.project_id !== value.project_id || row.producer_actor_id !== value.producer_actor_id) throw new StoreConflictError("Execution record index does not match payload");
    return value;
  }
  listExecutionRecords<K extends ExecutionRecordType>(kind: K): ExecutionRecords[K][] {
    return (this.database.prepare("SELECT id FROM execution_records WHERE object_type = ? ORDER BY rowid").all(kind) as SqlRow[]).map(row => this.getExecutionRecord(kind, String(row.id))!);
  }
  insertExecutionObject<K extends ExecutionObjectType>(kind: K, input: ExecutionObjects[K]): void {
    const value = compileValidator<ExecutionObjects[K]>(executionObjectSchemas[kind])(input);
    if (value.revision !== 1 || !this.getProject(value.project_id)) throw new StoreConflictError("New execution object identity invalid");
    if ("change_id" in value && this.getChange(value.change_id)?.project_id !== value.project_id) throw new StoreConflictError("Execution scope belongs to another project");
    this.database.prepare("INSERT INTO execution_objects VALUES (?, ?, ?, ?, ?)").run(value.id, value.project_id, kind, value.revision, json(value));
  }
  updateExecutionObject<K extends ExecutionObjectType>(kind: K, input: ExecutionObjects[K], expectedRevision: number): void {
    const value = compileValidator<ExecutionObjects[K]>(executionObjectSchemas[kind])(input), old = this.getExecutionObject(kind, value.id);
    if (!old || old.revision !== expectedRevision || value.revision !== expectedRevision + 1 || value.project_id !== old.project_id || value.created_at !== old.created_at || value.scope.kind !== old.scope.kind || value.scope.id !== old.scope.id) throw new StoreConflictError("Execution identity or revision conflict", old?.revision);
    if (kind === "task") {
      const task = value as ExecutionObjects["task"], previous = old as ExecutionObjects["task"];
      if (task.change_id !== previous.change_id || task.usage.attempts_consumed < previous.usage.attempts_consumed ||
        (task.usage.attempts_released ?? 0) < (previous.usage.attempts_released ?? 0) || (task.usage.attempts_released ?? 0) > task.usage.attempts_consumed ||
        (task.usage.attempt_releases_reversed ?? 0) < (previous.usage.attempt_releases_reversed ?? 0) || (task.usage.attempt_releases_reversed ?? 0) > (task.usage.attempts_released ?? 0) ||
        (previous.usage.first_started_at && task.usage.first_started_at !== previous.usage.first_started_at) ||
        (previous.usage.cost_currency && task.usage.cost_currency !== previous.usage.cost_currency) ||
        (task.usage.cost_consumed_micros ?? 0) < (previous.usage.cost_consumed_micros ?? 0)) throw new StoreConflictError("Task usage or identity cannot be reset", old.revision);
    }
    if (kind === "work_item") {
      const { revision: _revision, updated_at: _updated, status: _status, ...fields } = value as ExecutionObjects["work_item"];
      const { revision: _oldRevision, updated_at: _oldUpdated, status: _oldStatus, ...oldFields } = old as ExecutionObjects["work_item"];
      for (const name of ["revoked_at", "revocation_reason"]) { delete (fields as Record<string, unknown>)[name]; delete (oldFields as Record<string, unknown>)[name]; }
      if (json(fields) !== json(oldFields)) throw new StoreConflictError("Work Item authorization is immutable", old.revision);
    }
    const result = this.database.prepare("UPDATE execution_objects SET revision = ?, payload_json = ? WHERE id = ? AND object_type = ? AND revision = ?").run(value.revision, json(value), value.id, kind, expectedRevision);
    if (Number(result.changes) !== 1) throw new StoreConflictError("Execution revision conflict", old.revision);
  }
  insertExecutionRecord<K extends ExecutionRecordType>(kind: K, input: ExecutionRecords[K]): void {
    const value = compileValidator<ExecutionRecords[K]>(executionRecordSchemas[kind])(input);
    if (this.getActor(value.producer_actor_id)?.project_id !== value.project_id) throw new StoreConflictError("Execution producer belongs to another project");
    this.database.prepare("INSERT INTO execution_records VALUES (?, ?, ?, ?, ?)").run(value.id, value.project_id, value.producer_actor_id, kind, json(value));
  }

  getCommandReceipt(commandId: InternalId): CommandReceipt | undefined {
    const row = this.database
      .prepare("SELECT command_id, request_digest, result_json, created_at FROM command_receipts WHERE command_id = ?")
      .get(commandId) as SqlRow | undefined;
    if (!row) return undefined;
    if (!/^[0-9a-f]{64}$/.test(String(row.request_digest))) throw new Error("Invalid stored receipt request digest");
    parseTimestamp(String(row.created_at));
    return {
      command_id: String(row.command_id),
      request_digest: String(row.request_digest),
      result: historicalSuccess(parseJson(row.result_json)),
      created_at: String(row.created_at)
    };
  }

  saveCommandReceipt(receipt: NewCommandReceipt): void {
    const result = parseCurrentResult(receipt.result);
    if (!/^[0-9a-f]{64}$/.test(receipt.request_digest) || ("command_id" in result && result.command_id !== receipt.command_id)) {
      throw new Error("Receipt identity or request digest does not match");
    }
    parseTimestamp(receipt.created_at);
    this.database
      .prepare(
        "INSERT INTO command_receipts(command_id, request_digest, result_json, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(receipt.command_id, receipt.request_digest, json(result), receipt.created_at);
  }

  getCurrentProject(): Project | undefined {
    const row = this.database.prepare("SELECT payload_json FROM projects LIMIT 1").get() as SqlRow | undefined;
    return row ? parseProject(parseJson(row.payload_json)) : undefined;
  }

  getProject(projectId: InternalId): Project | undefined {
    const row = this.database.prepare("SELECT payload_json FROM projects WHERE id = ?").get(projectId) as
      | SqlRow
      | undefined;
    return row ? parseProject(parseJson(row.payload_json)) : undefined;
  }

  insertProject(project: Project): void {
    this.database
      .prepare("INSERT INTO projects(id, revision, payload_json) VALUES (?, ?, ?)")
      .run(project.id, project.revision, json(parseProject(project)));
    this.database
      .prepare("INSERT INTO project_counters(project_id, change_number, event_sequence) VALUES (?, 0, 0)")
      .run(project.id);
  }

  getActor(actorId: InternalId): Actor | undefined {
    const row = this.database.prepare("SELECT payload_json FROM actors WHERE id = ?").get(actorId) as SqlRow | undefined;
    return row ? parseActor(parseJson(row.payload_json)) : undefined;
  }
  listActors(): Actor[] {
    return (this.database.prepare("SELECT payload_json FROM actors ORDER BY rowid").all() as SqlRow[])
      .map(row => parseActor(parseJson(row.payload_json)));
  }
  listAssignments(actorId?: InternalId): Assignment[] {
    return ((actorId ? this.database.prepare("SELECT payload_json FROM assignments WHERE actor_id = ? ORDER BY rowid").all(actorId)
      : this.database.prepare("SELECT payload_json FROM assignments ORDER BY rowid").all()) as SqlRow[])
      .map(row => parseAssignment(parseJson(row.payload_json)));
  }
  getAssignment(id: InternalId): Assignment | undefined {
    const row = this.database.prepare("SELECT payload_json FROM assignments WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? parseAssignment(parseJson(row.payload_json)) : undefined;
  }
  updateProject(project: Project, expectedRevision: number): void {
    const value = parseProject(project), old = this.getProject(project.id);
    if (value.revision !== expectedRevision + 1 || (old && (old.instance_id !== value.instance_id || old.created_at !== value.created_at))) {
      throw new StoreConflictError("Project identity or revision cannot be replaced", old?.revision);
    }
    const result = this.database.prepare("UPDATE projects SET revision = ?, payload_json = ? WHERE id = ? AND revision = ?")
      .run(value.revision, json(value), value.id, expectedRevision);
    if (Number(result.changes) !== 1) throw new StoreConflictError("Project revision conflict", old?.revision);
  }
  endAssignment(assignment: Assignment, expectedRevision: number): void {
    const value = parseAssignment(assignment), old = this.getAssignment(value.id);
    if (!old || old.revision !== expectedRevision || value.revision !== expectedRevision + 1 || old.ended_at || !value.ended_at) {
      throw new StoreConflictError("Assignment revision conflict or already ended", old?.revision);
    }
    // Ending is the only mutable assignment operation; never rewrite the original grant.
    const immutableFields = ["schema_version", "id", "project_id", "actor_id", "role_key", "role_id", "granted_by",
      "effective_at", "expires_at", "created_at"] as const;
    if (immutableFields.some(field => value[field] !== old[field]) || value.scope.kind !== old.scope.kind || value.scope.id !== old.scope.id ||
      !Number.isFinite(Date.parse(value.ended_at)) || Date.parse(value.ended_at) < Date.parse(old.created_at) || value.updated_at !== value.ended_at) {
      throw new StoreConflictError("Assignment grant cannot be replaced", old.revision);
    }
    const result = this.database.prepare("UPDATE assignments SET revision = ?, payload_json = ? WHERE id = ? AND revision = ?")
      .run(value.revision, json(value), value.id, expectedRevision);
    if (Number(result.changes) !== 1) throw new StoreConflictError("Assignment revision conflict", old.revision);
  }
  getProviderEvidence(id: InternalId): ProviderEvidence | undefined {
    const row = this.database.prepare("SELECT payload_json FROM provider_assessment_records WHERE id = ? AND object_type = 'evidence'").get(id) as SqlRow | undefined;
    return row ? compileValidator<ProviderEvidence>(ProviderEvidenceSchema)(parseJson(row.payload_json)) : undefined;
  }
  listProviderEvidence(): ProviderEvidence[] {
    return this.database.prepare("SELECT id FROM provider_assessment_records WHERE object_type = 'evidence' ORDER BY rowid").all().map(row => this.getProviderEvidence(String(row.id))!);
  }
  insertProviderEvidence(input: ProviderEvidence): void {
    const value = compileValidator<ProviderEvidence>(ProviderEvidenceSchema)(input);
    this.database.prepare("INSERT INTO provider_assessment_records VALUES (?, ?, ?, ?, 'evidence', ?)").run(value.id, value.project_id, value.descriptor_ref.id, value.producer_actor_id, json(value));
  }
  getProviderEvaluation(id: InternalId): ProviderEvaluation | undefined {
    const row = this.database.prepare("SELECT payload_json FROM provider_assessment_records WHERE id = ? AND object_type = 'evaluation'").get(id) as SqlRow | undefined;
    return row ? compileValidator<ProviderEvaluation>(ProviderEvaluationSchema)(parseJson(row.payload_json)) : undefined;
  }
  listProviderEvaluations(): ProviderEvaluation[] {
    return this.database.prepare("SELECT id FROM provider_assessment_records WHERE object_type = 'evaluation' ORDER BY rowid").all().map(row => this.getProviderEvaluation(String(row.id))!);
  }
  insertProviderEvaluation(input: ProviderEvaluation): void {
    const value = compileValidator<ProviderEvaluation>(ProviderEvaluationSchema)(input);
    this.database.prepare("INSERT INTO provider_assessment_records VALUES (?, ?, ?, ?, 'evaluation', ?)").run(value.id, value.project_id, value.descriptor_ref.id, value.producer_actor_id, json(value));
  }
  getProviderDescriptor(id: InternalId): ProviderDescriptor | undefined {
    const row = this.database.prepare("SELECT payload_json FROM immutable_records WHERE id = ? AND object_type = 'provider_descriptor'").get(id) as SqlRow | undefined;
    return row ? parseDescriptor(parseJson(row.payload_json)) : undefined;
  }
  insertProviderDescriptor(record: ProviderDescriptor): void {
    const value = parseDescriptor(record);
    this.database.prepare("INSERT INTO immutable_records VALUES (?, ?, 'provider_descriptor', ?)")
      .run(value.id, value.project_id, json(value));
  }
  listProviderDescriptors(): ProviderDescriptor[] {
    return this.database.prepare("SELECT id FROM immutable_records WHERE object_type = 'provider_descriptor' ORDER BY rowid").all()
      .map(row => this.getProviderDescriptor(String(row.id))!);
  }
  getProviderBinding(id: InternalId): ProviderBinding | undefined {
    const row = this.database.prepare("SELECT payload_json FROM immutable_records WHERE id = ? AND object_type = 'provider_binding'").get(id) as SqlRow | undefined;
    return row ? parseBinding(parseJson(row.payload_json)) : undefined;
  }
  insertProviderBinding(record: ProviderBinding): void {
    const value = parseBinding(record);
    this.database.prepare("INSERT INTO immutable_records VALUES (?, ?, 'provider_binding', ?)")
      .run(value.id, value.project_id, json(value));
  }
  listProviderBindings(): ProviderBinding[] {
    return this.database.prepare("SELECT id FROM immutable_records WHERE object_type = 'provider_binding' ORDER BY rowid").all()
      .map(row => this.getProviderBinding(String(row.id))!);
  }
  insertActor(actor: Actor): void {
    this.database
      .prepare("INSERT INTO actors(id, revision, payload_json) VALUES (?, ?, ?)")
      .run(actor.id, actor.revision, json(parseActor(actor)));
  }

  insertRole(role: Role): void {
    this.database
      .prepare("INSERT INTO roles(id, role_key, revision, payload_json) VALUES (?, ?, ?, ?)")
      .run(role.id, role.role_key, role.revision, json(parseRole(role)));
  }

  insertAssignment(assignment: Assignment): void {
    this.database
      .prepare(
        "INSERT INTO assignments(id, project_id, actor_id, role_id, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(
        assignment.id,
        assignment.project_id,
        assignment.actor_id,
        assignment.role_id ?? null,
        assignment.revision,
        json(parseAssignment(assignment))
      );
  }

  getChange(idOrKey: string): Change | undefined {
    const row = this.database
      .prepare("SELECT payload_json FROM changes WHERE id = ? OR display_key = ? LIMIT 1")
      .get(idOrKey, idOrKey) as SqlRow | undefined;
    return row ? parseChange(parseJson(row.payload_json)) : undefined;
  }
  listChanges(): Change[] {
    return (this.database.prepare("SELECT payload_json FROM changes ORDER BY CAST(SUBSTR(display_key, 5) AS INTEGER)").all() as SqlRow[])
      .map(row => parseChange(parseJson(row.payload_json)));
  }
  getSettingsVersion(id: InternalId): ProjectSettingsVersion | undefined {
    const row = this.database.prepare("SELECT payload_json FROM project_settings_versions WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? parseSettings(parseJson(row.payload_json)) : undefined;
  }
  getIntentRecord<K extends IntentRecordType>(kind: K, id: InternalId): IntentRecords[K] | undefined {
    const row = this.database.prepare("SELECT * FROM intent_records WHERE id = ? AND object_type = ?").get(id, kind) as SqlRow | undefined;
    if (!row) return undefined;
    const value = compileValidator<IntentRecords[K]>(intentRecordSchemas[kind])(parseJson(row.payload_json));
    if (value.id !== row.id || value.project_id !== row.project_id || value.change_id !== row.change_id || value.producer_actor_id !== row.producer_actor_id) throw new Error("Intent record index/payload mismatch");
    return value;
  }
  listIntentRecords<K extends IntentRecordType>(kind: K, changeId: InternalId): IntentRecords[K][] {
    const rows = this.database.prepare("SELECT id FROM intent_records WHERE object_type = ? AND change_id = ? ORDER BY rowid").all(kind, changeId);
    return rows.map(row => this.getIntentRecord(kind, String(row.id))!);
  }
  insertIntentRecord<K extends IntentRecordType>(kind: K, record: IntentRecords[K]): void {
    const value = compileValidator<IntentRecords[K]>(intentRecordSchemas[kind])(record), change = this.getChange(value.change_id), actor = this.getActor(value.producer_actor_id);
    if (change?.project_id !== value.project_id || actor?.project_id !== value.project_id) throw new StoreConflictError("Intent record references must belong to its Project");
    this.database.prepare("INSERT INTO intent_records VALUES (?, ?, ?, ?, ?, ?)").run(value.id, value.project_id, value.change_id, kind, value.producer_actor_id, json(value));
  }
  insertSettingsVersion(record: ProjectSettingsVersion): void {
    const value = parseSettings(record);
    this.database.prepare("INSERT INTO project_settings_versions VALUES (?, ?, ?, ?)").run(value.id, value.project_id, value.version, json(value));
  }
  getTargetVersion(id: InternalId): TargetVersion | undefined {
    const row = this.database.prepare("SELECT payload_json FROM target_versions WHERE id = ?").get(id) as SqlRow | undefined;
    return row ? parseTarget(parseJson(row.payload_json)) : undefined;
  }
  listTargetVersions(): TargetVersion[] {
    return (this.database.prepare("SELECT payload_json FROM target_versions ORDER BY rowid").all() as SqlRow[])
      .map(row => parseTarget(parseJson(row.payload_json)));
  }
  insertTargetVersion(target: TargetVersion): void {
    const value = parseTarget(target);
    this.database.prepare("INSERT INTO target_versions VALUES (?, ?, ?, ?, ?, ?)")
      .run(value.id, value.project_id, value.name, value.revision, value.status, json(value));
  }
  updateTargetVersion(target: TargetVersion, expectedRevision: number): void {
    const value = parseTarget(target), old = this.getTargetVersion(target.id);
    if (!old || old.revision !== expectedRevision || value.revision !== expectedRevision + 1 || old.project_id !== value.project_id ||
      old.name !== value.name || old.created_at !== value.created_at || json(old.planned_window) !== json(value.planned_window) ||
      old.status !== "open" || value.status !== "closed") throw new StoreConflictError("Target version identity/state or revision conflict", old?.revision);
    const result = this.database.prepare("UPDATE target_versions SET revision = ?, status = ?, payload_json = ? WHERE id = ? AND revision = ?")
      .run(value.revision, value.status, json(value), value.id, expectedRevision);
    if (Number(result.changes) !== 1) throw new StoreConflictError("Target version revision conflict", old.revision);
  }

  nextChangeDisplayKey(projectId: InternalId): string {
    const row = this.database
      .prepare("UPDATE project_counters SET change_number = change_number + 1 WHERE project_id = ? RETURNING change_number")
      .get(projectId) as SqlRow | undefined;
    if (!row) throw new Error("Project counter not found");
    return `CHG-${String(Number(row.change_number)).padStart(4, "0")}`;
  }

  insertChange(change: Change): void {
    this.database
      .prepare(
        `INSERT INTO changes(
          id, project_id, display_key, lifecycle_state, operating_status, revision, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        change.id,
        change.project_id,
        change.display_key,
        change.lifecycle_state,
        change.operating_status,
        change.revision,
        json(parseChange(change))
      );
  }

  updateChange(change: Change, expectedRevision: number): void {
    parseChange(change);
    if (change.revision !== expectedRevision + 1) throw new StoreConflictError("Revision must increase exactly once");
    const old = this.getChange(change.id);
    if (old && (old.project_id !== change.project_id || old.display_key !== change.display_key || old.created_at !== change.created_at)) {
      throw new StoreConflictError("Change identity cannot be replaced");
    }
    const result = this.database
      .prepare(
        `UPDATE changes
         SET lifecycle_state = ?, operating_status = ?, revision = ?, payload_json = ?
         WHERE id = ? AND revision = ?`
      )
      .run(
        change.lifecycle_state,
        change.operating_status,
        change.revision,
        json(parseChange(change)),
        change.id,
        expectedRevision
      );
    if (Number(result.changes) !== 1) {
      const row = this.database.prepare("SELECT revision FROM changes WHERE id = ?").get(change.id) as SqlRow | undefined;
      throw new StoreConflictError("Change revision conflict", row ? Number(row.revision) : undefined);
    }
  }

  insertTransition(record: TransitionRecord): void {
    this.database
      .prepare(
        `INSERT INTO transition_records(id, project_id, change_id, command_id, occurred_at, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(record.id, record.project_id, record.change_id, record.command_id, record.occurred_at, json(parseTransition(record)));
  }

  appendEvent(proposed: ProposedEvent): EventEnvelope {
    const sequenceRow = this.database
      .prepare(
        "UPDATE project_counters SET event_sequence = event_sequence + 1 WHERE project_id = ? RETURNING event_sequence"
      )
      .get(proposed.project_id) as SqlRow | undefined;
    if (!sequenceRow) throw new Error("Project event counter not found");
    const event = parseEvent({
      schema_version: SCHEMA_VERSION,
      ...proposed,
      event_sequence: Number(sequenceRow.event_sequence)
    });
    this.database
      .prepare(
        `INSERT INTO event_ledger(
          event_id, project_id, event_sequence, aggregate_type, aggregate_id,
          aggregate_revision, event_type, occurred_at, envelope_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.event_id,
        event.project_id,
        event.event_sequence,
        event.aggregate.object_type,
        event.aggregate.id,
        event.aggregate_revision,
        event.event_type,
        event.occurred_at,
        json(event)
      );
    return event;
  }

  enqueueOutbox(message: OutboxMessage): void {
    const value = parseOutbox(message);
    const event = this.database.prepare("SELECT project_id FROM event_ledger WHERE event_id = ?").get(value.event_id);
    if (event?.project_id !== value.project_id || value.target_ref.object_type !== "event" || value.target_ref.id !== value.event_id) {
      throw new StoreConflictError("Outbox delivery target must match its project event");
    }
    this.database.prepare(`INSERT INTO outbox_messages(
      id, project_id, event_id, effect_key, kind, target_ref_json, status, attempt_count,
      available_at, lease_until, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(value.id, value.project_id, value.event_id, value.effect_key, value.kind, json(value.target_ref),
        value.status, value.attempt_count, value.available_at, value.lease_until ?? null,
        value.created_at, value.delivered_at ?? null);
  }
}
export class SqliteProjectStore implements ProjectStore {
  readonly #database: DatabaseSync;

  constructor(readonly databasePath: string) {
    requireCurrentFormat(databasePath);
    mkdirSync(dirname(databasePath), { recursive: true });
    this.#database = new DatabaseSync(databasePath, { timeout: 5000, defensive: true, allowExtension: false });
    try {
      this.#database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
      const exists = this.#database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
      if (!exists) initializeCurrentDatabase(this.#database);
      else if (readFormat(this.#database) !== CURRENT_DATABASE_FORMAT) throw new Error("Database format changed while opening");
      this.#database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL");
    } catch (error) { this.#database.close(); throw error; }
  }
  transaction<T>(work: (transaction: StoreTransaction) => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = work(new SqliteTransaction(this.#database));
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  readSnapshot<T>(work: (reader: ProjectReader) => T): { value: T; as_of_event_sequence: number } {
    this.#database.exec("BEGIN");
    try {
      const as_of_event_sequence = this.asOfEventSequence();
      const value = work({ getProject: () => this.getProject(), getChange: key => this.getChange(key),
        getCommandReceipt:id=>new SqliteTransaction(this.#database).getCommandReceipt(id),
        getActor: id => this.getActor(id), listActors: () => this.listActors(), listAssignments: id => this.listAssignments(id),
        getProviderEvidence: id => this.getProviderEvidence(id), listProviderEvidence: () => this.listProviderEvidence(),
        getProviderEvaluation: id => this.getProviderEvaluation(id), listProviderEvaluations: () => this.listProviderEvaluations(),
        getProviderDescriptor: id => this.getProviderDescriptor(id), listProviderDescriptors: () => this.listProviderDescriptors(),
        getProviderBinding: id => this.getProviderBinding(id), listProviderBindings: () => this.listProviderBindings(),
        getSettingsVersion: id => this.getSettingsVersion(id), getTargetVersion: id => this.getTargetVersion(id), listTargetVersions: () => this.listTargetVersions(),
        getIntentRecord: (kind, id) => this.getIntentRecord(kind, id), listIntentRecords: (kind, id) => this.listIntentRecords(kind, id),
        getExecutionObject: (kind, id) => this.getExecutionObject(kind, id), listExecutionObjects: (kind, id) => this.listExecutionObjects(kind, id),
        getExecutionRecord: (kind, id) => this.getExecutionRecord(kind, id), listExecutionRecords: kind => this.listExecutionRecords(kind),
        getVerificationRecord: (kind, id) => this.getVerificationRecord(kind, id), listVerificationRecords: (kind, id) => this.listVerificationRecords(kind, id),
        getRun: id => this.getRun(id), listRuns: id => this.listRuns(id), getRuntimeRecord: (kind, id) => this.getRuntimeRecord(kind, id), listRuntimeRecords: (kind, id) => this.listRuntimeRecords(kind, id),
        listChanges: () => this.listChanges(), listEvents: () => this.listEvents(), listOutbox: status => this.listOutbox(status) });
      this.#database.exec("COMMIT"); return { value, as_of_event_sequence };
    } catch (error) { if (this.#database.isTransaction) this.#database.exec("ROLLBACK"); throw error; }
  }
  getProject(): Project | undefined {
    const row = this.#database.prepare("SELECT payload_json FROM projects LIMIT 1").get() as SqlRow | undefined;
    return row ? parseProject(parseJson(row.payload_json)) : undefined;
  }
  getActor(id: InternalId): Actor | undefined { return new SqliteTransaction(this.#database).getActor(id); }
  listActors(): Actor[] { return new SqliteTransaction(this.#database).listActors(); }
  getProviderEvidence(id: InternalId): ProviderEvidence | undefined { return new SqliteTransaction(this.#database).getProviderEvidence(id); }
  listProviderEvidence(): ProviderEvidence[] { return new SqliteTransaction(this.#database).listProviderEvidence(); }
  getProviderEvaluation(id: InternalId): ProviderEvaluation | undefined { return new SqliteTransaction(this.#database).getProviderEvaluation(id); }
  listProviderEvaluations(): ProviderEvaluation[] { return new SqliteTransaction(this.#database).listProviderEvaluations(); }
  getProviderDescriptor(id: InternalId): ProviderDescriptor | undefined { return new SqliteTransaction(this.#database).getProviderDescriptor(id); }
  listProviderDescriptors(): ProviderDescriptor[] { return new SqliteTransaction(this.#database).listProviderDescriptors(); }
  getProviderBinding(id: InternalId): ProviderBinding | undefined { return new SqliteTransaction(this.#database).getProviderBinding(id); }
  listProviderBindings(): ProviderBinding[] { return new SqliteTransaction(this.#database).listProviderBindings(); }
  listAssignments(actorId?: InternalId): Assignment[] { return new SqliteTransaction(this.#database).listAssignments(actorId); }
  getSettingsVersion(id: InternalId): ProjectSettingsVersion | undefined { return new SqliteTransaction(this.#database).getSettingsVersion(id); }
  getIntentRecord<K extends IntentRecordType>(kind: K, id: InternalId): IntentRecords[K] | undefined { return new SqliteTransaction(this.#database).getIntentRecord(kind, id); }
  listIntentRecords<K extends IntentRecordType>(kind: K, id: InternalId): IntentRecords[K][] { return new SqliteTransaction(this.#database).listIntentRecords(kind, id); }
  getExecutionObject<K extends ExecutionObjectType>(kind: K, id: InternalId): ExecutionObjects[K] | undefined { return new SqliteTransaction(this.#database).getExecutionObject(kind, id); }
  listExecutionObjects<K extends ExecutionObjectType>(kind: K, id?: InternalId): ExecutionObjects[K][] { return new SqliteTransaction(this.#database).listExecutionObjects(kind, id); }
  getExecutionRecord<K extends ExecutionRecordType>(kind: K, id: InternalId): ExecutionRecords[K] | undefined { return new SqliteTransaction(this.#database).getExecutionRecord(kind, id); }
  listExecutionRecords<K extends ExecutionRecordType>(kind: K): ExecutionRecords[K][] { return new SqliteTransaction(this.#database).listExecutionRecords(kind); }
  getTargetVersion(id: InternalId): TargetVersion | undefined { return new SqliteTransaction(this.#database).getTargetVersion(id); }
  getVerificationRecord<K extends VerificationRecordType>(kind: K, id: InternalId): VerificationRecords[K] | undefined { return new SqliteTransaction(this.#database).getVerificationRecord(kind, id); }
  listVerificationRecords<K extends VerificationRecordType>(kind: K, id: InternalId): VerificationRecords[K][] { return new SqliteTransaction(this.#database).listVerificationRecords(kind, id); }
  getRun(id: InternalId): Run | undefined { return new SqliteTransaction(this.#database).getRun(id); }
  listRuns(id: InternalId): Run[] { return new SqliteTransaction(this.#database).listRuns(id); }
  getRuntimeRecord<K extends RuntimeRecordType>(kind: K, id: InternalId): RuntimeRecords[K] | undefined { return new SqliteTransaction(this.#database).getRuntimeRecord(kind, id); }
  listRuntimeRecords<K extends RuntimeRecordType>(kind: K, id: InternalId): RuntimeRecords[K][] { return new SqliteTransaction(this.#database).listRuntimeRecords(kind, id); }
  listTargetVersions(): TargetVersion[] { return new SqliteTransaction(this.#database).listTargetVersions(); }

  getChange(idOrKey: string): Change | undefined {
    const row = this.#database
      .prepare("SELECT payload_json FROM changes WHERE id = ? OR display_key = ? LIMIT 1")
      .get(idOrKey, idOrKey) as SqlRow | undefined;
    return row ? parseChange(parseJson(row.payload_json)) : undefined;
  }

  listChanges(): Change[] {
    const rows = this.#database
      .prepare("SELECT payload_json FROM changes ORDER BY CAST(SUBSTR(display_key, 5) AS INTEGER)")
      .all() as SqlRow[];
    return rows.map((row) => parseChange(parseJson(row.payload_json)));
  }

  listTransitions(): HistoricalTransition[] {
    return (this.#database.prepare("SELECT payload_json FROM transition_records ORDER BY rowid").all() as SqlRow[])
      .map(row => historicalTransition(parseJson(row.payload_json)));
  }
  asOfEventSequence(): number {
    return Number(this.#database.prepare("SELECT event_sequence FROM project_counters LIMIT 1").get()?.event_sequence ?? 0);
  }
  listEvents(): HistoricalEvent[] {
    const rows = this.#database
      .prepare("SELECT envelope_json FROM event_ledger ORDER BY event_sequence")
      .all() as SqlRow[];
    return rows.map((row) => historicalEvent(parseJson(row.envelope_json)));
  }

  listOutbox(status?: OutboxMessage["status"]): OutboxMessage[] {
    const rows = (status
      ? this.#database
          .prepare("SELECT * FROM outbox_messages WHERE status = ? ORDER BY created_at")
          .all(status)
      : this.#database.prepare("SELECT * FROM outbox_messages ORDER BY created_at").all()) as SqlRow[];
    return rows.map((row) => parseOutbox({
      schema_version: SCHEMA_VERSION,
      id: String(row.id),
      project_id: String(row.project_id),
      event_id: String(row.event_id),
      effect_key: String(row.effect_key), kind: String(row.kind) as OutboxMessage["kind"],
      target_ref: parseJson(row.target_ref_json),
      status: String(row.status) as OutboxMessage["status"],
      attempt_count: Number(row.attempt_count),
      available_at: String(row.available_at),
      ...(row.lease_until ? { lease_until: String(row.lease_until) } : {}),
      created_at: String(row.created_at),
      ...(row.delivered_at ? { delivered_at: String(row.delivered_at) } : {})
    }));
  }

  claimOutbox(now: string, leaseUntil: string): ClaimedOutboxMessage | undefined {
    parseTimestamp(now); parseTimestamp(leaseUntil);
    if (!Number.isFinite(Date.parse(now)) || !Number.isFinite(Date.parse(leaseUntil)) || Date.parse(leaseUntil) <= Date.parse(now)) {
      throw new StoreConflictError("Outbox lease must end after the claim time");
    }
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.#database
        .prepare(
          `SELECT * FROM outbox_messages
           WHERE available_at <= ?
             AND (status = 'pending' OR (status = 'processing' AND lease_until <= ?))
           ORDER BY created_at, rowid
           LIMIT 1`
        )
        .get(now, now) as SqlRow | undefined;
      if (!row) {
        this.#database.exec("COMMIT");
        return undefined;
      }
      this.#database
        .prepare(
          `UPDATE outbox_messages
           SET status = 'processing', attempt_count = attempt_count + 1, lease_until = ?
           WHERE id = ?`
        )
        .run(leaseUntil, String(row.id));
      const claimed = parseOutbox({
        schema_version: SCHEMA_VERSION,
        id: String(row.id),
        project_id: String(row.project_id),
        event_id: String(row.event_id),
        effect_key: String(row.effect_key), kind: String(row.kind) as OutboxMessage["kind"],
        target_ref: parseJson(row.target_ref_json),
        status: "processing",
        attempt_count: Number(row.attempt_count) + 1,
        available_at: String(row.available_at),
        lease_until: leaseUntil,
        created_at: String(row.created_at),
        ...(row.delivered_at ? { delivered_at: String(row.delivered_at) } : {})
      });
      this.#database.exec("COMMIT");
      return { ...claimed, status: "processing", lease_until: leaseUntil };
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  markOutboxDelivered(messageId: InternalId, deliveredAt: string, claim: OutboxClaim): void {
    parseTimestamp(deliveredAt);
    const result = this.#database
      .prepare(
        `UPDATE outbox_messages
         SET status = 'delivered', delivered_at = ?, lease_until = NULL
         WHERE id = ? AND status = 'processing' AND attempt_count = ? AND lease_until = ? AND lease_until > ?`
      )
      .run(deliveredAt, messageId, claim.attempt_count, claim.lease_until, deliveredAt);
    if (Number(result.changes) !== 1) throw new StoreConflictError("Outbox message is not claimed");
  }

  releaseOutbox(messageId: InternalId, availableAt: string, claim: OutboxClaim): void {
    parseTimestamp(availableAt);
    const result = this.#database
      .prepare(
        `UPDATE outbox_messages
         SET status = 'pending', available_at = ?, lease_until = NULL
         WHERE id = ? AND status = 'processing' AND attempt_count = ? AND lease_until = ?`
      )
      .run(availableAt, messageId, claim.attempt_count, claim.lease_until);
    if (Number(result.changes) !== 1) throw new StoreConflictError("Outbox message is not claimed");
  }

  close(): void {
    this.#database.close();
  }
}
