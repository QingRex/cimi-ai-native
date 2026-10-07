import { describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest } from "../src/files.js";
import { prepareGatewayConversation, parseGatewayConversation } from "../src/gateway-conversation.js";
const client = await import(new URL("../transport/opencode-conversation-probe.mjs", import.meta.url).href) as {
  conversationJson: (value: string) => unknown; conversationMessages: (value: unknown) => Record<string, unknown>[]; conversationTools: (value: unknown) => Record<string, unknown>[];
  exchangeConversationFrame: (pipe: string, request: Record<string, unknown>, signal?: AbortSignal) => Promise<Record<string, unknown>>;
  validateConversationReply: (reply: unknown, request: unknown, requestDigest: string, fixedMethod?: unknown) => unknown;
  createCimiConversationProbe: (options: Record<string, unknown>) => { languageModel: (name: string) => { doGenerate: (input: Record<string, unknown>) => Promise<Record<string, unknown>>; doStream: (input: Record<string, unknown>) => Promise<{ stream: ReadableStream<Record<string, unknown>> }> } };
};
const sdkTool = () => ({ type: "function", name: "read", description: "Public read fixture", inputSchema: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"], additionalProperties: false } });
const request = () => ({ format: "cimiloop/model-conversation-request/1.0.0", request_id: randomUUID(), operation_key: "fixture", model_id: "cimiloop-public-tools", policy_digest: "a".repeat(64),
  messages: [{ role: "user", content: "Public" }], tools: client.conversationTools([sdkTool()]), response_mode: "json", input_tokens: 65536, max_output_tokens: 128 });
const reply = (request: Record<string, unknown>, frame: Buffer, text = false) => {
  const input = { request_id: request.request_id, messages: request.messages, tools: request.tools, response_mode: request.response_mode, input_tokens: request.input_tokens, max_output_tokens: request.max_output_tokens };
  const prepared = prepareGatewayConversation(input), raw = Buffer.from(JSON.stringify({ id: "public", model: "glm-5.3", request_id: request.request_id, choices: [{ index: 0,
    message: text ? { role: "assistant", content: "Public final" } : { role: "assistant", content: null, tool_calls: [{ id: "read_1", type: "function", function: { name: "read", arguments: '{"filePath":"public.txt"}' } }] }, finish_reason: text ? "stop" : "tool_calls" }],
    usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } }));
  const response = parseGatewayConversation(raw, { ...prepared.prepared, response_mode: "json" }, prepared.tools, prepared.prior_call_ids, "PUBLIC_FIXTURE_KEY");
  const receipt = { format: "cimiloop/gateway-credit-receipt/1.0.0", scope: "credit_budget_rehearsal", unit: "ZHIPU_CODING_PLAN_CREDIT", request_id: request.request_id,
    request_digest: digest(JSON.stringify({ request_id: request.request_id, budget_key: "public_probe", input_digest: response.input_digest, input_tokens: request.input_tokens, output_tokens: request.max_output_tokens })).value,
    held_micro_units: 46000000, rate_digest: "b".repeat(64), response_digest: response.response_digest, input_tokens: 4, output_tokens: 3, actual_cost_known: false, admission_ready: false };
  return { format: "cimiloop/model-conversation-reply/1.0.0", scope: "isolated_conversation_rehearsal", operation_key: request.operation_key, request_id: request.request_id, request_digest: digest(frame).value,
    policy_digest: request.policy_digest, outcome: "completed", response: { ...response }, receipt, reason: null as string | null, replay: false, formal_execution_enabled: false };
};
const fixture = async (mode = "valid") => {
  const pipe = process.platform === "win32" ? `\\\\.\\pipe\\CimiLoop.ConversationClient.${randomUUID()}` : join(tmpdir(), `cimi-convo-${randomUUID()}.sock`), requests: Record<string, unknown>[] = [];
  let connections = 0;
  const server = createServer(socket => {
    connections++; socket.on("error", () => socket.destroy()); let input = Buffer.alloc(0), handled = false;
    socket.on("data", bytes => {
      input = Buffer.concat([input, bytes]); if (handled || input.length < 4 || input.length < input.readUInt32LE() + 4) return; handled = true;
      const frame = input.subarray(4), req = JSON.parse(frame.toString()) as Record<string, unknown>; requests.push(req);
      if (mode === "hang") return;
      if (mode === "disconnect") { socket.destroy(); return; }
      if (mode === "oversize") { const header = Buffer.alloc(4); header.writeUInt32LE(294913); socket.end(header); return; }
      if (mode === "incomplete") { socket.end(Buffer.from([20, 0, 0, 0, 123])); return; }
      const r = reply(req, frame, mode === "text" || mode === "large" || requests.length === 2);
      if (mode === "large") r.response.text = "L".repeat(65536);
      if (mode === "digest") r.request_digest = "c".repeat(64);
      if (mode === "policy") r.policy_digest = "c".repeat(64);
      if (mode === "input") r.response.input_digest = "c".repeat(64);
      if (mode === "receipt") r.receipt.request_digest = "c".repeat(64);
      if (mode === "held") r.receipt.held_micro_units = 1000000;
      if (mode === "usage") r.receipt.output_tokens = 4;
      if (mode === "authority") r.formal_execution_enabled = true;
      if (mode === "tool") r.response.tool_calls = [{ id: "bad", type: "function", function: { name: "write", arguments: "{}" } }];
      if (mode === "args") r.response.tool_calls = [{ id: "bad", type: "function", function: { name: "read", arguments: '{"filePath":"a","filePath":"b"}' } }];
      if (mode === "denied") { r.outcome = "denied"; (r as Record<string, unknown>).response = null; (r as Record<string, unknown>).receipt = null; r.reason = "conversation_fixture_path_denied"; }
      let source = JSON.stringify(r); if (mode === "duplicate_key") source = source.replace('"replay":false', '"replay":false,"replay":false');
      const response = mode === "utf8" ? Buffer.from([255]) : Buffer.from(source), header = Buffer.alloc(4); header.writeUInt32LE(response.length); const bytesOut = Buffer.concat([header, response]);
      socket.write(bytesOut.subarray(0, 2)); setTimeout(() => { socket.write(bytesOut.subarray(2)); if (mode === "trailing") setTimeout(() => socket.end("x"), 10); else socket.end(); }, 5);
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(pipe, resolve); });
  return { pipe, requests, connections: () => connections, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
};
describe("independent tool IPC consumer", () => {
  it("retains the upstream receipt and checks the explicit method projection against the pinned binding and SDK reply", () => {
    const r = request(), bytes = Buffer.from(JSON.stringify(r)), value = reply(r, bytes, true), fixedMethod = { format: "cimiloop/fixed-method-transport/1.0.0", invocation_key: "fixture", source_digest: "a".repeat(64), request_digest: "b".repeat(64), profile_digest: "c".repeat(64) };
    const upstreamDigest = "d".repeat(64), projection = { format: "cimiloop/fixed-method-projection/1.0.0", invocation_key: "fixture",
      source_digest: { algorithm: "sha256", value: fixedMethod.source_digest }, request_digest: { algorithm: "sha256", value: fixedMethod.request_digest }, profile_digest: { algorithm: "sha256", value: fixedMethod.profile_digest },
      sdk_input_digest: { algorithm: "sha256", value: value.response.input_digest }, upstream_input_digest: { algorithm: "sha256", value: upstreamDigest },
      upstream_response_digest: { algorithm: "sha256", value: value.response.response_digest }, mapped_response_digest: digest(JSON.stringify(value.response)) };
    const named = { ...value, method_projection: projection, receipt: { ...value.receipt, request_digest: digest(JSON.stringify({ request_id: r.request_id, budget_key: "public_probe", input_digest: upstreamDigest, input_tokens: r.input_tokens, output_tokens: r.max_output_tokens })).value } };
    expect(client.validateConversationReply(named, r, digest(bytes).value, fixedMethod)).toEqual(named);
    expect(() => client.validateConversationReply(named, r, digest(bytes).value)).toThrow("conversation_response_mismatch");
    expect(() => client.validateConversationReply(value, r, digest(bytes).value, fixedMethod)).toThrow("conversation_method_projection_mismatch");
    expect(() => client.validateConversationReply({ ...named, receipt: value.receipt }, r, digest(bytes).value, fixedMethod)).toThrow("conversation_response_mismatch");
    for (const field of ["source_digest", "request_digest", "profile_digest", "sdk_input_digest", "upstream_response_digest", "mapped_response_digest"] as const) {
      expect(() => client.validateConversationReply({ ...named, method_projection: { ...projection, [field]: { algorithm: "sha256", value: "e".repeat(64) } } }, r, digest(bytes).value, fixedMethod)).toThrow("conversation_method_projection_mismatch");
    }
    expect(() => client.validateConversationReply({ ...named, method_projection: { ...projection, formal_execution_enabled: true } }, r, digest(bytes).value, fixedMethod)).toThrow();
  });
  it("accepts fragmented replies only after terminal EOF and binds the actual wire digest and receipt", async () => {
    const f = await fixture(); try { expect(await client.exchangeConversationFrame(f.pipe, request())).toMatchObject({ outcome: "completed", response: { finish_reason: "tool_calls", tool_execution_authorized: false }, receipt: { held_micro_units: 46000000 } }); } finally { await f.close(); }
  });
  it("accepts a bounded 64 KiB text reply exceeding the old 32 KiB text profile", async () => {
    const f = await fixture("large"); try { expect(await client.exchangeConversationFrame(f.pipe, request())).toMatchObject({ response: { text: "L".repeat(65536) } }); } finally { await f.close(); }
  });
  it.each(["digest", "policy", "input", "receipt", "held", "usage", "authority", "tool", "args", "duplicate_key", "utf8", "oversize", "incomplete", "trailing", "denied", "disconnect"])("rejects %s without retry after dispatch", async mode => {
    const f = await fixture(mode); try { await expect(client.exchangeConversationFrame(f.pipe, request())).rejects.toThrow(); expect(f.connections()).toBe(1); expect(f.requests).toHaveLength(1); } finally { await f.close(); }
  });
  it("denies pre-aborted, oversized and accessor-bearing frames before connecting", async () => {
    const f = await fixture(); let accessed = false;
    try {
      await expect(client.exchangeConversationFrame(f.pipe, request(), AbortSignal.abort())).rejects.toThrow("conversation_request_denied");
      await expect(client.exchangeConversationFrame(f.pipe, { ...request(), messages: ["x".repeat(65536)] })).rejects.toThrow("conversation_request_denied");
      await expect(client.exchangeConversationFrame(f.pipe, { get secret() { accessed = true; return "unexpected"; } })).rejects.toThrow("conversation_request_denied"); expect(accessed).toBe(false); expect(f.connections()).toBe(0);
    } finally { await f.close(); }
  });
  it("aborts an in-flight pipe and never resends it", async () => {
    const f = await fixture("hang"), control = new AbortController();
    try { const pending = client.exchangeConversationFrame(f.pipe, request(), control.signal); const rejection = expect(pending).rejects.toThrow("conversation_aborted"); await new Promise(resolve => setTimeout(resolve, 50)); control.abort(); await rejection; expect(f.connections()).toBe(1); } finally { await f.close(); }
  });
  it("validates against the original detached frame when the caller mutates its request during delivery", async () => {
    const f = await fixture(), r = request();
    try {
      const pending = client.exchangeConversationFrame(f.pipe, r); r.operation_key = "mutated"; r.policy_digest = "d".repeat(64); r.messages[0]!.content = "mutated";
      expect(await pending).toMatchObject({ operation_key: "fixture", policy_digest: "a".repeat(64) }); expect(f.requests[0]).toMatchObject({ operation_key: "fixture", messages: [{ content: "Public" }] });
    } finally { await f.close(); }
  });
  it.each(["sparse", "sparse_with_property", "array_prototype_object"])("rejects non-JSON business values without silently normalizing them: %s", mode => {
    let value: unknown = new Array(1);
    if (mode === "sparse_with_property") { const sparse = new Array(1) as unknown[] & { extra?: string }; sparse.extra = "public"; value = sparse; }
    if (mode === "array_prototype_object") value = Object.create(Array.prototype);
    const prompt = [{ role: "assistant", content: [{ type: "tool-call", toolCallId: "read_1", toolName: "read", input: { filePath: "public.txt", data: value } }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "read_1", toolName: "read", output: { type: "text", value: "public" } }] }];
    expect(() => client.conversationMessages(prompt)).toThrow();
  });
  it("translates SDK tool-call objects and text/JSON results with exact ID and name association", () => {
    const prompt = [{ role: "user", content: [{ type: "text", text: "a", providerOptions: undefined }] }, { role: "assistant", content: [{ type: "tool-call", toolCallId: "read_1", toolName: "read", input: { filePath: "public.txt" }, providerExecuted: undefined }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "read_1", toolName: "read", output: { type: "json", value: { result: "public" }, providerOptions: undefined } }] }];
    expect(client.conversationMessages(prompt)).toEqual([{ role: "user", content: "a" }, { role: "assistant", content: null, tool_calls: [{ id: "read_1", type: "function", function: { name: "read", arguments: '{"filePath":"public.txt"}' } }] }, { role: "tool", tool_call_id: "read_1", content: '{"result":"public"}' }]);
    const messages = client.conversationMessages(prompt); expect(() => prepareGatewayConversation({ ...request(), request_id: randomUUID(), messages })).toThrow(); // IPC envelope never masquerades as the HTTP input.
    const r = request(); expect(prepareGatewayConversation({ request_id: r.request_id, messages, tools: r.tools, response_mode: "json", input_tokens: r.input_tokens, max_output_tokens: r.max_output_tokens }).prior_call_ids).toEqual(["read_1"]);
  });
  it.each(["missing", "mismatch", "duplicate", "provider", "multimodal", "approval", "reasoning", "undefined_business"])("rejects unsupported or conflicting SDK history: %s", mode => {
    const call = { type: "tool-call", toolCallId: "read_1", toolName: "read", input: { filePath: "public.txt" } };
    const result = { type: "tool-result", toolCallId: mode === "mismatch" ? "other" : "read_1", toolName: "read", output: { type: "text", value: "public" } };
    let prompt: unknown = [{ role: "assistant", content: [call] }, { role: "tool", content: [result] }];
    if (mode === "missing") prompt = [{ role: "assistant", content: [call] }];
    if (mode === "duplicate") prompt = [{ role: "assistant", content: [call, call] }, { role: "tool", content: [result] }];
    if (mode === "provider") prompt = [{ role: "assistant", content: [{ ...call, providerExecuted: true }] }, { role: "tool", content: [result] }];
    if (mode === "multimodal" || mode === "reasoning") prompt = [{ role: "user", content: [{ type: mode === "multimodal" ? "file" : "reasoning", text: "public" }] }];
    if (mode === "approval") prompt = [{ role: "tool", content: [{ type: "tool-approval-response", approved: true }] }];
    if (mode === "undefined_business") prompt = [{ role: "assistant", content: [{ ...call, input: { filePath: "public.txt", description: undefined } }] }, { role: "tool", content: [result] }];
    expect(() => client.conversationMessages(prompt)).toThrow();
  });
  it("removes only recognized dialect annotations and never mutates caller tool schemas", () => {
    const t = sdkTool(), annotated = { ...t, inputSchema: { ...t.inputSchema, $schema: "http://json-schema.org/draft-07/schema#" }, description: undefined, strict: undefined };
    expect(client.conversationTools([annotated])).toEqual([{ type: "function", function: { name: "read", description: "", parameters: t.inputSchema } }]); expect(annotated.inputSchema.$schema).toBeTruthy();
    expect(() => client.conversationTools([{ ...t, inputSchema: { ...t.inputSchema, $schema: "unknown" } }])).toThrow(); expect(() => client.conversationTools([{ ...t, strict: true }])).toThrow();
  });
  it.each(["generate", "stream"])("publishes SDK %s tool calls only after full validation and supports the associated result turn", async mode => {
    const f = await fixture(), previous = process.env.CIMILOOP_IPC_PIPE; process.env.CIMILOOP_IPC_PIPE = f.pipe;
    try {
      const model = client.createCimiConversationProbe({ operationKey: "fixture", policyDigest: "a".repeat(64), name: "provider", fetch: () => { throw Error("No HTTP in consumer"); } }).languageModel("cimiloop-public-tools");
      const input = { prompt: [{ role: "user", content: [{ type: "text", text: "public" }] }], tools: [sdkTool()], toolChoice: { type: "auto" } };
      if (mode === "generate") expect(await model.doGenerate(input)).toMatchObject({ content: [{ type: "tool-call", toolCallId: "read_1", toolName: "read" }], finishReason: { unified: "tool-calls" } });
      else {
        const { stream } = await model.doStream(input), parts = []; for await (const part of stream) parts.push(part);
        expect(parts.map(p => p.type)).toEqual(["stream-start", "tool-input-start", "tool-input-delta", "tool-input-end", "tool-call", "finish"]);
        expect(parts.at(-1)).toMatchObject({ usage: { outputTokens: { total: 3, text: undefined, reasoning: undefined } } });
      }
      const final = await model.doGenerate({ ...input, prompt: [...input.prompt, { role: "assistant", content: [{ type: "tool-call", toolCallId: "read_1", toolName: "read", input: { filePath: "public.txt" } }] }, { role: "tool", content: [{ type: "tool-result", toolCallId: "read_1", toolName: "read", output: { type: "text", value: "public result" } }] }] });
      expect(final).toMatchObject({ content: [{ type: "text", text: "Public final" }], finishReason: { unified: "stop" } }); expect(f.requests).toHaveLength(2); expect(f.requests[1]!.request_id).not.toBe(f.requests[0]!.request_id);
    } finally { if (previous === undefined) delete process.env.CIMILOOP_IPC_PIPE; else process.env.CIMILOOP_IPC_PIPE = previous; await f.close(); }
  });
  it("rejects required/specific choices and raw or structured output before dispatch", async () => {
    const f = await fixture(), previous = process.env.CIMILOOP_IPC_PIPE; process.env.CIMILOOP_IPC_PIPE = f.pipe;
    try {
      const model = client.createCimiConversationProbe({ operationKey: "fixture", policyDigest: "a".repeat(64) }).languageModel("cimiloop-public-tools");
      for (const extra of [{ toolChoice: { type: "required" } }, { toolChoice: { type: "tool", toolName: "read" } }, { responseFormat: { type: "json" } }, { includeRawChunks: true }]) await expect(model.doGenerate({ prompt: [{ role: "user", content: "public" }], ...extra })).rejects.toThrow("conversation_options_denied");
      expect(f.connections()).toBe(0);
    } finally { if (previous === undefined) delete process.env.CIMILOOP_IPC_PIPE; else process.env.CIMILOOP_IPC_PIPE = previous; await f.close(); }
  });
});
