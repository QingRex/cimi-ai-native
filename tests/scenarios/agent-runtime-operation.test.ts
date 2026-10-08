import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalAgentRuntimeOperations, LocalAgentWorkspaceToolService } from "../../packages/local-app/src/index.js";
import { AgentWorkspaceToolIpc, RuntimeAdapterError, runOpenCodeWorkspaceToolRehearsal, parseAgentWorkspaceToolScope } from "../../packages/runtime-adapter/src/index.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { buildWindowsLauncher } from "../../packages/runtime-adapter/src/native.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
vi.setConfig({ testTimeout: 120000 });

// Native Run facts and actual OS/SDK effects. Controlled qualification and model
// responses remain constructed; no formal Agent/model admission is asserted.
describe.runIf(process.platform === "win32" && process.arch === "x64")("original Runtime lifecycle uses the native Run operation key", () => {
  const roots: string[] = [], stores: { close(): void }[] = [], closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    while (closers.length) await closers.pop()!(); while (stores.length) stores.pop()!.close();
    while (roots.length) {
      const root = roots.pop()!; if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-original-runtime-")) throw Error("Unsafe cleanup");
      const operations = join(root, ".git/cimiloop/workspace-tool-rehearsals");
      if (existsSync(operations)) for (const name of readdirSync(operations)) {
        const proof = join(operations, name, "agent-sandbox-cleanup.json");
        if (!existsSync(proof) || JSON.parse(readFileSync(proof, "utf8")).resources_disposed !== true) throw Error("Retain original resources: " + proof);
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
  async function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-original-runtime-")); roots.push(root);
    const f = createAgentRunProject(root, "task_execution", 100, undefined, ["read_files", "edit_files"]); stores.push(f.store);
    f.runPort.agent.checkToolAuthority = (project, input) => contentDigest({ constructed: true, project_id: project.id, request: input.request });
    const prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared), dataDirectory = dirname(f.path);
    const scope = parseAgentWorkspaceToolScope({ project_id: f.project.id, run_id: reserved.run.id, operation_key: reserved.record.operation_key,
      executor_actor_id: f.agent.id, context_digest: prepared.context.input_digest, ...f.pins, host_admission_ref: prepared.context.host_admission_ref });
    const local = { caller: f.caller, store: f.store, kernel: f.kernel, location: { repositoryKind: "git" as const, repositoryPath: root, dataDirectory,
      databasePath: f.path, instancePath: join(dataDirectory, "instance.json"), suggestedName: "Original lifecycle, constructed qualification" } };
    const service = await LocalAgentWorkspaceToolService.open(local, reserved.run.id); closers.push(() => service.close());
    const control = new LocalAgentRuntimeOperations(local), binary = join(process.env.APPDATA!, "npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe");
    const options = { root: dataDirectory, binary, scope, maxElapsedMs: 60000, path: "src/query.ts", expectedDigest: digest(readFileSync(join(root, "src/query.ts"))).value, replacement: "export const query = () => 7;\n",
      connect: (supervisor: Parameters<typeof service.openIpc>[0], originalSupervisor: Parameters<typeof service.openIpc>[1], peer: Parameters<typeof service.openIpc>[2], nonce: string, signal: AbortSignal) => service.openIpc(supervisor, originalSupervisor, peer, { nonce, signal }) };
    return { ...f, root, dataDirectory, reserved, options, local, control };
  }
  it("collects stopped facts without modifying original records and refuses restarting the same completed Run", async () => {
    const f = await setup(), usage = f.task().usage, sequence = f.store.asOfEventSequence(), result = await runOpenCodeWorkspaceToolRehearsal(f.options);
    const ledgerPath = join(result.operation, "agent-sandbox-resources.json"), before = readFileSync(ledgerPath);
    expect(await f.control.query(f.reserved.run.id)).toMatchObject({ operation: result.operation, status: "Stopped", resources_disposed: true, completion_proven: false });
    expect(readFileSync(ledgerPath)).toEqual(before);
    const collected = await f.control.collect(f.reserved.run.id);
    expect(collected).toMatchObject({ domain_observation_produced: false, formal_agent_execution_enabled: false });
    const stdout = collected.artifacts.find(artifact => artifact.name === "stdout.raw")!;
    expect(readFileSync(stdout.reference.locator)).toEqual(readFileSync(join(result.operation, "stdout.raw")));
    await expect(runOpenCodeWorkspaceToolRehearsal(f.options)).rejects.toThrow("agent_runtime_already_claimed");
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, replacement: "different" })).rejects.toThrow("agent_runtime_input_conflict");
    expect(readdirSync(join(f.dataDirectory, "workspace-tool-rehearsals"))).toHaveLength(1);
    expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage); expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved");
  });
  it("refuses a second actual host while the original controller is preparing", async () => {
    const f = await setup(), module = pathToFileURL(resolve("packages/runtime-adapter/dist/agent-runtime-operation.js")).href;
    let otherHost = false;
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, prepare: async original => {
      if (original.phase !== "registered") return;
      const directory = join(f.dataDirectory, "agent-runtime-claims", f.project.id, "runs", f.reserved.run.id), input = JSON.parse(readFileSync(join(directory, "input.json"), "utf8")), claim = JSON.parse(readFileSync(join(directory, "claim.json"), "utf8"));
      const nativeModule = pathToFileURL(resolve("packages/runtime-adapter/dist/native.js")).href, observer = await buildWindowsLauncher(f.dataDirectory);
      const code = `import {claimAgentRuntimeOperation} from ${JSON.stringify(module)}; import {nativeControl} from ${JSON.stringify(nativeModule)}; const i=JSON.parse(process.argv[1]); const owner=(await nativeControl(i.observer,["--identity",String(process.pid)])).value; if(owner.pid===i.owner.pid)throw Error("Not a distinct host"); try{claimAgentRuntimeOperation(i.root,i.scope,i.input,owner);process.exitCode=2;}catch(e){console.log(e.message);}`;
      const child = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", code, JSON.stringify({ root: f.dataDirectory, scope: f.options.scope, input, owner: claim.owner, observer })], { windowsHide: true, timeout: 8000 });
      expect(child.stdout.trim()).toBe("agent_runtime_already_claimed"); otherHost = true;
      expect(f.control.requestCancellation(f.reserved.run.id)).toMatchObject({ requested: true, stopped_proven: false });
      return new Promise<void>(() => {});
    } })).rejects.toThrow("workspace_rehearsal_cancel_requested");
    expect(otherHost).toBe(true); expect(readdirSync(join(f.dataDirectory, "workspace-tool-rehearsals"))).toHaveLength(1);
    expect(await f.control.query(f.reserved.run.id)).toMatchObject({ status: "Stopped", cancellation_requested: true, completion_proven: false });
    expect(await f.control.recover(f.reserved.run.id)).toMatchObject({ outcome: "recovered", resources_disposed: true, completion_proven: false });
  });
  it("queries actual running processes and cancels the original SDK wait without domain completion", async () => {
    const f = await setup(), usage = f.task().usage; let rejectPending: ((error: Error) => void) | undefined;
    let running = false;
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, connect: (supervisor, originalSupervisor, originalPeer, nonce, signal) => AgentWorkspaceToolIpc.open({
      toolsDirectory: f.dataDirectory, scope: f.options.scope, supervisor, originalSupervisor, originalPeer, nonce, signal,
      execute: async () => {
        expect(await f.control.query(f.reserved.run.id)).toMatchObject({ status: "Running", resources_disposed: false, cancellation_requested: false }); running = true;
        f.control.requestCancellation(f.reserved.run.id);
        return new Promise<never>((_done, reject) => { rejectPending = reject; signal.addEventListener("abort", () => reject(new RuntimeAdapterError("original_stop")), { once: true }); if (signal.aborted) reject(new RuntimeAdapterError("original_stop")); });
      }, cancel: async () => { rejectPending?.(new RuntimeAdapterError("original_stop")); }
    }) })).rejects.toThrow("workspace_rehearsal_cancel_requested");
    expect(running).toBe(true); expect(await f.control.query(f.reserved.run.id)).toMatchObject({ status: "Stopped", cancellation_requested: true, resources_disposed: true, completion_proven: false });
    expect(f.task().usage).toEqual(usage); expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved");
    expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe("export const query = () => 1;\n");
  });
});
