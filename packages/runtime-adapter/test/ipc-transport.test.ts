import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { IsolatedProbeAdapter, ipcProbeModule, validateIpcProbeDriver, type ProbeDriver } from "../src/operations.js";
import { buildWindowsLauncher, nativeControl } from "../src/native.js";
import { defaultExecutionPolicy } from "../src/execution-policy.js";
import { parseIpcTransportObservation } from "../src/ipc-observation.js";
import { parseRuntimeTransportProbe, runOpenCodeTransportProbe } from "../src/transport-probe.js";
import { waitForOperation } from "../src/probe.js";
import { parseRuntimeProbe } from "../src/probe.js";
import { recoverProbeOperation } from "../src/recovery.js";
import { digest, atomicJson } from "../src/files.js";
import { crashOwnedFixture } from "./owned-fixture.js";

describe("synthetic IPC contracts", () => {
  it("rejects network access, credentials, arbitrary modules and model IDs before launch", () => {
    const driver: ProbeDriver = { launcher: "unused", binary: "unused", binary_digest: digest("unused"), kind: "opencode_ipc_contract_fixture", model: "cimiloop-transport/probe", transport_module: ipcProbeModule() };
    expect(() => validateIpcProbeDriver(driver, defaultExecutionPolicy(), true)).not.toThrow();
    expect(() => validateIpcProbeDriver(driver, { network: { mode: "unrestricted_probe_only" }, cost: { mode: "unmetered_probe_only" } })).toThrow("invalid_ipc_probe_driver");
    expect(() => validateIpcProbeDriver({ ...driver, model: "actual/model" }, defaultExecutionPolicy())).toThrow();
    expect(() => validateIpcProbeDriver({ ...driver, connection: {} as NonNullable<ProbeDriver["connection"]> }, defaultExecutionPolicy())).toThrow("invalid_ipc_probe_driver");
    expect(() => validateIpcProbeDriver({ ...driver, transport_module: { path: "arbitrary.mjs", digest: digest("arbitrary") } }, defaultExecutionPolicy(), true)).toThrow("ipc_probe_module_changed");
    expect(() => validateIpcProbeDriver({ ...driver, kind: "native_contract_fixture" }, defaultExecutionPolicy())).toThrow();
  });
  it("keeps historic capsules queryable after the bundled module changes", () => {
    const driver: ProbeDriver = { launcher: "unused", binary: "unused", binary_digest: digest("unused"), kind: "opencode_ipc_contract_fixture", model: "cimiloop-transport/probe", transport_module: { path: "old-fixed-module.mjs", digest: digest("old") } };
    expect(() => validateIpcProbeDriver(driver, defaultExecutionPolicy())).not.toThrow();
    expect(() => validateIpcProbeDriver(driver, defaultExecutionPolicy(), true)).toThrow("ipc_probe_module_changed");
  });
  it("does not accept successful transport as model, cost, Human or formal Task proof", () => {
    expect(() => parseRuntimeTransportProbe({ scope: "isolated_provider_probe", transport_probe_passed: true })).toThrow();
    const proof = { schema_version: "2.0.0", scope: "isolated_provider_probe", operation_key: "fixture", phase: "ended", transport: "windows_named_pipe", runtime_pid: 1,
      client_identity_enforcement: "pid_creation_image", synthetic_response_only: true, remote_clients_rejected: true, frame_limit_bytes: 262144,
      accepted_requests: 0, attempts: [], failure_reason: null, external_model_requests: 0, formal_execution_enabled: false };
    expect(() => parseIpcTransportObservation(proof)).not.toThrow();
    for (const patch of [{ external_model_requests: 1 }, { actor_id: "human" }, { formal_execution_enabled: true }, { accepted_requests: 1 }]) expect(() => parseIpcTransportObservation({ ...proof, ...patch })).toThrow();
    const result = { schema_version: "2.0.0", scope: "synthetic_transport_probe", observed_at: new Date().toISOString(),
      provider: { name: "opencode", version: "fixture", binary_digest: digest("binary"), module_digest: digest("module") },
      sandbox: "windows_appcontainer_job", network_mode: "deny_all", operation: { schema_version: "2.0.0", scope: "isolated_provider_probe", operation_key: "fixture", input_digest: digest("input"), status: "Succeeded", cancel_requested: false,
        observed_at: new Date().toISOString(), reason: "synthetic_transport_completed", raw_refs: [], outputs: [], usage: { cost_known: false } },
      transport_probe_passed: true, external_model_requests: 0, actual_credentials_read: 0, formal_execution_enabled: false, evidence_refs: [], gaps: [] };
    expect(() => parseRuntimeTransportProbe(result)).not.toThrow(); expect(() => parseRuntimeProbe(result)).toThrow();
    for (const patch of [{ external_model_requests: 1 }, { actual_credentials_read: 1 }, { formal_execution_enabled: true }]) expect(() => parseRuntimeTransportProbe({ ...result, ...patch })).toThrow();
  });
  it("rejects invalid API elapsed limits before creating an artifact directory", async () => {
    await expect(runOpenCodeTransportProbe({ root: "unused", binary: "unused", maxElapsedMs: 0 })).rejects.toThrow("invalid_transport_probe_elapsed");
  });
});

describe.runIf(process.platform === "win32" && process.arch === "x64")("actual Windows IPC authorization", () => {
  let root: string, launcher: string, driver: ProbeDriver;
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "cimiloop-ipc-test-")); launcher = await buildWindowsLauncher(root);
    driver = { launcher, binary: launcher, binary_digest: digest(readFileSync(launcher)), kind: "native_ipc_contract_fixture", model: "cimiloop-transport/probe" };
  }, 60000);
  afterAll(async () => {
    if (existsSync(join(root, "operations"))) for (const key of readdirSync(join(root, "operations"))) {
      const adapter = new IsolatedProbeAdapter(root, driver); let recovery = await recoverProbeOperation(root, key);
      if (recovery.outcome === "active") { adapter.cancel(key); await waitForOperation(adapter, key, 20000); await delay(100); recovery = await recoverProbeOperation(root, key); }
      if (recovery.outcome !== "recovered") throw new Error(`Retaining IPC fixture: ${adapter.operationPath(key)}`);
    }
    if (!resolve(root).startsWith(resolve(tmpdir()) + "\\cimiloop-ipc-test-")) throw new Error("Invalid IPC cleanup target");
    rmSync(root, { recursive: true, force: true });
  }, 60000);
  const start = async (scenario: string, module = false, elapsed = 10000) => {
    const adapter = new IsolatedProbeAdapter(root, { ...driver, ...(module ? { transport_module: ipcProbeModule() } : {}) });
    const key = `ipc_${randomUUID().replaceAll("-", "")}`, input = { scope: "isolated_provider_probe" as const, operation_key: key, mode: "read" as const,
      files: [{ path: "input.txt", content: "visible" }], prompt: `fixture:ipc:${scenario}`, max_elapsed_ms: elapsed };
    await adapter.start(input); return { adapter, key, input, path: adapter.operationPath(key) };
  };
  const observation = (path: string) => parseIpcTransportObservation(JSON.parse(readFileSync(join(path, "ipc-transport-proof.json"), "utf8")));
  const until = async (check: () => boolean) => { const end = Date.now() + 10000; while (Date.now() < end) { try { if (check()) return; } catch { } await delay(50); } throw new Error("IPC observation did not settle"); };
  it("authenticates the actual child, deduplicates frames and never restarts a claimed operation", async () => {
    const { adapter, key, input, path } = await start("duplicate");
    expect(await waitForOperation(adapter, key, 20000)).toMatchObject({ status: "Succeeded", usage: { cost_known: false } });
    const proof = observation(path); expect(proof.accepted_requests).toBe(1); expect(proof.attempts.map(value => value.replay)).toEqual([false, true]);
    const original = readFileSync(join(path, "native-proof.json")); await adapter.start(input);
    expect(readFileSync(join(path, "native-proof.json"))).toEqual(original);
    const policy = JSON.parse(readFileSync(join(path, "execution-policy-proof.json"), "utf8")); expect(policy.capability_sids).toEqual([]);
    for (const ref of adapter.collect(key).raw_refs) expect(digest(readFileSync(ref.locator))).toEqual(ref.digest);
  }, 30000);
  it.each([["conflict", "request_id_conflict", 1], ["mismatch", "ipc_request_invalid", 0], ["malformed", "ipc_request_invalid", 0], ["oversize", "ipc_frame_limit", 0]])("rejects %s frames at the host", async (scenario, reason, accepted) => {
    const { adapter, key, path } = await start(String(scenario)); expect((await waitForOperation(adapter, key, 20000)).status).toBe("Succeeded");
    expect(observation(path)).toMatchObject({ accepted_requests: accepted, failure_reason: null });
    expect(observation(path).attempts.at(-1)).toMatchObject({ outcome: "rejected", reason });
  }, 30000);
  it("permits Bun-required attribute access while denying source and directory writes", async () => {
    const { adapter, key, path } = await start("module_acl", true); expect((await waitForOperation(adapter, key, 20000)).status).toBe("Succeeded");
    const event = readFileSync(join(path, "stdout.raw"), "utf8").split(/\r?\n/).find(line => line.includes("ipc.module_canary"))!;
    expect(JSON.parse(event)).toMatchObject({ readable: true, write_denied: true, directory_write_denied: true });
    expect(digest(readFileSync(join(path, "sandbox", "transport", "provider.mjs")))).toEqual(ipcProbeModule().digest);
    await delay(200); expect(await recoverProbeOperation(root, key)).toMatchObject({ outcome: "recovered", cleanup: { resources_disposed: true } });
  }, 30000);
  it("rejects another host process before reading a frame and refuses another AppContainer SID", async () => {
    const { adapter, key, path } = await start("hold", false, 20000); await until(() => observation(path).accepted_requests === 1);
    const request = JSON.parse(readFileSync(join(path, "request.json"), "utf8")) as { nonce: string }, pipe = `\\\\.\\pipe\\CimiLoop.${request.nonce}`;
    await new Promise<void>((done, fail) => { const client = createConnection(pipe); client.once("end", () => { client.destroy(); done(); }); client.once("error", () => done()); client.once("connect", () => client.write(Buffer.from("untrusted-host-frame"))); setTimeout(() => { client.destroy(); fail(new Error("Wrong PID not rejected")); }, 3000).unref(); });
    await until(() => observation(path).attempts.some(attempt => attempt.pid === process.pid && attempt.reason === "client_identity_mismatch"));
    const foreign = new IsolatedProbeAdapter(root, { ...driver, kind: "native_contract_fixture", model: "fixture" }), foreignKey = `foreign_${randomUUID().replaceAll("-", "")}`;
    await foreign.start({ scope: "isolated_provider_probe", operation_key: foreignKey, mode: "read", files: [{ path: "input.txt", content: "visible" }], prompt: `fixture:pipe:${pipe}`, max_elapsed_ms: 10000 });
    expect((await waitForOperation(foreign, foreignKey, 20000)).status).toBe("Succeeded");
    const event = readFileSync(join(foreign.operationPath(foreignKey), "stdout.raw"), "utf8").split(/\r?\n/).find(line => line.includes("ipc.other_container"))!;
    expect(JSON.parse(event)).toMatchObject({ connected: false, error_code: 5 });
    expect(observation(path).accepted_requests).toBe(1);
    adapter.cancel(key); expect((await waitForOperation(adapter, key, 20000)).status).toBe("Cancelled"); expect(observation(path).phase).toBe("ended");
    const proof = observation(path); atomicJson(join(path, "ipc-transport-proof.json"), { ...proof, runtime_pid: proof.runtime_pid + 1 });
    expect(adapter.query(key)).toMatchObject({ status: "Unknown", reason: "ipc_transport_unproven" }); atomicJson(join(path, "ipc-transport-proof.json"), proof);
  }, 45000);
  it("closes the ephemeral pipe on a native crash, recovers only owned resources and keeps completion Unknown", async () => {
    const { adapter, key, path } = await start("hold", true, 20000); await until(() => observation(path).accepted_requests === 1);
    const ownership = JSON.parse(readFileSync(join(path, "native-ownership.json"), "utf8")) as { native_identity: { pid: number; creation_ticks: string; image: string }; nonce: string };
    const identity = await nativeControl(launcher, ["--identity", String(ownership.native_identity.pid)]); expect(identity.value).toEqual(ownership.native_identity);
    await crashOwnedFixture(ownership.native_identity); await waitForOperation(adapter, key, 15000);
    // The verified controller exit can precede Job/Profile teardown. Reobserve
    // the full guarded recovery instead of assuming a fixed 200ms is sufficient.
    let recovery = await recoverProbeOperation(root, key); const deadline = Date.now() + 8000;
    while (recovery.outcome !== "recovered" && Date.now() < deadline) {
      await delay(100); recovery = await recoverProbeOperation(root, key);
    }
    expect(recovery, `Owned crash recovery: ${recovery.outcome}/${recovery.reason}`).toMatchObject({ outcome: "recovered", cleanup: { resources_disposed: true }, operation: { status: "Unknown" } });
    await expect(new Promise<void>((done, fail) => { const client = createConnection(`\\\\.\\pipe\\CimiLoop.${ownership.nonce}`); client.once("connect", () => { client.destroy(); done(); }); client.once("error", fail); })).rejects.toThrow();
    expect(observation(path).phase).toBe("running");
  }, 45000);
});
