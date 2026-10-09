import { digest, RuntimeAdapterError } from "./files.js";
import type { PreparedGatewayHttpRequest } from "./gateway-http.js";

export const GATEWAY_CONVERSATION_PROFILE = "cimiloop/gateway-conversation/1.0.0";
export const GATEWAY_TOOL_ARGUMENT_BYTES = 16384, GATEWAY_TOOL_COUNT = 32, GATEWAY_SSE_EVENTS = 512;
export const GATEWAY_CONVERSATION_CONTRACT_BYTES = 65536, GATEWAY_CONVERSATION_REPLY_BYTES = 270336;
const REQUEST_BYTES = 65536, RESPONSE_BYTES = 262144;
type ObjectValue = Record<string, unknown>;
const fields = (value: unknown, required: string[], optional: string[] = []): value is ObjectValue => !!value && typeof value === "object" && !Array.isArray(value) &&
  required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const object = (value: unknown): value is ObjectValue => !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.isWellFormed() && Buffer.byteLength(value) <= max;
const name = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const callId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
function fail(reason = "gateway_conversation_contract_unproven"): never { throw new RuntimeAdapterError(reason); }

// Bounded, duplicate-key rejecting JSON. Escaped keys are compared after decoding;
// dangerous property names never reach downstream tool objects. No eval or refs.
export function parseGatewayJson(source: string, max = RESPONSE_BYTES): unknown {
  if (!text(source, max)) fail();
  let at = 0, nodes = 0;
  const whitespace = () => { while (/[\x20\t\r\n]/.test(source[at] ?? "!")) at++; };
  const string = (): string => {
    const start = at++;
    while (at < source.length) {
      const char = source[at++];
      if (char === "\\") at++;
      else if (char === '"') {
        try { const value: unknown = JSON.parse(source.slice(start, at)); if (!text(value, max)) fail(); return value; } catch { fail(); }
      }
    }
    fail();
  };
  const value = (depth: number): unknown => {
    if (depth > 16 || ++nodes > 16384) fail(); whitespace();
    const char = source[at];
    if (char === '"') return string();
    if (char === "{" || char === "[") {
      at++; whitespace(); const result: ObjectValue | unknown[] = char === "{" ? Object.create(null) as ObjectValue : [];
      const end = char === "{" ? "}" : "]", seen = new Set<string>();
      if (source[at] === end) { at++; return result; }
      while (at < source.length) {
        whitespace();
        if (Array.isArray(result)) result.push(value(depth + 1));
        else {
          if (source[at] !== '"') fail(); const key = string();
          if (seen.has(key) || ["__proto__", "prototype", "constructor"].includes(key)) fail(); seen.add(key);
          whitespace(); if (source[at++] !== ":") fail(); result[key] = value(depth + 1);
        }
        whitespace(); const separator = source[at++]; if (separator === end) return result; if (separator !== ",") fail();
      }
      fail();
    }
    for (const [literal, parsed] of [["true", true], ["false", false], ["null", null]] as const) if (source.startsWith(literal, at)) { at += literal.length; return parsed; }
    const numeric = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(at));
    if (!numeric || !Number.isFinite(Number(numeric[0]))) fail(); at += numeric[0].length; return Number(numeric[0]);
  };
  const parsed = value(0); whitespace(); if (at !== source.length) fail(); return parsed;
}

export interface GatewayFunctionTool { readonly type: "function"; readonly function: Readonly<{ name: string; description: string; parameters: ObjectValue }> }
export interface GatewayFunctionCall { readonly id: string; readonly type: "function"; readonly function: Readonly<{ name: string; arguments: string }> }
export interface PreparedGatewayConversationRequest extends PreparedGatewayHttpRequest {
  readonly profile: typeof GATEWAY_CONVERSATION_PROFILE; readonly response_mode: "json" | "sse";
}
export interface GatewayConversationResponse {
  readonly profile: typeof GATEWAY_CONVERSATION_PROFILE; readonly request_id: string; readonly input_digest: string; readonly response_digest: string;
  readonly text: string | null; readonly tool_calls: readonly GatewayFunctionCall[]; readonly finish_reason: "stop" | "length" | "tool_calls";
  readonly usage: Readonly<{ input_tokens: number; output_tokens: number; total_tokens: number }>;
  readonly thinking_usage_verified: false; readonly actual_cost_known: false; readonly billing_admission_ready: false; readonly tool_execution_authorized: false;
}

const schemaKeys = ["type", "description", "properties", "required", "additionalProperties", "items", "enum", "const", "anyOf", "minLength", "maxLength", "pattern", "minItems", "maxItems", "minimum", "maximum"];
function validateSchema(schema: unknown, budget: { nodes: number }, depth = 0): asserts schema is ObjectValue {
  if (!object(schema) || depth > 8 || ++budget.nodes > 256 || Object.keys(schema).some(key => !schemaKeys.includes(key))) fail("invalid_gateway_tool_schema");
  if (Object.hasOwn(schema, "description") && !text(schema.description, 4096)) fail("invalid_gateway_tool_schema");
  if (schema.anyOf !== undefined) {
    if (!Array.isArray(schema.anyOf) || schema.anyOf.length < 1 || schema.anyOf.length > 8 || Object.keys(schema).some(key => !["anyOf", "description"].includes(key))) fail("invalid_gateway_tool_schema");
    for (const child of schema.anyOf) validateSchema(child, budget, depth + 1); return;
  }
  if (typeof schema.type !== "string" || !["object", "array", "string", "number", "integer", "boolean", "null"].includes(schema.type)) fail("invalid_gateway_tool_schema");
  const permitted = ["type", "description", "enum", "const", ...(schema.type === "object" ? ["properties", "required", "additionalProperties"] :
    schema.type === "array" ? ["items", "minItems", "maxItems"] : schema.type === "string" ? ["minLength", "maxLength", "pattern"] : ["number", "integer"].includes(schema.type) ? ["minimum", "maximum"] : [])];
  if (Object.keys(schema).some(key => !permitted.includes(key))) fail("invalid_gateway_tool_schema");
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.length || schema.enum.length > 32)) fail("invalid_gateway_tool_schema");
  if (schema.type === "object") {
    if (!object(schema.properties) || Object.keys(schema.properties).length > 64) fail("invalid_gateway_tool_schema");
    for (const child of Object.values(schema.properties)) validateSchema(child, budget, depth + 1);
    if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== "string" || !Object.hasOwn(schema.properties as ObjectValue, key)) || new Set(schema.required).size !== schema.required.length)) fail("invalid_gateway_tool_schema");
    if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") validateSchema(schema.additionalProperties, budget, depth + 1);
  }
  if (schema.pattern !== undefined && schema.pattern !== "^[a-f0-9]{64}$") fail("invalid_gateway_tool_schema");
  if (schema.type === "array") validateSchema(schema.items, budget, depth + 1);
  for (const [low, high] of [["minLength", "maxLength"], ["minItems", "maxItems"]]) {
    for (const key of [low!, high!]) if (schema[key] !== undefined && !integer(schema[key], 0, GATEWAY_TOOL_ARGUMENT_BYTES)) fail("invalid_gateway_tool_schema");
    if (schema[low!] !== undefined && schema[high!] !== undefined && (schema[low!] as number) > (schema[high!] as number)) fail("invalid_gateway_tool_schema");
  }
  for (const key of ["minimum", "maximum"]) if (schema[key] !== undefined && (typeof schema[key] !== "number" || !Number.isFinite(schema[key]))) fail("invalid_gateway_tool_schema");
  if (schema.minimum !== undefined && schema.maximum !== undefined && (schema.minimum as number) > (schema.maximum as number)) fail("invalid_gateway_tool_schema");
}
const equal = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => equal(item, right[index]));
  return object(left) && object(right) && Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
};
function matches(schema: ObjectValue, value: unknown): boolean {
  if (Array.isArray(schema.anyOf)) return schema.anyOf.some(child => matches(child as ObjectValue, value));
  if (Array.isArray(schema.enum) && !schema.enum.some(item => equal(item, value))) return false;
  if (Object.hasOwn(schema, "const") && !equal(schema.const, value)) return false;
  switch (schema.type) {
    case "object": {
      if (!object(value) || (schema.required as string[] | undefined)?.some(key => !Object.hasOwn(value, key))) return false;
      const properties = schema.properties as ObjectValue;
      return Object.keys(value).every(key => Object.hasOwn(properties, key) ? matches(properties[key] as ObjectValue, value[key]) : schema.additionalProperties === undefined || schema.additionalProperties === true ||
        (object(schema.additionalProperties) && matches(schema.additionalProperties, value[key])));
    }
    case "array": return Array.isArray(value) && value.length >= (schema.minItems as number ?? 0) && value.length <= (schema.maxItems as number ?? Infinity) && value.every(item => matches(schema.items as ObjectValue, item));
    case "string": return (schema.pattern === undefined || typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) && typeof value === "string" && [...value].length >= (schema.minLength as number ?? 0) && [...value].length <= (schema.maxLength as number ?? Infinity);
    case "integer": case "number": return typeof value === "number" && Number.isFinite(value) && (schema.type !== "integer" || Number.isSafeInteger(value)) && value >= (schema.minimum as number ?? -Infinity) && value <= (schema.maximum as number ?? Infinity);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: return false;
  }
}
function calls(value: unknown, tools: readonly GatewayFunctionTool[]): readonly GatewayFunctionCall[] {
  if (!Array.isArray(value) || !value.length || value.length > GATEWAY_TOOL_COUNT) fail(); const ids = new Set<string>();
  return Object.freeze(value.map(call => {
    if (!fields(call, ["id", "type", "function"]) || !callId(call.id) || ids.has(call.id) || call.type !== "function" || !fields(call.function, ["name", "arguments"]) ||
      !name(call.function.name) || !text(call.function.arguments, GATEWAY_TOOL_ARGUMENT_BYTES)) fail(); ids.add(call.id);
    const fn = call.function;
    const tool = tools.find(tool => tool.function.name === fn.name), argumentsValue = parseGatewayJson(fn.arguments as string, GATEWAY_TOOL_ARGUMENT_BYTES);
    if (!tool || !object(argumentsValue) || !matches(tool.function.parameters, argumentsValue)) fail("gateway_tool_arguments_unproven");
    return Object.freeze({ id: call.id, type: "function", function: Object.freeze({ name: call.function.name, arguments: call.function.arguments }) });
  }));
}
function freeze(value: unknown): void { if (value && typeof value === "object") { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } }
function copyJson(value: unknown, budget = { nodes: 0 }, depth = 0, maxText = REQUEST_BYTES): unknown {
  if (++budget.nodes > 16384 || depth > 16) fail("invalid_gateway_conversation_request");
  if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") { if (!text(value, maxText)) fail("gateway_request_limit"); return value; }
  if (!object(value) && !Array.isArray(value)) fail("invalid_gateway_conversation_request");
  if (Object.getOwnPropertySymbols(value).length || (!Array.isArray(value) && ![null, Object.prototype].includes(Object.getPrototypeOf(value) as object | null))) fail("invalid_gateway_conversation_request");
  const keys = Object.keys(value), result: ObjectValue | unknown[] = Array.isArray(value) ? [] : Object.create(null) as ObjectValue;
  if (Array.isArray(value) && (keys.length !== value.length || keys.some((key, index) => key !== String(index)))) fail("invalid_gateway_conversation_request");
  for (const key of keys) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !Object.hasOwn(property, "value") || ["__proto__", "prototype", "constructor"].includes(key)) fail("invalid_gateway_conversation_request");
    const child = copyJson(property.value, budget, depth + 1, maxText); if (Array.isArray(result)) result.push(child); else result[key] = child;
  }
  return result;
}

export interface GatewayConversationCacheContract {
  readonly format: "cimiloop/conversation-cache-contract/1.0.0";
  readonly request_id: string; readonly input_digest: string; readonly input_tokens: number; readonly output_tokens: number;
  readonly response_mode: "json" | "sse";
  readonly tools: readonly Readonly<{ type: "function"; function: Readonly<{ name: string; parameters: ObjectValue }> }>[];
  readonly prior_call_ids: readonly string[];
}
// Canonicalize only JSON object key order; arrays keep their declared order.
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : object(value) ?
  Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function withoutDescriptions(schema: ObjectValue): ObjectValue {
  const result = { ...schema }; delete result.description;
  if (object(schema.properties)) result.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, withoutDescriptions(value as ObjectValue)]));
  if (object(schema.items)) result.items = withoutDescriptions(schema.items);
  if (object(schema.additionalProperties)) result.additionalProperties = withoutDescriptions(schema.additionalProperties);
  if (Array.isArray(schema.anyOf)) result.anyOf = schema.anyOf.map(value => withoutDescriptions(value as ObjectValue));
  return result;
}
export function createGatewayConversationCacheContract(prepared: PreparedGatewayConversationRequest, tools: readonly GatewayFunctionTool[], priorCallIds: readonly string[]): GatewayConversationCacheContract {
  return parseGatewayConversationCacheContract({ format: "cimiloop/conversation-cache-contract/1.0.0", request_id: prepared.request_id, input_digest: prepared.input_digest,
    input_tokens: prepared.input_tokens, output_tokens: prepared.output_tokens, response_mode: prepared.response_mode,
    tools: tools.map(tool => ({ type: "function", function: { name: tool.function.name, parameters: withoutDescriptions(tool.function.parameters) } })), prior_call_ids: priorCallIds });
}
export function parseGatewayConversationCacheContract(input: unknown): GatewayConversationCacheContract {
  try {
    const raw = JSON.stringify(copyJson(input)); if (Buffer.byteLength(raw) > GATEWAY_CONVERSATION_CONTRACT_BYTES) fail();
    const value = parseGatewayJson(raw, GATEWAY_CONVERSATION_CONTRACT_BYTES);
    if (!fields(value, ["format", "request_id", "input_digest", "input_tokens", "output_tokens", "response_mode", "tools", "prior_call_ids"]) || value.format !== "cimiloop/conversation-cache-contract/1.0.0" ||
      typeof value.request_id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.request_id) || typeof value.input_digest !== "string" || !/^[a-f0-9]{64}$/.test(value.input_digest) ||
      !integer(value.input_tokens, 1, 1048576) || !integer(value.output_tokens, 1, 131072) || !["json", "sse"].includes(value.response_mode as string) ||
      !Array.isArray(value.tools) || value.tools.length > GATEWAY_TOOL_COUNT || !Array.isArray(value.prior_call_ids) || value.prior_call_ids.length > 2048 ||
      value.prior_call_ids.some(id => !callId(id)) || new Set(value.prior_call_ids).size !== value.prior_call_ids.length) fail();
    const names = new Set<string>();
    for (const tool of value.tools) {
      if (!fields(tool, ["type", "function"]) || tool.type !== "function" || !fields(tool.function, ["name", "parameters"]) || !name(tool.function.name) || names.has(tool.function.name)) fail(); names.add(tool.function.name);
      validateSchema(tool.function.parameters, { nodes: 0 });
      if (tool.function.parameters.type !== "object" || Buffer.byteLength(JSON.stringify(tool.function.parameters)) > GATEWAY_TOOL_ARGUMENT_BYTES ||
        JSON.stringify(canonical(tool.function.parameters)) !== JSON.stringify(canonical(withoutDescriptions(tool.function.parameters)))) fail();
    }
    const contract = canonical(value) as unknown as GatewayConversationCacheContract; freeze(contract); return contract;
  } catch { fail("gateway_conversation_cache_contract_invalid"); }
}
export function parseCachedGatewayConversationResponse(input: unknown, contract: GatewayConversationCacheContract): GatewayConversationResponse {
  try {
    const raw = JSON.stringify(copyJson(input, { nodes: 0 }, 0, RESPONSE_BYTES));
    if (Buffer.byteLength(raw) > GATEWAY_CONVERSATION_REPLY_BYTES) fail("credit_response_cache_entry_limit");
    const value = parseGatewayJson(raw, GATEWAY_CONVERSATION_REPLY_BYTES);
    if (!fields(value, ["profile", "request_id", "input_digest", "response_digest", "text", "tool_calls", "finish_reason", "usage", "thinking_usage_verified", "actual_cost_known", "billing_admission_ready", "tool_execution_authorized"]) ||
      value.profile !== GATEWAY_CONVERSATION_PROFILE || value.request_id !== contract.request_id || value.input_digest !== contract.input_digest ||
      typeof value.response_digest !== "string" || !/^[a-f0-9]{64}$/.test(value.response_digest) || !["stop", "length", "tool_calls"].includes(value.finish_reason as string) ||
      (value.text !== null && !text(value.text, RESPONSE_BYTES)) || !Array.isArray(value.tool_calls) || value.thinking_usage_verified !== false || value.actual_cost_known !== false || value.billing_admission_ready !== false || value.tool_execution_authorized !== false ||
      !fields(value.usage, ["input_tokens", "output_tokens", "total_tokens"]) || !integer(value.usage.input_tokens, 0, 1048576) || !integer(value.usage.output_tokens, 0, 131072) ||
      value.usage.total_tokens !== value.usage.input_tokens + value.usage.output_tokens) fail();
    const tools: GatewayFunctionTool[] = contract.tools.map(tool => ({ type: "function", function: { ...tool.function, description: "" } }));
    const accepted = value.finish_reason === "tool_calls" ? calls(value.tool_calls, tools) : Object.freeze([]);
    if (value.finish_reason !== "tool_calls" && (value.tool_calls.length || value.text === null) || accepted.some(call => contract.prior_call_ids.includes(call.id))) fail();
    return Object.freeze({ profile: GATEWAY_CONVERSATION_PROFILE, request_id: contract.request_id, input_digest: contract.input_digest, response_digest: value.response_digest,
      text: value.text as string | null, tool_calls: accepted, finish_reason: value.finish_reason as GatewayConversationResponse["finish_reason"],
      usage: Object.freeze({ input_tokens: value.usage.input_tokens, output_tokens: value.usage.output_tokens, total_tokens: value.usage.total_tokens as number }),
      thinking_usage_verified: false, actual_cost_known: false, billing_admission_ready: false, tool_execution_authorized: false });
  } catch (error) { if (error instanceof RuntimeAdapterError && error.reason === "credit_response_cache_entry_limit") throw error; fail("gateway_cached_conversation_response_invalid"); }
}
export function prepareGatewayConversation(input: unknown): { body: Buffer; tools: readonly GatewayFunctionTool[]; prior_call_ids: readonly string[]; prepared: PreparedGatewayConversationRequest } {
  try {
    // Serialize then validate to detach all schemas and messages from the caller.
    const serialized = JSON.stringify(copyJson(input)); if (!text(serialized, REQUEST_BYTES)) fail("gateway_request_limit"); const copy = parseGatewayJson(serialized, REQUEST_BYTES);
    if (!fields(copy, ["request_id", "messages", "tools", "response_mode", "input_tokens", "max_output_tokens"]) || typeof copy.request_id !== "string" ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(copy.request_id) || !integer(copy.input_tokens, 1, 1048576) || !integer(copy.max_output_tokens, 1, 131072) ||
      !["json", "sse"].includes(copy.response_mode as string) || !Array.isArray(copy.tools) || copy.tools.length > GATEWAY_TOOL_COUNT || !Array.isArray(copy.messages) || !copy.messages.length || copy.messages.length > 64) fail("invalid_gateway_conversation_request");
    const names = new Set<string>();
    const tools = copy.tools.map(tool => {
      if (!fields(tool, ["type", "function"]) || tool.type !== "function" || !fields(tool.function, ["name", "description", "parameters"]) || !name(tool.function.name) || names.has(tool.function.name) ||
        !text(tool.function.description, 4096)) fail("invalid_gateway_tool_definition"); names.add(tool.function.name);
      validateSchema(tool.function.parameters, { nodes: 0 }); if (tool.function.parameters.type !== "object" || Buffer.byteLength(JSON.stringify(tool.function.parameters)) > GATEWAY_TOOL_ARGUMENT_BYTES) fail("invalid_gateway_tool_schema");
      return tool as unknown as GatewayFunctionTool;
    });
    const pending = new Set<string>(), used = new Set<string>();
    for (const message of copy.messages) {
      if (!object(message)) fail("invalid_gateway_tool_history");
      if (message.role === "tool") {
        if (!fields(message, ["role", "tool_call_id", "content"]) || !callId(message.tool_call_id) || !pending.delete(message.tool_call_id) || !text(message.content, REQUEST_BYTES)) fail("invalid_gateway_tool_history");
      } else {
        if (pending.size || !fields(message, ["role", "content"], ["tool_calls"]) || typeof message.role !== "string" || !["system", "user", "assistant"].includes(message.role)) fail("invalid_gateway_tool_history");
        if (Object.hasOwn(message, "tool_calls")) {
          if (message.role !== "assistant" || (message.content !== null && !text(message.content, REQUEST_BYTES))) fail("invalid_gateway_tool_history");
          for (const call of calls(message.tool_calls, tools)) { if (used.has(call.id)) fail("invalid_gateway_tool_history"); used.add(call.id); pending.add(call.id); }
        } else if (!text(message.content, REQUEST_BYTES)) fail("invalid_gateway_tool_history");
      }
    }
    if (pending.size || !["user", "tool"].includes((copy.messages.at(-1) as ObjectValue).role as string)) fail("invalid_gateway_tool_history");
    const stream = copy.response_mode === "sse", body = Buffer.from(JSON.stringify({ model: "glm-5.3", request_id: copy.request_id, messages: copy.messages, max_tokens: copy.max_output_tokens, stream, n: 1,
      ...(tools.length ? { tools, tool_choice: "auto", tool_stream: stream } : {}) }));
    if (body.length > REQUEST_BYTES) fail("gateway_request_limit"); freeze(tools);
    return { body, tools, prior_call_ids: Object.freeze([...used]), prepared: Object.freeze({ profile: GATEWAY_CONVERSATION_PROFILE, response_mode: copy.response_mode as "json" | "sse", request_id: copy.request_id,
      input_digest: digest(body).value, input_tokens: copy.input_tokens, output_tokens: copy.max_output_tokens }) };
  } catch (error) { if (error instanceof RuntimeAdapterError) throw error; fail("invalid_gateway_conversation_request"); }
}

function usage(value: unknown, prepared: PreparedGatewayConversationRequest): GatewayConversationResponse["usage"] {
  if (!fields(value, ["prompt_tokens", "completion_tokens", "total_tokens"], ["prompt_tokens_details"]) || !integer(value.prompt_tokens, 0, 1048576) || !integer(value.completion_tokens, 0, 131072) ||
    value.total_tokens !== value.prompt_tokens + value.completion_tokens || (value.prompt_tokens_details !== undefined && (!fields(value.prompt_tokens_details, ["cached_tokens"]) || !integer(value.prompt_tokens_details.cached_tokens, 0, value.prompt_tokens)))) fail("gateway_response_usage_unproven");
  if (value.prompt_tokens > prepared.input_tokens || value.completion_tokens > prepared.output_tokens) fail("gateway_usage_bound_exceeded");
  return Object.freeze({ input_tokens: value.prompt_tokens, output_tokens: value.completion_tokens, total_tokens: value.total_tokens as number });
}
function metadata(value: unknown, prepared: PreparedGatewayConversationRequest, streaming: boolean): asserts value is ObjectValue {
  if (!fields(value, ["id", "model", "choices"], ["usage", "object", "created", "request_id"]) || !text(value.id, 128) || !value.id.length || value.model !== "glm-5.3" ||
    (value.object !== undefined && value.object !== (streaming ? "chat.completion.chunk" : "chat.completion")) || (value.created !== undefined && !integer(value.created, 0, Number.MAX_SAFE_INTEGER)) ||
    (value.request_id !== undefined && value.request_id !== prepared.request_id) || !Array.isArray(value.choices) || value.choices.length !== 1) fail();
}
export function parseGatewayConversation(bytes: Buffer, prepared: PreparedGatewayConversationRequest, tools: readonly GatewayFunctionTool[], priorCallIds: readonly string[], apiKey: string): GatewayConversationResponse {
  if (bytes.length > RESPONSE_BYTES) fail("gateway_response_limit");
  let source: string; try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { fail(); }
  if (source.includes(apiKey)) fail("gateway_credential_disclosure_blocked");
  let content: unknown, finish: unknown, toolCalls: unknown, observedUsage: unknown;
  const decode = (raw: string) => { const value = parseGatewayJson(raw); if (JSON.stringify(value).includes(apiKey)) fail("gateway_credential_disclosure_blocked"); return value; };
  if (prepared.response_mode === "json") {
    const value = decode(source); metadata(value, prepared, false);
    const choice = (value.choices as unknown[])[0];
    if (!fields(choice, ["index", "message", "finish_reason"]) || choice.index !== 0 || !fields(choice.message, ["role", "content"], ["tool_calls", "reasoning_content"]) || choice.message.role !== "assistant" ||
      (choice.message.reasoning_content !== undefined && !text(choice.message.reasoning_content, RESPONSE_BYTES))) fail();
    content = choice.message.content; finish = choice.finish_reason; toolCalls = choice.message.tool_calls; observedUsage = value.usage;
  } else {
    // Buffer the bounded upstream stream. Nothing is published or executable
    // until EOF, final usage and DONE are all verified. Split secrets remain private.
    const events = source.replace(/\r\n/g, "\n").split("\n\n");
    if (events.at(-1) !== "" || events.length > GATEWAY_SSE_EVENTS + 1) fail("gateway_stream_incomplete"); events.pop();
    let identity: string | undefined, done = false, reasoning = "", visible = "";
    const fragments = new Map<number, { id: string; type: "function"; function: { name: string; arguments: string } }>();
    for (const event of events) {
      if (done || !event.length || event.includes("\r")) fail("gateway_stream_contract_unproven");
      const lines = event.split("\n"); if (lines.some(line => !line.startsWith("data:"))) fail("gateway_stream_contract_unproven");
      const data = lines.map(line => line.slice(5).replace(/^ /, "")).join("\n");
      if (data === "[DONE]") { if (!finish || !observedUsage) fail("gateway_stream_incomplete"); done = true; continue; }
      if (finish) fail("gateway_stream_contract_unproven");
      const value = decode(data); metadata(value, prepared, true);
      const currentIdentity = JSON.stringify([value.id, value.model, value.created ?? null, value.object ?? null, value.request_id ?? null]);
      if (identity !== undefined && identity !== currentIdentity) fail("gateway_stream_contract_unproven"); identity = currentIdentity;
      const choice = (value.choices as unknown[])[0];
      if (!fields(choice, ["index", "delta", "finish_reason"]) || choice.index !== 0 || !fields(choice.delta, [], ["role", "content", "reasoning_content", "tool_calls"]) ||
        (choice.delta.role !== undefined && choice.delta.role !== "assistant")) fail("gateway_stream_contract_unproven");
      for (const key of ["content", "reasoning_content"]) {
        const part = choice.delta[key]; if (part !== undefined && part !== null && !text(part, RESPONSE_BYTES)) fail("gateway_stream_contract_unproven");
        if (typeof part === "string") { if (key === "content") visible += part; else reasoning += part; }
      }
      if (visible.includes(apiKey) || reasoning.includes(apiKey)) fail("gateway_credential_disclosure_blocked");
      if (choice.delta.tool_calls !== undefined) {
        if (!Array.isArray(choice.delta.tool_calls) || !choice.delta.tool_calls.length || choice.delta.tool_calls.length > GATEWAY_TOOL_COUNT) fail("gateway_stream_contract_unproven");
        const indices = new Set<number>();
        for (const part of choice.delta.tool_calls) {
          if (!fields(part, ["index", "function"], ["id", "type"]) || !integer(part.index, 0, GATEWAY_TOOL_COUNT - 1) || indices.has(part.index) || !fields(part.function, [], ["name", "arguments"])) fail("gateway_stream_contract_unproven"); indices.add(part.index);
          let call = fragments.get(part.index);
          if (!call) {
            if (part.index !== fragments.size || !callId(part.id) || part.type !== "function" || !name(part.function.name)) fail("gateway_stream_contract_unproven");
            call = { id: part.id, type: "function", function: { name: part.function.name, arguments: "" } }; fragments.set(part.index, call);
          } else if ((part.id !== undefined && part.id !== call.id) || (part.type !== undefined && part.type !== call.type) || (part.function.name !== undefined && part.function.name !== call.function.name)) fail("gateway_stream_contract_unproven");
          if (!text(part.function.arguments, GATEWAY_TOOL_ARGUMENT_BYTES)) fail("gateway_stream_contract_unproven"); call.function.arguments += part.function.arguments;
          if (Buffer.byteLength(call.function.arguments) > GATEWAY_TOOL_ARGUMENT_BYTES) fail("gateway_response_limit");
          if (call.function.arguments.includes(apiKey)) fail("gateway_credential_disclosure_blocked");
        }
      }
      if (choice.finish_reason !== null) { finish = choice.finish_reason; observedUsage = value.usage; if (!observedUsage) fail("gateway_stream_incomplete"); }
      else if (value.usage !== undefined) fail("gateway_stream_contract_unproven");
    }
    if (!done) fail("gateway_stream_incomplete"); content = visible; toolCalls = fragments.size ? [...fragments.values()] : undefined;
    // Inspect decoded complete argument strings too, including escaped secrets.
    if (toolCalls) for (const call of toolCalls as GatewayFunctionCall[]) if (JSON.stringify(parseGatewayJson(call.function.arguments, GATEWAY_TOOL_ARGUMENT_BYTES)).includes(apiKey)) fail("gateway_credential_disclosure_blocked");
  }
  if (!["stop", "length", "tool_calls"].includes(finish as string) || (content !== null && !text(content, RESPONSE_BYTES))) fail();
  const accepted = finish === "tool_calls" ? calls(toolCalls, tools) : Object.freeze([]);
  if (accepted.some(call => priorCallIds.includes(call.id))) fail("gateway_tool_call_identity_reused");
  if (finish !== "tool_calls" && (toolCalls !== undefined || content === null)) fail();
  // JSON arguments can hide an echoed credential through escaping.
  for (const call of accepted) if (JSON.stringify(parseGatewayJson(call.function.arguments, GATEWAY_TOOL_ARGUMENT_BYTES)).includes(apiKey)) fail("gateway_credential_disclosure_blocked");
  return Object.freeze({ profile: GATEWAY_CONVERSATION_PROFILE, request_id: prepared.request_id, input_digest: prepared.input_digest, response_digest: digest(bytes).value,
    text: content as string | null, tool_calls: accepted, finish_reason: finish as GatewayConversationResponse["finish_reason"], usage: usage(observedUsage, prepared),
    thinking_usage_verified: false, actual_cost_known: false, billing_admission_ready: false, tool_execution_authorized: false });
}

// Internal dedicated-model codec shares the same schema and call validation.
export { validateSchema as validateGatewayToolSchema, calls as parseGatewayFunctionCalls };
