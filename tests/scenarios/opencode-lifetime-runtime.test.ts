import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { LocalAgentWorkspaceToolService } from "../../packages/local-app/src/index.js";
import { parseAgentWorkspaceToolScope, readWorkspaceToolRunFacts, runOpenCodeWorkspaceToolRehearsal } from "../../packages/runtime-adapter/src/index.js";
import { buildWindowsAgentWorkspaceSandbox, buildWindowsLauncher, pinBinary } from "../../packages/runtime-adapter/src/native.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
import { flowTime } from "../fixtures/flow-project.js";
vi.setConfig({ testTimeout: 120000 });

// Actual OS controller, SDK, file/check hosts and cancellation. Provider/full
// custody admission and model replies remain explicit constructed fixtures.
describe.runIf(process.platform === "win32" && process.arch === "x64")("original Runtime lifetime covers preparation and nested checks", () => {
  const roots: string[] = [], stores: { close(): void }[] = [], closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    while (closers.length) await closers.pop()!(); while (stores.length) stores.pop()!.close();
    while (roots.length) {
      const root = roots.pop()!;
      if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-lifetime-")) throw Error("Unsafe lifetime cleanup");
      const data = join(root, ".git", "cimiloop"), operations = join(data, "workspace-tool-rehearsals"), checks = join(data, "workspace-checks");
      if (existsSync(operations)) for (const name of readdirSync(operations)) {
        const proof = join(operations, name, "agent-sandbox-cleanup.json");
        if (!existsSync(proof) || JSON.parse(readFileSync(proof, "utf8")).resources_disposed !== true) throw Error("Retain original Runtime resources: " + proof);
      }
      if (existsSync(checks)) for (const project of readdirSync(checks)) for (const name of readdirSync(join(checks, project))) {
        if (!/^[a-f0-9]{64}$/.test(name)) continue;
        const proof = join(checks, project, name, "native-ownership.json");
        if (existsSync(proof) && JSON.parse(readFileSync(proof, "utf8")).resources_disposed !== true) throw Error("Retain original check resources: " + proof);
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-lifetime-")); roots.push(root);
    const f = createAgentRunProject(root, "task_execution", 100, [{ provider: "cimiloop_workspace", resource_type: "repository_path", locator: "src/**", version: "1.0.0" }], ["read_files", "edit_files", "run_checks"], ["src/**"], ["src/**"]); stores.push(f.store);
    f.runPort.agent.checkToolAuthority = (project, input) => contentDigest({ constructed: true, project_id: project.id, request: input.request });
    const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, runVerifier: f.runPort });
    const prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared), dataDirectory = dirname(f.path);
    const scope = parseAgentWorkspaceToolScope({ project_id: f.project.id, run_id: reserved.run.id, operation_key: reserved.record.operation_key, executor_actor_id: f.agent.id,
      context_digest: prepared.context.input_digest, ...f.pins, host_admission_ref: prepared.context.host_admission_ref });
    const binary = join(process.env.APPDATA!, "npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe");
    expect(digest(readFileSync(binary)).value).toBe("5283c2cd5b4285855daa97e6f7d17bf48146227cdf2a940e79e0f2b7869fd06e");
    const options = { root: dataDirectory, binary, scope, path: "src/query.ts", expectedDigest: digest(readFileSync(join(root, "src/query.ts"))).value, replacement: "export const query = () => 7;\n" };
    return { ...f, root, kernel, reserved, dataDirectory, scope, options };
  }
  function unchanged(f: ReturnType<typeof setup>, sequence: number, usage: unknown) {
    expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
    expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved");
    expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe("export const query = () => 1;\n");
  }
  function incomplete(f: ReturnType<typeof setup>) {
    const parent = join(f.dataDirectory, "workspace-tool-rehearsals"), names = readdirSync(parent); expect(names).toHaveLength(1);
    const operation = join(parent, names[0]!);
    expect(existsSync(join(operation, "result.json"))).toBe(false);
    expect(JSON.parse(readFileSync(join(operation, "agent-sandbox-cleanup.json"), "utf8"))).toMatchObject({ resources_disposed: true, cleanup_errors: [] });
    return { operation, record: JSON.parse(readFileSync(join(operation, "incomplete.json"), "utf8")) };
  }
  it("refuses a pre-cancelled operation before allocating Runtime resources", async () => {
    const f = setup(), external = new AbortController(), sequence = f.store.asOfEventSequence(), usage = f.task().usage; external.abort();
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, signal: external.signal, connect: async () => { throw Error("Must not connect"); } })).rejects.toThrow("workspace_rehearsal_aborted");
    expect(existsSync(join(f.dataDirectory, "workspace-tool-rehearsals"))).toBe(false); unchanged(f, sequence, usage);
  });
  it("cancels an uncooperative preparation callback and disposes the original mapped resources", async () => {
    const f = setup(), external = new AbortController(), sequence = f.store.asOfEventSequence(), usage = f.task().usage;
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, signal: external.signal, connect: async () => { throw Error("Must not connect"); },
      prepare: (original, signal) => { if (original.phase !== "mapped") return; expect(signal.aborted).toBe(false); external.abort(); return new Promise<void>(() => {}); }
    })).rejects.toThrow("workspace_rehearsal_aborted");
    expect(incomplete(f).record).toMatchObject({ suspended_observed: false, interruption_reason: "workspace_rehearsal_aborted", completion_proven: false });
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record).invocations).toBe(0); unchanged(f, sequence, usage);
  });
  it("applies the original deadline to preparation without renewing it at Runtime resume", async () => {
    const f = setup(); await buildWindowsAgentWorkspaceSandbox(f.dataDirectory); await buildWindowsLauncher(f.dataDirectory); pinBinary(f.dataDirectory, f.options.binary);
    let mapped = false; const started = performance.now();
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, maxElapsedMs: 7000, connect: async () => { throw Error("Must not connect"); },
      prepare: original => { if (original.phase !== "mapped") return; mapped = true; return new Promise<void>(() => {}); }
    })).rejects.toThrow("workspace_rehearsal_deadline");
    expect(mapped).toBe(true); expect(performance.now() - started).toBeLessThan(13000);
    expect(incomplete(f).record).toMatchObject({ suspended_observed: false, interruption_reason: "workspace_rehearsal_deadline", completion_proven: false });
  });
  it("stops waiting on a hung IPC installation while preserving the suspended original Runtime", async () => {
    const f = setup(), external = new AbortController(), sequence = f.store.asOfEventSequence(), usage = f.task().usage;
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, signal: external.signal, connect: (_supervisor, _originalSupervisor, _peer, _nonce, signal) => {
      expect(signal.aborted).toBe(false); external.abort(); return new Promise<never>(() => {});
    } })).rejects.toThrow("workspace_rehearsal_aborted");
    expect(incomplete(f).record).toMatchObject({ suspended_observed: true, interruption_reason: "workspace_rehearsal_aborted", completion_proven: false });
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record).invocations).toBe(0); unchanged(f, sequence, usage);
  });
  it("cancels an actually started nested Node check through the same original signal", async () => {
    const f = setup(), external = new AbortController(), sequence = f.store.asOfEventSequence(), usage = f.task().usage;
    const test = "import test from 'node:test'; test('wait for original stop',async()=>{await new Promise(resolve=>setTimeout(resolve,25000));});\n";
    writeFileSync(join(f.root, "src/check.mjs"), test);
    const service = await LocalAgentWorkspaceToolService.open({ caller: f.caller, store: f.store, kernel: f.kernel, location: { repositoryKind: "git", repositoryPath: f.root,
      dataDirectory: f.dataDirectory, databasePath: f.path, instancePath: join(f.dataDirectory, "instance.json"), suggestedName: "Constructed admission; actual nested stop" } }, f.reserved.run.id);
    closers.push(() => service.close());
    await service.installChecks(process.execPath, [{ check_id: "waiting", profile: "node_test", entry: "src/check.mjs", inputs: [{ path: "src/check.mjs", expected_digest: digest(test).value }], max_elapsed_ms: 30000, max_output_bytes: 32768 }]);
    const checkCatalog = await service.getCheckCatalog(), checks = join(f.dataDirectory, "workspace-checks", f.project.id);
    let startedCheck = "";
    const watcher = setInterval(() => {
      for (const name of readdirSync(checks)) {
        if (!/^[a-f0-9]{64}$/.test(name)) continue;
        const operation = join(checks, name), ownership = join(operation, "native-ownership.json");
        if (existsSync(ownership) && JSON.parse(readFileSync(ownership, "utf8")).runtime_identity) { startedCheck = operation; external.abort(); }
      }
    }, 50);
    try {
      await expect(runOpenCodeWorkspaceToolRehearsal({ root: f.dataDirectory, binary: f.options.binary, scope: f.scope, mode: "checks", checkCatalog, checkId: "waiting", signal: external.signal, maxElapsedMs: 60000,
        connect: (supervisor, originalSupervisor, peer, nonce, signal) => service.openIpc(supervisor, originalSupervisor, peer, { nonce, signal }) })).rejects.toThrow("workspace_rehearsal_aborted");
    } finally { clearInterval(watcher); await service.close(); }
    expect(startedCheck).not.toBe("");
    expect(JSON.parse(readFileSync(join(startedCheck, "native-ownership.json"), "utf8"))).toMatchObject({ resources_disposed: true });
    expect(JSON.parse(readFileSync(join(startedCheck, "receipt.json"), "utf8")).receipt).toMatchObject({ outcome: "failed", reason: "cancelled" });
    expect(incomplete(f).record).toMatchObject({ suspended_observed: true, interruption_reason: "workspace_rehearsal_aborted", completion_proven: false });
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 1, unresolved: 0, has_effect: true }); unchanged(f, sequence, usage);
  });
  it("returns when the original native controller ends during an uncooperative IPC installation", async () => {
    const f = setup(), sequence = f.store.asOfEventSequence(), usage = f.task().usage;
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, connect: supervisor => { supervisor.stdin!.end(); return new Promise<never>(() => {}); } })).rejects.toThrow("workspace_rehearsal_ended_before_resume");
    expect(incomplete(f).record).toMatchObject({ suspended_observed: true, interruption_reason: "workspace_rehearsal_ended_before_resume", completion_proven: false });
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record).invocations).toBe(0); unchanged(f, sequence, usage);
  });
});
