import { fork } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import * as v2 from "../../protocol/src/v2/index.js";
import type { ProjectStore, ProjectReader, StoreTransaction } from "../../store/dist/index.js";
import { StoreConflictError } from "../../store/dist/index.js";
import { SqliteProjectStore } from "../src/index.js";
import { createFlowProject, flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";

const directories: string[] = [], resources: { close(): void }[] = [];
const fixture = () => { const directory = mkdtempSync(join(tmpdir(), "cimiloop-flow-")); directories.push(directory);
  const f = createFlowProject(directory); resources.push(f.store); return f; };
afterEach(() => { while (resources.length) resources.pop()!.close(); while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }); });
const status = (kernel: CimiLoopKernel) => { const value = kernel.getFlowStatus(); if ("code" in value) throw new Error(JSON.stringify(value)); return value; };
const snapshot = (f: ReturnType<typeof fixture>) => ({ flow: status(f.kernel), events: f.store.listEvents(), assignments: f.store.listAssignments(), outbox: f.store.listOutbox() });

describe("V1-03 settings, planning and capacity", () => {
  it("requires independent governance/flow grants and atomically versions explicit settings", () => {
    const f = fixture(); expect(status(f.kernel)).toMatchObject({ settings_version: null, priority_order: null, wip: { limit: null, available: null } });
    expect(f.kernel.execute(f.settingsCommand())).toMatchObject({ code: "FLOW_OWNER_REQUIRED" });
    f.grant(); const command = f.settingsCommand(), first = flowSuccess(f.kernel.execute(command));
    if (first.command_type !== "UpdateProjectSettings") throw new Error("settings expected");
    expect(first.data.settings_version).toMatchObject({ version: 1, producer_actor_id: f.actor.id });
    expect(f.store.getProject()!.settings_ref).toMatchObject({ id: first.data.settings_version.id, domain_version: 1 });
    expect(f.kernel.execute(command)).toEqual(first);
    const stale = { ...f.settingsCommand(), payload: { ...command.payload, base_settings_ref: null } };
    expect(f.kernel.execute(stale)).toMatchObject({ code: "SETTINGS_BASE_CONFLICT" });
    const before = snapshot(f);
    expect(f.kernel.execute(f.settingsCommand({ wip_limit: 0 }))).toMatchObject({ code: "PROTOCOL_VALIDATION_FAILED" });
    expect(f.kernel.execute(f.settingsCommand({ policy_ref: { object_type: "policy_version", id: v2.createInternalId(), domain_version: 1 } }))).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(snapshot(f)).toEqual(before);
    const second = flowSuccess(f.kernel.execute(f.settingsCommand({ priority_order: "lower_first" })));
    expect(second).toMatchObject({ data: { settings_version: { version: 2, predecessor_ref: { id: first.data.settings_version.id, domain_version: 1 } } } });
    expect(f.store.getSettingsVersion(first.data.settings_version.id)).toEqual(first.data.settings_version);
    const db = new DatabaseSync(f.path);
    try { expect(() => db.exec("DELETE FROM project_settings_versions")).toThrow("immutable record"); } finally { db.close(); }
  });

  it("keeps target planning separate from lifecycle and records changes/clearing without implicit completion", () => {
    const f = fixture(); f.configure(); const change = f.create(), next = f.create("later");
    const created = flowSuccess(f.kernel.execute(f.projectCommand("CreateTargetVersion", { name: "v1", planned_window: {
      starts_at: "2026-10-03T00:00:00Z", ends_at: "2026-10-04T00:00:00.000Z" } }, "flow_owner")));
    if (created.command_type !== "CreateTargetVersion") throw new Error("target expected");
    const target = created.data.target_version;
    expect(f.kernel.execute(f.projectCommand("CreateTargetVersion", { name: "v1" }, "flow_owner"))).toMatchObject({ code: "TARGET_VERSION_NAME_CONFLICT" });
    expect(f.kernel.execute(f.projectCommand("CreateTargetVersion", { name: "invalid", planned_window: {
      starts_at: "2027-02-30T00:00:00Z", ends_at: "2027-03-05T00:00:00Z" } }, "flow_owner"))).toMatchObject({ code: "INVALID_COMMAND" });
    const planned = flowSuccess(f.kernel.execute(f.changeCommand("ChangePlanning", change, { priority: 5, target_version_id: target.id, reason: "规划" })));
    expect(planned).toMatchObject({ data: { change: { lifecycle_state: "Draft", operating_status: "Active", priority: 5, target_version_id: target.id } } });
    const close = f.projectCommand("CloseTargetVersion", { target_version_id: target.id, expected_target_revision: 1, reason: "窗口结束" }, "flow_owner");
    expect(f.kernel.execute({ ...close, payload: { ...close.payload, expected_target_revision: 2 } })).toMatchObject({ code: "REVISION_CONFLICT" });
    expect(f.kernel.execute(close)).toMatchObject({ data: { target_version: { status: "closed", revision: 2 } } });
    expect(f.store.getChange(change.id)).toMatchObject({ lifecycle_state: "Draft", target_version_id: target.id });
    expect(f.kernel.execute(f.changeCommand("ChangePlanning", next, { target_version_id: target.id, reason: "不可新纳入" }))).toMatchObject({ code: "TARGET_VERSION_CLOSED" });
    const cleared = flowSuccess(f.kernel.execute(f.changeCommand("ChangePlanning", f.store.getChange(change.id)!, { target_version_id: null, reason: "移出规划" })));
    expect(cleared).toMatchObject({ events: [{ event_type: "ChangePlanningUpdated", payload: { previous_target_version_id: target.id, reason: "移出规划" } }] });
    if (!("change" in cleared.data)) throw new Error("change expected"); expect(cleared.data.change).not.toHaveProperty("target_version_id");
    expect(() => f.store.transaction(tx => tx.updateTargetVersion({ ...target, status: "closed", closed_reason: "stale", revision: 2 }, 1))).toThrow(StoreConflictError);
  });

  it("requires current Flow Owner for ordinary planning and limits explicit arbitration to priority", () => {
    const f = fixture(); f.configure(); const change = f.create();
    const registered = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "human", identity_source: "local_operator", display_name: "Arbiter" })));
    if (registered.command_type !== "RegisterActor") throw new Error("actor expected");
    const arbiter = registered.data.actor; f.grant("project_owner", arbiter.id);
    flowSuccess(f.kernel.execute(f.settingsCommand({ priority_arbiter_actor_id: arbiter.id })));
    const kernel = new CimiLoopKernel({ store: f.store, caller: { kind: "local_operator", project_id: f.project.id, actor_id: arbiter.id }, now: () => flowTime });
    const command = { ...f.changeCommand("ChangePlanning", change, { priority: 7, reason: "争议" }, "project_owner"), actor_id: arbiter.id };
    expect(kernel.execute(command)).toMatchObject({ code: "FLOW_OWNER_REQUIRED" });
    expect(kernel.execute({ ...command, payload: { ...command.payload, arbitration: true, target_version_id: null } })).toMatchObject({ code: "PRIORITY_ARBITER_REQUIRED" });
    expect(kernel.execute({ ...command, payload: { ...command.payload, arbitration: true } })).toMatchObject({ data: { change: { priority: 7 } }, events: [{ payload: { arbitration: true } }] });
    const assignment = f.store.listAssignments(arbiter.id).find(item => item.role_key === "project_owner")!;
    expect(f.kernel.execute(f.projectCommand("EndAssignment", { assignment_id: assignment.id, expected_assignment_revision: 1, reason: "仍是裁决人" }))).toMatchObject({ code: "RESPONSIBILITY_HANDOFF_REQUIRED" });
    const flowAssignment = f.store.listAssignments(f.actor.id).find(item => item.role_key === "flow_owner")!;
    expect(f.kernel.execute(f.projectCommand("EndAssignment", { assignment_id: flowAssignment.id, expected_assignment_revision: 1, reason: "仍是协调人" }))).toMatchObject({ code: "RESPONSIBILITY_HANDOFF_REQUIRED" });
  });

  it("sorts explicitly with stable ties and counts waiting delivery, excludes paused and terminal changes", () => {
    const f = fixture(); f.configure(); const a = f.create("review wait"), b = f.create("release wait"), c = f.create("paused"), d = f.create("complete"), e = f.create("terminate");
    f.seedState(a, { lifecycle_state: "Executing", priority: 5 }); f.seedState(b, { lifecycle_state: "ReadyForDelivery", priority: 5 });
    f.seedState(c, { lifecycle_state: "Executing", operating_status: "Paused", pause_reason: "等待资源", priority: 9 });
    f.seedState(d, { lifecycle_state: "Completed" }); f.seedState(e, { lifecycle_state: "Terminated", termination_reason: "cancelled" });
    const value = status(f.kernel);
    expect(value.wip).toEqual({ used: 2, limit: 3, available: 1 }); expect(value.wip_changes.map(item => item.id)).toEqual([a.id, b.id]);
    expect(value.paused_changes.map(item => item.id)).toEqual([c.id]); expect(value.changes.map(item => item.id)).toEqual([c.id, a.id, b.id, d.id, e.id]);
    const before = snapshot(f); expect(f.kernel.execute(f.settingsCommand({ wip_limit: 1 }))).toMatchObject({ code: "WIP_LIMIT_EXCEEDED", details: { used: 2, limit: 1 } });
    expect(snapshot(f)).toEqual(before);
    flowSuccess(f.kernel.execute(f.settingsCommand({ priority_order: "lower_first" })));
    expect(status(f.kernel).changes.map(item => item.id)).toEqual([d.id, e.id, a.id, b.id, c.id]);
  });

  it("never treats arbitrary Plan pointers or emergency declarations as admission proofs", () => {
    const f = fixture(); f.configure({ wip_limit: 1 }); const draft = f.create(), plan = { object_type: "plan_version" as const, id: v2.createInternalId(), domain_version: 1 };
    expect(f.kernel.execute(f.changeCommand("StartChange", draft, { plan_ref: plan, opening_reason: "开工" }))).toMatchObject({ code: "CHANGE_STATE_INVALID" });
    let ready = f.seedState(draft, { lifecycle_state: "IntentReady" });
    expect(f.kernel.execute(f.changeCommand("StartChange", ready, { plan_ref: plan, opening_reason: "没有真实计划" }))).toMatchObject({ code: "EVIDENCE_MISSING" });
    ready = f.seedState(ready, { plan_ref: plan, contract_ref: { object_type: "contract_version", id: v2.createInternalId(), domain_version: 1 } });
    const before = snapshot(f), start = f.changeCommand("StartChange", ready, { plan_ref: plan, opening_reason: "引用不是证明" });
    expect(f.kernel.execute(start)).toMatchObject({ code: "EVIDENCE_MISSING" });
    expect(f.kernel.execute({ ...start, payload: { ...start.payload, emergency_capacity_override: { decision_ref: { object_type: "decision", id: v2.createInternalId() },
      coordinator_actor_id: f.actor.id, affected_change_refs: [{ object_type: "change", id: ready.id }], reason: "应急", recovery_arrangement: "后续恢复" } } })).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(snapshot(f)).toEqual(before);
    f.seedState(f.create("occupies capacity"), { lifecycle_state: "ReadyForDelivery" });
    expect(f.kernel.execute(start)).toMatchObject({ code: "WIP_LIMIT_EXCEEDED", details: { used: 1, limit: 1 } });
    expect(f.store.getChange(ready.id)).toHaveProperty("lifecycle_state", "IntentReady");
  });

  it("preserves paused work and rechecks capacity before non-Draft resume, keeping unverified execution blocked", () => {
    const f = fixture(); f.configure({ wip_limit: 1 }); let a = f.seedState(f.create("executing"), { lifecycle_state: "Executing" });
    const pause = f.changeCommand("PauseChange", a, { reason: "资源交接" }, "change_owner");
    expect(f.kernel.execute(pause)).toMatchObject({ data: { change: { lifecycle_state: "Executing", operating_status: "Paused", pause_reason: "资源交接" } } });
    a = f.store.getChange(a.id)!; expect(status(f.kernel).wip.used).toBe(0);
    const b = f.seedState(f.create("waiting release"), { lifecycle_state: "ReadyForDelivery" });
    const resume = f.changeCommand("ResumeChange", a, {}, "change_owner");
    expect(f.kernel.execute(resume)).toMatchObject({ code: "WIP_LIMIT_EXCEEDED" });
    flowSuccess(f.kernel.execute(f.changeCommand("PauseChange", b, { reason: "安排暂停" }, "change_owner")));
    expect(f.kernel.execute(resume)).toMatchObject({ code: "EVIDENCE_MISSING" });
    expect(f.store.getChange(a.id)).toMatchObject({ operating_status: "Paused", pause_reason: "资源交接" });
  });

  it("rolls back settings versions, pointer, event sequence, effect and receipt on a later fault", () => {
    const f = fixture(); f.grant(); const command = f.settingsCommand(), before = snapshot(f);
    const faultStore = new Proxy(f.store, { get(target, key) {
      if (key === "transaction") return <T>(work: (tx: StoreTransaction) => T) => target.transaction(tx => work(new Proxy(tx, { get(inner, method) {
        if (method === "enqueueOutbox") return () => { throw new Error("effect fault"); }; const value = Reflect.get(inner, method); return typeof value === "function" ? value.bind(inner) : value;
      } })));
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } }) as ProjectStore;
    expect(new CimiLoopKernel({ store: faultStore, caller: f.caller, now: () => flowTime }).execute(command)).toMatchObject({ code: "STORE_FAILURE" });
    expect(snapshot(f)).toEqual(before); expect(f.store.transaction(tx => tx.getCommandReceipt(command.command_id))).toBeUndefined();
    const result = flowSuccess(f.kernel.execute(command)); expect(result).toMatchObject({ data: { settings_version: { version: 1 } } });
  });

  it("returns settings and WIP from one snapshot while another connection commits settings", () => {
    const f = fixture(); f.configure(); f.create(); const writer = new SqliteProjectStore(f.path); resources.push(writer);
    const writerKernel = new CimiLoopKernel({ store: writer, caller: f.caller, now: () => flowTime });
    const before = status(f.kernel), command = f.settingsCommand({ wip_limit: 4, priority_order: "lower_first" }); let committed = false;
    const readerStore = new Proxy(f.store, { get(target, key) {
      if (key === "readSnapshot") return <T>(work: (reader: ProjectReader) => T) => target.readSnapshot(reader => work({ ...reader, listChanges: () => {
        if (!committed) { flowSuccess(writerKernel.execute(command)); committed = true; } return reader.listChanges();
      } }));
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } }) as ProjectStore;
    expect(status(new CimiLoopKernel({ store: readerStore, caller: f.caller }))).toEqual(before);
    expect(status(f.kernel)).toMatchObject({ wip: { limit: 4 }, priority_order: "lower_first", as_of_event_sequence: before.as_of_event_sequence + 1 });
  });

  it("reserves the last capacity slot atomically between two actual processes (fixture-only admission)", async () => {
    const f = fixture(); f.configure({ wip_limit: 1 }); const changes = [f.seedState(f.create("a"), { lifecycle_state: "IntentReady" }), f.seedState(f.create("b"), { lifecycle_state: "IntentReady" })];
    const clients = changes.map(() => fork(resolve("tests/fixtures/capacity-client.mjs"), [f.path], { silent: true, execArgv: ["--no-warnings"] }));
    try {
      await Promise.all(clients.map(client => new Promise<void>((resolveReady, reject) => { client.once("error", reject);
        client.once("exit", code => reject(new Error(`early exit ${code}`))); client.once("message", () => resolveReady()); })));
      const results = clients.map(client => new Promise<unknown>((resolveResult, reject) => { client.once("error", reject);
        client.once("message", message => { const value = message as { result?: unknown; error?: string }; value.error ? reject(new Error(value.error)) : resolveResult(value.result); }); }));
      const exits = clients.map(client => new Promise<void>((resolveExit, reject) => client.once("exit", code => code === 0 ? resolveExit() : reject(new Error(`exit ${code}`)))));
      clients.forEach((client, index) => client.send({ changeId: changes[index]!.id, correlationId: v2.createInternalId() }));
      const values = await Promise.all(results); await Promise.all(exits);
      expect(values).toContainEqual(expect.objectContaining({ fixture_capacity_reserved: true }));
      expect(values).toContainEqual(expect.objectContaining({ code: "WIP_LIMIT_EXCEEDED", details: expect.objectContaining({ used: 1, limit: 1 }) }));
      expect(status(f.kernel).wip).toEqual({ used: 1, limit: 1, available: 0 });
      // No StartChange event/receipt is fabricated by the low-level transaction fixture.
      expect(f.store.listEvents().some(event => event.event_type === "ChangeStarted")).toBe(false);
    } finally { clients.forEach(client => { if (client.exitCode === null) client.kill(); }); }
  }, 20_000);
});
