import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { MigrationRunner, readDatabaseFormat, SqliteProjectStore } from "../src/index.js";
import { createRunProject } from "../../../tests/fixtures/run-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (dirs.length) { const root = resolve(dirs.pop()!); if (!root.startsWith(`${resolve(tmpdir())}${sep}cimiloop-format8-`)) throw new Error("Unexpected test cleanup"); rmSync(root, { recursive: true, force: true }); } });
const snapshot = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return { schema: db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(), tables: Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => [String(r.name), db.prepare(`SELECT * FROM ${String(r.name)} ORDER BY rowid`).all()])) }; }
  finally { db.close(); }
};
const fixture = (active = false) => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-format8-")); dirs.push(root);
  const f = createRunProject(root), source = f.capture(), item = f.authorize(3, 100), prepared = f.prepareContext(item, source), reserved = f.reserve(item, prepared, 50);
  if (active) {
    flowSuccess(f.observe(reserved.run, "unknown", { usage: { cost_known: false } }));
    flowSuccess(f.kernel.execute(f.command("CancelRun", "run", reserved.run.id, { reason: "Pending reconciliation survives migration" })));
  } else {
    flowSuccess(f.observe(reserved.run, "succeeded", { usage: { cost_known: true, cost_micros: 20, currency: "USD" } }));
    const handoff = flowSuccess(f.kernel.execute(f.command("SaveHandoff", "work_item", item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id },
      run_ref: { object_type: "run", id: reserved.run.id }, next_actor_ref: { object_type: "actor", id: f.actor.id }, completed: ["Observed"], unresolved: [], next_action: "Resume", evidence_refs: [] })));
    if (handoff.command_type !== "SaveHandoff") throw new Error("Handoff expected");
    const next = f.prepareContext(item, source);
    flowSuccess(f.kernel.execute(f.command("CheckResumption", "work_item", item.id, { handoff_ref: { object_type: "handoff_record", id: handoff.data.handoff.id }, context_ref: { object_type: "context_manifest", id: next.context.id }, input_digest: next.context.input_digest })));
  }
  const task = f.task(), run = f.store.getRun(reserved.run.id); f.store.close();
  const db = new DatabaseSync(f.path); try { db.exec("BEGIN IMMEDIATE; DROP TRIGGER guard_agent_run_relations_insert; DROP TABLE provider_assessment_records; DELETE FROM schema_migrations;"); db.prepare("INSERT INTO schema_migrations VALUES (7, ?)").run(flowTime); db.exec("COMMIT"); } finally { db.close(); }
  return { ...f, task, run, runner: new MigrationRunner(f.path) };
};

it.each([false, true])("explicitly migrates format 7 with active=%s native run, usage and recovery history without changing old facts", async active => {
  const f = fixture(active), before = snapshot(f.path);
  expect(() => new SqliteProjectStore(f.path)).toThrow(expect.objectContaining({ code: "MIGRATION_REQUIRED" }));
  expect(f.runner.check()).toMatchObject({ from_format: 7, to_format: 10, counts: { run_objects: 1, run_records: expect.any(Number) } }); expect(snapshot(f.path)).toEqual(before);
  const report = await f.runner.apply({ actorId: f.actor.id, now: flowTime }); expect(snapshot(report.backup_path!)).toEqual(before);
  const after = snapshot(f.path);
  for (const name of ["projects", "actors", "assignments", "changes", "intent_records", "execution_objects", "execution_records", "verification_records", "run_objects", "run_records", "immutable_records", "command_receipts", "outbox_messages"]) expect(after.tables[name]).toEqual(before.tables[name]);
  expect(after.tables.provider_assessment_records).toEqual([]); expect(readDatabaseFormat(f.path)).toBe(10);
  const store = new SqliteProjectStore(f.path); stores.push(store); expect(store.getExecutionObject("task", f.task.id)).toEqual(f.task); expect(store.getRun(f.run!.id)).toEqual(f.run);
  expect(await f.runner.apply({ actorId: f.actor.id })).toMatchObject({ from_format: 10, to_format: 10, migration_required: false });
}, 45_000);

it.each(["backup_complete", "state_converted", "schema_installed", "before_commit"] as const)("rolls back format 7 history and schema at %s", async stage => {
  const f = fixture(), before = snapshot(f.path);
  await expect(f.runner.apply({ actorId: f.actor.id, onStage: value => { if (value === stage) throw new Error("fault"); } })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
  expect(snapshot(f.path)).toEqual(before); expect(readDatabaseFormat(f.path)).toBe(7);
  expect(snapshot(join(dirname(f.path), "backups", readdirSync(join(dirname(f.path), "backups"))[0]!, "project.db"))).toEqual(before);
}, 45_000);

it.each(["run_objects", "run_records"] as const)("rejects schema-valid tampering in %s before creating a backup", async table => {
  const f = fixture(), db = new DatabaseSync(f.path);
  try {
    const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name=?").all(table); for (const t of triggers) db.exec(`DROP TRIGGER ${String(t.name)}`);
    const row = db.prepare(`SELECT id,payload_json FROM ${table} ${table === "run_records" ? "WHERE object_type='run_observation'" : ""} LIMIT 1`).get()!;
    const value = JSON.parse(String(row.payload_json)); if (table === "run_objects") value.cost_charged_micros += 1; else value.report.observation = "tampered original observation";
    db.prepare(`UPDATE ${table} SET payload_json=? WHERE id=?`).run(JSON.stringify(value), String(row.id)); for (const t of triggers) db.exec(String(t.sql));
  } finally { db.close(); }
  const before = snapshot(f.path); expect(() => f.runner.check()).toThrow(expect.objectContaining({ code: "MIGRATION_UNSAFE" }));
  await expect(f.runner.apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" }); expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(dirname(f.path), "backups"))).toBe(false);
}, 45_000);
