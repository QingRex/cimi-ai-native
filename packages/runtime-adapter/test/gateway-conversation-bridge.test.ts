import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { bytesAt, digest, directory, readJson } from "../src/files.js";
import { buildWindowsLauncher, isolatedEnvironment, nativeControl } from "../src/native.js";
import { defaultExecutionPolicy } from "../src/execution-policy.js";
import { GatewayCreditLedger, GATEWAY_CONVERSATION_CACHE_SLOT_BYTES, type GatewayCreditPolicy } from "../src/gateway-credit.js";
import { creditHostDependencies } from "../src/gateway-credit-owner.js";
import { GatewayConversationHostRehearsal } from "../src/gateway-host.js";
import { PublicConversationBridge } from "../src/gateway-conversation-bridge.js";
import { runOpenCodeConversationProbe, PINNED_CONVERSATION_OPENCODE_SHA } from "../src/gateway-conversation-probe.js";
import { httpFixture } from "./gateway-http-fixture.js";
const windows = process.platform === "win32" && process.arch === "x64";
describe.skipIf(!windows)("versioned tool IPC in actual Windows AppContainers", () => {
  const fixtureParent = process.env.CIMILOOP_NATIVE_TEST_ROOT ?? tmpdir(), fixturePrefix = "conv-ipc-";
  let root: string, launcher: string, retainFailedProbe = false;
  beforeAll(async () => { mkdirSync(fixtureParent, { recursive: true }); root = mkdtempSync(join(fixtureParent, fixturePrefix)); launcher = await buildWindowsLauncher(root); }, 60000);
  afterAll(() => {
    if (!root || !resolve(root).startsWith(resolve(fixtureParent) + sep + fixturePrefix)) throw Error("Unexpected cleanup root");
    // Keep evidence needed for recovery if any owned controller failed cleanup.
    const inspect = (path: string, depth = 0) => {
      if (depth > 5) return;
      const ownership = join(path, "native-ownership.json"); if (existsSync(ownership) && !(readJson(ownership) as { resources_disposed: boolean }).resources_disposed) throw Error("Retain unrecovered native fixture: " + path);
      for (const name of readdirSync(path)) { const child = join(path, name); if (lstatSync(child).isDirectory() && name !== "sandbox" && name !== "tools") inspect(child, depth + 1); }
    };
    inspect(root); if (!retainFailedProbe) rmSync(root, { recursive: true, force: true });
  });
  const run = async (scenario: string) => {
    const nonce = randomUUID(), operationKey = "fixture_" + nonce.replaceAll("-", ""), path = directory(join(root, operationKey)), sandbox = directory(join(path, "sandbox"));
    directory(join(sandbox, "state")); writeFileSync(join(directory(join(sandbox, "workspace")), "public.txt"), "Public read fixture", { flag: "wx" });
    const policy: GatewayCreditPolicy = { format: "cimiloop/gateway-credit-rehearsal/1.0.0", scope: "credit_budget_rehearsal", account_scope_digest: digest(nonce).value,
      unit: "ZHIPU_CODING_PLAN_CREDIT", model: "glm-5.3", maximum_micro_units: 92000000 };
    const ledger = new GatewayCreditLedger(join(path, "conversation", "credit.sqlite"), policy, await creditHostDependencies(launcher, { now: () => Date.parse("2026-10-05T00:00:00Z") }),
      { conversation_cache: { maximum_entries: 2, maximum_bytes: 2 * GATEWAY_CONVERSATION_CACHE_SLOT_BYTES } }); ledger.registerBudget("public_probe", policy.maximum_micro_units);
    const fixture = await httpFixture({ reply: body => {
      const ownership = readJson(join(path, "native-ownership.json")) as { mapping: string }, request = body as { request_id: string };
      return { content_type: "application/json", chunks: [Buffer.from(JSON.stringify({ id: "public", model: "glm-5.3", request_id: request.request_id, choices: [{ index: 0,
        message: scenario === "large_reply" ? { role: "assistant", content: "L".repeat(65536) } : { role: "assistant", content: null, tool_calls: [{ id: "read_1", type: "function", function: { name: "read", arguments: JSON.stringify({ filePath: ownership.mapping + "\\workspace\\public.txt" }) } }] }, finish_reason: scenario === "large_reply" ? "stop" : "tool_calls" }], usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } }))] };
    } });
    const host = new GatewayConversationHostRehearsal({ ledger, boundary: fixture.boundary }), policyDigest = digest("public native conversation fixture").value;
    const bridge = new PublicConversationBridge({ path, nonce, operationKey, launcher, binary: launcher, policyDigest, ledger, host });
    const canary = join(path, "conversation", "private-canary.json"); writeFileSync(canary, '{"public":true}', { flag: "wx" });
    const limits = { max_sandbox_bytes: 67108864, max_sandbox_entries: 256, max_file_bytes: 8388608, max_output_bytes: 1048576 };
    const child = spawn(launcher, [sandbox, "read", "15000", launcher, join(path, "native-proof.json"), join(path, "cancel"), "--managed", nonce, JSON.stringify(limits), "--policy", JSON.stringify(defaultExecutionPolicy()),
      "--ipc-conversation", operationKey, policyDigest, "--conversation-client", operationKey, scenario], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...isolatedEnvironment(), CIMILOOP_PUBLIC_CONVERSATION_POLICY: policyDigest, CIMILOOP_PUBLIC_CONVERSATION_CANARY: canary } });
    let stdout = "", stderr = ""; child.stdout.on("data", bytes => { stdout += bytes.toString(); }); child.stderr.on("data", bytes => { stderr += bytes.toString(); });
    const ended = new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("close", () => resolve()); }); bridge.start(child);
    try {
      await ended; const budget = ledger.snapshot(), cache = ledger.cacheSnapshot(); await bridge.finish();
      const native = readJson(join(path, "native-proof.json")), transport = readJson(join(path, "conversation-transport-proof.json")), ownership = readJson(join(path, "native-ownership.json")) as { resources_disposed: boolean; runtime_identity: unknown };
      expect(ownership.resources_disposed).toBe(true); expect((await nativeControl(launcher, ["--inspect-identity", JSON.stringify(ownership.runtime_identity)])).value).toEqual({ state: "absent" });
      return { native, transport, stdout, stderr, budget, cache, httpRequests: fixture.observations.length };
    } finally { await bridge.finish(); await fixture.close(); }
  };
  it("authenticates the child and replays an identical frame without a second HTTP request or credit hold", async () => {
    const r = await run("duplicate"); expect(r.native).toMatchObject({ reason: "exited", exit_code: 0 }); expect(r.stderr).toBe("");
    expect(r.transport).toMatchObject({ accepted_requests: 1, failure_reason: null, attempts: [{ outcome: "accepted", replay: false }, { outcome: "accepted", replay: true }] });
    expect(r.httpRequests).toBe(1); expect(r.budget).toMatchObject({ completed: 1, held_micro_units: 46000000 }); expect(r.cache).toMatchObject({ entries: 1, contract_entries: 1 });
  }, 30000);
  it("denies conflicting request IDs while preserving the original completed reply", async () => {
    const r = await run("conflict"); expect(r.transport).toMatchObject({ accepted_requests: 1, attempts: [{ outcome: "accepted" }, { outcome: "rejected", reason: "request_id_conflict" }] }); expect(r.httpRequests).toBe(1); expect(r.budget.completed).toBe(1);
  }, 30000);
  it.each([["oversize", "ipc_frame_limit"], ["wrong_policy", "ipc_request_invalid"]])("denies %s before mailbox, credit reservation or HTTPS", async (scenario, reason) => {
    const r = await run(scenario!); expect(r.transport).toMatchObject({ accepted_requests: 0, attempts: [{ outcome: "rejected", reason }] }); expect(r.httpRequests).toBe(0); expect(r.budget.held_micro_units).toBe(0); expect(r.cache.contract_entries).toBe(0);
  }, 30000);
  it("keeps host canaries, the ledger directory and mailbox writes outside the Runtime ACL", async () => {
    const r = await run("private_acl"); expect(r.native).toMatchObject({ reason: "exited", exit_code: 0 }); expect(r.stdout).toContain('"read_denied":true,"write_denied":true,"directory_write_denied":true'); expect(r.httpRequests).toBe(1);
  }, 30000);
  it("transfers a 64 KiB completed reply through the new native response profile", async () => {
    const r = await run("large_reply"); expect(r.native).toMatchObject({ reason: "exited", exit_code: 0 }); expect(r.transport).toMatchObject({ failure_reason: null, accepted_requests: 1 }); expect(r.stdout).toContain("L".repeat(65536)); expect(r.budget.completed).toBe(1);
  }, 30000);
  it("rejects an unpinned OpenCode image and invalid deadlines before creating a probe", async () => {
    await expect(runOpenCodeConversationProbe({ root: join(root, "must-not-create"), binary: launcher })).rejects.toThrow("conversation_opencode_digest_unproven");
    await expect(runOpenCodeConversationProbe({ root: join(root, "must-not-create"), binary: launcher, maxElapsedMs: 999 })).rejects.toThrow("invalid_conversation_probe_elapsed");
  });
  it("runs pinned OpenCode 1.18.34 through tool proposal, actual public read, associated result and final SSE reply", async () => {
    retainFailedProbe = true;
    const binary = join(process.env.APPDATA!, "npm", "node_modules", "opencode-ai", "node_modules", "opencode-windows-x64", "bin", "opencode.exe"); expect(digest(bytesAt(binary, 512 * 1024 * 1024)).value).toBe(PINNED_CONVERSATION_OPENCODE_SHA);
    const result = await runOpenCodeConversationProbe({ root: join(root, "actual-opencode"), binary });
    expect(result, result.path).toMatchObject({ outcome: "Passed", tool_result_verified: true, final_text_verified: true, final_finish_verified: true, private_state_removed: true,
      actual_credentials_read: 0, external_model_requests: 0, billing_admission_ready: false, formal_execution_enabled: false });
    expect(result.upstream).toHaveLength(2); expect(result.host.budget).toMatchObject({ completed: 2, held_micro_units: 92000000 });
    retainFailedProbe = false;
  }, 60000);
});
