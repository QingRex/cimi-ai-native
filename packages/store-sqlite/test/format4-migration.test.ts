import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createFlowProject, flowSuccess } from "../../../tests/fixtures/flow-project.js";
import { MigrationRunner, readDatabaseFormat, SqliteProjectStore } from "../src/index.js";

const directories: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }); });
const snapshot = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return { schema: db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(), tables: Object.fromEntries(tables.map(row => [String(row.name), db.prepare(`SELECT * FROM ${String(row.name)} ORDER BY rowid`).all()])) };
  } finally { db.close(); }
};
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-format3-")); directories.push(directory);
  const f = createFlowProject(directory); f.configure(); flowSuccess(f.kernel.execute(f.settingsCommand({ wip_limit: 5 })));
  const target = flowSuccess(f.kernel.execute(f.projectCommand("CreateTargetVersion", { name: "planned" }, "flow_owner")));
  if (target.command_type !== "CreateTargetVersion") throw new Error("target expected");
  const change = f.create();
  const planning = f.changeCommand("ChangePlanning", change, { priority: 8, target_version_id: target.data.target_version.id, reason: "真实规划" }, "flow_owner");
  const receipt = flowSuccess(f.kernel.execute(planning));
  flowSuccess(f.kernel.execute(f.projectCommand("CloseTargetVersion", { target_version_id: target.data.target_version.id, expected_target_revision: 1, reason: "关闭规划" }, "flow_owner")));
  f.store.close();
  // Reconstruct the known format 3 layout around real settings/planning facts. No business fact is rewritten.
  const db = new DatabaseSync(f.path);
  try { db.exec("BEGIN IMMEDIATE; DROP TABLE provider_assessment_records; DROP TABLE run_records; DROP TABLE run_objects; DROP TABLE verification_records; DROP TABLE execution_objects; DROP TABLE execution_records; DROP TABLE intent_records; DELETE FROM schema_migrations;"); db.prepare("INSERT INTO schema_migrations VALUES (3, ?)").run("2026-10-03T00:00:00.000Z"); db.exec("COMMIT"); }
  finally { db.close(); }
  return { ...f, planning, receipt, runner: new MigrationRunner(f.path) };
};

describe("explicit format 3 to 6 migration", () => {
  it("checks read-only, backs up and preserves settings, closed targets, planning, events and exact receipts", async () => {
    const f = fixture(), before = snapshot(f.path);
    expect(() => new SqliteProjectStore(f.path)).toThrow(expect.objectContaining({ code: "MIGRATION_REQUIRED" }));
    expect(f.runner.check()).toMatchObject({ from_format: 3, to_format: 8, migration_required: true });
    expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(f.directory, "backups"))).toBe(false);
    const report = await f.runner.apply({ actorId: f.actor.id }); expect(snapshot(report.backup_path!)).toEqual(before);
    const after = snapshot(f.path);
    for (const table of ["projects", "changes", "assignments", "project_settings_versions", "target_versions", "command_receipts", "outbox_messages"]) expect(after.tables[table]).toEqual(before.tables[table]);
    expect(after.tables.intent_records).toEqual([]); expect(after.tables.event_ledger!.slice(0, -1)).toEqual(before.tables.event_ledger);
    const store = new SqliteProjectStore(f.path); stores.push(store);
    expect(store.getSettingsVersion(store.getProject()!.settings_ref!.id)).toHaveProperty("version", 2); expect(store.listTargetVersions()[0]).toMatchObject({ status: "closed", revision: 2 });
    expect(store.getChange(f.receipt.aggregate.id)).toMatchObject({ priority: 8, lifecycle_state: "Draft" });
    expect(store.transaction(tx => tx.getCommandReceipt(f.planning.command_id))!.result).toEqual(f.receipt);
    expect(store.listEvents().at(-1)).toMatchObject({ event_type: "ProjectMigrated", payload: { from_format: 3, to_format: 8 } });
    expect(readDatabaseFormat(f.path)).toBe(8); expect(await f.runner.apply({ actorId: f.actor.id })).toMatchObject({ from_format: 8, to_format: 8, migration_required: false });
  }, 15_000); // Full historical validation and backup can exceed 5s alongside Git / CLI scenarios.

  it.each(["backup_complete", "state_converted", "schema_installed", "before_commit"] as const)("rolls back %s and retains the complete format 3 backup", async stage => {
    const f = fixture(), before = snapshot(f.path);
    await expect(f.runner.apply({ actorId: f.actor.id, onStage: value => { if (value === stage) throw new Error("fault"); } })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
    expect(snapshot(f.path)).toEqual(before); expect(readDatabaseFormat(f.path)).toBe(3);
    const backup = join(f.directory, "backups", readdirSync(join(f.directory, "backups"))[0]!, "project.db");
    expect(snapshot(backup)).toEqual(before); expect(existsSync(join(f.directory, ".migration.lock"))).toBe(false);
  });

  it("rejects a schema-valid target state that does not match its recorded planning history", async () => {
    const f = fixture(), db = new DatabaseSync(f.path);
    try { const row = db.prepare("SELECT id, payload_json FROM target_versions").get()!; const target = JSON.parse(String(row.payload_json)); db.prepare("UPDATE target_versions SET payload_json = ? WHERE id = ?").run(JSON.stringify({ ...target, name: "unrecorded rename" }), String(row.id)); }
    finally { db.close(); }
    const before = snapshot(f.path);
    expect(() => f.runner.check()).toThrow(expect.objectContaining({ code: "MIGRATION_UNSAFE" }));
    await expect(f.runner.apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
    expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(f.directory, "backups"))).toBe(false);
  });
});
