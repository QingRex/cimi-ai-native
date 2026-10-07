import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRunProject } from "../fixtures/run-project.js";
import { flowSuccess } from "../fixtures/flow-project.js";
import { LocalWorkspaceToolService, type WorkspaceToolLocalContext } from "../../packages/local-app/src/index.js";
import { openWorkspaceToolHost, readWorkspaceToolRunFacts } from "../../packages/runtime-adapter/src/workspace-tool-host.js";
import type { WorkspaceToolInvocation } from "../../packages/runtime-adapter/src/workspace-files.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { createInternalId } from "../../packages/protocol/src/v2/index.js";
vi.setConfig({ testTimeout: 60000 });

describe.runIf(process.platform === "win32" && process.arch === "x64")("actual authorized Git workspace tools and parent Run recovery", () => {
  const roots: string[] = [], stores: { close(): void }[] = [];
  afterEach(() => { while (stores.length) stores.pop()!.close(); while (roots.length) { const root = roots.pop()!;
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-workspace-tools-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); } });
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-workspace-tools-")); roots.push(root); const f = createRunProject(root); stores.push(f.store); const source = f.capture();
    const result = flowSuccess(f.kernel.execute(f.taskCommand("CreateWorkItem", f.task().id, { definition_ref: f.task().definition_ref, executor_ref: { object_type: "actor", id: f.actor.id },
      allowed_actions: ["read_files", "edit_files"], allowed_resources: ["src/query.ts"], budget: { max_attempts: 1, max_elapsed_ms: 60000 }, stop_conditions: ["授权变化即停止"], reason: "真实 Git 工作区工具验证" }, f.actor.id, "technical_owner")));
    if (result.command_type !== "CreateWorkItem") throw Error("Expected WorkItem"); const item = result.data.work_item, prepared = f.prepareContext(item, source), reserved = f.reserve(item, prepared);
    const dataDirectory = dirname(f.path), input: WorkspaceToolInvocation = { format: "cimiloop/workspace-tool-invocation/1.0.0", project_id: f.project.id, run_id: reserved.run.id,
      operation_key: reserved.record.operation_key, executor_actor_id: f.actor.id, context_digest: prepared.context.input_digest, call_id: "actual_write", tool: "replace_file", path: "src/query.ts",
      expected_digest: digest(readFileSync(join(root, "src/query.ts"))).value, replacement_utf8: "export const query = () => 2;\n" };
    const local: WorkspaceToolLocalContext = { store: f.store, kernel: f.kernel, instance: { schema_version: "1.0.0", instance_id: f.project.instance_id, project_id: f.project.id, actor_id: f.actor.id, created_at: f.project.created_at },
      location: { repositoryKind: "git", repositoryPath: root, dataDirectory, databasePath: f.path, instancePath: join(dataDirectory, "instance.json"), suggestedName: "Fixture" } };
    return { ...f, root, dataDirectory, input, local, item, prepared, run: reserved.run, record: reserved.record };
  }
  const open = (f: ReturnType<typeof setup>, phase?: Parameters<typeof openWorkspaceToolHost>[0]["phase"]) => openWorkspaceToolHost({ repositoryPath: f.root, dataDirectory: f.dataDirectory,
    projectId: f.project.id, assess: request => f.kernel.assessRunTool(request), ...(phase ? { phase } : {}) });
  it("reads/edits the actual authorized worktree, persists file/process identity, and only then allows Human Run settlement", async () => {
    const f = setup(), service = await LocalWorkspaceToolService.open(f.local), sequence = f.store.asOfEventSequence();
    try { const result = await service.execute(f.input); expect(result.receipt).toMatchObject({ scope: "authorized_workspace", native: { phase: "completed", after_digest: digest(f.input.replacement_utf8!).value }, formal_agent_execution_enabled: false });
      expect(execFileSync("git", ["-C", f.root, "diff", "--", "src/query.ts"], { encoding: "utf8", windowsHide: true })).toContain("+export const query = () => 2;");
      expect(await service.execute(f.input)).toEqual({ ...result, replay: true }); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.store.getRun(f.run.id)!.status).toBe("Reserved");
      expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.record)).toEqual({ invocations: 1, unresolved: 0, has_effect: true });
      expect(f.reconcile(f.run, "not_started")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
      flowSuccess(f.observe(f.run, "succeeded")); expect(f.store.getRun(f.run.id)!.status).toBe("Succeeded");
      await expect(service.execute(f.input)).rejects.toThrow("tool_authority_denied");
    } finally { await service.close(); }
  });
  it.each(["native_prepared", "dispatch_committed"] as const)("revokes original WorkItem at %s before a write can be committed", async phase => {
    const f = setup(), execution = await open(f, current => { if (current === phase) flowSuccess(f.kernel.execute(f.command("RevokeWorkItem", "work_item", f.item.id, { reason: "停止真实工具" }, "technical_owner"))); });
    try { await expect(execution.host.execute(f.input)).rejects.toThrow("tool_authority_denied"); expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe("export const query = () => 1;\n");
      expect(execution.journal.facts(f.run.id)).toMatchObject(phase === "native_prepared" ? { unresolved: 0, has_effect: false, states: { not_started: 1 } } : { unresolved: 1, has_effect: true, states: { unknown: 1 } });
    } finally { await execution.host.close(); }
  });
  it("blocks successful/reconciled parent reports while tool effects are Unknown, with no event or counter changes on denial", async () => {
    const f = setup(), execution = await open(f, phase => { if (phase === "effect_completed") throw Error("lost native completion before journal commit"); });
    try { await expect(execution.host.execute(f.input)).rejects.toThrow("lost native completion"); expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe(f.input.replacement_utf8);
      const sequence = f.store.asOfEventSequence(), usage = f.task().usage;
      for (const status of ["succeeded", "failed", "cancelled"] as const) expect(f.observe(f.run, status)).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
      expect(f.reconcile(f.run, "succeeded")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" }); expect(f.task().usage).toEqual(usage); expect(f.store.asOfEventSequence()).toBe(sequence);
      flowSuccess(f.observe(f.run, "unknown")); expect(f.store.getRun(f.run.id)!.status).toBe("Unknown");
      await expect(execution.host.execute({ ...f.input, call_id: "new_key", expected_digest: digest(f.input.replacement_utf8!).value })).rejects.toThrow("tool_authority_denied");
    } finally { await execution.host.close(); }
  });
  it("rejects missing established journals and corrupt original preparation instead of treating them as no effects", async () => {
    const f = setup(), execution = await open(f); await execution.host.execute(f.input); await execution.host.close();
    const file = join(f.dataDirectory, "workspace-tools", f.project.id + ".sqlite"), moved = file + ".saved"; renameSync(file, moved);
    expect(f.observe(f.run, "succeeded")).toMatchObject({ code: "EVIDENCE_MISSING" }); renameSync(moved, file);
    const db = new DatabaseSync(file); try { expect(() => db.prepare("UPDATE workspace_tool_calls SET input='{}'").run()).toThrow("workspace_tool_immutable");
      db.exec("DROP TRIGGER workspace_tool_input_immutable"); expect(f.observe(f.run, "succeeded")).toMatchObject({ code: "EVIDENCE_MISSING" });
    } finally { db.close(); }
  });
  it("reopens the same project journal, refuses a fresh binding or call conflict, and rechecks cached publication permission", async () => {
    const f = setup(), first = await open(f), result = await first.host.execute(f.input); await first.host.close(); const next = await open(f);
    try { expect(await next.host.execute(f.input)).toEqual({ ...result, replay: true });
      await expect(next.host.execute({ ...f.input, replacement_utf8: "conflicting" })).rejects.toThrow("workspace_tool_call_conflict");
      flowSuccess(f.kernel.execute(f.command("RevokeWorkItem", "work_item", f.item.id, { reason: "撤销缓存交付权限" }, "technical_owner")));
      await expect(next.host.execute(f.input)).rejects.toThrow("tool_authority_denied");
    } finally { await next.host.close(); }
  });
  it.each(["reserved_committed", "native_prepared", "dispatch_committed", "effect_completed", "before_completion_update", "completion_committed"])("recovers actual host and native worker identities after exit at %s", async phase => {
    const f = setup(), initial = await open(f); await initial.host.close(); const worker = fileURLToPath(new URL("../../packages/runtime-adapter/test/workspace-tool-host-worker.mjs", import.meta.url));
    await expect(promisify(execFile)(process.execPath, [worker, f.root, f.dataDirectory, f.path, JSON.stringify(f.caller), JSON.stringify(f.input), phase], { windowsHide: true, timeout: 30000 })).rejects.toMatchObject({ code: 73 });
    const execution = await open(f);
    try { if (phase === "completion_committed") { expect((await execution.host.execute(f.input)).replay).toBe(true); expect(execution.journal.facts(f.run.id)).toMatchObject({ unresolved: 0, states: { completed: 1 } }); }
      else {
        let recovery = await execution.journal.reconcileOwners(), total = recovery.reconciled; const deadline = Date.now() + 10000;
        while ((recovery.active || recovery.unknown_owners) && Date.now() < deadline) { await delay(100); recovery = await execution.journal.reconcileOwners(); total += recovery.reconciled; }
        expect(total).toBe(1); expect(recovery.active + recovery.unknown_owners).toBe(0);
        const notStarted = ["reserved_committed", "native_prepared"].includes(phase);
        expect(execution.journal.facts(f.run.id)).toMatchObject({ unresolved: notStarted ? 0 : 1, states: { [notStarted ? "not_started" : "unknown"]: 1 } });
        await expect(execution.host.execute(f.input)).rejects.toThrow(notStarted ? "workspace_tool_not_started" : "workspace_tool_outcome_unproven");
        if (!notStarted) expect(f.reconcile(f.run, "succeeded")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
      }
      expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe(["effect_completed", "before_completion_update", "completion_committed"].includes(phase) ? f.input.replacement_utf8 : "export const query = () => 1;\n");
    } finally { await execution.host.close(); }
  });
  it("serializes two actual hosts before either can write the same native file", async () => {
    const f = setup(), init = await open(f); await init.host.close(); const worker = fileURLToPath(new URL("../../packages/runtime-adapter/test/workspace-tool-host-worker.mjs", import.meta.url)), args = [worker, f.root, f.dataDirectory, f.path, JSON.stringify(f.caller)];
    const owner = promisify(execFile)(process.execPath, [...args, JSON.stringify(f.input), "race_owner"], { windowsHide: true, timeout: 30000 }); void owner.catch(() => {});
    try { const deadline = Date.now() + 15000; while (!existsSync(join(f.dataDirectory, "race-reserved.txt"))) { if (Date.now() >= deadline) throw Error("No owned barrier"); await delay(25); }
      const contender = await promisify(execFile)(process.execPath, [...args, JSON.stringify({ ...f.input, call_id: "loser", replacement_utf8: "losing effect" }), "race_contender"], { windowsHide: true, timeout: 30000 });
      expect(JSON.parse(contender.stdout)).toEqual({ state: "workspace_tool_effect_in_flight" }); writeFileSync(join(f.dataDirectory, "race-release.txt"), "release");
      expect(JSON.parse((await owner).stdout)).toEqual({ state: "completed", replay: false }); expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe(f.input.replacement_utf8);
    } finally { if (!existsSync(join(f.dataDirectory, "race-release.txt"))) writeFileSync(join(f.dataDirectory, "race-release.txt"), "release"); await owner.catch(() => {}); }
  });
  it("requires original local Human executor identity; a foreign operation or imported flag cannot grant effects", async () => {
    const f = setup(), service = await LocalWorkspaceToolService.open(f.local);
    try { for (const fields of [{ executor_actor_id: f.reviewer.id }, { operation_key: createInternalId() }, { formal_agent_execution_enabled: true }]) expect(() => service.execute({ ...f.input, ...fields })).toThrow();
      expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe("export const query = () => 1;\n");
    } finally { await service.close(); }
  });
});
