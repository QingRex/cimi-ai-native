import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createIntentProject } from "../../../tests/fixtures/intent-project.js";
import { flowSuccess } from "../../../tests/fixtures/flow-project.js";
import { MigrationRunner, readDatabaseFormat, SqliteProjectStore } from "../src/index.js";

const directories: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }); });
const snapshot = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try { const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return { schema: db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(), tables: Object.fromEntries(tables.map(row => [String(row.name), db.prepare(`SELECT * FROM ${String(row.name)} ORDER BY rowid`).all()])) }; }
  finally { db.close(); }
};
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-format4-")); directories.push(directory);
  const f = createIntentProject(directory), a = f.create("真实已开工"), b = f.create("真实已确认");
  for (const change of [a, b]) { f.prepareContract(change.id); f.preparePlan(change.id); }
  const command = f.changeCommand("StartChange", f.store.getChange(a.id)!, { plan_ref: f.store.getChange(a.id)!.plan_ref, opening_reason: "真实开工" }), receipt = flowSuccess(f.kernel.execute(command));
  flowSuccess(f.kernel.execute(f.changeCommand("PauseChange", f.store.getChange(a.id)!, { reason: "保留暂停事实" }, "change_owner")));
  f.store.close();
  // Exact known format 4 around real V1-04 events, formal versions and receipts.
  const db = new DatabaseSync(f.path); try { db.exec("BEGIN IMMEDIATE; DROP TABLE provider_assessment_records; DROP TABLE run_records; DROP TABLE run_objects; DROP TABLE verification_records; DROP TABLE execution_objects; DROP TABLE execution_records; DELETE FROM schema_migrations;"); db.prepare("INSERT INTO schema_migrations VALUES (4, ?)").run("2026-10-03T00:00:00.000Z"); db.exec("COMMIT"); } finally { db.close(); }
  return { ...f, a, b, command, receipt, runner: new MigrationRunner(f.path) };
};

describe("explicit format 4 to 6 migration", () => {
  it("preserves actual confirmed and executing histories and exact receipts without inventing task grants", async () => {
    const f = fixture(), before = snapshot(f.path); expect(f.runner.check()).toMatchObject({ from_format: 4, to_format: 9, counts: { intent_records: 21 } });
    expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(f.directory, "backups"))).toBe(false);
    const report = await f.runner.apply({ actorId: f.actor.id }); expect(snapshot(report.backup_path!)).toEqual(before);
    const after = snapshot(f.path); for (const table of ["projects", "changes", "assignments", "intent_records", "command_receipts", "outbox_messages"]) expect(after.tables[table]).toEqual(before.tables[table]);
    expect(after.tables.execution_records).toEqual([]); expect(after.tables.execution_objects).toEqual([]); expect(after.tables.event_ledger!.slice(0, -1)).toEqual(before.tables.event_ledger);
    const store = new SqliteProjectStore(f.path); stores.push(store);
    expect(store.getChange(f.a.id)).toMatchObject({ lifecycle_state: "Executing", operating_status: "Paused" }); expect(store.getChange(f.b.id)).toHaveProperty("lifecycle_state", "IntentReady");
    expect(store.transaction(tx => tx.getCommandReceipt(f.command.command_id))!.result).toEqual(f.receipt); expect(readDatabaseFormat(f.path)).toBe(9);
    expect(await f.runner.apply({ actorId: f.actor.id })).toMatchObject({ from_format: 9, to_format: 9, migration_required: false });
  }, 20_000);

  it.each(["backup_complete", "state_converted", "schema_installed", "before_commit"] as const)("rolls back %s while retaining an exact format4 backup", async stage => {
    const f = fixture(), before = snapshot(f.path);
    await expect(f.runner.apply({ actorId: f.actor.id, onStage: value => { if (value === stage) throw new Error("fault"); } })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
    expect(snapshot(f.path)).toEqual(before); expect(readDatabaseFormat(f.path)).toBe(4);
    expect(snapshot(join(f.directory, "backups", readdirSync(join(f.directory, "backups"))[0]!, "project.db"))).toEqual(before);
  });

  it.each(["pointer", "formal_record"])("rejects schema-valid tampering of %s before creating a backup", async kind => {
    const f = fixture(), db = new DatabaseSync(f.path);
    try {
      if (kind === "pointer") { const row = db.prepare("SELECT payload_json FROM changes WHERE id = ?").get(f.a.id)!; const change = JSON.parse(String(row.payload_json)); db.prepare("UPDATE changes SET payload_json = ? WHERE id = ?").run(JSON.stringify({ ...change, plan_ref: { ...change.plan_ref, domain_version: 2 } }), f.a.id); }
      else { const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'intent_records'").all(); for (const trigger of triggers) db.exec(`DROP TRIGGER ${String(trigger.name)}`); const row = db.prepare("SELECT id, payload_json FROM intent_records WHERE object_type = 'plan_version' LIMIT 1").get()!; const record = JSON.parse(String(row.payload_json)); db.prepare("UPDATE intent_records SET payload_json = ? WHERE id = ?").run(JSON.stringify({ ...record, body: { ...record.body, approach: "未经确认的方案" } }), String(row.id)); for (const trigger of triggers) db.exec(String(trigger.sql)); }
    } finally { db.close(); }
    const before = snapshot(f.path); expect(() => f.runner.check()).toThrow(expect.objectContaining({ code: "MIGRATION_UNSAFE" }));
    await expect(f.runner.apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" }); expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(f.directory, "backups"))).toBe(false);
  });
});
