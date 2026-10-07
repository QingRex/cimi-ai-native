import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { MigrationRunner, readDatabaseFormat, SqliteProjectStore } from "../src/index.js";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import { createSkillProbeFixture } from "../../../tests/fixtures/skill-probe.js";
import { createRunProject } from "../../../tests/fixtures/run-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (dirs.length) { const root = resolve(dirs.pop()!); if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-format10-")) throw new Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); } });
const snapshot = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return { schema: db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(), tables: Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => [String(row.name), db.prepare(`SELECT * FROM ${String(row.name)} ORDER BY rowid`).all()])) }; }
  finally { db.close(); }
};
const fixture = (kind: "skill" | "human" = "skill") => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-format10-")); dirs.push(root);
  const f = kind === "skill" ? createSkillProbeFixture(root, "review") : createRunProject(root);
  if ("bindPayload" in f) {
    const evidence = f.record(), evaluation = f.assess([evidence]); flowSuccess(f.kernel.execute(f.projectCommand("RegisterProviderBinding", f.bindPayload(evaluation))));
  } else {
    const source = f.capture(), item = f.authorize(3, 100), prepared = f.prepareContext(item, source), reserved = f.reserve(item, prepared, 50);
    flowSuccess(f.observe(reserved.run, "unknown", { usage: { cost_known: false } }));
    flowSuccess(f.kernel.execute(f.command("CancelRun", "run", reserved.run.id, { reason: "Preserve unresolved original operation" })));
  }
  const command = f.projectCommand("RegisterActor", { actor_type: "human", identity_source: "local_operator", display_name: "Preserved receipt" }), result = flowSuccess(f.kernel.execute(command));
  f.store.close(); const db = new DatabaseSync(f.path);
  try { db.exec("BEGIN IMMEDIATE; DROP TRIGGER guard_agent_run_relations_insert; DELETE FROM schema_migrations;"); db.prepare("INSERT INTO schema_migrations VALUES (9, ?)").run(flowTime); db.exec("COMMIT"); } finally { db.close(); }
  return { path: f.path, caller: f.caller, actor: f.actor, command, result, runner: new MigrationRunner(f.path) };
};
it.each(["skill", "human"] as const)("migrates frozen format 9 %s facts and raw content without rewriting existing history", async kind => {
  const f = fixture(kind), before = snapshot(f.path); expect(() => new SqliteProjectStore(f.path)).toThrow(expect.objectContaining({ code: "MIGRATION_REQUIRED" }));
  expect(f.runner.check()).toMatchObject({ from_format: 9, to_format: 10, migration_required: true }); expect(snapshot(f.path)).toEqual(before);
  const report = await f.runner.apply({ actorId: f.actor.id, now: flowTime }); expect(snapshot(report.backup_path!)).toEqual(before);
  expect(createHash("sha256").update(readFileSync(report.backup_path!)).digest("hex")).toBe(report.backup_digest!.value);
  const manifest = JSON.parse(readFileSync(join(dirname(report.backup_path!), "manifest.json"), "utf8")); expect(manifest.files.length).toBeGreaterThan(0);
  for (const file of manifest.files) expect(createHash("sha256").update(readFileSync(join(dirname(report.backup_path!), "data", file.path))).digest("hex")).toBe(file.digest);
  const after = snapshot(f.path); for (const name of Object.keys(before.tables).filter(name => !["schema_migrations", "migration_runs", "event_ledger", "project_counters"].includes(name))) expect(after.tables[name], name).toEqual(before.tables[name]);
  expect(after.tables.event_ledger!.slice(0, before.tables.event_ledger!.length)).toEqual(before.tables.event_ledger); expect(readDatabaseFormat(f.path)).toBe(10);
  const store = new SqliteProjectStore(f.path); stores.push(store); const saved = snapshot(f.path);
  expect(new CimiLoopKernel({ store, caller: f.caller }).execute(f.command)).toEqual(f.result); expect(snapshot(f.path)).toEqual(saved);
  expect(await f.runner.apply({ actorId: f.actor.id })).toMatchObject({ from_format: 10, to_format: 10, migration_required: false });
}, 45_000);
it.each(["backup_complete", "state_converted", "schema_installed", "before_commit"] as const)("rolls back frozen format 9 Skill facts and schema at %s", async stage => {
  const f = fixture(), before = snapshot(f.path); let reached = false;
  await expect(f.runner.apply({ actorId: f.actor.id, onStage: current => { if (stage === current) { reached = true; throw new Error("injected fault"); } } })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
  expect(reached).toBe(true); expect(snapshot(f.path)).toEqual(before); expect(readDatabaseFormat(f.path)).toBe(9);
  expect(snapshot(join(dirname(f.path), "backups", readdirSync(join(dirname(f.path), "backups"))[0]!, "project.db"))).toEqual(before);
}, 45_000);
it.each(["rule_version", "runtime_binding", "agent_run"] as const)("refuses unsupported format 9 changes to %s before backup", async field => {
  const f = fixture(field === "agent_run" ? "human" : "skill"), db = new DatabaseSync(f.path);
  try {
    const table = field === "rule_version" ? "provider_assessment_records" : field === "runtime_binding" ? "immutable_records" : "run_records";
    const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name=?").all(table); for (const trigger of triggers) db.exec(`DROP TRIGGER ${String(trigger.name)}`);
    const row = db.prepare(`SELECT id,payload_json FROM ${table} WHERE object_type=? ORDER BY rowid DESC LIMIT 1`).get(field === "rule_version" ? "evaluation" : field === "runtime_binding" ? "provider_binding" : "run_record")!, value = JSON.parse(String(row.payload_json));
    if (field === "rule_version") value.rule_version = "provider-assessment/1.0.0";
    else if (field === "runtime_binding") delete value.runtime_binding_ref;
    else value.run_kind = "agent";
    db.prepare(`UPDATE ${table} SET payload_json=? WHERE id=?`).run(JSON.stringify(value), String(row.id)); for (const trigger of triggers) db.exec(String(trigger.sql));
  } finally { db.close(); }
  const before = snapshot(f.path); expect(() => f.runner.check()).toThrow(expect.objectContaining({ code: "MIGRATION_UNSAFE" }));
  await expect(f.runner.apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" }); expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(dirname(f.path), "backups"))).toBe(false);
}, 45_000);
