import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { compileValidator, RuntimeGatewayCreditProbeResultSchema, type RuntimeGatewayCreditProbeResult } from "@cimiloop/protocol/v2";
import { GatewayCreditLedger, type GatewayCreditPolicy, type GatewayCreditRequest } from "./gateway-credit.js";
import { creditHostDependencies } from "./gateway-credit-owner.js";
import { buildWindowsLauncher } from "./native.js";
import { GatewayBudgetLedger } from "./gateway-budget.js";
import { CODING_PLAN_RATE_OBSERVATION, CODING_PLAN_RATE_DIGEST } from "./gateway-billing.js";
import { requireDedicatedGatewayBilling } from "./model-gateway.js";
import { atomicJson, directory, digest, rawReference, RuntimeAdapterError } from "./files.js";
const credit = 1000000;
export const CREDIT_REHEARSAL_REFERENCE_TIME = "2026-10-05T00:00:00.000Z";
const names = ["shared_account_ceiling", "immutable_task_ceiling", "global_request_identity", "completed_receipt_replay", "opaque_dispatch_permit", "cancel_holds_credit",
  "active_owner_not_reconciled", "unknown_owner_not_reconciled", "expired_rate_before_dispatch", "historic_completion_readable", "bound_violation_blocks_account",
  "two_host_account_cas", "abrupt_dispatch_recovery", "real_billing_admission_closed", "foreign_test_ledger_rejected"] as const;
const validate = compileValidator<RuntimeGatewayCreditProbeResult>(RuntimeGatewayCreditProbeResultSchema);
export const parseRuntimeGatewayCreditProbe = (input: unknown): RuntimeGatewayCreditProbeResult => {
  const result = validate(input);
  if (result.checks.length !== names.length || result.checks.some((check, index) => check.name !== names[index]) || result.credit_budget_probe_passed !== result.checks.every(c => c.passed) ||
    result.credit_budget_probe_passed && result.independent_host_processes !== 3 || Date.parse(result.rate_observation.reference_time) >= Date.parse(result.rate_observation.expires_at) || new Set(result.snapshots.map(s => s.case_name)).size !== result.snapshots.length) throw new RuntimeAdapterError("credit_probe_observation_invalid");
  for (const { snapshot: s } of result.snapshots) {
    if (s.held_micro_units > s.maximum_micro_units || s.remaining_micro_units !== s.maximum_micro_units - s.held_micro_units || s.reserved + s.dispatching + s.completed + s.unknown > 4096 ||
      new Set(s.budgets.map(b => b.budget_key)).size !== s.budgets.length || s.budgets.some(b => b.held_micro_units > b.maximum_micro_units || b.maximum_micro_units > s.maximum_micro_units || b.held_micro_units % credit !== 0) ||
      s.budgets.reduce((total, b) => total + b.held_micro_units, 0) !== s.held_micro_units || s.held_micro_units % credit !== 0 ||
      s.held_micro_units < (s.reserved + s.dispatching + s.completed + s.unknown) * credit || (s.held_micro_units === 0) !== (s.reserved + s.dispatching + s.completed + s.unknown === 0)) throw new RuntimeAdapterError("credit_probe_observation_invalid");
  }
  return result;
};
export const runGatewayCreditProbe = async (options: { root: string }): Promise<RuntimeGatewayCreditProbeResult> => {
  if (process.platform !== "win32" || process.arch !== "x64") throw new RuntimeAdapterError("windows_x64_credit_owner_probe_required");
  const root = directory(options.root), run = directory(join(root, "runs", randomUUID())), launcher = await buildWindowsLauncher(root);
  const native: Buffer[] = [], dependencies = await creditHostDependencies(launcher, { now: () => Date.parse(CREDIT_REHEARSAL_REFERENCE_TIME), observation: bytes => native.push(bytes) });
  let hostProcesses = 0;
  const fork = (args: string[]) => new Promise<{ stdout: string }>((resolve, reject) => {
    const child = execFile(process.execPath, args, { windowsHide: true, timeout: 15000, encoding: "utf8" }, (error, stdout) => error ? reject(error) : resolve({ stdout }));
    child.once("spawn", () => { hostProcesses++; });
  });
  const checks: RuntimeGatewayCreditProbeResult["checks"] = [], snapshots: RuntimeGatewayCreditProbeResult["snapshots"] = [], recoveries: RuntimeGatewayCreditProbeResult["recoveries"] = [], workers: unknown[] = [];
  const ledgers: GatewayCreditLedger[] = [];
  const p = (ceiling = 4 * credit): GatewayCreditPolicy => ({ format: "cimiloop/gateway-credit-rehearsal/1.0.0", scope: "credit_budget_rehearsal", account_scope_digest: digest("synthetic-credit-account").value,
    unit: "ZHIPU_CODING_PLAN_CREDIT", model: "glm-5.3", maximum_micro_units: ceiling });
  const open = (name: string, cap = 4 * credit) => { const ledger = new GatewayCreditLedger(join(run, name + ".sqlite"), p(cap), dependencies); ledgers.push(ledger); ledger.registerBudget("task_a", Math.min(cap, 3 * credit)); ledger.registerBudget("task_b", Math.min(cap, 3 * credit)); return ledger; };
  const request = (budget = "task_a", input = 1, output = 1): GatewayCreditRequest => ({ request_id: randomUUID(), budget_key: budget, input_digest: digest("Synthetic input").value, input_tokens: input, output_tokens: output });
  const check = async (name: string, body: () => boolean | Promise<boolean>) => {
    try { const passed = await body(); checks.push({ name, passed, reason: passed ? "condition_verified" : "credit_condition_unproven" }); }
    catch (error) { checks.push({ name, passed: false, reason: error instanceof RuntimeAdapterError ? error.reason : "credit_probe_case_failed" }); }
  };
  const denied = (body: () => unknown, reason: string) => { try { body(); return false; } catch (error) { return error instanceof RuntimeAdapterError && error.reason === reason; } };
  const save = (name: string, ledger: GatewayCreditLedger) => snapshots.push({ case_name: name, snapshot: ledger.snapshot() });
  const main = open("shared"); let done: GatewayCreditRequest | undefined;
  try {
    await check("shared_account_ceiling", () => { main.reserve(request("task_a", 1450, 0)); const passed = denied(() => main.reserve(request("task_b", 2900, 0)), "credit_account_exhausted"); save("shared", main); return passed; });
    await check("immutable_task_ceiling", () => denied(() => main.registerBudget("task_a", 4 * credit), "credit_budget_policy_conflict"));
    const completed = open("completed");
    await check("global_request_identity", () => { done = request(); const permit = completed.reserve(done).permit!; completed.dispatch(permit); completed.complete(permit, { response_digest: digest("Synthetic response").value, input_tokens: 1, output_tokens: 1 }); return denied(() => completed.reserve({ ...done!, budget_key: "task_b" }), "credit_request_id_conflict"); });
    await check("completed_receipt_replay", () => { const claim = completed.reserve(done!); save("completed", completed); return !!claim.replay && claim.permit === undefined && claim.replay.actual_cost_known === false && completed.snapshot().held_micro_units === credit; });
    await check("opaque_dispatch_permit", () => { const claim = main.reserve(request("task_b")); return denied(() => main.dispatch({ ...claim.permit! }), "credit_reservation_unowned"); });
    await check("cancel_holds_credit", () => { const ledger = open("cancel", credit), permit = ledger.reserve(request()).permit!; ledger.dispatch(permit); ledger.unknown(permit); save("cancel", ledger); return ledger.snapshot().unknown === 1 && ledger.snapshot().held_micro_units === credit; });
    await check("active_owner_not_reconciled", async () => { const outcome = await main.reconcileOwners(); recoveries.push({ case_name: "active", ...outcome }); return outcome.active_owners === 1 && outcome.reconciled_requests === 0; });
    await check("unknown_owner_not_reconciled", async () => { const observer = new GatewayCreditLedger(join(run, "shared.sqlite"), p(), { ...dependencies, observeOwner: async () => { throw new RuntimeAdapterError("native_control_unavailable"); } });
      try { const outcome = await observer.reconcileOwners(); recoveries.push({ case_name: "unavailable_observer", ...outcome }); return outcome.unknown_owners === 1 && outcome.reconciled_requests === 0; } finally { observer.close(); } });
    let now = Date.parse(CREDIT_REHEARSAL_REFERENCE_TIME); const expiry = new GatewayCreditLedger(join(run, "expiry.sqlite"), p(), { ...dependencies, now: () => now }); ledgers.push(expiry); expiry.registerBudget("task_a", 3 * credit);
    const old = request(), issued = expiry.reserve(old).permit!; expiry.dispatch(issued); expiry.complete(issued, { response_digest: digest("Synthetic response").value, input_tokens: 1, output_tokens: 1 });
    await check("expired_rate_before_dispatch", () => { const pending = expiry.reserve(request()).permit!; now = Date.parse(CODING_PLAN_RATE_OBSERVATION.expires_at); return denied(() => expiry.dispatch(pending), "coding_plan_rate_observation_expired") && denied(() => expiry.reserve(request()), "coding_plan_rate_observation_expired"); });
    await check("historic_completion_readable", () => { save("expiry", expiry); return !!expiry.reserve(old).replay && expiry.snapshot().held_micro_units === 2 * credit; });
    await check("bound_violation_blocks_account", () => { const ledger = open("overflow"), permit = ledger.reserve(request()).permit!; ledger.dispatch(permit);
      const passed = denied(() => ledger.complete(permit, { response_digest: digest("Synthetic response").value, input_tokens: 1, output_tokens: 2 }), "credit_usage_bound_exceeded"); save("overflow", ledger); return passed && ledger.snapshot().blocked && denied(() => ledger.reserve(request("task_b")), "credit_account_blocked"); });
    const module = new URL("./gateway-credit.js", import.meta.url).href, ownerModule = new URL("./gateway-credit-owner.js", import.meta.url).href;
    const script = `import {GatewayCreditLedger} from ${JSON.stringify(module)}; import {creditHostDependencies} from ${JSON.stringify(ownerModule)}; const [file,policy,launcher,budget,id,crash]=process.argv.slice(1); const dependencies=await creditHostDependencies(launcher,{now:()=>Date.parse(${JSON.stringify(CREDIT_REHEARSAL_REFERENCE_TIME)})}); const ledger=new GatewayCreditLedger(file,JSON.parse(policy),dependencies); try{const claim=ledger.reserve({request_id:id,budget_key:budget,input_digest:${JSON.stringify(digest("Synthetic input").value)},input_tokens:1,output_tokens:1}); if(crash==='yes'){ledger.dispatch(claim.permit);process.exit(73);} console.log(JSON.stringify({outcome:'reserved',pid:process.pid,node:process.version}));}catch(error){console.log(JSON.stringify({outcome:error.reason,pid:process.pid,node:process.version}));}finally{ledger.close();}`;
    await check("two_host_account_cas", async () => { const ledger = open("cas", credit); const outputs = await Promise.all(["task_a", "task_b"].map(budget => fork(["--input-type=module", "-e", script, join(run, "cas.sqlite"), JSON.stringify(p(credit)), launcher, budget, randomUUID(), "no"])));
      const outcomes = outputs.map(o => JSON.parse(o.stdout.trim()) as { outcome: string }); workers.push({ case_name: "cas", outcomes }); save("cas", ledger); return outcomes.map(o => o.outcome).sort().join(",") === "credit_account_exhausted,reserved" && ledger.snapshot().held_micro_units === credit; });
    await check("abrupt_dispatch_recovery", async () => { const ledger = open("crash", credit), input = request(); let exit: number | undefined;
      try { await fork(["--input-type=module", "-e", script, join(run, "crash.sqlite"), JSON.stringify(p(credit)), launcher, "task_a", input.request_id, "yes"]); }
      catch (error) { if (error && typeof error === "object" && "code" in error && error.code === 73) exit = 73; else throw error; }
      workers.push({ case_name: "crash", exit_code: exit }); if (exit !== 73 || ledger.snapshot().dispatching !== 1) return false;
      let recovery = await ledger.reconcileOwners(); const until = Date.now() + 10000;
      while (recovery.unknown_owners && Date.now() < until) { await delay(100); recovery = await ledger.reconcileOwners(); }
      recoveries.push({ case_name: "crash", ...recovery }); save("crash", ledger);
      return recovery.reconciled_requests === 1 && recovery.verified_ended_owners === 1 && ledger.snapshot().unknown === 1 && denied(() => ledger.reserve(input), "credit_request_outcome_unproven"); });
    await check("real_billing_admission_closed", () => denied(() => requireDedicatedGatewayBilling({ format: "cimiloop/dedicated-model/1.0.0", provider: "zhipuai-coding-plan", model: "zhipuai-coding-plan/glm-5.3",
      credential_file: join(run, "absent-credential.dpapi.json"), credential_digest: { algorithm: "sha256", value: "a".repeat(64) } }), "gateway_reliable_billing_profile_unavailable"));
    await check("foreign_test_ledger_rejected", () => { const path = join(run, "original-test.sqlite"), original = new GatewayBudgetLedger(path, { budget_key: "original", policy_digest: "a".repeat(64), currency: "TEST", maximum_micro_units: 1, reservation_micro_units: 1 }); original.close();
      return denied(() => new GatewayCreditLedger(path, p(), dependencies), "credit_ledger_format_unavailable"); });
  } finally { for (const ledger of ledgers) ledger.close(); }
  // Observe each owned credit store after graceful close. No process/profile
  // cleanup is inferred from SQLite state; this probe creates no AppContainer.
  for (const name of ["shared", "completed", "cancel", "expiry", "overflow", "cas", "crash"]) {
    const ledger = new GatewayCreditLedger(join(run, name + ".sqlite"), p(["cancel", "cas", "crash"].includes(name) ? credit : 4 * credit), dependencies);
    try { save(name + "_closed", ledger); } finally { ledger.close(); }
  }
  const observation = { checks, snapshots, recoveries, workers, historical_reference_time: CREDIT_REHEARSAL_REFERENCE_TIME, actual_credentials_read: 0, external_model_requests: 0 };
  atomicJson(join(run, "credit-observation.json"), observation);
  const evidence = [rawReference(root, Buffer.from(JSON.stringify(observation)), "credit_budget_observation", "credit-observation.json"), ...native.map(bytes => rawReference(root, bytes, "credit_owner_observation", "credit-owner-observation.json"))];
  const result = parseRuntimeGatewayCreditProbe({ schema_version: "2.0.0", scope: "credit_budget_rehearsal", observed_at: new Date().toISOString(), credit_budget_probe_passed: checks.every(c => c.passed), unit: "ZHIPU_CODING_PLAN_CREDIT",
    rate_observation: { digest: { algorithm: "sha256", value: CODING_PLAN_RATE_DIGEST }, expires_at: CODING_PLAN_RATE_OBSERVATION.expires_at, reference_time: CREDIT_REHEARSAL_REFERENCE_TIME, historical_rehearsal: true, account_version_verified: false, token_bounds_verified: false },
    checks, snapshots, recoveries, independent_host_processes: hostProcesses, credit_ledger_format: 1, http_requests: 0, external_model_requests: 0, actual_credentials_read: 0, runtime_started: false,
    actual_cost_known: false, billing_admission_ready: false, formal_execution_enabled: false, evidence_refs: evidence,
    gaps: ["confirmed_account_credit_plan_and_gateway_eligibility", "server_enforced_input_and_reasoning_output_bounds", "approved_account_credit_budget_and_single_trusted_store", "provider_invoice_and_quota_reconciliation", "authenticated_real_provider_https_contract", "hard_filesystem_quota", "complete_controlled_execution_recovery", "formal_task_binding_and_agent_entry"] });
  atomicJson(join(run, "gateway-credit-probe-result.json"), result); atomicJson(join(root, "gateway-credit-probe-result.json"), result); return result;
};
