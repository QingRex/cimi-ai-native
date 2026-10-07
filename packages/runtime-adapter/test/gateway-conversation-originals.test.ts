import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { GatewayCreditLedger, GATEWAY_CONVERSATION_ORIGINAL_SLOT_BYTES, GATEWAY_CONVERSATION_ORIGINAL_RESPONSE_BYTES,
  type GatewayCreditPolicy, type GatewayCreditConversationOriginalOptions } from "../src/gateway-credit.js";
import { GatewayConversationOriginalHostRehearsal, GatewayConversationHostRehearsal } from "../src/gateway-host.js";
import { GatewayNetworkBoundary } from "../src/gateway-network.js";
import { prepareGatewayConversation, parseGatewayConversation } from "../src/gateway-conversation.js";
import { openPublicNamedMethodOriginals } from "../src/named-method-originals.js";
import { replayFixedMethodTranscript } from "../src/fixed-method-replay.js";
import { creditHostDependencies } from "../src/gateway-credit-owner.js";
import { buildWindowsLauncher } from "../src/native.js";
import { digest } from "../src/files.js";
import { httpFixture, HTTP_FIXTURE_KEY } from "./gateway-http-fixture.js";
import { conversationInput, conversationCompletion, conversationReply } from "./gateway-conversation-fixture.js";
import { fixedMethodFixture } from "./fixed-method-fixture.js";
import { constructedNamedTranscript } from "../../../tests/fixtures/named-method-transcript.js";

const time = Date.parse("2026-10-05T00:00:00Z");
const policy: GatewayCreditPolicy = { format: "cimiloop/gateway-credit-rehearsal/1.0.0", scope: "credit_budget_rehearsal", account_scope_digest: digest("original public account").value,
  unit: "ZHIPU_CODING_PLAN_CREDIT", model: "glm-5.3", maximum_micro_units: 368000000 };
const dependencies = { identity: { pid: process.pid, creation_ticks: "1", image: process.execPath }, now: () => time };
const options = (operation_key = "public_original", profile_digest = digest("public profile").value, maximum_entries = 8, maximum_bytes = maximum_entries * GATEWAY_CONVERSATION_ORIGINAL_SLOT_BYTES): GatewayCreditConversationOriginalOptions =>
  ({ conversation_original_cache: { operation_key, profile_digest, maximum_entries, maximum_bytes } });
function fixture(cache = options()) {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-conversation-original-test-")), file = join(root, "credit.sqlite");
  const ledger = new GatewayCreditLedger(file, policy, dependencies, cache); ledger.registerBudget("public", policy.maximum_micro_units);
  return { root, file, ledger, cache, cleanup() { ledger.close(); if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-conversation-original-test-")) throw Error("bad cleanup path"); rmSync(root, { recursive: true, force: true }); } };
}
function reserve(ledger: GatewayCreditLedger, input: unknown) {
  const { prepared } = prepareGatewayConversation(input);
  const request = { request_id: prepared.request_id, budget_key: "public", input_digest: prepared.input_digest, input_tokens: prepared.input_tokens, output_tokens: prepared.output_tokens };
  return { request, claim: ledger.reserveConversationOriginal(request, input) };
}
function completed(f: ReturnType<typeof fixture>) {
  const input = conversationInput("json"), prepared = prepareGatewayConversation(input), raw = Buffer.from(JSON.stringify(conversationCompletion(input.request_id)));
  const response = parseGatewayConversation(raw, prepared.prepared, prepared.tools, prepared.prior_call_ids, HTTP_FIXTURE_KEY), { request, claim } = reserve(f.ledger, input);
  f.ledger.dispatch(claim.permit!); const receipt = f.ledger.completeConversationOriginal(claim.permit!, response, raw);
  return { input, request, raw, response, receipt, permit: claim.permit! };
}

describe("explicit format 4 original public conversation custody", () => {
  it.each(["json", "sse"] as const)("stores the exact HTTP bytes and replays after reopen without DNS/HTTP: %s", async mode => {
    const f = fixture(), replies: Buffer[] = [], http = await httpFixture({ reply: body => { const reply = conversationReply(body); replies.push(Buffer.concat(reply.chunks)); return reply; },
      onRequest: () => expect(f.ledger.snapshot().dispatching).toBe(1) });
    const host = new GatewayConversationOriginalHostRehearsal({ ledger: f.ledger, boundary: http.boundary }), input = conversationInput(mode);
    try {
      const result = await host.execute(input, "public"), original = f.ledger.readConversationOriginals()[0]!;
      expect(original.response_body).toEqual(replies[0]); expect(digest(original.response_body!).value).toBe(result.response.response_digest);
      expect(original.input).toEqual(input); expect(original.request_body!.toString()).toBe(JSON.stringify(http.observations[0]!.body)); expect(original.receipt).toEqual(result.receipt);
      expect(original).toMatchObject({ origin: "public_fixture", state: "completed", receipt: { actual_cost_known: false, admission_ready: false } });
      original.request_body.fill(0); original.response_body!.fill(0); (original.input as any).messages[0].content = "mutated";
      expect(f.ledger.readConversationOriginals()[0]!.response_body).toEqual(replies[0]);
      expect(await host.execute(input, "public")).toEqual({ ...result, replay: true }); expect(http.observations).toHaveLength(1);
      await host.close(); const reopened = new GatewayCreditLedger(f.file, policy, { ...dependencies, now: () => time + 30 * 86400000 }, f.cache);
      const next = new GatewayConversationOriginalHostRehearsal({ ledger: reopened, boundary: new GatewayNetworkBoundary({ resolve: async () => { throw Error("DNS forbidden during replay"); } }) });
      try { expect(await next.execute(input, "public")).toEqual({ ...result, replay: true }); } finally { await next.close(); }
      expect(readFileSync(f.file).includes(Buffer.from(HTTP_FIXTURE_KEY))).toBe(false);
    } finally { await host.close(); await http.close(); f.cleanup(); }
  });
  it.each(["secret", "incomplete", "bad_digest"])("does not commit/replay an invalid original response: %s", async mode => {
    const f = fixture(), http = await httpFixture({ reply: body => { const reply = conversationReply(body);
      return mode === "secret" ? { content_type: "application/json", chunks: [Buffer.from(HTTP_FIXTURE_KEY)] } : { ...reply, incomplete: mode === "incomplete" }; } });
    const host = new GatewayConversationOriginalHostRehearsal({ ledger: f.ledger, boundary: http.boundary }), input = conversationInput();
    try {
      if (mode === "bad_digest") {
        const value = completed(f); expect(() => f.ledger.completeConversationOriginal(value.permit, { ...value.response, response_digest: "0".repeat(64) }, value.raw)).toThrow("credit_conversation_original_conflict");
      } else {
        await expect(host.execute(input, "public")).rejects.toThrow(); expect(f.ledger.readConversationOriginals()[0]).toMatchObject({ state: "unknown", response_body: null, receipt: null });
        await expect(host.execute(input, "public")).rejects.toThrow("credit_request_outcome_unproven"); expect(http.observations).toHaveLength(1);
      }
    } finally { await host.close(); await http.close(); f.cleanup(); }
  });
  it("checks nested credentials before holding credits or persisting a prompt", async () => {
    const f = fixture(), http = await httpFixture(), host = new GatewayConversationOriginalHostRehearsal({ ledger: f.ledger, boundary: http.boundary });
    try { const input = conversationInput("json"); input.messages[0]!.content = HTTP_FIXTURE_KEY;
      await expect(host.execute(input, "public")).rejects.toThrow("gateway_credential_in_request"); expect(f.ledger.snapshot().held_micro_units).toBe(0); expect(f.ledger.readConversationOriginals()).toEqual([]); expect(http.counts()).toEqual({ dns: 0, dials: 0 });
    } finally { await host.close(); await http.close(); f.cleanup(); }
  });
  it("rolls back raw response, normalized cache and receipt together at the commit boundary", () => {
    const f = fixture(), input = conversationInput("json"), p = prepareGatewayConversation(input), raw = Buffer.from(JSON.stringify(conversationCompletion(input.request_id)));
    try { const response = parseGatewayConversation(raw, p.prepared, p.tools, p.prior_call_ids, HTTP_FIXTURE_KEY), { claim } = reserve(f.ledger, input); f.ledger.dispatch(claim.permit!);
      let checkpoints = 0; expect(() => f.ledger.completeConversationOriginal(claim.permit!, response, raw, () => { if (++checkpoints === 2) throw Error("commit cancelled"); })).toThrow("commit cancelled");
      expect(f.ledger.readConversationOriginals()[0]).toMatchObject({ state: "dispatching", response_body: null, receipt: null }); expect(f.ledger.cacheSnapshot()).toMatchObject({ entries: 0 });
      f.ledger.unknown(claim.permit!); expect(() => reserve(f.ledger, input)).toThrow("credit_request_outcome_unproven");
    } finally { f.cleanup(); }
  });
  it("bounds Unknown raw-response slots and the permanent operation entry count", () => {
    const f = fixture(options("public_original", digest("public profile").value, 1));
    try { const value = reserve(f.ledger, conversationInput()); f.ledger.unknown(value.claim.permit!);
      expect(f.ledger.cacheSnapshot()).toMatchObject({ entries: 0, original_entries: 1, pending_reserved_bytes: GATEWAY_CONVERSATION_ORIGINAL_RESPONSE_BYTES });
      expect(() => reserve(f.ledger, conversationInput())).toThrow("credit_response_cache_exhausted"); expect(f.ledger.snapshot().unknown).toBe(1);
    } finally { f.cleanup(); }
  });
  it("keeps inputs and settled raw replies immutable and detects forged normalized digests", () => {
    const f = fixture(); try { const value = completed(f), db = new DatabaseSync(f.file);
      try {
        expect(() => db.prepare("UPDATE credit_conversation_originals SET input='{}'").run()).toThrow("credit_original_immutable");
        expect(() => db.prepare("UPDATE credit_conversation_originals SET response_body=?").run(Buffer.from("{}"))).toThrow("credit_original_immutable");
        expect(() => db.exec("DELETE FROM credit_conversation_originals")).toThrow("credit_original_immutable");
        const fake = { ...value.response, response_digest: "0".repeat(64) }, json = JSON.stringify(fake), receipt = JSON.stringify({ ...value.receipt, response_digest: fake.response_digest });
        db.prepare("UPDATE credit_responses SET response=?,response_digest=?").run(json, digest(json).value); db.prepare("UPDATE credit_requests SET receipt=?,receipt_digest=?").run(receipt, digest(receipt).value);
        expect(() => f.ledger.readConversationOriginals()).toThrow("credit_ledger_corrupt");
        const original = JSON.stringify(value.response), originalReceipt = JSON.stringify(value.receipt);
        db.prepare("UPDATE credit_responses SET response=?,response_digest=?").run(original, digest(original).value); db.prepare("UPDATE credit_requests SET receipt=?,receipt_digest=?").run(originalReceipt, digest(originalReceipt).value);
      } finally { db.close(); }
    } finally { f.cleanup(); }
  });
  it("never upgrades formats 1/2/3 or an imported origin, and reads only existing format 4", () => {
    const f = fixture(); try {
      expect(() => new GatewayConversationHostRehearsal({ ledger: f.ledger, boundary: new GatewayNetworkBoundary() })).toThrow("host_gateway_conversation_cache_required");
      expect(() => new GatewayCreditLedger(f.file, policy, dependencies, { conversation_cache: { maximum_bytes: GATEWAY_CONVERSATION_ORIGINAL_SLOT_BYTES, maximum_entries: 8 } })).toThrow("credit_ledger_format_unavailable");
      expect(() => openPublicNamedMethodOriginals(f.file, policy, { conversation_cache: { maximum_bytes: GATEWAY_CONVERSATION_ORIGINAL_SLOT_BYTES, maximum_entries: 8 } } as any)).toThrow("credit_conversation_originals_unavailable");
      expect(() => new GatewayCreditLedger(join(f.root, "bad.sqlite"), policy, dependencies, { conversation_original_cache: { ...f.cache.conversation_original_cache, origin: "external_model" } } as any)).toThrow("invalid_credit_response_cache_policy");
      const missing = join(f.root, "missing.sqlite"); expect(() => openPublicNamedMethodOriginals(missing, policy, f.cache)).toThrow(); expect(existsSync(missing)).toBe(false);
      expect(() => openPublicNamedMethodOriginals(f.file, policy, options("changed"))).toThrow("credit_cache_policy_conflict");
    } finally { f.cleanup(); }
  });
  it("verifies every projected named exchange from the original ledger and rejects transplants or missing rows", () => {
    const method = fixedMethodFixture(), t = constructedNamedTranscript(method.profile, method.files, { purpose: "clarification", questions: [], unresolved: [] });
    const f = fixture(options(method.profile.invocation_key, digest(JSON.stringify(method.profile)).value));
    try {
      t.gateway_inputs.forEach((input, i) => { const { claim } = reserve(f.ledger, input); f.ledger.dispatch(claim.permit!);
        f.ledger.completeConversationOriginal(claim.permit!, t.transcript.exchanges[i]!.upstream_response as any, t.raw_responses[i]!); });
      f.ledger.close(); const before = digest(readFileSync(f.file)), reader = openPublicNamedMethodOriginals(f.file, policy, f.cache);
      try { const proof = reader.verify(method.profile, method.files, t.transcript); expect(proof).toMatchObject({ origin: "public_fixture", raw_conversations_verified: true, actual_cost_known: false, formal_execution_enabled: false });
        expect(proof.receipts).toHaveLength(t.transcript.exchanges.length); expect(digest(readFileSync(f.file))).toEqual(before);
        const altered = structuredClone(t.transcript); (altered.exchanges[0]!.upstream_response as any).response_digest = "0".repeat(64);
        // Both mapped digests are forged consistently; only the original bytes expose it.
        (altered.exchanges[0]!.mapped_response as any).response_digest = "0".repeat(64);
        expect(replayFixedMethodTranscript(method.profile, method.files, altered).proof.status).toBe("Succeeded");
        expect(() => reader.verify(method.profile, method.files, altered)).toThrow("named_method_original_exchange_unproven");
        expect(() => reader.verify({ ...method.profile, invocation_key: "transplant" }, method.files, t.transcript)).toThrow();
      } finally { reader.close(); }
      const empty = fixture(f.cache); try { const emptyReader = openPublicNamedMethodOriginals(empty.file, policy, empty.cache);
        try { expect(() => emptyReader.verify(method.profile, method.files, t.transcript)).toThrow("named_method_original_count_changed"); } finally { emptyReader.close(); }
      } finally { empty.cleanup(); }
    } finally { f.cleanup(); }
  });
});

it.runIf(process.platform === "win32" && process.arch === "x64").each(["response_validated", "raw_response_updated", "cache_response_inserted", "completion_committed"] as const)(
  "recovers actual Windows process exit at %s from original OS identity without resending", async phase => {
    const f = fixture(), launcher = await buildWindowsLauncher(f.root); f.ledger.registerBudget("host", policy.maximum_micro_units); f.ledger.close();
    const http = await httpFixture({ reply: conversationReply }), input = conversationInput(), worker = fileURLToPath(new URL("gateway-host-worker.mjs", import.meta.url));
    try {
      await expect(promisify(execFile)(process.execPath, [worker, f.file, JSON.stringify(policy), JSON.stringify(f.cache), launcher, String(http.port), JSON.stringify(input), phase], { timeout: 15000, windowsHide: true })).rejects.toMatchObject({ code: 73 });
      const deps = await creditHostDependencies(launcher, { now: () => time }), ledger = new GatewayCreditLedger(f.file, policy, deps, f.cache);
      const host = new GatewayConversationOriginalHostRehearsal({ ledger, boundary: http.boundary });
      try {
        if (phase === "completion_committed") {
          expect(ledger.readConversationOriginals()[0]).toMatchObject({ state: "completed", origin: "public_fixture" });
          expect((await host.execute(input, "host")).replay).toBe(true);
        } else {
          expect(ledger.readConversationOriginals()[0]).toMatchObject({ state: "dispatching", response_body: null, receipt: null });
          let observed = await ledger.reconcileOwners(); const until = Date.now() + 10000;
          while (observed.unknown_owners && Date.now() < until) { await delay(100); observed = await ledger.reconcileOwners(); }
          expect(observed).toMatchObject({ verified_ended_owners: 1, reconciled_requests: 1, unknown_owners: 0 });
          expect(ledger.readConversationOriginals()[0]).toMatchObject({ state: "unknown", response_body: null, receipt: null });
          await expect(host.execute(input, "host")).rejects.toThrow("credit_request_outcome_unproven");
        }
        expect(ledger.snapshot().held_micro_units).toBe(1000000); expect(http.observations).toHaveLength(1); expect(http.counts()).toEqual({ dns: 0, dials: 0 });
      } finally { await host.close(); }
    } finally { await http.close(); f.cleanup(); }
  }, 60000);
