import { existsSync, readdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import type { ChildProcess } from "node:child_process";
import { compileValidator, RuntimeGatewayBridgeObservationSchema, RuntimeGatewayTransportObservationSchema,
  type Digest, type RuntimeGatewayBridgeObservation, type RuntimeGatewayTransportObservation, type RuntimeExecutionPolicy } from "@cimiloop/protocol/v2";
import { directory, digest, bytesAt, atomicJson, readJson, RuntimeAdapterError } from "./files.js";
import { GatewayBudgetLedger } from "./gateway-budget.js";
import { SyntheticModelGateway, GATEWAY_RESERVATION, parseGatewayRequest, syntheticGatewayPolicyDigest } from "./model-gateway.js";
import { startGatewayFixture, gatewayFixtureCertificate } from "./gateway-fixture.js";
import { nativeControl } from "./native.js";
import { validatePipeAttempts } from "./ipc-observation.js";
import type { OperationRequest, ProbeDriver } from "./operations.js";

export interface GatewayFixturePolicy {
  format: "cimiloop/synthetic-gateway-bridge/1.0.0"; mode: "valid" | "timeout" | "malformed" | "usage_overflow";
  maximum_micro_units: number; certificate_digest: Digest;
}
export const gatewayFixturePolicy = (requests = 8, mode: GatewayFixturePolicy["mode"] = "valid"): GatewayFixturePolicy => ({
  format: "cimiloop/synthetic-gateway-bridge/1.0.0", mode, maximum_micro_units: GATEWAY_RESERVATION * requests, certificate_digest: digest(bytesAt(gatewayFixtureCertificate)) });
export const isGatewayProbeDriver = (driver: ProbeDriver): boolean => ["opencode_gateway_contract_fixture", "native_gateway_contract_fixture"].includes(driver.kind);
export const gatewayProbeModule = (): { path: string; digest: Digest } => {
  const path = fileURLToPath(new URL("../transport/opencode-gateway-probe.mjs", import.meta.url)); return { path, digest: digest(bytesAt(path, 65536)) };
};
export const validateGatewayDriver = (driver: ProbeDriver, policy: RuntimeExecutionPolicy, current = false): void => {
  const fixture = driver.gateway_fixture;
  if (driver.connection || policy.network.mode !== "deny_all" || driver.model !== "cimiloop-gateway/cimiloop-synthetic-text" || !fixture ||
    Object.keys(fixture).sort().join(",") !== "certificate_digest,format,maximum_micro_units,mode" || fixture.format !== "cimiloop/synthetic-gateway-bridge/1.0.0" ||
    !["valid", "timeout", "malformed", "usage_overflow"].includes(fixture.mode) || !Number.isSafeInteger(fixture.maximum_micro_units) ||
    fixture.maximum_micro_units < GATEWAY_RESERVATION || fixture.maximum_micro_units > 8 * GATEWAY_RESERVATION || fixture.maximum_micro_units % GATEWAY_RESERVATION !== 0 ||
    fixture.certificate_digest.algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(fixture.certificate_digest.value) ||
    driver.kind === "opencode_gateway_contract_fixture" && !driver.transport_module) throw new RuntimeAdapterError("invalid_gateway_probe_driver");
  if (driver.transport_module && (driver.transport_module.digest.algorithm !== "sha256" || !/^[a-f0-9]{64}$/.test(driver.transport_module.digest.value))) throw new RuntimeAdapterError("invalid_gateway_probe_driver");
  if (current && (digest(bytesAt(gatewayFixtureCertificate)).value !== fixture.certificate_digest.value || driver.transport_module &&
    (resolve(driver.transport_module.path) !== gatewayProbeModule().path || driver.transport_module.digest.value !== gatewayProbeModule().digest.value))) throw new RuntimeAdapterError("gateway_probe_capsule_changed");
};
interface GatewayOwner {
  format: "cimiloop/gateway-owner/1.0.0"; nonce: string; operation_key: string;
  fixture_config_digest: Digest; gateway_policy_digest: Digest; certificate_digest: Digest;
  port: number; deadline_ms: number; maximum_micro_units: number;
}
export const readGatewayOwner = (path: string, request: OperationRequest): GatewayOwner => {
  const owner = readJson(join(path, "gateway", "owner.json")) as GatewayOwner;
  if (Object.keys(owner).sort().join(",") !== "certificate_digest,deadline_ms,fixture_config_digest,format,gateway_policy_digest,maximum_micro_units,nonce,operation_key,port" ||
    owner.format !== "cimiloop/gateway-owner/1.0.0" || owner.nonce !== request.nonce || owner.operation_key !== request.input.operation_key ||
    owner.fixture_config_digest.value !== digest(JSON.stringify(request.driver.gateway_fixture)).value || owner.maximum_micro_units !== request.driver.gateway_fixture?.maximum_micro_units ||
    owner.certificate_digest.value !== request.driver.gateway_fixture.certificate_digest.value || digest(bytesAt(join(path, "gateway", "cert.pem"))).value !== owner.certificate_digest.value ||
    !Number.isSafeInteger(owner.port) || owner.port < 1 || owner.port > 65535 || owner.deadline_ms !== 8000 ||
    owner.gateway_policy_digest.value !== syntheticGatewayPolicyDigest(owner.port, owner.certificate_digest.value, owner.deadline_ms)) throw new RuntimeAdapterError("gateway_owner_unproven");
  return owner;
};
export const reconcileGatewayBudget = (path: string, request: OperationRequest): void => {
  const owner = readGatewayOwner(path, request), ledger = new GatewayBudgetLedger(join(path, "gateway", "budget.sqlite"), {
    budget_key: request.input.operation_key, policy_digest: owner.gateway_policy_digest.value, currency: "TEST", maximum_micro_units: owner.maximum_micro_units, reservation_micro_units: GATEWAY_RESERVATION });
  try { const changed = ledger.reconcileEndedOwner(); atomicJson(join(path, "gateway-recovery.json"), { nonce: request.nonce, gateway_policy_digest: owner.gateway_policy_digest,
    original_owner_ended: true, reconciled_requests: changed, budget: ledger.snapshot(), restarted_requests: 0, formal_execution_enabled: false }); } finally { ledger.close(); }
};
const parseTransport = compileValidator<RuntimeGatewayTransportObservation>(RuntimeGatewayTransportObservationSchema);
export const parseGatewayTransportObservation = (input: unknown): RuntimeGatewayTransportObservation => {
  const proof = parseTransport(input); validatePipeAttempts(proof);
  if (proof.attempts.some(a => a.request_bytes > 16384)) throw new RuntimeAdapterError("gateway_transport_proof_mismatch"); return proof;
};
const parseBridge = compileValidator<RuntimeGatewayBridgeObservation>(RuntimeGatewayBridgeObservationSchema);
export const parseGatewayBridgeObservation = (input: unknown): RuntimeGatewayBridgeObservation => {
  const proof = parseBridge(input), budget = proof.budget, count = budget.reserved + budget.dispatching + budget.completed + budget.unknown;
  if (budget.held_micro_units !== count * GATEWAY_RESERVATION || budget.held_micro_units > budget.maximum_micro_units ||
    new Set(proof.attempts.map(a => a.request_id)).size !== proof.attempts.length || proof.attempts.some(a => (a.outcome === "completed") !== (a.reason === null) || a.outcome === "denied" && a.replay) ||
    proof.attempts.filter(a => a.outcome === "completed" && !a.replay).length > budget.completed || proof.synthetic_http_requests > count)
    throw new RuntimeAdapterError("gateway_bridge_proof_mismatch"); return proof;
};

// This object runs only in the host supervisor. Neither its endpoint nor its
// credential is included in runtime configuration or granted filesystem ACLs.
export class HostGatewayBridge {
  private readonly abort = new AbortController();
  private readonly seen = new Set<string>();
  private readonly attempts: RuntimeGatewayBridgeObservation["attempts"] = [];
  private worker?: Promise<void>;
  private nativePid: number | null = null;
  private runtimePid: number | null = null;
  private failure: string | null = null;
  private stopping = false;
  private constructor(private readonly path: string, private readonly request: OperationRequest, readonly gateway: SyntheticModelGateway,
    private readonly fixture: Awaited<ReturnType<typeof startGatewayFixture>>) {}
  static async create(path: string, request: OperationRequest): Promise<HostGatewayBridge> {
    const root = directory(join(path, "gateway")); directory(join(root, "requests")); directory(join(root, "responses"));
    copyFileSync(gatewayFixtureCertificate, join(root, "cert.pem"));
    if (digest(bytesAt(join(root, "cert.pem"))).value !== request.driver.gateway_fixture!.certificate_digest.value) throw new RuntimeAdapterError("gateway_probe_capsule_changed");
    writeFileSync(join(root, "private-canary.json"), "{\"synthetic_host_only\":true}", { flag: "wx" });
    const fixture = await startGatewayFixture({ onRequest: () => atomicJson(join(path, "gateway-upstream-proof.json"), {
      phase: "running", requests: fixture.observations, actual_credentials_read: 0, external_model_requests: 0 }) }); fixture.setMode(request.driver.gateway_fixture!.mode);
    try {
      const gateway = new SyntheticModelGateway({ ledgerPath: join(root, "budget.sqlite"), budgetKey: request.input.operation_key,
        maximumMicroUnits: request.driver.gateway_fixture!.maximum_micro_units, port: fixture.port, certificatePath: join(root, "cert.pem"), deadlineMs: 8000 });
      const bridge = new HostGatewayBridge(path, request, gateway, fixture);
      try {
        atomicJson(join(root, "owner.json"), { format: "cimiloop/gateway-owner/1.0.0", nonce: request.nonce, operation_key: request.input.operation_key,
          fixture_config_digest: digest(JSON.stringify(request.driver.gateway_fixture)), gateway_policy_digest: { algorithm: "sha256", value: gateway.policyDigest },
          certificate_digest: request.driver.gateway_fixture!.certificate_digest, port: fixture.port, deadline_ms: 8000, maximum_micro_units: request.driver.gateway_fixture!.maximum_micro_units });
        bridge.save("running"); return bridge;
      } catch (error) { await gateway.close(); throw error; }
    } catch (error) { await fixture.close(); throw error; }
  }
  start(native: ChildProcess): void {
    this.nativePid = native.pid ?? null;
    native.once("close", () => this.abort.abort());
    this.worker = this.serve();
  }
  private save(phase: "running" | "ended"): void {
    atomicJson(join(this.path, "gateway-host-proof.json"), parseGatewayBridgeObservation({ schema_version: "2.0.0", scope: "isolated_provider_probe",
      operation_key: this.request.input.operation_key, phase, native_pid: this.nativePid, runtime_pid: this.runtimePid,
      gateway_policy_digest: { algorithm: "sha256", value: this.gateway.policyDigest }, fixture_config_digest: digest(JSON.stringify(this.request.driver.gateway_fixture)), network_mode: "deny_all",
      synthetic_http_requests: this.fixture.observations.length, budget: this.gateway.snapshot(), attempts: this.attempts, failure_reason: this.failure,
      actual_credentials_read: 0, external_model_requests: 0, formal_execution_enabled: false }));
  }
  private async process(file: string): Promise<void> {
    const mailbox = JSON.parse(bytesAt(file, 32768).toString("utf8")) as Record<string, unknown>, id = basename(file, ".json");
    if (Object.keys(mailbox).sort().join(",") !== "format,frame_base64,native_pid,nonce,operation_key,policy_digest,request_digest,request_id,runtime_pid" ||
      mailbox.format !== "cimiloop/ipc-gateway-mailbox/1.0.0" || mailbox.nonce !== this.request.nonce || mailbox.operation_key !== this.request.input.operation_key ||
      mailbox.policy_digest !== this.gateway.policyDigest || mailbox.native_pid !== this.nativePid || mailbox.request_id !== id ||
      typeof mailbox.frame_base64 !== "string" || mailbox.frame_base64.length > 21848 || !/^[A-Za-z0-9+/]*={0,2}$/.test(mailbox.frame_base64)) throw new RuntimeAdapterError("gateway_mailbox_identity_unproven");
    const bytes = Buffer.from(mailbox.frame_base64, "base64");
    if (bytes.length > 16384 || digest(bytes).value !== mailbox.request_digest) throw new RuntimeAdapterError("gateway_mailbox_frame_unproven");
    const ownership = readJson(join(this.path, "native-ownership.json")) as { nonce: string; root: string; binary: string; network_mode: string; native_identity: { pid: number; creation_ticks: string; image: string }; runtime_identity: { pid: number } };
    const current = (await nativeControl(this.request.driver.launcher, ["--identity", String(this.nativePid)])).value as { pid: number; creation_ticks: string; image: string };
    if (ownership.nonce !== this.request.nonce || ownership.native_identity.pid !== this.nativePid || current.pid !== this.nativePid ||
      current.creation_ticks !== ownership.native_identity.creation_ticks || resolve(current.image).toLowerCase() !== resolve(this.request.driver.launcher).toLowerCase() ||
      resolve(ownership.native_identity.image).toLowerCase() !== resolve(current.image).toLowerCase() || ownership.network_mode !== "deny_all" ||
      resolve(ownership.root).toLowerCase() !== resolve(join(this.path, "sandbox")).toLowerCase() || resolve(ownership.binary).toLowerCase() !== resolve(this.request.driver.binary).toLowerCase() ||
      mailbox.runtime_pid !== ownership.runtime_identity.pid) throw new RuntimeAdapterError("gateway_mailbox_identity_unproven");
    this.runtimePid = ownership.runtime_identity.pid;
    let response: unknown = null, reason: string | null = null, replay = false;
    try {
      const input = parseGatewayRequest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      if (input.operation_key !== this.request.input.operation_key || input.request_id !== id) throw new RuntimeAdapterError("gateway_request_denied");
      const result = await this.gateway.execute(input, this.abort.signal); response = result.response; replay = result.replay;
    } catch (error) { reason = error instanceof RuntimeAdapterError ? error.reason : "gateway_request_denied"; }
    this.attempts.push({ request_id: id, wire_digest: digest(bytes), outcome: reason ? "denied" : "completed", reason, replay }); this.save("running");
    atomicJson(join(this.path, "gateway", "responses", `${id}.json`), { format: "cimiloop/ipc-gateway-reply/1.0.0", nonce: this.request.nonce,
      operation_key: this.request.input.operation_key, request_id: id, request_digest: digest(bytes).value, policy_digest: this.gateway.policyDigest,
      outcome: reason ? "denied" : "completed", response, reason, replay });
  }
  private async serve(): Promise<void> {
    const cancellation = setInterval(() => { if (existsSync(join(this.path, "cancel"))) this.abort.abort(); }, 50);
    try {
      while (!this.stopping && !this.abort.signal.aborted) {
        for (const name of readdirSync(join(this.path, "gateway", "requests"))) {
          if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.json$/.test(name) || this.seen.has(name)) continue;
          if (this.seen.size >= 8) throw new RuntimeAdapterError("gateway_mailbox_request_limit"); this.seen.add(name);
          await this.process(join(this.path, "gateway", "requests", name));
        }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    } catch (error) {
      this.failure = error instanceof RuntimeAdapterError ? error.reason : "gateway_host_observation_unproven"; this.abort.abort();
      try { writeFileSync(join(this.path, "cancel"), "gateway host unavailable", { flag: "wx" }); } catch { /* Existing cancellation retains its origin. */ }
    } finally { clearInterval(cancellation); }
  }
  async finish(): Promise<void> {
    this.stopping = true; this.abort.abort(); await this.worker;
    try { this.save("ended"); atomicJson(join(this.path, "gateway-upstream-proof.json"), { requests: this.fixture.observations, actual_credentials_read: 0, external_model_requests: 0 }); }
    finally { await this.gateway.close(); await this.fixture.close(); }
  }
}
