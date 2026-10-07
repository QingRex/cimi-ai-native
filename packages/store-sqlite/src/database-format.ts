import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { m0Schema } from "./v1/project-store.js";

export const CURRENT_DATABASE_FORMAT = 10;
export class MigrationError extends Error {
  constructor(readonly code: "MIGRATION_REQUIRED" | "MIGRATION_UNSAFE" | "DATABASE_TOO_NEW", message: string, options?: ErrorOptions) {
    super(message, options); this.name = "MigrationError";
  }
}
export const readFormat = (database: DatabaseSync): number => {
  try {
    const versions = database.prepare("SELECT version FROM schema_migrations ORDER BY version").all()
      .map(row => Number(row.version));
    const version = versions.at(-1);
    if (version !== undefined && version > CURRENT_DATABASE_FORMAT) {
      throw new MigrationError("DATABASE_TOO_NEW", "数据库格式较新，当前程序无法打开");
    }
    if (!versions.length || versions.some((value, i) => !Number.isInteger(value) || value < 1 || (i > 0 && value !== versions[i - 1]! + 1))) {
      throw new MigrationError("MIGRATION_UNSAFE", "数据库格式标记缺失或迁移历史不连续");
    }
    return version!;
  } catch (error) {
    if (error instanceof MigrationError) throw error;
    throw new MigrationError("MIGRATION_UNSAFE", "无法读取数据库格式标记");
  }
};
export const readDatabaseFormat = (path: string): number | undefined => {
  if (!existsSync(path)) return undefined;
  const database = new DatabaseSync(path, { readOnly: true });
  try { return readFormat(database); } finally { database.close(); }
};
export const requireCurrentFormat = (path: string): void => {
  const format = readDatabaseFormat(path);
  if (format !== undefined && format !== CURRENT_DATABASE_FORMAT) {
    throw new MigrationError("MIGRATION_REQUIRED", "请先运行 cimiloop migrate --check，再执行 cimiloop migrate");
  }
};

export const outboxSchema = `CREATE TABLE outbox_messages (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  event_id TEXT NOT NULL REFERENCES event_ledger(event_id), effect_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('legacy_event_delivery', 'event_delivery')), target_ref_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'delivered')),
  attempt_count INTEGER NOT NULL CHECK(attempt_count >= 0), available_at TEXT NOT NULL, lease_until TEXT,
  created_at TEXT NOT NULL, delivered_at TEXT, UNIQUE(event_id, effect_key)
) STRICT;`;
export const additionalSchema = `
CREATE TABLE immutable_records (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  object_type TEXT NOT NULL CHECK(object_type IN ('provider_descriptor', 'provider_binding')),
  payload_json TEXT NOT NULL
) STRICT;
CREATE TABLE migration_runs (
  id TEXT PRIMARY KEY, from_format INTEGER NOT NULL, to_format INTEGER NOT NULL,
  applied_at TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES actors(id), backup_path TEXT NOT NULL,
  backup_digest TEXT NOT NULL, manifest_json TEXT NOT NULL
) STRICT;
CREATE TABLE migration_origins (
  object_type TEXT NOT NULL, object_id TEXT NOT NULL,
  migration_id TEXT NOT NULL REFERENCES migration_runs(id), source_schema_version TEXT NOT NULL,
  source_digest TEXT NOT NULL, source_json TEXT NOT NULL, PRIMARY KEY(object_type, object_id)
) STRICT;
CREATE INDEX idx_records_type ON immutable_records(project_id, object_type);
`;
export const installWriteGuards = (db: DatabaseSync): void => {
  for (const [table, column] of [
    ...["projects", "actors", "roles", "assignments", "changes", "transition_records", "immutable_records"]
      .map(table => [table, "payload_json"] as const),
    ["event_ledger", "envelope_json"], ["command_receipts", "result_json"]
  ]) {
    for (const action of ["INSERT", "UPDATE"]) {
      db.exec(`CREATE TRIGGER guard_${table}_${action.toLowerCase()} BEFORE ${action} ON ${table}
        WHEN json_extract(NEW.${column}, '$.schema_version') IS NOT '2.0.0'
        BEGIN SELECT RAISE(ABORT, 'database format 2 requires protocol 2 writes'); END;`);
    }
  }
  for (const table of ["transition_records", "event_ledger", "command_receipts", "immutable_records", "migration_runs", "migration_origins"]) {
    for (const action of ["UPDATE", "DELETE"]) db.exec(`CREATE TRIGGER immutable_${table}_${action.toLowerCase()}
      BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT, 'immutable record'); END;`);
  }
};
export const initializeCurrentDatabase = (db: DatabaseSync): void => {
  initializeDatabase(db, 10);
};
// Frozen layout for validating earlier format 2 sources; not used by ordinary opening.
export const initializeFormat2Database = (db: DatabaseSync): void => { initializeDatabase(db, 2); };
export const initializeFormat3Database = (db: DatabaseSync): void => { initializeDatabase(db, 3); };
export const initializeFormat4Database = (db: DatabaseSync): void => { initializeDatabase(db, 4); };
export const initializeFormat5Database = (db: DatabaseSync): void => { initializeDatabase(db, 5); };
export const initializeFormat6Database = (db: DatabaseSync): void => { initializeDatabase(db, 6); };
export const initializeFormat7Database = (db: DatabaseSync): void => { initializeDatabase(db, 7); };
export const initializeFormat8Database = (db: DatabaseSync): void => { initializeDatabase(db, 8); };
export const initializeFormat9Database = (db: DatabaseSync): void => { initializeDatabase(db, 9); };
export const installAgentRunGuard = (db: DatabaseSync): void => {
  const fieldsMatch = (left: string, leftPrefix: string, right: string, rightPrefix: string, fields: string[]) => fields.map(field =>
    `json_extract(${left}, '$.${leftPrefix}${field}') IS json_extract(${right}, '$.${rightPrefix}${field}')`).join(" AND ");
  const pinFields = ["binding_ref.object_type", "binding_ref.id", "digest.algorithm", "digest.value"];
  const pinsMatch = (left: string, right: string, prefix = "") => `
    ${fieldsMatch(left, "runtime_binding.", right, `${prefix}runtime_binding.`, pinFields)} AND
    ${fieldsMatch(left, "host_admission_ref.", right, `${prefix}host_admission_ref.`, ["provider", "resource_type", "locator", "digest.algorithm", "digest.value"])} AND
    json_array_length(json_extract(${left}, '$.skill_bindings')) IS json_array_length(json_extract(${right}, '$.${prefix}skill_bindings')) AND
    NOT EXISTS (SELECT 1 FROM json_each(json_extract(${left}, '$.skill_bindings')) a
      LEFT JOIN json_each(json_extract(${right}, '$.${prefix}skill_bindings')) b ON a.key = b.key
      WHERE NOT (${fieldsMatch("a.value", "", "b.value", "", pinFields)}))`;
  // Compare semantic scalar identities. JSON object text changes with key order;
  // ordered Skill arrays and every digest/reference field still have to match.
  db.exec(`CREATE TRIGGER guard_agent_run_relations_insert BEFORE INSERT ON run_records
    WHEN
      (NEW.object_type = 'context_manifest' AND json_extract(NEW.payload_json, '$.boundary') IN ('agent_scoped','agent_independent_read_only') AND (
        json_extract(NEW.payload_json, '$.producer_actor_id') IS NOT json_extract(NEW.payload_json, '$.executor_ref.id') OR
        (SELECT json_extract(payload_json, '$.actor_type') FROM actors WHERE id = json_extract(NEW.payload_json, '$.executor_ref.id') AND json_extract(payload_json, '$.project_id') = NEW.project_id) IS NOT 'agent' OR
        (SELECT json_extract(payload_json, '$.approval.binding_scope') FROM immutable_records WHERE id = json_extract(NEW.payload_json, '$.runtime_binding.binding_ref.id') AND project_id = NEW.project_id AND object_type = 'provider_binding') IS NOT 'task_execution')) OR
      (NEW.object_type = 'run_record' AND NOT EXISTS (
        SELECT 1 FROM run_records c WHERE c.id = json_extract(NEW.payload_json, '$.context_ref.id') AND c.object_type = 'context_manifest'
          AND c.project_id = NEW.project_id AND c.change_id = NEW.change_id
          AND json_extract(c.payload_json, '$.task_id') = json_extract(NEW.payload_json, '$.task_id')
          AND json_extract(c.payload_json, '$.work_item_ref.id') = json_extract(NEW.payload_json, '$.work_item_ref.id')
          AND json_extract(c.payload_json, '$.executor_ref.id') = json_extract(NEW.payload_json, '$.executor_ref.id')
          AND ${fieldsMatch("c.payload_json", "", "NEW.payload_json", "", ["input_digest.algorithm", "input_digest.value", "definition_ref.id", "definition_ref.domain_version", "contract_ref.id", "contract_ref.domain_version", "plan_ref.id", "plan_ref.domain_version"])}
          AND json_extract(c.payload_json, '$.source_snapshot_ref.id') = json_extract(NEW.payload_json, '$.source_snapshot_ref.id')
          AND json_extract(c.payload_json, '$.workspace_snapshot_ref.id') = json_extract(NEW.payload_json, '$.workspace_before_ref.id')
          AND ((json_extract(NEW.payload_json, '$.run_kind') = 'human' AND json_extract(c.payload_json, '$.boundary') IN ('manual_scoped','manual_independent_read_only')) OR
            (json_extract(NEW.payload_json, '$.run_kind') = 'agent' AND json_extract(c.payload_json, '$.boundary') IN ('agent_scoped','agent_independent_read_only')
              AND ${pinsMatch("c.payload_json", "NEW.payload_json")})))) OR
      (NEW.object_type = 'run_observation' AND NOT EXISTS (
        SELECT 1 FROM run_objects r JOIN run_records p ON p.id = json_extract(r.payload_json, '$.record_ref.id') AND p.object_type = 'run_record'
          WHERE r.id = json_extract(NEW.payload_json, '$.run_ref.id') AND r.project_id = NEW.project_id AND r.change_id = NEW.change_id
            AND json_extract(p.payload_json, '$.operation_key') = json_extract(NEW.payload_json, '$.report.operation_key')
            AND ((json_extract(p.payload_json, '$.run_kind') = 'human' AND json_extract(NEW.payload_json, '$.report.format') = 'cimiloop/manual-run/1.0.0' AND json_extract(NEW.payload_json, '$.raw_result_ref.resource_type') = 'manual_run') OR
              (json_extract(p.payload_json, '$.run_kind') = 'agent' AND json_extract(NEW.payload_json, '$.report.format') = 'cimiloop/agent-run/1.0.0' AND json_extract(NEW.payload_json, '$.raw_result_ref.resource_type') = 'agent_run'
                AND ${fieldsMatch("p.payload_json", "context_ref.", "NEW.payload_json", "report.context_ref.", ["object_type", "id"])}
                AND ${pinsMatch("p.payload_json", "NEW.payload_json", "report.")}))))
    BEGIN SELECT RAISE(ABORT, 'run context or observation binding mismatch'); END;`);
};
export const installSkillAssessmentGuard = (db: DatabaseSync): void => {
  db.exec(`CREATE TRIGGER guard_provider_assessment_kind_insert BEFORE INSERT ON provider_assessment_records
    WHEN (NEW.object_type = 'evidence' AND (
      (json_extract(NEW.payload_json, '$.purpose') = 'provider_probe' AND
       (SELECT json_extract(payload_json, '$.provider_kind') FROM immutable_records WHERE id = NEW.descriptor_id) = 'runtime') OR
      (json_extract(NEW.payload_json, '$.purpose') = 'skill_probe' AND
       (SELECT json_extract(payload_json, '$.provider_kind') FROM immutable_records WHERE id = NEW.descriptor_id) = 'skill')) IS NOT 1) OR
      (NEW.object_type = 'evaluation' AND (
      (json_extract(NEW.payload_json, '$.rule_version') = 'provider-assessment/1.0.0' AND
       (SELECT json_extract(payload_json, '$.provider_kind') FROM immutable_records WHERE id = NEW.descriptor_id) = 'runtime') OR
      (json_extract(NEW.payload_json, '$.rule_version') = 'skill-provider-assessment/1.0.0' AND
       (SELECT json_extract(payload_json, '$.provider_kind') FROM immutable_records WHERE id = NEW.descriptor_id) = 'skill')) IS NOT 1)
    BEGIN SELECT RAISE(ABORT, 'provider assessment kind mismatch'); END;`);
};
export const installProviderAssessmentSchema = (db: DatabaseSync): void => {
  db.exec(`CREATE TABLE provider_assessment_records (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), descriptor_id TEXT NOT NULL REFERENCES immutable_records(id),
    producer_actor_id TEXT NOT NULL REFERENCES actors(id), object_type TEXT NOT NULL CHECK(object_type IN ('evidence','evaluation')), payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX idx_provider_assessment_descriptor_type ON provider_assessment_records(descriptor_id, object_type);
  CREATE TRIGGER guard_provider_assessment_records_insert BEFORE INSERT ON provider_assessment_records
    WHEN json_extract(NEW.payload_json, '$.schema_version') IS NOT '2.0.0' OR
      json_extract(NEW.payload_json, '$.descriptor_ref.id') IS NOT NEW.descriptor_id OR
      json_extract(NEW.payload_json, '$.project_id') IS NOT NEW.project_id
    BEGIN SELECT RAISE(ABORT, 'provider assessment scope mismatch'); END;
  CREATE TRIGGER immutable_provider_assessment_records_update BEFORE UPDATE ON provider_assessment_records BEGIN SELECT RAISE(ABORT, 'immutable record'); END;
  CREATE TRIGGER immutable_provider_assessment_records_delete BEFORE DELETE ON provider_assessment_records BEGIN SELECT RAISE(ABORT, 'immutable record'); END;`);
};
export const installRuntimeSchema = (db: DatabaseSync): void => {
  db.exec(`CREATE TABLE run_objects (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), change_id TEXT NOT NULL REFERENCES changes(id), revision INTEGER NOT NULL, payload_json TEXT NOT NULL) STRICT;
    CREATE INDEX idx_runs_change ON run_objects(change_id);
    CREATE TABLE run_records (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), change_id TEXT NOT NULL REFERENCES changes(id), producer_actor_id TEXT NOT NULL REFERENCES actors(id), object_type TEXT NOT NULL, payload_json TEXT NOT NULL) STRICT;
    CREATE INDEX idx_run_records_change_type ON run_records(change_id, object_type);
    CREATE UNIQUE INDEX idx_run_record_attempt ON run_records(json_extract(payload_json, '$.task_id'), json_extract(payload_json, '$.attempt_no')) WHERE object_type = 'run_record';
    CREATE UNIQUE INDEX idx_run_operation_key ON run_records(json_extract(payload_json, '$.operation_key')) WHERE object_type = 'run_record';
    CREATE TRIGGER guard_run_objects_insert BEFORE INSERT ON run_objects WHEN json_extract(NEW.payload_json, '$.schema_version') IS NOT '2.0.0' BEGIN SELECT RAISE(ABORT, 'protocol 2 required'); END;
    CREATE TRIGGER guard_run_objects_update BEFORE UPDATE ON run_objects WHEN json_extract(NEW.payload_json, '$.schema_version') IS NOT '2.0.0' BEGIN SELECT RAISE(ABORT, 'protocol 2 required'); END;
    CREATE TRIGGER guard_run_records_insert BEFORE INSERT ON run_records WHEN json_extract(NEW.payload_json, '$.schema_version') IS NOT '2.0.0' BEGIN SELECT RAISE(ABORT, 'protocol 2 required'); END;
    CREATE TRIGGER immutable_run_records_update BEFORE UPDATE ON run_records BEGIN SELECT RAISE(ABORT, 'immutable record'); END;
    CREATE TRIGGER immutable_run_records_delete BEFORE DELETE ON run_records BEGIN SELECT RAISE(ABORT, 'immutable record'); END;`);
};
const initializeDatabase = (db: DatabaseSync, format: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): void => {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(m0Schema.replace(/CREATE TABLE IF NOT EXISTS outbox_messages \([\s\S]*?\) STRICT;/, outboxSchema)
      .replace("role_id TEXT NOT NULL REFERENCES roles(id)", "role_id TEXT REFERENCES roles(id)"));
    db.exec(additionalSchema);
    installWriteGuards(db);
    if (format >= 3) installPlanningSchema(db);
    if (format >= 4) installIntentSchema(db);
    if (format >= 5) installExecutionSchema(db);
    if (format >= 6) installVerificationSchema(db);
    if (format >= 7) installRuntimeSchema(db);
    if (format >= 8) installProviderAssessmentSchema(db);
    if (format >= 9) installSkillAssessmentGuard(db);
    if (format >= 10) installAgentRunGuard(db);
    db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(format, new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
};

export const installIntentSchema = (db: DatabaseSync): void => {
  db.exec(`CREATE TABLE intent_records (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), change_id TEXT NOT NULL REFERENCES changes(id),
    object_type TEXT NOT NULL CHECK(object_type IN ('contract_proposal','plan_proposal','contract_version','plan_version','risk_assessment','decision_request','decision','lifecycle_transition_record')),
    producer_actor_id TEXT NOT NULL REFERENCES actors(id), payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX idx_intent_change_type ON intent_records(change_id, object_type);
  CREATE UNIQUE INDEX idx_intent_decision_request ON intent_records(json_extract(payload_json, '$.request_id')) WHERE object_type = 'decision';
  CREATE UNIQUE INDEX idx_intent_proposal_revision ON intent_records(object_type, json_extract(payload_json, '$.proposal_id'), json_extract(payload_json, '$.proposal_revision')) WHERE object_type IN ('contract_proposal','plan_proposal');
  CREATE UNIQUE INDEX idx_intent_version ON intent_records(change_id, object_type, json_extract(payload_json, '$.version')) WHERE object_type IN ('contract_version','plan_version');
  CREATE TRIGGER guard_intent_records_insert BEFORE INSERT ON intent_records WHEN json_extract(NEW.payload_json, '$.schema_version') IS NOT '2.0.0'
    BEGIN SELECT RAISE(ABORT, 'database format 4 requires protocol 2 writes'); END;
  CREATE TRIGGER immutable_intent_records_update BEFORE UPDATE ON intent_records BEGIN SELECT RAISE(ABORT, 'immutable record'); END;
  CREATE TRIGGER immutable_intent_records_delete BEFORE DELETE ON intent_records BEGIN SELECT RAISE(ABORT, 'immutable record'); END;`);
};
export const installExecutionSchema = (db: DatabaseSync): void => {
  db.exec(`CREATE TABLE execution_objects (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
    object_type TEXT NOT NULL CHECK(object_type IN ('task','work_item','standing_authorization')),
    revision INTEGER NOT NULL CHECK(revision > 0), payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX idx_execution_objects_type ON execution_objects(project_id, object_type);
  CREATE TABLE execution_records (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), producer_actor_id TEXT NOT NULL REFERENCES actors(id),
    object_type TEXT NOT NULL CHECK(object_type IN ('task_definition','standing_authorization_version','authorization_revocation_record','work_item_authorization_record')),
    payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX idx_execution_records_type ON execution_records(project_id, object_type);
  CREATE UNIQUE INDEX idx_task_definition_version ON execution_records(json_extract(payload_json, '$.task_id'), json_extract(payload_json, '$.version')) WHERE object_type = 'task_definition';
  CREATE UNIQUE INDEX idx_authorization_version ON execution_records(json_extract(payload_json, '$.authorization_id'), json_extract(payload_json, '$.version')) WHERE object_type = 'standing_authorization_version';
  CREATE UNIQUE INDEX idx_work_item_authorization ON execution_records(json_extract(payload_json, '$.work_item_id')) WHERE object_type = 'work_item_authorization_record';`);
  for (const table of ["execution_objects", "execution_records"]) for (const action of ["INSERT", "UPDATE"]) db.exec(`CREATE TRIGGER guard_${table}_${action.toLowerCase()}
    BEFORE ${action} ON ${table} WHEN json_extract(NEW.payload_json, '$.schema_version') IS NOT '2.0.0' BEGIN SELECT RAISE(ABORT, 'database format 5 requires protocol 2 writes'); END;`);
  for (const action of ["UPDATE", "DELETE"]) db.exec(`CREATE TRIGGER immutable_execution_records_${action.toLowerCase()} BEFORE ${action} ON execution_records BEGIN SELECT RAISE(ABORT, 'immutable record'); END;`);
  db.exec("CREATE TRIGGER immutable_execution_objects_delete BEFORE DELETE ON execution_objects BEGIN SELECT RAISE(ABORT, 'object history cannot be deleted'); END;");
};

export const installVerificationSchema = (db: DatabaseSync): void => {
  db.exec(`CREATE TABLE verification_records (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), change_id TEXT NOT NULL REFERENCES changes(id), producer_actor_id TEXT NOT NULL REFERENCES actors(id),
    object_type TEXT NOT NULL CHECK(object_type IN ('source_snapshot','evidence','policy_snapshot','requirement_set_record','evaluation_context','evaluation','task_satisfaction_record','integration_readiness_record')), payload_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX idx_verification_change_type ON verification_records(change_id, object_type);
  CREATE UNIQUE INDEX idx_task_satisfaction_revision ON verification_records(json_extract(payload_json, '$.task_id'), json_extract(payload_json, '$.task_revision')) WHERE object_type = 'task_satisfaction_record';
  CREATE UNIQUE INDEX idx_integration_readiness_revision ON verification_records(change_id, json_extract(payload_json, '$.change_revision')) WHERE object_type = 'integration_readiness_record';
  CREATE TRIGGER guard_verification_records_insert BEFORE INSERT ON verification_records WHEN json_extract(NEW.payload_json, '$.schema_version') IS NOT '2.0.0' BEGIN SELECT RAISE(ABORT, 'database format 6 requires protocol 2 writes'); END;
  CREATE TRIGGER immutable_verification_records_update BEFORE UPDATE ON verification_records BEGIN SELECT RAISE(ABORT, 'immutable record'); END;
  CREATE TRIGGER immutable_verification_records_delete BEFORE DELETE ON verification_records BEGIN SELECT RAISE(ABORT, 'immutable record'); END;`);
};

export const installPlanningSchema = (db: DatabaseSync): void => {
  db.exec(`CREATE TABLE project_settings_versions (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), version INTEGER NOT NULL CHECK(version > 0),
    payload_json TEXT NOT NULL, UNIQUE(project_id, version)
  ) STRICT;
  CREATE TABLE target_versions (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision > 0), status TEXT NOT NULL CHECK(status IN ('open','closed')),
    payload_json TEXT NOT NULL, UNIQUE(project_id, name)
  ) STRICT;`);
  for (const table of ["project_settings_versions", "target_versions"]) {
    for (const action of ["INSERT", "UPDATE"]) db.exec(`CREATE TRIGGER guard_${table}_${action.toLowerCase()}
      BEFORE ${action} ON ${table} WHEN json_extract(NEW.payload_json, '$.schema_version') IS NOT '2.0.0'
      BEGIN SELECT RAISE(ABORT, 'database format 3 requires protocol 2 writes'); END;`);
  }
  for (const action of ["UPDATE", "DELETE"]) db.exec(`CREATE TRIGGER immutable_project_settings_versions_${action.toLowerCase()}
    BEFORE ${action} ON project_settings_versions BEGIN SELECT RAISE(ABORT, 'immutable record'); END;`);
};
