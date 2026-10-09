import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { LocalAgentWorkspaceToolService, type AgentWorkspaceToolLocalContext } from "../../packages/local-app/src/index.js";
import { AgentWorkspaceCheckHost, parseAgentWorkspaceToolScope, readWorkspaceToolRunFacts, runOpenCodeWorkspaceToolRehearsal, collectAgentRuntimeOperation, type WorkspaceCheckRecipe } from "../../packages/runtime-adapter/src/index.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
import { flowTime, flowSuccess } from "../fixtures/flow-project.js";
vi.setConfig({ testTimeout: 180000 });

// Actual OpenCode SDK toolCtx, original OS-authenticated pipe, source edits and
// Node checks. Model replies, expected edit bytes and positive admission are
// explicitly constructed; this is not real model/Skill or production admission.
describe.runIf(process.platform === "win32" && process.arch === "x64")("OpenCode consumes fixed original checks", () => {
  const roots: string[] = [], closers: (() => Promise<void>)[] = [], stores: { close(): void }[] = [];
  afterEach(async context => {
    while (closers.length) await closers.pop()!(); while (stores.length) stores.pop()!.close();
    while (roots.length) {
      const root = roots.pop()!;
      if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-opencode-check-")) throw Error("Unsafe check fixture cleanup");
      const data = join(root, ".git", "cimiloop"), rehearsals = join(data, "workspace-tool-rehearsals");
      if (existsSync(rehearsals)) for (const name of readdirSync(rehearsals)) {
        const proof = join(rehearsals, name, "agent-sandbox-cleanup.json");
        if (!existsSync(proof) || JSON.parse(readFileSync(proof, "utf8")).resources_disposed !== true) throw Error("Retain original Runtime resources: " + proof);
      }
      const checks = join(data, "workspace-checks");
      if (existsSync(checks)) for (const project of readdirSync(checks)) for (const name of readdirSync(join(checks, project))) {
        if (!/^[a-f0-9]{64}$/.test(name)) continue;
        const proof = join(checks, project, name, "native-ownership.json");
        if (existsSync(proof) && JSON.parse(readFileSync(proof, "utf8")).resources_disposed !== true) throw Error("Retain original checker resources: " + proof);
      }
      if (context.task.result?.state === "fail") { console.error("Retain failed original check fixture: " + root); continue; }
      rmSync(root, { recursive: true, force: true });
    }
  });
  async function setup(expected: number, delay = 0, revoke = false) {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-opencode-check-")); roots.push(root);
    const f = createAgentRunProject(root, "task_execution", 100, [{ provider: "cimiloop_workspace", resource_type: "repository_path", locator: "src/**", version: "1.0.0" }],
      ["read_files", "edit_files", "run_checks"], ["src/**"], ["src/**"]); stores.push(f.store);
    const replacement = "export const query = () => 7;\n", entry = "src/check.mjs";
    const test = `import test from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs';
test('actual edited query', async () => { await new Promise(done=>setTimeout(done,${delay})); assert.equal(readFileSync(new URL('./query.ts',import.meta.url),'utf8'),${JSON.stringify(`export const query = () => ${expected};\n`)}); });\n`;
    writeFileSync(join(root, entry), test);
    f.runPort.agent.checkToolAuthority = (project, input) => contentDigest({ constructed: true, project_id: project.id, request: input.request });
    const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, runVerifier: f.runPort }), prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared), dataDirectory = dirname(f.path);
    const scope = parseAgentWorkspaceToolScope({ project_id: f.project.id, run_id: reserved.run.id, operation_key: reserved.record.operation_key, executor_actor_id: f.agent.id,
      context_digest: prepared.context.input_digest, ...f.pins, host_admission_ref: prepared.context.host_admission_ref });
    let revoked = false;
    const assess = (request: Parameters<typeof kernel.assessAgentRunTool>[0]) => {
      if (revoke && request && typeof request === "object" && "action" in request && request.action === "run_checks" && !revoked) {
        revoked = true; flowSuccess(f.humanKernel.execute(f.humanCommand("RevokeWorkItem", "work_item", f.item.id, { reason: "Revoke after real edit before actual check" }, "technical_owner")));
      }
      return kernel.assessAgentRunTool(request);
    };
    const local: AgentWorkspaceToolLocalContext = { caller: f.caller, store: f.store, kernel: { assessAgentRunTool: assess }, location: { repositoryKind: "git", repositoryPath: root,
      dataDirectory, databasePath: f.path, instancePath: join(dataDirectory, "instance.json"), suggestedName: "Actual SDK checks with constructed model/admission" } };
    const service = await LocalAgentWorkspaceToolService.open(local, reserved.run.id); closers.push(() => service.close());
    const recipe: WorkspaceCheckRecipe = { check_id: "query_test", profile: "node_test", entry, inputs: [{ path: entry, expected_digest: digest(test).value }, { path: "src/query.ts", expected_digest: digest(replacement).value }],
      max_elapsed_ms: 30000, max_output_bytes: 32768 };
    await service.installChecks(process.execPath, [recipe]); const checkCatalog = await service.getCheckCatalog();
    const binary = join(process.env.APPDATA!, "npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe");
    expect(digest(readFileSync(binary)).value).toBe("5283c2cd5b4285855daa97e6f7d17bf48146227cdf2a940e79e0f2b7869fd06e");
    const options = { root: dataDirectory, binary, scope, path: "src/query.ts", expectedDigest: digest(readFileSync(join(root, "src/query.ts"))).value, replacement,
      checkCatalog, checkId: "query_test", maxElapsedMs: 90000,
      connect: (supervisor: Parameters<typeof service.openIpc>[0], originalSupervisor: Parameters<typeof service.openIpc>[1], originalPeer: Parameters<typeof service.openIpc>[2], nonce: string, signal?: AbortSignal) =>
        service.openIpc(supervisor, originalSupervisor, originalPeer, { nonce, signal }) };
    return { ...f, root, reserved, scope, dataDirectory, recipe, service, options, assess };
  }
  it("checks actual edited bytes beyond the old 20-second channel limit and replays the original passed operation once", async () => {
    const f = await setup(7, 21000), sequence = f.store.asOfEventSequence(), usage = f.task().usage, result = await runOpenCodeWorkspaceToolRehearsal(f.options);
    const tools = result.events.filter(event => event.type === "tool_use").map(event => event.part as any);
    expect(tools.map(part => part.tool)).toEqual(["cimi_read", "cimi_replace", "cimi_check"]); expect(tools.every(part => part.state.status === "completed")).toBe(true);
    const output = JSON.parse(tools[2].state.output);
    expect(output).toMatchObject({ check_id: "query_test", check_catalog_digest: f.options.checkCatalog.catalog_digest, outcome: "passed", exit_code: 0, replay: false, formal_agent_execution_enabled: false });
    expect(output.call_id).toMatch(/^sdk_[a-f0-9]{64}$/); expect(output.call_id).not.toBe("original_2");
    expect(output.call_id).toBe("sdk_" + digest(JSON.stringify([tools[2].sessionID, tools[2].messageID, tools[2].callID])).value);
    expect(result.events.find(event => event.event === "cimiloop.workspace_boundary")).toMatchObject({ catalog_write_denied: true });
    expect(result.channel.attempts).toEqual(Array.from({ length: 3 }, () => ({ outcome: "completed", reason: null })));
    expect(result.check_catalog_digest).toBe(f.options.checkCatalog.catalog_digest); expect(result.synthetic_model_responses).toBe(true);
    if (f.reserved.record.run_kind !== "agent") throw Error("Agent record expected");
    const collected = await collectAgentRuntimeOperation(f.dataDirectory, f.scope, { project: f.project, record: f.reserved.record });
    expect(collected.ipc).toMatchObject({ status: "Observed", exchanges: 3, unresolved: 0, correlation: { uncorrelated_exchanges: 0, unmatched_sdk_calls: 0, model_account_custody_proven: false } });
    expect(collected.native).toMatchObject({ status: "Verified", matched_calls: 3, native_effect_reverified: true, model_account_custody_proven: false });
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 3, unresolved: 0, has_effect: true });
    const host = await AgentWorkspaceCheckHost.open({ repositoryPath: f.root, dataDirectory: f.dataDirectory, nodeBinary: process.execPath, scope: f.scope, recipes: [f.recipe], assess: f.assess });
    try {
      const replay = await host.execute({ format: "cimiloop/workspace-check-call/1.0.0", call_id: output.call_id, check_id: "query_test" });
      expect(replay.replay).toBe(true); expect(replay.receipt.call_id).toBe(output.call_id);
      const original = JSON.parse(readFileSync(join(replay.operation, "request.json"), "utf8")); expect(original.input.recipe).toEqual(f.recipe);
      expect(readFileSync(join(replay.operation, "stdout.raw"), "utf8")).toContain("ok 1 - actual edited query");
      expect(JSON.parse(readFileSync(join(replay.operation, "native-ownership.json"), "utf8"))).toMatchObject({ resources_disposed: true });
      const ownershipPath = join(replay.operation, "native-ownership.json"), ownershipBytes = readFileSync(ownershipPath);
      try {
        writeFileSync(ownershipPath, JSON.stringify({ ...JSON.parse(ownershipBytes.toString("utf8")), nonce: "00000000-0000-4000-8000-000000000000" }));
        const changed = await collectAgentRuntimeOperation(f.dataDirectory, f.scope, { project: f.project, record: f.reserved.record });
        expect(changed.native).toMatchObject({ status: "Unknown", native_effect_reverified: false });
        expect(changed.ipc.correlation_reason).toBe("agent_sdk_originals_correlated");
      } finally { writeFileSync(ownershipPath, ownershipBytes); }
    } finally { await host.close(); }
    expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved"); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
  });
  it("keeps an actual failing Node assertion as failed SDK output", async () => {
    const f = await setup(8), result = await runOpenCodeWorkspaceToolRehearsal(f.options), part = result.events.find(event => event.type === "tool_use" && (event.part as any).tool === "cimi_check")!.part as any;
    expect(part.state.status).toBe("completed"); expect(JSON.parse(part.state.output)).toMatchObject({ outcome: "failed", exit_code: 1, reason: "exited", formal_agent_execution_enabled: false });
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 3, unresolved: 0, has_effect: true });
  });
  it("honors Human revocation after real file edits and before check dispatch", async () => {
    const f = await setup(7, 0, true), result = await runOpenCodeWorkspaceToolRehearsal(f.options);
    expect(result.channel.attempts).toEqual([{ outcome: "completed", reason: null }, { outcome: "completed", reason: null }, { outcome: "denied", reason: "tool_authority_denied" }]);
    expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe(f.options.replacement);
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 2, unresolved: 0, has_effect: true });
    const part = result.events.find(event => event.type === "tool_use" && (event.part as any).tool === "cimi_check")!.part as any; expect(part.state.status).toBe("error");
  });
});
