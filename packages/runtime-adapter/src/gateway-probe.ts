import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { compileValidator, RuntimeGatewayProbeResultSchema, type RuntimeGatewayProbeResult } from "@cimiloop/protocol/v2";
import { GatewayBudgetLedger } from "./gateway-budget.js";
import { SyntheticModelGateway, SYNTHETIC_GATEWAY_MODEL, GATEWAY_RESERVATION, requireDedicatedGatewayBilling, type GatewayRequest } from "./model-gateway.js";
import { startGatewayFixture, gatewayFixtureCertificate } from "./gateway-fixture.js";
import { directory, atomicJson, digest, bytesAt, rawReference, RuntimeAdapterError } from "./files.js";

const validate = compileValidator<RuntimeGatewayProbeResult>(RuntimeGatewayProbeResultSchema);
export const parseRuntimeGatewayProbe = (input: unknown): RuntimeGatewayProbeResult => {
  const result = validate(input);
  const expected = ["fixed_https_route", "durable_replay_and_conflict", "input_rejected_before_reservation", "concurrent_budget_cap", "redirect_retains_reservation", "malformed_retains_reservation",
    "usage_overflow_retains_reservation", "deadline_retains_reservation", "abort_retains_uncertain_reservation", "untrusted_tls_peer_no_http", "ended_owner_never_resends", "actual_provider_billing_gate_closed"];
  if (new Set(result.checks.map(c => c.name)).size !== result.checks.length || result.gateway_probe_passed !== result.checks.every(c => c.passed) ||
    result.checks.map(c => c.name).sort().join(",") !== expected.sort().join(",") ||
    result.budgets.some(b => b.snapshot.held_micro_units > b.snapshot.maximum_micro_units || b.snapshot.reserved + b.snapshot.dispatching > 0 ||
      b.snapshot.held_micro_units !== (b.snapshot.completed + b.snapshot.unknown) * GATEWAY_RESERVATION))
    throw new RuntimeAdapterError("gateway_probe_observation_invalid");
  return result;
};
const request = (): GatewayRequest => ({ format: "cimiloop/model-gateway/1.0.0", request_id: randomUUID(), operation_key: "gateway_fixture", model_id: SYNTHETIC_GATEWAY_MODEL,
  messages: [{ role: "user", content: "Synthetic gateway input" }], max_output_tokens: 16 });
const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  try { await promise; return "unexpected_success"; } catch (error) { return error instanceof RuntimeAdapterError ? error.reason : "unexpected_failure"; }
};

export const runSyntheticGatewayProbe = async (options: { root: string }): Promise<RuntimeGatewayProbeResult> => {
  const root = directory(options.root), run = directory(join(root, "runs", randomUUID())), server = await startGatewayFixture();
  const checks: RuntimeGatewayProbeResult["checks"] = [], budgets: RuntimeGatewayProbeResult["budgets"] = [];
  const gateways: SyntheticModelGateway[] = [];
  let extraRequests = 0;
  const make = (name: string, units = 1, deadlineMs = 5000, port = server.port) => {
    const gateway = new SyntheticModelGateway({ ledgerPath: join(run, `${name}.sqlite`), budgetKey: name, maximumMicroUnits: GATEWAY_RESERVATION * units,
      port, certificatePath: gatewayFixtureCertificate, deadlineMs }); gateways.push(gateway); return gateway;
  };
  const capture = (name: string, gateway: SyntheticModelGateway) => budgets.push({ case_name: name, policy_digest: { algorithm: "sha256", value: gateway.policyDigest }, snapshot: gateway.snapshot() });
  const check = async (name: string, body: () => Promise<boolean>) => {
    try { const passed = await body(); checks.push({ name, passed, reason: passed ? "host_gateway_observed" : "expected_observation_missing" }); }
    catch { checks.push({ name, passed: false, reason: "gateway_check_incomplete" }); }
  };
  try {
    const completed = make("completed"), input = request();
    await check("fixed_https_route", async () => {
      const { response } = await completed.execute(input), observed = server.observations[0];
      return response.text === "CIMILOOP_GATEWAY_OK" && !!observed && observed.path === "/v1/chat/completions" && observed.method === "POST" &&
        observed.host === `cimiloop-gateway.test:${server.port}` && observed.model === SYNTHETIC_GATEWAY_MODEL && observed.output_limit === 16 && observed.authenticated && !observed.stream && observed.n === 1;
    });
    await check("durable_replay_and_conflict", async () => {
      const before = server.observations.length, reopened = make("completed");
      const replay = await reopened.execute(input), conflict = await reasonOf(completed.execute({ ...input, max_output_tokens: 15 }));
      return replay.replay && conflict === "gateway_request_id_conflict" && server.observations.length === before;
    }); capture("completed", completed);
    const denied = make("denied");
    await check("input_rejected_before_reservation", async () => {
      const before = server.observations.length;
      for (const value of [{ ...request(), url: "https://example.com" }, { ...request(), model_id: "unapproved" }, { ...request(), max_output_tokens: 129 }, { ...request(), tools: [] }])
        if (await reasonOf(denied.execute(value)) !== "gateway_request_denied") return false;
      return denied.snapshot().held_micro_units === 0 && server.observations.length === before;
    }); capture("denied", denied);
    const competing = make("competing"), other = make("competing");
    await check("concurrent_budget_cap", async () => {
      const before = server.observations.length, values = await Promise.allSettled([competing.execute(request()), other.execute(request())]);
      return values.filter(v => v.status === "fulfilled").length === 1 && values.some(v => v.status === "rejected" && v.reason instanceof RuntimeAdapterError && v.reason.reason === "gateway_budget_exhausted") &&
        server.observations.length === before + 1 && competing.snapshot().held_micro_units === GATEWAY_RESERVATION;
    }); capture("competing", competing);
    for (const mode of ["redirect", "malformed", "usage_overflow"] as const) {
      const gateway = make(mode, 2); server.setMode(mode);
      await check(`${mode}_retains_reservation`, async () => {
        const before = server.observations.length, value = request(), reason = await reasonOf(gateway.execute(value));
        const repeat = await reasonOf(gateway.execute(value)), snapshot = gateway.snapshot();
        const blocked = mode !== "usage_overflow" || await reasonOf(gateway.execute(request())) === "gateway_budget_blocked";
        return reason.startsWith("gateway_") && repeat === "gateway_request_outcome_unproven" && snapshot.unknown === 1 && snapshot.held_micro_units === GATEWAY_RESERVATION && blocked && server.observations.length === before + 1;
      }); capture(mode, gateway);
    }
    const timeout = make("timeout", 1, 250); server.setMode("timeout");
    await check("deadline_retains_reservation", async () => await reasonOf(timeout.execute(request())) === "gateway_deadline_exhausted" && timeout.snapshot().unknown === 1);
    capture("timeout", timeout);
    const cancelled = make("cancelled");
    await check("abort_retains_uncertain_reservation", async () => {
      if (await reasonOf(cancelled.execute(request(), AbortSignal.abort())) !== "gateway_aborted" || cancelled.snapshot().held_micro_units !== 0) return false;
      const controller = new AbortController(), pending = cancelled.execute(request(), controller.signal); controller.abort();
      return await reasonOf(pending) === "gateway_aborted" && cancelled.snapshot().unknown === 1;
    }); capture("cancelled", cancelled);
    const untrusted = await startGatewayFixture({ untrusted: true }), tls = make("tls", 1, 5000, untrusted.port);
    try { await check("untrusted_tls_peer_no_http", async () => await reasonOf(tls.execute(request())) === "gateway_upstream_unproven" && untrusted.observations.length === 0 && tls.snapshot().unknown === 1); }
    finally { extraRequests += untrusted.observations.length; await untrusted.close(); } capture("tls", tls);
    await check("ended_owner_never_resends", async () => {
      const p = { budget_key: "ended", policy_digest: "f".repeat(64), currency: "TEST" as const, maximum_micro_units: GATEWAY_RESERVATION, reservation_micro_units: GATEWAY_RESERVATION }, file = join(run, "ended.sqlite"), id = randomUUID();
      const owner = new GatewayBudgetLedger(file, p); owner.reserve(id, "a".repeat(64)); owner.dispatch(id); owner.close();
      const reopened = new GatewayBudgetLedger(file, p);
      try {
        const changed = reopened.reconcileEndedOwner(); let prevented = false;
        try { reopened.reserve(id, "a".repeat(64)); } catch (error) { prevented = error instanceof RuntimeAdapterError && error.reason === "gateway_request_outcome_unproven"; }
        budgets.push({ case_name: "ended", policy_digest: { algorithm: "sha256", value: p.policy_digest }, snapshot: reopened.snapshot() }); return changed === 1 && prevented;
      } finally { reopened.close(); }
    });
    await check("actual_provider_billing_gate_closed", async () => {
      try { requireDedicatedGatewayBilling({ format: "cimiloop/dedicated-model/1.0.0", provider: "zhipuai-coding-plan", model: "zhipuai-coding-plan/glm-5.3",
        credential_file: join(run, "absent-credential.dpapi.json"), credential_digest: { algorithm: "sha256", value: "a".repeat(64) } }); }
      catch (error) { return error instanceof RuntimeAdapterError && error.reason === "gateway_reliable_billing_profile_unavailable"; }
      return false;
    });
  } finally { for (const gateway of gateways) await gateway.close(); await server.close(); }
  const observation = { checks, budgets, requests: server.observations, actual_credentials_read: 0, external_model_requests: 0 };
  atomicJson(join(run, "host-observation.json"), observation);
  const result = parseRuntimeGatewayProbe({ schema_version: "2.0.0", scope: "synthetic_gateway_probe", observed_at: new Date().toISOString(), gateway_probe_passed: checks.every(c => c.passed),
    route: { host: "cimiloop-gateway.test", path: "/v1/chat/completions", model: SYNTHETIC_GATEWAY_MODEL, tls_peer_verified: true, redirects: false, retries: 0,
      certificate_digest: digest(bytesAt(gatewayFixtureCertificate)), max_request_bytes: 16384, max_response_bytes: 16384, max_output_tokens: 128 },
    checks, budgets, synthetic_http_requests: server.observations.length + extraRequests, external_model_requests: 0, actual_credentials_read: 0, cost_known: false, ipc_runtime_connected: false,
    formal_execution_enabled: false, evidence_refs: [rawReference(root, bytesAt(join(run, "host-observation.json")), "gateway_host_observation", "host-observation.json")],
    gaps: ["authenticated_ipc_gateway_bridge", "verified_real_provider_billing_upper_bound", "real_provider_gateway_acceptance", "hard_filesystem_quota", "complete_crash_recovery_acceptance", "formal_task_binding_and_agent_entry"] });
  atomicJson(join(run, "gateway-probe-result.json"), result); atomicJson(join(root, "gateway-probe-result.json"), result); return result;
};
