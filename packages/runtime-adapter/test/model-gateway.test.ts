import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { GatewayBudgetLedger, type GatewayBudgetPolicy } from "../src/gateway-budget.js";
import { SyntheticModelGateway, SYNTHETIC_GATEWAY_MODEL, GATEWAY_RESERVATION, requireDedicatedGatewayBilling, isPublicGatewayAddress, type GatewayRequest } from "../src/model-gateway.js";
import { startGatewayFixture, gatewayFixtureCertificate, type GatewayFixtureMode } from "../src/gateway-fixture.js";
import { digest } from "../src/files.js";
const run = promisify(execFile);
const root = () => mkdtempSync(join(tmpdir(), "cimiloop-gateway-test-"));
const remove = (path: string) => { if (!resolve(path).startsWith(resolve(tmpdir()) + sep + "cimiloop-gateway-test-")) throw new Error("Invalid cleanup target"); rmSync(path, { recursive: true, force: true }); };
const policy = (): GatewayBudgetPolicy => ({ budget_key: "fixture", policy_digest: "1".repeat(64), currency: "TEST", maximum_micro_units: GATEWAY_RESERVATION, reservation_micro_units: GATEWAY_RESERVATION });
const request = (): GatewayRequest => ({ format: "cimiloop/model-gateway/1.0.0", request_id: randomUUID(), operation_key: "fixture",
  model_id: SYNTHETIC_GATEWAY_MODEL, messages: [{ role: "user", content: "Synthetic input" }], max_output_tokens: 16 });
const withGateway = async (body: (context: { gateway: SyntheticModelGateway; server: Awaited<ReturnType<typeof startGatewayFixture>>; path: string }) => Promise<void>, units = 2, deadline = 5000) => {
  const path = root(), server = await startGatewayFixture();
  const gateway = new SyntheticModelGateway({ ledgerPath: join(path, "budget.sqlite"), budgetKey: "fixture", maximumMicroUnits: GATEWAY_RESERVATION * units, port: server.port, certificatePath: gatewayFixtureCertificate, deadlineMs: deadline });
  try { await body({ gateway, server, path }); }
  finally { await gateway.close(); await server.close(); remove(path); }
};
describe("durable conservative gateway budgets", () => {
  it("retains the bound after completion, and freezes the budget instead of silently increasing it", () => {
    const path = root(), file = join(path, "ledger.sqlite"), p = policy(), ledger = new GatewayBudgetLedger(file, p), id = randomUUID();
    try {
      ledger.reserve(id, "a".repeat(64)); ledger.dispatch(id); ledger.complete(id, "{}", digest("{}").value);
      expect(ledger.reserve(id, "a".repeat(64)).replay).toBe("{}");
      expect(ledger.snapshot()).toMatchObject({ held_micro_units: GATEWAY_RESERVATION, completed: 1 });
      expect(() => ledger.reserve(randomUUID(), "b".repeat(64))).toThrow("gateway_budget_exhausted");
      expect(() => ledger.reserve(id, "b".repeat(64))).toThrow("gateway_request_id_conflict");
      expect(() => new GatewayBudgetLedger(file, { ...p, maximum_micro_units: p.maximum_micro_units * 2 })).toThrow("gateway_budget_policy_conflict");
    } finally { ledger.close(); remove(path); }
  });
  it("never reissues an unfinished request and conservatively reconciles an ended owner", () => {
    const path = root(), ledger = new GatewayBudgetLedger(join(path, "ledger.sqlite"), { ...policy(), maximum_micro_units: GATEWAY_RESERVATION * 2 });
    try {
      const a = randomUUID(), b = randomUUID(); ledger.reserve(a, "a".repeat(64)); ledger.reserve(b, "b".repeat(64)); ledger.dispatch(b);
      expect(() => ledger.reserve(a, "a".repeat(64))).toThrow("gateway_request_outcome_unproven");
      expect(ledger.reconcileEndedOwner()).toBe(2); expect(ledger.reconcileEndedOwner()).toBe(0);
      expect(ledger.snapshot()).toMatchObject({ unknown: 2, held_micro_units: GATEWAY_RESERVATION * 2 });
      expect(() => ledger.reserve(b, "b".repeat(64))).toThrow("gateway_request_outcome_unproven");
    } finally { ledger.close(); remove(path); }
  });
  it("rejects foreign databases without converting their format", () => {
    const path = root(), file = join(path, "other.sqlite"), db = new DatabaseSync(file); db.exec("CREATE TABLE other(value TEXT)"); db.close();
    try {
      expect(() => new GatewayBudgetLedger(file, policy())).toThrow("gateway_ledger_format_unavailable");
      const check = new DatabaseSync(file); try { expect(check.prepare("PRAGMA application_id").get()!.application_id).toBe(0); } finally { check.close(); }
    } finally { remove(path); }
  });
  it("has one durable winner across two independent host processes", async () => {
    const path = root(), file = join(path, "ledger.sqlite"), p = policy(), init = new GatewayBudgetLedger(file, p); init.close();
    const module = new URL("../dist/gateway-budget.js", import.meta.url).href;
    const script = `import {GatewayBudgetLedger} from ${JSON.stringify(module)}; const [file,policy,id]=process.argv.slice(1); const ledger=new GatewayBudgetLedger(file,JSON.parse(policy)); try {ledger.reserve(id,'a'.repeat(64)); console.log('reserved');} catch(error) {console.log(error.reason);} finally {ledger.close();}`;
    try {
      const outputs = await Promise.all([1, 2].map(() => run(process.execPath, ["--input-type=module", "-e", script, file, JSON.stringify(p), randomUUID()], { timeout: 10000, windowsHide: true })));
      expect(outputs.map(v => v.stdout.trim()).sort()).toEqual(["gateway_budget_exhausted", "reserved"]);
      const ledger = new GatewayBudgetLedger(file, p); try { expect(ledger.snapshot().held_micro_units).toBe(GATEWAY_RESERVATION); } finally { ledger.close(); }
    } finally { remove(path); }
  });
  it("keeps a pre-send dispatch claim after abrupt process exit", async () => {
    const path = root(), file = join(path, "ledger.sqlite"), p = policy(), id = randomUUID(), module = new URL("../dist/gateway-budget.js", import.meta.url).href;
    const script = `import {GatewayBudgetLedger} from ${JSON.stringify(module)}; const [file,policy,id]=process.argv.slice(1); const ledger=new GatewayBudgetLedger(file,JSON.parse(policy)); ledger.reserve(id,'a'.repeat(64)); ledger.dispatch(id); process.exit(73);`;
    try {
      await expect(run(process.execPath, ["--input-type=module", "-e", script, file, JSON.stringify(p), id], { timeout: 10000, windowsHide: true })).rejects.toMatchObject({ code: 73 });
      const ledger = new GatewayBudgetLedger(file, p);
      try { expect(ledger.snapshot()).toMatchObject({ dispatching: 1, held_micro_units: GATEWAY_RESERVATION }); ledger.reconcileEndedOwner(); expect(() => ledger.reserve(id, "a".repeat(64))).toThrow("gateway_request_outcome_unproven"); } finally { ledger.close(); }
    } finally { remove(path); }
  });
});
describe("fixed HTTPS model gateway", () => {
  it("uses the fixed route and bounded generation, durably replays without sending again", async () => withGateway(async ({ gateway, server, path }) => {
    const input = request(), result = await gateway.execute(input);
    expect(result.response).toMatchObject({ synthetic: true, text: "CIMILOOP_GATEWAY_OK", currency: "TEST", held_micro_units: GATEWAY_RESERVATION });
    expect(server.observations).toHaveLength(1); expect(server.observations[0]).toMatchObject({ method: "POST", path: "/v1/chat/completions", model: SYNTHETIC_GATEWAY_MODEL, output_limit: 16, stream: false, n: 1, authenticated: true });
    expect(server.observations[0]!.host).toBe(`cimiloop-gateway.test:${server.port}`);
    expect(await gateway.execute(input)).toEqual({ response: result.response, replay: true }); expect(server.observations).toHaveLength(1);
    await expect(gateway.execute({ ...input, messages: [{ role: "user", content: "changed" }] })).rejects.toThrow("gateway_request_id_conflict");
    const other = new SyntheticModelGateway({ ledgerPath: join(path, "budget.sqlite"), budgetKey: "fixture", maximumMicroUnits: GATEWAY_RESERVATION * 2, port: server.port, certificatePath: gatewayFixtureCertificate });
    try { expect((await other.execute(input)).replay).toBe(true); } finally { await other.close(); }
    const db = new DatabaseSync(join(path, "budget.sqlite"), { readOnly: true });
    try { const row = db.prepare("SELECT state,held,response FROM gateway_requests").get()!; expect(row.state).toBe("completed"); expect(String(row.response)).not.toContain("Synthetic input"); } finally { db.close(); }
  }));
  it("rejects endpoint, model, output, tools and oversize input overrides before any send or reservation", async () => withGateway(async ({ gateway, server }) => {
    for (const input of [{ ...request(), url: "https://example.com" }, { ...request(), model_id: "unapproved" }, { ...request(), max_output_tokens: 129 },
      { ...request(), headers: {} }, { ...request(), tools: [] }, { ...request(), messages: [{ role: "tool", content: "x" }] }, { ...request(), messages: [{ role: "user", content: "x".repeat(16384) }] }])
      await expect(gateway.execute(input)).rejects.toThrow("gateway_request_denied");
    expect(server.observations).toHaveLength(0); expect(gateway.snapshot().held_micro_units).toBe(0);
  }));
  it("does not overspend with concurrent gateways sharing the same ledger", async () => withGateway(async ({ gateway, server, path }) => {
    const other = new SyntheticModelGateway({ ledgerPath: join(path, "budget.sqlite"), budgetKey: "fixture", maximumMicroUnits: GATEWAY_RESERVATION, port: server.port, certificatePath: gatewayFixtureCertificate });
    try {
      const result = await Promise.allSettled([gateway.execute(request()), other.execute(request())]);
      expect(result.filter(v => v.status === "fulfilled")).toHaveLength(1); expect(result.find(v => v.status === "rejected")).toMatchObject({ reason: { reason: "gateway_budget_exhausted" } });
      expect(server.observations).toHaveLength(1); expect(gateway.snapshot().held_micro_units).toBe(GATEWAY_RESERVATION);
    } finally { await other.close(); }
  }, 1));
  it.each<GatewayFixtureMode>(["redirect", "status", "malformed", "partial", "oversize", "oversize_chunked", "encoded", "usage_inconsistent", "wrong_model", "invalid_utf8", "secret"])("retains the reservation and never retries after %s", async mode => withGateway(async ({ gateway, server }) => {
    server.setMode(mode); const input = request();
    await expect(gateway.execute(input)).rejects.toThrow(/^gateway_/);
    expect(gateway.snapshot()).toMatchObject({ unknown: 1, held_micro_units: GATEWAY_RESERVATION });
    await expect(gateway.execute(input)).rejects.toThrow("gateway_request_outcome_unproven"); expect(server.observations).toHaveLength(1);
  }));
  it("blocks subsequent sends when upstream usage exceeds the frozen bound", async () => withGateway(async ({ gateway, server }) => {
    server.setMode("usage_overflow"); await expect(gateway.execute(request())).rejects.toThrow("gateway_usage_bound_exceeded");
    expect(gateway.snapshot()).toMatchObject({ blocked: true, unknown: 1 });
    await expect(gateway.execute(request())).rejects.toThrow("gateway_budget_blocked"); expect(server.observations).toHaveLength(1);
  }));
  it("bounds total elapsed time and retains an uncertain dispatch", async () => withGateway(async ({ gateway, server }) => {
    server.setMode("timeout"); await expect(gateway.execute(request())).rejects.toThrow("gateway_deadline_exhausted");
    expect(gateway.snapshot()).toMatchObject({ unknown: 1, held_micro_units: GATEWAY_RESERVATION });
  }, 2, 100));
  it("pre-abort never reserves and in-flight abort keeps the bound", async () => withGateway(async ({ gateway, server }) => {
    await expect(gateway.execute(request(), AbortSignal.abort())).rejects.toThrow("gateway_aborted"); expect(gateway.snapshot().held_micro_units).toBe(0);
    server.setMode("timeout"); const controller = new AbortController(), pending = gateway.execute(request(), controller.signal);
    const until = Date.now() + 5000; while (!server.observations.length && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 5));
    expect(server.observations).toHaveLength(1);
    controller.abort(); await expect(pending).rejects.toThrow("gateway_aborted"); expect(gateway.snapshot()).toMatchObject({ unknown: 1, held_micro_units: GATEWAY_RESERVATION });
  }));
  it("verifies the peer certificate without sending authorization or HTTP data to an untrusted peer", async () => {
    const path = root(), server = await startGatewayFixture({ untrusted: true }), gateway = new SyntheticModelGateway({ ledgerPath: join(path, "ledger.sqlite"), budgetKey: "fixture", maximumMicroUnits: GATEWAY_RESERVATION, port: server.port, certificatePath: gatewayFixtureCertificate });
    try { await expect(gateway.execute(request())).rejects.toThrow("gateway_upstream_unproven"); expect(server.observations).toHaveLength(0); expect(gateway.snapshot().unknown).toBe(1); }
    finally { await gateway.close(); await server.close(); remove(path); }
  });
  it("checks cached response bytes before replaying a damaged durable result", async () => withGateway(async ({ gateway, server, path }) => {
    const input = request(); await gateway.execute(input);
    const db = new DatabaseSync(join(path, "budget.sqlite")); try { db.prepare("UPDATE gateway_requests SET response=?").run("{}"); } finally { db.close(); }
    await expect(gateway.execute(input)).rejects.toThrow("gateway_cached_response_corrupt"); expect(server.observations).toHaveLength(1);
  }));
  it("does not open actual credential files when a real billing profile is unavailable", () => {
    expect(() => requireDedicatedGatewayBilling({ format: "cimiloop/dedicated-model/1.0.0", provider: "zhipuai-coding-plan", model: "zhipuai-coding-plan/glm-5.3",
      credential_file: join(tmpdir(), "deliberately-absent.dpapi.json"), credential_digest: { algorithm: "sha256", value: "a".repeat(64) } })).toThrow("gateway_reliable_billing_profile_unavailable");
  });
  it("commits the dispatch reservation before the upstream receives HTTP bytes", async () => {
    const path = root(), file = join(path, "ledger.sqlite"); let observed: unknown;
    const server = await startGatewayFixture({ onRequest: () => {
      const db = new DatabaseSync(file, { readOnly: true });
      try { observed = db.prepare("SELECT state,held FROM gateway_requests").get(); } finally { db.close(); }
    } }), gateway = new SyntheticModelGateway({ ledgerPath: file, budgetKey: "fixture", maximumMicroUnits: GATEWAY_RESERVATION, port: server.port, certificatePath: gatewayFixtureCertificate });
    try { await gateway.execute(request()); expect(observed).toMatchObject({ state: "dispatching", held: GATEWAY_RESERVATION }); }
    finally { await gateway.close(); await server.close(); remove(path); }
  });
  it("does not refund or resend after an actual dispatched HTTPS request loses its host process", async () => {
    const path = root(), file = join(path, "ledger.sqlite"), server = await startGatewayFixture(), input = request(); server.setMode("timeout");
    const module = new URL("../dist/model-gateway.js", import.meta.url).href;
    const options = { ledgerPath: file, budgetKey: "fixture", maximumMicroUnits: GATEWAY_RESERVATION, port: server.port, certificatePath: gatewayFixtureCertificate, deadlineMs: 30000 };
    const script = `import {SyntheticModelGateway} from ${JSON.stringify(module)}; process.on('message',()=>process.exit(73)); setTimeout(()=>process.exit(74),10000); const gateway=new SyntheticModelGateway(JSON.parse(process.argv[1])); gateway.execute(JSON.parse(process.argv[2])).catch(()=>{});`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", script, JSON.stringify(options), JSON.stringify(input)], { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
    const ended = new Promise<number | null>((done, fail) => { child.once("error", fail); child.once("close", done); });
    try {
      const until = Date.now() + 5000; while (!server.observations.length && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 5));
      expect(server.observations).toHaveLength(1); child.send("exit-owned-fixture"); expect(await ended).toBe(73);
      const reopened = new SyntheticModelGateway(options);
      try {
        expect(reopened.snapshot()).toMatchObject({ dispatching: 1, held_micro_units: GATEWAY_RESERVATION });
        await expect(reopened.execute(input)).rejects.toThrow("gateway_request_outcome_unproven");
        await expect(reopened.execute(request())).rejects.toThrow("gateway_budget_exhausted"); expect(server.observations).toHaveLength(1);
        const ledger = new GatewayBudgetLedger(file, { ...policy(), policy_digest: reopened.policyDigest });
        try { expect(ledger.reconcileEndedOwner()).toBe(1); expect(ledger.snapshot().unknown).toBe(1); } finally { ledger.close(); }
      } finally { await reopened.close(); }
    } finally { if (child.connected) child.send("exit-owned-fixture"); await ended; await server.close(); remove(path); }
  });
  it("rejects non-global, mapped, transition and documentation addresses for a future public route", () => {
    for (const address of ["127.0.0.1", "0.0.0.0", "10.1.2.3", "100.64.0.1", "172.31.2.3", "192.168.1.1", "169.254.169.254", "192.0.2.1", "198.18.1.1", "224.1.2.3", "255.255.255.255", "::1", "fc00::1", "fe80::1", "::ffff:8.8.8.8", "2002:808:808::1", "2001:db8::1", "3fff::1", "not-an-ip"])
      expect(isPublicGatewayAddress(address), address).toBe(false);
    expect(isPublicGatewayAddress("8.8.8.8")).toBe(true); expect(isPublicGatewayAddress("2606:4700:4700::1111")).toBe(true);
  });
});
