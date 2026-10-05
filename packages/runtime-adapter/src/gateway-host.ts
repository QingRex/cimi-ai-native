import { performance } from "node:perf_hooks";
import { GatewayHttpTransport, type GatewayHttpResponse } from "./gateway-http.js";
import { GatewayNetworkBoundary, type GatewayTlsConnection } from "./gateway-network.js";
import { GatewayCreditLedger, type CreditReceipt } from "./gateway-credit.js";
import { requireDedicatedGatewayBilling } from "./model-gateway.js";
import { RuntimeAdapterError } from "./files.js";

export const GATEWAY_HOST_REHEARSAL_KEY = "CIMILOOP_HTTP_PUBLIC_FIXTURE_KEY";
type Phase = "dispatch_committed" | "response_validated" | "completion_committed";
interface Dependencies {
  ledger: GatewayCreditLedger; boundary: GatewayNetworkBoundary; deadlineMs?: number;
  // Trusted host test fault injection only; no serialized input chooses this.
  phase?: (phase: Phase) => void | Promise<void>;
}
export interface GatewayHostRehearsalResult {
  scope: "host_gateway_rehearsal"; response: GatewayHttpResponse; receipt: CreditReceipt; replay: boolean;
  actual_cost_known: false; billing_admission_ready: false; formal_execution_enabled: false;
}
// A real provider factory stays closed before any side effect. The independently
// testable rehearsal coordinator below has only a hardcoded public fixture key.
export const createDedicatedGatewayHost = (connection: unknown): never => requireDedicatedGatewayBilling(connection);
const releaseConnection = (connection?: GatewayTlsConnection): Promise<void> => {
  if (!connection || connection.socket.closed) return Promise.resolve();
  const socket = connection.socket;
  return new Promise((resolve, reject) => {
    const finish = (reason?: string) => { clearTimeout(timer); socket.removeListener("close", closed); if (reason) reject(new RuntimeAdapterError(reason)); else resolve(); };
    const closed = () => finish(), timer = setTimeout(() => finish("host_gateway_socket_close_unproven"), 1000);
    socket.once("close", closed); socket.destroy(); if (socket.closed) closed();
  });
};

export class GatewayHostRehearsal {
  private readonly transport: GatewayHttpTransport;
  private readonly ledger: GatewayCreditLedger;
  private readonly boundary: GatewayNetworkBoundary;
  private readonly deadlineMs: number;
  private readonly phase: Dependencies["phase"];
  private readonly active = new Set<{ abort: AbortController; done: Promise<void> }>();
  private closing = false;
  private closePromise: Promise<void> | undefined;
  constructor(dependencies: Dependencies) {
    if (!Number.isSafeInteger(dependencies.deadlineMs ?? 8000) || (dependencies.deadlineMs ?? 8000) < 100 || (dependencies.deadlineMs ?? 8000) > 30000) throw new RuntimeAdapterError("invalid_host_gateway_deadline");
    if (dependencies.ledger.storageFormat !== 2) throw new RuntimeAdapterError("host_gateway_cache_required");
    dependencies.ledger.cacheSnapshot();
    this.ledger = dependencies.ledger; this.boundary = dependencies.boundary; this.transport = new GatewayHttpTransport(this.boundary);
    this.deadlineMs = dependencies.deadlineMs ?? 8000; this.phase = dependencies.phase;
  }
  async execute(input: unknown, budgetKey: string, signal?: AbortSignal): Promise<GatewayHostRehearsalResult> {
    if (this.closing || signal?.aborted) throw new RuntimeAdapterError("host_gateway_aborted");
    const expires = performance.now() + this.deadlineMs, prepared = this.transport.prepare(input);
    const claim = this.ledger.reserve({ request_id: prepared.request_id, budget_key: budgetKey, input_digest: prepared.input_digest, input_tokens: prepared.input_tokens, output_tokens: prepared.output_tokens });
    const result = (response: GatewayHttpResponse, receipt: CreditReceipt, replay: boolean): GatewayHostRehearsalResult => Object.freeze({
      scope: "host_gateway_rehearsal", response, receipt, replay, actual_cost_known: false, billing_admission_ready: false, formal_execution_enabled: false });
    if (claim.replay) {
      if (!claim.cached_response) throw new RuntimeAdapterError("host_gateway_cached_response_unproven");
      if (signal?.aborted) throw new RuntimeAdapterError("host_gateway_aborted");
      if (performance.now() >= expires) throw new RuntimeAdapterError("host_gateway_deadline_exhausted");
      return result(claim.cached_response, claim.replay, true);
    }
    const control = new AbortController(); let done!: () => void;
    const operation = { abort: control, done: new Promise<void>(resolve => { done = resolve; }) }; this.active.add(operation);
    let connection: GatewayTlsConnection | undefined, timedOut = false;
    const cancel = () => control.abort(), timer = setTimeout(() => { timedOut = true; control.abort(); }, Math.max(0, expires - performance.now()));
    signal?.addEventListener("abort", cancel, { once: true });
    const remaining = (phaseBudget = true) => {
      if (timedOut || performance.now() >= expires) throw new RuntimeAdapterError("host_gateway_deadline_exhausted");
      if (this.closing || signal?.aborted || control.signal.aborted) throw new RuntimeAdapterError("host_gateway_aborted");
      const value = Math.floor(expires - performance.now());
      if (value < (phaseBudget ? 25 : 1)) throw new RuntimeAdapterError("host_gateway_deadline_exhausted"); return value;
    };
    const phase = (name: Phase): Promise<void> => new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => { if (settled) return; settled = true; control.signal.removeEventListener("abort", aborted); if (error) reject(error); else resolve(); };
      const aborted = () => finish(new RuntimeAdapterError("host_gateway_aborted"));
      control.signal.addEventListener("abort", aborted, { once: true });
      if (control.signal.aborted) aborted(); else Promise.resolve().then(() => { if (control.signal.aborted) throw new RuntimeAdapterError("host_gateway_aborted"); return this.phase?.(name); }).then(() => finish(), error => finish(error));
    });
    try {
      remaining(); this.ledger.dispatch(claim.permit); await phase("dispatch_committed");
      const pin = await this.boundary.resolve(remaining(), control.signal);
      connection = await this.boundary.connect(pin, remaining(), control.signal);
      const response = await this.transport.send(prepared, connection, GATEWAY_HOST_REHEARSAL_KEY, remaining(), control.signal);
      await releaseConnection(connection); connection = undefined;
      await phase("response_validated"); remaining();
      const receipt = this.ledger.completeCached(claim.permit, response, () => { remaining(false); }); await phase("completion_committed"); remaining(false);
      return result(response, receipt, false);
    } catch (error) {
      const deadlineFailure = error instanceof RuntimeAdapterError && ["gateway_dns_deadline_exhausted", "gateway_tls_deadline_exhausted", "gateway_http_deadline_exhausted"].includes(error.reason);
      const reason = timedOut || performance.now() >= expires || deadlineFailure ? "host_gateway_deadline_exhausted" : this.closing || signal?.aborted ? "host_gateway_aborted"
        : error instanceof RuntimeAdapterError && /^(?:host_gateway|gateway|credit|coding_plan)_[a-z_]{1,80}$/.test(error.reason) ? error.reason : "host_gateway_outcome_unproven";
      // A bound violation is still a violation if cancellation arrived too.
      const violation = error instanceof RuntimeAdapterError && error.reason === "gateway_usage_bound_exceeded";
      try { this.ledger.unknown(claim.permit, violation ? "credit_usage_bound_exceeded" : "credit_host_outcome_unproven", violation); }
      catch { throw new RuntimeAdapterError("host_gateway_state_unproven"); }
      throw new RuntimeAdapterError(reason);
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", cancel); control.abort();
      try { await releaseConnection(connection); } finally { this.active.delete(operation); done(); }
    }
  }
  close(): Promise<void> {
    if (!this.closePromise) {
      this.closing = true; for (const operation of this.active) operation.abort.abort();
      this.closePromise = Promise.all([...this.active].map(operation => operation.done)).then(() => { this.ledger.close(); });
    }
    return this.closePromise;
  }
}
