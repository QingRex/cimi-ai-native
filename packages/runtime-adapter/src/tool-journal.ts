import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute } from "node:path";
import { compileValidator, ToolAuthorityAssessmentSchema, type ToolAuthorityAssessment, type ToolAuthorityRequest } from "@cimiloop/protocol/v2";
import { assertOrdinaryPath, directory, digest, RuntimeAdapterError } from "./files.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import type { CreditProcessIdentity, CreditOwnerState } from "./gateway-credit.js";

const sha = /^[a-f0-9]{64}$/, uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const domainId = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const TOOL_FILE_BYTES = 16384, TOOL_RECORD_BYTES = 114688, TOOL_SLOT_BYTES = 2 * TOOL_RECORD_BYTES;
const appId = 0x43494d54;
function fail(reason: string): never { throw new RuntimeAdapterError(reason); }
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.isWellFormed() && Buffer.byteLength(value) <= max;
const identityValid = (value: unknown): value is CreditProcessIdentity => exact(value, ["pid", "creation_ticks", "image"]) && integer(value.pid, 1, 2147483647) &&
  typeof value.creation_ticks === "string" && /^[1-9][0-9]{0,19}$/.test(value.creation_ticks) && text(value.image, 32768) && isAbsolute(value.image);

// Reject executable objects before serialization. Used at the trusted host
// boundary as well as for caller frames; no getters/toJSON can run here.
export function copyToolJson(input: unknown): unknown {
  let nodes = 0;
  const visit = (value: unknown, depth: number): unknown => {
    if (depth > 16 || ++nodes > 4096) fail("tool_contract_invalid");
    if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.isWellFormed()) return value;
    if (!value || typeof value !== "object") fail("tool_contract_invalid");
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) fail("tool_contract_invalid");
      return Array.from({ length: value.length }, (_, i) => { const item = Object.getOwnPropertyDescriptor(value, String(i)); if (!item || !("value" in item)) fail("tool_contract_invalid"); return visit(item.value, depth + 1); });
    }
    if (prototype !== null && prototype !== Object.prototype) fail("tool_contract_invalid");
    const result: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || ["__proto__", "prototype", "constructor", "toJSON"].includes(key)) fail("tool_contract_invalid");
      const item = Object.getOwnPropertyDescriptor(value, key)!; if (!("value" in item) || !item.enumerable) fail("tool_contract_invalid");
      result[key] = visit(item.value, depth + 1);
    }
    return result;
  };
  return visit(input, 0);
}

export interface ToolInvocation {
  format: "cimiloop/public-tool-invocation/1.0.0"; project_id: string; run_id: string; operation_key: string;
  executor_actor_id: string; context_digest: { algorithm: "sha256"; value: string }; call_id: string;
  tool: "read_file" | "replace_file"; path: string; expected_digest: string; replacement_utf8?: string;
}
export const parseToolInvocation = (input: unknown): ToolInvocation => {
  const value = copyToolJson(input), keys = ["format", "project_id", "run_id", "operation_key", "executor_actor_id", "context_digest", "call_id", "tool", "path", "expected_digest"];
  if (!exact(value, [...keys, ...(value && typeof value === "object" && "tool" in value && value.tool === "replace_file" ? ["replacement_utf8"] : [])]) ||
    value.format !== "cimiloop/public-tool-invocation/1.0.0" || ![value.project_id, value.run_id, value.operation_key, value.executor_actor_id].every(id => typeof id === "string" && domainId.test(id)) ||
    !exact(value.context_digest, ["algorithm", "value"]) || value.context_digest.algorithm !== "sha256" || typeof value.context_digest.value !== "string" || !sha.test(value.context_digest.value) ||
    typeof value.call_id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.call_id) || !["read_file", "replace_file"].includes(String(value.tool)) ||
    !text(value.path, 1024) || !value.path || /[\\:%*?\x00-\x1f]/.test(value.path) || value.path.split("/").some(part => !part || part === "." || part === ".." || part !== part.trim() || part.endsWith(".")) ||
    [".git", ".cimiloop"].includes(value.path.split("/")[0]!.toLowerCase()) || typeof value.expected_digest !== "string" || !sha.test(value.expected_digest) ||
    (value.tool === "replace_file" && !text(value.replacement_utf8, TOOL_FILE_BYTES))) fail("tool_contract_invalid");
  const result: ToolInvocation = { format: "cimiloop/public-tool-invocation/1.0.0", project_id: String(value.project_id), run_id: String(value.run_id), operation_key: String(value.operation_key),
    executor_actor_id: String(value.executor_actor_id), context_digest: { algorithm: "sha256", value: value.context_digest.value }, call_id: value.call_id, tool: value.tool as ToolInvocation["tool"], path: value.path, expected_digest: value.expected_digest,
    ...(value.tool === "replace_file" ? { replacement_utf8: value.replacement_utf8 as string } : {}) };
  if (Buffer.byteLength(JSON.stringify(result)) > TOOL_RECORD_BYTES) fail("tool_contract_invalid");
  return result;
};
export const toolAuthorityRequest = (input: ToolInvocation): ToolAuthorityRequest => ({ project_id: input.project_id, run_id: input.run_id, operation_key: input.operation_key,
  executor_actor_id: input.executor_actor_id, context_digest: { ...input.context_digest }, action: input.tool === "read_file" ? "read_files" : "edit_files", resource: input.path });
const requestHash = (input: ToolInvocation) => digest(JSON.stringify(input)).value;
export const parseToolAssessment = (value: unknown, request: ToolAuthorityRequest): ToolAuthorityAssessment => {
  let result: ToolAuthorityAssessment;
  try { result = compileValidator<ToolAuthorityAssessment>(ToolAuthorityAssessmentSchema)(copyToolJson(value)); }
  catch { fail("tool_authority_unproven"); }
  const original = result.request;
  if (original.project_id !== request.project_id || original.run_id !== request.run_id || original.operation_key !== request.operation_key ||
    original.executor_actor_id !== request.executor_actor_id || original.context_digest.value !== request.context_digest.value || original.action !== request.action || original.resource !== request.resource) fail("tool_authority_unproven");
  if (result.decision !== "ALLOW") fail("tool_authority_denied");
  return result;
};
export interface ToolReceipt {
  format: "cimiloop/public-tool-receipt/1.0.0"; scope: "public_tool_rehearsal"; run_id: string; call_id: string;
  input_digest: string; authority_basis_digest: string; tool: ToolInvocation["tool"]; path: string;
  before_digest: string; after_digest: string; text: string | null; formal_agent_execution_enabled: false;
}
export interface ToolJournalPolicy {
  format: "cimiloop/public-tool-journal/1.0.0"; scope: "public_tool_rehearsal"; project_id: string;
  fixture_scope_digest: string; maximum_entries: number; maximum_bytes: number;
}
export interface ToolOwnerDependencies {
  identity: CreditProcessIdentity; observeOwner?: (owner: CreditProcessIdentity) => Promise<CreditOwnerState>;
}
export interface ToolPermit { readonly run_id: string; readonly call_id: string; readonly input_digest: string }
type State = "reserved" | "executing" | "completed" | "unknown" | "not_started";
type Row = Record<string, SQLOutputValue>;
const ddl = [
  `CREATE TABLE tool_policy (id INTEGER PRIMARY KEY CHECK(id=1), policy TEXT NOT NULL, digest TEXT NOT NULL) STRICT`,
  `CREATE TABLE tool_calls (run_id TEXT NOT NULL, call_id TEXT NOT NULL, input TEXT NOT NULL, input_digest TEXT NOT NULL, basis_digest TEXT NOT NULL, owner_nonce TEXT NOT NULL, owner TEXT NOT NULL, owner_digest TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('reserved','executing','completed','unknown','not_started')), receipt TEXT, receipt_digest TEXT, PRIMARY KEY(run_id,call_id)) STRICT`
];

// Independent rehearsal database; never mutates the native Run/Task ledger or
// the model-credit store. Its bytes are trusted host facts, not Runtime output.
export class ToolJournal {
  private readonly db: DatabaseSync;
  private readonly policy: ToolJournalPolicy;
  private readonly policyJson: string;
  private readonly dependencies: ToolOwnerDependencies;
  private readonly nonce = randomUUID();
  private readonly permits = new WeakMap<ToolPermit, string>();
  private closed = false;
  constructor(path: string, policy: ToolJournalPolicy, dependencies: ToolOwnerDependencies) {
    const p = copyToolJson(policy);
    if (!exact(p, ["format", "scope", "project_id", "fixture_scope_digest", "maximum_entries", "maximum_bytes"]) || p.format !== "cimiloop/public-tool-journal/1.0.0" ||
      p.scope !== "public_tool_rehearsal" || typeof p.project_id !== "string" || !domainId.test(p.project_id) || typeof p.fixture_scope_digest !== "string" || !sha.test(p.fixture_scope_digest) ||
      !integer(p.maximum_entries, 1, 32) || !integer(p.maximum_bytes, TOOL_SLOT_BYTES, 8388608) || !identityValid(dependencies.identity) || dependencies.identity.pid !== process.pid) fail("tool_journal_policy_invalid");
    this.policy = Object.freeze(p as unknown as ToolJournalPolicy); this.policyJson = JSON.stringify(p);
    this.dependencies = { ...dependencies, identity: Object.freeze({ ...dependencies.identity }) };
    path = assertOrdinaryPath(path); directory(dirname(path)); for (const suffix of ["-wal", "-shm", "-journal"]) assertOrdinaryPath(path + suffix);
    this.db = new DatabaseSync(path, { timeout: 5000 });
    try {
      this.checkFormat(); this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
      this.transaction(() => {
        if (this.checkFormat() === "empty") { for (const sql of ddl) this.db.exec(sql); this.db.exec(`PRAGMA application_id=${appId}; PRAGMA user_version=1;`); this.db.prepare("INSERT INTO tool_policy VALUES(1,?,?)").run(this.policyJson, digest(this.policyJson).value); }
        this.validate();
      });
    } catch (error) { this.db.close(); throw error; }
  }
  assertFixture(scopeDigest: string): void { if (scopeDigest !== this.policy.fixture_scope_digest) fail("tool_fixture_scope_mismatch"); }
  private checkFormat(): "empty" | "owned" {
    const app = this.db.prepare("PRAGMA application_id").get()!.application_id, version = this.db.prepare("PRAGMA user_version").get()!.user_version;
    const schema = this.db.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY sql").all().map(row => String(row.sql));
    if (app === 0 && version === 0 && !schema.length) return "empty";
    if (app !== appId || version !== 1 || JSON.stringify(schema) !== JSON.stringify([...ddl].sort())) fail("tool_journal_format_unavailable");
    return "owned";
  }
  private transaction<T>(body: () => T): T {
    if (this.closed) fail("tool_journal_closed"); this.db.exec("BEGIN IMMEDIATE");
    try { const result = body(); this.db.exec("COMMIT"); return result; } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private receipt(row: Row, input: ToolInvocation): ToolReceipt {
    const value = parseGatewayJson(String(row.receipt), TOOL_RECORD_BYTES);
    if (!exact(value, ["format", "scope", "run_id", "call_id", "input_digest", "authority_basis_digest", "tool", "path", "before_digest", "after_digest", "text", "formal_agent_execution_enabled"]) ||
      value.format !== "cimiloop/public-tool-receipt/1.0.0" || value.scope !== "public_tool_rehearsal" || value.run_id !== input.run_id || value.call_id !== input.call_id || value.input_digest !== row.input_digest ||
      value.authority_basis_digest !== row.basis_digest || value.tool !== input.tool || value.path !== input.path || value.before_digest !== input.expected_digest || value.formal_agent_execution_enabled !== false ||
      (input.tool === "read_file" ? !text(value.text, TOOL_FILE_BYTES) || digest(value.text).value !== input.expected_digest || value.after_digest !== input.expected_digest : value.text !== null || value.after_digest !== digest(input.replacement_utf8!).value) ||
      digest(String(row.receipt)).value !== row.receipt_digest) fail("tool_journal_corrupt");
    return structuredClone(value) as unknown as ToolReceipt;
  }
  private validate(): void {
    try {
      this.checkFormat(); if (this.db.prepare("PRAGMA quick_check").get()!.quick_check !== "ok") fail("tool_journal_corrupt");
      const policies = this.db.prepare("SELECT * FROM tool_policy").all();
      if (policies.length !== 1 || policies[0]!.policy !== this.policyJson || policies[0]!.digest !== digest(this.policyJson).value) fail("tool_journal_policy_conflict");
      const rows = this.db.prepare("SELECT * FROM tool_calls").all();
      if (rows.length > this.policy.maximum_entries || rows.length * TOOL_SLOT_BYTES > this.policy.maximum_bytes) fail("tool_journal_corrupt");
      for (const row of rows) {
        const input = parseToolInvocation(parseGatewayJson(String(row.input), TOOL_RECORD_BYTES));
        if (input.project_id !== this.policy.project_id || input.run_id !== row.run_id || input.call_id !== row.call_id || requestHash(input) !== row.input_digest ||
          typeof row.basis_digest !== "string" || !sha.test(row.basis_digest) || typeof row.owner_nonce !== "string" || !uuid.test(row.owner_nonce) ||
          !identityValid(parseGatewayJson(String(row.owner))) || digest(String(row.owner)).value !== row.owner_digest) fail("tool_journal_corrupt");
        if (row.state === "completed") this.receipt(row, input);
        else if (!["reserved", "executing", "unknown", "not_started"].includes(String(row.state)) || row.receipt !== null || row.receipt_digest !== null) fail("tool_journal_corrupt");
      }
    } catch (error) { if (error instanceof RuntimeAdapterError) throw error; fail("tool_journal_corrupt"); }
  }
  claim(input: unknown, assessment: unknown): { permit: ToolPermit; replay?: never } | { replay: ToolReceipt; permit?: never } {
    const request = parseToolInvocation(input), authority = parseToolAssessment(assessment, toolAuthorityRequest(request));
    if (authority.decision !== "ALLOW") fail("tool_authority_denied");
    if (request.project_id !== this.policy.project_id) fail("tool_project_mismatch");
    const inputDigest = requestHash(request), basis = authority.authority.basis_digest.value;
    return this.transaction(() => {
      this.validate(); const row = this.db.prepare("SELECT * FROM tool_calls WHERE run_id=? AND call_id=?").get(request.run_id, request.call_id);
      if (row) {
        if (row.input_digest !== inputDigest || row.basis_digest !== basis) fail("tool_call_id_conflict");
        if (row.state === "completed") return { replay: this.receipt(row, request) };
        fail(row.state === "not_started" ? "tool_not_started" : "tool_outcome_unproven");
      }
      const rows = this.db.prepare("SELECT input,state FROM tool_calls").all();
      if (rows.length >= this.policy.maximum_entries || (rows.length + 1) * TOOL_SLOT_BYTES > this.policy.maximum_bytes) fail("tool_journal_capacity_exhausted");
      if (rows.some(row => ["reserved", "executing", "unknown"].includes(String(row.state)) &&
        ((JSON.parse(String(row.input)) as ToolInvocation).run_id === request.run_id || (JSON.parse(String(row.input)) as ToolInvocation).path === request.path))) fail("tool_effect_in_flight");
      const owner = JSON.stringify(this.dependencies.identity);
      this.db.prepare("INSERT INTO tool_calls VALUES(?,?,?,?,?,?,?,?, 'reserved',NULL,NULL)").run(request.run_id, request.call_id, JSON.stringify(request), inputDigest, basis, this.nonce, owner, digest(owner).value);
      const permit = Object.freeze({ run_id: request.run_id, call_id: request.call_id, input_digest: inputDigest }); this.permits.set(permit, basis); return { permit };
    });
  }
  private owned(permit: ToolPermit, expected: State): Row {
    const basis = this.permits.get(permit); if (!basis) fail("tool_permit_unowned"); this.validate();
    const row = this.db.prepare("SELECT * FROM tool_calls WHERE run_id=? AND call_id=?").get(permit.run_id, permit.call_id);
    if (!row || row.owner_nonce !== this.nonce || row.state !== expected || row.input_digest !== permit.input_digest || row.basis_digest !== basis) fail("tool_permit_stale");
    return row;
  }
  dispatch(permit: ToolPermit): void { this.transaction(() => { this.owned(permit, "reserved"); this.db.prepare("UPDATE tool_calls SET state='executing' WHERE run_id=? AND call_id=?").run(permit.run_id, permit.call_id); }); }
  stop(permit: ToolPermit, dispatched: boolean): void {
    this.transaction(() => { this.owned(permit, dispatched ? "executing" : "reserved"); this.db.prepare("UPDATE tool_calls SET state=? WHERE run_id=? AND call_id=?").run(dispatched ? "unknown" : "not_started", permit.run_id, permit.call_id); });
    this.permits.delete(permit);
  }
  complete(permit: ToolPermit, input: ToolInvocation, value: { before_digest: string; after_digest: string; text: string | null }): ToolReceipt {
    const result = this.transaction(() => {
      const row = this.owned(permit, "executing"), receipt: ToolReceipt = { format: "cimiloop/public-tool-receipt/1.0.0", scope: "public_tool_rehearsal", run_id: permit.run_id,
        call_id: permit.call_id, input_digest: permit.input_digest, authority_basis_digest: String(row.basis_digest), tool: input.tool, path: input.path, ...value, formal_agent_execution_enabled: false };
      if (requestHash(parseToolInvocation(input)) !== permit.input_digest) fail("tool_call_id_conflict");
      const json = JSON.stringify(receipt); this.receipt({ ...row, receipt: json, receipt_digest: digest(json).value }, input);
      this.db.prepare("UPDATE tool_calls SET state='completed',receipt=?,receipt_digest=? WHERE run_id=? AND call_id=?").run(json, digest(json).value, permit.run_id, permit.call_id);
      return structuredClone(receipt);
    });
    this.permits.delete(permit); return result;
  }
  snapshot(): { reserved: number; executing: number; completed: number; unknown: number; not_started: number } {
    return this.transaction(() => { this.validate(); const result = { reserved: 0, executing: 0, completed: 0, unknown: 0, not_started: 0 };
      for (const row of this.db.prepare("SELECT state FROM tool_calls").all()) result[row.state as State]++; return result; });
  }
  async reconcileOwners(): Promise<{ reconciled: number; active: number; unknown_owners: number }> {
    const owners = this.transaction(() => { this.validate(); return this.db.prepare("SELECT DISTINCT owner_nonce,owner FROM tool_calls WHERE state IN ('reserved','executing')").all(); });
    const result = { reconciled: 0, active: 0, unknown_owners: 0 };
    for (const row of owners) {
      let state: CreditOwnerState = "unknown";
      try { state = await this.dependencies.observeOwner?.(JSON.parse(String(row.owner)) as CreditProcessIdentity) ?? "unknown"; } catch { /* No verified absence. */ }
      if (state !== "absent") { if (state === "active") result.active++; else result.unknown_owners++; continue; }
      result.reconciled += this.transaction(() => { this.validate(); return Number(this.db.prepare("UPDATE tool_calls SET state=CASE state WHEN 'reserved' THEN 'not_started' ELSE 'unknown' END WHERE owner_nonce=? AND owner=? AND state IN ('reserved','executing')").run(String(row.owner_nonce), String(row.owner)).changes); });
    }
    return result;
  }
  close(): void { if (!this.closed) { this.db.close(); this.closed = true; } }
}
