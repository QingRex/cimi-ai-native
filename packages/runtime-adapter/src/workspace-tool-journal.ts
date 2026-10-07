import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { copyToolJson, parseToolAssessment, TOOL_RECORD_BYTES } from "./tool-journal.js";
import { parseWorkspaceToolInvocation, parseWorkspacePreparation, parseWorkspaceCompletion, validWorkspaceFileIdentity, validWorkspaceWorkerIdentity,
  type WorkspaceToolInvocation, type WorkspaceNativePreparation, type WorkspaceNativeCompletion, type WorkspaceFileIdentity, type WorkspaceStagingOutcome } from "./workspace-files.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import { assertOrdinaryPath, directory, digest, RuntimeAdapterError } from "./files.js";
import type { CreditProcessIdentity, CreditOwnerState } from "./gateway-credit.js";
import type { ToolAuthorityRequest } from "@cimiloop/protocol/v2";
import { agentWorkspaceToolAuthorityRequest, parseAgentToolAssessment, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";

const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const sha = /^[a-f0-9]{64}$/, domainId = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const hash = (value: unknown) => digest(JSON.stringify(value)).value;
function fail(reason: string): never { throw new RuntimeAdapterError(reason); }
export const workspaceToolAuthorityRequest = (input: WorkspaceToolInvocation): ToolAuthorityRequest => ({ project_id: input.project_id, run_id: input.run_id, operation_key: input.operation_key,
  executor_actor_id: input.executor_actor_id, context_digest: { ...input.context_digest }, action: input.tool === "read_file" ? "read_files" : "edit_files", resource: input.path });
export interface WorkspaceToolPolicy {
  format: "cimiloop/workspace-tool-journal/1.0.0"; scope: "authorized_workspace"; project_id: string;
  repository_path_digest: string; root_identity: WorkspaceFileIdentity; scope_digest: string; maximum_entries: number; maximum_bytes: number;
}
export interface WorkspaceToolReceipt {
  format: "cimiloop/workspace-tool-receipt/1.0.0"; scope: "authorized_workspace";
  run_id: string; call_id: string; input_digest: string; authority_basis_digest: string;
  native: WorkspaceNativeCompletion; formal_agent_execution_enabled: false;
}
export interface WorkspaceToolPermit { readonly run_id: string; readonly call_id: string; readonly input_digest: string }
export interface WorkspaceToolOwnerPort {
  identity: CreditProcessIdentity; observeOwner?: (identity: CreditProcessIdentity) => Promise<CreditOwnerState>;
  reclaimStaging?: (preparation: WorkspaceNativePreparation, owner: CreditProcessIdentity) => Promise<WorkspaceStagingOutcome>;
}
type Row = Record<string, SQLOutputValue>;
type State = "reserved" | "executing" | "completed" | "unknown" | "not_started";
const ddl = [
  `CREATE TABLE workspace_tool_policy (id INTEGER PRIMARY KEY CHECK(id=1), policy TEXT NOT NULL, digest TEXT NOT NULL) STRICT`,
  `CREATE TABLE workspace_tool_calls (run_id TEXT NOT NULL, call_id TEXT NOT NULL, input TEXT NOT NULL, input_digest TEXT NOT NULL, basis_digest TEXT NOT NULL, owner_nonce TEXT NOT NULL, owner TEXT NOT NULL, owner_digest TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('reserved','executing','completed','unknown','not_started')), preparation TEXT, preparation_digest TEXT, receipt TEXT, receipt_digest TEXT, PRIMARY KEY(run_id,call_id)) STRICT`,
  `CREATE TRIGGER workspace_tool_no_delete BEFORE DELETE ON workspace_tool_calls BEGIN SELECT RAISE(ABORT,'workspace_tool_immutable'); END`,
  `CREATE TRIGGER workspace_tool_input_immutable BEFORE UPDATE ON workspace_tool_calls WHEN NEW.run_id IS NOT OLD.run_id OR NEW.call_id IS NOT OLD.call_id OR NEW.input IS NOT OLD.input OR NEW.input_digest IS NOT OLD.input_digest OR NEW.basis_digest IS NOT OLD.basis_digest OR NEW.owner_nonce IS NOT OLD.owner_nonce OR NEW.owner IS NOT OLD.owner OR NEW.owner_digest IS NOT OLD.owner_digest OR (OLD.preparation IS NOT NULL AND (NEW.preparation IS NOT OLD.preparation OR NEW.preparation_digest IS NOT OLD.preparation_digest)) OR (OLD.receipt IS NOT NULL AND (NEW.receipt IS NOT OLD.receipt OR NEW.receipt_digest IS NOT OLD.receipt_digest OR NEW.state IS NOT OLD.state)) BEGIN SELECT RAISE(ABORT,'workspace_tool_immutable'); END`
];
const applicationId = 0x43494d57;
// Full bounded input, native preparation, completion receipt and owner record.
// This logical bound does not claim a physical SQLite/WAL disk quota.
export const WORKSPACE_TOOL_SLOT_BYTES = 4 * TOOL_RECORD_BYTES;
const readOnlyToken = Symbol("workspace-tool-read-only");
function policyFrom(raw: unknown): WorkspaceToolPolicy {
  const p = copyToolJson(raw);
  if (!exact(p, ["format", "scope", "project_id", "repository_path_digest", "root_identity", "scope_digest", "maximum_entries", "maximum_bytes"]) ||
    p.format !== "cimiloop/workspace-tool-journal/1.0.0" || p.scope !== "authorized_workspace" || typeof p.project_id !== "string" || !domainId.test(p.project_id) ||
    typeof p.repository_path_digest !== "string" || !sha.test(p.repository_path_digest) || typeof p.scope_digest !== "string" || !sha.test(p.scope_digest) || !validWorkspaceFileIdentity(p.root_identity) ||
    !integer(p.maximum_entries, 1, 128) || !integer(p.maximum_bytes, WORKSPACE_TOOL_SLOT_BYTES, 67108864)) fail("workspace_tool_policy_invalid");
  return p as unknown as WorkspaceToolPolicy;
}
export class WorkspaceToolJournal {
  private readonly db: DatabaseSync;
  private readonly policy: WorkspaceToolPolicy;
  private readonly policyJson: string;
  private readonly nonce = randomUUID();
  private readonly permits = new WeakMap<WorkspaceToolPermit, string>();
  private closed = false;
  private readonly readOnly: boolean;
  static readRunFacts(path: string, projectId: string, repositoryPathDigest: string,
    record: { run_id: string; operation_key: string; executor_ref: { id: string }; input_digest: { value: string } }, policyDigest: string) {
    const db = new DatabaseSync(assertOrdinaryPath(path), { readOnly: true, timeout: 5000 }); let policy: WorkspaceToolPolicy;
    try { const row = db.prepare("SELECT * FROM workspace_tool_policy").get(); if (!row || typeof row.policy !== "string" || digest(row.policy).value !== policyDigest) fail("workspace_tool_policy_conflict");
      policy = policyFrom(parseGatewayJson(row.policy)); if (policy.project_id !== projectId || policy.repository_path_digest !== repositoryPathDigest) fail("workspace_tool_scope_mismatch");
    } finally { db.close(); }
    const journal = new WorkspaceToolJournal(path, policy, { identity: { pid: process.pid, creation_ticks: "1", image: process.execPath } }, readOnlyToken);
    try { return journal.transaction(() => { journal.validate();
      for (const row of journal.db.prepare("SELECT input FROM workspace_tool_calls WHERE run_id=?").all(record.run_id)) {
        const input = parseWorkspaceToolInvocation(parseGatewayJson(String(row.input)));
        if (input.operation_key !== record.operation_key || input.executor_actor_id !== record.executor_ref.id || input.context_digest.value !== record.input_digest.value) fail("workspace_tool_run_binding_mismatch");
      }
      const states = { reserved: 0, executing: 0, completed: 0, unknown: 0, not_started: 0 }, rows = journal.db.prepare("SELECT state FROM workspace_tool_calls WHERE run_id=?").all(record.run_id);
      for (const row of rows) states[row.state as State]++; return { invocations: rows.length, unresolved: states.reserved + states.executing + states.unknown, has_effect: states.executing + states.completed + states.unknown > 0 };
    }); } finally { journal.close(); }
  }
  constructor(path: string, policy: WorkspaceToolPolicy, private readonly owners: WorkspaceToolOwnerPort, token?: symbol) {
    this.readOnly = token === readOnlyToken;
    this.policy = policyFrom(policy); this.policyJson = JSON.stringify(this.policy);
    if (!validWorkspaceWorkerIdentity(owners.identity) || owners.identity.pid !== process.pid) fail("workspace_tool_owner_invalid");
    this.owners = { ...owners, identity: Object.freeze({ ...owners.identity }) };
    path = assertOrdinaryPath(path); if (!this.readOnly) directory(dirname(path)); for (const suffix of ["-wal", "-shm", "-journal"]) assertOrdinaryPath(path + suffix);
    this.db = new DatabaseSync(path, { timeout: 5000, readOnly: this.readOnly });
    try { if (this.readOnly && this.format() !== "owned") fail("workspace_tool_format_unavailable"); this.format(); if (!this.readOnly) this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL");
      this.transaction(() => { if (this.format() === "empty") { for (const sql of ddl) this.db.exec(sql); this.db.exec(`PRAGMA application_id=${applicationId}; PRAGMA user_version=1`);
        this.db.prepare("INSERT INTO workspace_tool_policy VALUES(1,?,?)").run(this.policyJson, digest(this.policyJson).value); } this.validate(); });
    } catch (error) { this.db.close(); throw error; }
  }
  private format(): "empty" | "owned" {
    const app = this.db.prepare("PRAGMA application_id").get()!.application_id, version = this.db.prepare("PRAGMA user_version").get()!.user_version;
    const schema = this.db.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY sql").all().map(row => String(row.sql));
    if (app === 0 && version === 0 && !schema.length) return "empty";
    if (app !== applicationId || version !== 1 || !same(schema, [...ddl].sort())) fail("workspace_tool_format_unavailable"); return "owned";
  }
  private transaction<T>(body: () => T): T { if (this.closed) fail("workspace_tool_journal_closed"); this.db.exec(this.readOnly ? "BEGIN" : "BEGIN IMMEDIATE");
    try { const result = body(); this.db.exec("COMMIT"); return result; } catch (error) { this.db.exec("ROLLBACK"); throw error; } }
  private preparation(row: Row, input: WorkspaceToolInvocation): WorkspaceNativePreparation {
    if (typeof row.preparation !== "string" || digest(row.preparation).value !== row.preparation_digest) fail("workspace_tool_journal_corrupt");
    const proof = parseWorkspacePreparation(parseGatewayJson(row.preparation, TOOL_RECORD_BYTES));
    if (proof.input_digest !== row.input_digest || proof.before_digest !== input.expected_digest || !same(proof.root_identity, this.policy.root_identity) ||
      (input.tool === "replace_file") !== (proof.replacement_identity !== null)) fail("workspace_tool_journal_corrupt"); return proof;
  }
  private receipt(row: Row, input: WorkspaceToolInvocation): WorkspaceToolReceipt {
    if (typeof row.receipt !== "string" || digest(row.receipt).value !== row.receipt_digest) fail("workspace_tool_journal_corrupt");
    const value = parseGatewayJson(row.receipt, TOOL_RECORD_BYTES);
    if (!exact(value, ["format", "scope", "run_id", "call_id", "input_digest", "authority_basis_digest", "native", "formal_agent_execution_enabled"]) ||
      value.format !== "cimiloop/workspace-tool-receipt/1.0.0" || value.scope !== "authorized_workspace" || value.run_id !== row.run_id || value.call_id !== row.call_id ||
      value.input_digest !== row.input_digest || value.authority_basis_digest !== row.basis_digest || value.formal_agent_execution_enabled !== false) fail("workspace_tool_journal_corrupt");
    parseWorkspaceCompletion(value.native, this.preparation(row, input), input); return structuredClone(value) as unknown as WorkspaceToolReceipt;
  }
  private validate(): void {
    try { this.format(); if (this.db.prepare("PRAGMA quick_check").get()!.quick_check !== "ok") fail("workspace_tool_journal_corrupt");
      const policies = this.db.prepare("SELECT * FROM workspace_tool_policy").all();
      if (policies.length !== 1 || policies[0]!.policy !== this.policyJson || policies[0]!.digest !== digest(this.policyJson).value) fail("workspace_tool_policy_conflict");
      const rows = this.db.prepare("SELECT * FROM workspace_tool_calls").all(); if (rows.length > this.policy.maximum_entries || rows.length * WORKSPACE_TOOL_SLOT_BYTES > this.policy.maximum_bytes) fail("workspace_tool_journal_corrupt");
      const nonces = new Set<string>();
      for (const row of rows) {
        if ([row.input, row.owner, row.preparation, row.receipt].some(value => value !== null && (typeof value !== "string" || Buffer.byteLength(value) > TOOL_RECORD_BYTES))) fail("workspace_tool_journal_corrupt");
        const input = parseWorkspaceToolInvocation(parseGatewayJson(String(row.input), TOOL_RECORD_BYTES));
        if (input.project_id !== this.policy.project_id || input.run_id !== row.run_id || input.call_id !== row.call_id || hash(input) !== row.input_digest ||
          typeof row.basis_digest !== "string" || !sha.test(row.basis_digest) || typeof row.owner_nonce !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(row.owner_nonce) ||
          !validWorkspaceWorkerIdentity(parseGatewayJson(String(row.owner))) || digest(String(row.owner)).value !== row.owner_digest || !["reserved", "executing", "completed", "unknown", "not_started"].includes(String(row.state))) fail("workspace_tool_journal_corrupt");
        if (row.preparation !== null) { const proof = this.preparation(row, input); if (nonces.has(proof.nonce)) fail("workspace_tool_journal_corrupt"); nonces.add(proof.nonce); }
        else if (row.preparation_digest !== null || ["executing", "completed", "unknown"].includes(String(row.state))) fail("workspace_tool_journal_corrupt");
        if (row.state === "completed") this.receipt(row, input); else if (row.receipt !== null || row.receipt_digest !== null) fail("workspace_tool_journal_corrupt");
      }
    } catch (error) { if (error instanceof RuntimeAdapterError) throw error; fail("workspace_tool_journal_corrupt"); }
  }
  assertWorkspace(scopeDigest: string): void { this.transaction(() => { this.validate(); if (scopeDigest !== this.policy.scope_digest) fail("workspace_tool_scope_mismatch"); }); }
  claim(raw: unknown, assessment: unknown): { permit: WorkspaceToolPermit; replay?: never } | { replay: WorkspaceToolReceipt; permit?: never } {
    const input = parseWorkspaceToolInvocation(raw), authority = parseToolAssessment(assessment, workspaceToolAuthorityRequest(input));
    if (authority.decision !== "ALLOW") fail("workspace_tool_authority_denied");
    return this.claimAuthorized(input, authority.authority.basis_digest.value);
  }
  claimAgent(raw: unknown, scope: AgentWorkspaceToolScope, assessment: unknown): { permit: WorkspaceToolPermit; replay?: never } | { replay: WorkspaceToolReceipt; permit?: never } {
    const input = parseWorkspaceToolInvocation(raw), authority = parseAgentToolAssessment(assessment, agentWorkspaceToolAuthorityRequest(scope, input));
    if (authority.decision !== "ALLOW") fail("workspace_tool_authority_denied");
    return this.claimAuthorized(input, authority.authority.basis_digest.value);
  }
  // Both independently verified entrances own the same durable effect barriers.
  // No Human assessment is fabricated for an Agent. The Context digest already
  // pins the original Agent Binding/admission; this receipt is a file fact only.
  private claimAuthorized(input: WorkspaceToolInvocation, basis: string): { permit: WorkspaceToolPermit; replay?: never } | { replay: WorkspaceToolReceipt; permit?: never } {
    if (input.project_id !== this.policy.project_id) fail("workspace_tool_authority_denied"); const inputDigest = hash(input);
    return this.transaction(() => { this.validate(); const row = this.db.prepare("SELECT * FROM workspace_tool_calls WHERE run_id=? AND call_id=?").get(input.run_id, input.call_id);
      if (row) { if (row.input_digest !== inputDigest || row.basis_digest !== basis) fail("workspace_tool_call_conflict");
        if (row.state === "completed") return { replay: this.receipt(row, input) }; fail(row.state === "not_started" ? "workspace_tool_not_started" : "workspace_tool_outcome_unproven"); }
      const rows = this.db.prepare("SELECT input,state FROM workspace_tool_calls").all();
      if (rows.length >= this.policy.maximum_entries || (rows.length + 1) * WORKSPACE_TOOL_SLOT_BYTES > this.policy.maximum_bytes) fail("workspace_tool_capacity_exhausted");
      if (rows.some(row => ["reserved", "executing", "unknown"].includes(String(row.state)) &&
        (parseWorkspaceToolInvocation(parseGatewayJson(String(row.input))).run_id === input.run_id || parseWorkspaceToolInvocation(parseGatewayJson(String(row.input))).path.toLowerCase() === input.path.toLowerCase()))) fail("workspace_tool_effect_in_flight");
      const owner = JSON.stringify(this.owners.identity); this.db.prepare("INSERT INTO workspace_tool_calls VALUES(?,?,?,?,?,?,?,?, 'reserved',NULL,NULL,NULL,NULL)")
        .run(input.run_id, input.call_id, JSON.stringify(input), inputDigest, basis, this.nonce, owner, digest(owner).value);
      const permit = Object.freeze({ run_id: input.run_id, call_id: input.call_id, input_digest: inputDigest }); this.permits.set(permit, basis); return { permit };
    });
  }
  private owned(permit: WorkspaceToolPermit, state: State): Row {
    this.validate(); const basis = this.permits.get(permit), row = this.db.prepare("SELECT * FROM workspace_tool_calls WHERE run_id=? AND call_id=?").get(permit.run_id, permit.call_id);
    if (!basis || !row || row.owner_nonce !== this.nonce || row.state !== state || row.input_digest !== permit.input_digest || row.basis_digest !== basis) fail("workspace_tool_permit_unowned"); return row;
  }
  prepare(permit: WorkspaceToolPermit, raw: WorkspaceNativePreparation): void { const proof = parseWorkspacePreparation(raw);
    this.transaction(() => { const row = this.owned(permit, "reserved"); if (row.preparation !== null) fail("workspace_tool_preparation_conflict");
      this.preparation({ ...row, preparation: JSON.stringify(proof), preparation_digest: hash(proof) }, parseWorkspaceToolInvocation(parseGatewayJson(String(row.input))));
      for (const other of this.db.prepare("SELECT * FROM workspace_tool_calls WHERE preparation IS NOT NULL AND state IN ('reserved','executing','unknown')").all()) {
        if (other.run_id === permit.run_id && other.call_id === permit.call_id) continue;
        const original = this.preparation(other, parseWorkspaceToolInvocation(parseGatewayJson(String(other.input))));
        const priorIds = [original.file_identity, ...(original.replacement_identity ? [original.replacement_identity] : [])], currentIds = [proof.file_identity, ...(proof.replacement_identity ? [proof.replacement_identity] : [])];
        if (priorIds.some(prior => currentIds.some(current => same(prior, current)))) fail("workspace_tool_file_in_flight");
      }
      this.db.prepare("UPDATE workspace_tool_calls SET preparation=?,preparation_digest=? WHERE run_id=? AND call_id=?").run(JSON.stringify(proof), hash(proof), permit.run_id, permit.call_id); this.validate(); }); }
  dispatch(permit: WorkspaceToolPermit): void { this.transaction(() => { const row = this.owned(permit, "reserved"); if (!row.preparation) fail("workspace_tool_preparation_required");
    this.db.prepare("UPDATE workspace_tool_calls SET state='executing' WHERE run_id=? AND call_id=?").run(permit.run_id, permit.call_id); this.validate(); }); }
  complete(permit: WorkspaceToolPermit, native: WorkspaceNativeCompletion): WorkspaceToolReceipt {
    const result = this.transaction(() => { const row = this.owned(permit, "executing"), input = parseWorkspaceToolInvocation(parseGatewayJson(String(row.input)));
      const receipt: WorkspaceToolReceipt = { format: "cimiloop/workspace-tool-receipt/1.0.0", scope: "authorized_workspace", run_id: permit.run_id, call_id: permit.call_id,
        input_digest: permit.input_digest, authority_basis_digest: String(row.basis_digest), native: parseWorkspaceCompletion(native, this.preparation(row, input), input), formal_agent_execution_enabled: false };
      const json = JSON.stringify(receipt); if (Buffer.byteLength(json) > TOOL_RECORD_BYTES) fail("workspace_tool_receipt_limit");
      this.db.prepare("UPDATE workspace_tool_calls SET state='completed',receipt=?,receipt_digest=? WHERE run_id=? AND call_id=?").run(json, digest(json).value, permit.run_id, permit.call_id); this.validate(); return structuredClone(receipt);
    }); this.permits.delete(permit); return result;
  }
  stop(permit: WorkspaceToolPermit, dispatched: boolean): void { this.transaction(() => { this.owned(permit, dispatched ? "executing" : "reserved");
    this.db.prepare("UPDATE workspace_tool_calls SET state=? WHERE run_id=? AND call_id=?").run(dispatched ? "unknown" : "not_started", permit.run_id, permit.call_id); this.validate(); }); this.permits.delete(permit); }
  facts(runId?: string): { invocations: number; unresolved: number; has_effect: boolean; states: Record<State, number> } {
    return this.transaction(() => { this.validate(); const states = { reserved: 0, executing: 0, completed: 0, unknown: 0, not_started: 0 };
      const rows = runId ? this.db.prepare("SELECT state FROM workspace_tool_calls WHERE run_id=?").all(runId) : this.db.prepare("SELECT state FROM workspace_tool_calls").all();
      for (const row of rows) states[row.state as State]++; return { invocations: rows.length, unresolved: states.reserved + states.executing + states.unknown, has_effect: states.executing + states.completed + states.unknown > 0, states }; });
  }
  async reconcileOwners(): Promise<{ reconciled: number; active: number; unknown_owners: number }> {
    const rows = this.transaction(() => { this.validate(); return this.db.prepare("SELECT * FROM workspace_tool_calls WHERE state IN ('reserved','executing')").all(); });
    const result = { reconciled: 0, active: 0, unknown_owners: 0 };
    for (const row of rows) {
      const identities = [parseGatewayJson(String(row.owner)) as unknown as CreditProcessIdentity];
      if (row.preparation) identities.push(parseWorkspacePreparation(parseGatewayJson(String(row.preparation))).worker);
      const states = await Promise.all(identities.map(async identity => { try { return await this.owners.observeOwner?.(identity) ?? "unknown"; } catch { return "unknown"; } }));
      if (states.includes("active")) { result.active++; continue; } if (states.some(state => state !== "absent")) { result.unknown_owners++; continue; }
      result.reconciled += this.transaction(() => { this.validate(); const current = this.db.prepare("SELECT * FROM workspace_tool_calls WHERE run_id=? AND call_id=?").get(row.run_id!, row.call_id!);
        if (!current || current.owner !== row.owner || current.preparation !== row.preparation || current.state !== row.state) return 0;
        return Number(this.db.prepare("UPDATE workspace_tool_calls SET state=? WHERE run_id=? AND call_id=?").run(row.state === "reserved" ? "not_started" : "unknown", row.run_id!, row.call_id!).changes); });
    }
    return result;
  }
  async reclaimResources() {
    if (!this.owners.reclaimStaging) fail("workspace_resource_recovery_unavailable");
    const rows = this.transaction(() => { this.validate(); return this.db.prepare("SELECT * FROM workspace_tool_calls WHERE preparation IS NOT NULL AND state IN ('not_started','unknown','completed')").all(); });
    const result = { examined: rows.length, removed: 0, absent: 0, not_applicable: 0, active: 0, unknown_owners: 0, unproven: 0 };
    for (const row of rows) {
      const input = parseWorkspaceToolInvocation(parseGatewayJson(String(row.input))), proof = this.preparation(row, input), owner = parseGatewayJson(String(row.owner)) as unknown as CreditProcessIdentity;
      const states = await Promise.all([owner, proof.worker].map(async identity => { try { return await this.owners.observeOwner?.(identity) ?? "unknown"; } catch { return "unknown"; } }));
      if (states.includes("active")) { result.active++; continue; } if (states.some(state => state !== "absent")) { result.unknown_owners++; continue; }
      const original = this.transaction(() => { this.validate(); const current = this.db.prepare("SELECT * FROM workspace_tool_calls WHERE run_id=? AND call_id=?").get(row.run_id!, row.call_id!);
        return !!current && same(current, row); });
      if (!original) { result.unproven++; continue; }
      try { const outcome = await this.owners.reclaimStaging(structuredClone(proof), structuredClone(owner));
        if (!["removed", "absent", "not_applicable"].includes(outcome) || (proof.replacement_identity === null) !== (outcome === "not_applicable")) result.unproven++; else result[outcome]++;
      } catch { result.unproven++; }
    }
    // Resource absence never creates a receipt, changes an outcome or frees a
    // call slot. A repeated recovery observes absence by the original identity.
    return result;
  }
  close(): void { if (!this.closed) { this.closed = true; this.db.close(); } }
}
