import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentRunProject } from "../fixtures/agent-run-project.js";
import { parseAgentWorkspaceToolScope, runOpenCodeWorkspaceToolRehearsal, recoverOpenCodeWorkspaceToolRehearsal, readWorkspaceToolRunFacts } from "../../packages/runtime-adapter/src/index.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { isolatedEnvironment } from "../../packages/runtime-adapter/src/native.js";
vi.setConfig({ testTimeout: 120000 });
const execute = promisify(execFile);

// Actual original Windows processes/resources. No Runtime resume/model call;
// positive Native Agent admission remains the constructed fixture port.
describe.runIf(process.platform === "win32" && process.arch === "x64")("original OpenCode startup resource recovery", () => {
  const roots: string[] = [], stores: { close(): void }[] = [];
  afterEach(context => {
    while (stores.length) stores.pop()!.close();
    while (roots.length) {
      const root = roots.pop()!; if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-opencode-startup-")) throw Error("Unsafe startup fixture cleanup");
      const operations = join(root, ".git", "cimiloop", "workspace-tool-rehearsals");
      if (existsSync(operations)) for (const name of readdirSync(operations)) {
        const operation = join(operations, name), resources = join(operation, "agent-sandbox-resources.json"), foreign = join(operation, "foreign-mapping.json");
        if (!existsSync(resources) || JSON.parse(readFileSync(resources, "utf8")).resources_disposed !== true || existsSync(foreign) && !existsSync(join(operation, "foreign-released"))) throw Error("Retain original startup resources: " + operation);
      }
      if (context.task.result?.state === "fail") { console.error("Retain failed original startup fixture: " + root); continue; }
      rmSync(root, { recursive: true, force: true });
    }
  });
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-opencode-startup-")); roots.push(root);
    const f = createAgentRunProject(root, "task_execution", 100, undefined, ["read_files", "edit_files"]); stores.push(f.store);
    const prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared), dataDirectory = dirname(f.path);
    const scope = parseAgentWorkspaceToolScope({ project_id: f.project.id, run_id: reserved.run.id, operation_key: reserved.record.operation_key,
      executor_actor_id: f.agent.id, context_digest: prepared.context.input_digest, ...f.pins, host_admission_ref: prepared.context.host_admission_ref });
    const binary = join(process.env.APPDATA!, "npm/node_modules/opencode-ai/node_modules/opencode-windows-x64/bin/opencode.exe");
    expect(digest(readFileSync(binary)).value).toBe("5283c2cd5b4285855daa97e6f7d17bf48146227cdf2a940e79e0f2b7869fd06e");
    const options = { root: dataDirectory, binary, scope, path: "src/query.ts", expectedDigest: digest(readFileSync(join(root, "src/query.ts"))).value, replacement: "export const query = () => 7;\n" };
    return { ...f, root, scope, reserved, dataDirectory, options };
  }
  async function os(operation: string, mode: "inspect" | "reserve" | "release" = "inspect") {
    const script = fileURLToPath(new URL("../../packages/runtime-adapter/test/agent-startup-os-probe.ps1", import.meta.url));
    const result = await execute(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-File", script, "-Mode", mode, "-Operation", operation], { windowsHide: true, timeout: 15000, env: isolatedEnvironment() });
    return JSON.parse(result.stdout.trim());
  }
  async function orphan(phase: string) {
    const f = setup(), pointer = join(f.root, "owned-startup-pointer.json"), worker = fileURLToPath(new URL("../../packages/runtime-adapter/test/agent-workspace-startup-worker.mjs", import.meta.url));
    await expect(execute(process.execPath, [worker, JSON.stringify(f.options), phase, pointer], { windowsHide: true, timeout: 40000, env: isolatedEnvironment() })).rejects.toMatchObject({ code: 73 });
    const original = JSON.parse(readFileSync(pointer, "utf8")), operation = original.operation as string;
    const resources = JSON.parse(readFileSync(join(operation, "agent-sandbox-resources.json"), "utf8"));
    expect(resources.phase).toBe(phase); expect(resources.resources_disposed).toBe(false); expect(resources.supervisor).toEqual(original.supervisor);
    return { ...f, operation, resources, recovery: { root: f.dataDirectory, operation, scope: f.scope } };
  }
  it.each(["registered", "grants_intent", "granted", "mapped", "process_create_intent", "runtime_created"])("recovers actual original controller/host death at %s without inferring completion", async phase => {
    const f = await orphan(phase), sequence = f.store.asOfEventSequence(), usage = f.task().usage, before = await os(f.operation);
    expect(before.original_job_active).toBeLessThanOrEqual(0);
    if (phase === "registered") expect(before.original_profile_present).toBe(false); else expect(before.original_profile_present).toBe(true);
    if (["granted", "mapped", "process_create_intent", "runtime_created"].includes(phase)) expect(before.original_grants).toBeGreaterThan(0);
    if (["mapped", "process_create_intent", "runtime_created"].includes(phase)) expect(before.original_mapping_present).toBe(true);
    if (phase === "runtime_created") expect(f.resources.runtime).toBeNull(); // Actual create-to-identity gap.
    const recovered = await Promise.all([recoverOpenCodeWorkspaceToolRehearsal(f.recovery), recoverOpenCodeWorkspaceToolRehearsal(f.recovery)]);
    expect(recovered.every(result => result.outcome === "recovered" && result.resources_disposed && result.completion_proven === false)).toBe(true);
    expect(await os(f.operation)).toMatchObject({ original_grants: 0, original_mapping_present: false, original_profile_present: false });
    expect(await recoverOpenCodeWorkspaceToolRehearsal(f.recovery)).toMatchObject({ outcome: "recovered", reason: "agent_resources_already_disposed", completion_proven: false });
    expect(existsSync(join(f.operation, "agent-sandbox-original.json"))).toBe(false); expect(existsSync(join(f.operation, "result.json"))).toBe(false);
    expect(readWorkspaceToolRunFacts(f.dataDirectory, f.project, f.reserved.record)).toEqual({ invocations: 0, unresolved: 0, has_effect: false });
    expect(f.store.asOfEventSequence()).toBe(sequence); expect(f.store.getRun(f.reserved.run.id)!.status).toBe("Reserved"); expect(f.task().usage).toEqual(usage);
    expect(readFileSync(join(f.root, "src/query.ts"), "utf8")).toBe("export const query = () => 1;\n");
  });
  it("refuses recovery while original owners are active and records bounded phase failure without resource leaks", async () => {
    const f = setup(); let operation = "";
    await expect(runOpenCodeWorkspaceToolRehearsal({ ...f.options, connect: async () => { throw Error("Must not resume"); }, prepare: async original => {
      if (original.phase !== "mapped") return; operation = original.operation;
      const before = await os(operation);
      expect(await recoverOpenCodeWorkspaceToolRehearsal({ root: f.dataDirectory, operation, scope: f.scope })).toMatchObject({ outcome: "active", resources_disposed: false, completion_proven: false });
      expect(await os(operation)).toEqual(before); throw Error("original_preparation_cancelled");
    } })).rejects.toThrow("original_preparation_cancelled");
    expect(JSON.parse(readFileSync(join(operation, "agent-sandbox-resources.json"), "utf8"))).toMatchObject({ phase: "ended", resources_disposed: true });
    expect(JSON.parse(readFileSync(join(operation, "incomplete.json"), "utf8"))).toMatchObject({ suspended_observed: false, completion_proven: false, resource_disposal_proven: false });
    expect(readFileSync(join(operation, "stdout.raw"), "utf8")).toContain('"phase":"mapped"');
    expect(await os(operation)).toMatchObject({ original_grants: 0, original_mapping_present: false, original_profile_present: false });
  });
  it("refuses foreign DOS mapping, corrupt authority/launcher and missing original registration without erasing another resource", async () => {
    const f = await orphan("mapped"), resourcePath = join(f.operation, "agent-sandbox-resources.json"), original = readFileSync(resourcePath);
    const foreign = await os(f.operation, "reserve");
    let recovered = false;
    try {
      writeFileSync(resourcePath, JSON.stringify({ ...f.resources, mapping: foreign.mapping }));
      expect(await recoverOpenCodeWorkspaceToolRehearsal(f.recovery)).toMatchObject({ outcome: "unknown", reason: "agent_original_mapping_mismatch", resources_disposed: false });
      expect(await os(f.operation)).toMatchObject({ foreign_mapping_present: true, original_profile_present: true });
      writeFileSync(resourcePath, original);
      writeFileSync(resourcePath, JSON.stringify({ ...f.resources, logon_luid: "0".repeat(16) }));
      expect(await recoverOpenCodeWorkspaceToolRehearsal(f.recovery)).toMatchObject({ outcome: "unknown", reason: "agent_original_logon_mismatch", resources_disposed: false });
      writeFileSync(resourcePath, original);
      await expect(recoverOpenCodeWorkspaceToolRehearsal({ ...f.recovery, scope: { ...f.scope, context_digest: digest("other original Context") } })).rejects.toThrow("workspace_rehearsal_recovery_unproven");
      const launcherPath = join(f.operation, "original-launcher.json"), launcherBytes = readFileSync(launcherPath), launcher = JSON.parse(launcherBytes.toString("utf8"));
      try { writeFileSync(launcherPath, JSON.stringify({ ...launcher, launcher_digest: "0".repeat(64) })); await expect(recoverOpenCodeWorkspaceToolRehearsal(f.recovery)).rejects.toThrow("workspace_rehearsal_recovery_unproven"); }
      finally { writeFileSync(launcherPath, launcherBytes); }
      const retainedLauncher = join(f.operation, "fixture-retained-launcher.json"); renameSync(launcherPath, retainedLauncher);
      try { expect(await recoverOpenCodeWorkspaceToolRehearsal(f.recovery)).toMatchObject({ outcome: "unknown", reason: "agent_original_registration_missing", resources_disposed: false }); }
      finally { renameSync(retainedLauncher, launcherPath); }
      expect(await recoverOpenCodeWorkspaceToolRehearsal(f.recovery)).toMatchObject({ outcome: "recovered", completion_proven: false });
      recovered = true;
      expect(await os(f.operation)).toMatchObject({ foreign_mapping_present: true, original_profile_present: false, original_grants: 0 });
    } finally {
      try {
        if (!recovered) { writeFileSync(resourcePath, original); await recoverOpenCodeWorkspaceToolRehearsal(f.recovery); }
      } finally {
        await os(f.operation, "release"); writeFileSync(join(f.operation, "foreign-released"), "Own foreign mapping released");
      }
    }
  });
});
