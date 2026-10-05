import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { assertOrdinaryPath, directory, RuntimeAdapterError } from "./files.js";

export interface GatewayBudgetPolicy {
  budget_key: string; policy_digest: string; currency: "TEST";
  maximum_micro_units: number; reservation_micro_units: number;
}
export interface GatewayBudgetSnapshot {
  currency: "TEST"; maximum_micro_units: number; held_micro_units: number;
  reserved: number; dispatching: number; completed: number; unknown: number; blocked: boolean;
}
const identity = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/;
const sha = /^[a-f0-9]{64}$/;
const positive = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= 1_000_000_000_000;
const applicationId = 0x43494d47;

// This host-owned database is separate from the domain store. Reservations
// are never refunded on ambiguous outcomes, and completed requests retain the
// full conservative upper bound. Observed usage is not a billing invoice.
export class GatewayBudgetLedger {
  private readonly db: DatabaseSync;
  private readonly policy: GatewayBudgetPolicy;
  constructor(path: string, policy: GatewayBudgetPolicy) {
    if (!identity.test(policy.budget_key) || !sha.test(policy.policy_digest) || policy.currency !== "TEST" ||
      !positive(policy.maximum_micro_units) || !positive(policy.reservation_micro_units) || policy.reservation_micro_units > policy.maximum_micro_units ||
      Object.keys(policy).sort().join(",") !== "budget_key,currency,maximum_micro_units,policy_digest,reservation_micro_units") throw new RuntimeAdapterError("invalid_gateway_budget_policy");
    this.policy = Object.freeze({ ...policy });
    path = assertOrdinaryPath(path); directory(dirname(path));
    for (const suffix of ["-wal", "-shm", "-journal"]) assertOrdinaryPath(path + suffix);
    this.db = new DatabaseSync(path, { timeout: 5000 });
    try {
      const app = Number(this.db.prepare("PRAGMA application_id").get()!.application_id);
      const version = Number(this.db.prepare("PRAGMA user_version").get()!.user_version);
      const tables = this.db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all();
      if ((app !== applicationId || version !== 1) && (app !== 0 || version !== 0 || tables.length)) throw new RuntimeAdapterError("gateway_ledger_format_unavailable");
      this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
      this.transaction(() => {
        this.db.exec(`CREATE TABLE IF NOT EXISTS gateway_budgets (
          budget_key TEXT PRIMARY KEY, policy_digest TEXT NOT NULL, currency TEXT NOT NULL CHECK(currency='TEST'),
          maximum INTEGER NOT NULL CHECK(maximum>0), reservation INTEGER NOT NULL CHECK(reservation>0 AND reservation<=maximum),
          blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1))
        ) STRICT;
        CREATE TABLE IF NOT EXISTS gateway_requests (
          budget_key TEXT NOT NULL REFERENCES gateway_budgets(budget_key), request_id TEXT NOT NULL, input_digest TEXT NOT NULL,
          held INTEGER NOT NULL CHECK(held>0), state TEXT NOT NULL CHECK(state IN ('reserved','dispatching','completed','unknown')),
          response TEXT, response_digest TEXT, reason TEXT,
          PRIMARY KEY(budget_key,request_id)
        ) STRICT;
        PRAGMA application_id=${applicationId}; PRAGMA user_version=1;`);
        const row = this.db.prepare("SELECT * FROM gateway_budgets WHERE budget_key=?").get(policy.budget_key);
        if (row && (row.policy_digest !== policy.policy_digest || row.currency !== policy.currency || row.maximum !== policy.maximum_micro_units || row.reservation !== policy.reservation_micro_units))
          throw new RuntimeAdapterError("gateway_budget_policy_conflict");
        if (!row) this.db.prepare("INSERT INTO gateway_budgets(budget_key,policy_digest,currency,maximum,reservation) VALUES(?,?,?,?,?)")
          .run(policy.budget_key, policy.policy_digest, policy.currency, policy.maximum_micro_units, policy.reservation_micro_units);
      });
      if (this.db.prepare("PRAGMA quick_check").get()!.quick_check !== "ok") throw new RuntimeAdapterError("gateway_ledger_corrupt");
    } catch (error) { this.db.close(); throw error; }
  }
  private transaction<T>(body: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = body(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  reserve(requestId: string, inputDigest: string): { replay?: string; response_digest?: string } {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(requestId) || !sha.test(inputDigest)) throw new RuntimeAdapterError("invalid_gateway_reservation");
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM gateway_requests WHERE budget_key=? AND request_id=?").get(this.policy.budget_key, requestId);
      if (row) {
        if (row.input_digest !== inputDigest) throw new RuntimeAdapterError("gateway_request_id_conflict");
        if (row.state === "completed" && typeof row.response === "string" && typeof row.response_digest === "string") return { replay: row.response, response_digest: row.response_digest };
        throw new RuntimeAdapterError("gateway_request_outcome_unproven");
      }
      const budget = this.db.prepare("SELECT blocked FROM gateway_budgets WHERE budget_key=?").get(this.policy.budget_key)!;
      if (budget.blocked === 1) throw new RuntimeAdapterError("gateway_budget_blocked");
      const total = this.db.prepare("SELECT COALESCE(SUM(held),0) AS held,COUNT(*) AS count FROM gateway_requests WHERE budget_key=?").get(this.policy.budget_key)!;
      if (Number(total.count) >= 4096 || Number(total.held) + this.policy.reservation_micro_units > this.policy.maximum_micro_units) throw new RuntimeAdapterError("gateway_budget_exhausted");
      this.db.prepare("INSERT INTO gateway_requests(budget_key,request_id,input_digest,held,state) VALUES(?,?,?,?,'reserved')")
        .run(this.policy.budget_key, requestId, inputDigest, this.policy.reservation_micro_units);
      return {};
    });
  }
  dispatch(requestId: string): void {
    this.transaction(() => {
      if (this.db.prepare("UPDATE gateway_requests SET state='dispatching' WHERE budget_key=? AND request_id=? AND state='reserved'").run(this.policy.budget_key, requestId).changes !== 1)
        throw new RuntimeAdapterError("gateway_dispatch_claim_unavailable");
    });
  }
  complete(requestId: string, response: string, responseDigest: string): void {
    if (Buffer.byteLength(response) > 32768 || !sha.test(responseDigest)) throw new RuntimeAdapterError("gateway_response_limit");
    this.transaction(() => {
      if (this.db.prepare("UPDATE gateway_requests SET state='completed',response=?,response_digest=? WHERE budget_key=? AND request_id=? AND state='dispatching'")
        .run(response, responseDigest, this.policy.budget_key, requestId).changes !== 1) throw new RuntimeAdapterError("gateway_completion_unproven");
    });
  }
  unknown(requestId: string, reason: string, block = false): void {
    if (!/^[a-z_]{1,96}$/.test(reason)) throw new RuntimeAdapterError("invalid_gateway_failure_reason");
    this.transaction(() => {
      this.db.prepare("UPDATE gateway_requests SET state='unknown',reason=? WHERE budget_key=? AND request_id=? AND state IN ('reserved','dispatching')").run(reason, this.policy.budget_key, requestId);
      if (block) this.db.prepare("UPDATE gateway_budgets SET blocked=1 WHERE budget_key=?").run(this.policy.budget_key);
    });
  }
  // Invoke only after the original gateway owner has ended. This is a
  // conservative reconciliation, never permission to resend an old request.
  reconcileEndedOwner(): number {
    return this.transaction(() => Number(this.db.prepare("UPDATE gateway_requests SET state='unknown',reason='gateway_owner_ended' WHERE budget_key=? AND state IN ('reserved','dispatching')").run(this.policy.budget_key).changes));
  }
  snapshot(): GatewayBudgetSnapshot {
    return this.transaction(() => {
      const rows = this.db.prepare("SELECT state,COUNT(*) AS count,SUM(held) AS held FROM gateway_requests WHERE budget_key=? GROUP BY state").all(this.policy.budget_key);
      const counts = { reserved: 0, dispatching: 0, completed: 0, unknown: 0 }; let held = 0;
      for (const row of rows) { counts[row.state as keyof typeof counts] = Number(row.count); held += Number(row.held); }
      return { currency: "TEST", maximum_micro_units: this.policy.maximum_micro_units, held_micro_units: held, ...counts,
        blocked: this.db.prepare("SELECT blocked FROM gateway_budgets WHERE budget_key=?").get(this.policy.budget_key)!.blocked === 1 };
    });
  }
  close(): void { this.db.close(); }
}
