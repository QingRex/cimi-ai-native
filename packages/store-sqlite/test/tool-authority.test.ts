import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import * as v2 from "../../protocol/src/v2/index.js";
import { digest } from "../../runtime-adapter/src/files.js";
import { PublicToolFileFixture, PublicToolHost } from "../../runtime-adapter/src/tool-host.js";
import { ToolJournal, TOOL_SLOT_BYTES, toolAuthorityRequest, type ToolInvocation } from "../../runtime-adapter/src/tool-journal.js";
import { buildWindowsLauncher } from "../../runtime-adapter/src/native.js";
import { creditHostDependencies } from "../../runtime-adapter/src/gateway-credit-owner.js";
import { createRunProject } from "../../../tests/fixtures/run-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";
import { fixtureIdentity, removeToolFixture } from "../../runtime-adapter/test/tool-fixture.js";
vi.setConfig({ testTimeout: 45000 });
const dirs: string[] = [], stores: { close(): void }[] = [], files: string[] = [];
afterEach(() => {
  while (stores.length) stores.pop()!.close(); while (files.length) removeToolFixture(files.pop()!);
  while (dirs.length) { const dir = dirs.pop()!; if (!resolve(dir).startsWith(resolve(tmpdir()) + sep + "cimiloop-tool-native-")) throw Error("bad cleanup"); rmSync(dir, { recursive: true, force: true }); }
});
const setup = (edit = false, standing = false) => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-tool-native-")); dirs.push(root); const f = createRunProject(root); stores.push(f.store);
  const source = f.capture(); let item: v2.WorkItem;
  const budget = { max_attempts: 1, max_elapsed_ms: 60000 };
  let authorization: v2.StandingAuthorization | undefined;
  if (standing) {
    f.grant("policy_owner");
    const published = flowSuccess(f.kernel.execute(f.projectCommand("PublishStandingAuthorization", { body: { scope: { kind: "change", id: f.change.id }, executor_actor_ids: [f.actor.id],
      allowed_actions: ["read_files", "edit_files"], allowed_resources: ["src/**"], environment_ids: [], risk_conditions: { allowed_levels: ["ordinary"], allowed_purposes: ["implementation", "verification"] },
      valid_from: flowTime, expires_at: new Date(Date.parse(flowTime) + 30000).toISOString(), limits: budget }, base_version_ref: null }, "policy_owner")));
    if (published.command_type !== "PublishStandingAuthorization") throw Error("standing grant expected"); authorization = published.data.authorization;
  }
  if (edit || standing) {
    const result = flowSuccess(f.kernel.execute(f.taskCommand("CreateWorkItem", f.task().id, { definition_ref: f.task().definition_ref, executor_ref: { object_type: "actor", id: f.actor.id },
      allowed_actions: edit ? ["read_files", "edit_files"] : ["read_files"], allowed_resources: ["src/query.ts"], budget, stop_conditions: ["边界改变即停止"], reason: "公开工具人工授权测试",
      ...(authorization ? { standing_authorization_ref: authorization.current_version_ref } : {}) }, f.actor.id, authorization ? "executor" : "technical_owner")));
    if (result.command_type !== "CreateWorkItem") throw Error("work item expected"); item = result.data.work_item;
  } else item = f.authorize(1);
  const prepared = f.prepareContext(item, source), reserved = f.reserve(item, prepared);
  const request: v2.ToolAuthorityRequest = { project_id: f.project.id, run_id: reserved.run.id, operation_key: reserved.record.operation_key,
    executor_actor_id: f.actor.id, context_digest: prepared.context.input_digest, action: "read_files", resource: "src/query.ts" };
  return { ...f, source, item, prepared, run: reserved.run, record: reserved.record, request, authorization };
};
describe("native Human Run tool authority from one consistent snapshot", () => {
  it("allows the owned last attempt, binds immutable facts, and creates no events or usage changes", () => {
    const f = setup(), before = f.task(), sequence = f.store.asOfEventSequence(), first = f.kernel.assessRunTool(f.request);
    expect(first).toMatchObject({ decision: "ALLOW", scope: "human_run_tool_assessment", as_of_event_sequence: sequence, formal_agent_execution_enabled: false,
      authority: { task_id: f.task().id, work_item_id: f.item.id, run_record_id: f.record.id, context_id: f.prepared.context.id } });
    expect(f.kernel.assessRunTool(f.request)).toEqual(first); expect(f.task()).toEqual(before); expect(before.usage).toMatchObject({ attempts_consumed: 1, pending_reconciliation: true });
    expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.store.getRun(f.run.id)?.status).toBe("Reserved");
  });
  it("rejects caller, operation, context, path and unsupported action substitutions", () => {
    const f = setup();
    for (const fields of [{ project_id: v2.createInternalId() }, { run_id: v2.createInternalId() }, { operation_key: v2.createInternalId() }, { executor_actor_id: f.reviewer.id },
      { context_digest: digest("forged") }, { resource: "src/other.ts" }, { resource: "src/**" }, { resource: "../src/query.ts" }, { action: "edit_files" }, { action: "run_checks" }]) {
      expect(f.kernel.assessRunTool({ ...f.request, ...fields })).toMatchObject({ decision: "DENY", authority: null });
    }
    expect(new CimiLoopKernel({ store: f.store, now: () => flowTime }).assessRunTool(f.request)).toMatchObject({ decision: "DENY" });
    expect(f.reviewerKernel.assessRunTool(f.request)).toMatchObject({ decision: "DENY" });
    expect(f.kernel.assessRunTool({ ...f.request, allow: true })).toMatchObject({ code: "PROTOCOL_VALIDATION_FAILED" });
  });
  it.each(["cancel", "revoke", "elapsed", "pause", "assignment"])("rechecks live native facts after %s", change => {
    const f = setup(); expect(f.kernel.assessRunTool(f.request)).toMatchObject({ decision: "ALLOW" });
    if (change === "cancel") flowSuccess(f.kernel.execute(f.command("CancelRun", "run", f.run.id, { reason: "停止公开工具测试" })));
    if (change === "revoke") flowSuccess(f.kernel.execute(f.command("RevokeWorkItem", "work_item", f.item.id, { reason: "撤销公开工具授权" }, "technical_owner")));
    if (change === "elapsed") f.setTime(new Date(Date.parse(flowTime) + 60000).toISOString());
    if (change === "pause") flowSuccess(f.kernel.execute({ ...f.context("change_owner"), command_type: "PauseChange", target: { object_type: "change", id: f.change.id }, expected_revision: f.store.getChange(f.change.id)!.revision, payload: { reason: "暂停公开工具测试" } }));
    if (change === "assignment") { const assignment = f.store.listAssignments(f.actor.id).find(item => item.role_key === "technical_owner")!;
      flowSuccess(f.kernel.execute(f.projectCommand("EndAssignment", { assignment_id: assignment.id, expected_assignment_revision: assignment.revision, reason: "结束公开工具授权责任" }))); }
    expect(f.kernel.assessRunTool(f.request)).toMatchObject({ decision: "DENY", authority: null });
  });
  it.each(["expiry", "revocation"])("rechecks standing authorization %s", change => {
    const f = setup(false, true); expect(f.kernel.assessRunTool(f.request)).toMatchObject({ decision: "ALLOW" });
    if (change === "expiry") f.setTime(new Date(Date.parse(flowTime) + 30000).toISOString());
    else flowSuccess(f.kernel.execute({ ...f.context("policy_owner"), command_type: "RevokeStandingAuthorization", target: { object_type: "standing_authorization", id: f.authorization!.id }, expected_revision: f.authorization!.revision, payload: { reason: "撤销公开常规授权" } }));
    expect(f.kernel.assessRunTool(f.request)).toMatchObject({ decision: "DENY" });
  });
  it("denies tools after the native Run settles, without turning tool receipts into Run observations", () => {
    const f = setup(); flowSuccess(f.observe(f.run, "succeeded")); expect(f.kernel.assessRunTool(f.request)).toMatchObject({ decision: "DENY" });
  });
  it("executes one public fixture write with a live WorkItem binding, then denies replay after revocation", async () => {
    const f = setup(true), file = PublicToolFileFixture.create(); files.push(file.root);
    const input: ToolInvocation = { format: "cimiloop/public-tool-invocation/1.0.0", project_id: f.project.id, run_id: f.run.id, operation_key: f.record.operation_key, executor_actor_id: f.actor.id,
      context_digest: f.prepared.context.input_digest, call_id: "native_public_write", tool: "replace_file", path: "src/query.ts", expected_digest: digest(readFileSync(join(file.root, "public.txt"))).value, replacement_utf8: "public native-bound effect\n" };
    const journal = new ToolJournal(join(file.root, "tool.sqlite"), { format: "cimiloop/public-tool-journal/1.0.0", scope: "public_tool_rehearsal", project_id: f.project.id, fixture_scope_digest: file.scopeDigest, maximum_entries: 8, maximum_bytes: 8 * TOOL_SLOT_BYTES }, { identity: fixtureIdentity });
    const host = new PublicToolHost({ journal, fixture: file, assess: request => f.kernel.assessRunTool(request) });
    const sequence = f.store.asOfEventSequence(), before = f.task();
    try { const first = await host.execute(input); expect((await host.execute(input)).receipt).toEqual(first.receipt);
      expect(readFileSync(join(file.root, "public.txt"), "utf8")).toBe(input.replacement_utf8); expect(f.task()).toEqual(before); expect(f.store.asOfEventSequence()).toBe(sequence);
      flowSuccess(f.kernel.execute(f.command("RevokeWorkItem", "work_item", f.item.id, { reason: "禁止公开结果再次发布" }, "technical_owner")));
      await expect(host.execute(input)).rejects.toThrow("tool_authority_denied"); expect(journal.snapshot()).toMatchObject({ completed: 1, unknown: 0 }); }
    finally { await host.close(); }
  });
});

describe.runIf(process.platform === "win32" && process.arch === "x64")("tool journal with actual native-bound Windows host exits", () => {
  let launcher: string, buildRoot: string;
  beforeAll(async () => { buildRoot = mkdtempSync(join(tmpdir(), "cimiloop-tool-native-launcher-")); launcher = await buildWindowsLauncher(buildRoot); }, 60000);
  // Keep the launcher alive across afterEach cleanup; remove only this owned root.
  afterAll(() => { if (!resolve(buildRoot).startsWith(resolve(tmpdir()) + sep + "cimiloop-tool-native-launcher-")) throw Error("bad cleanup"); rmSync(buildRoot, { recursive: true, force: true }); });
  const execute = promisify(execFile), worker = fileURLToPath(new URL("../../runtime-adapter/test/tool-host-worker.mjs", import.meta.url));
  it.each(["reserved_committed", "effect_completed", "completion_committed", "before_completion_update"] as const)("recovers a real exit at %s and never repeats the write", async crashAt => {
    const f = setup(true), file = PublicToolFileFixture.create(); files.push(file.root);
    const request: ToolInvocation = { format: "cimiloop/public-tool-invocation/1.0.0", project_id: f.project.id, run_id: f.run.id, operation_key: f.record.operation_key, executor_actor_id: f.actor.id,
      context_digest: f.prepared.context.input_digest, call_id: "actual_exit", tool: "replace_file", path: "src/query.ts", expected_digest: digest(readFileSync(join(file.root, "public.txt"))).value, replacement_utf8: "public actual crash effect\n" };
    const policy = { format: "cimiloop/public-tool-journal/1.0.0" as const, scope: "public_tool_rehearsal" as const, project_id: f.project.id, fixture_scope_digest: file.scopeDigest, maximum_entries: 8, maximum_bytes: 8 * TOOL_SLOT_BYTES };
    const path = join(file.root, "tool.sqlite"), dependencies = await creditHostDependencies(launcher);
    const initial = new ToolJournal(path, policy, dependencies); initial.close(); const sequence = f.store.asOfEventSequence();
    await expect(execute(process.execPath, [worker, path, JSON.stringify(policy), launcher, f.path, JSON.stringify(f.caller), file.root, JSON.stringify(request), crashAt], { windowsHide: true, timeout: 25000 })).rejects.toMatchObject({ code: 73 });
    const journal = new ToolJournal(path, policy, dependencies), host = new PublicToolHost({ journal, fixture: file, assess: req => f.kernel.assessRunTool(req) });
    try {
      let recovered = await journal.reconcileOwners(); const deadline = Date.now() + 10000;
      while (recovered.unknown_owners && Date.now() < deadline) { await delay(100); recovered = await journal.reconcileOwners(); }
      if (crashAt === "completion_committed") { expect((await host.execute(request)).replay).toBe(true); expect(journal.snapshot()).toMatchObject({ completed: 1 }); }
      else { expect(recovered.reconciled).toBe(1); expect(journal.snapshot()).toMatchObject(crashAt === "reserved_committed" ? { not_started: 1 } : { unknown: 1 });
        await expect(host.execute(request)).rejects.toThrow(crashAt === "reserved_committed" ? "tool_not_started" : "tool_outcome_unproven"); }
      expect(readFileSync(join(file.root, "public.txt"), "utf8")).toBe(crashAt === "reserved_committed" ? "public CimiLoop tool fixture\n" : request.replacement_utf8);
      expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.store.getRun(f.run.id)?.status).toBe("Reserved");
    } finally { await host.close(); }
  });
  it("allows exactly one write when independent hosts race for one durable slot", async () => {
    const f = setup(true), file = PublicToolFileFixture.create(); files.push(file.root);
    const request: ToolInvocation = { format: "cimiloop/public-tool-invocation/1.0.0", project_id: f.project.id, run_id: f.run.id, operation_key: f.record.operation_key, executor_actor_id: f.actor.id,
      context_digest: f.prepared.context.input_digest, call_id: "race_owner", tool: "replace_file", path: "src/query.ts", expected_digest: digest(readFileSync(join(file.root, "public.txt"))).value, replacement_utf8: "public race winner\n" };
    const policy = { format: "cimiloop/public-tool-journal/1.0.0" as const, scope: "public_tool_rehearsal" as const, project_id: f.project.id, fixture_scope_digest: file.scopeDigest, maximum_entries: 1, maximum_bytes: TOOL_SLOT_BYTES };
    const path = join(file.root, "tool.sqlite"), dependencies = await creditHostDependencies(launcher), initial = new ToolJournal(path, policy, dependencies); initial.close();
    const args = [worker, path, JSON.stringify(policy), launcher, f.path, JSON.stringify(f.caller), file.root];
    const owner = execute(process.execPath, [...args, JSON.stringify(request), "race_owner"], { windowsHide: true, timeout: 25000 });
    // Attach a rejection handler immediately; the owned child exits on its own
    // bounded barrier deadline if the test cannot reach the contender.
    void owner.catch(() => {});
    const deadline = Date.now() + 15000;
    while (!existsSync(join(file.root, "race-reserved.txt"))) { if (Date.now() >= deadline) throw Error("reservation barrier not reached"); await delay(25); }
    const contender = { ...request, call_id: "race_contender", replacement_utf8: "public losing effect\n" };
    const loser = await execute(process.execPath, [...args, JSON.stringify(contender), "race_contender"], { windowsHide: true, timeout: 25000 });
    expect(JSON.parse(loser.stdout)).toEqual({ state: "tool_journal_capacity_exhausted" }); expect(JSON.parse((await owner).stdout)).toEqual({ state: "completed", replay: false });
    const journal = new ToolJournal(path, policy, dependencies); try { expect(journal.snapshot()).toEqual({ reserved: 0, executing: 0, completed: 1, unknown: 0, not_started: 0 }); } finally { journal.close(); }
    expect(readFileSync(join(file.root, "public.txt"), "utf8")).toBe(request.replacement_utf8);
  });
});
