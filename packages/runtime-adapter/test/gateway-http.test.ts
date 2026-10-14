import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { GatewayHttpTransport, GATEWAY_HTTP_REQUEST_BYTES } from "../src/gateway-http.js";
import { GatewayNetworkBoundary } from "../src/gateway-network.js";
import { GatewayCreditLedger } from "../src/gateway-credit.js";
import { requireDedicatedGatewayBilling } from "../src/model-gateway.js";
import { digest } from "../src/files.js";
import { HTTP_FIXTURE_KEY, httpFixture, type HttpFixtureMode } from "./gateway-http-fixture.js";

const input = () => ({ request_id: randomUUID(), messages: [{ role: "user", content: "public synthetic hello" }], input_tokens: 100, max_output_tokens: 32 });
describe("bounded HTTPS over the original verified TLS connection", () => {
  it.each(["before DNS", "after TLS", "at HTTP takeover"])("keeps the original endpoint after a runtime write attempt %s", async stage => {
    const f = await httpFixture();
    try {
      const transport = new GatewayHttpTransport(f.boundary), prepared = transport.prepare(input());
      let changed: boolean | undefined;
      const mutate = () => { changed = Reflect.set(f.boundary, "path", "/api/paas/v4/chat/completions"); };
      if (stage === "before DNS") mutate();
      const pin = await f.boundary.resolve(), connection = await f.boundary.connect(pin);
      if (stage === "after TLS") mutate();
      if (stage === "at HTTP takeover") {
        const consume = f.boundary.consumeHttpConnection.bind(f.boundary);
        f.boundary.consumeHttpConnection = current => { const socket = consume(current); mutate(); return socket; };
      }
      await transport.send(prepared, connection, HTTP_FIXTURE_KEY);
      expect(f.observations).toHaveLength(1);
      expect(f.observations[0]!.path).toBe("/api/coding/paas/v4/chat/completions");
      expect(pin.path).toBe("/api/coding/paas/v4/chat/completions");
      expect(changed).toBe(false);
      expect(f.counts()).toEqual({ dns: 1, dials: 1 });
      await expect(transport.send(prepared, connection, HTTP_FIXTURE_KEY)).rejects.toThrow("gateway_http_request_unowned");
    } finally { await f.close(); }
  });
  it.each(["/api/coding/paas/v4/chat/completions", "/api/paas/v4/chat/completions"] as const)("uses the explicitly constructed endpoint %s", async path => {
    const f = await httpFixture({ path });
    try {
      const transport = new GatewayHttpTransport(f.boundary), pin = await f.boundary.resolve();
      await transport.send(transport.prepare(input()), await f.boundary.connect(pin), HTTP_FIXTURE_KEY);
      expect(pin.path).toBe(path);
      expect(f.observations).toHaveLength(1);
      expect(f.observations[0]!.path).toBe(path);
      expect(f.counts()).toEqual({ dns: 1, dials: 1 });
    } finally { await f.close(); }
  });
  it.each(["valid", "length", "reasoning", "cache"] as const)("uses exactly one handshake and immutable fixed wire bytes: %s", async mode => {
    const f = await httpFixture({ mode });
    try {
      const request = input(), transport = new GatewayHttpTransport(f.boundary), prepared = transport.prepare(request);
      request.messages[0]!.content = "mutated after preparation"; request.max_output_tokens = 1000;
      const connection = await f.boundary.connect(await f.boundary.resolve());
      const result = await transport.send(prepared, connection, HTTP_FIXTURE_KEY);
      expect(result).toMatchObject({ request_id: request.request_id, input_digest: prepared.input_digest, text: "CIMILOOP_HTTP_OK", finish_reason: mode === "length" ? "length" : "stop",
        usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 }, thinking_usage_verified: false, actual_cost_known: false, billing_admission_ready: false });
      expect(result).not.toHaveProperty("reasoning_content"); expect(Object.isFrozen(result.usage)).toBe(true);
      expect(f.counts()).toEqual({ dns: 1, dials: 1 }); expect(f.observations).toHaveLength(1);
      expect(f.observations[0]).toMatchObject({ path: "/api/coding/paas/v4/chat/completions", method: "POST", host: "open.bigmodel.cn", authenticated: true, input_digest: prepared.input_digest,
        body: { model: "glm-5.3", request_id: request.request_id, messages: [{ role: "user", content: "public synthetic hello" }], max_tokens: 32, n: 1, stream: false } });
      expect(f.socket()!.destroyed).toBe(true);
      await expect(transport.send(prepared, connection, HTTP_FIXTURE_KEY)).rejects.toThrow("gateway_http_request_unowned");
      const another = transport.prepare(input()); await expect(transport.send(another, connection, HTTP_FIXTURE_KEY)).rejects.toThrow("gateway_tls_connection_unowned");
      expect(f.observations).toHaveLength(1);
    } finally { await f.close(); }
  });
  it.each([
    ["redirect", "gateway_http_response_denied"], ["status", "gateway_http_response_denied"], ["secret_error", "gateway_http_response_denied"],
    ["encoded", "gateway_http_response_denied"], ["wrong_type", "gateway_http_response_denied"], ["duplicate_type", "gateway_http_response_denied"],
    ["partial", "gateway_http_response_incomplete"], ["disconnect", "gateway_http_upstream_unproven"], ["trailer", "gateway_http_response_incomplete"],
    ["oversize", "gateway_response_limit"], ["chunked_oversize", "gateway_response_limit"], ["header_oversize", "gateway_http_upstream_unproven"],
    ["invalid_utf8", "gateway_response_contract_unproven"], ["malformed", "gateway_response_contract_unproven"], ["wrong_model", "gateway_response_contract_unproven"],
    ["wrong_id", "gateway_response_contract_unproven"], ["bad_finish", "gateway_response_contract_unproven"], ["tools", "gateway_response_contract_unproven"],
    ["usage_inconsistent", "gateway_response_usage_unproven"], ["extra_usage", "gateway_response_usage_unproven"],
    ["input_overflow", "gateway_usage_bound_exceeded"], ["output_overflow", "gateway_usage_bound_exceeded"],
    ["reasoning_secret", "gateway_credential_disclosure_blocked"], ["escaped_secret", "gateway_credential_disclosure_blocked"],
    ["upgrade", "gateway_http_response_denied"], ["information", "gateway_http_response_denied"]
  ] as [HttpFixtureMode, string][])("closes without reconnecting or returning upstream bytes: %s", async (mode, reason) => {
    const f = await httpFixture({ mode });
    try {
      const transport = new GatewayHttpTransport(f.boundary), prepared = transport.prepare(input()), connection = await f.boundary.connect(await f.boundary.resolve());
      const error = await transport.send(prepared, connection, HTTP_FIXTURE_KEY).catch((error: Error) => error);
      expect(error).toBeInstanceOf(Error); expect((error as Error).message).toBe(reason); expect((error as Error).message).not.toContain(HTTP_FIXTURE_KEY);
      expect(f.counts()).toEqual({ dns: 1, dials: 1 }); expect(f.observations).toHaveLength(1); expect(f.socket()!.destroyed).toBe(true);
      await expect(transport.send(transport.prepare(input()), connection, HTTP_FIXTURE_KEY)).rejects.toThrow("gateway_tls_connection_unowned");
    } finally { await f.close(); }
  });
  it("uses one absolute deadline and tears down an unanswered request", async () => {
    const f = await httpFixture({ mode: "timeout" });
    try {
      const transport = new GatewayHttpTransport(f.boundary), prepared = transport.prepare(input()), connection = await f.boundary.connect(await f.boundary.resolve());
      await expect(transport.send(prepared, connection, HTTP_FIXTURE_KEY, 100)).rejects.toThrow("gateway_http_deadline_exhausted");
      expect(f.socket()!.destroyed).toBe(true); expect(f.counts()).toEqual({ dns: 1, dials: 1 }); expect(f.observations).toHaveLength(1);
    } finally { await f.close(); }
  });
  it("cancels an in-flight HTTP request and keeps the connection unusable", async () => {
    const control = new AbortController(), f = await httpFixture({ mode: "timeout", onRequest: () => control.abort() });
    try {
      const transport = new GatewayHttpTransport(f.boundary), prepared = transport.prepare(input()), connection = await f.boundary.connect(await f.boundary.resolve());
      await expect(transport.send(prepared, connection, HTTP_FIXTURE_KEY, 8000, control.signal)).rejects.toThrow("gateway_http_aborted");
      expect(f.observations).toHaveLength(1); expect(f.socket()!.destroyed).toBe(true);
    } finally { await f.close(); }
  });
  it("rejects copies, foreign request instances, invalid headers and a pre-cancelled request before writing", async () => {
    const f = await httpFixture();
    try {
      const transport = new GatewayHttpTransport(f.boundary), prepared = transport.prepare(input()), connection = await f.boundary.connect(await f.boundary.resolve());
      await expect(transport.send({ ...prepared }, connection, HTTP_FIXTURE_KEY)).rejects.toThrow("gateway_http_request_unowned");
      await expect(new GatewayHttpTransport(f.boundary).send(prepared, connection, HTTP_FIXTURE_KEY)).rejects.toThrow("gateway_http_request_unowned");
      await expect(transport.send(prepared, connection, "invalid\r\nheader")).rejects.toThrow("invalid_gateway_http_credential");
      await expect(transport.send(prepared, connection, HTTP_FIXTURE_KEY, 0)).rejects.toThrow("invalid_gateway_http_deadline");
      const control = new AbortController(); control.abort();
      await expect(transport.send(prepared, connection, HTTP_FIXTURE_KEY, 8000, control.signal)).rejects.toThrow("gateway_http_aborted");
      await expect(transport.send(prepared, { ...connection }, HTTP_FIXTURE_KEY)).rejects.toThrow("gateway_tls_connection_unowned");
      expect(f.observations).toHaveLength(0);
      await transport.send(prepared, connection, HTTP_FIXTURE_KEY); expect(f.observations).toHaveLength(1);
    } finally { await f.close(); }
  });
  it("never sends the key in messages and never writes HTTP before certificate verification", async () => {
    const f = await httpFixture();
    try {
      const transport = new GatewayHttpTransport(f.boundary), request = input(); request.messages[0]!.content = HTTP_FIXTURE_KEY;
      const connection = await f.boundary.connect(await f.boundary.resolve());
      await expect(transport.send(transport.prepare(request), connection, HTTP_FIXTURE_KEY)).rejects.toThrow("gateway_credential_in_request");
      expect(f.observations).toHaveLength(0);
    } finally { await f.close(); }
    const untrusted = await httpFixture({ untrusted: true });
    try { await expect(untrusted.boundary.connect(await untrusted.boundary.resolve())).rejects.toThrow("gateway_tls_unproven"); expect(untrusted.observations).toHaveLength(0); }
    finally { await untrusted.close(); }
  });
  it("rejects route, streaming, tool, multimodal, malformed Unicode and token-limit overrides before DNS", () => {
    const transport = new GatewayHttpTransport(new GatewayNetworkBoundary());
    for (const extra of ["url", "headers", "proxy", "model", "stream", "tools", "thinking", "approved"]) expect(() => transport.prepare({ ...input(), [extra]: true })).toThrow("invalid_gateway_http_request");
    for (const messages of [[], [{ role: ["user"], content: "bad role" }], [{ role: "user", content: [{ type: "text", text: "multimodal" }] }],
      [{ role: "user", content: "\ud800" }], [{ role: "tool", content: "tool result" }], [{ role: "user", content: "ok", extra: 1 }]]) expect(() => transport.prepare({ ...input(), messages })).toThrow("invalid_gateway_http_request");
    expect(() => transport.prepare({ ...input(), input_tokens: 0 })).toThrow("invalid_gateway_http_request");
    expect(() => transport.prepare({ ...input(), max_output_tokens: 131073 })).toThrow("invalid_gateway_http_request");
    expect(() => transport.prepare({ ...input(), messages: [{ role: "user", content: "x".repeat(GATEWAY_HTTP_REQUEST_BYTES) }] })).toThrow("gateway_request_limit");
  });
  it.each(["valid", "partial", "timeout"] as const)("persists dispatch before local HTTP and preserves holds on completion or ambiguity: %s", async mode => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-http-credit-test-"));
    // Identity and historical time are explicit test seams; no real account or
    // billing coordinator is authorized by this rehearsal helper.
    const ledger = new GatewayCreditLedger(join(root, "credit.sqlite"), { format: "cimiloop/gateway-credit-rehearsal/1.0.0", scope: "credit_budget_rehearsal",
      account_scope_digest: digest("http transport public rehearsal account").value, unit: "ZHIPU_CODING_PLAN_CREDIT", model: "glm-5.3", maximum_micro_units: 1000000 },
      { identity: { pid: process.pid, creation_ticks: "1", image: process.execPath }, now: () => Date.parse("2026-10-05T00:00:00.000Z") });
    const f = await httpFixture({ mode, onRequest: () => expect(ledger.snapshot().dispatching).toBe(1) });
    try {
      ledger.registerBudget("transport", 1000000);
      const transport = new GatewayHttpTransport(f.boundary), prepared = transport.prepare(input());
      const creditRequest = { request_id: prepared.request_id, budget_key: "transport", input_digest: prepared.input_digest, input_tokens: prepared.input_tokens, output_tokens: prepared.output_tokens };
      const claim = ledger.reserve(creditRequest); if (!claim.permit) throw Error("unexpected replay");
      ledger.dispatch(claim.permit);
      const connection = await f.boundary.connect(await f.boundary.resolve());
      try {
        const result = await transport.send(prepared, connection, HTTP_FIXTURE_KEY, mode === "timeout" ? 100 : 8000);
        ledger.complete(claim.permit, { response_digest: result.response_digest, input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens });
      } catch { ledger.unknown(claim.permit, "credit_transport_unproven"); }
      expect(ledger.snapshot()).toMatchObject({ completed: mode === "valid" ? 1 : 0, unknown: mode === "valid" ? 0 : 1, held_micro_units: 1000000, remaining_micro_units: 0, admission_ready: false });
      expect(f.observations).toHaveLength(1); expect(f.observations[0]!.input_digest).toBe(prepared.input_digest);
      if (mode === "valid") expect(ledger.reserve(creditRequest).replay?.admission_ready).toBe(false);
      else expect(() => ledger.reserve(creditRequest)).toThrow("credit_request_outcome_unproven");
      expect(f.counts()).toEqual({ dns: 1, dials: 1 });
    } finally {
      await f.close(); ledger.close();
      if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "cimiloop-http-credit-test-")) throw Error("bad fixture cleanup path");
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("keeps real credential and billing admission closed after adding the transport", () => {
    expect(() => requireDedicatedGatewayBilling({ format: "cimiloop/dedicated-model/1.0.0", provider: "zhipuai-coding-plan", model: "zhipuai-coding-plan/glm-5.3",
      credential_file: join(tmpdir(), "never-open-real.dpapi.json"), credential_digest: digest("not a real credential") })).toThrow("gateway_reliable_billing_profile_unavailable");
  });
});
