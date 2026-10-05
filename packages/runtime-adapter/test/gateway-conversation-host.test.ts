import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { GatewayConversationHostRehearsal, GatewayHostRehearsal, createDedicatedGatewayHost } from "../src/gateway-host.js";
import { GatewayCreditLedger, GATEWAY_CONVERSATION_CACHE_SLOT_BYTES, type GatewayCreditPolicy } from "../src/gateway-credit.js";
import { GatewayNetworkBoundary } from "../src/gateway-network.js";
import { creditHostDependencies } from "../src/gateway-credit-owner.js";
import { buildWindowsLauncher } from "../src/native.js";
import { digest } from "../src/files.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { httpFixture, HTTP_FIXTURE_KEY } from "./gateway-http-fixture.js";
import { conversationInput, conversationReply, conversationEvents, conversationStream, conversationCall, conversationCompletion } from "./gateway-conversation-fixture.js";
const time = Date.parse("2026-10-05T00:00:00Z"), credit = 1000000;
const execute = promisify(execFile);
const policy: GatewayCreditPolicy = { format: "cimiloop/gateway-credit-rehearsal/1.0.0", scope: "credit_budget_rehearsal", account_scope_digest: digest("public conversation host rehearsal account").value,
  unit: "ZHIPU_CODING_PLAN_CREDIT", model: "glm-5.3", maximum_micro_units: 8 * credit };
const cache = { conversation_cache: { maximum_bytes: 8 * GATEWAY_CONVERSATION_CACHE_SLOT_BYTES, maximum_entries: 8 } };
const dependencies = { identity: { pid: process.pid, creation_ticks: "1", image: process.execPath }, now: () => time };
const root = () => mkdtempSync(join(tmpdir(), "cimiloop-conversation-host-test-"));
const remove = (path: string) => { if (!resolve(path).startsWith(resolve(tmpdir()) + sep + "cimiloop-conversation-host-test-")) throw Error("bad cleanup path"); rmSync(path, { recursive: true, force: true }); };
const ledgerAt = (path: string, options = cache) => { const ledger = new GatewayCreditLedger(join(path, "credit.sqlite"), policy, dependencies, options); ledger.registerBudget("host", policy.maximum_micro_units); return ledger; };
describe("durable tool conversation host with a public fixture credential only", () => {
  it.each(["json", "sse"] as const)("commits dispatch before HTTP and atomically replays only validated tool proposals: %s", async mode => {
    const path = root(), ledger = ledgerAt(path), f = await httpFixture({ reply: conversationReply, onRequest: () => expect(ledger.snapshot().dispatching).toBe(1) });
    const host = new GatewayConversationHostRehearsal({ ledger, boundary: f.boundary, phase: phase => { if (phase === "dispatch_committed") expect(f.counts()).toEqual({ dns: 0, dials: 0 }); } }), request = conversationInput(mode);
    try {
      const first = await host.execute(request, "host"), replay = await host.execute(request, "host"); expect(replay).toEqual({ ...first, replay: true });
      expect(first.response).toMatchObject({ finish_reason: "tool_calls", tool_execution_authorized: false }); expect(first.formal_execution_enabled).toBe(false); expect(f.socket()!.closed).toBe(true);
      expect(f.observations).toHaveLength(1); await host.close();
      const reopened = ledgerAt(path), forbidden = new GatewayNetworkBoundary({ resolve: async () => { throw Error("Replay must not resolve DNS"); } });
      const next = new GatewayConversationHostRehearsal({ ledger: reopened, boundary: forbidden });
      try { expect(await next.execute(request, "host")).toEqual(replay); } finally { await next.close(); }
      const db = new DatabaseSync(join(path, "credit.sqlite")); try {
        const persisted = String(db.prepare("SELECT response FROM credit_responses").get()!.response) + String(db.prepare("SELECT contract FROM credit_conversation_contracts").get()!.contract);
        for (const excluded of [request.messages[0]!.content, "public fixture reasoning", "description", "reasoning_content", HTTP_FIXTURE_KEY]) expect(persisted).not.toContain(excluded as string);
      } finally { db.close(); }
    } finally { await host.close(); await f.close(); remove(path); }
  });
  it("persists two distinct requests for a public tool-result turn and replays either with no new HTTP", async () => {
    const path = root(), ledger = ledgerAt(path), f = await httpFixture({ reply: body => {
      const request = body as { request_id: string; messages: { role: string }[] }; if (request.messages.at(-1)!.role !== "tool") return conversationReply(body);
      const events = conversationEvents(request.request_id), final = events[3] as { choices: { delta: unknown; finish_reason: string }[] };
      final.choices[0]!.finish_reason = "stop"; final.choices[0]!.delta = { content: "public final text" };
      return { content_type: "text/event-stream", chunks: [conversationStream([events[0], final, "[DONE]"])] };
    } }), host = new GatewayConversationHostRehearsal({ ledger, boundary: f.boundary }), firstInput = conversationInput();
    try {
      const first = await host.execute(firstInput, "host"), secondInput = conversationInput(); secondInput.messages = [...firstInput.messages, { role: "assistant", content: first.response.text, tool_calls: first.response.tool_calls },
        { role: "tool", tool_call_id: first.response.tool_calls[0]!.id, content: "public private-tool-result fixture excluded from cache" }];
      const second = await host.execute(secondInput, "host"); expect(second.response).toMatchObject({ text: "public final text", finish_reason: "stop", tool_calls: [], tool_execution_authorized: false });
      expect((await host.execute(firstInput, "host")).response).toEqual(first.response); expect((await host.execute(secondInput, "host")).response).toEqual(second.response);
      expect(f.observations).toHaveLength(2); expect(ledger.snapshot()).toMatchObject({ completed: 2, held_micro_units: 2 * credit });
      const db = new DatabaseSync(join(path, "credit.sqlite")); try { expect(JSON.stringify(db.prepare("SELECT contract,response FROM credit_conversation_contracts JOIN credit_responses USING(request_id)").all())).not.toContain(secondInput.messages.at(-1)!.content as string); } finally { db.close(); }
    } finally { await host.close(); await f.close(); remove(path); }
  });
  it.each(["no_done", "no_usage", "partial_arguments", "unknown_tool", "usage_overflow", "secret", "wrong_type", "partial_http"])("keeps an unknown full hold and never resends after %s", async mode => {
    const path = root(), ledger = ledgerAt(path), request = conversationInput(), f = await httpFixture({ reply: () => {
      const events: any[] = conversationEvents(request.request_id);
      if (mode === "no_done") events.pop();
      if (mode === "no_usage") delete events[3].usage;
      if (mode === "partial_arguments") events[2].choices[0].delta.tool_calls[0].function.arguments = "";
      if (mode === "unknown_tool") events[1].choices[0].delta.tool_calls[0].function.name = "not_declared";
      if (mode === "usage_overflow") { events[3].usage.completion_tokens = 33; events[3].usage.total_tokens = 37; }
      if (mode === "secret") events.splice(1, 0, { ...events[0], choices: [{ index: 0, delta: { content: HTTP_FIXTURE_KEY }, finish_reason: null }] });
      return { content_type: mode === "wrong_type" ? "application/json" : "text/event-stream", chunks: [conversationStream(events)], incomplete: mode === "partial_http" };
    } }), host = new GatewayConversationHostRehearsal({ ledger, boundary: f.boundary });
    try {
      await expect(host.execute(request, "host")).rejects.toThrow(); expect(ledger.snapshot()).toMatchObject({ unknown: 1, completed: 0, held_micro_units: credit, blocked: mode === "usage_overflow" });
      expect(ledger.cacheSnapshot()).toMatchObject({ entries: 0, contract_entries: 1, pending_reserved_bytes: 0 });
      await expect(host.execute(request, "host")).rejects.toThrow("credit_request_outcome_unproven"); expect(f.observations).toHaveLength(1);
      if (mode === "usage_overflow") await expect(host.execute(conversationInput(), "host")).rejects.toThrow("credit_account_blocked");
    } finally { await host.close(); await f.close(); remove(path); }
  });
  it.each(["dispatch_committed", "response_validated", "completion_committed"] as const)("linearizes cancellation against durable completion: %s", async phase => {
    const path = root(), ledger = ledgerAt(path), f = await httpFixture({ reply: conversationReply }), control = new AbortController(), request = conversationInput();
    const host = new GatewayConversationHostRehearsal({ ledger, boundary: f.boundary, phase: current => { if (current === phase) control.abort(); } });
    try {
      await expect(host.execute(request, "host", control.signal)).rejects.toThrow("host_gateway_aborted");
      expect(ledger.snapshot()).toMatchObject({ completed: phase === "completion_committed" ? 1 : 0, unknown: phase === "completion_committed" ? 0 : 1, held_micro_units: credit });
      expect(ledger.cacheSnapshot()).toMatchObject({ contract_entries: 1, entries: phase === "completion_committed" ? 1 : 0 });
      if (phase === "completion_committed") expect((await host.execute(request, "host")).replay).toBe(true);
      expect(f.observations).toHaveLength(phase === "dispatch_committed" ? 0 : 1);
    } finally { await host.close(); await f.close(); remove(path); }
  });
  it("aborts and joins a stalled stream before closing its exact socket and ledger", async () => {
    const path = root(), ledger = ledgerAt(path); let reached!: () => void; const arrived = new Promise<void>(resolve => { reached = resolve; });
    const f = await httpFixture({ onRequest: reached, reply: body => ({ ...conversationReply(body), hang: true }) }), host = new GatewayConversationHostRehearsal({ ledger, boundary: f.boundary });
    try {
      const outcome = host.execute(conversationInput(), "host").catch((error: Error) => error.message); await arrived; const closed = host.close(); expect(host.close()).toBe(closed); await closed;
      expect(await outcome).toBe("host_gateway_aborted"); expect(f.socket()!.closed).toBe(true);
      const next = ledgerAt(path); try { expect(next.snapshot()).toMatchObject({ unknown: 1, held_micro_units: credit }); } finally { next.close(); }
    } finally { await host.close(); await f.close(); remove(path); }
  });
  it("applies the same absolute deadline to a stream that never reaches HTTP EOF", async () => {
    const path = root(), ledger = ledgerAt(path), f = await httpFixture({ reply: body => ({ ...conversationReply(body), hang: true }) }), host = new GatewayConversationHostRehearsal({ ledger, boundary: f.boundary, deadlineMs: 150 });
    try { await expect(host.execute(conversationInput(), "host")).rejects.toThrow("host_gateway_deadline_exhausted"); expect(ledger.snapshot()).toMatchObject({ unknown: 1, held_micro_units: credit }); expect(f.socket()!.closed).toBe(true); }
    finally { await host.close(); await f.close(); remove(path); }
  });
  it("rejects overlapping IDs and changed tool definitions without another network request", async () => {
    const path = root(), ledger = ledgerAt(path), f = await httpFixture({ reply: conversationReply }), host = new GatewayConversationHostRehearsal({ ledger, boundary: f.boundary }), request = conversationInput(), original = structuredClone(request);
    try {
      const pending = host.execute(request, "host"); await expect(host.execute(original, "host")).rejects.toThrow("credit_request_outcome_unproven"); request.tools[0]!.function.name = "changed"; await pending;
      await expect(host.execute(request, "host")).rejects.toThrow("credit_request_id_conflict"); expect(f.observations).toHaveLength(1);
    } finally { await host.close(); await f.close(); remove(path); }
  });
  it("refuses cache exhaustion, credentials in a contract and forged history before any new hold or DNS", async () => {
    const path = root(), ledger = ledgerAt(path, { conversation_cache: { maximum_entries: 1, maximum_bytes: GATEWAY_CONVERSATION_CACHE_SLOT_BYTES } }), f = await httpFixture({ reply: conversationReply });
    const host = new GatewayConversationHostRehearsal({ ledger, boundary: f.boundary });
    try {
      const bad = conversationInput(); (bad.tools[0]!.function.parameters.properties.path as Record<string, unknown>).const = HTTP_FIXTURE_KEY;
      await expect(host.execute(bad, "host")).rejects.toThrow("gateway_credential_in_request"); expect(ledger.snapshot().held_micro_units).toBe(0); expect(f.counts()).toEqual({ dns: 0, dials: 0 });
      const escaped = conversationInput(), encodedKey = [...HTTP_FIXTURE_KEY].map(char => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0")).join("");
      escaped.messages.push({ role: "assistant", content: null, tool_calls: [conversationCall("prior", '{"path":"' + encodedKey + '"}')] }, { role: "tool", tool_call_id: "prior", content: "public result" });
      await expect(host.execute(escaped, "host")).rejects.toThrow("gateway_credential_in_request"); expect(ledger.snapshot().held_micro_units).toBe(0); expect(f.counts()).toEqual({ dns: 0, dials: 0 });
      const history = conversationInput(); history.messages.push({ role: "tool", tool_call_id: "orphan", content: "unbound" }); await expect(host.execute(history, "host")).rejects.toThrow(); expect(ledger.snapshot().held_micro_units).toBe(0);
      await host.execute(conversationInput(), "host"); await expect(host.execute(conversationInput(), "host")).rejects.toThrow("credit_response_cache_exhausted"); expect(ledger.snapshot().held_micro_units).toBe(credit); expect(f.counts()).toEqual({ dns: 1, dials: 1 });
    } finally { await host.close(); await f.close(); remove(path); }
  });
  it("refuses ledger profile mixing and keeps the production factory closed", () => {
    const path = root(), ledger = ledgerAt(path), two = new GatewayCreditLedger(join(path, "old.sqlite"), policy, dependencies, { response_cache: { maximum_bytes: 335872, maximum_entries: 1 } });
    try { const boundary = new GatewayNetworkBoundary(); expect(() => new GatewayHostRehearsal({ ledger, boundary })).toThrow("host_gateway_cache_required");
      expect(() => new GatewayConversationHostRehearsal({ ledger: two, boundary })).toThrow("host_gateway_conversation_cache_required");
      expect(() => createDedicatedGatewayHost({ format: "cimiloop/dedicated-model/1.0.0", provider: "zhipuai-coding-plan", model: "zhipuai-coding-plan/glm-5.3", credential_file: join(path, "never-read.dpapi.json"), credential_digest: digest("public fixture") })).toThrow("gateway_reliable_billing_profile_unavailable");
    } finally { ledger.close(); two.close(); remove(path); }
  });
});

describe.runIf(process.platform === "win32" && process.arch === "x64")("conversation cache with actual Windows hosts and original OS identity", () => {
  let path: string, launcher: string;
  beforeAll(async () => { path = root(); launcher = await buildWindowsLauncher(path); }, 60000); afterAll(() => remove(path));
  const worker = fileURLToPath(new URL("gateway-host-worker.mjs", import.meta.url));
  it.each(["response_validated", "cache_response_inserted", "completion_committed"] as const)("recovers a real exit at %s without another HTTP call", async phase => {
    const file = join(path, phase + ".sqlite"), deps = await creditHostDependencies(launcher, { now: () => time }), init = new GatewayCreditLedger(file, policy, deps, cache); init.registerBudget("host", policy.maximum_micro_units); init.close();
    const f = await httpFixture({ reply: conversationReply }), request = conversationInput();
    try {
      await expect(execute(process.execPath, [worker, file, JSON.stringify(policy), JSON.stringify(cache), launcher, String(f.port), JSON.stringify(request), phase], { timeout: 15000, windowsHide: true })).rejects.toMatchObject({ code: 73 });
      const ledger = new GatewayCreditLedger(file, policy, deps, cache), host = new GatewayConversationHostRehearsal({ ledger, boundary: f.boundary });
      try {
        if (phase === "completion_committed") { expect((await host.execute(request, "host")).replay).toBe(true); expect(ledger.cacheSnapshot()).toMatchObject({ entries: 1, contract_entries: 1 }); }
        else {
          expect(ledger.snapshot()).toMatchObject({ dispatching: 1, completed: 0 }); let observed = await ledger.reconcileOwners(); const until = Date.now() + 10000;
          while (observed.unknown_owners && Date.now() < until) { await delay(100); observed = await ledger.reconcileOwners(); }
          expect(observed).toMatchObject({ verified_ended_owners: 1, reconciled_requests: 1, unknown_owners: 0 });
          await expect(host.execute(request, "host")).rejects.toThrow("credit_request_outcome_unproven"); expect(ledger.cacheSnapshot()).toMatchObject({ entries: 0, contract_entries: 1 });
        }
        expect(ledger.snapshot().held_micro_units).toBe(credit); expect(f.observations).toHaveLength(1); expect(f.counts()).toEqual({ dns: 0, dials: 0 });
      } finally { await host.close(); }
    } finally { await f.close(); }
  }, 20000);
  it("allows only one HTTP call when two independent hosts race for the last cache entry", async () => {
    const file = join(path, "race.sqlite"), limited = { conversation_cache: { maximum_bytes: GATEWAY_CONVERSATION_CACHE_SLOT_BYTES, maximum_entries: 1 } }, deps = await creditHostDependencies(launcher, { now: () => time });
    const init = new GatewayCreditLedger(file, policy, deps, limited); init.registerBudget("host", policy.maximum_micro_units); init.close(); const f = await httpFixture({ reply: conversationReply });
    try {
      const outcomes = await Promise.all([conversationInput(), conversationInput()].map(request => execute(process.execPath, [worker, file, JSON.stringify(policy), JSON.stringify(limited), launcher, String(f.port), JSON.stringify(request), "none"], { timeout: 15000, windowsHide: true })));
      expect(outcomes.map(output => (JSON.parse(output.stdout) as { state: string }).state).sort()).toEqual(["completed", "credit_response_cache_exhausted"]); expect(f.observations).toHaveLength(1);
      const ledger = new GatewayCreditLedger(file, policy, deps, limited); try { expect(ledger.snapshot()).toMatchObject({ completed: 1, held_micro_units: credit }); expect(ledger.cacheSnapshot()).toMatchObject({ entries: 1, contract_entries: 1 }); } finally { ledger.close(); }
    } finally { await f.close(); }
  }, 20000);
});
