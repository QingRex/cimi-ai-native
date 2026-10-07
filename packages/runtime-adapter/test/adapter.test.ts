import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { normalizeOpenCode, IsolatedProbeAdapter, parseRuntimeOperation, validateOperationInput, type ProbeOperationInput, type NativeProof } from "../src/operations.js";
import { buildWindowsLauncher, isolatedEnvironment } from "../src/native.js";
import { boundaryProbe, waitForOperation } from "../src/probe.js";
import { atomicJson, digest } from "../src/files.js";
import { recoverProbeOperation } from "../src/recovery.js";

const ended: NativeProof = { pid: 1, profile: "fixture", phase: "ended", reason: "exited", exit_code: 0 };
const event = (type: string, part = {}) => JSON.stringify({ type, sessionID: "ses_test", part });
const input = (key: string, elapsed = 3000): ProbeOperationInput => ({
  scope: "isolated_provider_probe", operation_key: key, mode: "read", files: [{ path: "input.txt", content: "visible" }],
  prompt: '中文 "quote" and trailing\\', max_elapsed_ms: elapsed
});

describe("runtime probe contract", () => {
  it("does not treat a zero CLI exit with a provider error as success", () => {
    expect(normalizeOpenCode(event("error"), ended)).toMatchObject({ status: "Failed", reason: "provider_error" });
    expect(normalizeOpenCode(event("text", { text: "done" }), ended).status).toBe("Unknown");
    expect(normalizeOpenCode(event("step_finish", { reason: "stop" }), ended).status).toBe("Succeeded");
  });
  it("rejects incomplete, malformed, conflicting-session and step-limited completions", () => {
    expect(normalizeOpenCode(event("step_finish", { reason: "tool-calls" }), ended).status).toBe("Unknown");
    expect(normalizeOpenCode(event("step_finish", { reason: "stop" }) + "\n{broken", ended).status).toBe("Unknown");
    expect(normalizeOpenCode(event("step_finish", { reason: "stop" }) + "\n" + JSON.stringify({ type: "text", sessionID: "ses_other" }), ended).status).toBe("Unknown");
    expect(normalizeOpenCode(event("step_finish", { reason: "stop" }), { ...ended, exit_code: 5 }).status).toBe("Failed");
  });
  it("distinguishes actual termination from unknown or live processes", () => {
    expect(normalizeOpenCode("", { ...ended, phase: "running" }).status).toBe("Running");
    expect(normalizeOpenCode("", { ...ended, reason: "cancelled" }).status).toBe("Cancelled");
    expect(normalizeOpenCode("", { ...ended, reason: "timeout" })).toMatchObject({ status: "Failed", reason: "elapsed_budget_exhausted" });
    expect(normalizeOpenCode("", { ...ended, reason: "cleanup_failed" }).status).toBe("Unknown");
  });
  it("denies traversal, Windows devices, duplicate case names and non-probe scopes", () => {
    validateOperationInput(input("valid"));
    for (const path of ["../escape", "C:/secret", "a\\secret", "nul.txt", "con/secret", ".git/config", "file."]) {
      expect(() => validateOperationInput({ ...input("bad"), files: [{ path, content: "x" }] })).toThrow("invalid_probe_file");
    }
    expect(() => validateOperationInput({ ...input("duplicate"), files: [{ path: "A.txt", content: "x" }, { path: "a.txt", content: "y" }] })).toThrow();
    expect(() => validateOperationInput({ ...input("extra"), actor_id: "human" } as ProbeOperationInput)).toThrow();
    expect(() => validateOperationInput({ ...input("task"), scope: "task" } as unknown as ProbeOperationInput)).toThrow();
  });
  it("does not inherit API secrets, Human gateway tokens, proxies or arbitrary Node options", () => {
    const environment = isolatedEnvironment();
    for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "OPENCODE_SERVER_PASSWORD", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NODE_OPTIONS"]) expect(environment).not.toHaveProperty(key);
    expect(environment.OPENCODE_DISABLE_PROJECT_CONFIG).toBe("true");
  });
  it("requires a read-only fixed skill loader profile and limits loading to named modules", () => {
    const skill: ProbeOperationInput = { ...input("method"), skill_profile: { version: "cimiloop/skill-method/1.0.0", source_digest: digest("fixed skill"), skill_names: ["fixed-method"], purpose: "clarification" },
      files: [{ path: "skill-source/fixed-method/SKILL.md", content: "---\nname: fixed-method\ndescription: Fixed\n---\nFixed method" }] };
    expect(() => validateOperationInput(skill)).not.toThrow();
    expect(() => validateOperationInput({ ...skill, mode: "write" })).toThrow("invalid_skill_probe_profile");
    expect(() => validateOperationInput({ ...skill, files: [{ path: "input.txt", content: "no skill" }] })).toThrow("invalid_skill_probe_profile");
    expect(() => validateOperationInput({ ...skill, files: [...skill.files, { path: "skill-source/undeclared/SKILL.md", content: "undeclared" }] })).toThrow("invalid_skill_probe_profile");
    const { skill_profile: _profile, ...unprofiled } = skill; expect(() => validateOperationInput(unprofiled)).toThrow("skill_probe_profile_required");
  });
  it("machine results reject self-reported Human identity and known cost", () => {
    const result = { schema_version: "2.0.0", scope: "isolated_provider_probe", operation_key: "test", input_digest: digest("input"),
      status: "Unknown", cancel_requested: false, observed_at: new Date().toISOString(), reason: "unknown", raw_refs: [], outputs: [], usage: { cost_known: false } };
    expect(() => parseRuntimeOperation(result)).not.toThrow();
    expect(() => parseRuntimeOperation({ ...result, actor_id: "human" })).toThrow();
    expect(() => parseRuntimeOperation({ ...result, usage: { cost_known: true } })).toThrow();
  });
});

describe.runIf(process.platform === "win32" && process.arch === "x64")("actual Windows AppContainer", () => {
  let root: string, launcher: string;
  const adapters: IsolatedProbeAdapter[] = [];
  beforeAll(async () => { root = mkdtempSync(join(tmpdir(), "cimiloop-runtime-test-")); launcher = await buildWindowsLauncher(root); }, 60_000);
  afterAll(async () => {
    // Failed assertions must not remove the durable capsule while its owner
    // still runs. Recover all managed fixtures before deleting the test root.
    for (const adapter of adapters) if (existsSync(join(adapter.root, "operations"))) for (const key of readdirSync(join(adapter.root, "operations"))) {
      if (!existsSync(join(adapter.operationPath(key), "native-ownership.json"))) continue;
      let result = await recoverProbeOperation(adapter.root, key);
      if (result.outcome === "active") {
        adapter.cancel(key); await waitForOperation(adapter, key, 20_000); await new Promise(done => setTimeout(done, 100));
        result = await recoverProbeOperation(adapter.root, key);
      }
      if (result.outcome !== "recovered") throw new Error(`Retaining owned fixture for recovery: ${adapter.operationPath(key)}`);
    }
    const absolute = resolve(root);
    if (!absolute.startsWith(resolve(tmpdir()) + "\\cimiloop-runtime-test-")) throw new Error("Refusing cleanup outside dedicated test root");
    rmSync(absolute, { recursive: true, force: true });
  }, 60_000);
  it("blocks external files, subprocesses and a live Human loopback endpoint in write and read modes", async () => {
    const write = await boundaryProbe(root, launcher, "write"), read = await boundaryProbe(root, launcher, "read");
    expect(write).toMatchObject({ passed: true, outside_read_denied: true, outside_write_denied: true, subprocess_denied: true, loopback_denied: true, inside_readable: true, inside_writable: true });
    expect(read).toMatchObject({ passed: true, outside_read_denied: true, outside_write_denied: true, subprocess_denied: true, loopback_denied: true, inside_readable: true, inside_writable: false });
  }, 60_000);
  const adapterFor = (name: string) => { const adapter = new IsolatedProbeAdapter(join(root, name), { launcher, binary: launcher, binary_digest: digest(readFileSync(launcher)), kind: "native_contract_fixture", model: "fixture" }); adapters.push(adapter); return adapter; };
  it("keeps a real Windows exclusive proof lock Unknown and later observes the same operation without another start", async () => {
    const adapter = adapterFor("proof-lock"), request = input("proof_lock", 300); await adapter.start(request);
    const completed = await waitForOperation(adapter, request.operation_key, 20_000);
    const proof = join(adapter.operationPath(request.operation_key), "native-proof.json"), before = readFileSync(proof), ready = join(root, "proof-lock-ready");
    const script = "$taskHandle=[IO.File]::Open($env:CIMILOOP_TEST_LOCK_PATH,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None); try { [IO.File]::WriteAllText($env:CIMILOOP_TEST_LOCK_READY,'held'); Start-Sleep -Milliseconds 1500 } finally { $taskHandle.Dispose() }";
    const helper = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
      { windowsHide: true, stdio: "ignore", env: { ...isolatedEnvironment(), CIMILOOP_TEST_LOCK_PATH: proof, CIMILOOP_TEST_LOCK_READY: ready } });
    const closed = new Promise<void>((done, fail) => { helper.once("close", code => code === 0 ? done() : fail(new Error("Proof lock helper failed"))); helper.once("error", fail); });
    try {
      const deadline = Date.now() + 10_000; while (!existsSync(ready) && Date.now() < deadline) await new Promise(done => setTimeout(done, 25));
      expect(existsSync(ready)).toBe(true);
      expect(adapter.query(request.operation_key)).toMatchObject({ status: "Unknown", reason: "runtime_observation_read_unavailable" });
      expect(adapter.collect(request.operation_key)).toMatchObject({ status: "Unknown", reason: "runtime_raw_collection_unavailable" });
      expect((await adapter.start(request)).status).toBe("Unknown");
    } finally { await closed; }
    expect(adapter.query(request.operation_key).status).toBe(completed.status); expect(readFileSync(proof)).toEqual(before);
    expect(readdirSync(join(adapter.root, "operations"))).toEqual([request.operation_key]);
  }, 30_000);
  it("records a pinned credential change as NotStarted and never retries the durable operation", async () => {
    const file = join(root, "changed-credential.json"); writeFileSync(file, "ciphertext changed");
    const adapter = new IsolatedProbeAdapter(join(root, "credential-change"), { launcher, binary: launcher, binary_digest: digest(readFileSync(launcher)), kind: "opencode",
      model: "zhipuai-coding-plan/glm-5.3", connection: { format: "cimiloop/dedicated-model/1.0.0", provider: "zhipuai-coding-plan", model: "zhipuai-coding-plan/glm-5.3",
        credential_file: file, credential_digest: digest("before change") } });
    adapters.push(adapter);
    const request = { ...input("changed_credential"), execution_policy: { network: { mode: "unrestricted_probe_only" as const }, cost: { mode: "unmetered_probe_only" as const } } }; await adapter.start(request);
    expect(await waitForOperation(adapter, request.operation_key, 20_000)).toMatchObject({ status: "NotStarted", reason: "dedicated_credential_changed" });
    expect(existsSync(join(adapter.operationPath(request.operation_key), "native-proof.json"))).toBe(false);
    expect((await adapter.start(request)).status).toBe("NotStarted");
  }, 30_000);
  it("cancels the actual job and replays the same operation without starting it twice", async () => {
    const adapter = adapterFor("cancel"), key = "cancel_" + randomUUID(), request = input(key, 20_000);
    await adapter.start(request);
    const deadline = Date.now() + 15_000;
    while (adapter.query(key).status !== "Running" && Date.now() < deadline) await new Promise(done => setTimeout(done, 100));
    expect(adapter.query(key).status).toBe("Running");
    expect(adapter.cancel(key).cancel_requested).toBe(true);
    const result = await waitForOperation(adapter, key, 20_000);
    expect(result.status).toBe("Cancelled");
    const before = readFileSync(join(adapter.operationPath(key), "native-proof.json"), "utf8");
    expect((await adapter.start(request)).status).toBe("Cancelled");
    expect(readFileSync(join(adapter.operationPath(key), "native-proof.json"), "utf8")).toBe(before);
    expect(readdirSync(join(adapter.root, "operations"))).toHaveLength(1);
    await expect(adapter.start({ ...request, prompt: "different input" })).rejects.toThrow("operation_key_input_conflict");
    const raw = result.raw_refs.find(ref => ref.version === "stdout.raw")!;
    const quoted = readFileSync(raw.locator, "utf8").trim().split(/\r?\n/).at(-1)!;
    expect(JSON.parse(quoted)).toBe(request.prompt);
  }, 60_000);
  it("enforces elapsed time and preserves immutable raw collection", async () => {
    const adapter = adapterFor("timeout"), key = "timeout_" + randomUUID();
    await adapter.start(input(key, 300));
    const result = await waitForOperation(adapter, key, 20_000);
    expect(result).toMatchObject({ status: "Failed", reason: "elapsed_budget_exhausted", usage: { cost_known: false } });
    for (const ref of result.raw_refs) expect(digest(readFileSync(ref.locator))).toEqual(ref.digest);
    const before = result.raw_refs;
    writeFileSync(join(adapter.operationPath(key), "stdout.raw"), "later mutation");
    expect(digest(readFileSync(before[0]!.locator))).toEqual(before[0]!.digest);
    expect(adapter.collect(key).raw_refs[0]!.digest).not.toEqual(before[0]!.digest);
  }, 60_000);
  it("never restarts a durable claim whose startup acknowledgement was lost", async () => {
    const adapter = adapterFor("lost"), key = "lost_ack", request = input(key), path = adapter.operationPath(key);
    mkdirSync(path, { recursive: true });
    atomicJson(join(path, "request.json"), { input: request, input_digest: digest(JSON.stringify({ input: request, driver: adapter.driver })), driver: adapter.driver, nonce: randomUUID() });
    const result = await adapter.start(request);
    expect(result).toMatchObject({ status: "Unknown", reason: "start_not_yet_proven" });
    expect(existsSync(join(path, "sandbox"))).toBe(false);
    expect(adapter.cancel(key).cancel_requested).toBe(true);
    expect((await adapter.start(request)).status).toBe("Unknown");
  }, 60_000);
});
