import { fork } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import * as v2 from "../../protocol/src/v2/index.js";
import type { ProjectStore, StoreTransaction } from "../../store/dist/index.js";
import { createIntentProject, planBody } from "../../../tests/fixtures/intent-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";

const directories: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }); });
const fixture = (independentWithoutDependency = false, start = true) => {
  const dir = mkdtempSync(join(tmpdir(), "cimiloop-execution-")); directories.push(dir);
  const f = createIntentProject(dir); stores.push(f.store); f.grant("policy_owner");
  const change = f.create(); f.prepareContract(change.id);
  const body = planBody(change.id, f.store.getChange(change.id)!.contract_ref!); if (independentWithoutDependency) body.task_definitions[1]!.dependencies = [];
  const plan = f.preparePlan(change.id, body);
  const initialize = () => f.changeCommand("InitializePlanTasks", f.store.getChange(change.id)!, { plan_ref: f.store.getChange(change.id)!.plan_ref }, "technical_owner");
  flowSuccess(f.kernel.execute(initialize()));
  if (start) flowSuccess(f.kernel.execute(f.changeCommand("StartChange", f.store.getChange(change.id)!, { plan_ref: f.store.getChange(change.id)!.plan_ref, opening_reason: "按正式依据开工" })));
  const task = () => f.store.getExecutionObject("task", body.task_definitions[0]!.task_id)!;
  const targetCommand = <P>(type: string, objectType: string, id: string, revision: number, payload: P, role = "technical_owner") => ({ ...f.context(role), command_type: type, target: { object_type: objectType, id }, expected_revision: revision, payload });
  const input = (t = task()): Extract<v2.AnyCommand, { command_type: "CreateWorkItem" }>["payload"] => ({ definition_ref: t.definition_ref, executor_ref: { object_type: "actor", id: f.actor.id },
    allowed_actions: ["read_files", "edit_files", "run_checks"], allowed_resources: ["src/query.ts"], budget: { max_attempts: 3, max_elapsed_ms: 60_000, max_cost: { currency: "USD", amount_micros: 1000 } },
    stop_conditions: ["超出授权范围即停止"], reason: "具体核对后授权" });
  const create = (payload = input(), t = task(), role = "technical_owner") => targetCommand("CreateWorkItem", "task", t.id, t.revision, payload, role);
  const bodyGrant = (): v2.StandingAuthorizationBody => ({ scope: { kind: "change", id: change.id }, executor_actor_ids: [f.actor.id], allowed_actions: ["read_files", "edit_files", "run_checks"],
    allowed_resources: ["src/**"], environment_ids: [], risk_conditions: { allowed_levels: ["ordinary"], allowed_purposes: ["implementation", "verification"] }, valid_from: flowTime,
    expires_at: "2026-10-04T00:00:00.000Z", limits: input().budget });
  const publish = (body = bodyGrant(), auth?: v2.StandingAuthorization) => f.kernel.execute(targetCommand("PublishStandingAuthorization", auth ? "standing_authorization" : "project", auth?.id ?? f.project.id, auth?.revision ?? f.store.getProject()!.revision,
    { body, base_version_ref: auth?.current_version_ref ?? null }, "policy_owner"));
  const revoke = (item: v2.WorkItem) => targetCommand("RevokeWorkItem", "work_item", item.id, item.revision, { reason: "人工停止" });
  const view = () => { const result = f.kernel.getExecution(change.id); if ("code" in result) throw new Error(result.message); return result; };
  return { ...f, change, plan, initialize, task, input, createWork: create, targetCommand, bodyGrant, publish, revoke, view };
};
const work = (result: ReturnType<CimiLoopKernel["execute"]>) => { const success = flowSuccess(result); if (success.command_type !== "CreateWorkItem") throw new Error("work expected"); return success.data.work_item; };
const grant = (result: ReturnType<CimiLoopKernel["execute"]>) => { const success = flowSuccess(result); if (success.command_type !== "PublishStandingAuthorization") throw new Error("grant expected"); return success.data.authorization; };

describe("V1-05 fixed tasks and execution grants", () => {
  it("extracts immutable definitions and authorizes atomically without launching or completing a task", () => {
    const f = fixture(), changeBefore = f.store.getChange(f.change.id), cmd = f.createWork(), before = f.store.listEvents().length;
    const result = f.kernel.execute(cmd), item = work(result); expect(f.kernel.execute(cmd)).toEqual(result); expect(f.store.listEvents()).toHaveLength(before + 1);
    expect(f.store.getChange(f.change.id)).toEqual(changeBefore); expect(f.task()).toMatchObject({ revision: 2, status: "Pending", active_work_item_ref: { id: item.id }, usage: { attempts_consumed: 0 } });
    expect(item).toMatchObject({ status: "Ready", policy_version: "work-item/1.0.0", inherited_usage: { attempts_consumed: 0 } });
    expect(f.view()).toMatchObject({ tasks: expect.any(Array), work_item_authorizations: [expect.objectContaining({ work_item_id: item.id })], readiness: [expect.objectContaining({ ready: true, budget_remaining: { attempts: 3, elapsed_ms: 60_000, cost_micros: 1000 } }), expect.objectContaining({ ready: false })] });
    expect(f.kernel.execute(f.initialize())).toMatchObject({ code: "TASKS_UNCHANGED" });
    const db = new DatabaseSync(f.path); try { expect(() => db.exec("DELETE FROM execution_records")).toThrow("immutable record"); } finally { db.close(); }
  }, 20_000);

  it("rebinds a Pending task to an approved new Plan before execution while preserving logical identity and old definitions", () => {
    const f = fixture(false, false), old = f.task(), oldDefinition = f.store.getExecutionRecord("task_definition", old.definition_ref.id)!;
    const body = structuredClone(f.plan.version.body); body.task_definitions[0]!.version++; body.task_definitions[0]!.goal = "修订任务目标";
    f.preparePlan(f.change.id, body); flowSuccess(f.kernel.execute(f.initialize()));
    expect(f.task()).toMatchObject({ id: old.id, revision: 2, usage: old.usage, definition_ref: { domain_version: 2 } });
    expect(f.store.getExecutionRecord("task_definition", oldDefinition.id)).toEqual(oldDefinition); expect(f.view().definitions).toHaveLength(3);
  });

  it("rejects wrong definition, stale revision, duplicate authorization and unfulfilled task dependencies without partial writes", () => {
    const f = fixture(), before = f.view(), events = f.store.listEvents();
    expect(f.kernel.execute({ ...f.createWork(), expected_revision: 9 })).toMatchObject({ code: "REVISION_CONFLICT" });
    expect(f.kernel.execute(f.createWork({ ...f.input(), definition_ref: { ...f.task().definition_ref, id: v2.createInternalId() } }))).toMatchObject({ code: "BASELINE_MISMATCH" });
    const verification = f.view().tasks[1]!; expect(f.kernel.execute(f.createWork({ ...f.input(verification), allowed_actions: ["read_files"] }, verification))).toMatchObject({ code: "DEPENDENCY_UNSATISFIED" });
    expect(f.view()).toEqual(before); expect(f.store.listEvents()).toEqual(events);
    work(f.kernel.execute(f.createWork())); expect(f.kernel.execute(f.createWork())).toMatchObject({ code: "WORK_ITEM_ALREADY_OPEN" });
  });

  it("requires actual execution state and invalidates readiness when Change pauses", () => {
    const f = fixture(false, false); expect(f.kernel.execute(f.createWork())).toMatchObject({ code: "CHANGE_STATE_INVALID" });
    flowSuccess(f.kernel.execute(f.changeCommand("StartChange", f.store.getChange(f.change.id)!, { plan_ref: f.store.getChange(f.change.id)!.plan_ref, opening_reason: "开工" })));
    work(f.kernel.execute(f.createWork())); flowSuccess(f.kernel.execute(f.changeCommand("PauseChange", f.store.getChange(f.change.id)!, { reason: "暂停" }, "change_owner")));
    expect(f.view().readiness[0]).toMatchObject({ ready: false, reasons: expect.arrayContaining(["CHANGE_NOT_EXECUTING"]) });
  });

  it.each(["../src/query.ts", "C:/src/query.ts", "src\\query.ts", "**", ".git/config", "src/../../x", "src/.. /x", "src/con.txt", "src/file.", "src/%2e/x"])("denies unsafe resource %s", path => {
    const f = fixture(); expect(f.kernel.execute(f.createWork({ ...f.input(), allowed_resources: [path] }))).toMatchObject({ code: "RESOURCE_SCOPE_INVALID" }); expect(f.view().work_items).toEqual([]);
  });

  it("rejects edits outside TaskDefinition and gives independent verification a read-only, different executor", () => {
    const f = fixture(true); expect(f.kernel.execute(f.createWork({ ...f.input(), allowed_resources: ["src/other.ts"] }))).toMatchObject({ code: "CAPABILITY_PERMISSION_DENIED" });
    work(f.kernel.execute(f.createWork())); const t = f.view().tasks[1]!;
    expect(f.kernel.execute(f.createWork(f.input(t), t))).toMatchObject({ code: "CAPABILITY_PERMISSION_DENIED" });
    expect(f.kernel.execute(f.createWork({ ...f.input(t), allowed_actions: ["read_files", "run_checks"] }, t))).toMatchObject({ code: "INDEPENDENCE_REQUIRED" });
    const actor = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "human", identity_source: "local_operator", display_name: "Reviewer" })));
    if (actor.command_type !== "RegisterActor") throw new Error("actor expected");
    expect(work(f.kernel.execute(f.createWork({ ...f.input(t), executor_ref: { object_type: "actor", id: actor.data.actor.id }, allowed_actions: ["read_files", "run_checks"] }, t)))).toMatchObject({ independence_required: true, status: "Ready" });
  });

  it("checks independent identity regardless of which WorkItem is created first", () => {
    const f = fixture(true), t = f.view().tasks[1]!; work(f.kernel.execute(f.createWork({ ...f.input(t), allowed_actions: ["read_files"] }, t)));
    expect(f.kernel.execute(f.createWork())).toMatchObject({ code: "INDEPENDENCE_REQUIRED" });
  });

  it("revokes a specific grant then requires explicit history acknowledgement before a replacement", () => {
    const f = fixture(), first = work(f.kernel.execute(f.createWork())), original = f.view().work_item_authorizations[0]!;
    flowSuccess(f.kernel.execute(f.revoke(first))); expect(f.task()).not.toHaveProperty("active_work_item_ref");
    expect(f.kernel.execute(f.createWork())).toMatchObject({ code: "USAGE_ACKNOWLEDGEMENT_REQUIRED" });
    const digest = f.view().readiness[0]!.usage_digest;
    expect(f.kernel.execute(f.createWork({ ...f.input(), acknowledged_usage_digest: { ...digest, value: "a".repeat(64) } }))).toMatchObject({ code: "INPUT_CHANGED" });
    const next = work(f.kernel.execute(f.createWork({ ...f.input(), acknowledged_usage_digest: digest })));
    expect(next.id).not.toBe(first.id); expect(f.task().usage.attempts_consumed).toBe(0); expect(f.view().work_item_authorizations[0]).toEqual(original);
  });

  it("consumes standing grants as a bound Agent executor without assigning a Human responsibility", () => {
    const f = fixture(), registered = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "agent", identity_source: "runtime_binding", provider_identity_ref: { provider: "test-runtime", resource_type: "actor", locator: "bound-agent-1" }, display_name: "Agent" })));
    if (registered.command_type !== "RegisterActor" || registered.data.actor.actor_type !== "agent") throw new Error("agent expected");
    const actor = registered.data.actor, authorization = grant(f.publish({ ...f.bodyGrant(), executor_actor_ids: [actor.id] }));
    const agent = new CimiLoopKernel({ store: f.store, caller: { kind: "agent", actor_id: actor.id, project_id: f.project.id, provider_identity_ref: actor.provider_identity_ref }, now: () => flowTime });
    const cmd = { ...f.createWork({ ...f.input(), executor_ref: { object_type: "actor", id: actor.id }, standing_authorization_ref: authorization.current_version_ref }, f.task(), "executor"), actor_id: actor.id, source: { origin: "agent", producer: "runtime-test" } };
    const { standing_authorization_ref: _basis, ...specificPayload } = cmd.payload;
    expect(agent.execute({ ...cmd, payload: specificPayload, acting_role: "technical_owner" })).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    const item = work(agent.execute(cmd)); expect(item.authorization_basis_refs).toEqual([authorization.current_version_ref]); expect(f.view().work_item_authorizations).toEqual([]);
    expect(f.store.listEvents().at(-1)).toMatchObject({ acting_role: "executor", actor_id: actor.id }); expect(f.view().readiness[0]).toHaveProperty("ready", true);
  });

  it("invalidates exact standing bases on version replacement and revocation, preserving historical grant records", () => {
    const f = fixture(), a = grant(f.publish()), first = f.store.getExecutionRecord("standing_authorization_version", a.current_version_ref.id)!;
    work(f.kernel.execute(f.createWork({ ...f.input(), standing_authorization_ref: a.current_version_ref }, f.task(), "executor")));
    const second = grant(f.publish(f.bodyGrant(), a)); expect(second.current_version_ref.domain_version).toBe(2); expect(f.view().readiness[0]).toHaveProperty("ready", false);
    flowSuccess(f.kernel.execute(f.targetCommand("RevokeStandingAuthorization", "standing_authorization", second.id, second.revision, { reason: "人工撤销" }, "policy_owner")));
    expect(f.store.getExecutionRecord("standing_authorization_version", first.id)).toEqual(first); expect(f.view().authorization_revocations).toHaveLength(1);
  });

  it.each(["actor", "budget", "resource", "scope", "purpose"])("requires standing authorization coverage for %s", mismatch => {
    const f = fixture(); const body = f.bodyGrant();
    if (mismatch === "actor") { const r = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "human", identity_source: "local_operator", display_name: "Other" }))); if (r.command_type === "RegisterActor") body.executor_actor_ids = [r.data.actor.id]; }
    if (mismatch === "budget") body.limits.max_attempts = 1;
    if (mismatch === "resource") body.allowed_resources = ["docs/**"];
    if (mismatch === "purpose") body.risk_conditions.allowed_purposes = ["verification"];
    if (mismatch === "scope") { const other = f.create(); body.scope = { kind: "change", id: other.id }; }
    const a = grant(f.publish(body)); expect(f.kernel.execute(f.createWork({ ...f.input(), standing_authorization_ref: a.current_version_ref }, f.task(), "executor"))).toMatchObject({ code: "CAPABILITY_PERMISSION_DENIED" });
  });

  it("requires both policy and technical roles, valid expiry and current grantor assignments", () => {
    const f = fixture(); expect(f.publish({ ...f.bodyGrant(), expires_at: "2027-01-01T00:00:00.000Z" })).toMatchObject({ code: "INVALID_COMMAND" });
    const a = grant(f.publish()), expired = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => "2026-10-04T00:00:00.000Z" });
    expect(expired.execute(f.createWork({ ...f.input(), standing_authorization_ref: a.current_version_ref }, f.task(), "executor"))).toMatchObject({ code: "AUTHORIZATION_REVOKED" });
    const policy = f.store.listAssignments(f.actor.id).find(item => item.role_key === "policy_owner")!;
    flowSuccess(f.kernel.execute(f.projectCommand("EndAssignment", { assignment_id: policy.id, expected_assignment_revision: policy.revision, reason: "结束政策职责" })));
    expect(f.publish()).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    expect(f.kernel.execute(f.createWork({ ...f.input(), standing_authorization_ref: a.current_version_ref }, f.task(), "executor"))).toMatchObject({ code: "AUTHORIZATION_REVOKED" });
  });

  it("does not automatically recreate a WorkItem after a Human stop", () => {
    const f = fixture(), a = grant(f.publish()), create = () => f.createWork({ ...f.input(), standing_authorization_ref: a.current_version_ref }, f.task(), "executor");
    const item = work(f.kernel.execute(create())); flowSuccess(f.kernel.execute(f.revoke(item)));
    expect(f.kernel.execute(create())).toMatchObject({ code: "USAGE_ACKNOWLEDGEMENT_REQUIRED" });
  });

  it.each(["attempts", "elapsed", "cost", "unknown", "in_flight"])("checks persistent cumulative %s before granting another WorkItem", scenario => {
    const f = fixture(), task = f.task();
    // Denial fixture only: run reservation/consumption is introduced by V1-07.
    const usage = { ...task.usage, ...(scenario === "attempts" ? { attempts_consumed: 3 } : scenario === "elapsed" ? { first_started_at: "2026-10-02T00:00:00.000Z" } : scenario === "cost" ? { cost_consumed_micros: 1000, cost_currency: "USD" } : scenario === "unknown" ? { cost_known: false } : { pending_reconciliation: true }) };
    f.store.transaction(tx => tx.updateExecutionObject("task", { ...task, usage, revision: task.revision + 1 }, task.revision));
    expect(f.kernel.execute(f.createWork())).toMatchObject({ code: ["unknown", "in_flight"].includes(scenario) ? "EXTERNAL_RESULT_UNKNOWN" : "BUDGET_EXCEEDED" });
    expect(f.task().usage).toEqual(usage); expect(f.view().work_items).toEqual([]);
    if (scenario === "attempts") expect(() => f.store.transaction(tx => tx.updateExecutionObject("task", { ...f.task(), revision: f.task().revision + 1, usage: task.usage }, f.task().revision))).toThrow("cannot be reset");
  });

  it("does not accept a Satisfied tag with an invented evaluation as an actual dependency conclusion", () => {
    const f = fixture(), task = f.task();
    // Deliberately invalid provenance; this must never unlock the dependent verifier.
    f.store.transaction(tx => tx.updateExecutionObject("task", { ...task, revision: task.revision + 1, status: "Satisfied", result_evaluation_ref: { object_type: "evaluation", id: v2.createInternalId() } }, task.revision));
    const t = f.view().tasks[1]!;
    expect(f.kernel.execute(f.createWork({ ...f.input(t), allowed_actions: ["read_files"] }, t))).toMatchObject({ code: "DEPENDENCY_UNSATISFIED" });
    expect(f.view().work_items).toEqual([]);
  });

  it("preserves known consumed amounts while overall cost is unknown", () => {
    const f = fixture(), task = f.task();
    f.store.transaction(tx => tx.updateExecutionObject("task", { ...task, revision: task.revision + 1, usage: { ...task.usage, cost_known: false, cost_consumed_micros: 200, cost_currency: "USD" } }, task.revision));
    const current = f.task();
    expect(() => f.store.transaction(tx => tx.updateExecutionObject("task", { ...current, revision: current.revision + 1, usage: { ...current.usage, cost_known: true, cost_consumed_micros: 0 } }, current.revision))).toThrow("cannot be reset");
    expect(f.task()).toEqual(current);
  });

  it("rolls back grants, links, events, effects and receipts after a late failure", () => {
    const f = fixture(), cmd = f.createWork(), before = f.view(), events = f.store.listEvents(), outbox = f.store.listOutbox();
    const store = new Proxy(f.store, { get(target, key) { if (key === "transaction") return <T>(callback: (tx: StoreTransaction) => T) => target.transaction(tx => callback(new Proxy(tx, { get(inner, name) {
      if (name === "enqueueOutbox") return () => { throw new Error("fault"); }; const value = Reflect.get(inner, name); return typeof value === "function" ? value.bind(inner) : value;
    } }))); const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value; } }) as ProjectStore;
    expect(new CimiLoopKernel({ store, caller: f.caller, now: () => flowTime }).execute(cmd)).toMatchObject({ code: "STORE_FAILURE" });
    expect(f.view()).toEqual(before); expect(f.store.listEvents()).toEqual(events); expect(f.store.listOutbox()).toEqual(outbox); expect(f.store.transaction(tx => tx.getCommandReceipt(cmd.command_id))).toBeUndefined();
  });

  it("allows only one concurrent WorkItem creation with Task CAS", async () => {
    const f = fixture(), commands = [f.createWork(), f.createWork()];
    const clients = commands.map(() => fork(resolve("tests/fixtures/governance-client.mjs"), [f.path], { silent: true, execArgv: ["--no-warnings"] }));
    try {
      await Promise.all(clients.map(client => new Promise<void>((done, reject) => { client.once("error", reject); client.once("message", () => done()); })));
      const outcomes = clients.map(client => new Promise<unknown>((done, reject) => { client.once("error", reject); client.once("message", message => { const value = message as { result?: unknown; error?: string }; value.error ? reject(new Error(value.error)) : done(value.result); }); }));
      const exits = clients.map(client => new Promise<void>((done, reject) => client.once("exit", code => code === 0 ? done() : reject(new Error(`exit ${code}`)))));
      clients.forEach((client, index) => client.send({ caller: f.caller, command: commands[index], now: flowTime }));
      const results = await Promise.all(outcomes); await Promise.all(exits);
      expect(results.filter(value => value && typeof value === "object" && "ok" in value)).toHaveLength(1); expect(results).toContainEqual(expect.objectContaining({ code: "REVISION_CONFLICT" }));
      expect(f.view().work_items).toHaveLength(1); expect(f.view().work_item_authorizations).toHaveLength(1);
    } finally { clients.forEach(client => { if (client.exitCode === null) client.kill(); }); }
  }, 20_000);
});
