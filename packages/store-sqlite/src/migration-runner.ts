import { createHash } from "node:crypto";
import { closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import * as v1 from "@cimiloop/protocol/v1";
import * as v2 from "@cimiloop/protocol/v2";
import { additionalSchema, installPlanningSchema, installIntentSchema, installExecutionSchema, installVerificationSchema, installRuntimeSchema, installProviderAssessmentSchema, installSkillAssessmentGuard, installAgentRunGuard, installWriteGuards, MigrationError, outboxSchema, readDatabaseFormat, readFormat, CURRENT_DATABASE_FORMAT } from "./database-format.js";
import { validateFormat2, validateFormat3, validateFormat4, validateFormat5, validateFormat6, validateFormat7, validateFormat8, validateFormat9 } from "./format2-preflight.js";
import { m0Schema } from "./v1/project-store.js";

type Row = Record<string, unknown>;
const digest = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const unsafe = (message: string): never => { throw new MigrationError("MIGRATION_UNSAFE", message); };
const rows = (db: DatabaseSync, table: string): Row[] => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
const parse = <T>(schema: Parameters<typeof v1.compileValidator>[0], value: unknown): T => v1.compileValidator<T>(schema)(value);
const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry: unknown) =>
  entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
const data = (row: Row, column = "payload_json"): unknown => JSON.parse(String(row[column]));

interface Preflight {
  project: v1.Project;
  actor: v1.Actor;
  mutable: { table: string; objectType: string; row: Row; current: unknown }[];
  counts: Record<string, number>;
}
const schemaSignature = (db: DatabaseSync) => db.prepare(
  "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
).all().map(row => ({ ...row, sql: String(row.sql).replace(/\s+/g, " ").trim() }));

const validateM0 = (db: DatabaseSync, now: string): Preflight => {
  if (readFormat(db) !== 1) unsafe("迁移源不是 M0 格式");
  const reference = new DatabaseSync(":memory:");
  try {
    reference.exec(m0Schema);
    if (canonical(schemaSignature(db)) !== canonical(schemaSignature(reference))) unsafe("M0 表、索引或触发器结构不匹配");
  } finally { reference.close(); }
  if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) {
    unsafe("数据库完整性或外键检查失败");
  }
  const projectRows = rows(db, "projects"), actorRows = rows(db, "actors"), roleRows = rows(db, "roles"), assignmentRows = rows(db, "assignments");
  if (projectRows.length !== 1 || actorRows.length !== 1 || roleRows.length !== 1 || assignmentRows.length !== 1) {
    unsafe("仅支持原始 M0 的单项目初始化身份，不能推断其他身份来源");
  }
  const project = parse<v1.Project>(v1.ProjectSchema, data(projectRows[0]!));
  const actor = parse<v1.Actor>(v1.ActorSchema, data(actorRows[0]!));
  const role = parse<v1.Role>(v1.RoleSchema, data(roleRows[0]!));
  const assignment = parse<v1.Assignment>(v1.AssignmentSchema, data(assignmentRows[0]!));
  if (assignment.project_id !== project.id || assignment.actor_id !== actor.id || assignment.role_id !== role.id || assignment.scope_id !== project.id) {
    unsafe("M0 角色指派引用不一致");
  }
  const convertedProject = { ...project, schema_version: v2.SCHEMA_VERSION, updated_at: project.created_at };
  const convertedActor = { ...actor, schema_version: v2.SCHEMA_VERSION, project_id: project.id, updated_at: actor.created_at };
  const convertedRole = { ...role, schema_version: v2.SCHEMA_VERSION, project_id: project.id, updated_at: role.created_at };
  const { scope_type, scope_id, ...assignmentFields } = assignment;
  const convertedAssignment = { ...assignmentFields, schema_version: v2.SCHEMA_VERSION, updated_at: assignment.created_at,
    role_key: role.role_key, scope: { kind: scope_type, id: scope_id }, granted_by: actor.id };
  const mutable: Preflight["mutable"] = [
    { table: "projects", objectType: "project", row: projectRows[0]!, current: parse(v2.ProjectSchema, convertedProject) },
    { table: "actors", objectType: "actor", row: actorRows[0]!, current: parse(v2.ActorSchema, convertedActor) },
    { table: "roles", objectType: "role", row: roleRows[0]!, current: parse(v2.RoleSchema, convertedRole) },
    { table: "assignments", objectType: "assignment", row: assignmentRows[0]!, current: parse(v2.AssignmentSchema, convertedAssignment) }
  ];
  for (const entry of mutable) {
    const source = data(entry.row) as { id: string; revision: number };
    if (entry.row.id !== source.id || entry.row.revision !== source.revision) unsafe("M0 身份对象索引与载荷不一致");
  }
  if (roleRows[0]!.role_key !== role.role_key || assignmentRows[0]!.project_id !== project.id || assignmentRows[0]!.actor_id !== actor.id || assignmentRows[0]!.role_id !== role.id) {
    unsafe("M0 角色或指派索引不一致");
  }
  const changes = new Map<string, v1.Change>();
  for (const row of rows(db, "changes")) {
    const change = parse<v1.Change>(v1.ChangeSchema, data(row));
    if (change.project_id !== project.id || change.owner_actor_id !== actor.id) unsafe("M0 Change 的项目或 Owner 引用不一致");
    for (const field of ["id", "project_id", "display_key", "lifecycle_state", "operating_status", "revision"] as const) {
      if (row[field] !== change[field]) unsafe("M0 Change 索引与载荷不一致");
    }
    const current = parse(v2.ChangeSchema, { ...change, schema_version: v2.SCHEMA_VERSION, kind: "requirement", priority: 0 });
    mutable.push({ table: "changes", objectType: "change", row, current });
    changes.set(change.id, change);
  }
  const events = new Map<string, v1.EventEnvelope>();
  const commands = new Set<string>();
  const changeFacts = new Map<string, { revision: number; status: "Active" | "Paused"; reason?: string }>();
  const eventRows = rows(db, "event_ledger").sort((a, b) => Number(a.event_sequence) - Number(b.event_sequence));
  for (const [index, row] of eventRows.entries()) {
    const event = parse<v1.EventEnvelope>(v1.EventEnvelopeSchema, data(row, "envelope_json"));
    if (!["ProjectInitialized", "ChangeCreated", "ChangePaused", "ChangeResumed"].includes(event.event_type)) unsafe("未知的 M0 事件类型");
    if (commands.has(event.command_id)) unsafe("M0 事件重复使用 command_id");
    commands.add(event.command_id);
    const aggregate = event.aggregate.object_type === "project" ? project : changes.get(event.aggregate.id);
    if (!aggregate || aggregate.id !== event.aggregate.id || event.project_id !== project.id || event.actor_id !== actor.id || event.event_sequence !== index + 1 || event.aggregate_revision > aggregate.revision) unsafe("M0 事件序列或聚合引用不一致");
    for (const field of ["event_id", "project_id", "event_sequence", "aggregate_revision", "event_type", "occurred_at"] as const) {
      if (row[field] !== event[field]) unsafe("M0 事件索引与载荷不一致");
    }
    if (row.aggregate_type !== event.aggregate.object_type || row.aggregate_id !== event.aggregate.id || event.aggregate.domain_version !== 1) unsafe("M0 事件目标格式不一致");
    parse(v2.EventEnvelopeSchema, { ...event, schema_version: v2.SCHEMA_VERSION, acting_role: "project_owner",
      aggregate: { object_type: event.aggregate.object_type, id: event.aggregate.id } });
    if (event.event_type === "ProjectInitialized") {
      if (index !== 0 || event.aggregate.id !== project.id || event.aggregate_revision !== 1 || event.payload.project_name !== project.name || event.payload.repository_kind !== project.repository_kind) unsafe("M0 初始化事件不一致");
    } else {
      const previous = changeFacts.get(event.aggregate.id);
      if (event.event_type === "ChangeCreated") {
        if (previous || event.aggregate_revision !== 1 || event.payload.display_key !== changes.get(event.aggregate.id)?.display_key) unsafe("M0 Change 创建事实不一致");
        changeFacts.set(event.aggregate.id, { revision: 1, status: "Active" });
      } else {
        if (!previous || event.aggregate_revision !== previous.revision + 1 || previous.status !== (event.event_type === "ChangePaused" ? "Active" : "Paused")) unsafe("M0 Change 状态事实不连续");
        changeFacts.set(event.aggregate.id, { revision: event.aggregate_revision, status: event.event_type === "ChangePaused" ? "Paused" : "Active",
          ...(event.event_type === "ChangePaused" ? { reason: String(event.payload.reason) } : {}) });
      }
    }
    events.set(event.event_id, event);
  }
  const initialization = eventRows[0] && events.get(String(eventRows[0].event_id));
  if (!initialization || initialization.event_type !== "ProjectInitialized" || initialization.actor_id !== assignment.actor_id || initialization.occurred_at !== assignment.effective_at) unsafe("缺少 M0 初始化身份和指派来源");
  for (const change of changes.values()) {
    const fact = changeFacts.get(change.id);
    if (!fact || fact.revision !== change.revision || fact.status !== change.operating_status || fact.reason !== change.pause_reason) unsafe("M0 Change 当前状态与历史事实不一致");
  }
  const counters = rows(db, "project_counters");
  const maxChange = Math.max(0, ...[...changes.values()].map(change => Number(change.display_key.slice(4))));
  if (counters.length !== 1 || counters[0]!.project_id !== project.id || counters[0]!.event_sequence !== events.size || Number(counters[0]!.change_number) < maxChange) unsafe("M0 ProjectCounter 与现有事实不一致");
  for (const row of rows(db, "transition_records")) {
    const record = parse<v1.TransitionRecord>(v1.TransitionRecordSchema, data(row));
    for (const field of ["id", "project_id", "change_id", "command_id", "occurred_at"] as const) if (row[field] !== record[field]) unsafe("M0 Transition 索引与载荷不一致");
    const matching = [...events.values()].find(event => event.command_id === record.command_id && event.aggregate.id === record.change_id);
    if (!changes.has(record.change_id) || record.project_id !== project.id || record.actor_id !== actor.id || !matching || matching.event_type !== (record.transition_type === "change_paused" ? "ChangePaused" : "ChangeResumed") || record.occurred_at !== matching.occurred_at || record.from_status === record.to_status || (record.to_status === "Paused" && record.reason !== matching.payload.reason)) unsafe("M0 Transition 缺少匹配的状态事实");
  }
  for (const row of rows(db, "command_receipts")) {
    const result = parse<v1.CommandSuccess>(v1.CommandSuccessSchema, data(row, "result_json"));
    if (row.command_id !== result.command_id || !/^[0-9a-f]{64}$/.test(String(row.request_digest)) || result.events.length !== 1) unsafe("M0 Receipt 身份或摘要格式无效");
    for (const event of result.events) if (canonical(event) !== canonical(events.get(event.event_id))) unsafe("M0 Receipt 与历史事件不一致");
    const event = result.events[0]!;
    if (event.command_id !== result.command_id || result.revision !== event.aggregate_revision || canonical(result.aggregate) !== canonical(event.aggregate)) unsafe("M0 Receipt 的结果目标或版本不一致");
    if ("project" in result.data && (result.data.actor.id !== actor.id || canonical(result.data.assignment) !== canonical(assignment))) unsafe("M0 Receipt 的初始化身份不一致");
    if ("change" in result.data && !changes.has(result.data.change.id)) unsafe("M0 Receipt 的 Change 引用无效");
  }
  if (rows(db, "command_receipts").length !== events.size || rows(db, "outbox_messages").length !== events.size || rows(db, "transition_records").length !== eventRows.filter(row => row.event_type === "ChangePaused" || row.event_type === "ChangeResumed").length) unsafe("M0 事件、回执、Transition 或 Outbox 原子记录不完整");
  for (const row of rows(db, "outbox_messages")) {
    const event = events.get(String(row.event_id));
    if (!event || row.project_id !== event.project_id) unsafe("M0 Outbox 的事件引用不一致");
    parse(v2.OutboxMessageSchema, {
      schema_version: v2.SCHEMA_VERSION,
      id: row.id, project_id: row.project_id, event_id: row.event_id, effect_key: "legacy", kind: "legacy_event_delivery",
      target_ref: { object_type: "event", id: row.event_id }, status: row.status, attempt_count: row.attempt_count,
      available_at: row.available_at, created_at: row.created_at,
      ...(row.lease_until ? { lease_until: row.lease_until } : {}), ...(row.delivered_at ? { delivered_at: row.delivered_at } : {})
    });
    if ((row.status === "processing" && !row.lease_until) || (row.status === "delivered" && !row.delivered_at)) unsafe("M0 Outbox 状态缺少时间依据");
    if (row.status === "processing" && String(row.lease_until) > now) unsafe("仍有有效 Outbox 租约，请先停止投递 Worker 并等待租约到期");
  }
  const counts = Object.fromEntries(["projects", "actors", "roles", "assignments", "changes", "transition_records", "event_ledger", "command_receipts", "outbox_messages"].map(table => [table, rows(db, table).length]));
  return { project, actor, mutable, counts };
};

interface FileEntry { path: string; size: number; digest: string }
const inventory = (databasePath: string): FileEntry[] => {
  const directory = dirname(databasePath), excluded = new Set([basename(databasePath), `${basename(databasePath)}-wal`, `${basename(databasePath)}-shm`, `${basename(databasePath)}-journal`, ".migration.lock", "backups"]);
  const files: FileEntry[] = [];
  const visit = (path: string): void => {
    for (const name of readdirSync(path).sort()) {
      if (path === directory && excluded.has(name)) continue;
      const child = join(path, name), stat = lstatSync(child);
      if (stat.isSymbolicLink()) unsafe("数据目录包含符号链接，无法提供完整备份");
      if (stat.isDirectory()) visit(child);
      else if (stat.isFile()) { const content = readFileSync(child); files.push({ path: relative(directory, child).replaceAll("\\", "/"), size: content.length, digest: digest(content) }); }
      else unsafe("数据目录包含无法备份的文件类型");
    }
  };
  visit(directory); return files;
};

export interface MigrationOptions {
  actorId: v2.InternalId;
  now?: string;
  // Synchronous fault injection / observer; throwing always rolls back the upgrade.
  onStage?: (stage: "backup_complete" | "state_converted" | "schema_installed" | "before_commit") => void;
}
export class MigrationRunner {
  constructor(readonly databasePath: string) {}
  check(): v2.MigrationReport {
    const db = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      db.exec("BEGIN");
      const format = readFormat(db);
      const counts = format === 1 ? validateM0(db, new Date().toISOString()).counts : format === 2 ? validateFormat2(db, new Date().toISOString()).counts : format === 3 ? validateFormat3(db, new Date().toISOString()).counts : format === 4 ? validateFormat4(db, new Date().toISOString()).counts : format === 5 ? validateFormat5(db, new Date().toISOString()).counts : format === 6 ? validateFormat6(db, new Date().toISOString()).counts : format === 7 ? validateFormat7(db, new Date().toISOString()).counts : format === 8 ? validateFormat8(db, new Date().toISOString()).counts : format === 9 ? validateFormat9(db, new Date().toISOString()).counts : {};
      return v2.parseMigrationReport({ schema_version: v2.SCHEMA_VERSION, ok: true, mode: "check", from_format: format,
        to_format: CURRENT_DATABASE_FORMAT, migration_required: format !== CURRENT_DATABASE_FORMAT, counts });
    } catch (error) { if (error instanceof MigrationError) throw error; throw new MigrationError("MIGRATION_UNSAFE", "旧格式预检查失败：数据不符合已知协议", { cause: error }); }
    finally { db.close(); }
  }
  async apply(options: MigrationOptions): Promise<v2.MigrationReport> {
    if (options.now !== undefined && (!Number.isFinite(Date.parse(options.now)) || new Date(options.now).toISOString() !== (options.now.length === 20 ? options.now.replace("Z", ".000Z") : options.now))) unsafe("迁移时间必须是有效 UTC 日期");
    const sourcePath = resolve(this.databasePath), lockPath = join(dirname(sourcePath), ".migration.lock");
    if (!existsSync(sourcePath)) unsafe("项目数据库不存在");
    readDatabaseFormat(sourcePath); // Reject unknown or newer formats before any write connection or lock file.
    let lock: number;
    try { lock = openSync(lockPath, "wx"); } catch { return unsafe("已有迁移锁，请确认另一个迁移进程已退出后处理锁文件"); }
    let db: DatabaseSync | undefined;
    try {
      writeFileSync(lock, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), database_path: sourcePath }));
      db = new DatabaseSync(sourcePath, { timeout: 0, defensive: true, allowExtension: false });
      db.exec("PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL");
      const format = readFormat(db);
      if (format === CURRENT_DATABASE_FORMAT) return v2.parseMigrationReport({ schema_version: v2.SCHEMA_VERSION, ok: true, mode: "apply", from_format: format, to_format: CURRENT_DATABASE_FORMAT, migration_required: false, counts: {} });
      // Keep this write lock throughout validation, backup and commit. Separate read connection backs up the pre-upgrade snapshot.
      db.exec("BEGIN IMMEDIATE");
      const now = options.now ?? new Date().toISOString(), preflight = format === 1 ? validateM0(db, now) : format === 2 ? validateFormat2(db, now) : format === 3 ? validateFormat3(db, now) : format === 4 ? validateFormat4(db, now) : format === 5 ? validateFormat5(db, now) : format === 6 ? validateFormat6(db, now) : format === 7 ? validateFormat7(db, now) : format === 8 ? validateFormat8(db, now) : validateFormat9(db, now);
      const authorizedActors = "authorizedActors" in preflight ? preflight.authorizedActors : [preflight.actor.id];
      if (!authorizedActors.includes(options.actorId)) unsafe("迁移操作者必须是现有有效 Human Project Owner");
      const migrationId = v2.createInternalId(), backupDirectory = join(dirname(sourcePath), "backups", migrationId);
      mkdirSync(dirname(backupDirectory), { recursive: true });
      if (lstatSync(dirname(backupDirectory)).isSymbolicLink()) unsafe("备份目录不能是符号链接");
      mkdirSync(backupDirectory); // Never reuse or overwrite an earlier backup.
      const files = inventory(sourcePath), backupPath = join(backupDirectory, "project.db");
      const reader = new DatabaseSync(sourcePath, { readOnly: true });
      try { await backup(reader, backupPath); } finally { reader.close(); }
      for (const file of files) {
        const target = join(backupDirectory, "data", file.path);
        mkdirSync(dirname(target), { recursive: true }); copyFileSync(join(dirname(sourcePath), file.path), target);
        if (digest(readFileSync(target)) !== file.digest) unsafe("备份期间数据文件发生变更");
      }
      const backupDigest = digest(readFileSync(backupPath));
      const backupDb = new DatabaseSync(backupPath, { readOnly: true });
      try { if (format === 1) validateM0(backupDb, now); else if (format === 2) validateFormat2(backupDb, now); else if (format === 3) validateFormat3(backupDb, now); else if (format === 4) validateFormat4(backupDb, now); else if (format === 5) validateFormat5(backupDb, now); else if (format === 6) validateFormat6(backupDb, now); else if (format === 7) validateFormat7(backupDb, now); else if (format === 8) validateFormat8(backupDb, now); else validateFormat9(backupDb, now); } finally { backupDb.close(); }
      const manifest = { migration_id: migrationId, from_format: format, to_format: CURRENT_DATABASE_FORMAT, created_at: now, database: { path: "project.db", digest: backupDigest }, files };
      writeFileSync(join(backupDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
      options.onStage?.("backup_complete");
      if (canonical(files) !== canonical(inventory(sourcePath))) unsafe("数据文件在停写窗口内发生变更");
      if (format === 1) db.exec(additionalSchema);
      db.prepare("INSERT INTO migration_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(migrationId, format, CURRENT_DATABASE_FORMAT, now, options.actorId, backupPath, backupDigest, JSON.stringify(manifest));
      for (const entry of preflight.mutable) {
        const original = String(entry.row.payload_json);
        db.prepare("INSERT INTO migration_origins VALUES (?, ?, ?, '1.0.0', ?, ?)").run(entry.objectType, String(entry.row.id), migrationId, digest(original), original);
        db.prepare(`UPDATE ${entry.table} SET payload_json = ? WHERE id = ?`).run(JSON.stringify(entry.current), String(entry.row.id));
      }
      options.onStage?.("state_converted");
      if (format === 1) {
      db.exec("ALTER TABLE outbox_messages RENAME TO outbox_messages_m0");
      db.exec(outboxSchema);
      db.exec(`INSERT INTO outbox_messages SELECT id, project_id, event_id, 'legacy', 'legacy_event_delivery',
        json_object('object_type', 'event', 'id', event_id), status, attempt_count, available_at, lease_until, created_at, delivered_at FROM outbox_messages_m0;
        DROP TABLE outbox_messages_m0;
        CREATE INDEX idx_outbox_status_available ON outbox_messages(status, available_at);`);
      // Optional role_id in v2 remains an FK when supplied.
      db.exec("ALTER TABLE assignments RENAME TO assignments_m0");
      db.exec(`CREATE TABLE assignments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
        actor_id TEXT NOT NULL REFERENCES actors(id), role_id TEXT REFERENCES roles(id), revision INTEGER NOT NULL, payload_json TEXT NOT NULL) STRICT;
        INSERT INTO assignments SELECT * FROM assignments_m0; DROP TABLE assignments_m0;`);
      }
      const eventSequence = Number(db.prepare("UPDATE project_counters SET event_sequence = event_sequence + 1 WHERE project_id = ? RETURNING event_sequence").get(preflight.project.id)?.event_sequence);
      const event = parse<v2.EventEnvelope>(v2.EventEnvelopeSchema, { schema_version: v2.SCHEMA_VERSION,
        event_id: v2.createInternalId(), event_type: "ProjectMigrated", project_id: preflight.project.id,
        aggregate: { object_type: "project", id: preflight.project.id }, aggregate_revision: preflight.project.revision,
        event_sequence: eventSequence, occurred_at: now, actor_id: options.actorId, acting_role: "project_owner", command_id: migrationId, correlation_id: migrationId,
        payload: { from_format: format, to_format: CURRENT_DATABASE_FORMAT, migration_id: migrationId, backup_digest: { algorithm: "sha256", value: backupDigest } } });
      db.prepare("INSERT INTO event_ledger VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(event.event_id, event.project_id, event.event_sequence, "project", event.aggregate.id, event.aggregate_revision, event.event_type, event.occurred_at, JSON.stringify(event));
      if (format === 1) {
        installWriteGuards(db);
        db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (2, ?)").run(now);
      }
      if (format < 3) {
        installPlanningSchema(db);
        db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (3, ?)").run(now);
      }
      if (format < 4) {
        installIntentSchema(db);
        db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (4, ?)").run(now);
      }
      if (format < 5) { installExecutionSchema(db); db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (5, ?)").run(now); }
      if (format < 6) { installVerificationSchema(db); db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (6, ?)").run(now); }
      if (format < 7) { installRuntimeSchema(db); db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (7, ?)").run(now); }
      if (format < 8) { installProviderAssessmentSchema(db); db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (8, ?)").run(now); }
      if (format < 9) { installSkillAssessmentGuard(db); db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (9, ?)").run(now); }
      installAgentRunGuard(db);
      db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(CURRENT_DATABASE_FORMAT, now);
      options.onStage?.("schema_installed");
      if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) unsafe("升级后的数据库完整性检查失败");
      options.onStage?.("before_commit");
      if (canonical(files) !== canonical(inventory(sourcePath))) unsafe("迁移提交前数据文件发生变更");
      db.exec("COMMIT");
      return v2.parseMigrationReport({ schema_version: v2.SCHEMA_VERSION, ok: true, mode: "apply", from_format: format, to_format: CURRENT_DATABASE_FORMAT,
        migration_required: false, counts: preflight.counts, backup_path: backupPath, backup_digest: { algorithm: "sha256", value: backupDigest }, migration_id: migrationId });
    } catch (error) {
      if (db?.isTransaction) db.exec("ROLLBACK");
      if (error instanceof MigrationError) throw error;
      throw new MigrationError("MIGRATION_UNSAFE", "迁移失败，数据库事务已回滚；请检查停写状态、协议数据及备份", { cause: error });
    } finally { db?.close(); closeSync(lock); unlinkSync(lockPath); }
  }
}
