import { initializeWindowsAgentStartLedger } from "../../packages/runtime-adapter/dist/agent-start-origin-windows.js";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalAgentRuntimeOperations, LocalAgentRuntimeStart, LocalAgentStartCustody, LocalAgentWorkspaceToolService, writeInstance } from "../../packages/local-app/src/index.js";
import { startWorkbench } from "../../apps/workbench/src/server.js";
import { createInternalId } from "../../packages/protocol/src/v2/index.js";
import { AgentWorkspaceToolIpc, RuntimeAdapterError, runOpenCodeWorkspaceToolRehearsal, parseAgentWorkspaceToolScope, readAgentWorkspaceIpcOriginals } from "../../packages/runtime-adapter/src/index.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { buildWindowsLauncher } from "../../packages/runtime-adapter/src/native.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
vi.setConfig({ testTimeout: 120000 });

// Native Run facts and actual OS/SDK effects. Controlled qualification and model
// responses remain constructed; no formal Agent/model admission is asserted.
describe.runIf(process.platform === "win32" && process.arch === "x64")("original Runtime lifecycle uses the native Run operation key", () => {
  const roots: string[] = [], stores: { close(): void }[] = [], closers: (() => Promise<void>)[] = [];
  afterEach(async context => {
    while (closers.length) await closers.pop()!(); while (stores.length) stores.pop()!.close();
    while (roots.length) {
      const root = roots.pop()!; if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-original-runtime-")) throw Error("Unsafe cleanup");
      const operations = join(root, ".git/cimiloop/workspace-tool-rehearsals");
      if (existsSync(operations)) for (const name of readdirSync(operations)) {
        const proof = join(operations, name, "agent-sandbox-cleanup.json");
        if (!existsSync(proof) || JSON.parse(readFileSync(proof, "utf8")).resources_disposed !== true) throw Error("Retain original resources: " + proof);
      }
      if (context.task.result?.state === "fail") { console.error("Retain failed original Runtime fixture: " + root); continue; }
      // Retain actual original evidence for D-254, including successful cleanup.
    }
  });
  async function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-original-runtime-")); roots.push(root);
    const f = createAgentRunProject(root, "task_execution", 100, undefined, ["read_files", "edit_files"]); stores.push(f.store);
    f.runPort.agent.checkToolAuthority = (project, input) => contentDigest({ constructed: true, project_id: project.id, request: input.request });
    const dataDirectory = dirname(f.path), ledger = await initializeWindowsAgentStartLedger(join(dataDirectory, "original-host"), join(dataDirectory, "original-host-tools"));
    closers.push(async () => ledger.close());
    const originalAdmission = f.runPort.agent.admitContext.bind(f.runPort.agent);
    const custody = new LocalAgentStartCustody(root, dataDirectory, ledger, {
      admit: originalAdmission, verifyLaunch: (project, input, original) => contentDigest({ constructed: true, project_id: project.id, input, original })
    });
    f.runPort.agent.admitContext = custody.admit.bind(custody);
    f.runPort.agent.checkRunAuthority = custody.checkRunAuthority.bind(custody);
    const prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared);
    const scope = parseAgentWorkspaceToolScope({ project_id: f.project.id, run_id: reserved.run.id, operation_key: reserved.record.operation_key,
      executor_actor_id: f.agent.id, context_digest: prepared.context.input_digest, ...f.pins, host_admission_ref: prepared.context.host_admission_ref });
    const local = { caller: f.caller, store: f.store, kernel: f.kernel, location: { repositoryKind: "git" as const, repositoryPath: root, dataDirectory,
      databasePath: f.path, instancePath: join(dataDirectory, "instance.json"), suggestedName: "Original lifecycle, constructed qualification" } };
    const service = await LocalAgentWorkspaceToolService.open(local, reserved.run.id); closers.push(() => service.close());
    const control = new LocalAgentRuntimeOperations(local), binary = join(process.env.APPDATA!, "npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe");
    const options = { root: dataDirectory, binary, scope, maxElapsedMs: 60000, path: "src/query.ts", expectedDigest: digest(readFileSync(join(root, "src/query.ts"))).value, replacement: "export const query = () => 7;\n",
      connect: (supervisor: Parameters<typeof service.openIpc>[0], originalSupervisor: Parameters<typeof service.openIpc>[1], peer: Parameters<typeof service.openIpc>[2], nonce: string, signal: AbortSignal) => service.openIpc(supervisor, originalSupervisor, peer, { nonce, signal }) };
    return { ...f, custody, root, dataDirectory, reserved, options, local, control };
  }
  it("collects stopped facts without modifying original records and refuses restarting the same completed Run", async () => {
    const f = await setup(), usage = f.task().usage, sequence = f.store.asOfEventSequence();
    let nativeResult: Awaited<ReturnType<typeof runOpenCodeWorkspaceToolRehearsal>> | undefined, starts = 0;
    const starter = new LocalAgentRuntimeStart(f.local, { custody: f.custody, prepare: async input => {
      expect(input.definition.task_id).toBe(f.item.task_id); expect(input.plan.id).toBe(f.task().plan_ref.id);
      expect(input.scope).toEqual(f.options.scope);
      return { launch: async () => { starts++; nativeResult = await runOpenCodeWorkspaceToolRehearsal(f.options); }, dispose() {} };
    } });
    expect(await starter.start(f.reserved.run.id)).toMatchObject({ outcome: "original", completion_proven: false });
    expect(await starter.start(f.reserved.run.id)).toMatchObject({ outcome: "original", completion_proven: false });
    expect(starts).toBe(1); if (!nativeResult) throw Error("Original Native execution missing"); const result = nativeResult;
    const ledgerPath = join(result.operation, "agent-sandbox-resources.json"), before = readFileSync(ledgerPath);
    expect(await f.control.query(f.reserved.run.id)).toMatchObject({ operation: result.operation, status: "Stopped", resources_disposed: true, completion_proven: false });
    expect(readFileSync(ledgerPath)).toEqual(before);
    const collected = await f.control.collect(f.reserved.run.id);
    expect(collected).toMatchObject({ domain_observation_produced: false, formal_agent_execution_enabled: false });
    expect(collected.native).toMatchObject({ status: "Verified", native_effect_reverified: true, matched_calls: 2,
      unmatched_native_calls: 0, model_account_custody_proven: false });
    expect(collected.ipc).toMatchObject({ status: "Observed", exchanges: 2, unresolved: 0, correlation: { uncorrelated_exchanges: 0, unmatched_sdk_calls: 0, model_account_custody_proven: false, native_effect_reverified: false } });
    expect(collected.artifacts.filter(artifact => artifact.name.startsWith("ipc/")).length).toBe(9);
    const stdout = collected.artifacts.find(artifact => artifact.name === "stdout.raw")!;
    expect(readFileSync(stdout.reference.locator)).toEqual(readFileSync(join(result.operation, "stdout.raw")));
    await expect(runOpenCodeWorkspaceToolRehearsal(f.options)).rejects.toThrow("agent_runtime_already_claimed");
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, replacement: "different" })).rejects.toThrow("agent_runtime_input_conflict");
    expect(readdirSync(join(f.dataDirectory, "workspace-tool-rehearsals"))).toHaveLength(1);
    const stdoutPath = join(result.operation, "stdout.raw"), originalStdout = readFileSync(stdoutPath), truncated = Buffer.from('{"type":"tool_use"');
    try {
      writeFileSync(stdoutPath, truncated);
      const partial = await f.control.collect(f.reserved.run.id);
      expect(partial.ipc).toMatchObject({ correlation: null, correlation_reason: "agent_sdk_original_correlation_unproven" });
      expect(readFileSync(partial.artifacts.find(artifact => artifact.name === "stdout.raw")!.reference.locator)).toEqual(truncated);
      expect(partial.domain_observation_produced).toBe(false);
    } finally { writeFileSync(stdoutPath, originalStdout); }
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
      execute: async input => {
        const active = await f.control.query(f.reserved.run.id);
        expect(active).toMatchObject({ status: "Running", resources_disposed: false, cancellation_requested: false }); running = true;
        const config = JSON.parse(readFileSync(join(active.operation, "original-config.json"), "utf8")), originals = readAgentWorkspaceIpcOriginals(f.dataDirectory, f.options.scope, config.pipe_nonce);
        expect(originals.exchanges).toHaveLength(1);
        expect(originals.exchanges[0]).toMatchObject({ state: "unknown", request: { call_id: input.call_id }, reply: null });
        f.control.requestCancellation(f.reserved.run.id);
        return new Promise<never>((_done, reject) => { rejectPending = reject; signal.addEventListener("abort", () => reject(new RuntimeAdapterError("original_stop")), { once: true }); if (signal.aborted) reject(new RuntimeAdapterError("original_stop")); });
      }, cancel: async () => { rejectPending?.(new RuntimeAdapterError("original_stop")); }
    }) })).rejects.toThrow("workspace_rehearsal_cancel_requested");
    expect(running).toBe(true); expect(await f.control.query(f.reserved.run.id)).toMatchObject({ status: "Stopped", cancellation_requested: true, resources_disposed: true, completion_proven: false });
    const originals = await f.control.collect(f.reserved.run.id);
    expect(originals.ipc.exchanges).toBe(1);
    expect(originals.ipc.correlation?.model_account_custody_proven).toBe(false);
    expect(originals.native).toMatchObject({ status: "Unknown", native_effect_reverified: false });
    expect(f.task().usage).toEqual(usage); expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved");
    expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe("export const query = () => 1;\n");
  });
  it.each(["eof","frame","truncated","utf8"])("aborts the original SDK wait on resumed controller %s without misclassifying damaged input", async kind => {
    const f = await setup(), usage = f.task().usage, sequence = f.store.asOfEventSequence();
    let waitingAt = 0, abortedAfter = 0;
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, connect: (supervisor, originalSupervisor, originalPeer, nonce, signal) => AgentWorkspaceToolIpc.open({
      toolsDirectory: f.dataDirectory, scope: f.options.scope, supervisor, originalSupervisor, originalPeer, nonce, signal, cancel: async () => {},
      execute: async () => {
        waitingAt = Date.now();
        // End only this fixture's original controller input. The controller owns
        // Job termination and cleanup; neither a new Run nor an external kill.
        if(kind==="frame")supervisor.stdin!.end("{}\n");
        else if(kind==="truncated")supervisor.stdin!.end("{");
        else if(kind==="utf8")supervisor.stdin!.end(Buffer.from([0xff,10]));
        else supervisor.stdin!.end();
        return new Promise<never>((_done, reject) => {
          const stopped = () => { abortedAfter = Date.now() - waitingAt; reject(new RuntimeAdapterError("original_native_exit")); };
          signal.addEventListener("abort", stopped, { once: true }); if (signal.aborted) stopped();
        });
      }
    }) })).rejects.toThrow("workspace_rehearsal_runtime_failed");
    expect(waitingAt).toBeGreaterThan(0); expect(abortedAfter).toBeLessThan(8000);
    const original = await f.control.collect(f.reserved.run.id);
    expect(original.status).toMatchObject({ status: "Stopped", cancellation_requested: false, resources_disposed: true, completion_proven: false });
    expect(original.native).toMatchObject({ status: "Unknown", native_effect_reverified: false });
    if(kind==="eof")expect(original.interruption).toMatchObject({status:"Observed",phase:"running",runtime_resumed:true,completion_proven:false,costs_reconciled:false});
    else {expect(original).not.toHaveProperty("interruption");expect(existsSync(join(original.status.operation,"agent-sandbox-interruption.json"))).toBe(false);expect(readFileSync(join(original.status.operation,"stderr.raw"),"utf8")).toContain("agent-workspace-native-failure");}
    const incomplete = JSON.parse(readFileSync(join(original.status.operation, "incomplete.json"), "utf8"));
    expect(incomplete).toMatchObject({ interruption_reason: "workspace_rehearsal_runtime_failed", completion_proven: false });
    expect(existsSync(join(original.status.operation, "result.json"))).toBe(false);
    await expect(runOpenCodeWorkspaceToolRehearsal(f.options)).rejects.toThrow("agent_runtime_already_claimed");
    expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
    expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved");
    expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe("export const query = () => 1;\n");
  });
  it("joins Human Workbench cancellation, collection, Unknown observation and receipt replay to the actual original SDK wait", async () => {
    const f = await setup();
    writeInstance(join(f.dataDirectory, "instance.json"), { schema_version: "1.0.0", instance_id: f.project.instance_id,
      project_id: f.project.id, actor_id: f.actor.id, created_at: f.project.created_at });
    const server = await startWorkbench({ projectDir: f.root }); closers.push(() => server.close());
    const login = await fetch(server.origin + "/api/session", { method: "POST", headers: { Origin: server.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ bootstrap: new URL(server.bootstrapUrl).hash.slice(1) }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!, csrf = (await login.json() as { csrf: string }).csrf;
    const request = async (action: string, body?: unknown) => {
      const response = await fetch(`${server.origin}/api/agent-runs/${f.reserved.run.id}${action ? "/" + action : ""}`, {
        headers: { Cookie: cookie, Connection: "close", ...(body === undefined ? {} : { Origin: server.origin, "Content-Type": "application/json", "X-CimiLoop-CSRF": csrf }) },
        ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
      const value = await response.json() as Record<string, any>;
      expect({ status: response.status, body: value }).toMatchObject({ status: 200 }); return value;
    };
    const stop = { command_id: createInternalId(), requested_at: new Date().toISOString(), acting_role: "technical_owner", command_type: "CancelRun",
      target: { object_type: "run", id: f.reserved.run.id }, expected_revision: f.store.getRun(f.reserved.run.id)!.revision, payload: { reason: "Human stops actual original SDK wait" } };
    const sequence = f.store.asOfEventSequence(); let running = false, controlError: unknown;
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, connect: (supervisor, originalSupervisor, originalPeer, nonce, signal) => AgentWorkspaceToolIpc.open({
      toolsDirectory: f.dataDirectory, scope: f.options.scope, supervisor, originalSupervisor, originalPeer, nonce, signal, cancel: async () => {},
      execute: async () => {
        try {
          const queriedAt = Date.now(), response = await request("");
          if (response.operation?.result?.status !== "Running") {
            const operations = join(f.dataDirectory, "workspace-tool-rehearsals"), operation = join(operations, readdirSync(operations)[0]!);
            const resources = JSON.parse(readFileSync(join(operation, "agent-sandbox-resources.json"), "utf8"));
            const diagnostic = { response, query_elapsed_ms: Date.now() - queriedAt, phase: resources.phase,
              resources_disposed: resources.resources_disposed, supervisor: resources.supervisor, runtime: resources.runtime };
            writeFileSync(join(f.dataDirectory, "workbench-query-diagnostic.json"), JSON.stringify(diagnostic, null, 2));
            console.error("Original Workbench query diagnostic: " + JSON.stringify(diagnostic));
          }
          expect(response).toMatchObject({ operation: { outcome: "observed", result: { status: "Running", resources_disposed: false } } });
          running = true;
          expect(await request("stop", stop)).toMatchObject({ command_result: { command_type: "CancelRun" }, operation: { outcome: "observed", result: { requested: true } } });
          expect(f.store.getRun(f.reserved.run.id)!.cancel_requested).toBe(true);
          return new Promise<never>((_done, reject) => { signal.addEventListener("abort", () => reject(new RuntimeAdapterError("original_stop")), { once: true });
            if (signal.aborted) reject(new RuntimeAdapterError("original_stop")); });
        } catch (error) { controlError = error; f.control.requestCancellation(f.reserved.run.id); throw error; }
      }
    }) })).rejects.toThrow("workspace_rehearsal_cancel_requested");
    if (controlError) throw controlError;
    expect(running).toBe(true);
    expect(await request("")).toMatchObject({ operation: { outcome: "observed", result: { status: "Stopped", cancellation_requested: true, resources_disposed: true, completion_proven: false } } });
    expect(await request("stop", stop)).toMatchObject({ command_result: { command_type: "CancelRun" }, starts_run: false });
    const collected = await request("collect", {});
    expect(collected).toMatchObject({ operation: { outcome: "observed", result: { native: { status: "Unknown" }, domain_observation_produced: false } } });
    expect(await request("recover", {})).toMatchObject({ operation: { outcome: "observed", result: { outcome: "recovered", resources_disposed: true, completion_proven: false } } });
    const observe = { command_id: createInternalId(), requested_at: new Date().toISOString(), acting_role: "technical_owner", command_type: "RecordRunObservation",
      target: { object_type: "run", id: f.reserved.run.id }, expected_revision: f.store.getRun(f.reserved.run.id)!.revision, payload: {} };
    const observation = await request("observe", observe);
    expect(observation).toMatchObject({ command_type: "RecordRunObservation", data: { observation: { report: { run_id: f.reserved.run.id,
      status: "unknown", producer_actor_id: f.actor.id, usage: { cost_known: false } } } } });
    expect(await request("observe", observe)).toEqual(observation);
    expect(f.store.asOfEventSequence()).toBe(sequence + 2); expect(f.store.listRuns(f.change.id)).toHaveLength(1);
    expect(f.store.listRuntimeRecords("run_observation", f.change.id)).toHaveLength(1);
    expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Unknown");
    expect(f.task().usage).toMatchObject({ pending_reconciliation: true, cost_reserved_micros: 100 });
    expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe("export const query = () => 1;\n");
  });
});
