import { prepareDedicatedAgentRequest, parseDedicatedAgentResponse, type PreparedDedicatedAgentRequest, type DedicatedAgentProfile, type DedicatedAgentReply } from "./agent-dedicated-codec.js";
import type { parseAgentRuntimeModelRequest } from "./agent-runtime-model.js";
import { Agent, request as httpsRequest } from "node:https";
import {Agent as HttpAgent,request as httpRequest} from 'node:http';
import type { ClientRequest, IncomingMessage } from "node:http";
import { performance } from "node:perf_hooks";
import { GatewayNetworkBoundary, type GatewayTlsConnection } from "./gateway-network.js";
import {LoopbackGatewayNetworkBoundary,type LoopbackGatewayConnection} from './loopback-gateway-network.js';
import { digest, RuntimeAdapterError } from "./files.js";
import { prepareGatewayConversation, parseGatewayConversation, createGatewayConversationCacheContract, parseGatewayJson,
  type GatewayConversationCacheContract, type GatewayConversationResponse, type PreparedGatewayConversationRequest } from "./gateway-conversation.js";

export const GATEWAY_HTTP_REQUEST_BYTES = 65536, GATEWAY_HTTP_RESPONSE_BYTES = 262144, GATEWAY_HTTP_HEADER_BYTES = 8192;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const sha = /^[a-f0-9]{64}$/;
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const fields = (value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) &&
  required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max && Buffer.byteLength(value) <= max && value.isWellFormed();
function fail(reason: string): never { throw new RuntimeAdapterError(reason); }
export interface PreparedGatewayHttpRequest {
  readonly request_id: string; readonly input_digest: string; readonly input_tokens: number; readonly output_tokens: number;
}
export interface GatewayHttpResponse {
  readonly request_id: string; readonly input_digest: string; readonly response_digest: string; readonly text: string;
  readonly finish_reason: "stop" | "length"; readonly usage: Readonly<{ input_tokens: number; output_tokens: number; total_tokens: number }>;
  readonly thinking_usage_verified: false; readonly actual_cost_known: false; readonly billing_admission_ready: false;
}
// The persisted envelope contains only the previously accepted public reply.
// The ledger additionally binds it to the original request and credit receipt.
export const parseCachedGatewayHttpResponse = (input: unknown): GatewayHttpResponse => {
  if (!fields(input, ["request_id", "input_digest", "response_digest", "text", "finish_reason", "usage", "thinking_usage_verified", "actual_cost_known", "billing_admission_ready"]) ||
    typeof input.request_id !== "string" || !uuid.test(input.request_id) || typeof input.input_digest !== "string" || !sha.test(input.input_digest) ||
    typeof input.response_digest !== "string" || !sha.test(input.response_digest) || !text(input.text, GATEWAY_HTTP_RESPONSE_BYTES) ||
    (input.finish_reason !== "stop" && input.finish_reason !== "length") || input.thinking_usage_verified !== false || input.actual_cost_known !== false || input.billing_admission_ready !== false ||
    !fields(input.usage, ["input_tokens", "output_tokens", "total_tokens"]) || !integer(input.usage.input_tokens, 0, 1048576) ||
    !integer(input.usage.output_tokens, 0, 131072) || input.usage.total_tokens !== input.usage.input_tokens + input.usage.output_tokens) fail("gateway_cached_response_invalid");
  return Object.freeze({ request_id: input.request_id, input_digest: input.input_digest, response_digest: input.response_digest, text: input.text, finish_reason: input.finish_reason,
    usage: Object.freeze({ input_tokens: input.usage.input_tokens, output_tokens: input.usage.output_tokens, total_tokens: input.usage.total_tokens as number }),
    thinking_usage_verified: false, actual_cost_known: false, billing_admission_ready: false });
};
const parseResponse = (bytes: Buffer, prepared: PreparedGatewayHttpRequest, apiKey: string): GatewayHttpResponse => {
  try {
    if (bytes.includes(Buffer.from(apiKey))) fail("gateway_credential_disclosure_blocked");
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    // Decode first as well: JSON escaping must not bypass credential detection.
    if (JSON.stringify(value).includes(apiKey)) fail("gateway_credential_disclosure_blocked");
    if (!fields(value, ["id", "model", "choices", "usage"], ["object", "created", "request_id"]) || !text(value.id, 128) || !value.id.length || value.model !== "glm-5.3" ||
      (Object.hasOwn(value, "object") && value.object !== "chat.completion") || (Object.hasOwn(value, "created") && !integer(value.created, 0, Number.MAX_SAFE_INTEGER)) ||
      (Object.hasOwn(value, "request_id") && value.request_id !== prepared.request_id) || !Array.isArray(value.choices) || value.choices.length !== 1)
      fail("gateway_response_contract_unproven");
    const choice: unknown = value.choices[0];
    if (!fields(choice, ["index", "message", "finish_reason"]) || choice.index !== 0 || typeof choice.finish_reason !== "string" || !["stop", "length"].includes(choice.finish_reason) ||
      !fields(choice.message, ["role", "content"], ["reasoning_content"]) || choice.message.role !== "assistant" || !text(choice.message.content, GATEWAY_HTTP_RESPONSE_BYTES) ||
      (Object.hasOwn(choice.message, "reasoning_content") && !text(choice.message.reasoning_content, GATEWAY_HTTP_RESPONSE_BYTES))) fail("gateway_response_contract_unproven");
    const usage = value.usage;
    if (!fields(usage, ["prompt_tokens", "completion_tokens", "total_tokens"], ["prompt_tokens_details"]) || !integer(usage.prompt_tokens, 0, 1048576) ||
      !integer(usage.completion_tokens, 0, 131072) || usage.total_tokens !== usage.prompt_tokens + usage.completion_tokens ||
      (Object.hasOwn(usage, "prompt_tokens_details") && (!fields(usage.prompt_tokens_details, ["cached_tokens"]) || !integer(usage.prompt_tokens_details.cached_tokens, 0, usage.prompt_tokens))))
      fail("gateway_response_usage_unproven");
    if (usage.prompt_tokens > prepared.input_tokens || usage.completion_tokens > prepared.output_tokens) fail("gateway_usage_bound_exceeded");
    return Object.freeze({ request_id: prepared.request_id, input_digest: prepared.input_digest, response_digest: digest(bytes).value, text: choice.message.content,
      finish_reason: choice.finish_reason as "stop" | "length", usage: Object.freeze({ input_tokens: usage.prompt_tokens, output_tokens: usage.completion_tokens, total_tokens: usage.total_tokens as number }),
      thinking_usage_verified: false, actual_cost_known: false, billing_admission_ready: false });
  } catch (error) { if (error instanceof RuntimeAdapterError) throw error; fail("gateway_response_contract_unproven"); }
};

// Internal host transport primitive; deliberately absent from package exports,
// CLI and Runtime input. Possession of a socket or rehearsal budget is not real
// billing authorization. The approved host coordinator must perform that gate
// and durable dispatch before invoking this layer with a decrypted credential.
export class GatewayHttpTransport {
  private readonly prepared = new WeakMap<PreparedGatewayHttpRequest, { body: Buffer; consumed: boolean }>();
  private readonly conversations = new WeakMap<PreparedGatewayConversationRequest, { body: Buffer; consumed: boolean; contract?: GatewayConversationCacheContract; parse?: (bytes: Buffer, key: string) => GatewayConversationResponse }>();
  private readonly agents = new WeakMap<PreparedDedicatedAgentRequest,{body:Buffer;consumed:boolean}>();
  constructor(private readonly boundary: GatewayNetworkBoundary|LoopbackGatewayNetworkBoundary) {}
  prepareAgent(request:ReturnType<typeof parseAgentRuntimeModelRequest>,profile:DedicatedAgentProfile,prior:DedicatedAgentReply[]) {
    const value=prepareDedicatedAgentRequest(request,profile,prior);this.agents.set(value,{body:Buffer.from(value.body),consumed:false});return value;
  }
  async sendAgentOriginal(prepared:PreparedDedicatedAgentRequest,connection:GatewayTlsConnection|LoopbackGatewayConnection,key:string,deadlineMs=8000,signal?:AbortSignal) {
    const owned=this.agents.get(prepared);if(!owned||owned.consumed)fail("gateway_http_request_unowned");
    return this.exchange(owned,connection,key,deadlineMs,signal,"application/json",bytes=>({parsed:parseDedicatedAgentResponse(bytes,prepared,key),bytes:Buffer.from(bytes)}),true);
  }
  prepare(input: unknown): PreparedGatewayHttpRequest {
    if (!fields(input, ["request_id", "messages", "input_tokens", "max_output_tokens"]) || typeof input.request_id !== "string" || !uuid.test(input.request_id) ||
      !integer(input.input_tokens, 1, 1048576) || !integer(input.max_output_tokens, 1, 131072) || !Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 32)
      fail("invalid_gateway_http_request");
    let size = 0;
    const messages = input.messages.map((message: unknown) => {
      if (!fields(message, ["role", "content"]) || typeof message.role !== "string" || !["system", "user", "assistant"].includes(message.role) || !text(message.content, GATEWAY_HTTP_REQUEST_BYTES)) fail("invalid_gateway_http_request");
      size += Buffer.byteLength(message.content); if (size > GATEWAY_HTTP_REQUEST_BYTES) fail("gateway_request_limit");
      return { role: message.role, content: message.content };
    });
    const body = Buffer.from(JSON.stringify({ model: "glm-5.3", request_id: input.request_id, messages, max_tokens: input.max_output_tokens, stream: false, n: 1 }));
    if (body.length > GATEWAY_HTTP_REQUEST_BYTES) fail("gateway_request_limit");
    const prepared = Object.freeze({ request_id: input.request_id, input_digest: digest(body).value, input_tokens: input.input_tokens, output_tokens: input.max_output_tokens });
    this.prepared.set(prepared, { body, consumed: false }); return prepared;
  }
  prepareConversation(input: unknown): PreparedGatewayConversationRequest {
    const { body, tools, prior_call_ids, prepared } = prepareGatewayConversation(input);
    this.conversations.set(prepared, { body, consumed: false, contract: createGatewayConversationCacheContract(prepared, tools, prior_call_ids),
      parse: (bytes, key) => parseGatewayConversation(bytes, prepared, tools, prior_call_ids, key) }); return prepared;
  }
  conversationCacheContract(prepared: PreparedGatewayConversationRequest, apiKey: string): GatewayConversationCacheContract {
    const owned = this.conversations.get(prepared);
    if (!owned || owned.consumed || !owned.contract) fail("gateway_http_request_unowned");
    if (typeof apiKey !== "string" || !/^[A-Za-z0-9._-]{8,512}$/.test(apiKey)) fail("invalid_gateway_http_credential");
    if (owned.body.includes(Buffer.from(apiKey))) fail("gateway_credential_in_request");
    // Check nested argument JSON before the host persists any minimal contract.
    const body = parseGatewayJson(owned.body.toString()) as { messages: { tool_calls?: { function: { arguments: string } }[] }[] };
    for (const message of body.messages) for (const call of message.tool_calls ?? []) if (JSON.stringify(parseGatewayJson(call.function.arguments)).includes(apiKey)) fail("gateway_credential_in_request");
    return owned.contract;
  }
  conversationOriginalInput(prepared: PreparedGatewayConversationRequest, apiKey: string): unknown {
    // Guard credentials before even reserving/persisting original input bytes.
    this.conversationCacheContract(prepared, apiKey);
    const body = parseGatewayJson(this.conversations.get(prepared)!.body.toString()) as Record<string, unknown>;
    return { request_id: prepared.request_id, messages: body.messages, tools: body.tools ?? [], response_mode: prepared.response_mode,
      input_tokens: prepared.input_tokens, max_output_tokens: prepared.output_tokens };
  }
  async sendConversationOriginal(prepared: PreparedGatewayConversationRequest, connection: GatewayTlsConnection, apiKey: string, deadlineMs = 8000, signal?: AbortSignal) {
    const owned = this.conversations.get(prepared);
    if (!owned || owned.consumed || !owned.parse) fail("gateway_http_request_unowned");
    const parse = owned.parse;
    try { return await this.exchange(owned, connection, apiKey, deadlineMs, signal, prepared.response_mode === "sse" ? "text/event-stream" : "application/json",
      bytes => { const response = parse(bytes, apiKey); return { response, bytes: Buffer.from(bytes) }; }); }
    finally { if (owned.consumed) { delete owned.parse; delete owned.contract; } }
  }
  async sendConversation(prepared: PreparedGatewayConversationRequest, connection: GatewayTlsConnection, apiKey: string, deadlineMs = 8000, signal?: AbortSignal): Promise<GatewayConversationResponse> {
    const owned = this.conversations.get(prepared);
    if (!owned || owned.consumed || !owned.parse) fail("gateway_http_request_unowned");
    const parse = owned.parse;
    try { return await this.exchange(owned, connection, apiKey, deadlineMs, signal, prepared.response_mode === "sse" ? "text/event-stream" : "application/json", bytes => parse(bytes, apiKey)); }
    finally { if (owned.consumed) { delete owned.parse; delete owned.contract; } }
  }
  async send(prepared: PreparedGatewayHttpRequest, connection: GatewayTlsConnection, apiKey: string, deadlineMs = 8000, signal?: AbortSignal): Promise<GatewayHttpResponse> {
    const owned = this.prepared.get(prepared);
    if (!owned || owned.consumed) fail("gateway_http_request_unowned");
    return this.exchange(owned, connection, apiKey, deadlineMs, signal, "application/json", bytes => parseResponse(bytes, prepared, apiKey));
  }
  private async exchange<Response>(owned: { body: Buffer; consumed: boolean }, connection: GatewayTlsConnection|LoopbackGatewayConnection, apiKey: string, deadlineMs: number, signal: AbortSignal | undefined,
    mediaType: "application/json" | "text/event-stream", parse: (bytes: Buffer) => Response,allowLoopback=false): Promise<Response> {
    const local=this.boundary instanceof LoopbackGatewayNetworkBoundary?this.boundary:undefined;
    if(local&&!allowLoopback)fail('gateway_loopback_agent_only');
    if (typeof apiKey !== "string" || !(local?/^[A-Za-z0-9._-]{1,512}$/:/^[A-Za-z0-9._-]{8,512}$/).test(apiKey)) fail("invalid_gateway_http_credential");
    if (owned.body.includes(Buffer.from(apiKey))) fail("gateway_credential_in_request");
    if (!integer(deadlineMs, 25, 30000)) fail("invalid_gateway_http_deadline");
    if (signal?.aborted) fail("gateway_http_aborted");
    const socket = this.boundary instanceof GatewayNetworkBoundary?this.boundary.consumeHttpConnection(connection as GatewayTlsConnection):this.boundary.consumeHttpConnection(connection as LoopbackGatewayConnection); owned.consumed = true;
    // Explicit per-operation agent, with no proxyEnv and no default dial path.
    const agent:HttpAgent = local?new HttpAgent({keepAlive:false,maxSockets:1,maxTotalSockets:1,proxyEnv:{}}):new Agent({ keepAlive: false, maxSockets: 1, maxTotalSockets: 1, maxCachedSessions: 0 });
    let handedOff = false;
    agent.createConnection = () => {
      if (handedOff || socket.destroyed) fail("gateway_http_reconnect_denied");
      handedOff = true; return socket;
    };
    return new Promise((resolve, reject) => {
      let settled = false, upstream: ClientRequest | undefined, response: IncomingMessage | undefined, size = 0;
      const expires = performance.now() + deadlineMs;
      const chunks: Buffer[] = [];
      const finish = (reason?: string, result?: Response) => {
        if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel);
        response?.destroy(); upstream?.destroy(); socket.destroy(); agent.destroy(); chunks.length = 0;
        owned.body = Buffer.alloc(0);
        if (!reason && signal?.aborted) reason = "gateway_http_aborted";
        if (!reason && performance.now() >= expires) reason = "gateway_http_deadline_exhausted";
        if (reason) reject(new RuntimeAdapterError(reason)); else resolve(result!);
      };
      const cancel = () => finish("gateway_http_aborted"), timer = setTimeout(() => finish("gateway_http_deadline_exhausted"), deadlineMs);
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        upstream = (local?httpRequest:httpsRequest)({ hostname: this.boundary.host, port: local?.port??443, path: this.boundary.path, method: "POST", agent,
          maxHeaderSize: GATEWAY_HTTP_HEADER_BYTES, insecureHTTPParser: false, joinDuplicateHeaders: false,
          headers: { host: local?`${local.host}:${local.port}`:this.boundary.host, "content-type": "application/json", accept: mediaType, "accept-encoding": "identity",
            "content-length": owned.body.length, connection: "close", authorization: `Bearer ${apiKey}` } }, incoming => {
          response = incoming; if (settled) { incoming.destroy(); return; }
          const distinct = incoming.headersDistinct, contentType = distinct["content-type"], length = distinct["content-length"], transfer = distinct["transfer-encoding"];
          const typeMatches = mediaType === "application/json" ? /^application\/json(?:;\s*charset=utf-8)?$/i : /^text\/event-stream(?:;\s*charset=utf-8)?$/i;
          if (incoming.statusCode !== 200 || contentType?.length !== 1 || !typeMatches.test(contentType[0]!) || distinct["content-encoding"] || distinct["location"] ||
            (length && (length.length !== 1 || !/^(?:0|[1-9][0-9]*)$/.test(length[0]!))) || (transfer && (transfer.length !== 1 || transfer[0]?.toLowerCase() !== "chunked")) || (length && transfer))
            { finish("gateway_http_response_denied"); return; }
          if (length && Number(length[0]) > GATEWAY_HTTP_RESPONSE_BYTES) { finish("gateway_response_limit"); return; }
          incoming.on("data", (chunk: Buffer) => {
            size += chunk.length; if (size > GATEWAY_HTTP_RESPONSE_BYTES) finish("gateway_response_limit"); else chunks.push(chunk);
          });
          incoming.on("error", () => finish("gateway_http_response_incomplete"));
          incoming.on("close", () => { if (!incoming.complete) finish("gateway_http_response_incomplete"); });
          incoming.on("end", () => {
            if (settled) return;
            if (!incoming.complete || incoming.rawTrailers.length || (length && size !== Number(length[0]))) { finish("gateway_http_response_incomplete"); return; }
            try { finish(undefined, parse(Buffer.concat(chunks, size))); }
            catch (error) { finish(error instanceof RuntimeAdapterError ? error.reason : "gateway_response_contract_unproven"); }
          });
        });
        upstream.on("socket", actual => { if (actual !== socket) finish("gateway_http_socket_changed"); });
        upstream.on("error", () => finish("gateway_http_upstream_unproven"));
        upstream.on("upgrade", (_response, upgraded) => { upgraded.destroy(); finish("gateway_http_response_denied"); });
        upstream.on("information", () => finish("gateway_http_response_denied"));
        upstream.on("close", () => { if (!settled && !response) finish("gateway_http_response_incomplete"); });
        if (signal?.aborted) cancel(); else if (performance.now() >= expires) finish("gateway_http_deadline_exhausted"); else upstream.end(owned.body);
      } catch { finish("gateway_http_upstream_unproven"); }
    });
  }
}
