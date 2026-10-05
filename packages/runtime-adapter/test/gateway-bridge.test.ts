import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, existsSync, readdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { IsolatedProbeAdapter, validateIpcProbeDriver, type ProbeDriver } from "../src/operations.js";
import { gatewayFixturePolicy, gatewayProbeModule, parseGatewayBridgeObservation, parseGatewayTransportObservation } from "../src/gateway-bridge.js";
import { runOpenCodeGatewayBridgeProbe } from "../src/gateway-bridge-probe.js";
import { buildWindowsLauncher } from "../src/native.js";
import { digest, readJson, atomicJson } from "../src/files.js";
import { defaultExecutionPolicy } from "../src/execution-policy.js";
import { waitForOperation } from "../src/probe.js";
import { recoverProbeOperation } from "../src/recovery.js";
import { crashOwnedFixture } from "./owned-fixture.js";
import { GATEWAY_RESERVATION } from "../src/model-gateway.js";
describe("gateway bridge capsules", () => {
  const driver: ProbeDriver = { launcher: "unused", binary: "unused", binary_digest: digest("unused"), kind: "opencode_gateway_contract_fixture",
    model: "cimiloop-gateway/cimiloop-synthetic-text", transport_module: gatewayProbeModule(), gateway_fixture: gatewayFixturePolicy() };
  it("freezes the synthetic model, certificate, budget and module before claiming an operation", () => {
    expect(() => validateIpcProbeDriver(driver, defaultExecutionPolicy(), true)).not.toThrow();
    for (const patch of [{ model: "actual/model" }, { connection: {} as NonNullable<ProbeDriver["connection"]> },
      { gateway_fixture: { ...gatewayFixturePolicy(), maximum_micro_units: GATEWAY_RESERVATION - 1 } },
      { gateway_fixture: { ...gatewayFixturePolicy(), url: "https://example.com" } }, { transport_module: { path: "arbitrary.mjs", digest: digest("arbitrary") } }])
      expect(() => validateIpcProbeDriver({ ...driver, ...patch }, defaultExecutionPolicy(), true)).toThrow();
    expect(() => validateIpcProbeDriver(driver, { network: { mode: "unrestricted_probe_only" }, cost: { mode: "unmetered_probe_only" } })).toThrow();
    expect(() => validateIpcProbeDriver({ ...driver, kind: "native_contract_fixture" }, defaultExecutionPolicy())).toThrow();
  });
  it("allows historic frozen modules while rejecting them for a new start", () => {
    const old = { ...driver, transport_module: { path: "historic.mjs", digest: digest("old") } };
    expect(() => validateIpcProbeDriver(old, defaultExecutionPolicy())).not.toThrow();
    expect(() => validateIpcProbeDriver(old, defaultExecutionPolicy(), true)).toThrow("gateway_probe_capsule_changed");
  });
  it("rejects invalid probe elapsed time before creating artifacts", async () => {
    await expect(runOpenCodeGatewayBridgeProbe({ root: "unused", binary: "unused", maxElapsedMs: 0 })).rejects.toThrow("invalid_gateway_bridge_elapsed");
  });
});
describe.runIf(process.platform === "win32" && process.arch === "x64")("actual AppContainer IPC to HTTPS gateway", () => {
  let root: string, driver: ProbeDriver;
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "cimiloop-gateway-bridge-test-")); const launcher = await buildWindowsLauncher(root);
    driver = { launcher, binary: launcher, binary_digest: digest(readFileSync(launcher)), kind: "native_gateway_contract_fixture", model: "cimiloop-gateway/cimiloop-synthetic-text", gateway_fixture: gatewayFixturePolicy() };
  }, 60000);
  afterAll(async () => {
    if (existsSync(join(root, "operations"))) for (const key of readdirSync(join(root, "operations"))) {
      const adapter = new IsolatedProbeAdapter(root, driver); let recovered = await recoverProbeOperation(root, key);
      if (recovered.outcome === "active") { adapter.cancel(key); await delay(500); recovered = await recoverProbeOperation(root, key); }
      if (recovered.outcome !== "recovered") throw new Error(`Retaining owned gateway fixture ${adapter.operationPath(key)}`);
    }
    if (!resolve(root).startsWith(resolve(tmpdir()) + "\\cimiloop-gateway-bridge-test-")) throw new Error("Invalid cleanup target"); rmSync(root, { recursive: true, force: true });
  }, 60000);
  const start = async (scenario: string, mode: "valid" | "timeout" = "valid", cap = 8) => {
    const adapter = new IsolatedProbeAdapter(root, { ...driver, gateway_fixture: gatewayFixturePolicy(cap, mode) }), key = `gateway_${randomUUID().replaceAll("-", "")}`;
    const input = { scope: "isolated_provider_probe" as const, operation_key: key, mode: "read" as const, files: [{ path: "input.txt", content: "Synthetic" }], prompt: `fixture:gateway:${scenario}`, max_elapsed_ms: 20000 };
    await adapter.start(input); return { adapter, key, input, path: adapter.operationPath(key) };
  };
  const until = async (check: () => boolean) => { const end = Date.now() + 15000; while (Date.now() < end) { try { if (check()) return; } catch { } await delay(50); } throw new Error("Gateway observation incomplete"); };
  const host = (path: string) => parseGatewayBridgeObservation(readJson(join(path, "gateway-host-proof.json")));
  const transport = (path: string) => parseGatewayTransportObservation(readJson(join(path, "gateway-transport-proof.json")));
  const sent = (path: string) => (readJson(join(path, "gateway-upstream-proof.json")) as { requests: unknown[] }).requests.length === 1;
  it("authenticates the real runtime and replays one reply without another HTTP request", async () => {
    const op = await start("duplicate"); expect((await waitForOperation(op.adapter, op.key, 25000)).status).toBe("Succeeded");
    expect(transport(op.path)).toMatchObject({ accepted_requests: 1, failure_reason: null }); expect(transport(op.path).attempts.map(a => a.replay)).toEqual([false, true]);
    expect(host(op.path)).toMatchObject({ phase: "ended", synthetic_http_requests: 1, budget: { completed: 1, held_micro_units: GATEWAY_RESERVATION } });
    const proof = readFileSync(join(op.path, "native-proof.json")); await op.adapter.start(op.input); expect(readFileSync(join(op.path, "native-proof.json"))).toEqual(proof);
    const policy = readJson(join(op.path, "execution-policy-proof.json")) as { capability_sids: string[] }; expect(policy.capability_sids).toEqual([]);
    for (const ref of op.adapter.collect(op.key).raw_refs) expect(digest(readFileSync(ref.locator))).toEqual(ref.digest);
  }, 30000);
  it("refuses conflicting request IDs and excessive output before spending another reservation", async () => {
    for (const scenario of ["conflict", "invalid"]) {
      const op = await start(scenario); expect((await waitForOperation(op.adapter, op.key, 25000)).status).toBe("Succeeded");
      expect(host(op.path).budget.held_micro_units).toBe(scenario === "conflict" ? GATEWAY_RESERVATION : 0);
      if (scenario === "conflict") expect(transport(op.path).attempts.at(-1)?.reason).toBe("request_id_conflict");
      else expect(host(op.path).attempts.at(-1)?.reason).toBe("gateway_request_denied");
    }
  }, 30000);
  it("denies AppContainer reads or writes to the host mailbox and ledger directory", async () => {
    const op = await start("private_acl"); expect((await waitForOperation(op.adapter, op.key, 25000)).status).toBe("Succeeded");
    const lines = readFileSync(join(op.path, "stdout.raw"), "utf8").split(/\r?\n/), canary = lines.map(s => { try { return JSON.parse(s); } catch { return {}; } }).find(v => v.event_type === "gateway.private_canary");
    expect(canary).toMatchObject({ read_denied: true, write_denied: true, mailbox_write_denied: true }); expect(host(op.path).synthetic_http_requests).toBe(1);
  }, 30000);
  it("rejects a second unique request when the durable budget is exhausted", async () => {
    const op = await start("budget", "valid", 1); expect((await waitForOperation(op.adapter, op.key, 25000)).status).toBe("Succeeded");
    expect(host(op.path)).toMatchObject({ synthetic_http_requests: 1, budget: { held_micro_units: GATEWAY_RESERVATION, completed: 1, unknown: 0 } });
    expect(host(op.path).attempts.at(-1)?.reason).toBe("gateway_budget_exhausted");
  }, 30000);
  it("cancels the runtime and an already received HTTPS request while retaining its reservation", async () => {
    const op = await start("valid", "timeout"); await until(() => sent(op.path)); op.adapter.cancel(op.key);
    expect((await waitForOperation(op.adapter, op.key, 25000)).status).toBe("Cancelled");
    expect(host(op.path)).toMatchObject({ phase: "ended", synthetic_http_requests: 1, budget: { unknown: 1, held_micro_units: GATEWAY_RESERVATION } });
  }, 30000);
  it("records cancellation when the runtime exits normally before the next watcher sample", async () => {
    const op = await start("cancel_race"); await until(() => existsSync(join(op.path, "native-proof.json")));
    op.adapter.cancel(op.key); writeFileSync(join(op.path, "sandbox", "workspace", "cancel-trigger.txt"), "synthetic");
    expect((await waitForOperation(op.adapter, op.key, 25000)).status).toBe("Cancelled");
    expect(host(op.path).budget.held_micro_units).toBe(0);
  }, 30000);
  it("treats an unread reply pipe breaking after host cancellation as normal teardown", async () => {
    const op = await start("cancel_drain");
    await until(() => readFileSync(join(op.path, "stdout.raw"), "utf8").includes("gateway.cancel_drain_ready"));
    expect(host(op.path).budget.completed).toBe(1); op.adapter.cancel(op.key);
    expect((await waitForOperation(op.adapter, op.key, 25000)).status).toBe("Cancelled");
    expect(transport(op.path)).toMatchObject({ phase: "ended", accepted_requests: 1, failure_reason: null });
    expect(host(op.path)).toMatchObject({ budget: { completed: 1, unknown: 0, held_micro_units: GATEWAY_RESERVATION } });
  }, 30000);
  it("recovers an exact native controller crash without refunding or restarting the request", async () => {
    const op = await start("valid", "timeout"); await until(() => sent(op.path));
    const owner = readJson(join(op.path, "native-ownership.json")) as { native_identity: Parameters<typeof crashOwnedFixture>[0] }; await crashOwnedFixture(owner.native_identity);
    expect((await waitForOperation(op.adapter, op.key, 25000)).status).toBe("Unknown"); await delay(200);
    const old = readFileSync(join(op.path, "native-proof.json")), recovered = await recoverProbeOperation(root, op.key); expect(recovered.outcome).toBe("recovered");
    const budget = readJson(join(op.path, "gateway-recovery.json")) as { budget: { unknown: number; held_micro_units: number }; restarted_requests: number };
    expect(budget).toMatchObject({ restarted_requests: 0, budget: { unknown: 1, held_micro_units: GATEWAY_RESERVATION } });
    expect(readFileSync(join(op.path, "native-proof.json"))).toEqual(old); await op.adapter.start(op.input); expect(readFileSync(join(op.path, "native-proof.json"))).toEqual(old);
  }, 30000);
  it("reconciles a lost host supervisor only after all original OS owners have ended", async () => {
    const op = await start("valid", "timeout"); await until(() => sent(op.path));
    const active = await recoverProbeOperation(root, op.key); expect(active.outcome).toBe("active"); expect(existsSync(join(op.path, "gateway-recovery.json"))).toBe(false);
    const supervisor = readJson(join(op.path, "supervisor.json")) as { identity: Parameters<typeof crashOwnedFixture>[0] }; await crashOwnedFixture(supervisor.identity);
    const old = readFileSync(join(op.path, "gateway-host-proof.json")); let recovered = await recoverProbeOperation(root, op.key);
    // Parent loss may also end its OS children. Use the original identity
    // observations; never assume they must survive the fault injection.
    if (recovered.outcome === "active") { op.adapter.cancel(op.key); await until(() => (readJson(join(op.path, "native-proof.json")) as { phase: string }).phase === "ended"); recovered = await recoverProbeOperation(root, op.key); }
    const end = Date.now() + 10000; while (recovered.outcome === "unknown" && Date.now() < end) { await delay(100); recovered = await recoverProbeOperation(root, op.key); }
    expect(recovered.outcome).toBe("recovered");
    expect(readJson(join(op.path, "gateway-recovery.json"))).toMatchObject({ restarted_requests: 0, budget: { unknown: 1, held_micro_units: GATEWAY_RESERVATION } });
    expect(readFileSync(join(op.path, "gateway-host-proof.json"))).toEqual(old); expect(op.adapter.query(op.key).status).toBe("Unknown");
  }, 30000);
  it("rejects a forged host mailbox nonce before any HTTPS request or reservation", async () => {
    const op = await start("paused"); await until(() => existsSync(join(op.path, "gateway", "owner.json")) && existsSync(join(op.path, "native-proof.json")));
    const id = randomUUID(); atomicJson(join(op.path, "gateway", "requests", `${id}.json`), { format: "cimiloop/ipc-gateway-mailbox/1.0.0", nonce: "forged",
      operation_key: op.key, native_pid: 1, runtime_pid: 1, policy_digest: "a".repeat(64), request_id: id, request_digest: "a".repeat(64), frame_base64: "e30=" });
    expect((await waitForOperation(op.adapter, op.key, 25000)).status).toBe("Unknown");
    expect(host(op.path)).toMatchObject({ failure_reason: "gateway_mailbox_identity_unproven", synthetic_http_requests: 0, budget: { held_micro_units: 0 } });
  }, 30000);
  it("does not accept damaged host or native policy proofs as completion", async () => {
    const op = await start("valid"); await waitForOperation(op.adapter, op.key, 25000);
    const proof = host(op.path); atomicJson(join(op.path, "gateway-host-proof.json"), { ...proof, gateway_policy_digest: digest("forged") });
    expect(op.adapter.query(op.key)).toMatchObject({ status: "Unknown", reason: "gateway_bridge_unproven" }); atomicJson(join(op.path, "gateway-host-proof.json"), proof);
    const native = transport(op.path); atomicJson(join(op.path, "gateway-transport-proof.json"), { ...native, runtime_pid: native.runtime_pid + 1 }); expect(op.adapter.query(op.key).status).toBe("Unknown");
    atomicJson(join(op.path, "gateway-transport-proof.json"), native); expect(op.adapter.query(op.key).status).toBe("Succeeded");
  }, 30000);
});
