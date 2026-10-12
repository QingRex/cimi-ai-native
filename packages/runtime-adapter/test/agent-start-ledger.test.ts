import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync, renameSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId } from "@cimiloop/protocol/v2";
import { digest } from "../src/files.js";
import { AgentStartLedger } from "../src/agent-start-ledger.js";
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
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
  it('waits for a bounded original SQLite open lock before its first format read without reinitializing custody',async()=>{
    const f=setup(),identity=f.ledger.identityDigest,basis=f.ledger.readTicket(f.ticket);f.ledger.close();
    const child=spawn(process.execPath,[fileURLToPath(new URL('../../../tests/fixtures/agent-start-ledger-lock-holder.mjs',import.meta.url)),f.root],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='',error='';child.stdout.on('data',bytes=>{output+=bytes.toString();});child.stderr.on('data',bytes=>{error+=bytes.toString();});
    const ended=new Promise<number|null>((done,fail)=>{child.once('error',fail);child.once('close',done);});
    try{
      await new Promise<void>((done,fail)=>{const data=()=>{if(output.includes('locked\n')){child.stdout.removeListener('data',data);done();}};child.stdout.on('data',data);child.once('error',fail);void ended.then(()=>{if(!output.includes('locked\n'))fail(Error('Original lock holder ended before ready: '+error));},fail);data();});
      const opened=AgentStartLedger.open(f.path,f.host);
      try{expect(opened.identityDigest).toBe(identity);expect(opened.readTicket(f.ticket)).toEqual(basis);expect(opened.inspect(f.ticket,f.scope)).toEqual({state:'unclaimed'});}finally{opened.close();}
    }finally{expect(await ended).toBe(0);}
  });
  it('captures selected namespaces before the synchronous Native custody boundary can mutate the caller array',()=>{
    const f=setup(),id=digest('PUBLIC original hold').value;f.ledger.issueExclusive('dedicated_account_hold',id,{retained:true});f.ledger.close();
    const names=['dedicated_agent_account'];let mutate=false;const ledger=AgentStartLedger.open(f.path,f.host,()=>{if(mutate){mutate=false;names[0]='dedicated_account_hold';}});
    try{mutate=true;ledger.withExclusiveReadCut(names,()=>{expect(ledger.readExclusive('dedicated_account_hold',id)?.basis).toEqual({retained:true});});}finally{ledger.close();}
  });
  it('returns detached original rows and invalidates the synchronous cut before a Host write',()=>{
    const f=setup(),id=digest('PUBLIC hold').value,next=digest('PUBLIC next hold').value;f.ledger.issueExclusive('dedicated_account_hold',id,{retained:true});
    try{f.ledger.withExclusiveReadCut(['dedicated_account_hold'],()=>{
      const row=f.ledger.readExclusive('dedicated_account_hold',id)!;Reflect.set(row.basis as object,'retained',false);
      expect(f.ledger.readExclusive('dedicated_account_hold',id)?.basis).toEqual({retained:true});
      f.ledger.issueExclusive('dedicated_account_hold',next,{new_original:true});expect(f.ledger.listExclusive('dedicated_account_hold')).toHaveLength(2);
    });expect(f.ledger.listExclusive('dedicated_account_hold')).toHaveLength(2);}finally{f.ledger.close();}
  });
  it('rejects the current synchronous cut when its callback revokes Host physical custody before returning',()=>{
    const f=setup(),id=digest('PUBLIC retained hold').value;f.ledger.issueExclusive('dedicated_account_hold',id,{retained:true});f.ledger.close();let denied=false;
    const ledger=AgentStartLedger.open(f.path,f.host,()=>{if(denied)throw Error('PUBLIC Host custody revoked inside cut');});
    try{expect(()=>ledger.withExclusiveReadCut(['dedicated_account_hold'],()=>{denied=true;return ledger.readExclusive('dedicated_account_hold',id);})).toThrow('PUBLIC Host custody revoked inside cut');}finally{ledger.close();}
  });
  it('rejects an asynchronous cut and clears its view on both rejected results and synchronous failure',async()=>{
    const f=setup();f.ledger.close();let denied=false;const ledger=AgentStartLedger.open(f.path,f.host,()=>{if(denied)throw Error('PUBLIC custody revoked after cut');});
    try{
      expect(()=>ledger.withExclusiveReadCut(['dedicated_account_hold'],()=>Promise.reject(Error('PUBLIC async view refused')))).toThrow('agent_start_read_cut_async_unavailable');await new Promise<void>(done=>setImmediate(done));
      expect(()=>ledger.withExclusiveReadCut(['dedicated_account_hold'],()=>{throw Error('PUBLIC synchronous cut failed');})).toThrow('PUBLIC synchronous cut failed');
      denied=true;expect(()=>ledger.listExclusive('dedicated_account_hold')).toThrow('PUBLIC custody revoked after cut');
    }finally{ledger.close();}
  });
  it("reads original ticket and claim in one fresh before/after verified cut without retaining a cache",()=>{
    const f=setup();f.ledger.close();let verifies=0,deny=false;const ledger=AgentStartLedger.open(f.path,f.host,()=>{verifies++;if(deny)throw Error('PUBLIC revoked physical custody');});
    try{const method=Reflect.get(ledger,'readOriginalScope');expect(method).toBeTypeOf('function');verifies=0;const first=method.call(ledger,f.ticket,f.scope);expect(first).toMatchObject({basis:{original:'frozen admission'},claim:{state:'unclaimed'}});expect(verifies).toBe(2);
     ledger.claim(f.ticket,f.scope,digest('material'));expect(method.call(ledger,f.ticket,f.scope)).toMatchObject({claim:{state:'claimed',material_digest:digest('material')}});deny=true;expect(()=>method.call(ledger,f.ticket,f.scope)).toThrow('PUBLIC revoked physical custody');
    }finally{ledger.close();}
  });
  it("rejects a failed physical custody check at the end of an original cut and does not create a claim",()=>{
    const f=setup();f.ledger.close();let verifies=0,deny=false;const ledger=AgentStartLedger.open(f.path,f.host,()=>{verifies++;if(deny&&verifies===2)throw Error('PUBLIC after-cut physical substitution');});
    try{const method=Reflect.get(ledger,'readOriginalScope');expect(method).toBeTypeOf('function');verifies=0;deny=true;expect(()=>method.call(ledger,f.ticket,f.scope)).toThrow('PUBLIC after-cut physical substitution');deny=false;expect(ledger.inspect(f.ticket,f.scope)).toEqual({state:'unclaimed'});
    }finally{ledger.close();}
  });
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
