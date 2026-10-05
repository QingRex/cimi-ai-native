import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import * as v2 from "../../protocol/src/v2/index.js";
import { StoreConflictError } from "../../store/dist/index.js";
import { SqliteProjectStore } from "../src/index.js";

const time = "2026-10-03T00:00:00.000Z", directories: string[] = [], stores: SqliteProjectStore[] = [];
const base = () => ({ schema_version: v2.SCHEMA_VERSION, command_id: v2.createInternalId(), correlation_id: v2.createInternalId(), requested_at: time, source: { origin: "human_cli" as const, producer: "current-store-test" } });
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-current-store-")); directories.push(directory);
  const path = join(directory, "project.db"), store = new SqliteProjectStore(path); stores.push(store);
  const bootstrap = new CimiLoopKernel({ store, caller: { kind: "bootstrap" }, now: () => time });
  const result = bootstrap.execute({ ...base(), command_type: "InitializeProject", payload: { name: "Current Store", repository_kind: "directory", repository_path: directory, owner_name: "Current Owner" } });
  if (!("ok" in result) || !("project" in result.data) || !("actor" in result.data)) throw new Error(JSON.stringify(result));
  const initialized = result.data;
  const caller = { kind: "local_operator" as const, project_id: initialized.project.id, actor_id: initialized.actor.id };
  const kernel = new CimiLoopKernel({ store, caller, now: () => time });
  const context = () => ({ ...base(), actor_id: initialized.actor.id, project_id: initialized.project.id, acting_role: "project_owner" as const });
  return { directory, path, store, kernel, context, caller };
};
afterEach(() => { while (stores.length) stores.pop()!.close(); while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }); });

describe("format 4 typed Store and foundation Kernel", () => {
  it("commits v2 state, transitions, receipts and effects atomically; rolls back a fault and rejects stale CAS", () => {
    const f = fixture(), command = { ...f.context(), command_type: "CreateChange", payload: { title: "需求" } };
    const result = f.kernel.execute(command);
    if (!("ok" in result) || !("change" in result.data)) throw new Error(JSON.stringify(result));
    const change = f.store.getChange(result.data.change.id)!;
    expect(() => f.store.transaction(tx => {
      tx.updateChange({ ...change, operating_status: "Paused", pause_reason: "fault", revision: 2 }, 1);
      tx.nextChangeDisplayKey(change.project_id); throw new Error("fault");
    })).toThrow("fault");
    expect(f.store.getChange(change.id)).toEqual(change);
    const pause = { ...f.context(), acting_role: "change_owner", command_type: "PauseChange", target: { object_type: "change", id: change.id }, expected_revision: 1, payload: { reason: "等待确认" } };
    expect(f.kernel.execute(pause)).toMatchObject({ schema_version: "2.0.0", command_type: "PauseChange", revision: 2 });
    expect(f.kernel.execute({ ...pause, command_id: v2.createInternalId() })).toMatchObject({ code: "REVISION_CONFLICT", details: { current_revision: 2 } });
    expect(f.kernel.execute({ ...pause, command_id: v2.createInternalId(), expected_revision: 2 })).toMatchObject({ code: "CHANGE_ALREADY_PAUSED" });
    expect(() => f.store.transaction(tx => tx.updateChange({ ...change, revision: 2 }, 1))).toThrow(StoreConflictError);
    expect(() => f.store.transaction(tx => tx.updateChange({ ...change, revision: 99 }, 2))).toThrow(StoreConflictError);
    expect(f.store.listTransitions()).toHaveLength(1); expect(f.store.listEvents()).toHaveLength(3); expect(f.store.listOutbox()).toHaveLength(3);
    expect(f.kernel.execute(command)).toEqual(result);
    expect(() => f.store.transaction(tx => tx.insertChange(Object.assign({}, change, { id: v2.createInternalId(), display_key: "CHG-0009", extra: true })))).toThrow();
  });
  it("keeps read snapshots consistent while another connection commits a command", () => {
    const f = fixture(), second = new SqliteProjectStore(f.path); stores.push(second);
    const writer = new CimiLoopKernel({ store: second, caller: f.caller, now: () => time });
    const snapshot = f.store.readSnapshot(reader => {
      expect(reader.listChanges()).toHaveLength(0);
      expect(writer.execute({ ...f.context(), command_type: "CreateChange", payload: { title: "并发提交" } })).toHaveProperty("ok", true);
      return { changes: reader.listChanges(), events: reader.listEvents() };
    });
    expect(snapshot.as_of_event_sequence).toBe(1); expect(snapshot.value.changes).toHaveLength(0); expect(snapshot.value.events).toHaveLength(1);
    expect(f.store.listChanges()).toHaveLength(1); expect(f.store.asOfEventSequence()).toBe(2);
  });
  it("allows multiple effects per event, enforces their uniqueness and fences expired workers", () => {
    const f = fixture(), original = f.store.listOutbox()[0]!;
    f.store.transaction(tx => tx.enqueueOutbox({ ...original, id: v2.createInternalId(), effect_key: "second_receiver" }));
    expect(() => f.store.transaction(tx => tx.enqueueOutbox({ ...original, id: v2.createInternalId() }))).toThrow();
    expect(f.store.listOutbox()).toHaveLength(2);
    const first = f.store.claimOutbox(time, "2026-10-03T00:01:00.000Z")!;
    const second = f.store.claimOutbox("2026-10-03T00:02:00.000Z", "2026-10-03T00:03:00.000Z")!;
    expect(second).toMatchObject({ id: first.id, attempt_count: 2 });
    expect(() => f.store.markOutboxDelivered(first.id, "2026-10-03T00:02:01.000Z", first)).toThrow(StoreConflictError);
    expect(() => f.store.releaseOutbox(first.id, time, first)).toThrow(StoreConflictError);
    f.store.markOutboxDelivered(second.id, "2026-10-03T00:02:01.000Z", second);
    expect(f.store.listOutbox("delivered")).toHaveLength(1);
    expect(() => f.store.claimOutbox(time, time)).toThrow(StoreConflictError);
  });
  it("rejects spoofed actors and unsupported responsibility inputs without consuming display keys", () => {
    const f = fixture();
    expect(f.kernel.execute({ ...f.context(), actor_id: v2.createInternalId(), command_type: "CreateChange", payload: { title: "spoof" } })).toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" });
    expect(f.kernel.execute({ ...f.context(), source: { origin: "agent", producer: "unbound-agent" }, command_type: "CreateChange", payload: { title: "spoof human" } })).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    expect(f.kernel.execute({ ...f.context(), command_type: "CreateChange", payload: { title: "unknown", requirement_owner_actor_id: v2.createInternalId() } })).toMatchObject({ code: "ACTOR_NOT_FOUND" });
    expect(f.kernel.execute({ ...f.context(), command_type: "CreateChange", expected_input_digest: { algorithm: "sha256", value: "a".repeat(64) }, payload: { title: "unsupported condition" } })).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(f.kernel.execute({ ...f.context(), command_type: "CreateChange", payload: { title: "valid", kind: "bug" } })).toMatchObject({ data: { change: { display_key: "CHG-0001", kind: "bug" } } });
  });
  it("appends and reads typed immutable Provider metadata and v2 rejection receipts", () => {
    const f = fixture(), context = f.context(), digest = { algorithm: "sha256" as const, value: "a".repeat(64) };
    const descriptor: v2.ProviderDescriptor = { schema_version: "2.0.0", id: v2.createInternalId(), project_id: context.project_id,
      producer_actor_id: context.actor_id, created_at: time, provider_kind: "skill", name: "Fixture Skill", version: "1.0.0",
      source_ref: { provider: "local", resource_type: "skill", locator: "fixtures/skill", version: "1.0.0", digest },
      capabilities: [{ capability_id: "intent.clarify", version: "1.0.0" }], dependencies: [],
      required_permissions: { actions: [], resources: [], environment_ids: [], network_hosts: [] },
      input_schema_ref: { schema_id: "fixture.input", digest }, output_schema_ref: { schema_id: "fixture.output", digest }, trust_status: "candidate" };
    const binding: v2.ProviderBinding = { schema_version: "2.0.0", id: v2.createInternalId(), project_id: context.project_id,
      producer_actor_id: context.actor_id, created_at: time, descriptor_ref: { object_type: "provider_descriptor", id: descriptor.id }, descriptor_digest: digest,
      capability: descriptor.capabilities[0]!, resolved_dependencies: [], input_schema_ref: descriptor.input_schema_ref, output_schema_ref: descriptor.output_schema_ref,
      effective_permissions: descriptor.required_permissions, probe_evidence_refs: [{ object_type: "evidence", id: v2.createInternalId() }] };
    const rejection: v2.DomainError = { schema_version: "2.0.0", code: "ROLE_NOT_ASSIGNED", message: "fixture rejection", category: "forbidden", retryable: false, details: {}, correlation_id: context.correlation_id };
    f.store.transaction(tx => { tx.insertProviderDescriptor(descriptor); tx.insertProviderBinding(binding);
      tx.saveCommandReceipt({ command_id: context.command_id, request_digest: "a".repeat(64), result: rejection, created_at: time }); });
    f.store.transaction(tx => { expect(tx.getProviderDescriptor(descriptor.id)).toEqual(descriptor); expect(tx.getProviderBinding(binding.id)).toEqual(binding);
      expect(tx.getCommandReceipt(context.command_id)).toHaveProperty("result", rejection); });
    expect(() => f.store.transaction(tx => tx.saveCommandReceipt({ command_id: v2.createInternalId(), request_digest: "invalid", result: rejection, created_at: time }))).toThrow("digest");
    expect(() => f.store.transaction(tx => tx.insertProviderDescriptor(descriptor))).toThrow();
    const db = new DatabaseSync(f.path);
    try { expect(() => db.exec("DELETE FROM immutable_records")).toThrow("immutable record"); } finally { db.close(); }
  });
  it("prevents raw legacy writes and mutation of immutable facts", () => {
    const f = fixture(), db = new DatabaseSync(f.path);
    try {
      const project = f.store.getProject()!;
      expect(() => db.prepare("UPDATE projects SET payload_json = ? WHERE id = ?").run(JSON.stringify({ ...project, schema_version: "1.0.0" }), project.id)).toThrow("requires protocol 2");
      expect(() => db.exec("DELETE FROM event_ledger")).toThrow("immutable record");
      expect(() => db.exec("UPDATE command_receipts SET request_digest = 'altered'")).toThrow("immutable record");
    } finally { db.close(); }
  });
});
