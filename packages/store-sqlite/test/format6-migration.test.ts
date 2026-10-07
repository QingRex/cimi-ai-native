import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createIntentProject } from "../../../tests/fixtures/intent-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import { MigrationRunner, readDatabaseFormat, SqliteProjectStore } from "../src/index.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const snapshot = (path: string) => { const db = new DatabaseSync(path, { readOnly: true }); try {
  return { schema: db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(), tables: Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(row => [String(row.name), db.prepare(`SELECT * FROM ${String(row.name)} ORDER BY rowid`).all()])) };
} finally { db.close(); } };
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-format5-")); dirs.push(directory); const f = createIntentProject(directory), change = f.create();
  f.prepareContract(change.id); f.preparePlan(change.id); flowSuccess(f.kernel.execute(f.changeCommand("InitializePlanTasks", f.store.getChange(change.id)!, { plan_ref: f.store.getChange(change.id)!.plan_ref }, "technical_owner")));
  flowSuccess(f.kernel.execute(f.changeCommand("StartChange", f.store.getChange(change.id)!, { plan_ref: f.store.getChange(change.id)!.plan_ref, opening_reason: "真实开工" })));
  f.grant("policy_owner"); const body = { scope: { kind: "change", id: change.id }, executor_actor_ids: [f.actor.id], allowed_actions: ["read_files"], allowed_resources: ["src/query.ts"], environment_ids: [],
    risk_conditions: { allowed_levels: ["ordinary"], allowed_purposes: ["implementation"] }, valid_from: flowTime, expires_at: "2026-10-10T00:00:00.000Z", limits: { max_attempts: 3, max_elapsed_ms: 60_000 } };
  const first = flowSuccess(f.kernel.execute({ ...f.context("policy_owner"), command_type: "PublishStandingAuthorization", target: { object_type: "project", id: f.project.id }, expected_revision: f.store.getProject()!.revision, payload: { base_version_ref: null, body } }));
  if (first.command_type !== "PublishStandingAuthorization") throw new Error("grant expected");
  const auth = first.data.authorization, second = flowSuccess(f.kernel.execute({ ...f.context("policy_owner"), command_type: "PublishStandingAuthorization", target: { object_type: "standing_authorization", id: auth.id }, expected_revision: auth.revision,
    payload: { base_version_ref: auth.current_version_ref, body: { ...body, expires_at: "2026-10-11T00:00:00.000Z" } } }));
  if (second.command_type !== "PublishStandingAuthorization") throw new Error("grant expected");
  const task = f.store.listExecutionObjects("task", change.id)[0]!, command = { ...f.context("technical_owner"), command_type: "CreateWorkItem", target: { object_type: "task", id: task.id }, expected_revision: task.revision,
    payload: { definition_ref: task.definition_ref, executor_ref: { object_type: "actor", id: f.actor.id }, allowed_actions: ["read_files"], allowed_resources: ["src/query.ts"], budget: body.limits, stop_conditions: ["边界变化即停止"], reason: "具体人工授权" } };
  const receipt = flowSuccess(f.kernel.execute(command)); if (receipt.command_type !== "CreateWorkItem") throw new Error("work expected");
  flowSuccess(f.kernel.execute({ ...f.context("technical_owner"), command_type: "RevokeWorkItem", target: { object_type: "work_item", id: receipt.data.work_item.id }, expected_revision: 1, payload: { reason: "保存真实撤销历史" } }));
  f.store.close(); const db = new DatabaseSync(f.path); try { db.exec("BEGIN IMMEDIATE; DROP TABLE provider_assessment_records; DROP TABLE run_records; DROP TABLE run_objects; DROP TABLE verification_records; DELETE FROM schema_migrations;"); db.prepare("INSERT INTO schema_migrations VALUES (5, ?)").run(flowTime); db.exec("COMMIT"); } finally { db.close(); }
  return { ...f, change, command, receipt, runner: new MigrationRunner(f.path) };
};

describe("explicit format 5 to 6 migration", () => {
  it("preserves native task, grant versions, revoked WorkItem and original receipts without inventing evidence", async () => {
    const f = fixture(), before = snapshot(f.path); expect(f.runner.check()).toMatchObject({ from_format: 5, to_format: 9, counts: { execution_objects: 4, execution_records: 5 } }); expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(f.directory, "backups"))).toBe(false);
    const report = await f.runner.apply({ actorId: f.actor.id }); expect(snapshot(report.backup_path!)).toEqual(before);
    const after = snapshot(f.path); for (const [table, values] of Object.entries(before.tables)) if (!["schema_migrations", "migration_runs", "event_ledger", "project_counters"].includes(table)) expect(after.tables[table]).toEqual(values);
    expect(after.tables.verification_records).toEqual([]); expect(after.tables.event_ledger!.slice(0, -1)).toEqual(before.tables.event_ledger); expect(readDatabaseFormat(f.path)).toBe(9);
    const store = new SqliteProjectStore(f.path); stores.push(store); expect(new CimiLoopKernel({ store, caller: f.caller }).execute(f.command)).toEqual(f.receipt);
    expect(await f.runner.apply({ actorId: f.actor.id })).toMatchObject({ from_format: 9, to_format: 9, migration_required: false });
  }, 25_000);
  it.each(["backup_complete", "state_converted", "schema_installed", "before_commit"] as const)("rolls back %s and keeps the exact format5 backup", async stage => {
    const f = fixture(), before = snapshot(f.path); await expect(f.runner.apply({ actorId: f.actor.id, onStage: value => { if (value === stage) throw new Error("fault"); } })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" }); expect(snapshot(f.path)).toEqual(before);
    expect(snapshot(join(f.directory, "backups", readdirSync(join(f.directory, "backups"))[0]!, "project.db"))).toEqual(before); expect(readDatabaseFormat(f.path)).toBe(5);
  }, 20_000);
  it.each(["task_tag", "definition", "work_item"] as const)("rejects schema-valid %s tampering before a backup", async kind => {
    const f = fixture(), db = new DatabaseSync(f.path); try {
      const table = kind === "definition" ? "execution_records" : "execution_objects", type = kind === "definition" ? "task_definition" : kind === "work_item" ? "work_item" : "task";
      const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?").all(table); for (const trigger of triggers) db.exec(`DROP TRIGGER ${String(trigger.name)}`);
      const row = db.prepare(`SELECT id, payload_json FROM ${table} WHERE object_type = ? LIMIT 1`).get(type)!, value = JSON.parse(String(row.payload_json));
      const changed = kind === "task_tag" ? { ...value, status: "Satisfied" } : kind === "definition" ? { ...value, body: { ...value.body, goal: "伪造定义" } } : { ...value, allowed_resources: ["src/other.ts"] };
      db.prepare(`UPDATE ${table} SET payload_json = ? WHERE id = ?`).run(JSON.stringify(changed), String(row.id)); for (const trigger of triggers) db.exec(String(trigger.sql));
    } finally { db.close(); }
    const before = snapshot(f.path); expect(() => f.runner.check()).toThrow(expect.objectContaining({ code: "MIGRATION_UNSAFE" })); await expect(f.runner.apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" }); expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(f.directory, "backups"))).toBe(false);
  }, 20_000);
});
