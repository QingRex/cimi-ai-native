import { request as httpsRequest } from "node:https";
import { TextDecoder } from "node:util";
import { GatewayBudgetLedger, type GatewayBudgetSnapshot } from "./gateway-budget.js";
import { bytesAt, digest, RuntimeAdapterError } from "./files.js";
import { assessDedicatedGatewayBilling } from "./gateway-billing.js";

export const SYNTHETIC_GATEWAY_HOST = "cimiloop-gateway.test";
export const SYNTHETIC_GATEWAY_PATH = "/v1/chat/completions";
export const SYNTHETIC_GATEWAY_MODEL = "cimiloop-synthetic-text";
export const SYNTHETIC_GATEWAY_KEY = "cimiloop-synthetic-gateway-key";
export const GATEWAY_REQUEST_BYTES = 16384;
export const GATEWAY_RESPONSE_BYTES = 16384;
export const GATEWAY_OUTPUT_TOKENS = 128;
// Synthetic tariff only: two micro TEST units per input byte upper bound,
// five per output token. No conversion to USD and no real provider invoice.
export const GATEWAY_RESERVATION = GATEWAY_REQUEST_BYTES * 2 + GATEWAY_OUTPUT_TOKENS * 5;
export const syntheticGatewayPolicyDigest = (port: number, certificateDigest: string, deadlineMs: number): string => digest(JSON.stringify({ format: "cimiloop/synthetic-gateway-policy/1.0.0", host: SYNTHETIC_GATEWAY_HOST, port, path: SYNTHETIC_GATEWAY_PATH,
  model: SYNTHETIC_GATEWAY_MODEL, method: "POST", pinned_address: "127.0.0.1", tls_certificate_digest: certificateDigest,
  maximum_request_bytes: GATEWAY_REQUEST_BYTES, maximum_response_bytes: GATEWAY_RESPONSE_BYTES, maximum_output_tokens: GATEWAY_OUTPUT_TOKENS,
  deadline_ms: deadlineMs, reservation_micro_units: GATEWAY_RESERVATION, currency: "TEST", redirects: false, retries: 0 })).value;
export interface GatewayRequest {
  format: "cimiloop/model-gateway/1.0.0"; request_id: string; operation_key: string;
  model_id: typeof SYNTHETIC_GATEWAY_MODEL;
  messages: { role: "system" | "user" | "assistant"; content: string }[]; max_output_tokens: number;
}
export interface GatewayResponse {
  format: "cimiloop/model-gateway/1.0.0"; request_id: string; request_digest: string;
  synthetic: true; text: string;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  held_micro_units: number; currency: "TEST";
}
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === keys.sort().join(",");
const safeInteger = (value: unknown, minimum: number, maximum: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
export const parseGatewayRequest = (input: unknown): GatewayRequest => {
  if (!exact(input, ["format", "request_id", "operation_key", "model_id", "messages", "max_output_tokens"]) ||
    input.format !== "cimiloop/model-gateway/1.0.0" || typeof input.request_id !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input.request_id) ||
    typeof input.operation_key !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(input.operation_key) || input.model_id !== SYNTHETIC_GATEWAY_MODEL ||
    !safeInteger(input.max_output_tokens, 1, GATEWAY_OUTPUT_TOKENS) || !Array.isArray(input.messages) || !input.messages.length || input.messages.length > 32 ||
    input.messages.some(m => !exact(m, ["role", "content"]) || !["system", "user", "assistant"].includes(String(m.role)) || typeof m.content !== "string") ||
    Buffer.byteLength(JSON.stringify(input)) > GATEWAY_REQUEST_BYTES) throw new RuntimeAdapterError("gateway_request_denied");
  // Never retain a caller-mutable request across asynchronous credential/IO work.
  return JSON.parse(JSON.stringify(input)) as GatewayRequest;
};

export { isPublicGatewayAddress } from "./gateway-address.js";

// The actual provider has no approved monetary upper-bound profile yet. Fail
// before credential decryption, ledger creation, DNS or a network connection.
export const requireDedicatedGatewayBilling = (connection: unknown): never => {
  assessDedicatedGatewayBilling(connection);
  throw new RuntimeAdapterError("gateway_reliable_billing_profile_unavailable");
};

export class SyntheticModelGateway {
  readonly policyDigest: string;
  private readonly ledger: GatewayBudgetLedger;
  private readonly ca: Buffer;
  private readonly port: number;
  private readonly deadlineMs: number;
  private readonly active = new Set<AbortController>();
  private closing = false;
  constructor(options: { ledgerPath: string; budgetKey: string; maximumMicroUnits: number; port: number; certificatePath: string; deadlineMs?: number }) {
    if (!safeInteger(options.port, 1, 65535) || !safeInteger(options.deadlineMs ?? 5000, 25, 30000)) throw new RuntimeAdapterError("invalid_synthetic_gateway_options");
    this.ca = bytesAt(options.certificatePath, 16384); this.port = options.port; this.deadlineMs = options.deadlineMs ?? 5000;
    this.policyDigest = syntheticGatewayPolicyDigest(this.port, digest(this.ca).value, this.deadlineMs);
    this.ledger = new GatewayBudgetLedger(options.ledgerPath, { budget_key: options.budgetKey, policy_digest: this.policyDigest, currency: "TEST",
      maximum_micro_units: options.maximumMicroUnits, reservation_micro_units: GATEWAY_RESERVATION });
  }
  async execute(input: unknown, signal?: AbortSignal): Promise<{ response: GatewayResponse; replay: boolean }> {
    if (this.closing || signal?.aborted) throw new RuntimeAdapterError("gateway_aborted");
    const request = parseGatewayRequest(input), inputDigest = digest(JSON.stringify(request)).value;
    const claim = this.ledger.reserve(request.request_id, inputDigest);
    if (claim.replay !== undefined) {
      if (digest(claim.replay).value !== claim.response_digest) throw new RuntimeAdapterError("gateway_cached_response_corrupt");
      try {
        const response: unknown = JSON.parse(claim.replay);
        if (!exact(response, ["format", "request_id", "request_digest", "synthetic", "text", "usage", "held_micro_units", "currency"]) ||
          response.format !== "cimiloop/model-gateway/1.0.0" || response.request_id !== request.request_id || response.request_digest !== inputDigest || response.synthetic !== true ||
          typeof response.text !== "string" || response.currency !== "TEST" || response.held_micro_units !== GATEWAY_RESERVATION ||
          !exact(response.usage, ["input_tokens", "output_tokens", "total_tokens"]) || !safeInteger(response.usage.input_tokens, 0, GATEWAY_REQUEST_BYTES) ||
          !safeInteger(response.usage.output_tokens, 0, request.max_output_tokens) || response.usage.total_tokens !== response.usage.input_tokens + response.usage.output_tokens)
          throw new RuntimeAdapterError("gateway_cached_response_corrupt");
        return { response: response as unknown as GatewayResponse, replay: true };
      } catch { throw new RuntimeAdapterError("gateway_cached_response_corrupt"); }
    }
    const abort = new AbortController(); this.active.add(abort);
    const cancel = () => abort.abort(); signal?.addEventListener("abort", cancel, { once: true });
    try {
      // The dispatch claim is durably committed before any upstream operation.
      this.ledger.dispatch(request.request_id);
      if (signal?.aborted) abort.abort();
      const upstream = await this.forward(request, abort.signal);
      const response: GatewayResponse = { format: "cimiloop/model-gateway/1.0.0", request_id: request.request_id, request_digest: inputDigest,
        synthetic: true, ...upstream, held_micro_units: GATEWAY_RESERVATION, currency: "TEST" };
      const serialized = JSON.stringify(response); this.ledger.complete(request.request_id, serialized, digest(serialized).value);
      return { response, replay: false };
    } catch (error) {
      const reason = error instanceof RuntimeAdapterError ? error.reason : "gateway_upstream_unproven";
      this.ledger.unknown(request.request_id, reason, reason === "gateway_usage_bound_exceeded");
      throw new RuntimeAdapterError(reason);
    } finally { signal?.removeEventListener("abort", cancel); this.active.delete(abort); }
  }
  private forward(request: GatewayRequest, signal: AbortSignal): Promise<Pick<GatewayResponse, "text" | "usage">> {
    const body = Buffer.from(JSON.stringify({ model: SYNTHETIC_GATEWAY_MODEL, messages: request.messages, max_tokens: request.max_output_tokens, stream: false, n: 1 }));
    return new Promise((resolve, reject) => {
      let settled = false; let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (reason?: string, result?: Pick<GatewayResponse, "text" | "usage">) => {
        if (settled) return; settled = true; if (timer) clearTimeout(timer); signal.removeEventListener("abort", cancel);
        if (reason) { upstream.destroy(); reject(new RuntimeAdapterError(reason)); } else resolve(result!);
      };
      // This constructor has exactly one reserved test origin and one address.
      // No URL, header, proxy, agent, trust override or lookup enters via input.
      const upstream = httpsRequest({ hostname: SYNTHETIC_GATEWAY_HOST, port: this.port, path: SYNTHETIC_GATEWAY_PATH, method: "POST", agent: false,
        servername: SYNTHETIC_GATEWAY_HOST, rejectUnauthorized: true, ca: this.ca, family: 4,
        lookup: (_hostname, _options, callback) => callback(null, "127.0.0.1", 4),
        headers: { "content-type": "application/json", "content-length": body.length, authorization: `Bearer ${SYNTHETIC_GATEWAY_KEY}` }
      }, response => {
        const contentType = response.headers["content-type"];
        if (response.statusCode !== 200 || typeof contentType !== "string" || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType) || response.headers["content-encoding"])
          { response.destroy(); finish("gateway_upstream_response_denied"); return; }
        const length = response.headers["content-length"];
        if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > GATEWAY_RESPONSE_BYTES)) { response.destroy(); finish("gateway_response_limit"); return; }
        let size = 0; const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > GATEWAY_RESPONSE_BYTES) { response.destroy(); finish("gateway_response_limit"); } else chunks.push(chunk); });
        response.on("error", () => finish("gateway_upstream_unproven"));
        response.on("aborted", () => finish("gateway_upstream_unproven"));
        response.on("end", () => {
          if (settled) return;
          try {
            const bytes = Buffer.concat(chunks);
            if (bytes.includes(Buffer.from(SYNTHETIC_GATEWAY_KEY))) throw new RuntimeAdapterError("gateway_credential_disclosure_blocked");
            const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
            if (!exact(value, ["id", "object", "model", "choices", "usage"]) || typeof value.id !== "string" || value.id.length > 128 || value.object !== "chat.completion" || value.model !== SYNTHETIC_GATEWAY_MODEL ||
              !Array.isArray(value.choices) || value.choices.length !== 1 || !exact(value.choices[0], ["index", "message", "finish_reason"]) || value.choices[0].index !== 0 || value.choices[0].finish_reason !== "stop" ||
              !exact(value.choices[0].message, ["role", "content"]) || value.choices[0].message.role !== "assistant" || typeof value.choices[0].message.content !== "string" ||
              !exact(value.usage, ["prompt_tokens", "completion_tokens", "total_tokens"]) || !safeInteger(value.usage.prompt_tokens, 0, 1_000_000) ||
              !safeInteger(value.usage.completion_tokens, 0, 1_000_000) || value.usage.total_tokens !== value.usage.prompt_tokens + value.usage.completion_tokens)
              throw new RuntimeAdapterError("gateway_upstream_usage_unproven");
            if (value.usage.prompt_tokens > GATEWAY_REQUEST_BYTES || value.usage.completion_tokens > request.max_output_tokens)
              throw new RuntimeAdapterError("gateway_usage_bound_exceeded");
            finish(undefined, { text: value.choices[0].message.content, usage: { input_tokens: value.usage.prompt_tokens, output_tokens: value.usage.completion_tokens, total_tokens: value.usage.total_tokens as number } });
          } catch (error) { finish(error instanceof RuntimeAdapterError ? error.reason : "gateway_upstream_usage_unproven"); }
        });
      });
      const cancel = () => finish("gateway_aborted");
      upstream.on("error", () => finish("gateway_upstream_unproven"));
      signal.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => finish("gateway_deadline_exhausted"), this.deadlineMs);
      if (signal.aborted) cancel(); else upstream.end(body);
    });
  }
  snapshot(): GatewayBudgetSnapshot { return this.ledger.snapshot(); }
  async close(): Promise<void> {
    this.closing = true; for (const abort of this.active) abort.abort();
    while (this.active.size) await new Promise(resolve => setTimeout(resolve, 10));
    this.ledger.close();
  }
}
