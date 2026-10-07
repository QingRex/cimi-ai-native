import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { MigrationRunner, readDatabaseFormat, SqliteProjectStore } from "../src/index.js";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import { createSkillProbeFixture } from "../../../tests/fixtures/skill-probe.js";
import { flowBase, flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (dirs.length) { const root = resolve(dirs.pop()!); if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-format9-")) throw new Error("Unsafe migration cleanup"); rmSync(root, { recursive: true, force: true }); } });
const snapshot = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return { schema: db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(), tables: Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => [String(row.name), db.prepare(`SELECT * FROM ${String(row.name)} ORDER BY rowid`).all()])) }; }
  finally { db.close(); }
};
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-format9-")); dirs.push(root);
  const f = createSkillProbeFixture(root); stores.push(f.store);
  const command = { ...flowBase(), command_type: "CreateChange", project_id: f.project.id, actor_id: f.actor.id, acting_role: "project_owner", payload: { title: "Preserved native change", kind: "requirement" } }, result = flowSuccess(f.kernel.execute(command));
  const evidence = f.store.listProviderEvidence(), evaluations = f.store.listProviderEvaluations(), bindings = f.store.listProviderBindings(), candidates = f.store.listProviderDescriptors(); f.store.close(); stores.pop();
  const db = new DatabaseSync(f.path);
  try { db.exec("BEGIN IMMEDIATE; DROP TRIGGER guard_provider_assessment_kind_insert; DELETE FROM schema_migrations;"); db.prepare("INSERT INTO schema_migrations VALUES (8, ?)").run(flowTime); db.exec("COMMIT"); } finally { db.close(); }
  return { ...f, evidence, evaluations, bindings, candidates, command, result, runner: new MigrationRunner(f.path) };
};

it("explicitly migrates frozen format 8 Runtime qualification and Skill candidates without changing existing facts", async () => {
  const f = fixture(), before = snapshot(f.path);
  expect(() => new SqliteProjectStore(f.path)).toThrow(expect.objectContaining({ code: "MIGRATION_REQUIRED" }));
  expect(f.runner.check()).toMatchObject({ from_format: 8, to_format: 9, counts: { provider_assessment_records: 2 } }); expect(snapshot(f.path)).toEqual(before);
  const report = await f.runner.apply({ actorId: f.actor.id, now: flowTime }); expect(snapshot(report.backup_path!)).toEqual(before);
  expect(createHash("sha256").update(readFileSync(report.backup_path!)).digest("hex")).toBe(report.backup_digest!.value);
  const manifest = JSON.parse(readFileSync(join(dirname(report.backup_path!), "manifest.json"), "utf8"));
  expect(manifest.files.length).toBeGreaterThan(0);
  for (const file of manifest.files) expect(createHash("sha256").update(readFileSync(join(dirname(report.backup_path!), "data", file.path))).digest("hex")).toBe(file.digest);
  const after = snapshot(f.path);
  for (const name of Object.keys(before.tables).filter(name => !["schema_migrations", "migration_runs", "event_ledger", "project_counters"].includes(name))) expect(after.tables[name], name).toEqual(before.tables[name]);
  expect(after.tables.project_counters).toEqual(before.tables.project_counters!.map(row => ({ ...row, event_sequence: Number(row.event_sequence) + 1 })));
  expect(after.tables.event_ledger!.slice(0, before.tables.event_ledger!.length)).toEqual(before.tables.event_ledger); expect(readDatabaseFormat(f.path)).toBe(9);
  const store = new SqliteProjectStore(f.path); stores.push(store);
  expect(store.listProviderEvidence()).toEqual(f.evidence); expect(store.listProviderEvaluations()).toEqual(f.evaluations); expect(store.listProviderBindings()).toEqual(f.bindings); expect(store.listProviderDescriptors()).toEqual(f.candidates);
  const kernel = new CimiLoopKernel({ store, caller: f.caller }), saved = snapshot(f.path); expect(kernel.execute(f.command)).toEqual(f.result); expect(snapshot(f.path)).toEqual(saved);
  expect(await f.runner.apply({ actorId: f.actor.id })).toMatchObject({ from_format: 9, to_format: 9, migration_required: false });
}, 45_000);

it.each(["backup_complete", "state_converted", "schema_installed", "before_commit"] as const)("rolls back format 8 facts and schema at %s", async stage => {
  const f = fixture(), before = snapshot(f.path); let reached = false;
  await expect(f.runner.apply({ actorId: f.actor.id, onStage: current => { if (current === stage) { reached = true; throw new Error("injected fault"); } } })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
  expect(reached).toBe(true); expect(snapshot(f.path)).toEqual(before); expect(readDatabaseFormat(f.path)).toBe(8);
  expect(snapshot(join(dirname(f.path), "backups", readdirSync(join(dirname(f.path), "backups"))[0]!, "project.db"))).toEqual(before);
}, 45_000);

it.each(["purpose", "descriptor_digest", "evidence_refs"] as const)("rejects frozen format 8 qualification tampering in %s before creating a backup", async field => {
  const f = fixture(), db = new DatabaseSync(f.path);
  try {
    const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='provider_assessment_records'").all(); for (const trigger of triggers) db.exec(`DROP TRIGGER ${String(trigger.name)}`);
    const row = db.prepare("SELECT id,payload_json FROM provider_assessment_records WHERE object_type=? LIMIT 1").get(field === "evidence_refs" ? "evaluation" : "evidence")!, value = JSON.parse(String(row.payload_json));
    if (field === "purpose") { value.purpose = "skill_probe"; value.origin = "local_skill_observation"; }
    else if (field === "descriptor_digest") value.descriptor_digest.value = "a".repeat(64);
    else value.evidence_refs[0].id = "00000000-0000-4000-8000-000000000000";
    db.prepare("UPDATE provider_assessment_records SET payload_json=? WHERE id=?").run(JSON.stringify(value), String(row.id)); for (const trigger of triggers) db.exec(String(trigger.sql));
  } finally { db.close(); }
  const before = snapshot(f.path); expect(() => f.runner.check()).toThrow(expect.objectContaining({ code: "MIGRATION_UNSAFE" }));
  await expect(f.runner.apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" }); expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(dirname(f.path), "backups"))).toBe(false);
}, 45_000);
