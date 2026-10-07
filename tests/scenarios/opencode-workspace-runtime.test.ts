import { mkdtempSync, readFileSync, rmSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { LocalAgentWorkspaceToolService, type AgentWorkspaceToolLocalContext } from "../../packages/local-app/src/index.js";
import { parseAgentWorkspaceToolScope, readWorkspaceToolRunFacts, runOpenCodeWorkspaceToolRehearsal } from "../../packages/runtime-adapter/src/index.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { buildWindowsLauncher } from "../../packages/runtime-adapter/src/native.js";
import { nativeProbe } from "../../packages/runtime-adapter/src/probe.js";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
import { flowSuccess, flowTime } from "../fixtures/flow-project.js";
vi.setConfig({ testTimeout: 120000 });

// Actual pinned OpenCode, OS AppContainer token, custom tools, Kernel queries
// and Git effects. Model responses and qualification remain constructed.
describe.runIf(process.platform === "win32" && process.arch === "x64")("OpenCode consumes original Agent workspace tools", () => {
  const roots: string[] = [], closers: (() => Promise<void>)[] = [], stores: { close(): void }[] = [];
  afterEach(async () => {
    while (closers.length) await closers.pop()!(); while (stores.length) stores.pop()!.close();
    while (roots.length) { const root = roots.pop()!; if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-opencode-workspace-")) throw Error("Unsafe test cleanup");
      const data = join(root, ".git", "cimiloop", "workspace-tool-rehearsals");
      if (existsSync(data)) for (const name of readdirSync(data)) { const operation = join(data, name), proof = join(operation, "agent-sandbox-cleanup.json");
        if (!existsSync(proof) || JSON.parse(readFileSync(proof, "utf8")).resources_disposed !== true) throw Error("Retain original sandbox resources: " + operation); }
      rmSync(root, { recursive: true, force: true }); }
  });
  async function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-opencode-workspace-")); roots.push(root);
    const f = createAgentRunProject(root, "task_execution", 100, undefined, ["read_files", "edit_files"]); stores.push(f.store);
    f.runPort.agent.checkToolAuthority = (project, input) => contentDigest({ constructed: true, project_id: project.id, request: input.request });
    const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, runVerifier: f.runPort });
    const prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared), dataDirectory = dirname(f.path);
    const scope = parseAgentWorkspaceToolScope({ project_id: f.project.id, run_id: reserved.run.id, operation_key: reserved.record.operation_key, executor_actor_id: f.agent.id,
      context_digest: prepared.context.input_digest, ...f.pins, host_admission_ref: prepared.context.host_admission_ref });
    const local: AgentWorkspaceToolLocalContext = { caller: f.caller, store: f.store, kernel, location: { repositoryKind: "git", repositoryPath: root, dataDirectory,
      databasePath: f.path, instancePath: join(dataDirectory, "instance.json"), suggestedName: "Actual OpenCode tools with constructed admission" } };
    const service = await LocalAgentWorkspaceToolService.open(local, reserved.run.id); closers.push(() => service.close());
    const binary = join(process.env.APPDATA!, "npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe");
    expect(digest(readFileSync(binary)).value).toBe("5283c2cd5b4285855daa97e6f7d17bf48146227cdf2a940e79e0f2b7869fd06e");
    const options = { root: dataDirectory, binary, scope, path: "src/query.ts", expectedDigest: digest(readFileSync(join(root, "src/query.ts"))).value, replacement: "export const query = () => 7;\n",
      connect: (supervisor: Parameters<typeof service.openIpc>[0], originalSupervisor: Parameters<typeof service.openIpc>[1], originalPeer: Parameters<typeof service.openIpc>[2], nonce: string) =>
        service.openIpc(supervisor, originalSupervisor, originalPeer, { nonce }) };
    return { ...f, root, reserved, dataDirectory, service, options };
  }
  it("uses real SDK call IDs, an OS-derived AppContainer SID and the same original ledger for read/replace", async () => {
    const f = await setup(), sequence = f.store.asOfEventSequence(), usage = f.task().usage;
    const result = await runOpenCodeWorkspaceToolRehearsal({ ...f.options, connect: async (...original) => {
      const channel = await f.options.connect(...original), launcher = await buildWindowsLauncher(f.dataDirectory);
      const foreign = await nativeProbe(f.dataDirectory, launcher, launcher, "read", ["--pipe-attempt", channel.getEndpoint().pipe]);
      const event = foreign.stdout.split(/\r?\n/).find(line => line.includes('"ipc.other_container"')); expect(event).toBeDefined();
      expect(JSON.parse(event!)).toMatchObject({ connected: false, error_code: 5 }); return channel;
    } }).catch(error => {
      const operations = join(f.dataDirectory, "workspace-tool-rehearsals");
      for (const name of readdirSync(operations)) { const operation = join(operations, name), path = join(operation, "result.json"); if (existsSync(path)) {
        writeFileSync(resolve(".cimiloop/opencode-workspace-v1-09/failure-diagnostic.json"), readFileSync(path));
        for (const file of ["stdout.raw", "stderr.raw"]) if (existsSync(join(operation, file))) writeFileSync(resolve(".cimiloop/opencode-workspace-v1-09/diagnostic-" + file), readFileSync(join(operation, file)));
      } }
      throw error;
    });
    expect(result.sandbox.appcontainer_sid).toMatch(/^S-1-15-2-/); expect(result.source_bytes_unchanged).toBe(true);
    expect(result.events.find(event => event.event === "cimiloop.workspace_boundary")).toMatchObject({ outside_read_denied: true, outside_write_denied: true, module_write_denied: true, directory_write_denied: true, subprocess_denied: true });
    expect(result.channel.attempts).toEqual([{ outcome: "completed", reason: null }, { outcome: "completed", reason: null }]);
    expect(result.synthetic_model_responses).toBe(true); expect(result.formal_agent_execution_enabled).toBe(false);
    const tools = result.events.filter(event => event.type === "tool_use").map(event => event.part as any);
    expect(tools.map(part => part.tool)).toEqual(["cimi_read", "cimi_replace"]); expect(tools.every(part => part.state.status === "completed")).toBe(true);
    for (const part of tools) { const output = JSON.parse(part.state.output); expect(output.call_id).toMatch(/^sdk_[a-f0-9]{64}$/); expect(output.formal_agent_execution_enabled).toBe(false); }
    expect(readFileSync(join(f.root, f.options.path), "utf8")).toBe(f.options.replacement);
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 2, unresolved: 0, has_effect: true });
    expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved"); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
  });
  it("denies both original OpenCode tools after a Human revokes the original WorkItem before resume", async () => {
    const f = await setup(), originalConnect = f.options.connect;
    const result = await runOpenCodeWorkspaceToolRehearsal({ ...f.options, connect: async (...args) => {
      const channel = await originalConnect(...args); flowSuccess(f.humanKernel.execute(f.humanCommand("RevokeWorkItem", "work_item", f.item.id, { reason: "Revoke before actual Runtime resume" }, "technical_owner"))); return channel;
    } });
    expect(result.channel.attempts).toEqual([{ outcome: "denied", reason: "tool_authority_denied" }, { outcome: "denied", reason: "tool_authority_denied" }]);
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record).invocations).toBe(0); expect(readFileSync(join(f.root, f.options.path), "utf8")).toBe("export const query = () => 1;\n");
    expect(result.events.filter(event => event.type === "tool_use").every(event => (event.part as any).state.status === "error")).toBe(true);
  });
  it("refuses ungranted repository paths through actual custom tools before claiming a file effect", async () => {
    const f = await setup(), result = await runOpenCodeWorkspaceToolRehearsal({ ...f.options, path: "README.md" });
    expect(result.channel.attempts).toHaveLength(2); expect(result.channel.attempts.every(value => value.outcome === "denied")).toBe(true);
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record).invocations).toBe(0); expect(readFileSync(join(f.root, f.options.path), "utf8")).toBe("export const query = () => 1;\n");
  });
  it("keeps the actual Runtime suspended when channel installation fails and disposes its original resources", async () => {
    const f = await setup();
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, connect: async () => { throw Error("original_channel_unavailable"); } })).rejects.toThrow("original_channel_unavailable");
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record).invocations).toBe(0);
    const operations = join(f.dataDirectory, "workspace-tool-rehearsals"), operation = join(operations, readdirSync(operations)[0]!);
    expect(JSON.parse(readFileSync(join(operation, "agent-sandbox-cleanup.json"), "utf8"))).toMatchObject({ resources_disposed: true, cleanup_errors: [], formal_agent_execution_enabled: false });
    expect(readFileSync(join(f.root, f.options.path), "utf8")).toBe("export const query = () => 1;\n");
  });
});
