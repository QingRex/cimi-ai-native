import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fork } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import { SqliteProjectStore } from "../src/index.js";
import * as v2 from "../../protocol/src/v2/index.js";
import { createRunProject } from "../../../tests/fixtures/run-project.js";
import { createVerificationProject } from "../../../tests/fixtures/verification-project.js";
import { LocalRunVerifier } from "../../../apps/cli/src/runs-local.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
// Real Git captures include before/after snapshots and content verification.
vi.setConfig({ testTimeout: 45_000 });
afterEach(() => { while (stores.length) stores.pop()!.close(); while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const fixture = () => { const directory = mkdtempSync(join(tmpdir(), "cimiloop-runs-")); dirs.push(directory); const f = createRunProject(directory); stores.push(f.store); return f; };
const setup = (attempts = 3, cost?: number) => { const f = fixture(), source = f.capture(), item = f.authorize(attempts, cost), prepared = f.prepareContext(item, source); return { ...f, source, item, prepared }; };
describe("V1-07 native Human run lifecycle", () => {
  it("reserves atomically once, replays the exact receipt, rejects a competing revision and preserves it on reopen", () => {
    const f = setup(1, 100), cmd = f.command("ReserveRun", "task", f.task().id, { work_item_ref: { object_type: "work_item", id: f.item.id }, context_ref: { object_type: "context_manifest", id: f.prepared.context.id }, input_digest: f.prepared.context.input_digest, reserved_cost_micros: 80 });
    const second = new SqliteProjectStore(f.path); stores.push(second); const other = new CimiLoopKernel({ store: second, caller: f.caller, now: () => flowTime, evidenceVerifier: f.port, runVerifier: f.runPort });
    const result = flowSuccess(f.kernel.execute(cmd)); expect(result.command_type).toBe("ReserveRun");
    expect(other.execute({ ...cmd, command_id: v2.createInternalId() })).toMatchObject({ code: "REVISION_CONFLICT" });
    expect(f.kernel.execute(cmd)).toEqual(result); expect(f.store.listRuns(f.change.id)).toHaveLength(1);
    expect(f.task()).toMatchObject({ status: "InProgress", usage: { attempts_consumed: 1, first_started_at: flowTime, cost_reserved_micros: 80, pending_reconciliation: true } });
    expect(second.getExecutionObject("work_item", f.item.id)).toMatchObject({ status: "Active" });
    expect(other.getRuns(f.change.id)).toMatchObject({ runs: [{ status: "Reserved" }], records: [{ run_kind: "human", attempt_no: 1 }] });
    const observation = flowSuccess(f.observe(f.store.listRuns(f.change.id)[0]!, "succeeded", { usage: { cost_known: true, cost_micros: 45, currency: "USD" } })); expect(observation.command_type).toBe("RecordRunObservation");
    expect(f.task()).toMatchObject({ status: "InProgress", usage: { attempts_consumed: 1, cost_consumed_micros: 45, cost_reserved_micros: 0, pending_reconciliation: false } });
    expect(f.task().active_run_ref).toBeUndefined(); expect(f.store.getExecutionObject("work_item", f.item.id)?.status).toBe("Ready");
    // The final allowed attempt may still be evaluated; run success alone never satisfies a task.
    const prepared = f.prepare(f.source), report = f.report(f.source, prepared.requirement_set); flowSuccess(f.record(f.source, report.raw_result_ref));
    const evaluated = flowSuccess(f.evaluate(f.prepare(f.source))); if (evaluated.command_type !== "EvaluateTask" || evaluated.data.evaluation.purpose === "safe_integration") throw new Error("evaluation expected");
    flowSuccess(f.satisfy(evaluated.data.evaluation)); expect(f.task().status).toBe("Satisfied");
  }, 30_000);
  it("rolls back a reservation and all usage when event persistence fails", () => {
    const f = setup(); const db = new DatabaseSync(f.path); db.exec("CREATE TRIGGER fail_run_event BEFORE INSERT ON event_ledger WHEN NEW.event_type = 'RunReserved' BEGIN SELECT RAISE(ABORT, 'fault'); END;"); db.close();
    const task = f.task(), sequence = f.store.asOfEventSequence();
    expect(f.kernel.execute(f.command("ReserveRun", "task", task.id, { work_item_ref: { object_type: "work_item", id: f.item.id }, context_ref: { object_type: "context_manifest", id: f.prepared.context.id }, input_digest: f.prepared.context.input_digest }))).toMatchObject({ code: "STORE_FAILURE" });
    expect(f.task()).toEqual(task); expect(f.store.listRuns(f.change.id)).toEqual([]); expect(f.store.listRuntimeRecords("run_record", f.change.id)).toEqual([]); expect(f.store.asOfEventSequence()).toBe(sequence);
  });
  it("requires exact current workspace, authentic source, bound executor and a wired host", () => {
    const f = setup(), base = f.command("ReserveRun", "task", f.task().id, { work_item_ref: { object_type: "work_item", id: f.item.id }, context_ref: { object_type: "context_manifest", id: f.prepared.context.id }, input_digest: f.prepared.context.input_digest });
    expect(f.reviewerKernel.execute({ ...base, actor_id: f.reviewer.id })).toMatchObject({ code: "EXECUTOR_NOT_ALLOWED" });
    const disconnected = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime }); expect(disconnected.execute(base)).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    writeFileSync(join(f.directory, "src", "query.ts"), "changed input\n"); expect(f.kernel.execute(base)).toMatchObject({ code: "INPUT_CHANGED" }); expect(f.task().usage.attempts_consumed).toBe(0);
    f.git("checkout", "--", "src/query.ts"); const object = join(dirname(f.path), "objects", f.prepared.workspace.manifest_ref.locator); rmSync(object); expect(f.kernel.execute(base)).toMatchObject({ code: "EVIDENCE_MISSING" });
  });
  it("requires cost reservation and records actual overruns without inventing available budget", () => {
    const f = setup(3, 100), payload = { work_item_ref: { object_type: "work_item", id: f.item.id }, context_ref: { object_type: "context_manifest", id: f.prepared.context.id }, input_digest: f.prepared.context.input_digest };
    expect(f.kernel.execute(f.command("ReserveRun", "task", f.task().id, payload))).toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(f.kernel.execute(f.command("ReserveRun", "task", f.task().id, { ...payload, reserved_cost_micros: 101 }))).toMatchObject({ code: "BUDGET_EXCEEDED" });
    const run = f.reserve(f.item, f.prepared, 70).run; flowSuccess(f.observe(run, "succeeded", { usage: { cost_known: true, cost_micros: 120, currency: "USD" } }));
    expect(f.task().usage.cost_consumed_micros).toBe(120); expect(f.kernel.execute(f.command("ReserveRun", "task", f.task().id, { ...payload, reserved_cost_micros: 1 }))).toMatchObject({ code: "BUDGET_EXCEEDED" });
  });
  it("keeps cancellation and unknown usage blocked until native Human reconciliation, including after revocation", () => {
    const f = setup(), run = f.reserve(f.item, f.prepared).run;
    flowSuccess(f.observe(run, "unknown", { usage: { cost_known: false } })); flowSuccess(f.kernel.execute(f.command("CancelRun", "run", run.id, { reason: "请求人工停止并核对" })));
    expect(f.task().usage).toMatchObject({ attempts_consumed: 1, cost_known: false, pending_reconciliation: true }); expect(f.store.getRun(run.id)?.status).toBe("Unknown");
    flowSuccess(f.observe(run, "cancelled")); expect(f.store.getRun(run.id)?.status).toBe("Unknown");
    flowSuccess(f.kernel.execute(f.command("RevokeWorkItem", "work_item", f.item.id, { reason: "停止原授权" }, "technical_owner")));
    expect(() => f.authorize()).toThrow(/用量|核对/);
    flowSuccess(f.reconcile(run, "cancelled")); expect(f.task().usage.pending_reconciliation).toBe(false); expect(f.store.getExecutionObject("work_item", f.item.id)?.status).toBe("Revoked");
    expect(f.task().active_work_item_ref).toBeUndefined(); expect(f.task().usage.first_started_at).toBe(flowTime);
  });
  it("refunds only a verified unstarted attempt once and keeps its time origin and increasing attempt numbers", () => {
    const f = setup(1), run = f.reserve(f.item, f.prepared).run; flowSuccess(f.kernel.execute(f.command("CancelRun", "run", run.id, { reason: "尚未启动，待核对" })));
    expect(f.observe(run, "not_started")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    flowSuccess(f.reconcile(run, "not_started")); flowSuccess(f.reconcile(run, "not_started")); expect(f.task().usage).toMatchObject({ attempts_consumed: 1, attempts_released: 1, first_started_at: flowTime });
    f.setTime("2026-10-03T00:00:01.000Z"); const next = f.reserve(f.item, f.prepareContext(f.item, f.source)); expect(next.record.attempt_no).toBe(2); expect(f.task().usage.first_started_at).toBe(flowTime);
    flowSuccess(f.observe(next.run, "running")); expect(f.reconcile(next.run, "not_started")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
  }, 45_000);
  it("revokes an unstarted credit if actual execution arrives later and blocks until conflicting facts are resolved", () => {
    const f = setup(1), run = f.reserve(f.item, f.prepared).run; flowSuccess(f.reconcile(run, "not_started"));
    flowSuccess(f.observe(run, "succeeded")); expect(f.store.getRun(run.id)).toMatchObject({ status: "Unknown", release_reversed: true });
    expect(f.task().usage).toMatchObject({ attempts_released: 1, attempt_releases_reversed: 1, pending_reconciliation: true });
    flowSuccess(f.reconcile(run, "succeeded")); expect(f.kernel.execute(f.command("PrepareRunContext", "work_item", f.item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: f.source.id } }))).toMatchObject({ code: "BUDGET_EXCEEDED" });
  });
  it("retains late facts without rolling back a terminal status or replacing a newer active run", () => {
    const f = setup(4, 200), run = f.reserve(f.item, f.prepared, 50).run;
    f.setTime("2026-10-03T00:00:02.000Z"); flowSuccess(f.observe(run, "succeeded", { usage: { cost_known: true, cost_micros: 20, currency: "USD" } }));
    const next = f.reserve(f.item, f.prepareContext(f.item, f.source), 50).run;
    const late = flowSuccess(f.observe(run, "running", { observed_at: "2026-10-03T00:00:01.000Z", usage: { cost_known: true, cost_micros: 30, currency: "USD" } }));
    if (late.command_type !== "RecordRunObservation") throw new Error("obs expected"); expect(late.data.observation.applicability).toBe("late"); expect(late.data.run.status).toBe("Succeeded");
    expect(f.task().active_run_ref?.id).toBe(next.id); expect(f.task().usage.cost_consumed_micros).toBe(30); expect(f.store.getExecutionObject("work_item", f.item.id)?.status).toBe("Active");
    flowSuccess(f.observe(run, "failed", { usage: { cost_known: true, cost_micros: 30, currency: "USD" } })); expect(f.store.getRun(run.id)?.status).toBe("Unknown");
    expect(f.task().active_run_ref?.id).toBe(next.id); expect(f.reconcile(run, "succeeded", { resolves_observation_refs: [], usage: { cost_known: true, cost_micros: 30, currency: "USD" } })).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    flowSuccess(f.reconcile(run, "succeeded", { usage: { cost_known: true, cost_micros: 30, currency: "USD" } })); expect(f.task().usage.pending_reconciliation).toBe(true);
    flowSuccess(f.observe(next, "succeeded", { usage: { cost_known: true, cost_micros: 40, currency: "USD" } })); expect(f.task().usage).toMatchObject({ cost_consumed_micros: 70, cost_reserved_micros: 0, pending_reconciliation: false });
  }, 45_000);
  it("rejects forged, future or missing raw observations before mutating usage", () => {
    const f = setup(), run = f.reserve(f.item, f.prepared).run, before = f.task(), events = f.store.asOfEventSequence();
    expect(f.observe(run, "succeeded", { operation_key: v2.createInternalId() })).toMatchObject({ code: "BASELINE_MISMATCH" });
    expect(f.observe(run, "succeeded", { observed_at: "2026-10-04T00:00:00.000Z" })).toMatchObject({ code: "BASELINE_MISMATCH" });
    const raw = f.raw(run, "succeeded"); writeFileSync(join(dirname(f.path), "objects", raw.reference.locator), "tampered");
    expect(f.kernel.execute(f.command("RecordRunObservation", "run", run.id, { raw_result_ref: raw.reference }))).toMatchObject({ code: "EVIDENCE_MISSING" }); expect(f.task()).toEqual(before); expect(f.store.asOfEventSequence()).toBe(events);
  });
  it("preserves staged, unstaged and untracked bytes and requires a matching handoff before resumption", () => {
    const f = fixture(), source = f.capture(), item = f.authorize(3, undefined, ["src/query.ts", "src/new.ts"]);
    writeFileSync(join(f.directory, "src", "query.ts"), "staged\n"); f.git("add", "src/query.ts"); writeFileSync(join(f.directory, "src", "query.ts"), "unstaged\n"); writeFileSync(join(f.directory, "src", "new.ts"), "untracked\n");
    const result = flowSuccess(f.kernel.execute(f.command("SaveHandoff", "work_item", item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id }, next_actor_ref: { object_type: "actor", id: f.actor.id }, completed: ["已完成部分实现"], unresolved: ["待验证"], next_action: "继续核对", evidence_refs: [] })));
    if (result.command_type !== "SaveHandoff") throw new Error("handoff expected");
    const saved = f.runPort.readWorkspace(f.store.getProject()!, result.data.workspace); expect(saved.files).toHaveLength(2);
    expect(f.runPort.content.readContent(saved.index_diff_ref).toString()).toContain("staged"); expect(f.runPort.content.readContent(saved.worktree_diff_ref).toString()).toContain("unstaged");
    const file = saved.files.find(p => p.path === "src/new.ts")!; if (file.state !== "present") throw new Error("untracked file expected"); expect(f.runPort.content.readContent(file.content_ref).toString()).toBe("untracked\n");
    const prepared = f.prepareContext(item, source), payload = { handoff_ref: { object_type: "handoff_record", id: result.data.handoff.id }, context_ref: { object_type: "context_manifest", id: prepared.context.id }, input_digest: prepared.context.input_digest };
    expect(() => f.reserve(item, prepared)).toThrow(/接续/);
    writeFileSync(join(f.directory, "src", "new.ts"), "changed\n"); expect(f.kernel.execute(f.command("CheckResumption", "work_item", item.id, payload))).toMatchObject({ code: "INPUT_CHANGED" });
    writeFileSync(join(f.directory, "src", "new.ts"), "untracked\n"); const proof = flowSuccess(f.kernel.execute(f.command("CheckResumption", "work_item", item.id, payload))); if (proof.command_type !== "CheckResumption") throw new Error("proof expected");
    expect(f.reserve(item, prepared, undefined, proof.data.resumption).record.resumption_ref?.id).toBe(proof.data.resumption.id);
    expect(existsSync(join(dirname(f.path), "objects", file.content_ref.locator))).toBe(true);
  }, 30_000);
  it("does not reset elapsed budget across a handoff or a process restart", () => {
    const f = setup(), run = f.reserve(f.item, f.prepared).run; flowSuccess(f.observe(run, "succeeded"));
    f.setTime("2026-10-03T00:01:00.000Z"); expect(f.kernel.execute(f.command("PrepareRunContext", "work_item", f.item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: f.source.id } }))).toMatchObject({ code: "BUDGET_EXCEEDED" }); expect(f.task().usage.first_started_at).toBe(flowTime);
  });
  it("rejects dirty files outside the authorization boundary", () => {
    const f = setup(); writeFileSync(join(f.directory, "outside.txt"), "outside scope");
    expect(f.kernel.execute(f.command("PrepareRunContext", "work_item", f.item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: f.source.id } }))).toMatchObject({ code: "EVIDENCE_MISSING" });
  });
  it("retains a stale result after HEAD changes without replacing its reserved source or the formal baseline", () => {
    const f = setup(), run = f.reserve(f.item, f.prepared).run, baseline = f.store.getChange(f.change.id);
    writeFileSync(join(f.directory, "src", "query.ts"), "export const query = () => 2;\n"); f.git("add", "src/query.ts"); f.git("commit", "--quiet", "-m", "Changed during manual run");
    const result = flowSuccess(f.observe(run, "succeeded")); if (result.command_type !== "RecordRunObservation") throw new Error("observation expected");
    expect(result.data.observation.applicability).toBe("stale"); expect(result.data.workspace.head_commit_id).not.toBe(f.source.commit_id); expect(f.store.getRuntimeRecord("run_record", run.record_ref.id)?.source_snapshot_ref.id).toBe(f.source.id); expect(f.store.getChange(f.change.id)).toEqual(baseline); expect(f.task().status).toBe("InProgress");
  }, 30_000);
  it("persists a handoff during unknown execution but denies resumption until reconciliation", () => {
    const f = setup(), run = f.reserve(f.item, f.prepared).run; flowSuccess(f.observe(run, "unknown"));
    const result = flowSuccess(f.kernel.execute(f.command("SaveHandoff", "work_item", f.item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: f.source.id }, run_ref: { object_type: "run", id: run.id }, next_actor_ref: { object_type: "actor", id: f.actor.id }, completed: [], unresolved: ["外部结果未知"], next_action: "先核对实际执行", evidence_refs: [] })));
    if (result.command_type !== "SaveHandoff") throw new Error("handoff expected"); expect(result.data.handoff.usage_snapshot.pending_reconciliation).toBe(true);
    expect(f.kernel.execute(f.command("CheckResumption", "work_item", f.item.id, { handoff_ref: { object_type: "handoff_record", id: result.data.handoff.id }, context_ref: { object_type: "context_manifest", id: f.prepared.context.id }, input_digest: f.prepared.context.input_digest }))).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
  }, 30_000);
  it("requires a new Human authorization when handing execution to another actor and preserves cumulative usage", () => {
    const f = setup(), run = f.reserve(f.item, f.prepared).run; flowSuccess(f.observe(run, "succeeded"));
    const saved = flowSuccess(f.kernel.execute(f.command("SaveHandoff", "work_item", f.item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: f.source.id }, next_actor_ref: { object_type: "actor", id: f.reviewer.id }, completed: ["已实际运行一次"], unresolved: ["待进一步审阅"], next_action: "新执行者在相同基准接续", evidence_refs: [] })));
    if (saved.command_type !== "SaveHandoff") throw new Error("handoff expected");
    expect(f.reviewerKernel.execute(f.command("PrepareRunContext", "work_item", f.item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: f.source.id } }, "executor", f.reviewer.id))).toMatchObject({ code: "EXECUTOR_NOT_ALLOWED" });
    flowSuccess(f.kernel.execute(f.command("RevokeWorkItem", "work_item", f.item.id, { reason: "受控交接执行者" }, "technical_owner")));
    const view = f.kernel.getExecution(f.change.id); if ("code" in view) throw new Error(view.message);
    const wi = f.authorize(3, undefined, ["src/query.ts"], f.reviewer.id, view.readiness.find(r => r.task_id === f.task().id)!.usage_digest);
    expect(wi.inherited_usage.attempts_consumed).toBe(1); const prepared = f.prepareContext(wi, f.source);
    const proof = flowSuccess(f.reviewerKernel.execute(f.command("CheckResumption", "work_item", wi.id, { handoff_ref: { object_type: "handoff_record", id: saved.data.handoff.id }, context_ref: { object_type: "context_manifest", id: prepared.context.id }, input_digest: prepared.context.input_digest }, "executor", f.reviewer.id)));
    if (proof.command_type !== "CheckResumption") throw new Error("proof expected"); expect(f.reserve(wi, prepared, undefined, proof.data.resumption).record.attempt_no).toBe(2);
  }, 45_000);
  it("denies a genuinely bound Agent executor while preserving its authorized WorkItem for the later adapter", () => {
    const f = fixture(), provider = { provider: "test-runtime", resource_type: "session", locator: "agent-session" };
    const result = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "agent", identity_source: "runtime_binding", display_name: "Bound Agent", provider_identity_ref: provider }))); if (result.command_type !== "RegisterActor") throw new Error("agent expected");
    const actor = result.data.actor, source = f.capture(), item = f.authorize(3, undefined, ["src/query.ts"], actor.id);
    const kernel = new CimiLoopKernel({ store: f.store, caller: { kind: "agent", project_id: f.project.id, actor_id: actor.id, provider_identity_ref: provider }, now: () => flowTime, runVerifier: f.runPort, evidenceVerifier: f.port });
    expect(kernel.execute({ ...f.command("PrepareRunContext", "work_item", item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id } }, "executor", actor.id), source: { origin: "agent", producer: "test-runtime" } })).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" }); expect(f.task().usage.attempts_consumed).toBe(0);
  });
  it("checks real paused execution and its uncommitted handoff before resuming, with capacity enforced atomically", () => {
    const f = setup(), run = f.reserve(f.item, f.prepared).run;
    const changeCommand = (kind: string, payload: unknown) => ({ ...f.context("change_owner"), command_type: kind, target: { object_type: "change", id: f.change.id }, expected_revision: f.store.getChange(f.change.id)!.revision, payload });
    flowSuccess(f.kernel.execute(changeCommand("PauseChange", { reason: "跨会话接续" })));
    expect(f.kernel.execute(changeCommand("ResumeChange", {}))).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    flowSuccess(f.observe(run, "succeeded")); writeFileSync(join(f.directory, "src", "query.ts"), "partially implemented\n");
    const handoff = flowSuccess(f.kernel.execute(f.command("SaveHandoff", "work_item", f.item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: f.source.id }, next_actor_ref: { object_type: "actor", id: f.actor.id }, completed: ["已保存部分修改"], unresolved: ["待验证"], next_action: "核对后继续", evidence_refs: [] })));
    if (handoff.command_type !== "SaveHandoff") throw new Error("handoff expected"); const prepared = f.prepareContext(f.item, f.source);
    expect(f.kernel.execute(f.command("ReserveRun", "task", f.task().id, { work_item_ref: { object_type: "work_item", id: f.item.id }, context_ref: { object_type: "context_manifest", id: prepared.context.id }, input_digest: prepared.context.input_digest }))).toMatchObject({ code: "BUDGET_EXCEEDED" });
    const proof = flowSuccess(f.kernel.execute(f.command("CheckResumption", "work_item", f.item.id, { handoff_ref: { object_type: "handoff_record", id: handoff.data.handoff.id }, context_ref: { object_type: "context_manifest", id: prepared.context.id }, input_digest: prepared.context.input_digest }))); if (proof.command_type !== "CheckResumption") throw new Error("proof expected");
    const payload = { reconciliation_refs: [{ object_type: "resumption_record", id: proof.data.resumption.id }] };
    writeFileSync(join(f.directory, "src", "query.ts"), "someone else modified it\n"); expect(f.kernel.execute(changeCommand("ResumeChange", payload))).toMatchObject({ code: "INPUT_CHANGED" });
    writeFileSync(join(f.directory, "src", "query.ts"), "partially implemented\n"); const resumed = flowSuccess(f.kernel.execute(changeCommand("ResumeChange", payload))); expect(resumed.events[0]?.payload).toMatchObject(payload); expect(f.store.getChange(f.change.id)?.operating_status).toBe("Active");
    expect(f.reserve(f.item, prepared, undefined, proof.data.resumption).record.attempt_no).toBe(2);
  }, 60_000);
  it("allows only one reservation from two actual concurrent processes", async () => {
    const f = setup(1), commands = [0, 1].map(() => f.command("ReserveRun", "task", f.task().id, { work_item_ref: { object_type: "work_item", id: f.item.id }, context_ref: { object_type: "context_manifest", id: f.prepared.context.id }, input_digest: f.prepared.context.input_digest }));
    const clients = commands.map(() => fork(resolve("tests/fixtures/run-client.mjs"), [f.path], { silent: true, execArgv: ["--no-warnings"] }));
    try {
      await Promise.all(clients.map(client => new Promise<void>((done, reject) => { client.once("error", reject); client.once("message", () => done()); })));
      const outcomes = clients.map(client => new Promise<unknown>((done, reject) => { client.once("error", reject); client.once("message", message => { const value = message as { result?: unknown; error?: string }; value.error ? reject(new Error(value.error)) : done(value.result); }); }));
      const exits = clients.map(client => new Promise<void>((done, reject) => client.once("exit", code => code === 0 ? done() : reject(new Error(`exit ${code}`)))));
      clients.forEach((client, index) => client.send({ command: commands[index], caller: f.caller, now: flowTime, repositoryPath: f.directory }));
      const results = await Promise.all(outcomes); await Promise.all(exits); expect(results.filter(r => r && typeof r === "object" && "ok" in r)).toHaveLength(1); expect(results).toContainEqual(expect.objectContaining({ code: "REVISION_CONFLICT" }));
      expect(f.store.listRuns(f.change.id)).toHaveLength(1); expect(f.task().usage.attempts_consumed).toBe(1);
    } finally { clients.forEach(client => { if (client.exitCode === null) client.kill(); }); }
  }, 45_000);
  it("resumes a real IntentReady baseline with a confirmed Plan and current source before any task is authorized", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-prestart-resume-")); dirs.push(directory);
    const f = createVerificationProject(directory, false); stores.push(f.store);
    const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, evidenceVerifier: f.port, runVerifier: new LocalRunVerifier(directory, dirname(f.path)) });
    const command = (type: string, payload: unknown, role = "change_owner") => ({ ...f.context(role), command_type: type, target: { object_type: "change", id: f.change.id }, expected_revision: f.store.getChange(f.change.id)!.revision, payload });
    flowSuccess(kernel.execute(command("PauseChange", { reason: "开工前核对" })));
    const captured = flowSuccess(kernel.execute(command("CaptureSourceSnapshot", { commit_id: f.git("rev-parse", "HEAD").trim() }, "technical_owner"))); if (captured.command_type !== "CaptureSourceSnapshot") throw new Error("source expected");
    flowSuccess(kernel.execute(command("ResumeChange", { reconciliation_refs: [{ object_type: "source_snapshot", id: captured.data.source_snapshot.id }] })));
    expect(f.store.getChange(f.change.id)).toMatchObject({ lifecycle_state: "IntentReady", operating_status: "Active" }); expect(f.store.listRuns(f.change.id)).toEqual([]);
  });
});
