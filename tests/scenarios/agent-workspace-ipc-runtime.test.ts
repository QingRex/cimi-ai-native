import {AgentNamedMethodHost,AgentRuntimeModelHost} from '../../packages/runtime-adapter/src/index.js';
import {fixedMethodFixture} from '../../packages/runtime-adapter/test/fixed-method-fixture.js';
import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
import { flowSuccess, flowTime } from "../fixtures/flow-project.js";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { LocalAgentWorkspaceToolService, type AgentWorkspaceToolLocalContext } from "../../packages/local-app/src/index.js";
import { AgentWorkspaceToolIpc, agentWorkspaceIpcScopeDigest, openAgentWorkspaceToolHost, parseAgentWorkspaceToolScope, readWorkspaceToolRunFacts } from "../../packages/runtime-adapter/src/index.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { buildWindowsLauncher, nativeControl } from "../../packages/runtime-adapter/src/native.js";
import type { CreditProcessIdentity } from "../../packages/runtime-adapter/src/gateway-credit.js";
vi.setConfig({ testTimeout: 60000 });

// Actual Windows named-pipe peer authentication, Native Kernel checks and Git
// file effects. Agent qualification/live host proof is explicitly constructed;
// the ordinary Node peer is not production OpenCode/AppContainer admission.
describe.runIf(process.platform === "win32" && process.arch === "x64")("original Agent workspace IPC on Windows", () => {
  const roots: string[] = [], stores: { close(): void }[] = [], peers: ChildProcess[] = [], closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    while (closers.length) await closers.pop()!();
    while (peers.length) { const peer = peers.pop()!; if (peer.exitCode === null && peer.signalCode === null) { const ended = new Promise<void>(done => peer.once("close", () => done())); peer.kill(); await ended; } }
    while (stores.length) stores.pop()!.close();
    while (roots.length) { const root = roots.pop()!; if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-agent-ipc-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); }
  });
  async function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-agent-ipc-")); roots.push(root);
    const f = createAgentRunProject(root, "task_execution", 100, undefined, ["read_files", "edit_files"]); stores.push(f.store);
    const live = { calls: 0 }; f.runPort.agent.checkToolAuthority = (project, input) => { live.calls++; return contentDigest({ constructed: true, project_id: project.id, request: input.request }); };
    const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, runVerifier: f.runPort }), prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared);
    const scope = parseAgentWorkspaceToolScope({ project_id: f.project.id, run_id: reserved.run.id, operation_key: reserved.record.operation_key, executor_actor_id: f.agent.id,
      context_digest: prepared.context.input_digest, ...f.pins, host_admission_ref: prepared.context.host_admission_ref });
    const dataDirectory = dirname(f.path), local: AgentWorkspaceToolLocalContext = { store: f.store, caller: f.caller, kernel, location: { repositoryKind: "git", repositoryPath: root, dataDirectory,
      databasePath: f.path, instancePath: join(dataDirectory, "instance.json"), suggestedName: "Constructed Agent IPC fixture" } };
    const peer = spawn(process.execPath, [fileURLToPath(new URL("../../packages/runtime-adapter/test/agent-workspace-ipc-peer.mjs", import.meta.url))], { windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] }); peers.push(peer);
    await new Promise<void>((done, fail) => { peer.once("spawn", done); peer.once("error", fail); });
    const launcher = await buildWindowsLauncher(dataDirectory), identity = (await nativeControl(launcher, ["--identity", String(peer.pid)])).value as CreditProcessIdentity;
    const frame = { format: "cimiloop/agent-workspace-tool-request/1.0.0", scope_digest: agentWorkspaceIpcScopeDigest(scope), call_id: "ipc_original", tool: "replace_file", path: "src/query.ts",
      expected_digest: digest(readFileSync(join(root, "src/query.ts"))).value, replacement_utf8: "export const query = () => 4;\n" };
    let id = 0;
    const send = (pipe: string, value: unknown, kind = "frame") => new Promise<any>((done, fail) => {
      const original = ++id, timer = setTimeout(() => { peer.removeListener("message", answer); fail(Error("Peer answer timeout")); }, 30000);
      const answer = (message: any) => { if (message.id !== original) return; clearTimeout(timer); peer.removeListener("message", answer); done(message); };
      peer.on("message", answer); peer.send({ id: original, kind, pipe, ...(kind === "frame" ? { frame: value } : value as object) });
    });
    const until = async (check: () => boolean) => { const deadline = Date.now() + 8000; while (Date.now() < deadline) { if (check()) return; await delay(25); } throw Error("Original IPC state did not settle"); };
    return { ...f, root, live, scope, prepared, reserved, dataDirectory, local, kernel, peer, identity, frame, send, until, launcher };
  }
  async function open(f: Awaited<ReturnType<typeof setup>>) {
    const service = await LocalAgentWorkspaceToolService.open(f.local, f.reserved.run.id); closers.push(() => service.close());
    const channel = await service.openIpc(f.peer, f.identity, f.identity), endpoint = channel.getEndpoint(); return { service, channel, endpoint };
  }
  it("authenticates the original peer and reads/edits/replays the same actual file receipt without changing Native facts", async () => {
    const f = await setup(), { service, channel, endpoint } = await open(f), sequence = f.store.asOfEventSequence(), usage = f.task().usage;
    expect(endpoint.peer).toEqual(f.identity); expect(endpoint.appcontainer_sid).toBeNull();
    const { replacement_utf8: _replacement, ...read } = f.frame;
    const readAnswer = await f.send(endpoint.pipe, { ...read, tool: "read_file", call_id: "ipc_read" }); expect(readAnswer.reply).toMatchObject({ outcome: "completed", replay: false });
    expect(readAnswer.reply.receipt.native.text).toBe("export const query = () => 1;\n");
    const write = await f.send(endpoint.pipe, f.frame); expect(write.reply).toMatchObject({ outcome: "completed", replay: false, formal_agent_execution_enabled: false });
    const replay = await f.send(endpoint.pipe, f.frame); expect(replay.reply).toMatchObject({ outcome: "completed", replay: true }); expect(replay.reply.receipt).toEqual(write.reply.receipt);
    expect(readFileSync(join(f.root, f.frame.path), "utf8")).toBe(f.frame.replacement_utf8); expect(f.live.calls).toBeGreaterThanOrEqual(9);
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 2, unresolved: 0, has_effect: true });
    expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved"); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
    await expect(service.openIpc(f.peer, f.identity, f.identity)).rejects.toThrow("original peer already installed");
    const conflict = await f.send(endpoint.pipe, { ...f.frame, replacement_utf8: "foreign replacement" }); expect(conflict.reply).toMatchObject({ outcome: "denied", reason: "workspace_tool_call_conflict" });
    expect(channel.snapshot().failure_reason).toBeNull();
  });
  it("rejects another actual process, foreign scope/extra caller fields, duplicate keys, oversize and invalid UTF-8 before file claims", async () => {
    const f = await setup(), { channel, endpoint } = await open(f);
    await new Promise<void>((done, fail) => { const socket = createConnection(endpoint.pipe), timer = setTimeout(() => { socket.destroy(); fail(Error("Foreign peer not rejected")); }, 4000);
      const finish = () => { clearTimeout(timer); socket.destroy(); done(); }; socket.once("connect", () => socket.write("foreign caller")); socket.once("end", finish); socket.once("error", finish); });
    await f.until(() => channel.snapshot().attempts.some(item => item.reason === "agent_ipc_peer_mismatch"));
    expect(channel.snapshot()).toMatchObject({ closed: false, failure_reason: null });
    const raw = async (bytes: Buffer, length?: number) => f.send(endpoint.pipe, { bytes_base64: bytes.toString("base64"), ...(length ? { length } : {}) }, "raw");
    const injected = await raw(Buffer.from(JSON.stringify({ ...f.frame, executor_actor_id: f.actor.id }))); expect(injected, JSON.stringify(channel.snapshot())).toHaveProperty("reply.raw"); expect(injected.reply.raw).not.toBe("");
    const duplicate = await raw(Buffer.from(JSON.stringify(f.frame).replace('"call_id":"ipc_original"', '"call_id":"ipc_original","call_id":"foreign"'))); expect(duplicate.reply.raw).not.toBe("");
    expect((await raw(Buffer.alloc(0), 114689)).reply.raw).toBe(""); expect((await raw(Buffer.from([255]))).reply.raw).toBe("");
    const extra = await f.send(endpoint.pipe, { ...f.frame, scope_digest: digest("foreign").value }); expect(extra.error).toBe("agent_ipc_reply_unproven");
    await f.until(() => channel.snapshot().attempts.length === 6);
    expect(f.live.calls).toBe(0); expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record).invocations).toBe(0);
    expect(readFileSync(join(f.root, f.frame.path), "utf8")).toBe("export const query = () => 1;\n");
  });
  it("re-reads revocation for IPC replay and never treats a prior file receipt as Run completion", async () => {
    const f = await setup(), { endpoint } = await open(f); expect((await f.send(endpoint.pipe, f.frame)).reply.outcome).toBe("completed");
    flowSuccess(f.humanKernel.execute(f.humanCommand("RevokeWorkItem", "work_item", f.item.id, { reason: "Revoke original IPC file access" }, "technical_owner")));
    const sequence = f.store.asOfEventSequence(), usage = f.task().usage;
    expect((await f.send(endpoint.pipe, f.frame)).reply).toMatchObject({ outcome: "denied", reason: "tool_authority_denied", receipt: null, replay: false });
    expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved"); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
  });
  it("refuses a substituted creation time before starting a pipe or claiming an effect", async () => {
    const f = await setup(), service = await LocalAgentWorkspaceToolService.open(f.local, f.reserved.run.id); closers.push(() => service.close());
    await expect(service.openIpc(f.peer, f.identity, { ...f.identity, creation_ticks: String(BigInt(f.identity.creation_ticks) + 1n) })).rejects.toThrow();
    expect(f.live.calls).toBe(0); expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record).invocations).toBe(0);
  });
  it("copies original process and scope pins before asynchronous build so later input mutation cannot substitute them", async () => {
    const f = await setup(), original = structuredClone(f.identity), originalScope = structuredClone(f.scope);
    const execution = await openAgentWorkspaceToolHost({ repositoryPath: f.root, dataDirectory: f.dataDirectory, scope: originalScope, assess: request => f.kernel.assessAgentRunTool(request) });
    closers.push(() => execution.host.close());
    const pending = AgentWorkspaceToolIpc.open({ toolsDirectory: f.dataDirectory, scope: f.scope, supervisor: f.peer, originalSupervisor: f.identity, originalPeer: f.identity,
      execute: input => execution.host.execute(input), cancel: () => execution.host.close() });
    f.identity.creation_ticks = "1"; f.scope.context_digest.value = "a".repeat(64); f.scope.runtime_binding.digest.value = "b".repeat(64);
    const channel = await pending; closers.push(() => channel.close()); expect(channel.getEndpoint()).toMatchObject({ peer: original, supervisor: original, scope_digest: agentWorkspaceIpcScopeDigest(originalScope) });
    const { replacement_utf8: _replacement, ...read } = f.frame; expect((await f.send(channel.getEndpoint().pipe, { ...read, tool: "read_file" })).reply.outcome).toBe("completed");
  });
  it("authenticates a separate original runtime peer and closes on its OS-proven exit while the original supervisor is still active", async () => {
    const f = await setup(), supervisor = spawn(process.execPath, [fileURLToPath(new URL("../../packages/runtime-adapter/test/agent-workspace-ipc-peer.mjs", import.meta.url))], { windowsHide: true, stdio: ["ignore", "ignore", "pipe", "ipc"] }); peers.push(supervisor);
    await new Promise<void>((done, fail) => { supervisor.once("spawn", done); supervisor.once("error", fail); });
    const originalSupervisor = (await nativeControl(f.launcher, ["--identity", String(supervisor.pid)])).value as CreditProcessIdentity;
    const service = await LocalAgentWorkspaceToolService.open(f.local, f.reserved.run.id); closers.push(() => service.close());
    const channel = await service.openIpc(supervisor, originalSupervisor, f.identity), endpoint = channel.getEndpoint(); expect(endpoint.supervisor).toEqual(originalSupervisor); expect(endpoint.peer).toEqual(f.identity);
    const { replacement_utf8: _replacement, ...read } = f.frame; expect((await f.send(endpoint.pipe, { ...read, tool: "read_file" })).reply.outcome).toBe("completed");
    const ended = new Promise<void>(done => f.peer.once("close", () => done())); f.peer.kill(); await ended; await f.until(() => channel.snapshot().closed); await channel.close();
    expect(supervisor.exitCode).toBeNull(); expect(supervisor.signalCode).toBeNull();
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 1, unresolved: 0, has_effect: true });
  });
  it("preserves completed original effects after socket reply loss and explicitly replays them through a fresh host without writing again", async () => {
    const f=await setup(),sequence=f.store.asOfEventSequence(),usage=f.task().usage;
    const execution=await openAgentWorkspaceToolHost({repositoryPath:f.root,dataDirectory:f.dataDirectory,scope:f.scope,assess:request=>f.kernel.assessAgentRunTool(request)});closers.push(()=>execution.host.close());
    let endpoint:ReturnType<AgentWorkspaceToolIpc['getEndpoint']>,completed=false;
    const channel=await AgentWorkspaceToolIpc.open({toolsDirectory:f.dataDirectory,scope:f.scope,supervisor:f.peer,originalSupervisor:f.identity,originalPeer:f.identity,
      execute:async input=>{const result=await execution.host.execute(input);completed=true;
       // Original Native effect is durable. Drop this exact peer socket while
       // the host still holds the response, never before dispatch or completion.
       expect((await f.send(endpoint.pipe,{drop_key:'original_completed'},'drop_original')).reply.dropped).toBe(true);return result;},cancel:()=>execution.host.close()});closers.push(()=>channel.close());endpoint=channel.getEndpoint();
    expect((await f.send(endpoint.pipe,{bytes_base64:Buffer.from(JSON.stringify(f.frame)).toString('base64'),drop_key:'original_completed'},'drop_after_effect')).reply.dropped).toBe(true);expect(completed).toBe(true);
    await f.until(() => channel.snapshot().closed); await channel.close();
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 1, unresolved: 0, has_effect: true });
    expect(readFileSync(join(f.root, f.frame.path), "utf8")).toBe(f.frame.replacement_utf8);
    const next = await open(f), replay = await f.send(next.endpoint.pipe, f.frame); expect(replay.reply).toMatchObject({ outcome: "completed", replay: true });
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record).invocations).toBe(1); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
  });
  it.each(["native_prepared", "dispatch_committed"] as const)("stops the original file host on peer exit at %s and retains its original outcome", async phase => {
    const f = await setup(); let entered!: () => void, release!: () => void; const atPhase = new Promise<void>(done => { entered = done; }), gate = new Promise<void>(done => { release = done; });
    const execution = await openAgentWorkspaceToolHost({ repositoryPath: f.root, dataDirectory: f.dataDirectory, scope: f.scope, assess: request => f.kernel.assessAgentRunTool(request),
      phase: async current => { if (current === phase) { entered(); await gate; } } });
    closers.push(() => { release(); return execution.host.close(); });
    const channel = await AgentWorkspaceToolIpc.open({ toolsDirectory: f.dataDirectory, scope: f.scope, supervisor: f.peer, originalSupervisor: f.identity, originalPeer: f.identity,
      execute: input => execution.host.execute(input), cancel: () => execution.host.close() }); closers.push(() => channel.close());
    const endpoint = channel.getEndpoint(); f.peer.send({ id: 99, kind: "frame", pipe: endpoint.pipe, frame: f.frame }); await atPhase;
    const ended = new Promise<void>(done => f.peer.once("close", () => done())); f.peer.kill(); await ended; release(); await channel.close();
    expect(channel.snapshot().closed).toBe(true); const facts = readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record);
    expect(facts).toMatchObject(phase === "native_prepared" ? { invocations: 1, unresolved: 0, has_effect: false } : { invocations: 1, unresolved: 1, has_effect: true });
    expect(readFileSync(join(f.root, f.frame.path), "utf8")).toBe("export const query = () => 1;\n");
    if (phase === "dispatch_committed") expect(f.agentObserve(f.reserved.run, "succeeded")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
  });
it('independently rejects ordinary workspace frames in named method mode at the authenticated broker',async()=>{const f=await setup(),fixed=fixedMethodFixture();fixed.request.invocation_key=f.scope.operation_key;fixed.profile.invocation_key=f.scope.operation_key;fixed.profile.request_digest=digest(JSON.stringify(fixed.request));fixed.files.find(x=>x.path==='skill-request.json')!.content=JSON.stringify(fixed.request,null,2);for(const r of fixed.profile.resources)r.digest=digest(fixed.files.find(x=>x.path===r.path)!.content);const method=AgentNamedMethodHost.initialize(f.dataDirectory,f.scope,fixed.profile,fixed.files,()=>{}),port={admission_digest:digest('constructed method model').value,check:async()=>{},execute:async()=>{throw Error('No model request');}};const model=await AgentRuntimeModelHost.initialize(f.dataDirectory,f.scope,port,['cimi_invoke_skill','cimi_read_method_resource'],'Controlled method');let writes=0;const channel=await AgentWorkspaceToolIpc.open({toolsDirectory:f.dataDirectory,scope:f.scope,supervisor:f.peer,originalSupervisor:f.identity,originalPeer:f.identity,method,model,execute:async()=>{writes++;throw Error('PRIVATE workspace effect');},cancel:async()=>{}});closers.push(()=>channel.close());const answer=await f.send(channel.getEndpoint().pipe,f.frame);expect(answer.reply).toMatchObject({outcome:'denied',reason:'agent_method_scope_denied'});expect(writes).toBe(0);expect(readFileSync(join(f.root,f.frame.path),'utf8')).toBe('export const query = () => 1;\n');});
});
