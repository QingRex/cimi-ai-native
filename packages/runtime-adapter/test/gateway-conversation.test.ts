import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { GatewayHttpTransport, parseCachedGatewayHttpResponse } from "../src/gateway-http.js";
import { GatewayNetworkBoundary } from "../src/gateway-network.js";
import { GATEWAY_CONVERSATION_PROFILE, GATEWAY_TOOL_ARGUMENT_BYTES, GATEWAY_SSE_EVENTS, parseGatewayJson, prepareGatewayConversation, parseGatewayConversation } from "../src/gateway-conversation.js";
import { httpFixture, HTTP_FIXTURE_KEY } from "./gateway-http-fixture.js";
import { digest } from "../src/files.js";

const tool = () => ({ type: "function", function: { name: "read_fixture", description: "Read a public synthetic fixture", parameters: {
  type: "object", properties: { path: { type: "string", minLength: 1, maxLength: 128 }, count: { type: "integer", minimum: 1, maximum: 3 } }, required: ["path"], additionalProperties: false } } });
const call = (id = "call_1", args = '{"path":"public.txt"}') => ({ id, type: "function", function: { name: "read_fixture", arguments: args } });
const input = (mode: "json" | "sse" = "json") => ({ request_id: randomUUID(), messages: [{ role: "user", content: "Read the public fixture" }] as Record<string, unknown>[],
  tools: [tool()], response_mode: mode, input_tokens: 100, max_output_tokens: 32 });
const tokens = () => ({ prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 });
const completion = (id: string) => ({ id: "public_completion", model: "glm-5.3", request_id: id, object: "chat.completion", created: 1791158400,
  choices: [{ index: 0, message: { role: "assistant", content: null as string | null, tool_calls: [call()], reasoning_content: "public fixture reasoning" }, finish_reason: "tool_calls" }], usage: tokens() });
const chunk = (id: string, delta: Record<string, unknown> = {}, finish: string | null = null) => ({ id: "public_completion", model: "glm-5.3", request_id: id, object: "chat.completion.chunk", created: 1791158400,
  choices: [{ index: 0, delta, finish_reason: finish }], ...(finish ? { usage: tokens() } : {}) });
const encode = (events: unknown[], separator = "\n\n") => Buffer.from(events.map(event => "data: " + (typeof event === "string" ? event : JSON.stringify(event))).join(separator) + separator);
const toolEvents = (id: string) => [chunk(id, { role: "assistant", reasoning_content: "public fixture reasoning" }),
  chunk(id, { tool_calls: [{ index: 0, ...call("call_1", '{"path":') }, { index: 1, ...call("call_2", '{"path":') }] }),
  chunk(id, { tool_calls: [{ index: 1, function: { arguments: '"第二个.txt"}' } }, { index: 0, function: { arguments: '"第一个.txt"}' } }] }),
  chunk(id, {}, "tool_calls"), "[DONE]"];
const parse = (request: ReturnType<typeof input>, bytes: Buffer) => { const p = prepareGatewayConversation(request); return parseGatewayConversation(bytes, p.prepared, p.tools, p.prior_call_ids, HTTP_FIXTURE_KEY); };

describe("explicit function and tool-result conversation contract", () => {
  it("freezes exact wire tools/history and digests changes to tools, results or response mode", () => {
    const request = input(), p = prepareGatewayConversation(request), baseline = p.prepared.input_digest;
    request.tools[0]!.function.parameters.properties.path.maxLength = 1; request.messages[0]!.content = "mutated";
    expect(JSON.parse(p.body.toString())).toMatchObject({ model: "glm-5.3", tools: [{ type: "function", function: { parameters: { properties: { path: { maxLength: 128 } } } } }],
      tool_choice: "auto", tool_stream: false, stream: false, n: 1 });
    expect(Object.isFrozen(p.tools[0]!.function.parameters)).toBe(true); expect(digest(p.body).value).toBe(baseline);
    expect(prepareGatewayConversation({ ...input(), request_id: p.prepared.request_id, response_mode: "sse" }).prepared.input_digest).not.toBe(baseline);
  });
  it("accepts two parallel calls with results in either order and a following user turn", () => {
    const request = input(); request.messages.push({ role: "assistant", content: null, tool_calls: [call("call_1"), call("call_2")] },
      { role: "tool", tool_call_id: "call_2", content: "second result" }, { role: "tool", tool_call_id: "call_1", content: "first result" });
    const p = prepareGatewayConversation(request); expect(JSON.parse(p.body.toString()).messages).toHaveLength(4);
    const prior = p.prepared.input_digest; request.messages[2]!.content = "changed result";
    expect(prepareGatewayConversation(request).prepared.input_digest).not.toBe(prior);
    request.messages.push({ role: "user", content: "Continue" }); expect(() => prepareGatewayConversation(request)).not.toThrow();
  });
  it.each(["orphan", "unresolved", "duplicate_result", "duplicate_call", "reused_call", "interleaved_user", "wrong_role", "reasoning", "unknown_tool"])("rejects ambiguous history before DNS: %s", mode => {
    const request = input(), calls = [call()];
    if (mode === "unknown_tool") calls[0]!.function.name = "not_declared";
    request.messages.push({ role: mode === "wrong_role" ? "user" : "assistant", content: null, tool_calls: mode === "duplicate_call" ? [call(), call()] : calls },
      { role: "tool", tool_call_id: mode === "orphan" ? "orphan" : "call_1", content: "public result" });
    if (mode === "unresolved") request.messages.pop();
    if (mode === "duplicate_result") request.messages.push({ role: "tool", tool_call_id: "call_1", content: "duplicate" });
    if (mode === "interleaved_user") request.messages.splice(2, 0, { role: "user", content: "interrupt" });
    if (mode === "reused_call") request.messages.push({ role: "assistant", content: null, tool_calls: [call()] }, { role: "tool", tool_call_id: "call_1", content: "second" });
    if (mode === "reasoning") request.messages[0]!.reasoning_content = "not retained";
    expect(() => prepareGatewayConversation(request)).toThrow();
  });
  it.each(["endpoint", "headers", "proxy", "model", "thinking", "stream", "tool_choice", "approved"])("rejects caller override: %s", key => {
    expect(() => prepareGatewayConversation({ ...input(), [key]: true })).toThrow("invalid_gateway_conversation_request");
  });
  it("rejects hidden JS values without executing getters or toJSON", () => {
    expect(() => prepareGatewayConversation({ ...input(), extra: undefined })).toThrow("invalid_gateway_conversation_request");
    let touched = false; const request = input(); Object.defineProperty(request, "extra", { enumerable: true, get: () => { touched = true; return 1; } });
    expect(() => prepareGatewayConversation(request)).toThrow(); expect(touched).toBe(false);
    expect(() => prepareGatewayConversation({ ...input(), toJSON: () => { touched = true; return input(); } })).toThrow(); expect(touched).toBe(false);
    expect(() => prepareGatewayConversation({ ...input(), messages: new Array(1) })).toThrow();
  });
  it.each(["$ref", "pattern", "unknown", "wrong_type", "required_missing", "min_max", "depth", "duplicate", "builtin", "too_many"])("rejects unsupported or unbounded definitions: %s", mode => {
    const request = input(), parameters: Record<string, unknown> = request.tools[0]!.function.parameters;
    if (mode === "$ref" || mode === "pattern" || mode === "unknown") parameters[mode] = "untrusted";
    if (mode === "wrong_type") parameters.type = "array";
    if (mode === "required_missing") parameters.required = ["missing"];
    if (mode === "min_max") (parameters.properties as Record<string, unknown>).path = { type: "string", minLength: 5, maxLength: 1 };
    if (mode === "depth") { let nested: unknown = { type: "string" }; for (let n = 0; n < 10; n++) nested = { type: "array", items: nested }; (parameters.properties as Record<string, unknown>).path = nested; }
    if (mode === "duplicate") request.tools.push(tool());
    if (mode === "builtin") request.tools[0]!.type = "web_search";
    if (mode === "too_many") request.tools = Array.from({ length: 33 }, (_, index) => ({ ...tool(), function: { ...tool().function, name: "tool_" + index } }));
    expect(() => prepareGatewayConversation(request)).toThrow();
  });
  it("enforces nested schema types, anyOf, enum, const, additional properties and Unicode length", () => {
    const request = input(), schema = { type: "object", properties: { data: { type: "array", minItems: 1, maxItems: 2, items: { anyOf: [{ type: "null" }, { type: "string", enum: ["中", "𠮷"], minLength: 1, maxLength: 1 }] } }, fixed: { type: "boolean", const: true } }, required: ["data", "fixed"], additionalProperties: false };
    Object.assign(request.tools[0]!.function.parameters, schema);
    for (const args of ['{"data":["𠮷",null],"fixed":true}', '{"data":["中"],"fixed":true}']) {
      const value = completion(request.request_id); value.choices[0]!.message.tool_calls = [call("call_1", args)]; expect(parse(request, Buffer.from(JSON.stringify(value))).tool_calls).toHaveLength(1);
    }
    for (const args of ['{"data":[],"fixed":true}', '{"data":["bad"],"fixed":true}', '{"data":[null],"fixed":false}', '{"data":[null],"fixed":true,"extra":1}']) {
      const value = completion(request.request_id); value.choices[0]!.message.tool_calls = [call("call_1", args)]; expect(() => parse(request, Buffer.from(JSON.stringify(value)))).toThrow("gateway_tool_arguments_unproven");
    }
  });
  it.each(["undeclared", "bad_json", "duplicate_key", "escaped_duplicate", "prototype", "wrong_type", "missing", "extra", "too_long", "duplicate_id", "wrong_finish", "overflow"])("denies invalid completed tool proposals: %s", mode => {
    const request = input(), value = completion(request.request_id), proposal = value.choices[0]!.message.tool_calls[0]!;
    if (mode === "undeclared") proposal.function.name = "other";
    const args: Record<string, string> = { bad_json: "{", duplicate_key: '{"path":"a","path":"b"}', escaped_duplicate: '{"path":"a","pa\\u0074h":"b"}', prototype: '{"__proto__":{}}',
      wrong_type: '{"path":"a","count":1.5}', missing: "{}", extra: '{"path":"a","shell":true}', too_long: '{"path":"' + "x".repeat(GATEWAY_TOOL_ARGUMENT_BYTES) + '"}' };
    if (args[mode]) proposal.function.arguments = args[mode]!;
    if (mode === "duplicate_id") value.choices[0]!.message.tool_calls.push(call());
    if (mode === "wrong_finish") value.choices[0]!.finish_reason = "stop";
    if (mode === "overflow") { value.usage.completion_tokens = 33; value.usage.total_tokens = 37; }
    expect(() => parse(request, Buffer.from(JSON.stringify(value)))).toThrow();
  });
  it("keeps the old text cache and host entry contract closed to conversation envelopes", () => {
    const request = input(), response = parse(request, Buffer.from(JSON.stringify(completion(request.request_id))));
    expect(() => parseCachedGatewayHttpResponse(response)).toThrow("gateway_cached_response_invalid");
    expect(() => new GatewayHttpTransport(new GatewayNetworkBoundary()).prepare(request)).toThrow("invalid_gateway_http_request");
  });
  it.each(["json", "sse"] as const)("rejects a new proposal that reuses a completed historical call ID: %s", mode => {
    const request = input(mode); request.messages.push({ role: "assistant", content: null, tool_calls: [call()] }, { role: "tool", tool_call_id: "call_1", content: "public prior result" });
    const bytes = mode === "json" ? Buffer.from(JSON.stringify(completion(request.request_id))) : encode(toolEvents(request.request_id));
    expect(() => parse(request, bytes)).toThrow("gateway_tool_call_identity_reused");
  });
});

describe("bounded final-only SSE validation", () => {
  it("assembles interleaved parallel arguments and CRLF without retaining reasoning", () => {
    const request = input("sse"), response = parse(request, encode(toolEvents(request.request_id), "\r\n\r\n"));
    expect(response).toMatchObject({ profile: GATEWAY_CONVERSATION_PROFILE, finish_reason: "tool_calls", tool_execution_authorized: false, usage: { input_tokens: 4, output_tokens: 3 } });
    expect(response.tool_calls.map(call => JSON.parse(call.function.arguments).path)).toEqual(["第一个.txt", "第二个.txt"]);
    expect(Object.isFrozen(response.tool_calls[0]!.function)).toBe(true); expect(JSON.stringify(response)).not.toContain("public fixture reasoning");
  });
  it.each(["no_done", "no_final", "no_usage", "duplicate_done", "after_final", "changed_id", "changed_created", "changed_model", "choice_index", "role", "changed_call_id", "changed_name",
    "duplicate_index", "sparse_index", "unknown_delta", "partial_arguments", "wrong_finish", "early_usage", "extra_usage", "usage_sum", "overflow", "secret_content", "secret_reasoning", "secret_argument", "secret_escaped_argument"])("rejects incomplete or changed streams: %s", mode => {
    const request = input("sse"), events: any[] = toolEvents(request.request_id);
    if (mode === "no_done") events.pop();
    if (mode === "no_final") events.splice(3, 1);
    if (mode === "no_usage") delete events[3].usage;
    if (mode === "duplicate_done") events.push("[DONE]");
    if (mode === "after_final") events.splice(4, 0, chunk(request.request_id, { content: "late" }));
    if (mode === "changed_id") events[1].id = "other";
    if (mode === "changed_created") events[1].created++;
    if (mode === "changed_model") events[1].model = "other";
    if (mode === "choice_index") events[1].choices[0].index = 1;
    if (mode === "role") events[0].choices[0].delta.role = "system";
    if (mode === "changed_call_id") events[2].choices[0].delta.tool_calls[0].id = "other";
    if (mode === "changed_name") events[2].choices[0].delta.tool_calls[0].function.name = "other";
    if (mode === "duplicate_index") events[2].choices[0].delta.tool_calls[1].index = 1;
    if (mode === "sparse_index") events[1].choices[0].delta.tool_calls[0].index = 2;
    if (mode === "unknown_delta") events[1].choices[0].delta.url = "ignored?";
    if (mode === "partial_arguments") events[2].choices[0].delta.tool_calls[0].function.arguments = "";
    if (mode === "wrong_finish") events[3].choices[0].finish_reason = "length";
    if (mode === "early_usage") events[1].usage = tokens();
    if (mode === "extra_usage") events[3].usage.reasoning_tokens = 1;
    if (mode === "usage_sum") events[3].usage.total_tokens++;
    if (mode === "overflow") { events[3].usage.completion_tokens = 33; events[3].usage.total_tokens = 37; }
    if (mode === "secret_content" || mode === "secret_reasoning") {
      const key = mode === "secret_content" ? "content" : "reasoning_content";
      events.splice(1, 0, chunk(request.request_id, { [key]: HTTP_FIXTURE_KEY.slice(0, 12) }), chunk(request.request_id, { [key]: HTTP_FIXTURE_KEY.slice(12) }));
    }
    if (mode === "secret_argument" || mode === "secret_escaped_argument") {
      const key = mode === "secret_argument" ? HTTP_FIXTURE_KEY : [...HTTP_FIXTURE_KEY].map(char => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0")).join("");
      events[2].choices[0].delta.tool_calls[0].function.arguments = '"' + key + '"}';
    }
    expect(() => parse(request, encode(events))).toThrow(mode.startsWith("secret") ? "gateway_credential_disclosure_blocked" : undefined);
  });
  it.each(["invalid_utf8", "unfinished_event", "unknown_field", "comments", "too_many_events", "too_many_bytes", "duplicate_json"])("rejects invalid framing or limits: %s", mode => {
    const request = input("sse"); let bytes = encode([chunk(request.request_id, { content: "公开内容" }, "stop"), "[DONE]"]);
    if (mode === "invalid_utf8") bytes = Buffer.from([0xff]);
    if (mode === "unfinished_event") bytes = bytes.subarray(0, bytes.length - 1);
    if (mode === "unknown_field") bytes = Buffer.from("event: message\n" + bytes.toString());
    if (mode === "comments") bytes = Buffer.from(":keepalive\n\n" + bytes.toString());
    if (mode === "too_many_events") bytes = encode(Array.from({ length: GATEWAY_SSE_EVENTS + 1 }, () => "[DONE]"));
    if (mode === "too_many_bytes") bytes = Buffer.alloc(262145, 32);
    if (mode === "duplicate_json") bytes = Buffer.from(bytes.toString().replace('"index":0', '"index":0,"index":0'));
    expect(() => parse(request, bytes)).toThrow();
  });
  it("supports final text and length results with an empty tool registry", () => {
    for (const finish of ["stop", "length"]) {
      const request = { ...input("sse"), tools: [] }, response = parse(request, encode([chunk(request.request_id, { content: "中" }), chunk(request.request_id, { content: "文" }, finish), "[DONE]"]));
      expect(response).toMatchObject({ text: "中文", finish_reason: finish, tool_calls: [] });
    }
  });
  it("rejects excessive JSON nesting, unsafe numbers and decoded duplicate keys", () => {
    for (const source of ['{"a":1,"\\u0061":2}', '[1e999]', '"\\ud800"', '{"constructor":{}}', "[".repeat(18) + "0" + "]".repeat(18)]) expect(() => parseGatewayJson(source)).toThrow();
  });
});

describe("conversation HTTPS retains the verified socket and lifecycle boundaries", () => {
  it.each(["json", "sse"] as const)("receives a complete tool proposal through one real TLS/HTTP exchange: %s", async mode => {
    const request = input(mode), f = await httpFixture({ reply: body => {
      const id = (body as { request_id: string }).request_id, bytes = mode === "json" ? Buffer.from(JSON.stringify(completion(id))) : encode(toolEvents(id));
      return { content_type: mode === "json" ? "application/json" : "text/event-stream; charset=utf-8", chunks: [...bytes].map(byte => Buffer.from([byte])) };
    } });
    try {
      const transport = new GatewayHttpTransport(f.boundary), p = transport.prepareConversation(request); request.tools[0]!.function.name = "changed";
      const connection = await f.boundary.connect(await f.boundary.resolve()), response = await transport.sendConversation(p, connection, HTTP_FIXTURE_KEY);
      expect(response.tool_calls).toHaveLength(mode === "json" ? 1 : 2); expect(response.response_digest).toHaveLength(64);
      expect(f.observations).toHaveLength(1); expect(f.observations[0]).toMatchObject({ authenticated: true, input_digest: p.input_digest, body: { stream: mode === "sse", tool_stream: mode === "sse", tools: [{ function: { name: "read_fixture" } }] } });
      expect(f.counts()).toEqual({ dns: 1, dials: 1 }); expect(f.socket()!.destroyed).toBe(true);
      await expect(transport.sendConversation(p, connection, HTTP_FIXTURE_KEY)).rejects.toThrow("gateway_http_request_unowned");
    } finally { await f.close(); }
  });
  it("sends validated tool results in a second request with a new identity", async () => {
    let exchanges = 0;
    const f = await httpFixture({ reply: body => {
      const value = completion((body as { request_id: string }).request_id);
      if (++exchanges === 1) return { content_type: "application/json", chunks: [Buffer.from(JSON.stringify(value))] };
      value.choices[0]!.message.content = "public final reply"; value.choices[0]!.message.tool_calls = []; value.choices[0]!.finish_reason = "stop";
      delete (value.choices[0]!.message as Partial<typeof value.choices[0]["message"]>).tool_calls;
      return { content_type: "application/json", chunks: [Buffer.from(JSON.stringify(value))] };
    } });
    try {
      const request = input(), transport = new GatewayHttpTransport(f.boundary), first = transport.prepareConversation(request);
      const proposed = await transport.sendConversation(first, await f.boundary.connect(await f.boundary.resolve()), HTTP_FIXTURE_KEY);
      expect(proposed.tool_execution_authorized).toBe(false);
      request.request_id = randomUUID(); request.messages.push({ role: "assistant", content: proposed.text, tool_calls: proposed.tool_calls },
        { role: "tool", tool_call_id: proposed.tool_calls[0]!.id, content: "public fixture result" });
      const p = transport.prepareConversation(request), connection = await f.boundary.connect(await f.boundary.resolve());
      expect(await transport.sendConversation(p, connection, HTTP_FIXTURE_KEY)).toMatchObject({ text: "public final reply", finish_reason: "stop", tool_calls: [], tool_execution_authorized: false });
      expect(f.observations[1]).toMatchObject({ body: { messages: request.messages } });
      expect(f.observations).toHaveLength(2); expect(f.counts()).toEqual({ dns: 2, dials: 2 }); expect(p.request_id).not.toBe(first.request_id); expect(p.input_digest).not.toBe(first.input_digest);
    } finally { await f.close(); }
  });
  it.each(["partial", "hang", "cancel", "wrong_type", "secret"])("closes without publishing a partial reply or retrying: %s", async mode => {
    const control = new AbortController(), request = input("sse"), f = await httpFixture({ onRequest: () => { if (mode === "cancel") control.abort(); }, reply: () => ({
      content_type: mode === "wrong_type" ? "application/json" : "text/event-stream", chunks: [encode([chunk(request.request_id, { content: mode === "secret" ? HTTP_FIXTURE_KEY : "partial public text" })])],
      incomplete: mode === "partial", hang: mode === "hang" || mode === "cancel" }) });
    try {
      const transport = new GatewayHttpTransport(f.boundary), p = transport.prepareConversation(request), connection = await f.boundary.connect(await f.boundary.resolve());
      const error = await transport.sendConversation(p, connection, HTTP_FIXTURE_KEY, 100, control.signal).catch((error: Error) => error);
      expect(error).toBeInstanceOf(Error); expect((error as Error).message).not.toContain(HTTP_FIXTURE_KEY);
      expect(f.socket()!.destroyed).toBe(true); expect(f.observations).toHaveLength(1); expect(f.counts()).toEqual({ dns: 1, dials: 1 });
    } finally { await f.close(); }
  });
  it("denies copies, foreign instances and mixing old/new send methods before writing", async () => {
    const f = await httpFixture({ reply: body => ({ content_type: "application/json", chunks: [Buffer.from(JSON.stringify(completion((body as { request_id: string }).request_id)))] }) });
    try {
      const transport = new GatewayHttpTransport(f.boundary), p = transport.prepareConversation(input()), connection = await f.boundary.connect(await f.boundary.resolve());
      await expect(transport.sendConversation({ ...p }, connection, HTTP_FIXTURE_KEY)).rejects.toThrow("gateway_http_request_unowned");
      await expect(new GatewayHttpTransport(f.boundary).sendConversation(p, connection, HTTP_FIXTURE_KEY)).rejects.toThrow("gateway_http_request_unowned");
      await expect(transport.send(p, connection, HTTP_FIXTURE_KEY)).rejects.toThrow("gateway_http_request_unowned");
      const control = new AbortController(); control.abort(); await expect(transport.sendConversation(p, connection, HTTP_FIXTURE_KEY, 8000, control.signal)).rejects.toThrow("gateway_http_aborted");
      expect(f.observations).toHaveLength(0); await transport.sendConversation(p, connection, HTTP_FIXTURE_KEY); expect(f.observations).toHaveLength(1);
    } finally { await f.close(); }
  });
});
