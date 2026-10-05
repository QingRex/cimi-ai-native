import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createFlowProject, flowSuccess } from "../../../tests/fixtures/flow-project.js";
import { MigrationRunner, readDatabaseFormat, SqliteProjectStore } from "../src/index.js";
import { createFormat2History } from "../../../tests/fixtures/format2-history.js";

const directories: string[] = [], resources: { close(): void }[] = [];
afterEach(() => { while (resources.length) resources.pop()!.close(); while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }); });
const snapshot = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try { const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return { schema: db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(),
      tables: Object.fromEntries(tables.map(row => [String(row.name), db.prepare(`SELECT * FROM ${String(row.name)} ORDER BY rowid`).all()])) };
  } finally { db.close(); }
};
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-format2-")); directories.push(directory);
  const f = createFlowProject(directory); f.grant(); const change = f.create();
  flowSuccess(f.kernel.execute(f.changeCommand("PauseChange", change, { reason: "格式2事实" }, "change_owner")));
  const command = f.projectCommand("RegisterActor", { actor_type: "human", identity_source: "local_operator", display_name: "Another" });
  const result = flowSuccess(f.kernel.execute(command));
  f.store.close();
  // Reconstruct the exact earlier format 2 layout around real V1-03A command facts.
  // No settings/target data exists yet; no current states, events or receipts are rewritten.
  const db = new DatabaseSync(f.path);
  try { db.exec("BEGIN IMMEDIATE; DROP TABLE provider_assessment_records; DROP TABLE run_records; DROP TABLE run_objects; DROP TABLE verification_records; DROP TABLE execution_objects; DROP TABLE execution_records; DROP TABLE intent_records; DROP TABLE project_settings_versions; DROP TABLE target_versions; DELETE FROM schema_migrations;");
    db.prepare("INSERT INTO schema_migrations VALUES (2, ?)").run("2026-10-03T00:00:00.000Z"); db.exec("COMMIT");
  } finally { db.close(); }
  return { ...f, command, result, runner: new MigrationRunner(f.path) };
};

describe("explicit format 2 to 5 migration", () => {
  it("upgrades an earlier M0-derived format2 history while preserving v1 receipts and migration origins", { timeout: 15_000 }, async () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-historical-format2-")); directories.push(directory);
    const path = join(directory, "project.db"), f = createFormat2History(join(directory, "m0-source"), path), runner = new MigrationRunner(path);
    const before = snapshot(path);
    expect(runner.check()).toMatchObject({ from_format: 2, to_format: 8, counts: { changes: 2, command_receipts: 6 } });
    const report = await runner.apply({ actorId: f.actor.id });
    expect(snapshot(report.backup_path!)).toEqual(before);
    const after = snapshot(path);
    expect(after.tables.migration_origins).toEqual(before.tables.migration_origins);
    expect(after.tables.command_receipts).toEqual(before.tables.command_receipts);
    const store = new SqliteProjectStore(path); resources.push(store);
    expect(store.listEvents().slice(-2).map(event => event.event_type === "ProjectMigrated" ? event.payload : undefined)).toMatchObject([{ from_format: 1, to_format: 2 }, { from_format: 2, to_format: 8 }]);
    expect(store.transaction(tx => tx.getCommandReceipt(f.commands[3]!.command_id))!.result).toEqual(f.results[3]);
  });

  it("checks without writes, backs up a consistent snapshot, retains all facts and initializes empty planning tables", async () => {
    const f = fixture(), before = snapshot(f.path);
    expect(() => new SqliteProjectStore(f.path)).toThrow(expect.objectContaining({ code: "MIGRATION_REQUIRED" }));
    expect(f.runner.check()).toMatchObject({ from_format: 2, to_format: 8, migration_required: true, counts: { actors: 2, changes: 1 } });
    expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(f.directory, "backups"))).toBe(false);
    const report = await f.runner.apply({ actorId: f.actor.id });
    expect(report).toMatchObject({ from_format: 2, to_format: 8, migration_required: false });
    expect(snapshot(report.backup_path!)).toEqual(before);
    expect(JSON.parse(readFileSync(join(report.backup_path!, "..", "manifest.json"), "utf8"))).toMatchObject({ from_format: 2, to_format: 8 });
    const after = snapshot(f.path);
    for (const table of ["projects", "actors", "assignments", "roles", "changes", "transition_records", "command_receipts", "outbox_messages", "immutable_records", "migration_origins"]) expect(after.tables[table]).toEqual(before.tables[table]);
    expect(after.tables.project_settings_versions).toEqual([]); expect(after.tables.target_versions).toEqual([]);
    expect(after.tables.event_ledger!.slice(0, -1)).toEqual(before.tables.event_ledger);
    const store = new SqliteProjectStore(f.path); resources.push(store);
    expect(store.listEvents().at(-1)).toMatchObject({ event_type: "ProjectMigrated", payload: { from_format: 2, to_format: 8 } });
    expect(store.getProject()!.revision).toBe(f.result.revision);
    expect(readDatabaseFormat(f.path)).toBe(8); expect(store.listTargetVersions()).toEqual([]);
    expect(store.transaction(tx => tx.getCommandReceipt(f.command.command_id))!.result).toEqual(f.result);
    expect(await f.runner.apply({ actorId: f.actor.id })).toMatchObject({ from_format: 8, to_format: 8, migration_required: false });
    expect(readdirSync(join(f.directory, "backups"))).toHaveLength(1);
  });

  it("rejects schema-valid current objects changed without matching historical facts", async () => {
    const f = fixture(), db = new DatabaseSync(f.path);
    try {
      const row = db.prepare("SELECT id, payload_json FROM changes").get()!;
      const change = JSON.parse(String(row.payload_json));
      const actor = (f.result.data as { actor: { id: string } }).actor;
      db.prepare("UPDATE changes SET payload_json = ? WHERE id = ?").run(JSON.stringify({ ...change, owner_actor_id: actor.id }), String(row.id));
    } finally { db.close(); }
    const before = snapshot(f.path);
    expect(() => f.runner.check()).toThrow(expect.objectContaining({ code: "MIGRATION_UNSAFE" }));
    await expect(f.runner.apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
    expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(f.directory, "backups"))).toBe(false);
  });

  it.each(["backup_complete", "state_converted", "schema_installed", "before_commit"] as const)("rolls back %s without losing the format2 backup", async stage => {
    const f = fixture(), before = snapshot(f.path);
    await expect(f.runner.apply({ actorId: f.actor.id, onStage: value => { if (value === stage) throw new Error("fault"); } })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
    expect(snapshot(f.path)).toEqual(before); expect(readDatabaseFormat(f.path)).toBe(2);
    const backup = join(f.directory, "backups", readdirSync(join(f.directory, "backups"))[0]!, "project.db");
    expect(snapshot(backup)).toEqual(before); expect(existsSync(join(f.directory, ".migration.lock"))).toBe(false);
  });

  it.each(["UPDATE project_counters SET event_sequence = 99", "DROP INDEX idx_changes_project",
    "UPDATE outbox_messages SET status = 'processing', lease_until = '2099-01-01T00:00:00.000Z'", "DELETE FROM outbox_messages", "UPDATE actors SET revision = 99"])("rejects an inconsistent or actively leased format2 source: %s", async sql => {
    const f = fixture(), db = new DatabaseSync(f.path); try { db.exec(sql); } finally { db.close(); }
    const before = snapshot(f.path);
    expect(() => f.runner.check()).toThrow(expect.objectContaining({ code: "MIGRATION_UNSAFE" }));
    await expect(f.runner.apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
    expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(f.directory, "backups"))).toBe(false);
  });
});
