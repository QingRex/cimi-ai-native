import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { MigrationRunner, readDatabaseFormat, SqliteProjectStore } from "../src/index.js";
import { createVerificationProject } from "../../../tests/fixtures/verification-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";
import * as v2 from "../../protocol/src/v2/index.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const snapshot = (path: string) => { const db = new DatabaseSync(path, { readOnly: true }); try { return { schema: db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(), tables: Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(row => [String(row.name), db.prepare(`SELECT * FROM ${String(row.name)} ORDER BY rowid`).all()])) }; } finally { db.close(); } };
const fixture = (professional = false) => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-format6-")); dirs.push(directory); const f = createVerificationProject(directory, true, false, "requirement", professional), source = f.capture();
  f.finish(source); f.finish(source, 1);
  let gate = flowSuccess(f.kernel.execute(f.gateCommand())); if (gate.command_type !== "EvaluateIntegration") throw new Error("gate expected");
  if (professional) {
    f.grant("quality_owner", f.reviewer.id);
    const contract = f.store.getIntentRecord("contract_version", f.store.getChange(f.change.id)!.contract_ref!.id)!;
    const requested = flowSuccess(f.kernel.execute(f.changeCommand("RequestDecision", { action: "confirm_integration", proposal_ref: contract.proposal_ref, professional_subject_ref: { object_type: "evaluation", id: gate.data.evaluation.id } })));
    if (requested.command_type !== "RequestDecision") throw new Error("request expected");
    const raw: v2.RawProfessionalReview = { format: "cimiloop/manual-review/1.0.0", producer_actor_id: f.reviewer.id, observed_at: flowTime, request_input_digest: requested.data.request.input_digest,
      method: "独立人工核对固定集成输入", finding: { kind: "integration_review", result: "supports", observation: "已核对集成依据" } };
    const file = join(dirname(f.path), "professional.json"); writeFileSync(file, JSON.stringify(raw));
    flowSuccess(f.reviewerKernel.execute({ ...f.changeCommand("RecordDecision", { request_id: requested.data.request.id, input_digest: requested.data.request.input_digest, choice: "approve", reason: "专业核对通过", conditions: [], raw_review_ref: f.port.importRawResult(file, "manual_review") }), actor_id: f.reviewer.id, acting_role: "quality_owner" }));
    gate = flowSuccess(f.kernel.execute(f.gateCommand())); if (gate.command_type !== "EvaluateIntegration") throw new Error("gate expected");
  }
  if (gate.data.evaluation.purpose !== "safe_integration") throw new Error("gate expected"); flowSuccess(f.kernel.execute(f.mark(gate.data.evaluation)));
  f.store.close(); const db = new DatabaseSync(f.path); try { db.exec("BEGIN IMMEDIATE; DROP TABLE provider_assessment_records; DROP TABLE run_records; DROP TABLE run_objects; DELETE FROM schema_migrations;"); db.prepare("INSERT INTO schema_migrations VALUES (6, ?)").run(flowTime); db.exec("COMMIT"); } finally { db.close(); }
  return { ...f, runner: new MigrationRunner(f.path) };
};
describe("explicit format 6 to 7 migration", () => {
  it.each([false, true])("preserves native evidence, task satisfaction, integration and professional=%s history", async professional => {
    const f = fixture(professional), before = snapshot(f.path); expect(f.runner.check()).toMatchObject({ from_format: 6, to_format: 9, counts: { verification_records: expect.any(Number) } }); expect(snapshot(f.path)).toEqual(before);
    const report = await f.runner.apply({ actorId: f.actor.id, now: flowTime }); expect(snapshot(report.backup_path!)).toEqual(before);
    const after = snapshot(f.path); for (const name of ["projects", "actors", "changes", "assignments", "intent_records", "execution_objects", "execution_records", "verification_records", "command_receipts", "outbox_messages"]) expect(after.tables[name]).toEqual(before.tables[name]);
    expect(after.tables.run_objects).toEqual([]); expect(after.tables.run_records).toEqual([]); expect(readDatabaseFormat(f.path)).toBe(9);
    const store = new SqliteProjectStore(f.path); stores.push(store); expect(store.getChange(f.change.id)?.lifecycle_state).toBe("ReadyForDelivery"); expect(store.listRuns(f.change.id)).toEqual([]);
    expect(await f.runner.apply({ actorId: f.actor.id })).toMatchObject({ from_format: 9, to_format: 9, migration_required: false });
  }, 45_000);
  it.each(["backup_complete", "state_converted", "schema_installed", "before_commit"] as const)("rolls back every fact at %s", async stage => {
    const f = fixture(), before = snapshot(f.path); await expect(f.runner.apply({ actorId: f.actor.id, onStage: current => { if (current === stage) throw new Error("fault"); } })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" });
    expect(snapshot(f.path)).toEqual(before); expect(readDatabaseFormat(f.path)).toBe(6); expect(snapshot(join(dirname(f.path), "backups", readdirSync(join(dirname(f.path), "backups"))[0]!, "project.db"))).toEqual(before);
  }, 45_000);
  it("rejects schema-valid evidence tampering before creating a backup", async () => {
    const f = fixture(), db = new DatabaseSync(f.path); try {
      const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'verification_records'").all(); for (const t of triggers) db.exec(`DROP TRIGGER ${String(t.name)}`);
      const row = db.prepare("SELECT id, payload_json FROM verification_records WHERE object_type = 'evidence' LIMIT 1").get()!, value = JSON.parse(String(row.payload_json)); value.claims[0].observation = "伪造原观察";
      db.prepare("UPDATE verification_records SET payload_json = ? WHERE id = ?").run(JSON.stringify(value), String(row.id)); for (const t of triggers) db.exec(String(t.sql));
    } finally { db.close(); }
    const before = snapshot(f.path); expect(() => f.runner.check()).toThrow(expect.objectContaining({ code: "MIGRATION_UNSAFE" })); await expect(f.runner.apply({ actorId: f.actor.id })).rejects.toMatchObject({ code: "MIGRATION_UNSAFE" }); expect(snapshot(f.path)).toEqual(before); expect(existsSync(join(dirname(f.path), "backups"))).toBe(false);
  }, 45_000);
});
