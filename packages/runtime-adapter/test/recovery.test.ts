import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { compileValidator, RuntimeResourceObservationSchema, type RuntimeDiskLimits, type RuntimeResourceObservation } from "@cimiloop/protocol/v2";
import { IsolatedProbeAdapter, validateOperationInput, type ProbeOperationInput } from "../src/operations.js";
import { buildWindowsLauncher, isolatedEnvironment, nativeControl } from "../src/native.js";
import { recoverProbeOperation, parseRuntimeRecovery } from "../src/recovery.js";
import { atomicJson, digest, readJson } from "../src/files.js";
import { waitForOperation } from "../src/probe.js";

const execute = promisify(execFile), delay = (ms: number) => new Promise(done => setTimeout(done, ms));
const limits: RuntimeDiskLimits = { max_sandbox_bytes: 131072, max_sandbox_entries: 8, max_file_bytes: 65536, max_output_bytes: 8192 };
const input = (key: string, prompt = "held", elapsed = 15_000): ProbeOperationInput => ({ scope: "isolated_provider_probe", operation_key: key,
  mode: "write", files: [{ path: "input.txt", content: "visible" }], prompt, max_elapsed_ms: elapsed, disk_limits: limits });
const waitUntil = async (predicate: () => boolean, maximum = 20_000) => { const deadline = Date.now() + maximum; while (!predicate() && Date.now() < deadline) await delay(50); expect(predicate()).toBe(true); };

it("rejects invalid, unlimited, extra and already exhausted disk input before claiming an operation", () => {
  validateOperationInput(input("bounded"));
  for (const disk_limits of [{ ...limits, max_output_bytes: 0 }, { ...limits, max_sandbox_entries: 2048 },
    { ...limits, max_sandbox_bytes: Number.MAX_SAFE_INTEGER }, { ...limits, hard_quota: true }]) {
    expect(() => validateOperationInput({ ...input("bad"), disk_limits })).toThrow("invalid_disk_limits");
  }
  expect(() => validateOperationInput({ ...input("oversized"), files: [{ path: "input.txt", content: "x".repeat(65537) }] })).toThrow("probe_input_disk_limit_exceeded");
});

describe.runIf(process.platform === "win32" && process.arch === "x64")("actual owned Windows recovery and disk controls", () => {
  let root: string, launcher: string;
  beforeAll(async () => { root = mkdtempSync(join(tmpdir(), "cimiloop-recovery-test-")); launcher = await buildWindowsLauncher(root); }, 60_000);
  const adapters: IsolatedProbeAdapter[] = [];
  afterAll(async () => {
    for (const adapter of adapters) if (existsSync(join(adapter.root, "operations"))) for (const key of readdirSync(join(adapter.root, "operations"))) {
      const path = adapter.operationPath(key); if (!existsSync(join(path, "native-ownership.json"))) continue;
      let recovery = await recoverProbeOperation(adapter.root, key);
      if (recovery.outcome === "active") { adapter.cancel(key); await waitForOperation(adapter, key, 20_000); await delay(100); recovery = await recoverProbeOperation(adapter.root, key); }
      if (recovery.outcome !== "recovered") throw new Error(`Retaining owned fixture for recovery: ${path}: ${recovery.reason}`);
    }
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-recovery-test-")) throw new Error("Invalid dedicated cleanup target");
    rmSync(root, { recursive: true, force: true });
  }, 60_000);
  const adapterFor = (name: string) => { const adapter = new IsolatedProbeAdapter(join(root, name), { launcher, binary: launcher, binary_digest: digest(readFileSync(launcher)), kind: "native_contract_fixture", model: "fixture" }); adapters.push(adapter); return adapter; };
  // Open one verified Process handle before killing our own fixture. PID reuse
  // must never let the fixture fault injector kill an unrelated process.
  const crashOwner = async (identity: { pid: number; creation_ticks: string; image: string }) => {
    const script = "$ErrorActionPreference='Stop'; try { $fixtureProcess=[Diagnostics.Process]::GetProcessById([int]$env:CIMILOOP_FIXTURE_PID) } catch [ArgumentException] { exit 0 }; $fixtureHandle=$fixtureProcess.Handle; if ($fixtureProcess.HasExited) { exit 0 }; if ($fixtureProcess.StartTime.ToUniversalTime().ToFileTimeUtc().ToString() -ne $env:CIMILOOP_FIXTURE_CREATED -or $fixtureProcess.MainModule.FileName -ne $env:CIMILOOP_FIXTURE_IMAGE) { throw 'Fixture identity changed' }; $fixtureProcess.Kill(); $fixtureProcess.WaitForExit(5000) | Out-Null";
    await execute(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, timeout: 10_000,
        env: { ...isolatedEnvironment(), CIMILOOP_FIXTURE_PID: String(identity.pid), CIMILOOP_FIXTURE_CREATED: identity.creation_ticks, CIMILOOP_FIXTURE_IMAGE: identity.image } });
  };
  const started = async (adapter: IsolatedProbeAdapter, request: ProbeOperationInput) => {
    await adapter.start(request); const path = adapter.operationPath(request.operation_key);
    await waitUntil(() => existsSync(join(path, "native-proof.json")) && (readJson(join(path, "native-proof.json")) as { phase: string }).phase === "running");
    return path;
  };
  const nativeOwner = (path: string) => (readJson(join(path, "native-ownership.json")) as { native_identity: { pid: number; creation_ticks: string; image: string } }).native_identity;

  it.each(["disk", "total", "entries"] as const)("terminates a real job exceeding sandbox %s thresholds and fixes its raw observation", async kind => {
    const adapter = adapterFor(kind), request = input(`limit_${kind}`, `fixture:${kind}`, 3000);
    if (kind === "total") request.disk_limits = { ...limits, max_sandbox_bytes: 65536 };
    await adapter.start(request);
    const result = await waitForOperation(adapter, request.operation_key, 20_000);
    expect(result).toMatchObject({ status: "Failed", reason: "disk_budget_exhausted" });
    const ref = result.raw_refs.find(ref => ref.version === "resource-proof.json")!;
    const observation = compileValidator<RuntimeResourceObservation>(RuntimeResourceObservationSchema)(JSON.parse(readFileSync(ref.locator, "utf8")));
    expect(observation.enforcement).toBe("sampled_job_termination"); expect(observation.limits).toEqual(request.disk_limits);
    expect(observation.reason).toBe(kind === "disk" ? "file_bytes" : kind === "total" ? "sandbox_bytes" : "sandbox_entries");
    expect(digest(readFileSync(ref.locator))).toEqual(ref.digest);
    expect((await adapter.start(request)).status).toBe("Failed");
  }, 30_000);

  it("bounds combined raw stdout and stderr before writing and proves actual job termination on overflow", async () => {
    const adapter = adapterFor("output"), request = input("output_limit", "fixture:output", 3000); await adapter.start(request);
    const result = await waitForOperation(adapter, request.operation_key, 20_000), path = adapter.operationPath(request.operation_key);
    expect(result).toMatchObject({ status: "Failed", reason: "output_budget_exhausted" });
    expect(statSync(join(path, "stdout.raw")).size + statSync(join(path, "stderr.raw")).size).toBeLessThanOrEqual(limits.max_output_bytes);
    expect(readJson(join(path, "native-proof.json"))).toMatchObject({ phase: "ended", reason: "output_limit" });
  }, 30_000);

  it("pins effective default limits and their digest so later configuration edits cannot alter a persisted operation", async () => {
    const adapter = adapterFor("pinned-limits"), request = input("pinned_limits", "held", 300); delete request.disk_limits;
    await adapter.start(request); await waitForOperation(adapter, request.operation_key, 20_000);
    const path = adapter.operationPath(request.operation_key), file = join(path, "request.json"), original = readFileSync(file), saved = JSON.parse(original.toString());
    expect(saved.effective_disk_limits).toMatchObject({ max_sandbox_bytes: 64 * 1024 * 1024, max_output_bytes: 8 * 1024 * 1024 });
    expect((readJson(join(path, "resource-proof.json")) as { limits: unknown }).limits).toEqual(saved.effective_disk_limits);
    atomicJson(file, { ...saved, effective_disk_limits: { ...saved.effective_disk_limits, max_output_bytes: 1024 } });
    try { expect(() => adapter.query(request.operation_key)).toThrow("operation_record_corrupt"); }
    finally { writeFileSync(file, original); }
    expect((await adapter.start(request)).status).toBe("Failed");
  }, 30_000);

  it("keeps active owners intact, without cancelling, deleting state or starting again", async () => {
    const adapter = adapterFor("active"), request = input("active_owner"), path = await started(adapter, request);
    const state = join(path, "sandbox", "state", "preserved.txt"); writeFileSync(state, "fixture state");
    const before = readFileSync(join(path, "native-ownership.json"));
    try {
      const result = await recoverProbeOperation(adapter.root, request.operation_key);
      expect(result).toMatchObject({ outcome: "active", cleanup: { resources_disposed: false, state_removed: false } });
      expect(readFileSync(join(path, "native-ownership.json"))).toEqual(before); expect(readFileSync(state, "utf8")).toBe("fixture state");
      expect(adapter.query(request.operation_key).cancel_requested).toBe(false);
      expect(() => parseRuntimeRecovery({ ...result, task_id: "fake" })).toThrow();
    } finally { adapter.cancel(request.operation_key); await waitForOperation(adapter, request.operation_key, 20_000); }
  }, 30_000);

  it("recovers a forcibly killed native controller and preserves Unknown completion with immutable original proof", async () => {
    const adapter = adapterFor("native-crash"), request = input("native_crash"), path = await started(adapter, request);
    const original = readFileSync(join(path, "native-proof.json")); await crashOwner(nativeOwner(path));
    await waitUntil(() => existsSync(join(path, "result.json"))); await delay(200);
    const result = await recoverProbeOperation(adapter.root, request.operation_key);
    expect(result).toMatchObject({ outcome: "recovered", cleanup: { resources_disposed: true, state_removed: true }, operation: { status: "Unknown" } });
    expect(readFileSync(join(path, "native-proof.json"))).toEqual(original);
    expect((await adapter.start(request)).status).toBe("Unknown"); expect(readdirSync(join(adapter.root, "operations"))).toEqual([request.operation_key]);
    expect((await recoverProbeOperation(adapter.root, request.operation_key)).outcome).toBe("recovered");
  }, 40_000);

  it("cleans orphaned model state after both owners die, without inventing output completion or restarting", async () => {
    const adapter = adapterFor("double-crash"), request = input("double_crash"), path = await started(adapter, request);
    const state = join(path, "sandbox", "state", "private.txt"); writeFileSync(state, "SYNTHETIC-PRIVATE-STATE");
    const supervisor = readJson(join(path, "supervisor.json")) as { identity: { pid: number; creation_ticks: string; image: string } };
    const native = nativeOwner(path); await crashOwner(supervisor.identity); await crashOwner(native); await delay(100);
    expect(existsSync(state)).toBe(true); expect(existsSync(join(path, "result.json"))).toBe(false);
    const result = await recoverProbeOperation(adapter.root, request.operation_key);
    expect(result).toMatchObject({ outcome: "recovered", cleanup: { resources_disposed: true, state_removed: true },
      operation: { status: "Unknown", reason: "crash_recovered_completion_unproven" } });
    expect(existsSync(join(path, "sandbox", "state"))).toBe(false);
    expect((await adapter.start(request)).reason).toBe("crash_recovered_completion_unproven");
  }, 40_000);

  it("refuses a forged nonce before touching resources and can recover after the genuine owner record is restored", async () => {
    const adapter = adapterFor("mismatch"), request = input("owner_mismatch", "held", 300); await adapter.start(request); await waitForOperation(adapter, request.operation_key, 20_000);
    const path = adapter.operationPath(request.operation_key), file = join(path, "native-ownership.json"), original = readFileSync(file);
    const state = join(path, "sandbox", "state"); mkdirSync(state); writeFileSync(join(state, "owned.txt"), "preserve");
    atomicJson(file, { ...JSON.parse(original.toString()), nonce: randomUUID() });
    const refused = await recoverProbeOperation(adapter.root, request.operation_key);
    expect(refused).toMatchObject({ outcome: "unknown", cleanup: { resources_disposed: false, state_removed: false } });
    expect(readFileSync(join(state, "owned.txt"), "utf8")).toBe("preserve");
    writeFileSync(file, original); expect((await recoverProbeOperation(adapter.root, request.operation_key)).outcome).toBe("recovered");
  }, 30_000);

  it("leaves another operation's mapped drive intact when a pending ownership record names the wrong drive", async () => {
    const first = adapterFor("wrong-drive"), firstInput = input("wrong_drive"), firstPath = await started(first, firstInput);
    await crashOwner(nativeOwner(firstPath)); await waitUntil(() => existsSync(join(firstPath, "result.json"))); await delay(100);
    const second = adapterFor("other-drive"), secondInput = input("other_drive"), secondPath = await started(second, secondInput);
    const file = join(firstPath, "native-ownership.json"), original = readFileSync(file), other = readJson(join(secondPath, "native-ownership.json")) as { mapping: string };
    try {
      atomicJson(file, { ...JSON.parse(original.toString()), mapping: other.mapping, resources_disposed: false });
      expect(await recoverProbeOperation(first.root, firstInput.operation_key)).toMatchObject({ outcome: "unknown", reason: "drive_ownership_mismatch" });
      expect(second.query(secondInput.operation_key)).toMatchObject({ status: "Running", cancel_requested: false });
      expect(readFileSync(join(secondPath, "sandbox", "workspace", "input.txt"), "utf8")).toBe("visible");
    } finally {
      writeFileSync(file, original); await recoverProbeOperation(first.root, firstInput.operation_key);
      second.cancel(secondInput.operation_key); await waitForOperation(second, secondInput.operation_key, 20_000);
    }
  }, 40_000);

  it("checks process creation identity and rejects an image mismatch without treating a reused PID as the old owner", async () => {
    const adapter = adapterFor("pid-reuse"), request = input("pid_reuse", "held", 300); await adapter.start(request); await waitForOperation(adapter, request.operation_key, 20_000);
    const path = adapter.operationPath(request.operation_key), file = join(path, "native-ownership.json"), original = readFileSync(file);
    const current = (await nativeControl(launcher, ["--identity", String(process.pid)])).value as { pid: number; creation_ticks: string };
    const ledger = JSON.parse(original.toString());
    try {
      atomicJson(file, { ...ledger, native_identity: { ...ledger.native_identity, pid: current.pid, creation_ticks: current.creation_ticks } });
      expect(await recoverProbeOperation(adapter.root, request.operation_key)).toMatchObject({ outcome: "unknown", reason: "process_identity_unproven" });
      atomicJson(file, { ...ledger, native_identity: { ...ledger.native_identity, pid: current.pid, creation_ticks: String(BigInt(current.creation_ticks) - 1n) } });
      expect((await recoverProbeOperation(adapter.root, request.operation_key)).outcome).toBe("recovered");
      expect(process.pid).toBe(current.pid);
    } finally { writeFileSync(file, original); }
  }, 30_000);

  it("discards unsanitized dedicated workspace after a real synthetic DPAPI child loses its controller, without reading the credential during recovery", async () => {
    // A local fixture executable writes a synthetic credential and holds. It
    // never calls any model, network endpoint or existing user credential.
    const source = join(root, "dedicated-fixture.cs"), binary = join(root, "dedicated-fixture.exe"), key = "SYNTHETIC_RECOVERY_CREDENTIAL_" + randomUUID().replaceAll("-", "");
    writeFileSync(source, 'using System; using System.IO; using System.Threading; class Fixture { static int Main() { string value=Environment.GetEnvironmentVariable("CIMILOOP_RUNTIME_API_KEY"); File.WriteAllText("input.txt",value); File.WriteAllText(Path.Combine(Environment.GetEnvironmentVariable("HOME"),"provider-state.txt"),value); Console.WriteLine("fixture-held"); Thread.Sleep(30000); return 0; } }');
    await execute(join(process.env.SystemRoot ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"), ["/nologo", "/target:exe", `/out:${binary}`, source], { windowsHide: true, env: isolatedEnvironment() });
    const script = "Add-Type -AssemblyName System.Security; $fixtureBytes=[Text.Encoding]::UTF8.GetBytes($env:CIMILOOP_FIXTURE_KEY); $fixtureEntropy=[Text.Encoding]::UTF8.GetBytes('CimiLoop runtime agent credential v1'); [Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($fixtureBytes,$fixtureEntropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)))";
    const encrypted = await execute(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, env: { ...isolatedEnvironment(), CIMILOOP_FIXTURE_KEY: key } });
    const file = join(root, "synthetic-credential.json"), bytes = Buffer.from(JSON.stringify({ format: "cimiloop/credential/dpapi/1.0.0", ciphertext: encrypted.stdout.trim() })); writeFileSync(file, bytes);
    const adapter = new IsolatedProbeAdapter(join(root, "dedicated-crash"), { launcher, binary, binary_digest: digest(readFileSync(binary)), kind: "opencode", model: "zhipuai-coding-plan/glm-5.3",
      connection: { format: "cimiloop/dedicated-model/1.0.0", provider: "zhipuai-coding-plan", model: "zhipuai-coding-plan/glm-5.3", credential_file: file, credential_digest: digest(bytes) } }); adapters.push(adapter);
    const request = { ...input("dedicated_crash"), execution_policy: { network: { mode: "unrestricted_probe_only" as const }, cost: { mode: "unmetered_probe_only" as const } } }, path = await started(adapter, request), workspace = join(path, "sandbox", "workspace");
    await waitUntil(() => readFileSync(join(workspace, "input.txt"), "utf8") === key);
    const supervisor = readJson(join(path, "supervisor.json")) as { identity: { pid: number; creation_ticks: string; image: string } }; const native = nativeOwner(path);
    await crashOwner(supervisor.identity); await crashOwner(native); writeFileSync(file, "credential no longer readable or valid");
    const recovered = await recoverProbeOperation(adapter.root, request.operation_key);
    expect(recovered).toMatchObject({ outcome: "recovered", cleanup: { resources_disposed: true, state_removed: true, workspace_discarded: true }, operation: { status: "Unknown" } });
    expect(existsSync(workspace)).toBe(false); expect(recovered.raw_refs.every(ref => !readFileSync(ref.locator).includes(Buffer.from(key)))).toBe(true);
    expect((await recoverProbeOperation(adapter.root, request.operation_key)).cleanup.workspace_discarded).toBe(true);
    expect((await adapter.start(request)).status).toBe("Unknown");
  }, 45_000);

  it("exposes strict real CLI recovery and refuses legacy claims lacking durable ownership", async () => {
    const adapter = adapterFor("cli"), request = input("cli_recover", "held", 300); await adapter.start(request); await waitForOperation(adapter, request.operation_key, 20_000);
    const completed = adapter.query(request.operation_key);
    const run = (...args: string[]) => spawnSync(process.execPath, [resolve("apps/cli/dist/bin.js"), "--json", "runtime", "recover", ...args, "--output-dir", adapter.root], { encoding: "utf8", windowsHide: true });
    const result = run(request.operation_key); expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(parseRuntimeRecovery(JSON.parse(result.stdout))).toMatchObject({ outcome: "recovered", operation: { status: completed.status, reason: completed.reason } });
    const key = "legacy_ack", path = adapter.operationPath(key), legacy = { ...request, operation_key: key }; mkdirSync(path);
    atomicJson(join(path, "request.json"), { input: legacy, input_digest: digest(JSON.stringify({ input: legacy, driver: adapter.driver })), driver: adapter.driver, nonce: randomUUID() });
    const refused = run(key); expect(refused.status).toBe(1);
    expect(parseRuntimeRecovery(JSON.parse(refused.stdout))).toMatchObject({ outcome: "unknown", reason: "durable_ownership_missing" });
    expect(existsSync(join(path, "sandbox"))).toBe(false); expect((await adapter.start(legacy)).status).toBe("Unknown");
  }, 30_000);
});
