import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { CimiLoopKernel, providerBindingIdentity } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import * as v2 from "../../packages/protocol/src/v2/index.js";
import { parseVersionedRecord } from "../../packages/protocol/src/versioned.js";
import { createFlowProject, flowSuccess, flowTime } from "../fixtures/flow-project.js";
import { createProviderProbe } from "../fixtures/provider-probe.js";
import { writeInstance } from "../../apps/cli/src/instance.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close();
  while (dirs.length) { const root = resolve(dirs.pop()!); if (!root.startsWith(`${resolve(tmpdir())}${sep}cimiloop-assessment-`)) throw new Error("Unexpected test cleanup"); rmSync(root, { recursive: true, force: true }); }
});
const fixture = (cli = false) => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-assessment-")); dirs.push(root);
  const f = createFlowProject(root, cli ? { databasePath: join(root, ".cimiloop", "project.db") } : {}); stores.push(f.store);
  const p = createProviderProbe(root, dirname(f.path)), kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, providerVerifier: p.port });
  const registered = flowSuccess(kernel.execute(f.projectCommand("RegisterProvider", p.registration)));
  if (registered.command_type !== "RegisterProvider") throw new Error("Registration expected");
  const descriptor = registered.data.descriptor, descriptor_ref = { object_type: "provider_descriptor" as const, id: descriptor.id }, descriptor_digest = contentDigest(descriptor);
  const recordPayload = () => ({ descriptor_ref, descriptor_digest, raw_result_ref: p.save() });
  const record = () => { const result = flowSuccess(kernel.execute(f.projectCommand("RecordProviderEvidence", recordPayload()))); if (result.command_type !== "RecordProviderEvidence") throw new Error("Evidence expected"); return result.data.evidence; };
  const assessPayload = (evidence: v2.ProviderEvidence, profile: v2.ProviderEvaluation["profile"] = "technical_contract") => ({ descriptor_ref, descriptor_digest, profile, evidence_refs: [{ object_type: "evidence", id: evidence.id }] });
  const assess = (evidence: v2.ProviderEvidence, profile: v2.ProviderEvaluation["profile"] = "technical_contract") => { const result = flowSuccess(kernel.execute(f.projectCommand("EvaluateProvider", assessPayload(evidence, profile)))); if (result.command_type !== "EvaluateProvider") throw new Error("Evaluation expected"); return result.data.evaluation; };
  const bindPayload = (evaluation: v2.ProviderEvaluation) => ({ descriptor_ref, descriptor_digest, evaluation_ref: { object_type: "evaluation", id: evaluation.id }, input_digest: evaluation.input_digest,
    binding_scope: "isolated_provider_probe", capability: descriptor.capabilities[0], effective_permissions: descriptor.required_permissions });
  return { ...f, ...p, kernel, descriptor, descriptor_ref, descriptor_digest, recordPayload, record, assessPayload, assess, bindPayload };
};

it("persists native Provider evidence/evaluation and exact Human probe approval, with atomic provenance, replay and closed Agent execution", () => {
  const f = fixture(), evidence = f.record(), evaluation = f.assess(evidence);
  expect(evaluation).toMatchObject({ purpose: "provider_assessment", outcome: "ALLOW", profile: "technical_contract", reasons: [] });
  const command = f.projectCommand("RegisterProviderBinding", f.bindPayload(evaluation)), events = f.store.listEvents().length, outbox = f.store.listOutbox().length;
  const result = flowSuccess(f.kernel.execute(command)); if (result.command_type !== "RegisterProviderBinding") throw new Error("Binding expected");
  expect(result.data.binding.approval).toMatchObject({ assignment_ref: { id: f.assignment.id }, input_digest: evaluation.input_digest, binding_scope: "isolated_provider_probe" });
  expect(f.store.listEvents()).toHaveLength(events + 1); expect(f.store.listOutbox()).toHaveLength(outbox + 1);
  expect(f.kernel.execute(command)).toEqual(result); expect(f.store.getProviderDescriptor(f.descriptor.id)).toEqual(f.descriptor);
  expect(f.store.getVerificationRecord("evidence", evidence.id)).toBeUndefined(); expect(f.store.getVerificationRecord("evaluation", evaluation.id)).toBeUndefined();
  expect(v2.parseObjectShowResult(f.kernel.getObject("evidence", evidence.id)).object).toEqual(evidence);
  expect(v2.parseObjectShowResult(f.kernel.getObject("evaluation", evaluation.id)).object).toEqual(evaluation);
  expect(parseVersionedRecord("evidence", evidence)).toEqual(evidence); expect(parseVersionedRecord("evaluation", evaluation)).toEqual(evaluation);
  const catalog = v2.compileValidator<v2.ProviderCatalogResult>(v2.ProviderCatalogResultSchema)(f.kernel.getProviderCatalog());
  expect(catalog.assessment_checks[0]).toMatchObject({ outcome: "ALLOW", profile: "technical_contract", blockers: [] });
  expect(catalog.binding_checks[0]).toMatchObject({ execution_enabled: false, blockers: expect.arrayContaining(["PROVIDER_BINDING_SCOPE_PROBE_ONLY"]) });
  const agent = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "agent", identity_source: "runtime_binding", display_name: "Probe binding metadata", provider_identity_ref: providerBindingIdentity(result.data.binding) })));
  expect(agent.command_type).toBe("RegisterActor");
  const db = new DatabaseSync(f.path); try { expect(() => db.prepare("UPDATE provider_assessment_records SET payload_json='{}' WHERE id=?").run(evidence.id)).toThrow("immutable record"); } finally { db.close(); }
});

it("requires missing controlled execution boundaries even when a report clears gaps and declares contract success", () => {
  const f = fixture(), evidence = f.record(), evaluation = f.assess(evidence, "controlled_execution"), project = f.store.getProject();
  expect(evaluation).toMatchObject({ outcome: "NEED_MORE_EVIDENCE", reasons: ["network_host_limits", "cost_accounting_and_cap", "disk_limit", "crash_recovery"] });
  expect(f.kernel.execute(f.projectCommand("RegisterProviderBinding", { ...f.bindPayload(evaluation), binding_scope: "task_execution" }))).toMatchObject({ code: "PROVIDER_NOT_EVALUATED" });
  expect(f.store.getProject()).toEqual(project); expect(f.store.listProviderBindings()).toEqual([]);
  const technical = f.assess(evidence);
  expect(f.kernel.execute(f.projectCommand("RegisterProviderBinding", { ...f.bindPayload(technical), binding_scope: "task_execution" }))).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
});

it("rechecks actual source and content bytes at evaluation/approval and rejects changed schemas, input, capabilities or permissions without writes", () => {
  const f = fixture(), evidence = f.record(), evaluation = f.assess(evidence), project = f.store.getProject(), events = f.store.listEvents();
  for (const payload of [
    { ...f.bindPayload(evaluation), input_digest: { algorithm: "sha256", value: "a".repeat(64) } },
    { ...f.bindPayload(evaluation), capability: { capability_id: "arbitrary.shell", version: "1.0.0" } },
    { ...f.bindPayload(evaluation), effective_permissions: { ...f.descriptor.required_permissions, actions: ["arbitrary_shell"] } }
  ]) expect(f.kernel.execute(f.projectCommand("RegisterProviderBinding", payload))).toHaveProperty("code");
  const original = readFileSync(f.binary); writeFileSync(f.binary, "changed executable");
  expect(f.kernel.execute(f.projectCommand("RegisterProviderBinding", f.bindPayload(evaluation)))).toMatchObject({ code: "PROVIDER_OUTPUT_INVALID" });
  writeFileSync(f.binary, original);
  const object = join(dirname(f.path), "objects", evidence.raw_result_ref.locator); writeFileSync(object, "tampered report");
  expect(f.kernel.execute(f.projectCommand("EvaluateProvider", f.assessPayload(evidence)))).toMatchObject({ code: "PROVIDER_OUTPUT_INVALID" });
  expect(f.store.getProject()).toEqual(project); expect(f.store.listEvents()).toEqual(events); expect(f.store.listProviderBindings()).toEqual([]);
});

it("derives DENY from raw boundary/session/file counterevidence rather than report success flags", () => {
  const f = fixture(); f.snapshot.boundaries[1]!.inside_writable = true;
  const denied = f.assess(f.record()); expect(denied).toMatchObject({ outcome: "DENY", reasons: ["boundary_read"] });
  f.snapshot.boundaries[1]!.inside_writable = false; f.snapshot.model_operations[1]!.session_id = f.snapshot.model_operations[0]!.session_id!;
  expect(f.assess(f.record())).toMatchObject({ outcome: "DENY", reasons: ["independent_review"] });
});

it("rejects Task-scope IDs, provenance/ALLOW injection, stale project revisions and unauthenticated replay", () => {
  const f = fixture(), payload = f.recordPayload(), command = f.projectCommand("RecordProviderEvidence", payload), result = flowSuccess(f.kernel.execute(command));
  const project = f.store.getProject(), events = f.store.listEvents();
  expect(f.kernel.execute({ ...f.projectCommand("RecordProviderEvidence", payload), expected_revision: project!.revision - 1 })).toMatchObject({ code: "REVISION_CONFLICT" });
  expect(f.kernel.execute(f.projectCommand("RecordProviderEvidence", { ...payload, producer_actor_id: v2.createInternalId() }))).toMatchObject({ code: "PROTOCOL_VALIDATION_FAILED" });
  expect(f.kernel.execute(f.projectCommand("EvaluateProvider", { descriptor_ref: f.descriptor_ref, descriptor_digest: f.descriptor_digest, profile: "technical_contract", evidence_refs: [{ object_type: "evidence", id: v2.createInternalId() }], outcome: "ALLOW" }))).toMatchObject({ code: "PROTOCOL_VALIDATION_FAILED" });
  expect(f.kernel.execute(f.projectCommand("EvaluateProvider", { descriptor_ref: f.descriptor_ref, descriptor_digest: f.descriptor_digest, profile: "technical_contract", evidence_refs: [{ object_type: "evidence", id: v2.createInternalId() }] }))).toMatchObject({ code: "EVIDENCE_MISSING" });
  expect(new CimiLoopKernel({ store: f.store }).execute(command)).toMatchObject({ code: "CALLER_REQUIRED" }); expect(f.kernel.execute(command)).toEqual(result);
  expect(f.store.getProject()).toEqual(project); expect(f.store.listEvents()).toEqual(events);
});

it("preserves unknown or unstarted model observations as missing evidence, without inventing successful or failed completion", () => {
  const f = fixture(); f.snapshot.model_operations[0]!.status = "Unknown";
  const evaluation = f.assess(f.record());
  expect(evaluation).toMatchObject({ outcome: "NEED_MORE_EVIDENCE", reasons: ["real_edit", "independent_review"] });
  expect(evaluation.assessments.filter(c => c.key === "real_edit" || c.key === "independent_review").every(c => c.result === "inconclusive")).toBe(true);
});

it("verifies pinned Schema bytes again and rejects unassigned Human approval without changing facts", () => {
  const f = fixture(), evidence = f.record(), evaluation = f.assess(evidence), project = f.store.getProject(), events = f.store.listEvents();
  const changedPort = { readProbe: f.port.readProbe.bind(f.port), readArtifact: f.port.readArtifact.bind(f.port), sourceDigest: f.port.sourceDigest.bind(f.port),
    schemaDigest: () => ({ algorithm: "sha256" as const, value: "b".repeat(64) }) };
  expect(new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, providerVerifier: changedPort })
    .execute(f.projectCommand("RegisterProviderBinding", f.bindPayload(evaluation)))).toMatchObject({ code: "PROVIDER_OUTPUT_INVALID" });
  expect(f.kernel.execute({ ...f.projectCommand("RegisterProviderBinding", f.bindPayload(evaluation)), acting_role: "quality_owner" })).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
  expect(f.store.getProject()).toEqual(project); expect(f.store.listEvents()).toEqual(events);
});

it("bounds imports to the explicitly selected root and rejects changed raw bytes before recording evidence", () => {
  const f = fixture(), project = f.store.getProject(), events = f.store.listEvents();
  const original = f.snapshot.evidence_refs[0]!.locator;
  f.snapshot.evidence_refs[0]!.locator = "../outside-probe-file";
  expect(() => f.save()).toThrow("escapes selected root");
  f.snapshot.evidence_refs[0]!.locator = original; writeFileSync(resolve(f.directory, original), "different version bytes");
  expect(() => f.save()).toThrow("digest mismatch");
  expect(f.store.getProject()).toEqual(project); expect(f.store.listEvents()).toEqual(events); expect(f.store.listProviderEvidence()).toEqual([]);
});

it.each(["RecordProviderEvidence", "EvaluateProvider", "RegisterProviderBinding"] as const)("rolls back every Provider fact, project, receipt and outbox after %s event failure", kind => {
  const f = fixture(), evidence = kind !== "RecordProviderEvidence" ? f.record() : undefined, evaluation = kind === "RegisterProviderBinding" ? f.assess(evidence!) : undefined;
  const payload = kind === "RecordProviderEvidence" ? f.recordPayload() : kind === "EvaluateProvider" ? f.assessPayload(evidence!) : f.bindPayload(evaluation!);
  const before = { project: f.store.getProject(), evidence: f.store.listProviderEvidence(), evaluations: f.store.listProviderEvaluations(), bindings: f.store.listProviderBindings(), events: f.store.listEvents(), outbox: f.store.listOutbox() };
  const ids = [v2.createInternalId(), before.events[0]!.event_id], kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, providerVerifier: f.port, id: () => ids.shift() ?? v2.createInternalId() });
  const command = f.projectCommand(kind, payload); expect(kernel.execute(command)).toMatchObject({ code: "STORE_FAILURE" });
  expect({ project: f.store.getProject(), evidence: f.store.listProviderEvidence(), evaluations: f.store.listProviderEvaluations(), bindings: f.store.listProviderBindings(), events: f.store.listEvents(), outbox: f.store.listOutbox() }).toEqual(before);
  expect(f.store.transaction(tx => tx.getCommandReceipt(command.command_id))).toBeUndefined();
});

it("uses real CLI import, native evaluation, probe-only approval, persisted inspection and exact replay", () => {
  const f = fixture(true); writeInstance(join(dirname(f.path), "instance.json"), { schema_version: "1.0.0", instance_id: f.project.instance_id, project_id: f.project.id, actor_id: f.actor.id, created_at: flowTime });
  f.save(); const input = join(f.directory, "input.json"); writeFileSync(input, JSON.stringify({ descriptor_ref: f.descriptor_ref, descriptor_digest: f.descriptor_digest }));
  const invoke = (...args: string[]) => spawnSync(process.execPath, ["--no-warnings", resolve("apps/cli/dist/bin.js"), "--json", "--project-dir", f.directory, ...args], { encoding: "utf8", windowsHide: true });
  const id = v2.createInternalId(), recorded = invoke("--command-id", id, "provider", "record-evidence", "--file", input, "--probe-file", f.snapshotFile);
  expect(recorded.status, recorded.stderr || recorded.stdout).toBe(0); const r = v2.parseCommandSuccess(JSON.parse(recorded.stdout)); if (r.command_type !== "RecordProviderEvidence") throw new Error("Evidence expected");
  expect(invoke("--command-id", id, "provider", "record-evidence", "--file", input, "--probe-file", f.snapshotFile).stdout).toBe(recorded.stdout);
  writeFileSync(input, JSON.stringify(f.assessPayload(r.data.evidence))); const evaluated = invoke("provider", "evaluate", "--file", input);
  expect(evaluated.status, evaluated.stdout).toBe(0); const e = v2.parseCommandSuccess(JSON.parse(evaluated.stdout)); if (e.command_type !== "EvaluateProvider") throw new Error("Evaluation expected");
  writeFileSync(input, JSON.stringify(f.bindPayload(e.data.evaluation))); const bound = invoke("provider", "bind", "--file", input);
  expect(bound.status, bound.stdout).toBe(0); const b = v2.parseCommandSuccess(JSON.parse(bound.stdout)); if (b.command_type !== "RegisterProviderBinding") throw new Error("Binding expected");
  expect(v2.parseObjectShowResult(JSON.parse(invoke("inspect", "evaluation", e.data.evaluation.id).stdout)).object).toEqual(e.data.evaluation);
  expect(JSON.parse(invoke("provider", "list").stdout)).toMatchObject({ assessment_checks: [{ profile: "technical_contract", outcome: "ALLOW" }], binding_checks: [{ execution_enabled: false }] });
}, 45_000);
