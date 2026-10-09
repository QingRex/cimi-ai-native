import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, renameSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { digest } from "../src/files.js";
import { AgentStartLedger } from "../src/agent-start-ledger.js";
// Real durable SQLite and filesystem identities; machine/principal are constructed.
// No model/account/Provider approval is implied by a start ticket.
describe("original host first-start ledger", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) { if (dirname(root) !== tmpdir() || !basename(root).startsWith("cimiloop-start-ledger-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); } });
  function setup() {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-start-ledger-")); roots.push(root);
    const path = join(root, "original"), host = { machine_digest: digest("constructed machine").value, principal_digest: digest("constructed principal").value };
    const ledger = AgentStartLedger.initialize(path, host), ticket = ledger.issue({ original: "frozen admission", project_id: createInternalId() });
    const scope = { project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(), context_digest: digest("context"),
      runtime_binding: { binding_ref: { object_type: "provider_binding" as const, id: createInternalId() }, digest: digest("runtime") }, skill_bindings: [],
      host_admission_ref: { provider: "local_content" as const, resource_type: "agent_host_admission" as const, locator: digest("admission").value, digest: digest("admission") } };
    return { root, path, host, ledger, ticket, scope };
  }
  it("returns one immutable ticket for the same fixed basis and one irreversible original claim across connections", () => {
    const f = setup(); expect(f.ledger.issue(f.ledger.readTicket(f.ticket))).toEqual(f.ticket);
    const other = AgentStartLedger.open(f.path, f.host);
    try {
      expect(f.ledger.inspect(f.ticket, f.scope)).toEqual({ state: "unclaimed" });
      expect(f.ledger.claim(f.ticket, f.scope, digest("material"))).toMatchObject({ created: true });
      expect(other.claim(f.ticket, f.scope, digest("material"))).toMatchObject({ created: false });
      expect(other.inspect(f.ticket, f.scope)).toMatchObject({ state: "claimed", material_digest: digest("material") });
      expect(() => other.claim(f.ticket, f.scope, digest("changed"))).toThrow("agent_start_claim_conflict");
      expect(() => other.claim(f.ticket, { ...f.scope, run_id: createInternalId() }, digest("material"))).toThrow("agent_start_operation_key_conflict");
    } finally { other.close(); f.ledger.close(); }
  });
  it("rejects a different machine or principal and a copied original database at another storage identity", () => {
    const f = setup(); f.ledger.close();
    expect(() => AgentStartLedger.open(f.path, { ...f.host, machine_digest: digest("new machine").value })).toThrow("agent_start_origin_changed");
    expect(() => AgentStartLedger.open(f.path, { ...f.host, principal_digest: digest("new login").value })).toThrow("agent_start_origin_changed");
    const copied = join(f.root, "copy"); cpSync(f.path, copied, { recursive: true });
    expect(() => AgentStartLedger.open(copied, f.host)).toThrow("agent_start_origin_changed");
  });
  it("cannot recreate a missing or partial original root and cannot use an old ticket on a new ledger", () => {
    const f = setup(); f.ledger.close(); renameSync(f.path, join(f.root, "retained"));
    expect(() => AgentStartLedger.open(f.path, f.host)).toThrow("agent_start_original_missing");
    const fresh = AgentStartLedger.initialize(f.path, f.host);
    try { expect(() => fresh.inspect(f.ticket, f.scope)).toThrow("agent_start_ticket_origin_mismatch"); } finally { fresh.close(); }
    const partial = join(f.root, "partial"); mkdirSync(partial);
    expect(() => AgentStartLedger.initialize(partial, f.host)).toThrow("agent_start_origin_already_registered");
    expect(() => AgentStartLedger.open(partial, f.host)).toThrow("agent_start_original_missing");
  });
  it("retains the original claim after restarting the process and never interprets it as completion or fees", () => {
    const f = setup(); f.ledger.claim(f.ticket, f.scope, digest("material")); f.ledger.close();
    const reopened = AgentStartLedger.open(f.path, f.host);
    try { expect(reopened.inspect(f.ticket, f.scope)).toMatchObject({ state: "claimed" });
      expect(reopened.claim(f.ticket, f.scope, digest("material"))).toMatchObject({ created: false });
      expect(reopened.inspect(f.ticket, f.scope)).not.toHaveProperty("cost_known");
    } finally { reopened.close(); }
  });
  it("denies a structurally damaged original ledger instead of treating erased claims as first start", () => {
    const f = setup(); f.ledger.claim(f.ticket, f.scope, digest("material"));
    const raw = new DatabaseSync(join(f.path, "starts.sqlite"));
    try {
      raw.exec("DROP TRIGGER claims_delete; DELETE FROM claims;");
      expect(() => f.ledger.inspect(f.ticket, f.scope)).toThrow("agent_start_format_unproven");
      expect(() => AgentStartLedger.open(f.path, f.host)).toThrow("agent_start_format_unproven");
    } finally { raw.close(); f.ledger.close(); }
  });
  it("prevents ordinary SQL updates and deletes of original origin, ticket and claim records", () => {
    const f = setup(); f.ledger.claim(f.ticket, f.scope, digest("material"));
    const raw = new DatabaseSync(join(f.path, "starts.sqlite"));
    try {
      for (const table of ["origin", "tickets", "claims"]) {
        expect(() => raw.exec("DELETE FROM " + table)).toThrow("immutable start");
      }
      expect(() => raw.exec("UPDATE claims SET material_digest='changed'")).toThrow("immutable start");
      expect(f.ledger.inspect(f.ticket, f.scope)).toMatchObject({ state: "claimed" });
    } finally { raw.close(); f.ledger.close(); }
  });
});
