import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { GatewayHostRehearsal, createDedicatedGatewayHost } from "../src/gateway-host.js";
import { GatewayCreditLedger, GATEWAY_CREDIT_CACHE_ENTRY_BYTES, type GatewayCreditPolicy } from "../src/gateway-credit.js";
import { GatewayNetworkBoundary } from "../src/gateway-network.js";
import { creditHostDependencies } from "../src/gateway-credit-owner.js";
import { buildWindowsLauncher } from "../src/native.js";
import { digest } from "../src/files.js";
import { httpFixture, HTTP_FIXTURE_KEY, type HttpFixtureMode } from "./gateway-http-fixture.js";
const execute = promisify(execFile), time = Date.parse("2026-10-05T00:00:00Z"), credit = 1000000;
const policy: GatewayCreditPolicy = { format: "cimiloop/gateway-credit-rehearsal/1.0.0", scope: "credit_budget_rehearsal", account_scope_digest: digest("host coordinator public fixture account").value,
  unit: "ZHIPU_CODING_PLAN_CREDIT", model: "glm-5.3", maximum_micro_units: 8 * credit };
const cache = { response_cache: { maximum_bytes: 8 * GATEWAY_CREDIT_CACHE_ENTRY_BYTES, maximum_entries: 8 } };
const dependencies = { identity: { pid: process.pid, creation_ticks: "1", image: process.execPath }, now: () => time };
const input = () => ({ request_id: randomUUID(), messages: [{ role: "user", content: "public host fixture prompt" }], input_tokens: 100, max_output_tokens: 32 });
const root = () => mkdtempSync(join(tmpdir(), "cimiloop-host-test-"));
const remove = (path: string) => { if (!resolve(path).startsWith(resolve(tmpdir()) + sep + "cimiloop-host-test-")) throw Error("bad cleanup path"); rmSync(path, { recursive: true, force: true }); };
const ledgerAt = (path: string) => { const ledger = new GatewayCreditLedger(join(path, "credits.sqlite"), policy, dependencies, cache); ledger.registerBudget("host", policy.maximum_micro_units); return ledger; };
describe("durable host coordinator with public fixture credentials only", () => {
  it("commits dispatch before DNS/HTTP, atomically caches only the public reply and replays after reopen", async () => {
    const path = root(), ledger = ledgerAt(path), f = await httpFixture({ mode: "reasoning", onRequest: () => expect(ledger.snapshot().dispatching).toBe(1) });
    const coordinator = new GatewayHostRehearsal({ ledger, boundary: f.boundary, phase: phase => { if (phase === "dispatch_committed") expect(f.counts()).toEqual({ dns: 0, dials: 0 }); } });
    const request = input();
    try {
      const first = await coordinator.execute(request, "host"), replay = await coordinator.execute(request, "host");
      expect(replay).toEqual({ ...first, replay: true }); expect(first).toMatchObject({ scope: "host_gateway_rehearsal", billing_admission_ready: false, formal_execution_enabled: false });
      expect(f.observations).toHaveLength(1); expect(f.socket()!.closed).toBe(true); expect(ledger.cacheSnapshot()).toMatchObject({ entries: 1, pending_reserved_bytes: 0 });
      await coordinator.close(); const reopened = ledgerAt(path), forbidden = new GatewayNetworkBoundary({ resolve: async () => { throw Error("Replay must not resolve DNS"); } });
      const next = new GatewayHostRehearsal({ ledger: reopened, boundary: forbidden });
      try { expect(await next.execute(request, "host")).toEqual(replay); } finally { await next.close(); }
      const db = new DatabaseSync(join(path, "credits.sqlite")); try {
        const cached = String(db.prepare("SELECT response FROM credit_responses").get()!.response); expect(cached).not.toContain("reasoning_content"); expect(cached).not.toContain("public fixture reasoning");
        expect(cached).not.toContain(request.messages[0]!.content); expect(cached).not.toContain(HTTP_FIXTURE_KEY);
      } finally { db.close(); }
    } finally { await coordinator.close(); await f.close(); remove(path); }
  });
  it.each(["partial", "input_overflow", "output_overflow", "escaped_secret", "redirect"] as HttpFixtureMode[])("retains unknown and never resends on %s", async mode => {
    const path = root(), ledger = ledgerAt(path), f = await httpFixture({ mode }), coordinator = new GatewayHostRehearsal({ ledger, boundary: f.boundary }), request = input();
    try {
      await expect(coordinator.execute(request, "host")).rejects.toThrow();
      expect(ledger.snapshot()).toMatchObject({ unknown: 1, completed: 0, held_micro_units: credit, blocked: mode === "input_overflow" || mode === "output_overflow" });
      expect(ledger.cacheSnapshot()).toMatchObject({ entries: 0, pending_reserved_bytes: 0 });
      await expect(coordinator.execute(request, "host")).rejects.toThrow("credit_request_outcome_unproven"); expect(f.observations).toHaveLength(1);
      if (mode.includes("overflow")) await expect(coordinator.execute(input(), "host")).rejects.toThrow("credit_account_blocked");
    } finally { await coordinator.close(); await f.close(); remove(path); }
  });
  it("times out the entire DNS/TLS/HTTP sequence and conservatively holds the credit", async () => {
    const path = root(), ledger = ledgerAt(path), f = await httpFixture({ mode: "timeout" }), coordinator = new GatewayHostRehearsal({ ledger, boundary: f.boundary, deadlineMs: 150 });
    try { await expect(coordinator.execute(input(), "host")).rejects.toThrow("host_gateway_deadline_exhausted"); expect(ledger.snapshot()).toMatchObject({ unknown: 1, held_micro_units: credit }); expect(f.socket()!.closed).toBe(true); }
    finally { await coordinator.close(); await f.close(); remove(path); }
  });
  it("cancels a late valid response before completing or caching it", async () => {
    const path = root(), ledger = ledgerAt(path), f = await httpFixture(), control = new AbortController();
    const coordinator = new GatewayHostRehearsal({ ledger, boundary: f.boundary, phase: phase => { if (phase === "response_validated") control.abort(); } });
    try { await expect(coordinator.execute(input(), "host", control.signal)).rejects.toThrow("host_gateway_aborted"); expect(ledger.snapshot()).toMatchObject({ unknown: 1, completed: 0 }); expect(ledger.cacheSnapshot().entries).toBe(0); }
    finally { await coordinator.close(); await f.close(); remove(path); }
  });
  it("closes by cancelling and joining the in-flight operation before closing its database", async () => {
    const path = root(), ledger = ledgerAt(path); let reached!: () => void; const received = new Promise<void>(resolve => { reached = resolve; });
    const f = await httpFixture({ mode: "timeout", onRequest: reached }), coordinator = new GatewayHostRehearsal({ ledger, boundary: f.boundary }), request = input();
    try {
      const pending = coordinator.execute(request, "host"); const outcome = pending.catch((error: Error) => error.message); await received;
      const closed = coordinator.close(); expect(coordinator.close()).toBe(closed); await closed;
      expect(await outcome).toBe("host_gateway_aborted"); expect(f.socket()!.closed).toBe(true);
      await expect(coordinator.execute(input(), "host")).rejects.toThrow("host_gateway_aborted");
      const reopened = ledgerAt(path); try { expect(reopened.snapshot()).toMatchObject({ unknown: 1, held_micro_units: credit }); } finally { reopened.close(); }
    } finally { await coordinator.close(); await f.close(); remove(path); }
  });
  it("does not duplicate an overlapping request or accept caller mutation after prepare", async () => {
    const path = root(), ledger = ledgerAt(path), f = await httpFixture(), coordinator = new GatewayHostRehearsal({ ledger, boundary: f.boundary }), request = input(), original = JSON.parse(JSON.stringify(request)) as ReturnType<typeof input>;
    try { const pending = coordinator.execute(request, "host"); await expect(coordinator.execute(original, "host")).rejects.toThrow("credit_request_outcome_unproven"); request.messages[0]!.content = "changed caller input";
      await pending; expect(f.observations[0]!.body).toMatchObject({ messages: original.messages }); await expect(coordinator.execute(request, "host")).rejects.toThrow("credit_request_id_conflict"); expect(f.observations).toHaveLength(1);
    } finally { await coordinator.close(); await f.close(); remove(path); }
  });
  it("preserves an already committed completion if cancellation prevents delivering its result", async () => {
    const path = root(), ledger = ledgerAt(path), f = await httpFixture(), control = new AbortController(), request = input();
    const coordinator = new GatewayHostRehearsal({ ledger, boundary: f.boundary, phase: phase => { if (phase === "completion_committed") control.abort(); } });
    try {
      await expect(coordinator.execute(request, "host", control.signal)).rejects.toThrow("host_gateway_aborted");
      expect(ledger.snapshot()).toMatchObject({ completed: 1, unknown: 0, held_micro_units: credit }); expect(ledger.cacheSnapshot().entries).toBe(1);
      expect((await coordinator.execute(request, "host")).replay).toBe(true); expect(f.observations).toHaveLength(1);
    } finally { await coordinator.close(); await f.close(); remove(path); }
  });
  it("refuses a new request when cache capacity is exhausted before any DNS or HTTP", async () => {
    const path = root(), limited = { response_cache: { maximum_bytes: GATEWAY_CREDIT_CACHE_ENTRY_BYTES, maximum_entries: 1 } };
    const ledger = new GatewayCreditLedger(join(path, "credits.sqlite"), policy, dependencies, limited); ledger.registerBudget("host", policy.maximum_micro_units);
    const f = await httpFixture(), coordinator = new GatewayHostRehearsal({ ledger, boundary: f.boundary });
    try { await coordinator.execute(input(), "host"); await expect(coordinator.execute(input(), "host")).rejects.toThrow("credit_response_cache_exhausted"); expect(f.counts()).toEqual({ dns: 1, dials: 1 }); expect(ledger.snapshot().held_micro_units).toBe(credit); }
    finally { await coordinator.close(); await f.close(); remove(path); }
  });
  it("can cancel an awaited host phase and join without waiting for an unresolving test hook", async () => {
    const path = root(), ledger = ledgerAt(path), f = await httpFixture(); let arrived!: () => void; const reached = new Promise<void>(resolve => { arrived = resolve; });
    const coordinator = new GatewayHostRehearsal({ ledger, boundary: f.boundary, phase: phase => { if (phase === "dispatch_committed") { arrived(); return new Promise<void>(() => {}); } } });
    try { const outcome = coordinator.execute(input(), "host").catch((error: Error) => error.message); await reached; await coordinator.close(); expect(await outcome).toBe("host_gateway_aborted"); expect(f.counts()).toEqual({ dns: 0, dials: 0 }); }
    finally { await coordinator.close(); await f.close(); remove(path); }
  });
  it("keeps real admission closed and refuses to coordinate a format 1 receipt-only ledger", async () => {
    const path = root(), old = new GatewayCreditLedger(join(path, "old.sqlite"), policy, dependencies), boundary = new GatewayNetworkBoundary();
    try { expect(() => new GatewayHostRehearsal({ ledger: old, boundary })).toThrow("host_gateway_cache_required");
      expect(() => createDedicatedGatewayHost({ format: "cimiloop/dedicated-model/1.0.0", provider: "zhipuai-coding-plan", model: "zhipuai-coding-plan/glm-5.3", credential_file: join(path, "never-read.dpapi.json"), credential_digest: digest("public fixture") })).toThrow("gateway_reliable_billing_profile_unavailable");
    } finally { old.close(); remove(path); }
  });
});

describe.runIf(process.platform === "win32" && process.arch === "x64")("host cache with independently identified Windows writers", () => {
  let path: string, launcher: string;
  beforeAll(async () => { path = root(); launcher = await buildWindowsLauncher(path); }, 60000);
  afterAll(() => remove(path));
  const worker = fileURLToPath(new URL("gateway-host-worker.mjs", import.meta.url));
  it.each(["response_validated", "completion_committed"] as const)("recovers an actual host exit immediately after %s without another HTTP call", async phase => {
    const file = join(path, phase + ".sqlite"), deps = await creditHostDependencies(launcher, { now: () => time }), init = new GatewayCreditLedger(file, policy, deps, cache); init.registerBudget("host", policy.maximum_micro_units); init.close();
    const f = await httpFixture(), request = input();
    try {
      await expect(execute(process.execPath, [worker, file, JSON.stringify(policy), JSON.stringify(cache), launcher, String(f.port), JSON.stringify(request), phase], { timeout: 15000, windowsHide: true })).rejects.toMatchObject({ code: 73 });
      const ledger = new GatewayCreditLedger(file, policy, deps, cache), coordinator = new GatewayHostRehearsal({ ledger, boundary: f.boundary });
      try {
        if (phase === "response_validated") {
          expect(ledger.snapshot()).toMatchObject({ dispatching: 1, completed: 0 }); let observed = await ledger.reconcileOwners(); const until = Date.now() + 10000;
          while (observed.unknown_owners && Date.now() < until) { await delay(100); observed = await ledger.reconcileOwners(); }
          expect(observed).toMatchObject({ verified_ended_owners: 1, reconciled_requests: 1, unknown_owners: 0 });
          await expect(coordinator.execute(request, "host")).rejects.toThrow("credit_request_outcome_unproven"); expect(ledger.cacheSnapshot().entries).toBe(0);
        } else { expect((await coordinator.execute(request, "host")).replay).toBe(true); expect(ledger.cacheSnapshot()).toMatchObject({ entries: 1, pending_reserved_bytes: 0 }); }
        expect(ledger.snapshot().held_micro_units).toBe(credit); expect(f.observations).toHaveLength(1); expect(f.counts()).toEqual({ dns: 0, dials: 0 });
      } finally { await coordinator.close(); }
    } finally { await f.close(); }
  }, 20000);
  it("allows just one HTTP operation when two actual hosts compete for the last cache slot", async () => {
    const file = join(path, "race.sqlite"), limited = { response_cache: { maximum_bytes: GATEWAY_CREDIT_CACHE_ENTRY_BYTES, maximum_entries: 1 } }, deps = await creditHostDependencies(launcher, { now: () => time });
    const init = new GatewayCreditLedger(file, policy, deps, limited); init.registerBudget("host", policy.maximum_micro_units); init.close(); const f = await httpFixture();
    try {
      const outcomes = await Promise.all([input(), input()].map(request => execute(process.execPath, [worker, file, JSON.stringify(policy), JSON.stringify(limited), launcher, String(f.port), JSON.stringify(request), "none"], { timeout: 15000, windowsHide: true })));
      expect(outcomes.map(output => (JSON.parse(output.stdout) as { state: string }).state).sort()).toEqual(["completed", "credit_response_cache_exhausted"]);
      expect(f.observations).toHaveLength(1); const ledger = new GatewayCreditLedger(file, policy, deps, limited);
      try { expect(ledger.snapshot()).toMatchObject({ completed: 1, held_micro_units: credit }); expect(ledger.cacheSnapshot()).toMatchObject({ entries: 1, pending_reserved_bytes: 0 }); } finally { ledger.close(); }
    } finally { await f.close(); }
  }, 20000);
});
