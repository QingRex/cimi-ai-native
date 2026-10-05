import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createServer, createConnection, type Server } from "node:net";
import { createSocket } from "node:dgram";
import { defaultExecutionPolicy, requireSupportedExecutionPolicy, parseExecutionPolicyObservation } from "../src/execution-policy.js";
import { IsolatedProbeAdapter, type ProbeOperationInput } from "../src/operations.js";
import { atomicJson, digest, readJson } from "../src/files.js";
import { buildWindowsLauncher } from "../src/native.js";
import { waitForOperation } from "../src/probe.js";
import { recoverProbeOperation } from "../src/recovery.js";

const input = (key: string): ProbeOperationInput => ({ scope: "isolated_provider_probe", operation_key: key,
  mode: "read", files: [{ path: "input.txt", content: "visible" }], prompt: "held", max_elapsed_ms: 100 });
const broadPolicy = () => ({ network: { mode: "unrestricted_probe_only" as const }, cost: { mode: "unmetered_probe_only" as const } });

it("distinguishes probe access from enforced hosts and cost caps, rejecting invalid declarations", () => {
  expect(requireSupportedExecutionPolicy(defaultExecutionPolicy())).toEqual(defaultExecutionPolicy());
  expect(requireSupportedExecutionPolicy(broadPolicy(), true)).toEqual(broadPolicy());
  expect(() => requireSupportedExecutionPolicy(defaultExecutionPolicy(), true)).toThrow("model_network_access_denied");
  expect(() => requireSupportedExecutionPolicy({ ...broadPolicy(), network: { mode: "host_allowlist", hosts: ["open.bigmodel.cn"] } })).toThrow("network_host_enforcement_unavailable");
  expect(() => requireSupportedExecutionPolicy({ ...broadPolicy(), cost: { mode: "required_cap", max_cost_microusd: 10000 } })).toThrow("cost_enforcement_unavailable");
  for (const policy of [{ ...broadPolicy(), bypass: true }, { ...broadPolicy(), cost: { mode: "required_cap", max_cost_microusd: 0 } },
    { ...broadPolicy(), network: { mode: "host_allowlist", hosts: ["https://example.com/path"] } },
    { ...broadPolicy(), network: { mode: "deny_all", hosts: [] } }]) expect(() => requireSupportedExecutionPolicy(policy)).toThrow("invalid_execution_policy");
});

it("rejects unsupported host/cost limits and implicit model network access before claiming or loading credentials", async () => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-policy-unit-"));
  try {
    const adapter = new IsolatedProbeAdapter(root, { launcher: "absent-controller", binary: "absent-runtime", binary_digest: digest("fixture"), kind: "opencode", model: "zhipuai-coding-plan/glm-5.3",
      connection: { format: "cimiloop/dedicated-model/1.0.0", provider: "zhipuai-coding-plan", model: "zhipuai-coding-plan/glm-5.3", credential_file: join(root, "unreadable-credential.json"), credential_digest: digest("synthetic") } });
    await expect(adapter.start(input("model_denied"))).rejects.toThrow("model_network_access_denied");
    await expect(adapter.start({ ...input("hosts_denied"), execution_policy: { ...broadPolicy(), network: { mode: "host_allowlist", hosts: ["open.bigmodel.cn"] } } })).rejects.toThrow("network_host_enforcement_unavailable");
    await expect(adapter.start({ ...input("cost_denied"), execution_policy: { ...broadPolicy(), cost: { mode: "required_cap", max_cost_microusd: 1 } } })).rejects.toThrow("cost_enforcement_unavailable");
    expect(existsSync(join(root, "operations"))).toBe(false);
  } finally { if (!root.startsWith(resolve(tmpdir()) + sep + "cimiloop-policy-unit-")) throw new Error("Invalid cleanup target"); rmSync(root, { recursive: true, force: true }); }
});

it("preserves an existing managed/1.1.0 claim without inventing a newer network policy or launching again", async () => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-policy-unit-"));
  try {
    const driver = { launcher: "absent-controller", binary: "absent-runtime", binary_digest: digest("fixture"), kind: "native_contract_fixture" as const, model: "fixture" };
    const adapter = new IsolatedProbeAdapter(root, driver), request = input("legacy_policy"), path = adapter.operationPath(request.operation_key); mkdirSync(join(root, "operations")); mkdirSync(path);
    const control = { control_version: "managed/1.1.0", effective_disk_limits: { max_sandbox_bytes: 67108864, max_sandbox_entries: 256, max_file_bytes: 8388608, max_output_bytes: 8388608 }, launcher_digest: digest("legacy") };
    atomicJson(join(path, "request.json"), { input: request, input_digest: digest(JSON.stringify({ input: request, driver })), driver, nonce: randomUUID(), ...control, control_digest: digest(JSON.stringify(control)) });
    atomicJson(join(path, "native-proof.json"), { pid: 1, profile: "historical", phase: "ended", reason: "exited", exit_code: 0 }); atomicJson(join(path, "result.json"), {});
    const before = readFileSync(join(path, "request.json")); expect((await adapter.start(request)).status).toBe("Succeeded");
    expect(readFileSync(join(path, "request.json"))).toEqual(before); expect(existsSync(join(path, "execution-policy-proof.json"))).toBe(false);
  } finally { if (!root.startsWith(resolve(tmpdir()) + sep + "cimiloop-policy-unit-")) throw new Error("Invalid cleanup target"); rmSync(root, { recursive: true, force: true }); }
});

describe.runIf(process.platform === "win32" && process.arch === "x64")("real Windows network policy", () => {
  let root: string, launcher: string; const adapters: IsolatedProbeAdapter[] = [];
  beforeAll(async () => { root = mkdtempSync(join(tmpdir(), "cimiloop-policy-native-")); launcher = await buildWindowsLauncher(root); }, 60_000);
  afterAll(async () => {
    for (const adapter of adapters) {
      const path = adapter.operationPath("network_policy");
      if (!existsSync(join(path, "native-ownership.json"))) continue;
      let result = await recoverProbeOperation(adapter.root, "network_policy");
      if (result.outcome === "active") { adapter.cancel("network_policy"); await waitForOperation(adapter, "network_policy", 20_000); result = await recoverProbeOperation(adapter.root, "network_policy"); }
      if (result.outcome !== "recovered") throw new Error(`Retaining owned fixture: ${path}`);
    }
    if (!root.startsWith(resolve(tmpdir()) + sep + "cimiloop-policy-native-")) throw new Error("Invalid cleanup target"); rmSync(root, { recursive: true, force: true });
  }, 60_000);
  const adapterFor = (name: string) => { const adapter = new IsolatedProbeAdapter(join(root, name), { launcher, binary: launcher, binary_digest: digest(readFileSync(launcher)), kind: "native_contract_fixture", model: "fixture" }); adapters.push(adapter); return adapter; };

  it("blocks public TCP and observes IPv4/IPv6 loopback TCP plus UDP delivery against live host controls", async () => {
    const servers: Server[] = [], connectionCounts: (() => number)[] = [], cases: { id: string; address: string; port: number; protocol: string }[] = [];
    for (const address of ["127.0.0.1", "::1"]) {
      let connections = 0;
      const server = createServer(socket => { connections++; socket.on("error", () => socket.destroy()); socket.end(); }); servers.push(server); connectionCounts.push(() => connections);
      await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(0, address, done); });
      const port = (server.address() as { port: number }).port;
      await new Promise<void>((done, fail) => { const socket = createConnection(port, address); socket.once("connect", () => { socket.destroy(); done(); }); socket.once("error", fail); });
      const settledBy = Date.now() + 3000; while (connections < 1 && Date.now() < settledBy) await new Promise(done => setTimeout(done, 10)); expect(connections).toBe(1);
      cases.push({ id: address === "::1" ? "ipv6_tcp" : "ipv4_tcp", address, port, protocol: "tcp" });
    }
    const udp = createSocket("udp4"); let sandboxPackets = 0; udp.on("message", bytes => { if (bytes.length === 1 && bytes[0] === 0) sandboxPackets++; });
    await new Promise<void>(done => udp.bind(0, "127.0.0.1", done));
    const udpPort = udp.address().port, trustedUdp = createSocket("udp4");
    await new Promise<void>((done, fail) => { udp.once("message", () => done()); trustedUdp.send(Buffer.from("host-control"), udpPort, "127.0.0.1", error => { if (error) fail(error); }); }); trustedUdp.close();
    cases.push({ id: "ipv4_udp", address: "127.0.0.1", port: udpPort, protocol: "udp" },
      { id: "internet_tcp", address: "1.1.1.1", port: 443, protocol: "tcp" });
    try {
      const adapter = adapterFor("denied"), request = { ...input("network_policy"), prompt: "fixture:network:" + JSON.stringify(cases), max_elapsed_ms: 10000 };
      await adapter.start(request); const result = await waitForOperation(adapter, request.operation_key, 25_000), path = adapter.operationPath(request.operation_key);
      const events = readFileSync(join(path, "stdout.raw"), "utf8").split(/\r?\n/).flatMap(line => { try { const value = JSON.parse(line); return value.event_type === "sandbox.network_canary" ? [value] : []; } catch { return []; } });
      expect(events).toHaveLength(cases.length);
      expect(events.find(value => value.id === "internet_tcp")).toMatchObject({ denied: true, error_code: 10013 });
      expect(events.filter(value => value.protocol === "tcp").every(value => !value.send_or_connect_returned && [10013, 10060].includes(value.error_code)), JSON.stringify(events)).toBe(true);
      await new Promise(done => setTimeout(done, 500)); expect(sandboxPackets).toBe(0); expect(connectionCounts.map(count => count())).toEqual([1, 1]);
      expect(result).toMatchObject({ status: "Succeeded", usage: { cost_known: false } });
      const ref = result.raw_refs.find(ref => ref.version === "execution-policy-proof.json")!;
      expect(digest(readFileSync(ref.locator))).toEqual(ref.digest);
      expect(parseExecutionPolicyObservation(JSON.parse(readFileSync(ref.locator, "utf8")))).toMatchObject({ network_mode: "deny_all", capability_sids: [], formal_execution_enabled: false });
      const saved = readJson(join(path, "request.json")) as { control_version: string; effective_execution_policy: unknown };
      expect(saved).toMatchObject({ control_version: "managed/1.2.0", effective_execution_policy: defaultExecutionPolicy() });
      const before = readFileSync(join(path, "native-proof.json")); expect((await adapter.start(request)).status).toBe("Succeeded"); expect(readFileSync(join(path, "native-proof.json"))).toEqual(before);
    } finally { udp.close(); for (const server of servers) await new Promise<void>(done => server.close(() => done())); }
  }, 40_000);

  it("records broad probe access honestly and invalidates success when policy proof or persisted policy changes", async () => {
    const adapter = adapterFor("broad"), request = { ...input("network_policy"), execution_policy: broadPolicy() }; await adapter.start(request);
    expect((await waitForOperation(adapter, request.operation_key, 20_000)).status).toBe("Failed");
    const path = adapter.operationPath(request.operation_key), file = join(path, "execution-policy-proof.json"), original = readFileSync(file), proof = JSON.parse(original.toString());
    expect(parseExecutionPolicyObservation(proof)).toMatchObject({ network_mode: "unrestricted_probe_only", capability_sids: ["S-1-15-3-1"], cost_mode: "unmetered_probe_only" });
    writeFileSync(file, JSON.stringify({ ...proof, network_mode: "deny_all", enforcement: "appcontainer_no_network_capabilities", capability_sids: [] }));
    expect(adapter.query(request.operation_key)).toMatchObject({ status: "Unknown", reason: "execution_policy_unproven" }); writeFileSync(file, original);
    const capsule = join(path, "request.json"), before = readFileSync(capsule), saved = JSON.parse(before.toString());
    atomicJson(capsule, { ...saved, effective_execution_policy: defaultExecutionPolicy() });
    try { expect(() => adapter.query(request.operation_key)).toThrow("operation_record_corrupt"); } finally { writeFileSync(capsule, before); }
  }, 30_000);
});
