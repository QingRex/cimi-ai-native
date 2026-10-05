import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { GatewayCreditLedger, GATEWAY_CREDIT_CACHE_ENTRY_BYTES as entryBytes, type GatewayCreditCacheOptions, type GatewayCreditPolicy } from "../src/gateway-credit.js";
import type { GatewayHttpResponse } from "../src/gateway-http.js";
import { digest } from "../src/files.js";
const time = Date.parse("2026-10-05T00:00:00Z"), credit = 1000000;
const policy: GatewayCreditPolicy = { format: "cimiloop/gateway-credit-rehearsal/1.0.0", scope: "credit_budget_rehearsal", account_scope_digest: digest("cache public fixture account").value,
  unit: "ZHIPU_CODING_PLAN_CREDIT", model: "glm-5.3", maximum_micro_units: 8 * credit };
const options = (entries = 8, bytes = entries * entryBytes): GatewayCreditCacheOptions => ({ response_cache: { maximum_bytes: bytes, maximum_entries: entries } });
const dependencies = { identity: { pid: process.pid, creation_ticks: "1", image: process.execPath }, now: () => time };
const request = () => ({ request_id: randomUUID(), budget_key: "cache", input_digest: "b".repeat(64), input_tokens: 100, output_tokens: 32 });
const response = (input: ReturnType<typeof request>): GatewayHttpResponse => ({ request_id: input.request_id, input_digest: input.input_digest, response_digest: "d".repeat(64), text: "public cached reply",
  finish_reason: "stop", usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 }, thinking_usage_verified: false, actual_cost_known: false, billing_admission_ready: false });
const fixture = (cache = options()) => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-credit-cache-test-")), file = join(root, "credits.sqlite");
  const ledger = new GatewayCreditLedger(file, policy, dependencies, cache); ledger.registerBudget("cache", policy.maximum_micro_units);
  return { root, file, ledger, cache };
};
const remove = (root: string) => { if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-credit-cache-test-")) throw Error("bad cleanup path"); rmSync(root, { recursive: true, force: true }); };
const complete = (ledger: GatewayCreditLedger) => { const input = request(), permit = ledger.reserve(input).permit!; ledger.dispatch(permit); const value = response(input); return { input, permit, value, receipt: ledger.completeCached(permit, value) }; };
describe("explicit credit format 2 atomic bounded reply cache", () => {
  it("replays the exact public reply and receipt after reopen and rate expiry without lowering holds", () => {
    const f = fixture(); try {
      const done = complete(f.ledger); expect(f.ledger.completeCached(done.permit, done.value)).toEqual(done.receipt);
      expect(() => f.ledger.completeCached(done.permit, { ...done.value, text: "different reply" })).toThrow("credit_completion_conflict");
      f.ledger.close(); const reopened = new GatewayCreditLedger(f.file, policy, { ...dependencies, now: () => time + 20 * 86400000 }, f.cache);
      try { const replay = reopened.reserve(done.input); expect(replay).toEqual({ replay: done.receipt, cached_response: done.value }); expect(Object.isFrozen(replay.cached_response!.usage)).toBe(true);
        expect(reopened.snapshot()).toMatchObject({ completed: 1, held_micro_units: credit, admission_ready: false }); expect(reopened.cacheSnapshot()).toMatchObject({ storage_format: 2, entries: 1, pending_reserved_bytes: 0 });
      } finally { reopened.close(); }
    } finally { f.ledger.close(); remove(f.root); }
  });
  it("preserves both old format 1 and explicit format 2 and refuses implicit conversion in either direction", () => {
    const f = fixture(); f.ledger.close(); const oldFile = join(f.root, "old.sqlite"), old = new GatewayCreditLedger(oldFile, policy, dependencies); old.close();
    try { expect(() => new GatewayCreditLedger(oldFile, policy, dependencies, f.cache)).toThrow("credit_ledger_format_unavailable");
      expect(() => new GatewayCreditLedger(f.file, policy, dependencies)).toThrow("credit_ledger_format_unavailable");
      for (const [file, version] of [[oldFile, 1], [f.file, 2]] as const) { const db = new DatabaseSync(file); try { expect(db.prepare("PRAGMA user_version").get()!.user_version).toBe(version); expect(db.prepare("PRAGMA application_id").get()!.application_id).toBe(0x43494d43); } finally { db.close(); } }
    } finally { remove(f.root); }
  });
  it("reserves worst-case cache space and entry slots in the same transaction before a new credit claim", () => {
    const f = fixture(options(8, entryBytes)); try {
      const permit = f.ledger.reserve(request()).permit!; expect(f.ledger.cacheSnapshot()).toMatchObject({ entries: 0, pending_reserved_bytes: entryBytes });
      expect(() => f.ledger.reserve(request())).toThrow("credit_response_cache_exhausted"); expect(f.ledger.snapshot().held_micro_units).toBe(credit);
      f.ledger.unknown(permit); expect(f.ledger.cacheSnapshot().pending_reserved_bytes).toBe(0);
      expect(f.ledger.reserve(request()).permit).toBeDefined(); expect(f.ledger.snapshot().held_micro_units).toBe(2 * credit);
    } finally { f.ledger.close(); remove(f.root); }
  });
  it("never evicts a completed reply to make space for a new request", () => {
    const f = fixture(options(1)); try { const done = complete(f.ledger); expect(() => f.ledger.reserve(request())).toThrow("credit_response_cache_exhausted"); expect(f.ledger.reserve(done.input).cached_response).toEqual(done.value); }
    finally { f.ledger.close(); remove(f.root); }
  });
  it("makes cache ceilings immutable, detached from caller mutation and independent of property order", () => {
    const f = fixture(options(2)); f.cache.response_cache.maximum_bytes = 8 * entryBytes;
    try {
      const ordered = { response_cache: { maximum_entries: 2, maximum_bytes: 2 * entryBytes } }, second = new GatewayCreditLedger(f.file, policy, dependencies, ordered); second.close();
      expect(() => new GatewayCreditLedger(f.file, policy, dependencies, f.cache)).toThrow("credit_cache_policy_conflict");
      expect(f.ledger.cacheSnapshot().maximum_bytes).toBe(2 * entryBytes);
    } finally { f.ledger.close(); remove(f.root); }
  });
  it("requires the cached completion path and validates request binding, usage and extra payloads before commit", () => {
    const f = fixture(); try {
      const input = request(), permit = f.ledger.reserve(input).permit!, value = response(input); f.ledger.dispatch(permit);
      expect(() => f.ledger.complete(permit, { response_digest: value.response_digest, input_tokens: 4, output_tokens: 3 })).toThrow("credit_response_cache_required");
      expect(() => f.ledger.completeCached(permit, { ...value, input_digest: "e".repeat(64) })).toThrow("credit_cached_response_conflict");
      expect(() => f.ledger.completeCached(permit, { ...value, reasoning_content: "do not persist" } as GatewayHttpResponse)).toThrow("gateway_cached_response_invalid");
      expect(() => f.ledger.completeCached(permit, { ...value, text: "\u0001".repeat(262144) })).toThrow("credit_response_cache_entry_limit");
      expect(f.ledger.snapshot()).toMatchObject({ dispatching: 1, completed: 0 }); expect(f.ledger.cacheSnapshot().entries).toBe(0);
      const changed = { ...value, usage: { input_tokens: 101, output_tokens: 3, total_tokens: 104 } };
      expect(() => f.ledger.completeCached(permit, changed)).toThrow("credit_usage_bound_exceeded");
      expect(f.ledger.snapshot()).toMatchObject({ unknown: 1, blocked: true, held_micro_units: credit }); expect(f.ledger.cacheSnapshot().entries).toBe(0);
    } finally { f.ledger.close(); remove(f.root); }
  });
  it("rolls back an inserted cache row if the subsequent receipt update fails", () => {
    const f = fixture(); const input = request(), permit = f.ledger.reserve(input).permit!; f.ledger.dispatch(permit);
    const prepare = DatabaseSync.prototype.prepare; let interrupted = false;
    const spy = vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (this: DatabaseSync, sql: string) {
      if (!interrupted && sql.startsWith("UPDATE credit_requests SET state='completed'")) { interrupted = true; throw Error("synthetic write interruption"); }
      return prepare.call(this, sql);
    });
    try {
      expect(() => f.ledger.completeCached(permit, response(input))).toThrow("synthetic write interruption"); spy.mockRestore();
      expect(interrupted).toBe(true); expect(f.ledger.cacheSnapshot()).toMatchObject({ entries: 0, stored_bytes: 0, pending_reserved_bytes: entryBytes });
      expect(f.ledger.snapshot()).toMatchObject({ dispatching: 1, completed: 0, held_micro_units: credit }); f.ledger.completeCached(permit, response(input));
      expect(f.ledger.cacheSnapshot().entries).toBe(1);
    } finally { spy.mockRestore(); f.ledger.close(); remove(f.root); }
  });
  it("rolls back both cached reply and completed receipt when a final host checkpoint cancels before commit", () => {
    const f = fixture(); try {
      const input = request(), permit = f.ledger.reserve(input).permit!; f.ledger.dispatch(permit); let checkpoints = 0;
      expect(() => f.ledger.completeCached(permit, response(input), () => { if (++checkpoints === 2) throw Error("synthetic abort before commit"); })).toThrow("synthetic abort before commit");
      expect(checkpoints).toBe(2); expect(f.ledger.snapshot()).toMatchObject({ dispatching: 1, completed: 0, held_micro_units: credit });
      expect(f.ledger.cacheSnapshot()).toMatchObject({ entries: 0, stored_bytes: 0, pending_reserved_bytes: entryBytes });
    } finally { f.ledger.close(); remove(f.root); }
  });
  it.each(["missing", "digest", "binding", "usage", "admission", "extra_fields", "policy", "schema"])("refuses damaged cache %s without recreating or repairing it", mode => {
    const f = fixture(); complete(f.ledger); f.ledger.close(); const db = new DatabaseSync(f.file);
    try {
      if (mode === "missing") db.exec("DELETE FROM credit_responses");
      else if (mode === "digest") db.exec("UPDATE credit_responses SET response_digest='damaged'");
      else if (mode === "policy") db.exec("DELETE FROM credit_cache_policy");
      else if (mode === "schema") db.exec("DROP TABLE credit_responses");
      else { const row = db.prepare("SELECT * FROM credit_responses").get()!, value = JSON.parse(String(row.response)) as Record<string, unknown>;
        if (mode === "binding") value.input_digest = "e".repeat(64);
        if (mode === "usage") value.usage = { input_tokens: 9, output_tokens: 3, total_tokens: 12 };
        if (mode === "admission") value.billing_admission_ready = true;
        if (mode === "extra_fields") value.reasoning_content = "must not persist";
        const raw = JSON.stringify(value); db.prepare("UPDATE credit_responses SET response=?,response_digest=?").run(raw, digest(raw).value);
      }
    } finally { db.close(); }
    try { expect(() => new GatewayCreditLedger(f.file, policy, dependencies, f.cache)).toThrow(mode === "schema" ? "credit_ledger_format_unavailable" : "credit_ledger_corrupt"); }
    finally { remove(f.root); }
  });
  it("rejects invalid cache policy fields before creating a directory", () => {
    const f = fixture(); f.ledger.close(); const absent = join(f.root, "absent", "cache.sqlite");
    try { for (const cache of [{ response_cache: { maximum_bytes: 1, maximum_entries: 1 } }, { response_cache: { maximum_bytes: entryBytes, maximum_entries: 0 } },
      { response_cache: { maximum_bytes: entryBytes, maximum_entries: 1 }, approved: true }]) expect(() => new GatewayCreditLedger(absent, policy, dependencies, cache)).toThrow("invalid_credit_response_cache_policy");
      expect(existsSync(join(f.root, "absent"))).toBe(false);
    } finally { remove(f.root); }
  });
});
