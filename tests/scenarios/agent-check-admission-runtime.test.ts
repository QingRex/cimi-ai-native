import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { randomInt } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { LocalAgentCheckAdmission, LocalAgentWorkspaceToolService, type AgentWorkspaceToolLocalContext } from "../../packages/local-app/src/index.js";
import { parseAgentWorkspaceToolScope, readWorkspaceToolRunFacts, runOpenCodeWorkspaceToolRehearsal, type WorkspaceCheckTemplate } from "../../packages/runtime-adapter/src/index.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
import { flowTime, flowSuccess } from "../fixtures/flow-project.js";
import { CimiLoopKernel, type AgentRunAdmissionInput } from "../../packages/kernel/src/index.js";
vi.setConfig({ testTimeout: 180000 });

// Actual Native Context/Run, captured worktree bytes, OS policy, SDK and Node.
// Full Provider qualification, account custody and model replies are explicitly
// constructed. These tests prove checks integration, not full Runtime admission.
describe.runIf(process.platform === "win32" && process.arch === "x64")("original Context admits fresh fixed checks", () => {
  const roots: string[] = [], stores: { close(): void }[] = [], closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    while (closers.length) await closers.pop()!(); while (stores.length) stores.pop()!.close();
    while (roots.length) {
      const root = roots.pop()!; if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-check-admission-")) throw Error("Unsafe admission cleanup");
      const data = join(root, ".git", "cimiloop"), rehearsals = join(data, "workspace-tool-rehearsals"), checks = join(data, "workspace-checks");
      if (existsSync(rehearsals)) for (const name of readdirSync(rehearsals)) {
        const proof = join(rehearsals, name, "agent-sandbox-cleanup.json");
        if (!existsSync(proof) || JSON.parse(readFileSync(proof, "utf8")).resources_disposed !== true) throw Error("Retain original Runtime resources: " + proof);
      }
      if (existsSync(checks)) for (const project of readdirSync(checks)) for (const name of readdirSync(join(checks, project))) {
        if (!/^[a-f0-9]{64}$/.test(name)) continue; const proof = join(checks, project, name, "native-ownership.json");
        if (existsSync(proof) && JSON.parse(readFileSync(proof, "utf8")).resources_disposed !== true) throw Error("Retain original check resources: " + proof);
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
  async function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-check-admission-")); roots.push(root);
    const f = createAgentRunProject(root, "task_execution", 100, [{ provider: "cimiloop_workspace", resource_type: "repository_path", locator: "src/**", version: "1.0.0" }], ["read_files", "run_checks"], ["src/**"]); stores.push(f.store);
    const harness = "import test from 'node:test'; import assert from 'node:assert/strict'; import {query} from './query.ts'; test('fresh actual query',()=>assert.ok(query()>1));\n";
    writeFileSync(join(root, "src/check.mjs"), harness);
    const template: WorkspaceCheckTemplate = { check_id: "query_test", profile: "node_test", entry: "src/check.mjs", inputs: [{ path: "src/check.mjs", expected_digest: digest(harness).value }, { path: "src/query.ts" }], max_elapsed_ms: 4000, max_output_bytes: 32768 };
    const dataDirectory = dirname(f.path), originalAdmit = f.runPort.agent.admitContext;
    const admissionInput = (input: AgentRunAdmissionInput) => ({ task: input.task, work_item: input.work_item, source: input.source, workspace: input.workspace, runtime_binding: input.runtime_binding, skill_bindings: input.skill_bindings });
    const custody = { admit: originalAdmit, verify: (project: Parameters<typeof originalAdmit>[0], input: Parameters<NonNullable<typeof f.runPort.agent.checkToolAuthority>>[1], original: ReturnType<typeof originalAdmit>) => {
      const current = originalAdmit(project, admissionInput(input));
      if (current.digest.value !== original.digest.value) throw Error("Constructed original custody changed");
      return contentDigest({ constructed: true, original, request: input.request });
    } };
    const options = { repositoryPath: root, dataDirectory, nodeBinary: process.execPath, projectId: f.project.id, templates: [template], custody }, admission = await LocalAgentCheckAdmission.open(options);
    f.runPort.agent.admitContext = (project, input) => admission.admit(project, input);
    f.runPort.agent.checkToolAuthority = (project, input) => admission.validateTool(project, input);
    const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => flowTime, runVerifier: f.runPort });
    const edit = () => { const text = `export const query = () => ${randomInt(2, 10000)};\n`; writeFileSync(join(root, "src/query.ts"), text); return text; };
    const start = async (prepared = f.prepareAgent(), admitted = admission) => {
      const reserved = f.reserveAgent(prepared), scope = parseAgentWorkspaceToolScope({ project_id: f.project.id, run_id: reserved.run.id, operation_key: reserved.record.operation_key, executor_actor_id: f.agent.id,
        context_digest: prepared.context.input_digest, ...f.pins, host_admission_ref: prepared.context.host_admission_ref });
      const local: AgentWorkspaceToolLocalContext = { caller: f.caller, store: f.store, kernel, location: { repositoryKind: "git", repositoryPath: root, dataDirectory, databasePath: f.path,
        instancePath: join(dataDirectory, "instance.json"), suggestedName: "Actual checks with constructed full Runtime custody" } };
      const service = await LocalAgentWorkspaceToolService.open(local, reserved.run.id); closers.push(() => service.close());
      await service.installAdmittedChecks(admitted); return { reserved, scope, prepared, service };
    };
    return { ...f, root, dataDirectory, harness, template, options, admission, edit, start, admissionInput };
  }
  it("captures an unpredictable actual edit in a new Context and checks it through original SDK without predicted replacement bytes", async () => {
    const f = await setup(), old = f.prepareAgent(), text = f.edit();
    f.git("add", "src/query.ts", "src/check.mjs"); f.git("commit", "--quiet", "-m", "Actual edited source for fresh verification");
    const source = f.capture(), command = f.prepareCommand(), result = flowSuccess(f.kernel.execute({ ...command, payload: { ...f.pins, source_snapshot_ref: { object_type: "source_snapshot", id: source.id } } }));
    if (result.command_type !== "PrepareRunContext" || !("runtime_binding" in result.data.context)) throw Error("Fresh Agent Context expected");
    const fresh = { ...result.data, context: result.data.context };
    expect(fresh.context.host_admission_ref.digest.value).not.toBe(old.context.host_admission_ref.digest.value);
    const stale = f.kernel.execute(f.reserveCommand(old)); expect(stale).toMatchObject({ code: "INPUT_CHANGED" });
    const restored = await LocalAgentCheckAdmission.open(f.options), started = await f.start(fresh, restored), catalog = await started.service.getCheckCatalog();
    expect(catalog.recipes[0]!.inputs[1]!.expected_digest).toBe(digest(text).value);
    const manual = await LocalAgentWorkspaceToolService.open({ caller: f.caller, store: f.store, kernel: f.kernel, location: { repositoryKind: "git", repositoryPath: f.root, dataDirectory: f.dataDirectory,
      databasePath: f.path, instancePath: join(f.dataDirectory, "instance.json"), suggestedName: "Original admitted catalog required" } }, started.reserved.run.id); closers.push(() => manual.close());
    await expect(manual.installChecks(process.execPath, catalog.recipes)).rejects.toThrow("Agent original admitted checks required");
    const sequence = f.store.asOfEventSequence(), usage = f.task().usage, binary = join(process.env.APPDATA!, "npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe");
    expect(digest(readFileSync(binary)).value).toBe("5283c2cd5b4285855daa97e6f7d17bf48146227cdf2a940e79e0f2b7869fd06e");
    const rehearsal = await runOpenCodeWorkspaceToolRehearsal({ root: f.dataDirectory, binary, scope: started.scope, mode: "checks", checkCatalog: catalog, checkId: "query_test", maxElapsedMs: f.item.budget.max_elapsed_ms,
      connect: (supervisor, originalSupervisor, peer, nonce, signal) => started.service.openIpc(supervisor, originalSupervisor, peer, { nonce, signal }) });
    const parts = rehearsal.events.filter(event => event.type === "tool_use").map(event => event.part as any); expect(parts.map(part => part.tool)).toEqual(["cimi_check"]);
    const output = JSON.parse(parts[0].state.output); expect(output).toMatchObject({ outcome: "passed", exit_code: 0, check_catalog_digest: catalog.catalog_digest, formal_agent_execution_enabled: false });
    expect(output.call_id).toBe("sdk_" + digest(JSON.stringify([parts[0].sessionID, parts[0].messageID, parts[0].callID])).value);
    const original = JSON.parse(readFileSync(join(f.dataDirectory, "objects", fresh.context.host_admission_ref.locator), "utf8"));
    expect(original.recipes).toEqual(catalog.recipes); expect(original.original_host_admission_ref).toBeDefined();
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, started.reserved.record)).toEqual({ invocations: 1, unresolved: 0, has_effect: true });
    expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe(text); expect(rehearsal.mode).toBe("checks");
    expect(f.store.getRun(started.reserved.run.id)!.status).toBe("Reserved"); expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.task().usage).toEqual(usage);
  });
  it("refuses changed live source after reservation without dispatching or substituting its admitted digest", async () => {
    const f = await setup(); f.edit(); const started = await f.start(), catalog = await started.service.getCheckCatalog(); f.edit();
    await expect(started.service.runChecks({ format: "cimiloop/workspace-check-call/1.0.0", call_id: "sdk_stale", check_id: "query_test" })).rejects.toThrow();
    expect((await started.service.getCheckCatalog()).catalog_digest).toBe(catalog.catalog_digest);
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, started.reserved.record)).toEqual({ invocations: 1, unresolved: 0, has_effect: false });
    const root = join(f.dataDirectory, "workspace-checks", f.project.id), operation = readdirSync(root).find(name => /^[a-f0-9]{64}$/.test(name))!;
    expect(existsSync(join(root, operation, "dispatch.json"))).toBe(false); expect(existsSync(join(root, operation, "not-started.json"))).toBe(true);
  });
  it("denies a model-changed fixed harness before creating Context or Run", async () => {
    const f = await setup(); f.edit(); const sequence = f.store.asOfEventSequence(); writeFileSync(join(f.root, "src/check.mjs"), "console.log('pretend pass');\n");
    expect(f.kernel.execute(f.prepareCommand())).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(f.store.listRuntimeRecords("context_manifest", f.change.id)).toHaveLength(0); expect(f.store.asOfEventSequence()).toBe(sequence);
  });
  it("pins the whole template and original Runtime admission across reservation", async () => {
    const f = await setup(); f.edit(); const prepared = f.prepareAgent(); f.state.admission_epoch++;
    expect(f.kernel.execute(f.reserveCommand(prepared))).toMatchObject({ code: "INPUT_CHANGED" });
    f.state.admission_epoch--; const altered = await LocalAgentCheckAdmission.open({ ...f.options, templates: [{ ...f.template, max_elapsed_ms: 4500 }] });
    f.runPort.agent.admitContext = (project, input) => altered.admit(project, input);
    expect(f.kernel.execute(f.reserveCommand(prepared))).toMatchObject({ code: "INPUT_CHANGED" });
    expect(f.store.listRuns(f.change.id)).toHaveLength(0);
  });
  it("rechecks original custody and Human revocation before granting check authority", async () => {
    const f = await setup(); f.edit(); const started = await f.start();
    expect(f.kernel.assessAgentRunTool({ ...started.scope, action: "run_checks", resource: "src/query.ts" })).toMatchObject({ decision: "DENY", reasons: ["AGENT_TOOL_HOST_PROOF_UNPROVEN"] });
    f.state.admission_available = false;
    await expect(started.service.runChecks({ format: "cimiloop/workspace-check-call/1.0.0", call_id: "sdk_missing_custody", check_id: "query_test" })).rejects.toThrow("tool_authority_denied");
    f.state.admission_available = true;
    flowSuccess(f.humanKernel.execute(f.humanCommand("RevokeWorkItem", "work_item", f.item.id, { reason: "Revoke original admitted fixed checks" }, "technical_owner")));
    await expect(started.service.runChecks({ format: "cimiloop/workspace-check-call/1.0.0", call_id: "sdk_revoked", check_id: "query_test" })).rejects.toThrow("tool_authority_denied");
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, started.reserved.record).invocations).toBe(0);
  });
  it("refuses damaged original admission content or installation policy", async () => {
    const f = await setup(); f.edit(); const started = await f.start(), object = join(f.dataDirectory, "objects", started.prepared.context.host_admission_ref.locator), bytes = readFileSync(object);
    writeFileSync(object, "{}"); await expect(started.service.getCheckCatalog()).rejects.toThrow("Raw result digest mismatch"); writeFileSync(object, bytes);
    const policy = join(f.dataDirectory, "workspace-checks", f.project.id, "policy.json"), original = readFileSync(policy);
    writeFileSync(policy, "{}"); await expect(started.service.getCheckCatalog()).rejects.toThrow("workspace_check_policy_conflict"); writeFileSync(policy, original);
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, started.reserved.record).invocations).toBe(0);
  });
});
