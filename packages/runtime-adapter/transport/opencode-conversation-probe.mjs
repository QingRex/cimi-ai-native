// Fixed LanguageModel v3 consumer for PUBLIC read-tool rehearsals only. No
// credential, URL, host path or production execution approval enters this module.
import { createConnection } from "node:net";
import { randomUUID, createHash } from "node:crypto";
import { TextDecoder } from "node:util";
export const conversationRequestBytes = 65536, conversationReplyBytes = 294912;
const sha = value => createHash("sha256").update(value).digest("hex");
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const fields = (value, required, optional = []) => value && typeof value === "object" && !Array.isArray(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const deny = (reason = "conversation_contract_denied") => { throw new Error(reason); };
// Duplicate decoded keys must be rejected before JSON.parse can discard them.
export function conversationJson(source, maximum = conversationReplyBytes) {
  if (typeof source !== "string" || !source.isWellFormed() || Buffer.byteLength(source) > maximum) deny();
  let at = 0, nodes = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(source[at] ?? "!")) at++; };
  const string = () => {
    const start = at++;
    while (at < source.length) {
      const c = source[at++]; if (c === "\\") at++;
      else if (c === '"') { const value = JSON.parse(source.slice(start, at)); if (!value.isWellFormed()) deny(); return value; }
    }
    deny();
  };
  const visit = depth => {
    if (depth > 16 || ++nodes > 16384) deny(); ws(); const c = source[at];
    if (c === '"') return string();
    if (c === "{" || c === "[") {
      at++; ws(); const end = c === "{" ? "}" : "]", seen = new Set();
      if (source[at] === end) { at++; return; }
      while (at < source.length) {
        ws();
        if (c === "{") {
          if (source[at] !== '"') deny(); const key = string();
          if (seen.has(key) || ["__proto__", "prototype", "constructor"].includes(key)) deny(); seen.add(key);
          ws(); if (source[at++] !== ":") deny();
        }
        visit(depth + 1); ws(); const separator = source[at++]; if (separator === end) return; if (separator !== ",") deny();
      }
      deny();
    }
    for (const literal of ["true", "false", "null"]) if (source.startsWith(literal, at)) { at += literal.length; return; }
    const numeric = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(at));
    if (!numeric || !Number.isFinite(Number(numeric[0]))) deny(); at += numeric[0].length;
  };
  visit(0); ws(); if (at !== source.length) deny(); return JSON.parse(source);
}
const jsonData = (value, depth = 0, budget = { nodes: 0 }) => {
  if (depth > 16 || ++budget.nodes > 16384) deny();
  if (value === null || typeof value === "boolean" || typeof value === "string" && value.isWellFormed() || typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || (Array.isArray(value) ? Object.getPrototypeOf(value) !== Array.prototype : ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) deny();
  const copy = Array.isArray(value) ? [] : Object.create(null);
  if (Array.isArray(value) && (value.length > 16384 || value.length !== Object.keys(value).length || Array.from({ length: value.length }, (_, index) => String(index)).some(key => !Object.hasOwn(value, key)))) deny();
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || ["__proto__", "prototype", "constructor", "toJSON"].includes(key)) deny();
    copy[key] = jsonData(descriptor.value, depth + 1, budget);
  }
  return copy;
};
const serialized = value => JSON.stringify(jsonData(value));
// SDK annotations can be explicitly undefined. Normalize only SDK envelopes;
// business tool input/output and schemas still require literal JSON data.
const sdkEnvelope = value => {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) deny(); const copy = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key); if (typeof key !== "string" || !d?.enumerable || !Object.hasOwn(d, "value")) deny();
    if (key === "providerOptions" || d.value === undefined && ["providerExecuted", "description", "strict", "inputExamples"].includes(key)) continue;
    copy[key] = d.value;
  }
  return copy;
};
export function conversationMessages(prompt) {
  if (!Array.isArray(prompt) || !prompt.length || prompt.length > 64) deny("conversation_prompt_denied");
  const input = jsonData(prompt.map(value => { const message = sdkEnvelope(value);
    if (Array.isArray(message.content)) message.content = message.content.map(value => { const part = sdkEnvelope(value); if (part.type === "tool-result") part.output = sdkEnvelope(part.output); return part; }); return message; }));
  const messages = [], pending = new Map(), used = new Set();
  for (const message of input) {
    if (!fields(message, ["role", "content"], ["providerOptions"])) deny("conversation_prompt_denied");
    if (message.role === "tool") {
      if (!Array.isArray(message.content) || !message.content.length) deny();
      for (const part of message.content) {
        if (!fields(part, ["type", "toolCallId", "toolName", "output"], ["providerOptions"]) || part.type !== "tool-result" || pending.get(part.toolCallId) !== part.toolName ||
          !fields(part.output, ["type", "value"], ["providerOptions"]) || !["text", "json", "error-text", "error-json"].includes(part.output.type)) deny("conversation_tool_history_denied");
        const text = ["text", "error-text"].includes(part.output.type);
        if (text && typeof part.output.value !== "string") deny();
        messages.push({ role: "tool", tool_call_id: part.toolCallId, content: text ? part.output.value : serialized(part.output.value) }); pending.delete(part.toolCallId);
      }
      continue;
    }
    if (pending.size || !["system", "user", "assistant"].includes(message.role)) deny("conversation_tool_history_denied");
    if (typeof message.content === "string") { messages.push({ role: message.role, content: message.content }); continue; }
    if (!Array.isArray(message.content)) deny(); const text = [], calls = [];
    for (const part of message.content) {
      if (fields(part, ["type", "text"], ["providerOptions"]) && part.type === "text" && typeof part.text === "string") text.push(part.text);
      else if (message.role === "assistant" && fields(part, ["type", "toolCallId", "toolName", "input"], ["providerOptions", "providerExecuted"]) && part.type === "tool-call" &&
        part.providerExecuted !== true && id(part.toolCallId) && /^[a-zA-Z0-9_-]{1,64}$/.test(part.toolName) && !used.has(part.toolCallId) && part.input && !Array.isArray(part.input) && typeof part.input === "object") {
        used.add(part.toolCallId); pending.set(part.toolCallId, part.toolName);
        calls.push({ id: part.toolCallId, type: "function", function: { name: part.toolName, arguments: serialized(part.input) } });
      } else deny("conversation_prompt_denied");
    }
    messages.push({ role: message.role, content: calls.length && !text.length ? null : text.join(""), ...(calls.length ? { tool_calls: calls } : {}) });
  }
  if (messages.length > 64 || pending.size || !["user", "tool"].includes(messages.at(-1).role)) deny("conversation_tool_history_denied");
  return messages;
}
export function conversationTools(input) {
  if (input !== undefined && !Array.isArray(input)) deny("conversation_tools_denied");
  const tools = jsonData((input ?? []).map(sdkEnvelope)); if (tools.length > 32) deny("conversation_tools_denied"); const names = new Set();
  return tools.map(tool => {
    if (!fields(tool, ["type", "name", "inputSchema"], ["description"]) || tool.type !== "function" || !/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name) || names.has(tool.name) ||
      tool.description !== undefined && (typeof tool.description !== "string" || Buffer.byteLength(tool.description) > 4096) || !tool.inputSchema || tool.inputSchema.type !== "object") deny("conversation_tools_denied");
    names.add(tool.name); const schema = tool.inputSchema;
    // This annotation describes the dialect, not an assertion. All validation
    // keywords stay intact for the host's strict subset validator.
    if (Object.hasOwn(schema, "$schema")) {
      if (!["http://json-schema.org/draft-07/schema#", "https://json-schema.org/draft/2020-12/schema"].includes(schema.$schema)) deny("conversation_tools_denied"); delete schema.$schema;
    }
    return { type: "function", function: { name: tool.name, description: tool.description ?? "", parameters: schema } };
  });
}
export const conversationWireDigest = request => sha(JSON.stringify({ model: "glm-5.3", request_id: request.request_id, messages: request.messages,
  max_tokens: request.max_output_tokens, stream: request.response_mode === "sse", n: 1,
  ...(request.tools.length ? { tools: request.tools, tool_choice: "auto", tool_stream: request.response_mode === "sse" } : {}) }));
export function validateConversationReply(value, request, requestDigest) {
  if (!fields(value, ["format", "scope", "operation_key", "request_id", "request_digest", "policy_digest", "outcome", "response", "receipt", "reason", "replay", "formal_execution_enabled"]) ||
    value.format !== "cimiloop/model-conversation-reply/1.0.0" || value.scope !== "isolated_conversation_rehearsal" || value.operation_key !== request.operation_key || value.request_id !== request.request_id ||
    value.request_digest !== requestDigest || value.policy_digest !== request.policy_digest || typeof value.replay !== "boolean" || value.formal_execution_enabled !== false) deny("conversation_response_mismatch");
  if (value.outcome === "denied") {
    if (value.response !== null || value.receipt !== null || typeof value.reason !== "string" || !/^[a-z_]{1,96}$/.test(value.reason)) deny("conversation_response_mismatch"); deny(value.reason);
  }
  const r = value.response, receipt = value.receipt, usage = r?.usage;
  if (value.outcome !== "completed" || value.reason !== null || !fields(r, ["profile", "request_id", "input_digest", "response_digest", "text", "tool_calls", "finish_reason", "usage", "thinking_usage_verified", "actual_cost_known", "billing_admission_ready", "tool_execution_authorized"]) ||
    r.profile !== "cimiloop/gateway-conversation/1.0.0" || r.request_id !== request.request_id || r.input_digest !== conversationWireDigest(request) || !hash(r.response_digest) ||
    r.text !== null && typeof r.text !== "string" || !Array.isArray(r.tool_calls) || r.tool_calls.length > 32 || !["stop", "length", "tool_calls"].includes(r.finish_reason) ||
    r.thinking_usage_verified !== false || r.actual_cost_known !== false || r.billing_admission_ready !== false || r.tool_execution_authorized !== false ||
    !fields(usage, ["input_tokens", "output_tokens", "total_tokens"]) || !integer(usage.input_tokens, request.input_tokens) || !integer(usage.output_tokens, request.max_output_tokens) || usage.total_tokens !== usage.input_tokens + usage.output_tokens ||
    !fields(receipt, ["format", "scope", "unit", "request_id", "request_digest", "held_micro_units", "rate_digest", "response_digest", "input_tokens", "output_tokens", "actual_cost_known", "admission_ready"]) ||
    receipt.format !== "cimiloop/gateway-credit-receipt/1.0.0" || receipt.scope !== "credit_budget_rehearsal" || receipt.unit !== "ZHIPU_CODING_PLAN_CREDIT" || receipt.request_id !== request.request_id ||
    receipt.request_digest !== sha(JSON.stringify({ request_id: request.request_id, budget_key: "public_probe", input_digest: r.input_digest, input_tokens: request.input_tokens, output_tokens: request.max_output_tokens })) ||
    !hash(receipt.rate_digest) || receipt.response_digest !== r.response_digest || receipt.input_tokens !== usage.input_tokens || receipt.output_tokens !== usage.output_tokens ||
    receipt.held_micro_units !== Math.ceil((request.input_tokens * 690 + request.max_output_tokens * 2400) / 1000000) * 1000000 || receipt.actual_cost_known !== false || receipt.admission_ready !== false) deny("conversation_response_mismatch");
  const ids = new Set(request.messages.flatMap(m => (m.tool_calls ?? []).map(call => call.id)));
  for (const call of r.tool_calls) {
    if (!fields(call, ["id", "type", "function"]) || !id(call.id) || ids.has(call.id) || call.type !== "function" || !fields(call.function, ["name", "arguments"]) ||
      !request.tools.some(tool => tool.function.name === call.function.name)) deny("conversation_response_mismatch");
    ids.add(call.id); const args = conversationJson(call.function.arguments, 16384); if (!args || typeof args !== "object" || Array.isArray(args)) deny("conversation_response_mismatch");
  }
  if (r.finish_reason === "tool_calls" ? !r.tool_calls.length : r.tool_calls.length || r.text === null) deny("conversation_response_mismatch");
  return value;
}
export function exchangeConversationFrame(pipe, request, signal) {
  return new Promise((resolve, reject) => {
    let payload; try { payload = Buffer.from(serialized(request)); } catch { reject(new Error("conversation_request_denied")); return; }
    if (payload.length > conversationRequestBytes || signal?.aborted) { reject(new Error("conversation_request_denied")); return; }
    // Bind later validation to the detached bytes, not a caller's mutable object.
    request = JSON.parse(payload.toString("utf8"));
    const requestDigest = sha(payload); let socket, retry, buffered = Buffer.alloc(0), settled = false, sent = false;
    const finish = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer); clearTimeout(retry); signal?.removeEventListener("abort", aborted); socket?.destroy();
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("conversation_pipe_deadline_exhausted")), 15000), aborted = () => finish(new Error("conversation_aborted"));
    const ended = () => {
      if (buffered.length < 4 || buffered.length !== buffered.readUInt32LE() + 4) { finish(new Error("conversation_pipe_response_incomplete")); return; }
      try { const value = conversationJson(new TextDecoder("utf-8", { fatal: true }).decode(buffered.subarray(4))); finish(undefined, validateConversationReply(value, request, requestDigest)); }
      catch (error) { finish(new Error(typeof error?.message === "string" && /^[a-z_]{1,96}$/.test(error.message) ? error.message : "conversation_response_mismatch")); }
    };
    signal?.addEventListener("abort", aborted, { once: true });
    const connect = () => {
      if (settled) return; const client = createConnection({ path: pipe }); socket = client;
      client.once("connect", () => { sent = true; const header = Buffer.alloc(4); header.writeUInt32LE(payload.length); client.write(Buffer.concat([header, payload])); });
      client.on("data", bytes => {
        if (buffered.length + bytes.length > conversationReplyBytes + 4) { finish(new Error("conversation_response_limit")); return; }
        buffered = Buffer.concat([buffered, bytes]); if (buffered.length < 4) return;
        const length = buffered.readUInt32LE(); if (!length || length > conversationReplyBytes || buffered.length > length + 4) finish(new Error("conversation_response_limit"));
      });
      // Native disconnect follows WaitForPipeDrain. Wait for EOF so trailing
      // bytes in a later packet cannot arrive after a tool has been published.
      client.once("end", ended);
      client.once("error", error => {
        client.destroy();
        // Windows DisconnectNamedPipe can deliver ECONNRESET instead of EOF.
        // Accept only a complete frame at this terminal event, never on data.
        if (sent && ["ECONNRESET", "EPIPE"].includes(error.code) && buffered.length >= 4 && buffered.length === buffered.readUInt32LE() + 4) ended();
        else if (sent) finish(new Error("conversation_pipe_connection_failed")); else if (!settled) retry = setTimeout(connect, 50);
      });
      client.once("close", hadError => { if (sent && !settled && !hadError) finish(new Error("conversation_pipe_response_incomplete")); });
    }; connect();
  });
}
export function createCimiConversationProbe(options) {
  const pipe = process.env.CIMILOOP_IPC_PIPE;
  if (!pipe?.startsWith("\\\\.\\pipe\\CimiLoop.") || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(options.operationKey) || !hash(options.policyDigest)) deny("conversation_configuration_invalid");
  const invoke = async (input, responseMode) => {
    if (input.toolChoice !== undefined && (!fields(input.toolChoice, ["type"]) || input.toolChoice.type !== "auto") || input.responseFormat?.type === "json" || input.includeRawChunks) deny("conversation_options_denied");
    const output = input.maxOutputTokens ?? 128; if (!Number.isSafeInteger(output) || output < 1) deny("conversation_output_limit_invalid");
    const request = { format: "cimiloop/model-conversation-request/1.0.0", request_id: randomUUID(), operation_key: options.operationKey, model_id: "cimiloop-public-tools", policy_digest: options.policyDigest,
      messages: conversationMessages(input.prompt), tools: conversationTools(input.tools), response_mode: responseMode, input_tokens: 65536, max_output_tokens: Math.min(output, 128) };
    return (await exchangeConversationFrame(pipe, request, input.abortSignal)).response;
  };
  const usage = r => ({ inputTokens: { total: r.usage.input_tokens, noCache: undefined, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: r.usage.output_tokens, text: undefined, reasoning: undefined } });
  const finishReason = r => ({ unified: r.finish_reason === "tool_calls" ? "tool-calls" : r.finish_reason, raw: r.finish_reason });
  const calls = r => r.tool_calls.map(call => ({ type: "tool-call", toolCallId: call.id, toolName: call.function.name, input: call.function.arguments }));
  const content = r => [...(r.text === null ? [] : [{ type: "text", text: r.text }]), ...calls(r)];
  return { languageModel(modelId) {
    if (modelId !== "cimiloop-public-tools") deny("conversation_model_denied");
    return { specificationVersion: "v3", provider: "cimiloop-conversation", modelId, supportedUrls: {},
      async doGenerate(input) { const r = await invoke(input, "json"); if (input.abortSignal?.aborted) deny("conversation_aborted"); return { content: content(r), finishReason: finishReason(r), usage: usage(r), warnings: [] }; },
      async doStream(input) {
        const r = await invoke(input, "sse");
        return { stream: new ReadableStream({ start(controller) {
          if (input.abortSignal?.aborted) { controller.error(new Error("conversation_aborted")); return; }
          controller.enqueue({ type: "stream-start", warnings: [] });
          if (r.text !== null) for (const part of [{ type: "text-start", id: "text-0" }, { type: "text-delta", id: "text-0", delta: r.text }, { type: "text-end", id: "text-0" }]) controller.enqueue(part);
          for (const call of calls(r)) for (const part of [{ type: "tool-input-start", id: call.toolCallId, toolName: call.toolName }, { type: "tool-input-delta", id: call.toolCallId, delta: call.input }, { type: "tool-input-end", id: call.toolCallId }, call]) controller.enqueue(part);
          controller.enqueue({ type: "finish", finishReason: finishReason(r), usage: usage(r) }); controller.close();
        } }) };
      } };
  } };
}
