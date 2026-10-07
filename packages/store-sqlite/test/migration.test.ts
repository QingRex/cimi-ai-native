import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import { createInternalId } from "../../protocol/src/index.js";
import { MigrationError, MigrationRunner, readDatabaseFormat, SqliteProjectStore } from "../src/index.js";
import { SqliteProjectStore as M0Store } from "../src/v1.js";
import { createM0Database } from "../../../tests/fixtures/m0-database.js";

const directories: string[] = [];
const resources: { close(): void }[] = [];
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-migration-")); directories.push(directory);
  const result = createM0Database(directory); resources.push(result.store); return result;
};
const openDb = (path: string, readOnly = true) => { const db = new DatabaseSync(path, { readOnly, timeout: 0 }); resources.push(db); return db; };
const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const snapshot = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return { schema: db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(),
      tables: Object.fromEntries(tables.map(row => [String(row.name), db.prepare(`SELECT * FROM ${String(row.name)} ORDER BY rowid`).all()])) };
  } finally { db.close(); }
};
afterEach(() => {
  while (resources.length) { try { resources.pop()!.close(); } catch { /* closed fixture handle */ } }
  while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true });
});

describe("M0 to database format 4 migration", () => {
  it("checks without writes and refuses ordinary opening of the old format", () => {
    const f = fixture(), before = snapshot(f.databasePath), runner = new MigrationRunner(f.databasePath);
    expect(runner.check()).toMatchObject({ mode: "check", from_format: 1, to_format: 9, migration_required: true, counts: { changes: 2, command_receipts: 6 } });
    expect(() => new SqliteProjectStore(f.databasePath)).toThrow(expect.objectContaining({ code: "MIGRATION_REQUIRED" }));
    expect(snapshot(f.databasePath)).toEqual(before);
    expect(existsSync(join(f.directory, "backups"))).toBe(false);
  });
  it("backs up uncheckpointed WAL and preserves history, counters, states, identities and delivery status", async () => {
    const f = fixture(), before = snapshot(f.databasePath), runner = new MigrationRunner(f.databasePath);
    expect(existsSync(`${f.databasePath}-wal`)).toBe(true);
    const report = await runner.apply({ actorId: f.actor.id });
    expect(snapshot(report.backup_path!)).toEqual(before);
    expect(hash(report.backup_path!)).toBe(report.backup_digest!.value);
    const manifest = JSON.parse(readFileSync(join(report.backup_path!, "..", "manifest.json"), "utf8"));
    expect(manifest.files).toHaveLength(1);
    expect(readFileSync(join(report.backup_path!, "..", "data", "instance.json"), "utf8")).toBe(readFileSync(join(f.directory, "instance.json"), "utf8"));
    const store = new SqliteProjectStore(f.databasePath); resources.push(store);
    expect(store.getProject()).toMatchObject({ ...f.project, schema_version: "2.0.0", updated_at: f.project.created_at });
    expect(store.getProject()).not.toHaveProperty("settings_ref");
    expect(store.listChanges().map(change => [change.display_key, change.operating_status, change.revision])).toEqual([["CHG-0001", "Active", 1], ["CHG-0002", "Paused", 4]]);
    for (const change of store.listChanges()) {
      expect(change).toMatchObject({ schema_version: "2.0.0", kind: "requirement", priority: 0, owner_actor_id: f.actor.id, lifecycle_state: "Draft" });
      expect(change).not.toHaveProperty("requirement_owner_actor_id"); expect(change).not.toHaveProperty("contract_ref");
    }
    expect(store.getChange("CHG-0002")).toHaveProperty("pause_reason", "等待依赖交付");
    const after = snapshot(f.databasePath);
    for (const table of ["command_receipts", "transition_records"]) expect(after.tables[table]).toEqual(before.tables[table]);
    expect(after.tables.event_ledger!.slice(0, 6)).toEqual(before.tables.event_ledger);
    expect(store.listEvents().map(event => event.schema_version)).toEqual(["1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "1.0.0", "2.0.0"]);
    expect(store.listTransitions()).toHaveLength(3);
    expect(store.listOutbox().map(message => [message.status, message.attempt_count])).toEqual(before.tables.outbox_messages!.map(row => [row.status, row.attempt_count]));
    expect(store.listOutbox().every(message => message.effect_key === "legacy" && message.kind === "legacy_event_delivery" && message.target_ref.object_type === "event")).toBe(true);
    expect(after.tables.migration_origins).toHaveLength(6);
    expect(store.transaction(tx => tx.nextChangeDisplayKey(f.project.id))).toBe("CHG-0003");
    expect(() => new M0Store(f.databasePath)).toThrow("DATABASE_TOO_NEW");
    expect(runner.check()).toMatchObject({ from_format: 9, migration_required: false });
    expect(await runner.apply({ actorId: f.actor.id })).toMatchObject({ from_format: 9, migration_required: false });
    expect(readdirSync(join(f.directory, "backups"))).toHaveLength(1);
  });
  it("replays every v1 receipt before conversion, without new events or effects, and authorizes new legacy commands", async () => {
    const f = fixture(); await new MigrationRunner(f.databasePath).apply({ actorId: f.actor.id });
    const store = new SqliteProjectStore(f.databasePath); resources.push(store);
    const kernel = new CimiLoopKernel({ store, caller: { kind: "local_operator", project_id: f.project.id, actor_id: f.actor.id } }), before = snapshot(f.databasePath);
    for (const [index, command] of f.commands.entries()) {
      expect(kernel.execute({ ...command, correlation_id: createInternalId(), requested_at: new Date().toISOString() })).toEqual(f.results[index]);
    }
    expect(snapshot(f.databasePath)).toEqual(before);
    const original = f.commands[1]!;
    expect(kernel.execute({ ...original, payload: { title: "changed" } })).toMatchObject({ code: "COMMAND_ID_REUSED" });
    expect(kernel.execute({ ...original, command_id: createInternalId(), actor_id: createInternalId() })).toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" });
    expect(kernel.execute({ ...original, command_id: createInternalId(), payload: { title: "兼容入口新需求" } })).toMatchObject({ schema_version: "2.0.0", data: { change: { display_key: "CHG-0003", kind: "requirement" } } });
  });
  it.each(["backup_complete", "state_converted", "schema_installed", "before_commit"] as const)("rolls back an interruption at %s while retaining the usable M0 backup", async stage => {
    const f = fixture(), before = snapshot(f.databasePath);
    let reached = false;
    await expect(new MigrationRunner(f.databasePath).apply({ actorId: f.actor.id, onStage: current => { if (current === stage) { reached = true; throw new Error("interruption"); } } })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
    expect(reached).toBe(true);
    expect(snapshot(f.databasePath)).toEqual(before); expect(readDatabaseFormat(f.databasePath)).toBe(1);
    const backupDirectory = join(f.directory, "backups", readdirSync(join(f.directory, "backups"))[0]!);
    expect(snapshot(join(backupDirectory, "project.db"))).toEqual(before);
    const legacy = new M0Store(f.databasePath); resources.push(legacy); expect(legacy.listChanges()).toHaveLength(2);
    expect(existsSync(join(f.directory, ".migration.lock"))).toBe(false);
  });
  it("refuses a newer database without writing its bytes or creating a backup", async () => {
    const f = fixture(), db = openDb(f.databasePath, false); db.prepare("INSERT INTO schema_migrations VALUES (10, ?)").run(new Date().toISOString());
    const before = snapshot(f.databasePath), originalHash = hash(f.databasePath);
    expect(() => new SqliteProjectStore(f.databasePath)).toThrow(expect.objectContaining({ code: "DATABASE_TOO_NEW" }));
    expect(() => new MigrationRunner(f.databasePath).check()).toThrow(MigrationError);
    await expect(new MigrationRunner(f.databasePath).apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "DATABASE_TOO_NEW" });
    expect(snapshot(f.databasePath)).toEqual(before); expect(hash(f.databasePath)).toBe(originalHash); expect(existsSync(join(f.directory, "backups"))).toBe(false);
  });
  it.each(["state_converted", "schema_installed"])("recovers an actual process exit after %s and requires manual stale-lock handling", async stage => {
    const f = fixture(), before = snapshot(f.databasePath);
    const child = spawnSync(process.execPath, ["--no-warnings", resolve("tests/fixtures/migration-crash.mjs"), f.databasePath, f.actor.id, stage], { encoding: "utf8" });
    expect(child.status, child.stderr).toBe(86);
    expect(snapshot(f.databasePath)).toEqual(before); expect(readDatabaseFormat(f.databasePath)).toBe(1);
    expect(new MigrationRunner(f.databasePath).check()).toHaveProperty("migration_required", true);
    expect(JSON.parse(readFileSync(join(f.directory, ".migration.lock"), "utf8"))).toHaveProperty("database_path", f.databasePath);
    await expect(new MigrationRunner(f.databasePath).apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
  });
  it.each([
    "UPDATE changes SET payload_json = json_set(payload_json, '$.lifecycle_state', 'Executing')",
    "UPDATE changes SET payload_json = json_set(payload_json, '$.schema_version', '3.0.0')",
    "UPDATE command_receipts SET request_digest = 'invalid'",
    "UPDATE project_counters SET event_sequence = 100",
    "DROP INDEX idx_changes_project"
  ])("rejects an unsafe M0 source (%s) without guessing or mutation", async sql => {
    const f = fixture(), db = openDb(f.databasePath, false); db.exec(sql); const before = snapshot(f.databasePath);
    const runner = new MigrationRunner(f.databasePath);
    expect(() => runner.check()).toThrow(MigrationError);
    await expect(runner.apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
    expect(snapshot(f.databasePath)).toEqual(before); expect(existsSync(join(f.directory, "backups"))).toBe(false);
  });
  it("blocks concurrent writers during backup and refuses live leases, foreign operators and changing data files", async () => {
    const f = fixture(), db = openDb(f.databasePath, false), runner = new MigrationRunner(f.databasePath);
    db.exec("BEGIN IMMEDIATE");
    await expect(runner.apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" }); db.exec("ROLLBACK");
    await expect(runner.apply({ actorId: createInternalId() })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
    db.prepare("UPDATE outbox_messages SET lease_until = ? WHERE status = 'processing'").run("2099-01-01T00:00:00.000Z");
    await expect(runner.apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
    db.prepare("UPDATE outbox_messages SET lease_until = ? WHERE status = 'processing'").run("2026-09-20T00:01:00.000Z");
    const before = snapshot(f.databasePath);
    await expect(runner.apply({ actorId: f.actor.id, onStage: stage => {
      if (stage === "backup_complete") { expect(() => db.exec("BEGIN IMMEDIATE")).toThrow(); writeFileSync(join(f.directory, "instance.json"), "changed"); }
    } })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
    expect(snapshot(f.databasePath)).toEqual(before);
  });
});
