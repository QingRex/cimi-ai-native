import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createInternalId } from "../../packages/protocol/dist/v2/index.js";
import { initializeFormat2Database, installWriteGuards } from "../../packages/store-sqlite/dist/database-format.js";
import { createM0Database } from "./m0-database.js";

// Historical format 2 fixture: replay the known earlier 1 -> 2 conversion over real
// frozen M0 facts. This builds test data; it is not a migration/downgrade product API.
export const createFormat2History = (sourceDirectory: string, targetPath: string) => {
  const f = createM0Database(sourceDirectory); f.store.close();
  const source = new DatabaseSync(f.databasePath, { readOnly: true }), target = new DatabaseSync(targetPath);
  const migrationId = createInternalId(), digest = "b".repeat(64), now = "2026-10-03T00:00:00.000Z";
  try {
    initializeFormat2Database(target);
    for (const trigger of target.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all()) target.exec(`DROP TRIGGER ${String(trigger.name)}`);
    const read = (table: string) => source.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
    const insert = (table: string, row: Record<string, unknown>) => {
      const columns = Object.keys(row);
      target.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...Object.values(row) as (string | number | null)[]);
    };
    const origins: Record<string, unknown>[] = [];
    for (const [table, kind] of [["projects", "project"], ["actors", "actor"], ["roles", "role"], ["assignments", "assignment"], ["changes", "change"]]) {
      for (const row of read(table!)) {
        const original = String(row.payload_json), value = JSON.parse(original) as Record<string, unknown>;
        let converted: Record<string, unknown> = { ...value, schema_version: "2.0.0" };
        if (kind === "change") converted = { ...converted, kind: "requirement", priority: 0 };
        else converted.updated_at = value.created_at;
        if (kind === "actor" || kind === "role") converted.project_id = f.project.id;
        if (kind === "assignment") {
          delete converted.scope_type; delete converted.scope_id;
          converted.role_key = "project_owner"; converted.scope = { kind: value.scope_type, id: value.scope_id }; converted.granted_by = f.actor.id;
        }
        insert(table!, { ...row, payload_json: JSON.stringify(converted) });
        origins.push({ object_type: kind, object_id: value.id, migration_id: migrationId, source_schema_version: "1.0.0",
          source_digest: createHash("sha256").update(original).digest("hex"), source_json: original });
      }
    }
    for (const table of ["transition_records", "command_receipts", "event_ledger", "project_counters"]) for (const row of read(table)) insert(table, row);
    for (const row of read("outbox_messages")) insert("outbox_messages", { ...row, effect_key: "legacy", kind: "legacy_event_delivery", target_ref_json: JSON.stringify({ object_type: "event", id: row.event_id }) });
    const manifest = { migration_id: migrationId, from_format: 1, to_format: 2, database: { digest } };
    insert("migration_runs", { id: migrationId, from_format: 1, to_format: 2, applied_at: now, actor_id: f.actor.id,
      backup_path: "historical-test-backup", backup_digest: digest, manifest_json: JSON.stringify(manifest) });
    for (const row of origins) insert("migration_origins", row);
    const sequence = Number(target.prepare("UPDATE project_counters SET event_sequence = event_sequence + 1 RETURNING event_sequence").get()!.event_sequence);
    const event = { schema_version: "2.0.0", event_id: createInternalId(), event_type: "ProjectMigrated", project_id: f.project.id,
      aggregate: { object_type: "project", id: f.project.id }, aggregate_revision: 1, event_sequence: sequence, occurred_at: now,
      actor_id: f.actor.id, acting_role: "project_owner", command_id: migrationId, correlation_id: migrationId,
      payload: { from_format: 1, to_format: 2, migration_id: migrationId, backup_digest: { algorithm: "sha256", value: digest } } };
    insert("event_ledger", { event_id: event.event_id, project_id: f.project.id, event_sequence: sequence, aggregate_type: "project",
      aggregate_id: f.project.id, aggregate_revision: 1, event_type: event.event_type, occurred_at: now, envelope_json: JSON.stringify(event) });
    installWriteGuards(target);
  } finally { source.close(); target.close(); }
  return f;
};
