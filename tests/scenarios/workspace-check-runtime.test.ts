import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { AgentWorkspaceCheckHost, parseWorkspaceCheckCall, parseWorkspaceCheckRecipe, type WorkspaceCheckRecipe } from "../../packages/runtime-adapter/src/workspace-checks.js";
import { parseAgentWorkspaceToolScope } from "../../packages/runtime-adapter/src/agent-workspace-authority.js";
import { readWorkspaceToolRunFacts } from "../../packages/runtime-adapter/src/workspace-tool-host.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
import { flowTime, flowSuccess } from "../fixtures/flow-project.js";
import { LocalAgentWorkspaceToolService, type AgentWorkspaceToolLocalContext } from "../../packages/local-app/src/agent-workspace-tools-local.js";
vi.setConfig({ testTimeout: 120000 });

// Real Node checks, original Windows Job/AppContainer, immutable copied inputs,
// real Kernel/SQLite. Positive Agent admission remains explicitly constructed.
describe.runIf(process.platform === "win32" && process.arch === "x64")("fixed workspace checks with current original Agent authority", () => {
  const roots: string[] = [], stores: { close(): void }[] = [], hosts: AgentWorkspaceCheckHost[] = [];
  afterEach(async () => {
    while (hosts.length) await hosts.pop()!.close(); while (stores.length) stores.pop()!.close();
    while (roots.length) {
      const root = roots.pop()!; if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-workspace-check-")) throw Error("Unsafe cleanup");
      const checks = join(root, ".git", "cimiloop", "workspace-checks");
      if (existsSync(checks)) for (const project of readdirSync(checks)) for (const operation of readdirSync(join(checks, project))) {
        if (!/^[a-f0-9]{64}$/.test(operation)) continue;
        const ownership = join(checks, project, operation, "native-ownership.json");
        if (existsSync(ownership) && JSON.parse(readFileSync(ownership, "utf8")).resources_disposed !== true) throw Error("Retain original check resources: " + ownership);
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
  async function setup(text = "export const result = 2;\n", profile: WorkspaceCheckRecipe["profile"] = "node_syntax",
    phase?: Parameters<typeof AgentWorkspaceCheckHost.open>[0]["phase"], maximum = 32768) {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-workspace-check-")); roots.push(root);
    const f = createAgentRunProject(root, "task_execution", 100,
      [{ provider: "cimiloop_workspace", resource_type: "repository_path", locator: "src/**", version: "1.0.0" }],
      ["read_files", "run_checks"], ["src/**"]); stores.push(f.store);
    mkdirSync(join(root, "src"), { recursive: true }); writeFileSync(join(root, "src/check.mjs"), text);
    f.runPort.agent.checkToolAuthority = (project, input) => contentDigest({ constructed: true, project_id: project.id, request: input.request });
    const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, runVerifier: f.runPort }), prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared);
    const scope = parseAgentWorkspaceToolScope({ project_id: f.project.id, run_id: reserved.run.id, operation_key: reserved.record.operation_key,
      executor_actor_id: f.agent.id, context_digest: prepared.context.input_digest, ...f.pins, host_admission_ref: prepared.context.host_admission_ref });
    const recipe: WorkspaceCheckRecipe = { check_id: "fixed", profile, entry: "src/check.mjs", inputs: [{ path: "src/check.mjs", expected_digest: digest(text).value }],
      max_elapsed_ms: 4000, max_output_bytes: maximum };
    const options = { repositoryPath: root, dataDirectory: dirname(f.path), nodeBinary: process.execPath, scope, recipes: [recipe],
      assess: (request: Parameters<typeof kernel.assessAgentRunTool>[0]) => kernel.assessAgentRunTool(request), ...(phase ? { phase } : {}) };
    const host = await AgentWorkspaceCheckHost.open(options); hosts.push(host);
    const call = { format: "cimiloop/workspace-check-call/1.0.0" as const, call_id: "sdk_original", check_id: "fixed" };
    return { ...f, root, kernel, scope, reserved, recipe, options, host, call };
  }
  it("runs fixed syntax once under contention, preserves raw receipt and refuses changed input or corrupt replay", async () => {
    const f = await setup(), other = await AgentWorkspaceCheckHost.open(f.options); hosts.push(other);
    const sequence = f.store.asOfEventSequence(), usage = f.task().usage, calls = await Promise.allSettled([f.host.execute(f.call), other.execute(f.call)]);
    const results = calls.filter(value => value.status === "fulfilled").map(value => value.value);
    expect(results.filter(value => !value.replay)).toHaveLength(1);
    const result = results[0]!; expect(result.receipt).toMatchObject({ outcome: "passed", exit_code: 0, formal_agent_execution_enabled: false });
    const ownership = JSON.parse(readFileSync(join(result.operation, "native-ownership.json"), "utf8"));
    expect(ownership).toMatchObject({ mode: "read", job_assignment: "atomic_on_create", resources_disposed: true });
    expect(JSON.parse(readFileSync(join(result.operation, "execution-policy-proof.json"), "utf8"))).toMatchObject({ network_mode: "deny_all", capability_sids: [] });
    const again = await other.execute(f.call); expect(again.replay).toBe(true); expect(again.receipt).toEqual(result.receipt);
    const local: AgentWorkspaceToolLocalContext = { caller: f.caller, store: f.store, kernel: f.kernel, location: { repositoryKind: "git", repositoryPath: f.root,
      dataDirectory: f.options.dataDirectory, databasePath: f.path, instancePath: join(f.options.dataDirectory, "instance.json"), suggestedName: "Actual fixed checks" } };
    const service = await LocalAgentWorkspaceToolService.open(local, f.reserved.run.id);
    try { await service.installChecks(process.execPath, [f.recipe]); expect((await service.runChecks(f.call)).receipt).toEqual(result.receipt); }
    finally { await service.close(); }
    expect(JSON.parse(readFileSync(join(result.operation, "native-ownership.json"), "utf8"))).toEqual(ownership);
    expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved"); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
    expect(readWorkspaceToolRunFacts(f.options.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 1, unresolved: 0, has_effect: true });
    const changed = await AgentWorkspaceCheckHost.open({ ...f.options, recipes: [{ ...f.recipe, max_elapsed_ms: 4500 }] }); hosts.push(changed);
    await expect(changed.execute(f.call)).rejects.toThrow("workspace_check_call_conflict");
    const capturedSource = join(result.operation, "sandbox", "workspace", "src/check.mjs"), originalBytes = readFileSync(capturedSource);
    writeFileSync(capturedSource, "export const forged = true;\n"); await expect(other.execute(f.call)).rejects.toThrow("workspace_check_receipt_unproven"); writeFileSync(capturedSource, originalBytes);
    writeFileSync(join(result.operation, "stderr.raw"), "corrupt projection"); await expect(other.execute(f.call)).rejects.toThrow("workspace_check_receipt_unproven");
  });
  it("records an actual nonzero syntax exit as failed and replays the same failed receipt", async () => {
    const f = await setup("export const result = ;\n"), result = await f.host.execute(f.call);
    expect(result.receipt).toMatchObject({ outcome: "failed", exit_code: 1, reason: "exited" });
    expect(readFileSync(join(result.operation, "stderr.raw"), "utf8")).toContain("SyntaxError");
    expect((await f.host.execute(f.call)).receipt).toEqual(result.receipt);
  });
  it("runs real node:test in one process and denies snapshot writes", async () => {
    const text = `import test from 'node:test'; import assert from 'node:assert/strict'; import {writeFileSync} from 'node:fs';
test('real bounded checks', () => { assert.equal(2+2,4); assert.throws(() => writeFileSync(import.meta.filename,'altered')); });\n`;
    const f = await setup(text, "node_test"), result = await f.host.execute(f.call);
    expect(result.receipt, readFileSync(join(result.operation, "stdout.raw"), "utf8") + readFileSync(join(result.operation, "stderr.raw"), "utf8")).toMatchObject({ outcome: "passed", exit_code: 0 });
    expect(readFileSync(join(result.operation, "stdout.raw"), "utf8")).toContain("ok 1 - real bounded checks");
    expect(readFileSync(join(f.root, "src/check.mjs"), "utf8")).toBe(text);
  });
  it("bounds the observed Windows spawnSync hang with the native deadline and retains a failed check", async () => {
    const text = `import {spawnSync} from 'node:child_process'; console.log('before child boundary'); spawnSync(process.execPath,['--version'],{timeout:500}); console.log('after child boundary');\n`;
    const f = await setup(text, "node_test"), result = await f.host.execute(f.call);
    expect(result.receipt).toMatchObject({ outcome: "failed", exit_code: 124, reason: "timeout" });
    const output = readFileSync(join(result.operation, "stdout.raw"), "utf8"); expect(output).toContain("before child boundary"); expect(output).not.toContain("after child boundary");
    expect(JSON.parse(readFileSync(join(result.operation, "native-ownership.json"), "utf8"))).toMatchObject({ resources_disposed: true });
  });
  it("rechecks actual Kernel revocation after source capture before starting a command", async () => {
    let revoke!: () => void;
    const f = await setup(undefined, "node_syntax", phase => { if (phase === "sources_captured") revoke(); });
    revoke = () => flowSuccess(f.humanKernel.execute(f.humanCommand("RevokeWorkItem", "work_item", f.item.id, { reason: "Revoke captured check" }, "technical_owner")));
    await expect(f.host.execute(f.call)).rejects.toThrow("tool_authority_denied");
    const data = join(f.options.dataDirectory, "workspace-checks", f.project.id), operation = join(data, readdirSync(data).find(value => /^[a-f0-9]{64}$/.test(value))!);
    expect(existsSync(join(operation, "not-started.json"))).toBe(true); expect(existsSync(join(operation, "native-proof.json"))).toBe(false);
    expect(readWorkspaceToolRunFacts(f.options.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 1, unresolved: 0, has_effect: false });
    await expect(f.host.execute(f.call)).rejects.toThrow("tool_authority_denied");
  });
  it("retains Unknown after durable dispatch loss and never launches a second command", async () => {
    const f = await setup(undefined, "node_syntax", phase => { if (phase === "dispatch_committed") throw Error("original dispatch lost"); });
    await expect(f.host.execute(f.call)).rejects.toThrow("original dispatch lost");
    await expect(f.host.execute(f.call)).rejects.toThrow("workspace_check_outcome_unproven");
    const data = join(f.options.dataDirectory, "workspace-checks", f.project.id), operation = join(data, readdirSync(data).find(value => /^[a-f0-9]{64}$/.test(value))!);
    expect(existsSync(join(operation, "dispatch.json"))).toBe(true); expect(existsSync(join(operation, "receipt.json"))).toBe(false);
    expect(existsSync(join(operation, "native-proof.json"))).toBe(false);
    expect(readWorkspaceToolRunFacts(f.options.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 1, unresolved: 1, has_effect: true });
    const usage = f.task().usage;
    expect(f.agentObserve(f.reserved.run, "succeeded")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    expect(f.agentReconcile(f.reserved.run, "succeeded")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
    expect(f.task().usage).toEqual(usage);
  });
  it("rejects command/environment/path injection before touching the workspace", async () => {
    const f = await setup();
    for (const fields of [{ command: "cmd.exe" }, { argv: ["--eval"] }, { env: { NODE_OPTIONS: "--require=host" } }, { nodeBinary: process.execPath }])
      expect(() => parseWorkspaceCheckCall({ ...f.call, ...fields })).toThrow("workspace_check_call_invalid");
    for (const fields of [{ entry: "../outside.js" }, { entry: "--eval.js" }, { inputs: [{ path: ".git/config", expected_digest: "a".repeat(64) }] }, { max_elapsed_ms: 0 }])
      expect(() => parseWorkspaceCheckRecipe({ ...f.recipe, ...fields }, f.scope)).toThrow();
    await expect(f.host.execute({ ...f.call, check_id: "not-installed" })).rejects.toThrow("workspace_check_unknown_id");
    expect(readdirSync(join(f.options.dataDirectory, "workspace-checks", f.project.id))).toEqual(["policy.json"]);
  });
  it("keeps truncated output Unknown and blocks parent settlement", async () => {
    const f = await setup("console.log('x'.repeat(8192));\n", "node_test", undefined, 1024);
    await expect(f.host.execute(f.call)).rejects.toThrow("workspace_check_completion_unproven");
    const data = join(f.options.dataDirectory, "workspace-checks", f.project.id), operation = join(data, readdirSync(data).find(value => /^[a-f0-9]{64}$/.test(value))!);
    expect(JSON.parse(readFileSync(join(operation, "capture.json"), "utf8"))).toMatchObject({ exceeded: true, maximum_bytes: 1024 });
    expect(readFileSync(join(operation, "stdout.raw")).length + readFileSync(join(operation, "stderr.raw")).length).toBeLessThanOrEqual(1024);
    expect(existsSync(join(operation, "receipt.json"))).toBe(false);
    expect(readWorkspaceToolRunFacts(f.options.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 1, unresolved: 1, has_effect: true });
    expect(f.agentObserve(f.reserved.run, "succeeded")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
  });
  it("refuses a full logical slot catalog without creating an unbounded operation directory", async () => {
    const f = await setup(), data = join(f.options.dataDirectory, "workspace-checks", f.project.id), slots = join(data, "slots"); mkdirSync(slots);
    // Constructed occupancy only; not 128 actual command executions or a disk quota.
    for (let index = 0; index < 128; index++) mkdirSync(join(slots, String(index)));
    await expect(f.host.execute(f.call)).rejects.toThrow("workspace_check_slots_exhausted");
    expect(readdirSync(data).sort()).toEqual(["policy.json", "slots"]);
  });
  it("recovers original resources after actual host/controller death while completion remains Unknown", async () => {
    const f = await setup("setInterval(()=>{},1000);\n", "node_test"), recipe = { ...f.recipe, max_elapsed_ms: 10000 };
    const options = { repositoryPath: f.root, dataDirectory: f.options.dataDirectory, scope: f.scope, recipes: [recipe] },
      requests = [{ ...f.scope, action: "read_files" as const, resource: recipe.entry }, { ...f.scope, action: "run_checks" as const, resource: recipe.entry }],
      assessments = requests.map(request => f.kernel.assessAgentRunTool(request));
    await expect(promisify(execFile)(process.execPath, [fileURLToPath(new URL("../../packages/runtime-adapter/test/workspace-check-host-worker.mjs", import.meta.url)),
      JSON.stringify(options), JSON.stringify(f.call), JSON.stringify(assessments)], { windowsHide: true, timeout: 30000 })).rejects.toMatchObject({ code: 73 });
    const recoveryHost = await AgentWorkspaceCheckHost.open({ ...f.options, recipes: [recipe] }); hosts.push(recoveryHost);
    const deadline = Date.now() + 10000; let recovery = await recoveryHost.recover(f.call);
    while (recovery.outcome !== "recovered" && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve,50)); recovery = await recoveryHost.recover(f.call); }
    expect(recovery).toMatchObject({ outcome: "recovered", resources_disposed: true, check_completion: "unknown" });
    expect(await recoveryHost.recover(f.call)).toMatchObject({ outcome: "recovered", resources_disposed: true, check_completion: "unknown" });
    await expect(recoveryHost.execute(f.call)).rejects.toThrow("workspace_check_outcome_unproven");
    expect(readWorkspaceToolRunFacts(f.options.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 1, unresolved: 1, has_effect: true });
    expect(f.agentReconcile(f.reserved.run, "succeeded")).toMatchObject({ code: "RECOVERY_CONDITIONS_UNMET" });
  });
});
