import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute } from "node:path";
import { assertOrdinaryPath, directory, digest, RuntimeAdapterError } from "./files.js";
import { CODING_PLAN_RATE_OBSERVATION, estimateCodingPlanCredits } from "./gateway-billing.js";
import { parseCachedGatewayHttpResponse, type GatewayHttpResponse } from "./gateway-http.js";
import { GATEWAY_CONVERSATION_CONTRACT_BYTES, parseGatewayJson, parseGatewayConversationCacheContract, parseCachedGatewayConversationResponse,
  type GatewayConversationCacheContract, type GatewayConversationResponse } from "./gateway-conversation.js";

const sha = /^[a-f0-9]{64}$/, uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/, key = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/;
const unit = "ZHIPU_CODING_PLAN_CREDIT", applicationId = 0x43494d43, quantum = 1000000, maximum = 1000000000000;
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const ceiling = (value: unknown): value is number => integer(value, quantum, maximum) && value % quantum === 0;
function fail(reason: string): never { throw new RuntimeAdapterError(reason); }
export interface CreditProcessIdentity { pid: number; creation_ticks: string; image: string }
export type CreditOwnerState = "active" | "absent" | "unknown";
export interface GatewayCreditPolicy {
  format: "cimiloop/gateway-credit-rehearsal/1.0.0"; scope: "credit_budget_rehearsal";
  account_scope_digest: string; unit: typeof unit; model: "glm-5.3"; maximum_micro_units: number;
}
export interface GatewayCreditRequest { request_id: string; budget_key: string; input_digest: string; input_tokens: number; output_tokens: number }
export interface CreditReservation { readonly request_id: string; readonly request_digest: string; readonly held_micro_units: number }
export const GATEWAY_CREDIT_CACHE_ENTRY_BYTES = 270336;
export interface GatewayCreditCacheOptions { response_cache: { maximum_bytes: number; maximum_entries: number } }
export interface GatewayCreditConversationCacheOptions { conversation_cache: { maximum_bytes: number; maximum_entries: number } }
export const GATEWAY_CONVERSATION_CACHE_SLOT_BYTES = GATEWAY_CREDIT_CACHE_ENTRY_BYTES + GATEWAY_CONVERSATION_CONTRACT_BYTES;
type CachedResponse = GatewayHttpResponse | GatewayConversationResponse;
type Claim<Response> = { permit: CreditReservation; replay?: never; cached_response?: never } | { replay: CreditReceipt; permit?: never; cached_response?: Response };
export interface CreditReceipt extends CreditReservation {
  format: "cimiloop/gateway-credit-receipt/1.0.0"; scope: "credit_budget_rehearsal"; unit: typeof unit;
  rate_digest: string; response_digest: string; input_tokens: number; output_tokens: number;
  actual_cost_known: false; admission_ready: false;
}
export interface GatewayCreditSnapshot {
  scope: "credit_budget_rehearsal"; unit: typeof unit; account_scope_digest: string; policy_digest: string;
  maximum_micro_units: number; held_micro_units: number; remaining_micro_units: number;
  reserved: number; dispatching: number; completed: number; unknown: number; blocked: boolean;
  budgets: { budget_key: string; maximum_micro_units: number; held_micro_units: number }[];
  actual_cost_known: false; admission_ready: false;
}
interface Dependencies {
  // Trusted host code seams only. No JSON/CLI/Runtime can supply a clock or OS observer.
  identity: CreditProcessIdentity; observeOwner?: (identity: CreditProcessIdentity) => Promise<CreditOwnerState>; now?: () => number;
}
type Row = Record<string, SQLOutputValue>;
const validIdentity = (value: unknown): value is CreditProcessIdentity => exact(value, ["pid", "creation_ticks", "image"]) && integer(value.pid, 1, 2147483647) &&
  typeof value.creation_ticks === "string" && /^[1-9][0-9]{0,19}$/.test(value.creation_ticks) && typeof value.image === "string" && value.image.length <= 32768 && isAbsolute(value.image);
const ddl = [
  `CREATE TABLE credit_account (id INTEGER PRIMARY KEY CHECK(id=1), policy TEXT NOT NULL, policy_digest TEXT NOT NULL, blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1))) STRICT`,
  `CREATE TABLE credit_budgets (budget_key TEXT PRIMARY KEY, maximum INTEGER NOT NULL CHECK(maximum>0)) STRICT`,
  `CREATE TABLE credit_owners (nonce TEXT PRIMARY KEY, identity TEXT NOT NULL, identity_digest TEXT NOT NULL) STRICT`,
  `CREATE TABLE credit_requests (request_id TEXT PRIMARY KEY, budget_key TEXT NOT NULL REFERENCES credit_budgets(budget_key), owner_nonce TEXT NOT NULL REFERENCES credit_owners(nonce), input_digest TEXT NOT NULL, request_digest TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, held INTEGER NOT NULL CHECK(held>0), rate TEXT NOT NULL, rate_digest TEXT NOT NULL, reserved_at TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('reserved','dispatching','completed','unknown')), receipt TEXT, receipt_digest TEXT, reason TEXT) STRICT`
];
const cacheDdl = [
  `CREATE TABLE credit_cache_policy (id INTEGER PRIMARY KEY CHECK(id=1), policy TEXT NOT NULL, policy_digest TEXT NOT NULL) STRICT`,
  `CREATE TABLE credit_responses (request_id TEXT PRIMARY KEY REFERENCES credit_requests(request_id), response TEXT NOT NULL, response_digest TEXT NOT NULL) STRICT`
];
const conversationDdl = [`CREATE TABLE credit_conversation_contracts (request_id TEXT PRIMARY KEY REFERENCES credit_requests(request_id), contract TEXT NOT NULL, contract_digest TEXT NOT NULL) STRICT`];
const requestFrom = (row: Row): GatewayCreditRequest => ({ request_id: String(row.request_id), budget_key: String(row.budget_key), input_digest: String(row.input_digest), input_tokens: Number(row.input_tokens), output_tokens: Number(row.output_tokens) });
const validRequest = (value: unknown): value is GatewayCreditRequest => exact(value, ["request_id", "budget_key", "input_digest", "input_tokens", "output_tokens"]) &&
  typeof value.request_id === "string" && uuid.test(value.request_id) && typeof value.budget_key === "string" && key.test(value.budget_key) && typeof value.input_digest === "string" && sha.test(value.input_digest) &&
  integer(value.input_tokens, 0, 1048576) && integer(value.output_tokens, 0, 131072) && value.input_tokens + value.output_tokens > 0;
const requestDigest = (request: GatewayCreditRequest) => digest(JSON.stringify({ request_id: request.request_id, budget_key: request.budget_key,
  input_digest: request.input_digest, input_tokens: request.input_tokens, output_tokens: request.output_tokens })).value;
const rateFrom = (row: Row) => {
  const value: unknown = JSON.parse(String(row.rate));
  if (!exact(value, Object.keys(CODING_PLAN_RATE_OBSERVATION)) || value.format !== CODING_PLAN_RATE_OBSERVATION.format || value.provider !== "zhipuai-coding-plan" || value.model !== "glm-5.3" ||
    value.required_account_version !== "credit_based_personal_plan" || value.unit !== unit || value.source_url !== CODING_PLAN_RATE_OBSERVATION.source_url || typeof value.source_digest !== "string" || !sha.test(value.source_digest) ||
    typeof value.observed_on !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.observed_on) || typeof value.expires_at !== "string" || !Number.isFinite(Date.parse(value.expires_at)) ||
    !integer(value.micro_units_per_input_token, 1, 1000000) || !integer(value.micro_units_per_output_token, 1, 1000000) || value.cache_discount_applied !== false || value.off_peak_discount_applied !== false || value.reservation_quantum_micro_units !== quantum ||
    digest(String(row.rate)).value !== row.rate_digest) fail("credit_ledger_corrupt");
  const time = Date.parse(String(row.reserved_at)), start = Date.parse(value.observed_on + "T00:00:00+08:00"), end = Date.parse(value.expires_at);
  if (!Number.isFinite(time) || !Number.isFinite(start) || end <= start || time < start || time >= end) fail("credit_ledger_corrupt");
  return { input: value.micro_units_per_input_token, output: value.micro_units_per_output_token };
};
const bound = (input: number, output: number, rate: { input: number; output: number }) => Number(((BigInt(input) * BigInt(rate.input) + BigInt(output) * BigInt(rate.output) + 999999n) / 1000000n) * 1000000n);
const receiptFrom = (row: Row): CreditReceipt => {
  const value: unknown = JSON.parse(String(row.receipt));
  if (!exact(value, ["format", "scope", "unit", "request_id", "request_digest", "held_micro_units", "rate_digest", "response_digest", "input_tokens", "output_tokens", "actual_cost_known", "admission_ready"]) ||
    value.format !== "cimiloop/gateway-credit-receipt/1.0.0" || value.scope !== "credit_budget_rehearsal" || value.unit !== unit || value.request_id !== row.request_id || value.request_digest !== row.request_digest ||
    value.held_micro_units !== row.held || value.rate_digest !== row.rate_digest || typeof value.response_digest !== "string" || !sha.test(value.response_digest) || !integer(value.input_tokens, 0, Number(row.input_tokens)) ||
    !integer(value.output_tokens, 0, Number(row.output_tokens)) || value.actual_cost_known !== false || value.admission_ready !== false || digest(String(row.receipt)).value !== row.receipt_digest) fail("credit_ledger_corrupt");
  return Object.freeze(value) as unknown as CreditReceipt;
};

// A separate, unapproved credit rehearsal store. It never opens a credential,
// connects a socket, grants provider admission or converts credits into cash.
export class GatewayCreditLedger {
  readonly storageFormat: 1 | 2 | 3;
  private readonly db: DatabaseSync;
  private readonly policy: Readonly<GatewayCreditPolicy>;
  private readonly policyJson: string;
  private readonly owner = randomUUID();
  private readonly identity: Readonly<CreditProcessIdentity>;
  private readonly dependencies: Dependencies;
  private readonly permits = new WeakMap<CreditReservation, string>();
  private closed = false;
  private readonly cachePolicy: Readonly<{ maximum_bytes: number; maximum_entries: number }> | undefined;
  private readonly cachePolicyJson: string | undefined;
  constructor(path: string, policy: GatewayCreditPolicy, dependencies: Dependencies, options?: GatewayCreditCacheOptions | GatewayCreditConversationCacheOptions) {
    if (!exact(policy, ["format", "scope", "account_scope_digest", "unit", "model", "maximum_micro_units"]) || policy.format !== "cimiloop/gateway-credit-rehearsal/1.0.0" || policy.scope !== "credit_budget_rehearsal" ||
      policy.unit !== unit || policy.model !== "glm-5.3" || typeof policy.account_scope_digest !== "string" || !sha.test(policy.account_scope_digest) || !ceiling(policy.maximum_micro_units) || !validIdentity(dependencies.identity) || dependencies.identity.pid !== process.pid) fail("invalid_credit_rehearsal_policy");
    let cache: Record<string, unknown> | undefined;
    if (options !== undefined) {
      if (exact(options, ["response_cache"])) { this.storageFormat = 2; cache = options.response_cache as Record<string, unknown>; }
      else if (exact(options, ["conversation_cache"])) { this.storageFormat = 3; cache = options.conversation_cache as Record<string, unknown>; }
      else fail("invalid_credit_response_cache_policy");
      if (!exact(cache, ["maximum_bytes", "maximum_entries"]) || !integer(cache.maximum_bytes, this.storageFormat === 3 ? GATEWAY_CONVERSATION_CACHE_SLOT_BYTES : GATEWAY_CREDIT_CACHE_ENTRY_BYTES, 16777216) ||
        !integer(cache.maximum_entries, 1, 4096)) fail("invalid_credit_response_cache_policy");
    } else this.storageFormat = 1;
    this.cachePolicy = cache ? Object.freeze({ maximum_bytes: cache.maximum_bytes as number, maximum_entries: cache.maximum_entries as number }) : undefined;
    this.cachePolicyJson = this.cachePolicy ? JSON.stringify({ format: this.storageFormat === 3 ? "cimiloop/conversation-response-cache/1.0.0" : "cimiloop/credit-response-cache/1.0.0",
      scope: "credit_budget_rehearsal", maximum_entry_bytes: GATEWAY_CREDIT_CACHE_ENTRY_BYTES, ...(this.storageFormat === 3 ? { maximum_contract_bytes: GATEWAY_CONVERSATION_CONTRACT_BYTES } : {}), ...this.cachePolicy }) : undefined;
    this.policy = Object.freeze({ ...policy }); this.identity = Object.freeze({ ...dependencies.identity }); this.dependencies = { ...dependencies };
    this.policyJson = JSON.stringify({ format: policy.format, scope: policy.scope, account_scope_digest: policy.account_scope_digest, unit: policy.unit, model: policy.model, maximum_micro_units: policy.maximum_micro_units });
    path = assertOrdinaryPath(path); directory(dirname(path));
    for (const suffix of ["-wal", "-shm", "-journal"]) assertOrdinaryPath(path + suffix);
    this.db = new DatabaseSync(path, { timeout: 5000 });
    try {
      this.checkFormat(); this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
      this.transaction(() => {
        const created = this.checkFormat() === "empty";
        if (created) { for (const sql of this.schema()) this.db.exec(sql); this.db.exec(`PRAGMA application_id=${applicationId}; PRAGMA user_version=${this.storageFormat};`); }
        const account = this.db.prepare("SELECT * FROM credit_account").get();
        if (account && (account.policy !== this.policyJson || account.policy_digest !== digest(this.policyJson).value)) fail("credit_account_policy_conflict");
        if (!account) {
          if (!created) fail("credit_ledger_corrupt");
          this.db.prepare("INSERT INTO credit_account(id,policy,policy_digest) VALUES(1,?,?)").run(this.policyJson, digest(this.policyJson).value);
        }
        if (this.cachePolicyJson) {
          const cache = this.db.prepare("SELECT * FROM credit_cache_policy").get();
          if (cache && (cache.policy !== this.cachePolicyJson || cache.policy_digest !== digest(this.cachePolicyJson).value)) fail("credit_cache_policy_conflict");
          if (!cache) {
            if (!created) fail("credit_ledger_corrupt");
            this.db.prepare("INSERT INTO credit_cache_policy VALUES(1,?,?)").run(this.cachePolicyJson, digest(this.cachePolicyJson).value);
          }
        }
        this.validate();
      });
    } catch (error) { this.db.close(); throw error; }
  }
  private schema(): string[] { return [...ddl, ...(this.cachePolicy ? cacheDdl : []), ...(this.storageFormat === 3 ? conversationDdl : [])]; }
  private checkFormat(): "empty" | "owned" {
    const app = this.db.prepare("PRAGMA application_id").get()!.application_id, version = this.db.prepare("PRAGMA user_version").get()!.user_version;
    const schema = this.db.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY sql").all().map(row => String(row.sql));
    if (app === 0 && version === 0 && !schema.length) return "empty";
    if (app !== applicationId || version !== this.storageFormat || JSON.stringify(schema) !== JSON.stringify(this.schema().sort())) fail("credit_ledger_format_unavailable");
    return "owned";
  }
  private transaction<T>(body: () => T): T {
    if (this.closed) fail("credit_ledger_closed");
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = body(); this.db.exec("COMMIT"); return result; } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private validate(): void {
    try {
      this.checkFormat();
      if (this.db.prepare("PRAGMA quick_check").get()!.quick_check !== "ok" || this.db.prepare("PRAGMA foreign_key_check").all().length) fail("credit_ledger_corrupt");
      const accounts = this.db.prepare("SELECT * FROM credit_account").all();
      if (accounts.length !== 1 || accounts[0]!.policy !== this.policyJson || accounts[0]!.policy_digest !== digest(this.policyJson).value || ![0, 1].includes(Number(accounts[0]!.blocked))) fail("credit_ledger_corrupt");
      const budgets = this.db.prepare("SELECT * FROM credit_budgets").all(), totals = new Map<string, bigint>(); let total = 0n;
      if (budgets.length > 4096) fail("credit_ledger_corrupt");
      for (const row of budgets) if (!key.test(String(row.budget_key)) || !ceiling(row.maximum) || row.maximum > this.policy.maximum_micro_units) fail("credit_ledger_corrupt");
      for (const row of this.db.prepare("SELECT * FROM credit_owners").all()) {
        if (!uuid.test(String(row.nonce)) || !validIdentity(JSON.parse(String(row.identity))) || digest(String(row.identity)).value !== row.identity_digest) fail("credit_ledger_corrupt");
      }
      const rows = this.db.prepare("SELECT * FROM credit_requests").all(); if (rows.length > 4096) fail("credit_ledger_corrupt");
      for (const row of rows) {
        const request = requestFrom(row);
        if (!validRequest(request) || requestDigest(request) !== row.request_digest || !ceiling(row.held) || !["reserved", "dispatching", "completed", "unknown"].includes(String(row.state)) ||
          bound(request.input_tokens, request.output_tokens, rateFrom(row)) !== row.held) fail("credit_ledger_corrupt");
        if (row.state === "completed") { if (row.reason !== null) fail("credit_ledger_corrupt"); receiptFrom(row); }
        else if (row.receipt !== null || row.receipt_digest !== null || (row.state === "unknown" ? typeof row.reason !== "string" || !/^credit_[a-z_]{1,80}$/.test(row.reason) : row.reason !== null)) fail("credit_ledger_corrupt");
        total += BigInt(Number(row.held)); totals.set(request.budget_key, (totals.get(request.budget_key) ?? 0n) + BigInt(Number(row.held)));
      }
      if (total > BigInt(this.policy.maximum_micro_units) || budgets.some(row => (totals.get(String(row.budget_key)) ?? 0n) > BigInt(Number(row.maximum)))) fail("credit_ledger_corrupt");
      if (this.cachePolicy) {
        const policies = this.db.prepare("SELECT * FROM credit_cache_policy").all();
        if (policies.length !== 1 || policies[0]!.policy !== this.cachePolicyJson || policies[0]!.policy_digest !== digest(this.cachePolicyJson!).value) fail("credit_ledger_corrupt");
        const responses = this.db.prepare("SELECT * FROM credit_responses").all(); let bytes = 0;
        const requests = new Map(rows.map(row => [row.request_id, row]));
        if (this.storageFormat === 3) {
          const contracts = this.db.prepare("SELECT * FROM credit_conversation_contracts").all();
          if (contracts.length !== rows.length) fail("credit_ledger_corrupt");
          for (const stored of contracts) { const row = requests.get(stored.request_id); if (!row) fail("credit_ledger_corrupt"); this.conversationContract(row, stored); bytes += Buffer.byteLength(String(stored.contract)); }
        }
        if (responses.length !== rows.filter(row => row.state === "completed").length) fail("credit_ledger_corrupt");
        for (const cached of responses) { const row = requests.get(cached.request_id); if (!row || row.state !== "completed") fail("credit_ledger_corrupt"); this.cachedResponse(row, cached); bytes += Buffer.byteLength(String(cached.response)); }
        const pending = rows.filter(row => row.state === "reserved" || row.state === "dispatching").length;
        if (bytes + pending * GATEWAY_CREDIT_CACHE_ENTRY_BYTES > this.cachePolicy.maximum_bytes || (this.storageFormat === 3 ? rows.length : responses.length + pending) > this.cachePolicy.maximum_entries) fail("credit_ledger_corrupt");
      }
    } catch (error) { if (error instanceof RuntimeAdapterError) throw error; fail("credit_ledger_corrupt"); }
  }
  registerBudget(budgetKey: string, maximumMicroUnits: number): void {
    if (!key.test(budgetKey) || !ceiling(maximumMicroUnits) || maximumMicroUnits > this.policy.maximum_micro_units) fail("invalid_credit_budget");
    this.transaction(() => {
      this.validate(); const row = this.db.prepare("SELECT maximum FROM credit_budgets WHERE budget_key=?").get(budgetKey);
      if (row && row.maximum !== maximumMicroUnits) fail("credit_budget_policy_conflict");
      if (!row) {
        if (Number(this.db.prepare("SELECT COUNT(*) AS count FROM credit_budgets").get()!.count) >= 4096) fail("credit_budget_limit");
        this.db.prepare("INSERT INTO credit_budgets VALUES(?,?)").run(budgetKey, maximumMicroUnits);
      }
    });
  }
  reserve(input: GatewayCreditRequest): Claim<GatewayHttpResponse> {
    if (this.storageFormat === 3) fail("credit_conversation_cache_required");
    return this.reserveCore(input) as Claim<GatewayHttpResponse>;
  }
  reserveConversation(input: GatewayCreditRequest, value: GatewayConversationCacheContract): Claim<GatewayConversationResponse> {
    if (this.storageFormat !== 3) fail("credit_conversation_cache_unavailable");
    if (!validRequest(input)) fail("invalid_credit_request");
    const contract = parseGatewayConversationCacheContract(value);
    if (contract.request_id !== input.request_id || contract.input_digest !== input.input_digest || contract.input_tokens !== input.input_tokens || contract.output_tokens !== input.output_tokens) fail("credit_conversation_contract_conflict");
    return this.reserveCore(input, contract) as Claim<GatewayConversationResponse>;
  }
  private reserveCore(input: GatewayCreditRequest, contract?: GatewayConversationCacheContract): Claim<CachedResponse> {
    if (!validRequest(input)) fail("invalid_credit_request");
    const request = { ...input }, hash = requestDigest(request);
    return this.transaction(() => {
      this.validate(); const existing = this.db.prepare("SELECT * FROM credit_requests WHERE request_id=?").get(request.request_id);
      if (existing) {
        if (existing.request_digest !== hash) fail("credit_request_id_conflict");
        if (contract && JSON.stringify(this.conversationContract(existing)) !== JSON.stringify(contract)) fail("credit_conversation_contract_conflict");
        if (existing.state === "completed") return { replay: receiptFrom(existing), ...(this.cachePolicy ? { cached_response: this.cachedResponse(existing) } : {}) };
        fail("credit_request_outcome_unproven");
      }
      if (this.db.prepare("SELECT blocked FROM credit_account").get()!.blocked === 1) fail("credit_account_blocked");
      const budget = this.db.prepare("SELECT maximum FROM credit_budgets WHERE budget_key=?").get(request.budget_key); if (!budget) fail("credit_budget_unregistered");
      const now = this.dependencies.now?.() ?? Date.now(), estimate = estimateCodingPlanCredits({ input_tokens: request.input_tokens, output_tokens: request.output_tokens }, now);
      const held = estimate.estimated_upper_micro_units, total = this.db.prepare("SELECT COALESCE(SUM(held),0) AS held,COUNT(*) AS count FROM credit_requests").get()!;
      if (Number(total.count) >= 4096 || Number(total.held) + held > this.policy.maximum_micro_units) fail("credit_account_exhausted");
      const local = this.db.prepare("SELECT COALESCE(SUM(held),0) AS held FROM credit_requests WHERE budget_key=?").get(request.budget_key)!;
      if (Number(local.held) + held > Number(budget.maximum)) fail("credit_budget_exhausted");
      if (this.cachePolicy) {
        const cached = this.db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(response AS BLOB))),0) AS bytes FROM credit_responses").get()!;
        const pending = Number(this.db.prepare("SELECT COUNT(*) AS count FROM credit_requests WHERE state IN ('reserved','dispatching')").get()!.count) + 1;
        const stored = this.storageFormat === 3 ? this.db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(contract AS BLOB))),0) AS bytes FROM credit_conversation_contracts").get()! : undefined;
        const entries = stored ? Number(stored.count) + 1 : Number(cached.count) + pending;
        const bytes = Number(cached.bytes) + Number(stored?.bytes ?? 0) + (contract ? Buffer.byteLength(JSON.stringify(contract)) : 0) + pending * GATEWAY_CREDIT_CACHE_ENTRY_BYTES;
        if (entries > this.cachePolicy.maximum_entries || bytes > this.cachePolicy.maximum_bytes) fail("credit_response_cache_exhausted");
      }
      const identity = JSON.stringify(this.identity);
      this.db.prepare("INSERT OR IGNORE INTO credit_owners VALUES(?,?,?)").run(this.owner, identity, digest(identity).value);
      this.db.prepare("INSERT INTO credit_requests(request_id,budget_key,owner_nonce,input_digest,request_digest,input_tokens,output_tokens,held,rate,rate_digest,reserved_at,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,'reserved')")
        .run(request.request_id, request.budget_key, this.owner, request.input_digest, hash, request.input_tokens, request.output_tokens, held, JSON.stringify(CODING_PLAN_RATE_OBSERVATION), estimate.rate_digest.value, new Date(now).toISOString());
      if (contract) { const json = JSON.stringify(contract); this.db.prepare("INSERT INTO credit_conversation_contracts VALUES(?,?,?)").run(request.request_id, json, digest(json).value); }
      const permit = Object.freeze({ request_id: request.request_id, request_digest: hash, held_micro_units: held }); this.permits.set(permit, request.request_id); return { permit };
    });
  }
  private owned(permit: CreditReservation): Row {
    const id = this.permits.get(permit); if (!id) fail("credit_reservation_unowned");
    const row = this.db.prepare("SELECT * FROM credit_requests WHERE request_id=? AND owner_nonce=?").get(id, this.owner);
    if (!row || row.request_digest !== permit.request_digest || row.held !== permit.held_micro_units) fail("credit_reservation_unowned");
    return row;
  }
  dispatch(permit: CreditReservation): void {
    this.transaction(() => { this.validate(); const row = this.owned(permit);
      if (row.state !== "reserved" || this.db.prepare("SELECT blocked FROM credit_account").get()!.blocked === 1) fail("credit_dispatch_unavailable");
      const estimate = estimateCodingPlanCredits({ input_tokens: Number(row.input_tokens), output_tokens: Number(row.output_tokens) }, this.dependencies.now?.() ?? Date.now());
      if (estimate.rate_digest.value !== row.rate_digest) fail("credit_rate_observation_changed");
      this.db.prepare("UPDATE credit_requests SET state='dispatching' WHERE request_id=?").run(permit.request_id);
    });
  }
  private conversationContract(row: Row, stored = this.db.prepare("SELECT * FROM credit_conversation_contracts WHERE request_id=?").get(row.request_id!)): GatewayConversationCacheContract {
    try {
      if (!stored || Buffer.byteLength(String(stored.contract)) > GATEWAY_CONVERSATION_CONTRACT_BYTES || digest(String(stored.contract)).value !== stored.contract_digest) fail("credit_ledger_corrupt");
      const contract = parseGatewayConversationCacheContract(parseGatewayJson(String(stored.contract), GATEWAY_CONVERSATION_CONTRACT_BYTES));
      if (JSON.stringify(contract) !== stored.contract || contract.request_id !== row.request_id || contract.input_digest !== row.input_digest || contract.input_tokens !== row.input_tokens || contract.output_tokens !== row.output_tokens) fail("credit_ledger_corrupt");
      return contract;
    } catch { fail("credit_ledger_corrupt"); }
  }
  private cachedResponse(row: Row, cached = this.db.prepare("SELECT * FROM credit_responses WHERE request_id=?").get(row.request_id!)): CachedResponse {
    try {
      if (!cached || Buffer.byteLength(String(cached.response)) > GATEWAY_CREDIT_CACHE_ENTRY_BYTES || digest(String(cached.response)).value !== cached.response_digest) fail("credit_ledger_corrupt");
      const response = this.storageFormat === 3 ? parseCachedGatewayConversationResponse(parseGatewayJson(String(cached.response), GATEWAY_CREDIT_CACHE_ENTRY_BYTES), this.conversationContract(row)) : parseCachedGatewayHttpResponse(JSON.parse(String(cached.response))), receipt = receiptFrom(row);
      if (response.request_id !== row.request_id || response.input_digest !== row.input_digest || response.response_digest !== receipt.response_digest ||
        response.usage.input_tokens !== receipt.input_tokens || response.usage.output_tokens !== receipt.output_tokens) fail("credit_ledger_corrupt");
      return response;
    } catch { fail("credit_ledger_corrupt"); }
  }
  completeCached(permit: CreditReservation, input: GatewayHttpResponse, checkpoint?: () => void): CreditReceipt {
    if (!this.cachePolicy) fail("credit_response_cache_unavailable");
    if (this.storageFormat === 3) fail("credit_conversation_cache_required");
    const response = parseCachedGatewayHttpResponse(input);
    if (Buffer.byteLength(JSON.stringify(response)) > GATEWAY_CREDIT_CACHE_ENTRY_BYTES) fail("credit_response_cache_entry_limit");
    return this.finishCompletion(permit, { response_digest: response.response_digest, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }, response, checkpoint);
  }
  completeConversationCached(permit: CreditReservation, input: GatewayConversationResponse, checkpoint?: () => void): CreditReceipt {
    if (this.storageFormat !== 3) fail("credit_conversation_cache_unavailable");
    const response = this.transaction(() => { this.validate(); return parseCachedGatewayConversationResponse(input, this.conversationContract(this.owned(permit))); });
    return this.finishCompletion(permit, { response_digest: response.response_digest, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }, response, checkpoint);
  }
  complete(permit: CreditReservation, input: { response_digest: string; input_tokens: number; output_tokens: number }): CreditReceipt {
    if (this.cachePolicy) fail("credit_response_cache_required");
    return this.finishCompletion(permit, input);
  }
  private finishCompletion(permit: CreditReservation, input: { response_digest: string; input_tokens: number; output_tokens: number }, response?: CachedResponse, checkpoint?: () => void): CreditReceipt {
    if (!exact(input, ["response_digest", "input_tokens", "output_tokens"]) || typeof input.response_digest !== "string" || !sha.test(input.response_digest) || !integer(input.input_tokens, 0, 1048576) || !integer(input.output_tokens, 0, 131072)) fail("invalid_credit_completion");
    const outcome = this.transaction(() => {
      this.validate(); const row = this.owned(permit);
      if (response && (response.request_id !== row.request_id || response.input_digest !== row.input_digest)) fail("credit_cached_response_conflict");
      if (row.state === "completed") {
        const receipt = receiptFrom(row); if (receipt.response_digest !== input.response_digest || receipt.input_tokens !== input.input_tokens || receipt.output_tokens !== input.output_tokens ||
          response && JSON.stringify(this.cachedResponse(row)) !== JSON.stringify(response)) fail("credit_completion_conflict"); return receipt;
      }
      if (row.state !== "dispatching") fail("credit_completion_unproven");
      if (input.input_tokens > Number(row.input_tokens) || input.output_tokens > Number(row.output_tokens)) {
        this.db.prepare("UPDATE credit_requests SET state='unknown',reason='credit_usage_bound_exceeded' WHERE request_id=?").run(permit.request_id);
        this.db.exec("UPDATE credit_account SET blocked=1"); return undefined;
      }
      const receipt: CreditReceipt = Object.freeze({ format: "cimiloop/gateway-credit-receipt/1.0.0", scope: "credit_budget_rehearsal", unit, ...permit, rate_digest: String(row.rate_digest),
        response_digest: input.response_digest, input_tokens: input.input_tokens, output_tokens: input.output_tokens, actual_cost_known: false, admission_ready: false });
      const serialized = JSON.stringify(receipt);
      checkpoint?.();
      if (response) { const cached = JSON.stringify(response); this.db.prepare("INSERT INTO credit_responses VALUES(?,?,?)").run(permit.request_id, cached, digest(cached).value); }
      this.db.prepare("UPDATE credit_requests SET state='completed',receipt=?,receipt_digest=? WHERE request_id=?").run(serialized, digest(serialized).value, permit.request_id);
      this.validate(); checkpoint?.(); return receipt;
    });
    if (!outcome) fail("credit_usage_bound_exceeded"); return outcome;
  }
  unknown(permit: CreditReservation, reason = "credit_request_cancelled", blockAccount = false): void {
    if (typeof reason !== "string" || !/^credit_[a-z_]{1,80}$/.test(reason) || typeof blockAccount !== "boolean") fail("invalid_credit_failure_reason");
    this.transaction(() => { this.validate(); const row = this.owned(permit);
      if (["reserved", "dispatching"].includes(String(row.state))) {
        this.db.prepare("UPDATE credit_requests SET state='unknown',reason=? WHERE request_id=?").run(reason, permit.request_id);
      }
      if (blockAccount && row.state !== "completed") this.db.exec("UPDATE credit_account SET blocked=1");
    });
  }
  cacheSnapshot(): { storage_format: 2 | 3; entries: number; stored_bytes: number; pending_reserved_bytes: number; maximum_entries: number; maximum_bytes: number; contract_entries?: number; contract_bytes?: number } {
    if (!this.cachePolicy) fail("credit_response_cache_unavailable");
    return this.transaction(() => {
      this.validate(); const row = this.db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(response AS BLOB))),0) AS bytes FROM credit_responses").get()!;
      const pending = Number(this.db.prepare("SELECT COUNT(*) AS count FROM credit_requests WHERE state IN ('reserved','dispatching')").get()!.count);
      const contracts = this.storageFormat === 3 ? this.db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(length(CAST(contract AS BLOB))),0) AS bytes FROM credit_conversation_contracts").get()! : undefined;
      return { storage_format: this.storageFormat as 2 | 3, entries: Number(row.count), stored_bytes: Number(row.bytes) + Number(contracts?.bytes ?? 0), pending_reserved_bytes: pending * GATEWAY_CREDIT_CACHE_ENTRY_BYTES, ...this.cachePolicy!,
        ...(contracts ? { contract_entries: Number(contracts.count), contract_bytes: Number(contracts.bytes) } : {}) };
    });
  }
  async reconcileOwners(): Promise<{ reconciled_requests: number; active_owners: number; unknown_owners: number; verified_ended_owners: number }> {
    const owners = this.transaction(() => { this.validate(); return this.db.prepare("SELECT DISTINCT o.* FROM credit_owners o JOIN credit_requests r ON r.owner_nonce=o.nonce WHERE r.state IN ('reserved','dispatching')").all(); });
    const result = { reconciled_requests: 0, active_owners: 0, unknown_owners: 0, verified_ended_owners: 0 };
    for (const owner of owners) {
      let state: CreditOwnerState = "unknown";
      try { state = await this.dependencies.observeOwner?.(JSON.parse(String(owner.identity))) ?? "unknown"; } catch { }
      if (state === "active") { result.active_owners++; continue; }
      if (state !== "absent") { result.unknown_owners++; continue; }
      result.verified_ended_owners++;
      result.reconciled_requests += this.transaction(() => {
        this.validate(); const current = this.db.prepare("SELECT * FROM credit_owners WHERE nonce=?").get(owner.nonce!);
        if (!current || current.identity !== owner.identity || current.identity_digest !== owner.identity_digest) fail("credit_owner_proof_changed");
        return Number(this.db.prepare("UPDATE credit_requests SET state='unknown',reason='credit_owner_ended' WHERE owner_nonce=? AND state IN ('reserved','dispatching')").run(owner.nonce!).changes);
      });
    }
    return result;
  }
  snapshot(): GatewayCreditSnapshot {
    return this.transaction(() => {
      this.validate(); const counts = { reserved: 0, dispatching: 0, completed: 0, unknown: 0 }; let held = 0;
      for (const row of this.db.prepare("SELECT state,COUNT(*) AS count,SUM(held) AS held FROM credit_requests GROUP BY state").all()) { counts[row.state as keyof typeof counts] = Number(row.count); held += Number(row.held); }
      const budgets = this.db.prepare("SELECT b.budget_key,b.maximum,COALESCE(SUM(r.held),0) AS held FROM credit_budgets b LEFT JOIN credit_requests r ON r.budget_key=b.budget_key GROUP BY b.budget_key ORDER BY b.budget_key").all()
        .map(row => ({ budget_key: String(row.budget_key), maximum_micro_units: Number(row.maximum), held_micro_units: Number(row.held) }));
      return { scope: "credit_budget_rehearsal", unit, account_scope_digest: this.policy.account_scope_digest, policy_digest: digest(this.policyJson).value, maximum_micro_units: this.policy.maximum_micro_units,
        held_micro_units: held, remaining_micro_units: this.policy.maximum_micro_units - held, ...counts, blocked: this.db.prepare("SELECT blocked FROM credit_account").get()!.blocked === 1,
        budgets, actual_cost_known: false, admission_ready: false };
    });
  }
  close(): void {
    if (this.closed) return;
    try { this.transaction(() => { this.validate(); this.db.prepare("UPDATE credit_requests SET state='unknown',reason='credit_owner_closed' WHERE owner_nonce=? AND state IN ('reserved','dispatching')").run(this.owner); }); }
    finally { this.closed = true; this.db.close(); }
  }
}
