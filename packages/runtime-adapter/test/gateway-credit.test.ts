import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { GatewayCreditLedger, type GatewayCreditPolicy, type GatewayCreditRequest } from "../src/gateway-credit.js";
import { creditHostDependencies } from "../src/gateway-credit-owner.js";
import { GatewayBudgetLedger } from "../src/gateway-budget.js";
import { CODING_PLAN_RATE_OBSERVATION } from "../src/gateway-billing.js";
import { buildWindowsLauncher } from "../src/native.js";
import { digest } from "../src/files.js";
const execute = promisify(execFile), time = Date.parse("2026-10-05T00:00:00Z"), credit = 1000000;
const policy = (cap = 4 * credit): GatewayCreditPolicy => ({ format: "cimiloop/gateway-credit-rehearsal/1.0.0", scope: "credit_budget_rehearsal", account_scope_digest: "a".repeat(64), unit: "ZHIPU_CODING_PLAN_CREDIT", model: "glm-5.3", maximum_micro_units: cap });
const request = (budget = "task_a", input = 1, output = 1): GatewayCreditRequest => ({ request_id: randomUUID(), budget_key: budget, input_digest: "b".repeat(64), input_tokens: input, output_tokens: output });
const dependencies = { identity: { pid: process.pid, creation_ticks: "1", image: process.execPath }, now: () => time };
const root = () => mkdtempSync(join(tmpdir(), "cimiloop-credit-test-"));
const remove = (path: string) => { if (!resolve(path).startsWith(resolve(tmpdir()) + sep + "cimiloop-credit-test-")) throw Error("Invalid cleanup target"); rmSync(path, { recursive: true, force: true }); };
const fixture = () => { const path = root(), file = join(path, "credits.sqlite"), p = policy(), ledger = new GatewayCreditLedger(file, p, dependencies); ledger.registerBudget("task_a", 3 * credit); ledger.registerBudget("task_b", 3 * credit); return { path, file, p, ledger }; };
const cleanup = (f: ReturnType<typeof fixture>) => { f.ledger.close(); remove(f.path); };
const complete = (ledger: GatewayCreditLedger, input = request()) => { const claim = ledger.reserve(input); if (!claim.permit) throw Error("Fresh permit missing"); ledger.dispatch(claim.permit); const result = { response_digest: digest("synthetic-response").value, input_tokens: 1, output_tokens: 1 }; return { input, permit: claim.permit, result, receipt: ledger.complete(claim.permit, result) }; };

describe("separate durable credit rehearsal ledger", () => {
  it("enforces a shared account ceiling across independent task budgets with different token bounds", () => {
    const f = fixture(); try {
      f.ledger.reserve(request("task_a", 1450, 0));
      expect(() => f.ledger.reserve(request("task_b", 2900, 0))).toThrow("credit_account_exhausted");
      expect(f.ledger.snapshot()).toMatchObject({ held_micro_units: 2 * credit, remaining_micro_units: 2 * credit, admission_ready: false, actual_cost_known: false });
      f.ledger.reserve(request("task_b")); expect(f.ledger.snapshot().held_micro_units).toBe(3 * credit);
    } finally { cleanup(f); }
  });
  it("keeps task ceilings immutable independently of the shared account ceiling", () => {
    const f = fixture(); try {
      f.ledger.reserve(request("task_a", 2900, 0));
      expect(() => f.ledger.reserve(request())).toThrow("credit_budget_exhausted");
      expect(() => f.ledger.registerBudget("task_a", 4 * credit)).toThrow("credit_budget_policy_conflict");
      expect(() => new GatewayCreditLedger(f.file, { ...f.p, maximum_micro_units: 5 * credit }, dependencies)).toThrow("credit_account_policy_conflict");
      expect(() => new GatewayCreditLedger(f.file, { ...f.p, account_scope_digest: "c".repeat(64) }, dependencies)).toThrow("credit_account_policy_conflict");
    } finally { cleanup(f); }
  });
  it("makes a request ID unique across budgets and binds all request bounds before replay", () => {
    const f = fixture(); try {
      const done = complete(f.ledger);
      for (const patch of [{ budget_key: "task_b" }, { input_digest: "c".repeat(64) }, { input_tokens: 2 }, { output_tokens: 2 }]) expect(() => f.ledger.reserve({ ...done.input, ...patch })).toThrow("credit_request_id_conflict");
      expect(f.ledger.reserve(done.input)).toEqual({ replay: done.receipt }); expect(f.ledger.snapshot().held_micro_units).toBe(credit);
    } finally { cleanup(f); }
  });
  it("retains the full bound after completion and refuses conflicting or premature completion", () => {
    const f = fixture(); try {
      const done = complete(f.ledger, request("task_a", 1450, 1));
      expect(done.receipt).toMatchObject({ held_micro_units: 2 * credit, actual_cost_known: false, admission_ready: false });
      expect(f.ledger.complete(done.permit, done.result)).toEqual(done.receipt);
      expect(() => f.ledger.complete(done.permit, { ...done.result, response_digest: "e".repeat(64) })).toThrow("credit_completion_conflict");
      const claim = f.ledger.reserve(request("task_b")); expect(() => f.ledger.complete(claim.permit!, done.result)).toThrow("credit_completion_unproven");
    } finally { cleanup(f); }
  });
  it("refuses fabricated, copied and foreign-instance dispatch permits before changing state", () => {
    const f = fixture(), other = new GatewayCreditLedger(f.file, f.p, dependencies); try {
      const claim = f.ledger.reserve(request()), permit = claim.permit!;
      expect(Object.isFrozen(permit)).toBe(true);
      expect(() => f.ledger.dispatch({ ...permit })).toThrow("credit_reservation_unowned");
      expect(() => other.dispatch(permit)).toThrow("credit_reservation_unowned");
      f.ledger.dispatch(permit); expect(() => f.ledger.dispatch(permit)).toThrow("credit_dispatch_unavailable");
      expect(f.ledger.snapshot()).toMatchObject({ dispatching: 1, held_micro_units: credit });
    } finally { other.close(); cleanup(f); }
  });
  it("freezes caller policy and request data across reservation work", () => {
    const path = root(), p = policy(), ledger = new GatewayCreditLedger(join(path, "credits.sqlite"), p, dependencies); try {
      ledger.registerBudget("task_a", 3 * credit); const input = request("task_a", 1450, 0), permit = ledger.reserve(input).permit!;
      p.maximum_micro_units = 10 * credit; input.input_tokens = 1; input.budget_key = "changed";
      ledger.dispatch(permit); expect(ledger.snapshot()).toMatchObject({ maximum_micro_units: 4 * credit, held_micro_units: 2 * credit });
    } finally { ledger.close(); remove(path); }
  });
  it("expires new reservations and dispatches while keeping old receipts and holdings readable", () => {
    const f = fixture(); let now = time; const ledger = new GatewayCreditLedger(f.file, f.p, { ...dependencies, now: () => now }); try {
      const done = complete(ledger), pending = ledger.reserve(request("task_b")).permit!;
      now = Date.parse(CODING_PLAN_RATE_OBSERVATION.expires_at);
      expect(() => ledger.reserve(request())).toThrow("coding_plan_rate_observation_expired");
      expect(() => ledger.dispatch(pending)).toThrow("coding_plan_rate_observation_expired");
      expect(ledger.reserve(done.input)).toEqual({ replay: done.receipt });
      expect(ledger.snapshot()).toMatchObject({ reserved: 1, completed: 1, held_micro_units: 2 * credit });
    } finally { ledger.close(); cleanup(f); }
  });
  it("accepts a late completion under its originally stored observation without refunding", () => {
    const f = fixture(); let now = time; const ledger = new GatewayCreditLedger(f.file, f.p, { ...dependencies, now: () => now }); try {
      const permit = ledger.reserve(request()).permit!; ledger.dispatch(permit); now = Date.parse(CODING_PLAN_RATE_OBSERVATION.expires_at) + 86400000;
      ledger.complete(permit, { response_digest: "d".repeat(64), input_tokens: 1, output_tokens: 1 }); expect(ledger.snapshot().held_micro_units).toBe(credit);
    } finally { ledger.close(); cleanup(f); }
  });
  it("blocks the whole account after an observed bound violation and retains the original reservation", () => {
    const f = fixture(); try {
      const permit = f.ledger.reserve(request()).permit!; f.ledger.dispatch(permit);
      expect(() => f.ledger.complete(permit, { response_digest: "d".repeat(64), input_tokens: 1, output_tokens: 2 })).toThrow("credit_usage_bound_exceeded");
      expect(f.ledger.snapshot()).toMatchObject({ blocked: true, unknown: 1, held_micro_units: credit });
      expect(() => f.ledger.reserve(request("task_b"))).toThrow("credit_account_blocked");
    } finally { cleanup(f); }
  });
  it("rejects malformed completion data before poisoning a durable receipt or changing dispatch state", () => {
    const f = fixture(); try {
      const permit = f.ledger.reserve(request()).permit!; f.ledger.dispatch(permit);
      for (const input of [{ response_digest: Buffer.from("d".repeat(64)), input_tokens: 1, output_tokens: 1 },
        { response_digest: "d".repeat(64), input_tokens: 1, output_tokens: 1, actual_cost_known: true },
        { response_digest: "d".repeat(64), input_tokens: 1, output_tokens: -1 }])
        expect(() => f.ledger.complete(permit, input as unknown as Parameters<GatewayCreditLedger["complete"]>[1])).toThrow("invalid_credit_completion");
      expect(f.ledger.snapshot()).toMatchObject({ dispatching: 1, completed: 0, held_micro_units: credit });
    } finally { cleanup(f); }
  });
  it("retains cancellation and closes only the current owner without resetting other owners", () => {
    const f = fixture(), other = new GatewayCreditLedger(f.file, f.p, dependencies); try {
      const a = f.ledger.reserve(request()).permit!, b = other.reserve(request("task_b")).permit!;
      f.ledger.dispatch(a); f.ledger.unknown(a); f.ledger.close();
      expect(other.snapshot()).toMatchObject({ unknown: 1, reserved: 1, held_micro_units: 2 * credit }); other.dispatch(b);
    } finally { other.close(); cleanup(f); }
  });
  it("preserves both active and unknown owners without claiming that either has ended", async () => {
    const f = fixture(), observer = new GatewayCreditLedger(f.file, f.p, { ...dependencies, observeOwner: async () => "active" }); try {
      f.ledger.reserve(request()); expect(await observer.reconcileOwners()).toMatchObject({ active_owners: 1, reconciled_requests: 0 });
      expect(await f.ledger.reconcileOwners()).toMatchObject({ unknown_owners: 1, reconciled_requests: 0 });
      expect(f.ledger.snapshot()).toMatchObject({ reserved: 1, unknown: 0, held_micro_units: credit });
    } finally { observer.close(); cleanup(f); }
  });
  it("rejects malformed bounds, zero reservations, unregistered tasks and caller tariff overrides", () => {
    const f = fixture(); try {
      for (const input of [{ ...request(), input_tokens: -1 }, { ...request(), output_tokens: 131073 }, { ...request(), input_tokens: 0, output_tokens: 0 }, { ...request(), rate: 0 }, { ...request(), admission_ready: true }]) expect(() => f.ledger.reserve(input)).toThrow("invalid_credit_request");
      expect(() => f.ledger.reserve(request("missing"))).toThrow("credit_budget_unregistered");
      for (const cap of [0, 1, 1000001, 5 * credit]) expect(() => f.ledger.registerBudget("missing", cap)).toThrow("invalid_credit_budget");
      expect(f.ledger.snapshot().held_micro_units).toBe(0);
    } finally { cleanup(f); }
  });
  it("rejects false admission, currency and account policies before creating files", () => {
    const path = root(), file = join(path, "absent", "credits.sqlite"); try {
      for (const patch of [{ admission_ready: true }, { unit: "TEST" }, { scope: "approved" }, { maximum_micro_units: 1 }, { account_scope_digest: "unknown" }])
        expect(() => new GatewayCreditLedger(file, { ...policy(), ...patch } as GatewayCreditPolicy, dependencies)).toThrow("invalid_credit_rehearsal_policy");
      expect(existsSync(join(path, "absent"))).toBe(false);
    } finally { remove(path); }
  });
  it("refuses both a foreign database and the old TEST ledger without changing them", () => {
    const path = root(), file = join(path, "other.sqlite"); const db = new DatabaseSync(file); db.exec("CREATE TABLE other(value TEXT)"); db.close();
    const oldFile = join(path, "test.sqlite"), old = new GatewayBudgetLedger(oldFile, { budget_key: "test", policy_digest: "a".repeat(64), currency: "TEST", maximum_micro_units: 1, reservation_micro_units: 1 }); old.close();
    try {
      for (const target of [file, oldFile]) expect(() => new GatewayCreditLedger(target, policy(), dependencies)).toThrow("credit_ledger_format_unavailable");
      const check = new DatabaseSync(file); try { expect(check.prepare("PRAGMA application_id").get()!.application_id).toBe(0); } finally { check.close(); }
      const legacy = new DatabaseSync(oldFile); try { expect(legacy.prepare("PRAGMA application_id").get()!.application_id).toBe(0x43494d47); } finally { legacy.close(); }
    } finally { remove(path); }
  });
  it.each(["receipt_digest", "held", "owner", "schema", "missing_account"])("fails closed for damaged %s without repairing it", mode => {
    const f = fixture(); complete(f.ledger); f.ledger.close(); const db = new DatabaseSync(f.file); db.exec("PRAGMA foreign_keys=OFF");
    try {
      if (mode === "receipt_digest") db.exec("UPDATE credit_requests SET receipt_digest='damaged'");
      if (mode === "held") db.exec("UPDATE credit_requests SET held=2000000");
      if (mode === "owner") db.exec("UPDATE credit_requests SET owner_nonce='missing'");
      if (mode === "schema") db.exec("DROP TABLE credit_owners");
      if (mode === "missing_account") db.exec("DELETE FROM credit_account");
    } finally { db.close(); }
    try { expect(() => new GatewayCreditLedger(f.file, f.p, dependencies)).toThrow(mode === "schema" ? "credit_ledger_format_unavailable" : "credit_ledger_corrupt"); }
    finally { remove(f.path); }
  });
});

describe.runIf(process.platform === "win32" && process.arch === "x64")("actual independent credit hosts", () => {
  let path: string, launcher: string;
  beforeAll(async () => { path = root(); launcher = await buildWindowsLauncher(path); }, 60000);
  afterAll(() => remove(path));
  const module = new URL("../dist/gateway-credit.js", import.meta.url).href, hostModule = new URL("../dist/gateway-credit-owner.js", import.meta.url).href;
  const script = `import {GatewayCreditLedger} from ${JSON.stringify(module)}; import {creditHostDependencies} from ${JSON.stringify(hostModule)}; const [file,policy,launcher,budget,id,crash]=process.argv.slice(1); const dependencies=await creditHostDependencies(launcher,{now:()=>${time}}); const ledger=new GatewayCreditLedger(file,JSON.parse(policy),dependencies); try {const claim=ledger.reserve({request_id:id,budget_key:budget,input_digest:'b'.repeat(64),input_tokens:1,output_tokens:1}); if(crash==='yes'){ledger.dispatch(claim.permit);process.exit(73);} console.log('reserved');} catch(error){console.log(error.reason);} finally {ledger.close();}`;
  it("has one durable winner across task budgets in two actual host processes", async () => {
    const file = join(path, "race.sqlite"), p = policy(credit), init = new GatewayCreditLedger(file, p, await creditHostDependencies(launcher, { now: () => time })); init.registerBudget("task_a", credit); init.registerBudget("task_b", credit); init.close();
    const outputs = await Promise.all(["task_a", "task_b"].map(budget => execute(process.execPath, ["--input-type=module", "-e", script, file, JSON.stringify(p), launcher, budget, randomUUID(), "no"], { timeout: 15000, windowsHide: true })));
    expect(outputs.map(v => v.stdout.trim()).sort()).toEqual(["credit_account_exhausted", "reserved"]);
    const ledger = new GatewayCreditLedger(file, p, await creditHostDependencies(launcher, { now: () => time }));
    try { expect(ledger.snapshot()).toMatchObject({ held_micro_units: credit, unknown: 1 }); } finally { ledger.close(); }
  }, 20000);
  it("retains abrupt dispatch, verifies the original OS owner ended and never reacquires its request", async () => {
    const file = join(path, "crash.sqlite"), p = policy(credit), id = randomUUID();
    const dependencies = await creditHostDependencies(launcher, { now: () => time }), init = new GatewayCreditLedger(file, p, dependencies); init.registerBudget("task_a", credit); init.close();
    await expect(execute(process.execPath, ["--input-type=module", "-e", script, file, JSON.stringify(p), launcher, "task_a", id, "yes"], { timeout: 15000, windowsHide: true })).rejects.toMatchObject({ code: 73 });
    const ledger = new GatewayCreditLedger(file, p, dependencies); try {
      expect(ledger.snapshot()).toMatchObject({ dispatching: 1, held_micro_units: credit });
      let recovery = await ledger.reconcileOwners(); const until = Date.now() + 10000;
      while (recovery.unknown_owners && Date.now() < until) { await delay(100); recovery = await ledger.reconcileOwners(); }
      expect(recovery).toMatchObject({ verified_ended_owners: 1, reconciled_requests: 1, active_owners: 0, unknown_owners: 0 });
      expect(ledger.snapshot()).toMatchObject({ dispatching: 0, unknown: 1, held_micro_units: credit });
      expect(() => ledger.reserve({ ...request(), request_id: id })).toThrow("credit_request_outcome_unproven");
      expect(await ledger.reconcileOwners()).toMatchObject({ reconciled_requests: 0 });
    } finally { ledger.close(); }
  }, 20000);
  it("refuses recovery of a real active host", async () => {
    const dependencies = await creditHostDependencies(launcher, { now: () => time }), ledger = new GatewayCreditLedger(join(path, "active.sqlite"), policy(), dependencies);
    try { ledger.registerBudget("task_a", credit); ledger.reserve(request()); expect(await ledger.reconcileOwners()).toMatchObject({ active_owners: 1, reconciled_requests: 0 }); }
    finally { ledger.close(); }
  }, 15000);
});
