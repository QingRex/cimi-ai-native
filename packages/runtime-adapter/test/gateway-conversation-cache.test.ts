import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { GatewayCreditLedger, GATEWAY_CREDIT_CACHE_ENTRY_BYTES, GATEWAY_CONVERSATION_CACHE_SLOT_BYTES, type GatewayCreditPolicy, type GatewayCreditConversationCacheOptions } from "../src/gateway-credit.js";
import { GatewayHttpTransport } from "../src/gateway-http.js";
import { GatewayNetworkBoundary } from "../src/gateway-network.js";
import { parseGatewayConversation, type GatewayConversationResponse } from "../src/gateway-conversation.js";
import { prepareGatewayConversation } from "../src/gateway-conversation.js";
import { digest } from "../src/files.js";
import { HTTP_FIXTURE_KEY } from "./gateway-http-fixture.js";
import { conversationInput, conversationCompletion, conversationCall } from "./gateway-conversation-fixture.js";
const time = Date.parse("2026-10-05T00:00:00Z"), credit = 1000000;
const policy: GatewayCreditPolicy = { format: "cimiloop/gateway-credit-rehearsal/1.0.0", scope: "credit_budget_rehearsal", account_scope_digest: digest("public conversation cache rehearsal account").value,
  unit: "ZHIPU_CODING_PLAN_CREDIT", model: "glm-5.3", maximum_micro_units: 8 * credit };
const dependencies = { identity: { pid: process.pid, creation_ticks: "1", image: process.execPath }, now: () => time };
const options = (entries = 8, bytes = entries * GATEWAY_CONVERSATION_CACHE_SLOT_BYTES): GatewayCreditConversationCacheOptions => ({ conversation_cache: { maximum_entries: entries, maximum_bytes: bytes } });
const fixture = (cache = options()) => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-conversation-cache-test-")), file = join(root, "credit.sqlite");
  const ledger = new GatewayCreditLedger(file, policy, dependencies, cache); ledger.registerBudget("cache", policy.maximum_micro_units);
  return { root, file, ledger, cache, remove: () => { if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-conversation-cache-test-")) throw Error("bad cleanup path"); rmSync(root, { recursive: true, force: true }); } };
};
const request = (withHistory = false) => {
  const input = conversationInput("json"); if (withHistory) input.messages.push({ role: "assistant", content: null, tool_calls: [conversationCall("old_call")] }, { role: "tool", tool_call_id: "old_call", content: "public private-result fixture excluded from persistent contracts" });
  const transport = new GatewayHttpTransport(new GatewayNetworkBoundary()), prepared = transport.prepareConversation(input), contract = transport.conversationCacheContract(prepared, HTTP_FIXTURE_KEY), parsed = prepareGatewayConversation(input);
  const response = parseGatewayConversation(Buffer.from(JSON.stringify(conversationCompletion(input.request_id))), prepared, parsed.tools, parsed.prior_call_ids, HTTP_FIXTURE_KEY);
  const creditRequest = { request_id: prepared.request_id, budget_key: "cache", input_digest: prepared.input_digest, input_tokens: prepared.input_tokens, output_tokens: prepared.output_tokens };
  return { input, creditRequest, contract, response };
};
const done = (f: ReturnType<typeof fixture>, withHistory = false) => { const value = request(withHistory), permit = f.ledger.reserveConversation(value.creditRequest, value.contract).permit!; f.ledger.dispatch(permit);
  return { ...value, permit, receipt: f.ledger.completeConversationCached(permit, value.response) }; };

describe("explicit format 3 bounded conversation contracts and reply cache", () => {
  it("atomically replays frozen tool proposals and validates them after reopen and rate expiry", () => {
    const f = fixture(); try {
      const value = done(f, true); expect(f.ledger.completeConversationCached(value.permit, value.response)).toEqual(value.receipt); f.ledger.close();
      const next = new GatewayCreditLedger(f.file, policy, { ...dependencies, now: () => time + 20 * 86400000 }, f.cache);
      try { const replay = next.reserveConversation(value.creditRequest, value.contract); expect(replay).toEqual({ replay: value.receipt, cached_response: value.response });
        expect(Object.isFrozen(replay.cached_response!.tool_calls[0]!.function)).toBe(true); expect(next.snapshot()).toMatchObject({ completed: 1, held_micro_units: credit, admission_ready: false });
        expect(next.cacheSnapshot()).toMatchObject({ storage_format: 3, entries: 1, contract_entries: 1, pending_reserved_bytes: 0 });
      } finally { next.close(); }
      const db = new DatabaseSync(f.file); try {
        const contract = String(db.prepare("SELECT contract FROM credit_conversation_contracts").get()!.contract), cached = String(db.prepare("SELECT response FROM credit_responses").get()!.response);
        for (const excluded of [value.input.messages[0]!.content, value.input.messages[2]!.content, "description", "reasoning_content", "public fixture reasoning", HTTP_FIXTURE_KEY]) expect(contract + cached).not.toContain(excluded as string);
        expect(JSON.parse(contract).prior_call_ids).toEqual(["old_call"]); expect(JSON.parse(cached).tool_execution_authorized).toBe(false);
      } finally { db.close(); }
    } finally { f.ledger.close(); f.remove(); }
  });
  it("keeps a property literally named description while removing schema documentation", () => {
    const input = conversationInput(), parameters = input.tools[0]!.function.parameters as Record<string, unknown>;
    parameters.properties = { description: { type: "string", description: "remove only documentation", const: "keep enum-like business value" } }; parameters.required = ["description"];
    const transport = new GatewayHttpTransport(new GatewayNetworkBoundary()), p = transport.prepareConversation(input), contract = transport.conversationCacheContract(p, HTTP_FIXTURE_KEY);
    expect(contract.tools[0]!.function.parameters.properties).toEqual({ description: { type: "string", const: "keep enum-like business value" } });
  });
  it("mutually refuses formats 1, 2 and 3 with no implicit table or policy conversion", () => {
    const f = fixture(); f.ledger.close();
    const oldOptions = { response_cache: { maximum_entries: 8, maximum_bytes: 8 * GATEWAY_CREDIT_CACHE_ENTRY_BYTES } };
    try {
      const one = join(f.root, "one.sqlite"), two = join(f.root, "two.sqlite"); new GatewayCreditLedger(one, policy, dependencies).close(); new GatewayCreditLedger(two, policy, dependencies, oldOptions).close();
      for (const [file, version] of [[one, 1], [two, 2], [f.file, 3]] as const) {
        for (const selected of [undefined, oldOptions, f.cache]) { const requested = selected === undefined ? 1 : "response_cache" in selected ? 2 : 3;
          if (requested !== version) expect(() => new GatewayCreditLedger(file, policy, dependencies, selected)).toThrow("credit_ledger_format_unavailable"); }
        const db = new DatabaseSync(file); try { expect(db.prepare("PRAGMA user_version").get()!.user_version).toBe(version); } finally { db.close(); }
      }
    } finally { f.remove(); }
  });
  it("reserves actual contract bytes plus worst-case reply bytes before granting a permit", () => {
    const f = fixture(options(8, GATEWAY_CONVERSATION_CACHE_SLOT_BYTES)); try {
      const first = request(), permit = f.ledger.reserveConversation(first.creditRequest, first.contract).permit!;
      expect(f.ledger.cacheSnapshot()).toMatchObject({ contract_entries: 1, contract_bytes: Buffer.byteLength(JSON.stringify(first.contract)), pending_reserved_bytes: GATEWAY_CREDIT_CACHE_ENTRY_BYTES });
      const second = request(); expect(() => f.ledger.reserveConversation(second.creditRequest, second.contract)).toThrow("credit_response_cache_exhausted"); expect(f.ledger.snapshot().held_micro_units).toBe(credit);
      f.ledger.unknown(permit); expect(f.ledger.cacheSnapshot()).toMatchObject({ contract_entries: 1, entries: 0, pending_reserved_bytes: 0 });
      expect(f.ledger.reserveConversation(second.creditRequest, second.contract).permit).toBeDefined(); expect(f.ledger.snapshot().held_micro_units).toBe(2 * credit);
    } finally { f.ledger.close(); f.remove(); }
  });
  it("retains unknown contract identity and cannot evict it to reuse the last entry", () => {
    const f = fixture(options(1)); try { const first = request(), permit = f.ledger.reserveConversation(first.creditRequest, first.contract).permit!; f.ledger.unknown(permit);
      const next = request(); expect(() => f.ledger.reserveConversation(next.creditRequest, next.contract)).toThrow("credit_response_cache_exhausted");
      expect(() => f.ledger.reserveConversation(first.creditRequest, first.contract)).toThrow("credit_request_outcome_unproven"); expect(f.ledger.cacheSnapshot().contract_entries).toBe(1);
    } finally { f.ledger.close(); f.remove(); }
  });
  it("keeps cache ceilings immutable and refuses old methods or a different contract for one request", () => {
    const f = fixture(); try {
      const value = request(), claim = f.ledger.reserveConversation(value.creditRequest, value.contract); expect(() => f.ledger.reserve(value.creditRequest)).toThrow("credit_conversation_cache_required");
      expect(() => f.ledger.reserveConversation(value.creditRequest, { ...value.contract, response_mode: "sse" })).toThrow("credit_conversation_contract_conflict");
      expect(() => f.ledger.reserveConversation(value.creditRequest, { ...value.contract, input_digest: "a".repeat(64) })).toThrow("credit_conversation_contract_conflict");
      f.ledger.dispatch(claim.permit!); expect(() => f.ledger.complete(claim.permit!, { response_digest: "d".repeat(64), input_tokens: 4, output_tokens: 3 })).toThrow("credit_response_cache_required");
      expect(() => f.ledger.completeCached(claim.permit!, value.response as never)).toThrow("credit_conversation_cache_required");
      expect(() => f.ledger.completeConversationCached(claim.permit!, { ...value.response, tool_execution_authorized: true } as never)).toThrow("gateway_cached_conversation_response_invalid");
      f.ledger.close(); expect(() => new GatewayCreditLedger(f.file, policy, dependencies, options(16))).toThrow("credit_cache_policy_conflict");
    } finally { f.ledger.close(); f.remove(); }
  });
  it("keeps the full hold and blocks the account when observed completion usage exceeds the contract", () => {
    const f = fixture(); try { const value = request(), permit = f.ledger.reserveConversation(value.creditRequest, value.contract).permit!; f.ledger.dispatch(permit);
      expect(() => f.ledger.completeConversationCached(permit, { ...value.response, usage: { input_tokens: 4, output_tokens: 33, total_tokens: 37 } })).toThrow("credit_usage_bound_exceeded");
      expect(f.ledger.snapshot()).toMatchObject({ unknown: 1, blocked: true, held_micro_units: credit }); expect(f.ledger.cacheSnapshot()).toMatchObject({ entries: 0, contract_entries: 1 });
    } finally { f.ledger.close(); f.remove(); }
  });
  it("refuses a reply whose JSON escaping exceeds its reserved cache entry before any write", () => {
    const f = fixture(); try { const value = request(), permit = f.ledger.reserveConversation(value.creditRequest, value.contract).permit!; f.ledger.dispatch(permit);
      expect(() => f.ledger.completeConversationCached(permit, { ...value.response, text: "\u0001".repeat(262144), tool_calls: [], finish_reason: "stop" })).toThrow("credit_response_cache_entry_limit");
      expect(f.ledger.snapshot()).toMatchObject({ dispatching: 1, completed: 0 }); expect(f.ledger.cacheSnapshot()).toMatchObject({ entries: 0, contract_entries: 1 });
    } finally { f.ledger.close(); f.remove(); }
  });
  it.each(["sql_failure", "checkpoint"])("rolls back reply and receipt together on %s", mode => {
    const f = fixture(), value = request(), permit = f.ledger.reserveConversation(value.creditRequest, value.contract).permit!; f.ledger.dispatch(permit); let calls = 0;
    const original = DatabaseSync.prototype.prepare, spy = mode === "sql_failure" ? vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function(this: DatabaseSync, sql: string) {
      if (sql.startsWith("UPDATE credit_requests SET state='completed'")) throw Error("public injected failure"); return original.call(this, sql);
    }) : undefined;
    try { expect(() => f.ledger.completeConversationCached(permit, value.response, () => { if (++calls === 2) throw Error("public checkpoint failure"); })).toThrow();
      spy?.mockRestore(); expect(f.ledger.snapshot()).toMatchObject({ dispatching: 1, completed: 0 }); expect(f.ledger.cacheSnapshot()).toMatchObject({ entries: 0, contract_entries: 1 });
    } finally { spy?.mockRestore(); f.ledger.close(); f.remove(); }
  });
  it.each(["missing_contract", "contract_digest", "contract_binding", "contract_schema", "contract_description", "missing_reply", "reply_digest", "reply_binding", "reply_tool", "reply_arguments", "reply_prior_id", "reply_usage", "reply_authority", "reply_extra", "duplicate_json"])("denies corrupt data without repair or resend: %s", mode => {
    const f = fixture(), value = done(f, true); f.ledger.close(); const db = new DatabaseSync(f.file);
    try {
      if (mode === "missing_contract") db.exec("DELETE FROM credit_conversation_contracts");
      else if (mode === "contract_digest") db.exec("UPDATE credit_conversation_contracts SET contract_digest='invalid'");
      else if (mode.startsWith("contract_")) { const data = JSON.parse(String(db.prepare("SELECT contract FROM credit_conversation_contracts").get()!.contract));
        if (mode === "contract_binding") data.input_digest = "a".repeat(64);
        if (mode === "contract_schema") data.tools[0].function.parameters.pattern = ".*";
        if (mode === "contract_description") data.tools[0].function.parameters.description = "should have been omitted";
        const raw = JSON.stringify(data); db.prepare("UPDATE credit_conversation_contracts SET contract=?,contract_digest=?").run(raw, digest(raw).value);
      } else if (mode === "missing_reply") db.exec("DELETE FROM credit_responses");
      else if (mode === "reply_digest") db.exec("UPDATE credit_responses SET response_digest='invalid'");
      else { const data = JSON.parse(String(db.prepare("SELECT response FROM credit_responses").get()!.response));
        if (mode === "reply_binding") data.input_digest = "a".repeat(64);
        if (mode === "reply_tool") data.tool_calls[0].function.name = "not_declared";
        if (mode === "reply_arguments") data.tool_calls[0].function.arguments = '{"shell":true}';
        if (mode === "reply_prior_id") data.tool_calls[0].id = "old_call";
        if (mode === "reply_usage") data.usage = { input_tokens: 5, output_tokens: 3, total_tokens: 8 };
        if (mode === "reply_authority") data.tool_execution_authorized = true;
        if (mode === "reply_extra") data.reasoning_content = "must not persist";
        let raw = JSON.stringify(data); if (mode === "duplicate_json") raw = raw.replace('"tool_execution_authorized":false', '"tool_execution_authorized":false,"tool_execution_authorized":false');
        db.prepare("UPDATE credit_responses SET response=?,response_digest=?").run(raw, digest(raw).value);
      }
    } finally { db.close(); }
    try { expect(() => new GatewayCreditLedger(f.file, policy, dependencies, f.cache)).toThrow("credit_ledger_corrupt");
      const inspect = new DatabaseSync(f.file); try { expect(inspect.prepare("SELECT state FROM credit_requests WHERE request_id=?").get(value.creditRequest.request_id)!.state).toBe("completed"); } finally { inspect.close(); }
    } finally { f.remove(); }
  });
});
