import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
import { flowSuccess, flowTime } from "../fixtures/flow-project.js";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { LocalAgentWorkspaceToolService, type AgentWorkspaceToolLocalContext } from "../../packages/local-app/src/index.js";
import { openAgentWorkspaceToolHost, parseAgentWorkspaceToolScope, readWorkspaceToolRunFacts, type WorkspaceToolInvocation } from "../../packages/runtime-adapter/src/index.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { createInternalId } from "../../packages/protocol/src/v2/index.js";
vi.setConfig({ testTimeout: 60000 });

// Actual Native Git/Windows file effects and original process recovery, with
// constructed controlled ALLOW/live host proof. No real model/fees/qualification.
describe.runIf(process.platform === "win32" && process.arch === "x64")("actual Agent workspace effects with independent Native authority", () => {
  const roots: string[] = [], stores: { close(): void }[] = [];
  afterEach(() => { while (stores.length) stores.pop()!.close(); while (roots.length) { const root = roots.pop()!;
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-agent-workspace-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); } });
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-agent-workspace-")); roots.push(root); const f = createAgentRunProject(root, "task_execution", 100, undefined, ["read_files", "edit_files"]); stores.push(f.store);
    const live = { epoch: 1, calls: 0 }; f.runPort.agent.checkToolAuthority = (project, input) => { live.calls++;
      return contentDigest({ constructed: true, project_id: project.id, request: input.request, epoch: live.epoch }); };
    const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, runVerifier: f.runPort }), prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared),
      scope = parseAgentWorkspaceToolScope({ project_id: f.project.id, run_id: reserved.run.id, operation_key: reserved.record.operation_key, executor_actor_id: f.agent.id,
        context_digest: prepared.context.input_digest, ...f.pins, host_admission_ref: prepared.context.host_admission_ref });
    const dataDirectory = dirname(f.path), input: WorkspaceToolInvocation = { format: "cimiloop/workspace-tool-invocation/1.0.0", project_id: f.project.id, run_id: reserved.run.id,
      operation_key: reserved.record.operation_key, executor_actor_id: f.agent.id, context_digest: prepared.context.input_digest, call_id: "agent_write", tool: "replace_file", path: "src/query.ts",
      expected_digest: digest(readFileSync(join(root, "src/query.ts"))).value, replacement_utf8: "export const query = () => 3;\n" };
    const local: AgentWorkspaceToolLocalContext = { store: f.store, caller: f.caller, kernel, location: { repositoryKind: "git", repositoryPath: root, dataDirectory,
      databasePath: f.path, instancePath: join(dataDirectory, "instance.json"), suggestedName: "Constructed Agent fixture" } };
    return { ...f, root, kernel, prepared, reserved, scope, dataDirectory, input, local, live };
  }
  const open = (f: ReturnType<typeof setup>, phase?: Parameters<typeof openAgentWorkspaceToolHost>[0]["phase"]) => openAgentWorkspaceToolHost({ repositoryPath: f.root,
    dataDirectory: f.dataDirectory, scope: f.scope, assess: request => f.kernel.assessAgentRunTool(request), ...(phase ? { phase } : {}) });
  it("reads, edits and replays actual files through the original Agent Caller without changing Native Run/events/usage", async () => {
    const f = setup(), service = await LocalAgentWorkspaceToolService.open(f.local, f.reserved.run.id), sequence = f.store.asOfEventSequence(), usage = f.task().usage;
    try {
      const { replacement_utf8: _replacement, ...readInput } = f.input;
      const read = await service.execute({ ...readInput, tool: "read_file", call_id: "agent_read" }); expect(read.receipt.native.text).toBe(readFileSync(join(f.root, f.input.path), "utf8"));
      const write = await service.execute(f.input); expect(write.receipt.native.after_digest).toBe(digest(f.input.replacement_utf8!).value);
      expect(execFileSync("git", ["-C", f.root, "diff", "--", f.input.path], { encoding: "utf8", windowsHide: true })).toContain("+export const query = () => 3;");
      expect(await service.execute(f.input)).toEqual({ ...write, replay: true }); expect(write.receipt.formal_agent_execution_enabled).toBe(false);
      expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 2, unresolved: 0, has_effect: true });
      expect(f.task().usage).toEqual(usage); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved");
      await expect(service.execute({ ...f.input, replacement_utf8: "changed same call" })).rejects.toThrow("workspace_tool_call_conflict");
      flowSuccess(f.agentObserve(f.reserved.run, "succeeded")); await expect(service.execute(f.input)).rejects.toThrow("tool_authority_denied");
    } finally { await service.close(); }
  });
  it("cannot use a default/unproven Agent port or the Human Kernel to grant one effect", async () => {
    const f = setup(); delete f.runPort.agent.checkToolAuthority;
    for (const kernel of [f.kernel, f.humanKernel]) {
      const service = await LocalAgentWorkspaceToolService.open({ ...f.local, kernel }, f.reserved.run.id), before = readFileSync(join(f.root, f.input.path)), sequence = f.store.asOfEventSequence(), usage = f.task().usage;
      try { await expect(service.execute(f.input)).rejects.toThrow("tool_authority_denied"); expect(readFileSync(join(f.root, f.input.path))).toEqual(before);
        expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 0, unresolved: 0, has_effect: false });
        expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
      } finally { await service.close(); }
    }
  });
  it("binds service identity and rejects Runtime-selected scope, caller, proof or foreign original invocation", async () => {
    const f = setup(); await expect(LocalAgentWorkspaceToolService.open({ ...f.local, caller: { ...f.caller, actor_id: f.actor.id } }, f.reserved.run.id)).rejects.toThrow("Agent workspace original identity mismatch");
    const service = await LocalAgentWorkspaceToolService.open(f.local, f.reserved.run.id);
    try { for (const fields of [{ run_id: createInternalId() }, { executor_actor_id: f.actor.id }, { operation_key: createInternalId() }, { context_digest: digest("foreign") },
      { runtime_binding: f.pins.runtime_binding }, { caller: f.caller }, { verified: true }]) await expect(Promise.resolve().then(() => service.execute({ ...f.input, ...fields }))).rejects.toThrow();
      expect(f.live.calls).toBe(0); expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record).invocations).toBe(0);
    } finally { await service.close(); }
  });
  it.each(["native_prepared", "dispatch_committed"] as const)("rechecks actual current authority after revocation at %s and preserves the original outcome", async phase => {
    const f = setup(), before = readFileSync(join(f.root, f.input.path)), execution = await open(f, current => { if (current === phase)
      flowSuccess(f.humanKernel.execute(f.humanCommand("RevokeWorkItem", "work_item", f.item.id, { reason: "Revoke during actual Agent file operation" }, "technical_owner"))); });
    try { await expect(execution.host.execute(f.input)).rejects.toThrow("tool_authority_denied"); expect(readFileSync(join(f.root, f.input.path))).toEqual(before);
      expect(execution.journal.facts().states).toMatchObject(phase === "native_prepared" ? { not_started: 1, unknown: 0 } : { not_started: 0, unknown: 1 });
      if (phase === "dispatch_committed") { const sequence = f.store.asOfEventSequence(), usage = f.task().usage;
        expect(f.agentObserve(f.reserved.run, "succeeded")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" }); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage); }
    } finally { await execution.host.close(); }
  });
  it("rejects changed current host proof before dispatch without rewriting the original call or Native budget", async () => {
    const f = setup(), execution = await open(f, phase => { if (phase === "native_prepared") f.live.epoch++; }), before = readFileSync(join(f.root, f.input.path)), usage = f.task().usage;
    try { await expect(execution.host.execute(f.input)).rejects.toThrow("workspace_tool_authority_changed"); expect(readFileSync(join(f.root, f.input.path))).toEqual(before);
      expect(execution.journal.facts().states.not_started).toBe(1); expect(f.task().usage).toEqual(usage);
    } finally { await execution.host.close(); }
  });
  it.each(["forced_native_prepared", "forced_dispatch"])("recovers actual original Agent owners/staging after %s and keeps parent Run facts", async phase => {
    const f = setup(), worker = fileURLToPath(new URL("../../packages/runtime-adapter/test/agent-workspace-tool-host-worker.mjs", import.meta.url));
    const outcome = await promisify(execFile)(process.execPath, [worker, f.root, f.dataDirectory, f.path, JSON.stringify(f.caller), JSON.stringify(f.scope), JSON.stringify(f.input), phase],
      { windowsHide: true, timeout: 30000 }).then(() => 0, error => error.code);
    expect(outcome).toBe(73); const original = JSON.parse(readFileSync(join(f.dataDirectory, "agent-forced-original.json"), "utf8"));
    const staging = join(dirname(original.preparation.worker.image), "workspace-" + original.preparation.nonce + ".tmp"); expect(existsSync(staging)).toBe(true);
    const service = await LocalAgentWorkspaceToolService.open(f.local, f.reserved.run.id), usage = f.task().usage, sequence = f.store.asOfEventSequence();
    try { let recovered = await service.recover(), reconciled = recovered.owners.reconciled, removed = recovered.resources.removed; const deadline = Date.now() + 10000;
      while (existsSync(staging) && Date.now() < deadline) { await delay(25); recovered = await service.recover(); reconciled += recovered.owners.reconciled; removed += recovered.resources.removed; }
      expect(reconciled).toBe(1); expect(removed).toBe(1); expect(existsSync(staging)).toBe(false);
      expect(recovered.owners.active + recovered.owners.unknown_owners + recovered.resources.active + recovered.resources.unknown_owners + recovered.resources.unproven).toBe(0);
      expect((await service.recover()).resources.absent).toBe(1); expect(f.task().usage).toEqual(usage); expect(f.store.asOfEventSequence()).toBe(sequence);
      expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record)).toMatchObject(phase === "forced_native_prepared" ? { unresolved: 0, has_effect: false } : { unresolved: 1, has_effect: true });
      expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved"); await expect(service.execute(f.input)).rejects.toThrow(phase === "forced_native_prepared" ? "workspace_tool_not_started" : "workspace_tool_outcome_unproven");
      expect(readFileSync(join(f.root, f.input.path), "utf8")).toBe("export const query = () => 1;\n");
      if (phase === "forced_dispatch") expect(f.agentObserve(f.reserved.run, "succeeded")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    } finally { await service.close(); }
  });
});
