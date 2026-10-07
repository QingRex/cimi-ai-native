import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createSkillProbeFixture } from "../fixtures/skill-probe.js";
import { flowSuccess } from "../fixtures/flow-project.js";
import * as v2 from "../../packages/protocol/src/v2/index.js";
import { parseVersionedRecord } from "../../packages/protocol/src/index.js";
import { validateOperationInput } from "../../packages/runtime-adapter/src/index.js";
import { LocalProviderVerifier } from "../../packages/local-app/src/index.js";

describe("native skill evidence, evaluation and fixed Runtime probe approval", () => {
  let root: string, f: ReturnType<typeof createSkillProbeFixture> | undefined;
  const fixture = (purpose: "clarification" | "review" = "clarification") => f = createSkillProbeFixture(root, purpose);
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "cimiloop-skill-assessment-")); });
  afterEach(() => { f?.store.close(); f = undefined; if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-skill-assessment-")) throw new Error("Unsafe skill assessment cleanup"); rmSync(root, { recursive: true, force: true }); });
  it.each(["clarification", "review"] as const)("persists %s raw observations and native approval without business state effects", purpose => {
    const f = fixture(purpose), change = f.create(), changes = f.store.listChanges(), evidence = f.record(), evaluation = f.assess([evidence]);
    expect(evidence).toMatchObject({ purpose: "skill_probe", origin: "local_skill_observation" });
    expect(evaluation).toMatchObject({ rule_version: "skill-provider-assessment/1.0.0", outcome: "ALLOW", profile: "technical_contract" });
    const command = f.projectCommand("RegisterProviderBinding", f.bindPayload(evaluation)), before = f.store.listEvents().length;
    const result = flowSuccess(f.kernel.execute(command)); if (result.command_type !== "RegisterProviderBinding") throw new Error("Binding expected");
    expect(result.data.binding.runtime_binding_ref).toEqual(f.snapshot.runtime_binding_ref); expect(f.store.listEvents()).toHaveLength(before + 1);
    expect(f.kernel.execute(command)).toEqual(result); expect(f.store.listChanges()).toEqual(changes); expect(f.store.listRuns(change.id)).toEqual([]);
    expect(f.store.getVerificationRecord("evidence", evidence.id)).toBeUndefined(); expect(parseVersionedRecord("evidence", evidence)).toEqual(evidence);
    expect(parseVersionedRecord("evaluation", evaluation)).toEqual(evaluation); expect(v2.parseObjectShowResult(f.kernel.getObject("evidence", evidence.id)).object).toEqual(evidence);
    const catalog = v2.compileValidator<v2.ProviderCatalogResult>(v2.ProviderCatalogResultSchema)(f.kernel.getProviderCatalog());
    expect(catalog.binding_checks.find(value => value.binding_ref.id === result.data.binding.id)).toMatchObject({ execution_enabled: false, blockers: expect.arrayContaining(["PROVIDER_BINDING_SCOPE_PROBE_ONLY"]) });
    expect(() => validateOperationInput(f.requests[0]!.input as unknown as Parameters<typeof validateOperationInput>[0])).not.toThrow();
  }, 30_000);
  it("keeps undispatched and unknown observations inconclusive even with no completion artifacts", () => {
    const f = fixture(), call = f.snapshot.calls[0]!; call.operation.status = "NotStarted"; call.operation.raw_refs = []; delete call.operation.session_id; delete call.operation.exit_code;
    const evidence = f.record(), evaluation = f.assess([evidence]); expect(evaluation).toMatchObject({ outcome: "NEED_MORE_EVIDENCE" });
    expect(evaluation.reasons).toEqual(expect.arrayContaining(["method_io", "skill_loaded", "real_invocation"]));
    expect(f.kernel.execute(f.projectCommand("RegisterProviderBinding", f.bindPayload(evaluation)))).toMatchObject({ code: "PROVIDER_NOT_EVALUATED" });
  });
  it.each([["native_contract_fixture", "unit-test/structured-method"], ["opencode", "cimiloop-conversation/cimiloop-public-tools"], ["opencode", "fixture/model"], ["opencode", "synthetic/method"]])("does not classify synthetic driver %s or model %s as real behavior", (driver, model) => {
    const f = fixture(); f.requests[0]!.driver.kind = driver!; f.requests[0]!.driver.model = model!; f.rewriteRequest(0);
    expect(f.assess([f.record()])).toMatchObject({ outcome: "NEED_MORE_EVIDENCE", reasons: ["real_invocation"] });
  });
  it.each(["decision", "task_status", "approved", "gate"])("records invalid method output %s as counterevidence", field => {
    const f = fixture(); f.rewriteEvents(0, f.eventRows(0, { ...f.output, [field]: true }));
    expect(f.assess([f.record()])).toMatchObject({ outcome: "DENY", reasons: ["method_io"] });
  });
  it("requires actual loaded content for the entire declared module closure", () => {
    const f = fixture(), rows = f.eventRows(0); rows.splice(1, 1); f.rewriteEvents(0, rows);
    expect(f.assess([f.record()])).toMatchObject({ outcome: "DENY", reasons: ["skill_loaded"] });
  });
  it("requires distinct review sessions and findings grounded in the fixed artifact inputs", () => {
    const f = fixture("review"); f.snapshot.calls[1]!.operation.session_id = "ses_unitmethod0";
    f.rewriteEvents(1, f.eventRows(1).map(row => ({ ...row, sessionID: "ses_unitmethod0" })));
    expect(f.assess([f.record()])).toMatchObject({ outcome: "DENY", reasons: ["independent_sessions"] });
    f.snapshot.calls[1]!.operation.session_id = "ses_unitmethod1"; f.rewriteEvents(1, f.eventRows(1));
    f.rewriteEvents(0, f.eventRows(0, { purpose: "review", findings: [{ axis: "spec", severity: "blocking", observation: "Ungrounded", basis_refs: [f.artifact("unrelated", "other.txt")] }], limitations: [] }));
    expect(f.assess([f.record()])).toMatchObject({ outcome: "DENY", reasons: ["method_io"] });
  }, 30_000);
  it("rejects changed request content and descriptor provenance without appending facts", () => {
    const f = fixture(), before = f.store.listEvents(); f.requests[0]!.input.prompt = "Substituted method"; f.rewriteRequest(0);
    expect(f.kernel.execute(f.projectCommand("RecordProviderEvidence", { descriptor_ref: f.descriptor_ref, descriptor_digest: f.descriptor_digest, raw_result_ref: f.save() }))).toMatchObject({ code: "PROVIDER_OUTPUT_INVALID" });
    expect(f.store.listEvents()).toEqual(before);
    const snapshot = { ...f.snapshot, descriptor_digest: { algorithm: "sha256", value: "a".repeat(64) } };
    const raw = f.port.content.storeContent(Buffer.from(JSON.stringify(snapshot)), "provider_probe_snapshot");
    expect(f.kernel.execute(f.projectCommand("RecordProviderEvidence", { descriptor_ref: f.descriptor_ref, descriptor_digest: f.descriptor_digest, raw_result_ref: raw }))).toMatchObject({ code: "PROVIDER_OUTPUT_INVALID" });
    expect(f.store.listEvents()).toEqual(before);
  });
  it("imports the complete fixed raw invocation bundle through the shared CLI host and rejects changed bytes", () => {
    const f = fixture("review"), file = join(root, "probe-export.json"); writeFileSync(file, JSON.stringify(f.snapshot));
    const data = join(root, "imported-content"); mkdirSync(data);
    const imported = new LocalProviderVerifier(root, data), ref = imported.importProbe(file, join(root, "objects"));
    expect(imported.readProbe(f.project, ref)).toEqual(f.snapshot);
    for (const call of f.snapshot.calls) for (const artifact of [call.input_ref, call.request_ref, ...call.operation.raw_refs]) expect(imported.readArtifact(f.project, artifact)).toEqual(f.port.readArtifact(f.project, artifact));
    if (f.input.purpose !== "review") throw new Error("Review expected");
    expect(imported.readArtifact(f.project, f.input.artifact_refs[0]!)).toEqual(f.port.readArtifact(f.project, f.input.artifact_refs[0]!));
    const artifact = f.snapshot.calls[0]!.request_ref; writeFileSync(join(root, "objects", artifact.locator), "changed");
    expect(() => imported.importProbe(file, join(root, "objects"))).toThrow();
  });
  it.each(["elapsed", "model"])("rejects invalid Runtime request %s controls even when the fixed input digest is recomputed", field => {
    const f = fixture(), before = f.store.listEvents(); if (field === "elapsed") f.requests[0]!.input.max_elapsed_ms = 0; else f.requests[0]!.driver.model = ""; f.rewriteRequest(0);
    expect(f.kernel.execute(f.projectCommand("RecordProviderEvidence", { descriptor_ref: f.descriptor_ref, descriptor_digest: f.descriptor_digest, raw_result_ref: f.save() }))).toMatchObject({ code: "PROVIDER_OUTPUT_INVALID" }); expect(f.store.listEvents()).toEqual(before);
  });
  it("rechecks both fixed Provider sources and raw Runtime qualification at skill approval", () => {
    const f = fixture(), evaluation = f.assess([f.record()]), before = f.store.listEvents(), source = readFileSync(f.binary);
    writeFileSync(f.binary, "changed Runtime"); expect(f.kernel.execute(f.projectCommand("RegisterProviderBinding", f.bindPayload(evaluation)))).toMatchObject({ code: "PROVIDER_OUTPUT_INVALID" });
    writeFileSync(f.binary, source);
    const runtimeEvidence = f.store.listProviderEvidence().find(value => value.descriptor_ref.id === f.runtime.id)!;
    writeFileSync(join(root, "objects", runtimeEvidence.raw_result_ref.locator), "changed Runtime probe");
    expect(f.kernel.execute(f.projectCommand("RegisterProviderBinding", f.bindPayload(evaluation)))).toMatchObject({ code: "PROVIDER_OUTPUT_INVALID" }); expect(f.store.listEvents()).toEqual(before);
  });
  it("requires an exact Runtime binding and refuses formal task scope without complete control evidence", () => {
    const f = fixture(), evidence = f.record(), technical = f.assess([evidence]), controlled = f.assess([evidence], "controlled_execution"), before = f.store.listEvents();
    expect(controlled).toMatchObject({ outcome: "NEED_MORE_EVIDENCE", reasons: ["harness_coverage", "permission_intersection", "cost_accounting_and_cap", "invocation_recovery"] });
    const { runtime_binding_ref: _ref, runtime_binding_digest: _digest, ...old } = f.bindPayload(technical);
    expect(f.kernel.execute(f.projectCommand("RegisterProviderBinding", old))).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(f.kernel.execute(f.projectCommand("RegisterProviderBinding", { ...f.bindPayload(technical), runtime_binding_digest: { algorithm: "sha256", value: "a".repeat(64) } }))).toMatchObject({ code: "PROVIDER_BINDING_STALE" });
    expect(f.kernel.execute(f.projectCommand("RegisterProviderBinding", { ...f.bindPayload(technical), binding_scope: "task_execution" }))).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(f.store.listEvents()).toEqual(before);
  }, 30_000);
  it("blocks raw SQL kind confusion, missing kind, and mutation of native observations", () => {
    const f = fixture(), evidence = f.record(), db = new DatabaseSync(f.path);
    try {
      expect(() => db.prepare("UPDATE provider_assessment_records SET payload_json='{}' WHERE id=?").run(evidence.id)).toThrow("immutable record");
      for (const purpose of ["provider_probe", undefined]) {
        const id = v2.createInternalId(), value = { ...evidence, id, purpose };
        expect(() => db.prepare("INSERT INTO provider_assessment_records VALUES (?, ?, ?, ?, 'evidence', ?)").run(id, f.project.id, f.descriptor.id, f.actor.id, JSON.stringify(value))).toThrow("provider assessment kind mismatch");
      }
    } finally { db.close(); }
  });
});
