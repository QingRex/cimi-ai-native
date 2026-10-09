import {startWorkbench} from "../../apps/workbench/src/server.js";
import {createInternalId} from "../../packages/protocol/src/v2/index.js";
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { LocalAgentRuntimeObservation, LocalRunVerifier, writeInstance, openLocalAgentRunBudget } from "../../packages/local-app/src/index.js";
import { AgentWorkspaceToolIpc, RuntimeAdapterError, openWindowsAgentRunClock, runOpenCodeWorkspaceToolRehearsal } from "../../packages/runtime-adapter/src/index.js";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
import { flowSuccess } from "../fixtures/flow-project.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
vi.setConfig({ testTimeout: 120000 });

// Real native Store reservation timestamps and Windows clock. Provider ALLOW /
// custody and OpenCode model replies remain constructed, no paid model request.
describe.runIf(process.platform === "win32" && process.arch === "x64")("native Task budget and original Windows clock", () => {
  const roots: string[] = [], stores: { close(): void }[] = [];
  afterEach(() => {
    while (stores.length) stores.pop()!.close();
    while (roots.length) {
      const root = roots.pop()!; if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-task-clock-runtime-")) throw Error("Unsafe cleanup");
      const operations = join(root, ".git/cimiloop/workspace-tool-rehearsals");
      if (existsSync(operations)) for (const name of readdirSync(operations)) {
        const proof = join(operations, name, "agent-sandbox-cleanup.json");
        if (!existsSync(proof) || JSON.parse(readFileSync(proof, "utf8")).resources_disposed !== true) throw Error("Retain original resources: " + proof);
      }
      console.error("Retain original Task-clock fixture: " + root);
    }
  });
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-task-clock-runtime-")); roots.push(root);
    const f = createAgentRunProject(root); stores.push(f.store);
    const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => new Date().toISOString(), runVerifier: f.runPort });
    const prepared = flowSuccess(kernel.execute(f.prepareCommand()));
    if (prepared.command_type !== "PrepareRunContext" || !("runtime_binding" in prepared.data.context)) throw Error("Agent context expected");
    const reserved = flowSuccess(kernel.execute(f.reserveCommand({ ...prepared.data, context: prepared.data.context })));
    if (reserved.command_type !== "ReserveRun" || reserved.data.record.run_kind !== "agent") throw Error("Agent reservation expected");
    const dataDirectory = dirname(f.path), local = { caller: f.caller, store: f.store, kernel, location: { repositoryKind: "git" as const, repositoryPath: root,
      dataDirectory, databasePath: f.path, instancePath: join(dataDirectory, "instance.json"), suggestedName: "Real Task clock; constructed Provider" } };
    return { ...f, root, kernel, reserved: reserved.data, dataDirectory, local };
  }
  it("reads a real boot clock and reopens the durable anchor in another host process", async () => {
    const f = setup(), budget = await openLocalAgentRunBudget(f.local, f.reserved.run.id), original = readFileSync(budget.anchorPath), before = await budget.remaining();
    const clock = await openWindowsAgentRunClock(f.dataDirectory), reading = await clock.read();
    expect(Date.parse(reading.boot_utc)).toBeLessThan(Date.parse(f.task().usage.first_started_at!)); expect(reading.uptime_ms).toBeGreaterThan(0);
    const helper=join(f.dataDirectory,"tools","agent-run-clock-"+digest(readFileSync(resolve("packages/runtime-adapter/native/AgentRunClock.cs"))).value,"AgentRunClock.exe");
    for(const pid of [String(process.pid),"2147483647"]){
      await expect(promisify(execFile)(helper,["--continuous",pid,"1",reading.boot_utc],{windowsHide:true,timeout:15000})).rejects.toMatchObject({code:2,stdout:""});
    }
    const module = pathToFileURL(resolve("packages/runtime-adapter/dist/index.js")).href;
    const code = `import { AgentRunBudget,openWindowsAgentRunClock } from ${JSON.stringify(module)}; const input=JSON.parse(process.argv[1]); const clock=await openWindowsAgentRunClock(input.root); const budget=await AgentRunBudget.open(input.root,{basis:()=>input.basis,readClock:clock.read}); console.log(JSON.stringify({remaining:await budget.remaining(),digest:budget.anchorDigest}));`;
    const child = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", code, JSON.stringify({ root: f.dataDirectory, basis: budget.basis })], { windowsHide: true, timeout: 15000 });
    const result = JSON.parse(child.stdout); expect(result.remaining).toBeLessThan(before); expect(result.digest).toBe(budget.anchorDigest); expect(readFileSync(budget.anchorPath)).toEqual(original);
    // Child independently reads original anchor and actual OS clock; the immutable
    // native basis is copied here. Native authorization re-read is in local host.
    expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved");
  });
  it("rejects a current native cancellation both on reuse and on reopen", async () => {
    const f = setup(), budget = await openLocalAgentRunBudget(f.local, f.reserved.run.id), usage = f.task().usage;
    flowSuccess(f.kernel.execute(f.command("CancelRun", "run", f.reserved.run.id, { reason: "Actual native cancellation" })));
    await expect(budget.remaining()).rejects.toThrow("agent_run_cancel_requested");
    await expect(openLocalAgentRunBudget(f.local, f.reserved.run.id)).rejects.toThrow("agent_run_cancel_requested");
    expect(f.task().usage.first_started_at).toBe(usage.first_started_at); expect(f.task().usage.attempts_consumed).toBe(usage.attempts_consumed);
  });
  it("stops the original suspended Runtime when native cancellation arrives during hung preparation", async () => {
    const f = setup(), budget = await openLocalAgentRunBudget(f.local, f.reserved.run.id), usage = f.task().usage;
    const binary = join(process.env.APPDATA!, "npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe");
    let mapped = false;
    await expect(runOpenCodeWorkspaceToolRehearsal({ root: f.dataDirectory, binary, scope: budget.basis.scope, runBudget: budget, maxElapsedMs: 60000,
      path: "src/query.ts", expectedDigest: digest(readFileSync(join(f.root, "src/query.ts"))).value, replacement: "export const query = () => 7;\n",
      connect: async () => { throw Error("Must not connect"); }, prepare: original => {
        if (original.phase !== "mapped") return; mapped = true;
        flowSuccess(f.kernel.execute(f.command("CancelRun", "run", f.reserved.run.id, { reason: "Cancel original preparing Runtime" })));
        return new Promise<void>(() => {});
      } })).rejects.toThrow("agent_run_cancel_requested");
    expect(mapped).toBe(true); expect(f.task().usage.first_started_at).toBe(usage.first_started_at);
    expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Unknown");
    expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe("export const query = () => 1;\n");
    const operations = join(f.dataDirectory, "workspace-tool-rehearsals");
    const incomplete = JSON.parse(readFileSync(join(operations, readdirSync(operations)[0]!, "incomplete.json"), "utf8"));
    expect(incomplete).toMatchObject({ interruption_reason: "agent_run_cancel_requested", completion_proven: false });
  });
  it("caps a longer new host lifetime at the original native Task deadline", async () => {
    const f = setup(), first = await openLocalAgentRunBudget(f.local, f.reserved.run.id), original = readFileSync(first.anchorPath), usage = f.task().usage;
    await new Promise(resolve => setTimeout(resolve, 2000));
    const reopened = await openLocalAgentRunBudget(f.local, f.reserved.run.id);
    expect(await reopened.remaining()).toBeLessThan(58000);
    const binary = join(process.env.APPDATA!, "npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe"); let originalCall = "";
    let rejectPending: ((error: Error) => void) | undefined;
    // Stall only this trusted test host across expiry. The native original Job
    // must stop on its own absolute OS clock, independently of JS timer delivery.
    const stall = setTimeout(() => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 6000), Math.max(0, Date.parse(usage.first_started_at!) + 59000 - Date.now()));
    try {
    await expect(runOpenCodeWorkspaceToolRehearsal({ root: f.dataDirectory, binary, scope: reopened.basis.scope, runBudget: reopened, maxElapsedMs: 90000,
      path: "src/query.ts", expectedDigest: digest(readFileSync(join(f.root, "src/query.ts"))).value, replacement: "export const query = () => 7;\n",
      connect: (supervisor, originalSupervisor, originalPeer, nonce, signal) => AgentWorkspaceToolIpc.open({ toolsDirectory: f.dataDirectory,
        scope: reopened.basis.scope, supervisor, originalSupervisor, originalPeer, nonce, signal,
        // An actual SDK request waits for a controlled host callback. No file
        // effect or fabricated successful receipt is produced by this callback.
        execute: input => { originalCall = input.call_id; return new Promise<never>((_resolve, reject) => {
          rejectPending = reject; signal.addEventListener("abort", () => reject(new RuntimeAdapterError("test_original_stop")), { once: true });
          if (signal.aborted) reject(new RuntimeAdapterError("test_original_stop"));
        }); }, cancel: async () => { rejectPending?.(new RuntimeAdapterError("test_original_stop")); } })
    })).rejects.toThrow(/workspace_rehearsal_deadline|agent_run_budget_exhausted/);
    } finally { clearTimeout(stall); }
    expect(originalCall).toMatch(/^sdk_[a-f0-9]{64}$/);
    const operations = join(f.dataDirectory, "workspace-tool-rehearsals"), operation = join(operations, readdirSync(operations)[0]!);
    const cleanup = JSON.parse(readFileSync(join(operation, "agent-sandbox-cleanup.json"), "utf8"));
    expect(cleanup.reason).toBe("agent_sandbox_task_deadline"); expect(cleanup.resources_disposed).toBe(true);
    expect(cleanup.runtime_stopped_uptime_ms).toBeTypeOf("number");
    expect(cleanup.runtime_stopped_uptime_ms).toBeLessThan(reopened.nativeDeadlineUptimeMs + 2000);
    expect(readFileSync(first.anchorPath)).toEqual(original); expect(f.task().usage).toEqual(usage);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(usage.first_started_at!) + 60100 - Date.now())));
    await expect(openLocalAgentRunBudget(f.local, f.reserved.run.id)).rejects.toThrow("agent_run_budget_exhausted");
    expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved");
    // Actual stopped original Native deadline -> shared Human observation ->
    // Kernel. Unknown costs retain the one active Run and its held budget.
    const humanKernel=new CimiLoopKernel({store:f.store,caller:{kind:"local_operator",project_id:f.project.id,actor_id:f.actor.id},runVerifier:new LocalRunVerifier(f.root,f.dataDirectory)});
    const human={...f.local,kernel:humanKernel,instance:{schema_version:"1.0.0" as const,instance_id:f.project.instance_id,project_id:f.project.id,actor_id:f.actor.id,created_at:f.project.created_at}};
    const request={command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:"technical_owner",command_type:"RecordRunObservation",target:{object_type:"run",id:f.reserved.run.id},expected_revision:f.store.getRun(f.reserved.run.id)!.revision,payload:{}};
    writeInstance(human.location.instancePath,human.instance);const server=await startWorkbench({projectDir:f.root});
    let result:unknown;const sequence=f.store.asOfEventSequence();
    try{
     const login=await fetch(server.origin+"/api/session",{method:"POST",headers:{Origin:server.origin,"Content-Type":"application/json"},body:JSON.stringify({bootstrap:new URL(server.bootstrapUrl).hash.slice(1)})});expect(login.status).toBe(200);
     const cookie=login.headers.get("set-cookie")!.split(";")[0]!,csrf=(await login.json() as {csrf:string}).csrf;
     const response=await fetch(server.origin+"/api/agent-runs/"+f.reserved.run.id+"/observe",{method:"POST",headers:{Origin:server.origin,Cookie:cookie,"Content-Type":"application/json","X-CimiLoop-CSRF":csrf,Connection:"close"},body:JSON.stringify(request)});
     result=await response.json();expect({status:response.status,result}).toMatchObject({status:200});
    }finally{await server.close();}
    expect(result).toMatchObject({command_type:"RecordRunObservation",data:{observation:{report:{status:"failed",usage:{cost_known:false}}}}});
    expect(await new LocalAgentRuntimeObservation(human).record(request)).toEqual(result);expect(f.store.asOfEventSequence()).toBe(sequence+1);
    expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Failed");expect(f.task().status).toBe("InProgress");
    expect(f.task().usage).toMatchObject({pending_reconciliation:true,cost_known:false,cost_reserved_micros:100,attempts_consumed:1});
    expect(f.task().active_run_ref?.id).toBe(f.reserved.run.id);
  });
});
