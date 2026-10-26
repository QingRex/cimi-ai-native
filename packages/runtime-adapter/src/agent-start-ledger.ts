import { DatabaseSync } from "node:sqlite";
import { mkdirSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Digest } from "@cimiloop/protocol/v2";
import { assertOrdinaryPath, digest, RuntimeAdapterError } from "./files.js";
import { copyToolJson } from "./tool-journal.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import { parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";
export interface AgentStartHostIdentity { machine_digest: string; principal_digest: string }
export interface AgentStartTicket { format: "cimiloop/agent-start-ticket/1.0.0"; identity_digest: string; ticket_id: string; basis_digest: string }
interface Identity extends AgentStartHostIdentity { format: "cimiloop/agent-start-origin/1.0.0"; ledger_id: string; path_digest: string; directory_identity: string; file_identity: string }
const applicationId = 0x43494d53, sha = /^[a-f0-9]{64}$/, uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
function fail(reason: string): never { throw new RuntimeAdapterError(reason); }
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const encoded = (raw: unknown) => { const text = JSON.stringify(canonical(copyToolJson(raw))); if (Buffer.byteLength(text) > 65536) fail("agent_start_record_limit"); return text; };
const object = (text: string) => copyToolJson(parseGatewayJson(text, 65536));
const identityAt = (path: string, directory: boolean) => {
  assertOrdinaryPath(path); const stat = lstatSync(path, { bigint: true });
  if (directory ? !stat.isDirectory() : !stat.isFile()) fail("agent_start_origin_changed");
  if (stat.ino <= 0n) fail("agent_start_file_identity_unproven");
  return digest(JSON.stringify({ device: String(stat.dev), inode: String(stat.ino), created_ns: String(stat.birthtimeNs) })).value;
};
const hostCopy = (raw: AgentStartHostIdentity) => {
  if (!raw || Object.keys(raw).sort().join(",") !== "machine_digest,principal_digest" || !sha.test(raw.machine_digest) || !sha.test(raw.principal_digest)) fail("agent_start_host_identity_unproven");
  return { ...raw };
};
const ddl = [
  `CREATE TABLE origin (singleton INTEGER PRIMARY KEY CHECK(singleton=1), body TEXT NOT NULL CHECK(json_valid(body))) STRICT`,
  `CREATE TABLE tickets (id TEXT PRIMARY KEY, basis_digest TEXT NOT NULL UNIQUE, body TEXT NOT NULL CHECK(json_valid(body))) STRICT`,
  `CREATE TABLE claims (run_id TEXT PRIMARY KEY, operation_key TEXT NOT NULL UNIQUE, ticket_id TEXT NOT NULL REFERENCES tickets(id), scope_body TEXT NOT NULL CHECK(json_valid(scope_body)), material_digest TEXT NOT NULL, claim_digest TEXT NOT NULL) STRICT`,
  ...["origin", "tickets", "claims"].flatMap(table => ["UPDATE", "DELETE"].map(action =>
    `CREATE TRIGGER ${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT, 'immutable start record'); END`))
];

interface OriginalHostState{root:string;host:AgentStartHostIdentity;original:Identity;verify?:((root:string)=>void)|undefined}
export interface AgentStartOriginReference {format:'cimiloop/agent-start-origin-reference/1.0.0';root:string;host:AgentStartHostIdentity;original:Identity}
// A read reference selects immutable rows, never grants writes or execution.
// Its caller must pin it in its original admission/configuration evidence.
export function captureAgentStartOriginReference(ledger:AgentStartLedger):AgentStartOriginReference {
 const state=originalHosts.get(ledger);if(!state)fail('agent_start_origin_unproven');
 ledger.readExclusive('original_reference_guard','0'.repeat(64));
 return structuredClone({format:'cimiloop/agent-start-origin-reference/1.0.0',root:state.root,host:state.host,original:state.original});
}
export function readAgentStartOriginalReference(raw:AgentStartOriginReference,names:string[]){
 const value=structuredClone(raw);
 if(!value||Object.keys(value).sort().join(',')!=='format,host,original,root'||value.format!=='cimiloop/agent-start-origin-reference/1.0.0'||!value.original||value.original.format!=='cimiloop/agent-start-origin/1.0.0')fail('agent_start_origin_unproven');
 const root=assertOrdinaryPath(value.root),host=hostCopy(value.host),path=join(root,'starts.sqlite'),selected=new Set(names);
 if(names.some(name=>!/^[a-z][a-z0-9_]{0,63}$/.test(name)))fail('agent_start_exclusive_identity_invalid');
 identityAt(root,true);identityAt(path,false);const db=new DatabaseSync(path,{readOnly:true,timeout:30000});
 try{db.exec('BEGIN');assertStoredOrigin(db,root,host,value.original);const seen=new Set<string>();
  const result=db.prepare('SELECT id,basis_digest,body FROM tickets').all().flatMap(row=>{
   const body=object(String(row.body)) as Record<string,unknown>;if(body?.format!=='cimiloop/host-exclusive-ticket/1.0.0'||typeof body.namespace!=='string'||!selected.has(body.namespace))return[];
   if(Object.keys(body).sort().join(',')!=='basis,format,id,namespace'||typeof body.id!=='string'||!sha.test(body.id)||seen.has(body.namespace+'/'+body.id))fail('agent_start_exclusive_conflict');seen.add(body.namespace+'/'+body.id);
   return[{namespace:body.namespace,id:body.id,ticket:{format:'cimiloop/agent-start-ticket/1.0.0' as const,identity_digest:digest(encoded(value.original)).value,ticket_id:String(row.id),basis_digest:String(row.basis_digest)},basis:structuredClone(body.basis)}];
  });assertStoredOrigin(db,root,host,value.original);db.exec('COMMIT');return result;
 }finally{db.close();}
}
export interface AgentStartOriginalTicketSeal{readonly format:'cimiloop/agent-start-original-ticket-seal/1.0.0';readonly identity_digest:string;readonly tickets:readonly {readonly ticket:AgentStartTicket;readonly basis:unknown}[]}
const originalHosts=new WeakMap<object,OriginalHostState>(),originalTicketSeals=new WeakMap<object,{state:OriginalHostState;tickets:AgentStartTicket[];rows:{ticket:AgentStartTicket;basis:unknown}[]}>();
function freezeOriginal<T>(raw:T):T{if(raw&&typeof raw==='object'){for(const value of Object.values(raw))freezeOriginal(value);Object.freeze(raw);}return raw;}
// Shared fixed origin reader. Installed custody verification belongs BEFORE
// this reader; selected immutable ticket bytes survive unrelated new rows.
function assertStoredOrigin(db:DatabaseSync,root:string,host:AgentStartHostIdentity,original:Identity):void{
    const schema = db.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY sql").all().map(row => String(row.sql));
    if (db.prepare("PRAGMA application_id").get()?.application_id !== applicationId || db.prepare("PRAGMA user_version").get()?.user_version !== 1 ||
      !isDeepStrictEqual(schema, [...ddl].sort())) fail("agent_start_format_unproven");
    if (db.prepare("PRAGMA quick_check").get()?.quick_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) fail("agent_start_corrupt");
    const tickets = db.prepare("SELECT * FROM tickets").all(), claims = db.prepare("SELECT * FROM claims").all();
    if (tickets.length > 1024 || claims.length > 4096) fail("agent_start_corrupt");
    const ticketDigests = new Map<string, string>();
    for (const row of tickets) {
      if (typeof row.id !== "string" || !uuid.test(row.id) || typeof row.body !== "string" || typeof row.basis_digest !== "string" ||
        row.basis_digest !== digest(row.body).value || encoded(object(row.body)) !== row.body) fail("agent_start_corrupt");
      ticketDigests.set(row.id, row.basis_digest);
    }
    for (const row of claims) {
      if (typeof row.ticket_id !== "string" || !ticketDigests.has(row.ticket_id) || typeof row.scope_body !== "string" ||
        typeof row.material_digest !== "string" || !sha.test(row.material_digest)) fail("agent_start_corrupt");
      const scope = parseAgentWorkspaceToolScope(object(row.scope_body));
      const ticket: AgentStartTicket = { format: "cimiloop/agent-start-ticket/1.0.0", identity_digest: digest(encoded(original)).value, ticket_id: row.ticket_id, basis_digest: ticketDigests.get(row.ticket_id)! };
      if (encoded(scope) !== row.scope_body || scope.run_id !== row.run_id || scope.operation_key !== row.operation_key ||
        row.claim_digest !== digest(encoded({ ticket, scope, material_digest: { algorithm: "sha256", value: row.material_digest } })).value) fail("agent_start_corrupt");
    }
    const actual = { ...original, ...host, path_digest: digest(resolve(root)).value, directory_identity: identityAt(root, true), file_identity: identityAt(join(root, "starts.sqlite"), false) };
    const row = db.prepare("SELECT body FROM origin WHERE singleton=1").get();
    if (original.format !== "cimiloop/agent-start-origin/1.0.0" || !uuid.test(original.ledger_id) ||
      Object.keys(original).sort().join(",") !== "directory_identity,file_identity,format,ledger_id,machine_digest,path_digest,principal_digest" ||
      !isDeepStrictEqual(actual, original) || typeof row?.body !== "string" || !isDeepStrictEqual(object(row.body), original)) fail("agent_start_origin_changed");
}
function selectedOriginalTickets(state:OriginalHostState,raw:unknown):AgentStartTicket[]{
 const tickets=copyToolJson(raw);if(!Array.isArray(tickets)||!tickets.length||tickets.length>16)fail('agent_start_original_ticket_selection_invalid');
 const identity=digest(encoded(state.original)).value,seen=new Set<string>();
 for(const ticket of tickets){if(!ticket||typeof ticket!=='object'||Array.isArray(ticket)||Object.keys(ticket).sort().join(',')!=='basis_digest,format,identity_digest,ticket_id'||ticket.format!=='cimiloop/agent-start-ticket/1.0.0'||ticket.identity_digest!==identity||typeof ticket.ticket_id!=='string'||!uuid.test(ticket.ticket_id)||typeof ticket.basis_digest!=='string'||!sha.test(ticket.basis_digest)||seen.has(ticket.ticket_id))fail('agent_start_original_ticket_selection_invalid');seen.add(ticket.ticket_id);}
 return structuredClone(tickets) as AgentStartTicket[];
}
function readFixedOriginalTickets(state:OriginalHostState,tickets:AgentStartTicket[]){
 const path=join(state.root,'starts.sqlite');identityAt(state.root,true);identityAt(path,false);
 const db=new DatabaseSync(path,{readOnly:true,timeout:30000});
 try{db.exec('BEGIN');assertStoredOrigin(db,state.root,state.host,state.original);
  const rows=tickets.map(ticket=>{const row=db.prepare('SELECT basis_digest,body FROM tickets WHERE id=?').get(ticket.ticket_id);if(!row||typeof row.body!=='string'||row.basis_digest!==ticket.basis_digest||digest(row.body).value!==ticket.basis_digest)fail('agent_start_original_ticket_changed');const basis=object(row.body) as Record<string,unknown>;if(basis&&typeof basis==='object'&&!Array.isArray(basis)&&basis.format==='cimiloop/host-exclusive-ticket/1.0.0'){
   if(Object.keys(basis).sort().join(',')!=='basis,format,id,namespace'||typeof basis.namespace!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(basis.namespace)||typeof basis.id!=='string'||!sha.test(basis.id))fail('agent_start_exclusive_conflict');
   const matches=db.prepare('SELECT body FROM tickets').all().filter(other=>{const body=object(String(other.body)) as Record<string,unknown>;return body&&typeof body==='object'&&!Array.isArray(body)&&body.format==='cimiloop/host-exclusive-ticket/1.0.0'&&body.namespace===basis.namespace&&body.id===basis.id;});if(matches.length!==1)fail('agent_start_exclusive_conflict');
  }return{ticket:structuredClone(ticket),basis};});
  assertStoredOrigin(db,state.root,state.host,state.original);db.exec('COMMIT');return structuredClone(rows);
 }finally{db.close();}
}
// No ledger method or installed verify callback is entered by final closure.
export function assertAgentStartOriginalTicketSeal(raw:unknown,expected:unknown):void{
 if(!raw||typeof raw!=='object')fail('agent_start_original_ticket_seal_unproven');const sealed=originalTicketSeals.get(raw);if(!sealed||!isDeepStrictEqual(selectedOriginalTickets(sealed.state,expected),sealed.tickets)||!isDeepStrictEqual(readFixedOriginalTickets(sealed.state,sealed.tickets),sealed.rows))fail('agent_start_original_ticket_seal_unproven');
}

// Separate immutable host custody, never the Project database or an account bill.
// Only explicit initialization of a NEW root is permitted; no missing original
// registration is recreated. A ticket is pinned before Context/Run launch.
export class AgentStartLedger {
  private exclusiveReadCut: {names:Set<string>;rows:{namespace:string;id:string;ticket:AgentStartTicket;basis:unknown}[]} | undefined;
  private exclusiveReadCutActive = false;
  private constructor(private readonly root: string, private readonly host: AgentStartHostIdentity, private readonly db: DatabaseSync, private readonly original: Identity, private readonly verify?: (root: string) => void) {originalHosts.set(this,{root,host:structuredClone(host),original:structuredClone(original),verify});}
  get identityDigest(): string { return digest(encoded(this.original)).value; }
  static initialize(rawRoot: string, rawHost: AgentStartHostIdentity, protect?: (root: string) => void, verify?: (root: string) => void): AgentStartLedger {
    const root = assertOrdinaryPath(rawRoot), host = hostCopy(rawHost);
    try { mkdirSync(root); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") fail("agent_start_origin_already_registered"); throw error; }
    // Failure here retains the original partial root; it is never repaired.
    protect?.(root); const path = join(root, "starts.sqlite"), db = new DatabaseSync(path);
    try {
      db.exec(`PRAGMA application_id=${applicationId}; PRAGMA user_version=1; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        PRAGMA foreign_keys=ON; PRAGMA busy_timeout=30000; PRAGMA max_page_count=16384; PRAGMA wal_autocheckpoint=128;`);
      for (const sql of ddl) db.exec(sql);
      const original: Identity = { format: "cimiloop/agent-start-origin/1.0.0", ledger_id: randomUUID(), ...host, path_digest: digest(resolve(root)).value,
        directory_identity: identityAt(root, true), file_identity: identityAt(path, false) };
      db.prepare("INSERT INTO origin VALUES (1, ?)").run(encoded(original));
      return new AgentStartLedger(root, host, db, original, verify);
    } catch (error) { db.close(); throw error; }
  }
  static open(rawRoot: string, rawHost: AgentStartHostIdentity, verify?: (root: string) => void): AgentStartLedger {
    const root = assertOrdinaryPath(rawRoot), host = hostCopy(rawHost), path = join(root, "starts.sqlite");
    try { identityAt(root, true); identityAt(path, false); }
    catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") fail("agent_start_original_missing"); throw error; }
    // Install the existing bounded busy policy at connection creation. WAL
    // recovery or another original opener can hold SQLite's first metadata
    // read before the later PRAGMAs are reached. Never reopen/repair the origin.
    const db = new DatabaseSync(path,{timeout:30000});
    try {
      if (db.prepare("PRAGMA application_id").get()?.application_id !== applicationId || db.prepare("PRAGMA user_version").get()?.user_version !== 1) fail("agent_start_format_unproven");
      const row = db.prepare("SELECT body FROM origin WHERE singleton=1").get(); if (typeof row?.body !== "string") fail("agent_start_original_missing");
      const original = object(row.body) as Identity;
      const ledger = new AgentStartLedger(root, host, db, original, verify); ledger.assertOrigin();
      db.exec("PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=30000; PRAGMA wal_autocheckpoint=128;"); return ledger;
    } catch (error) { db.close(); throw error; }
  }
  private assertOrigin(): void {
    // All integrity rows share one SQLite snapshot; a concurrent new ticket and
    // claim must not appear as a claim with a missing ticket between SELECTs.
    if (!this.db.isTransaction) {
      this.db.exec("BEGIN");
      try { this.assertOrigin(); this.db.exec("COMMIT"); return; }
      catch (error) { this.db.exec("ROLLBACK"); throw error; }
    }
    this.verify?.(this.root);
    assertStoredOrigin(this.db,this.root,this.host,this.original);
  }
  private transaction<T>(action: () => T, write = true): T {
    // A trusted synchronous guard may write while a reader is validating.
    // Never reuse the earlier snapshot after any attempted Host mutation.
    if (write) this.exclusiveReadCut = undefined;
    this.db.exec("BEGIN IMMEDIATE");
    try { this.assertOrigin(); const value = action(); this.assertOrigin(); this.db.exec("COMMIT"); return value; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  issue(rawBasis: unknown): AgentStartTicket {
    const body = encoded(rawBasis), basis = digest(body).value;
    return this.transaction(() => {
      let row = this.db.prepare("SELECT id, body FROM tickets WHERE basis_digest=?").get(basis);
      if (!row) {
        if (Number(this.db.prepare("SELECT count(*) AS n FROM tickets").get()!.n) >= 1024) fail("agent_start_ticket_capacity");
        const id = randomUUID(); this.db.prepare("INSERT INTO tickets VALUES (?, ?, ?)").run(id, basis, body); row = { id, body };
      }
      if (row.body !== body || typeof row.id !== "string" || !uuid.test(row.id)) fail("agent_start_ticket_unproven");
      return { format: "cimiloop/agent-start-ticket/1.0.0", identity_digest: this.identityDigest, ticket_id: row.id, basis_digest: basis };
    });
  }
  readTicket(rawTicket: AgentStartTicket): unknown {
    this.assertOrigin(); return this.ticketBody(rawTicket);
  }
  private ticketBody(rawTicket:AgentStartTicket):unknown {
    const ticket = structuredClone(rawTicket);
    if (!ticket || Object.keys(ticket).sort().join(",") !== "basis_digest,format,identity_digest,ticket_id" || ticket.format !== "cimiloop/agent-start-ticket/1.0.0" ||
      ticket.identity_digest !== this.identityDigest) fail("agent_start_ticket_origin_mismatch");
    if (!uuid.test(ticket.ticket_id) || !sha.test(ticket.basis_digest)) fail("agent_start_ticket_unproven");
    const row = this.db.prepare("SELECT basis_digest, body FROM tickets WHERE id=?").get(ticket.ticket_id);
    if (!row || typeof row.body !== "string" || row.basis_digest !== ticket.basis_digest || digest(row.body).value !== ticket.basis_digest) fail("agent_start_ticket_unproven");
    return object(row.body);
  }
  // Prospective exclusive host resources reuse immutable format1 tickets.
  // Not a new user/host database schema and never provider qualification.
  listExclusive(namespace: string): { id: string; ticket: AgentStartTicket; basis: unknown }[] {
    return this.readExclusiveNamespaces([namespace]).map(({namespace:_,...row})=>row);
  }
  // Code-installed synchronous validation only. One complete original Host
  // transaction supplies detached rows; no view survives an await or effect.
  withExclusiveReadCut<T>(names:string[],action:()=>T):T {
    if(this.exclusiveReadCutActive||typeof action!=='function')fail('agent_start_read_cut_unavailable');
    if(!Array.isArray(names))fail('agent_start_exclusive_identity_invalid');
    const selected=[...names],rows=this.readExclusiveNamespaces(selected);
    this.exclusiveReadCutActive=true;this.exclusiveReadCut={names:new Set(selected),rows:structuredClone(rows)};
    try{
      const value=action();
      if(value instanceof Promise||value!==null&&(typeof value==='object'||typeof value==='function')&&typeof Reflect.get(value,'then')==='function'){
        void Promise.resolve(value).then(undefined,()=>{});fail('agent_start_read_cut_async_unavailable');
      }
      // Callback-local cached reads prove the original snapshot only. Require
      // fresh physical identity and full Host integrity at the end of THIS
      // stage before returning; a revoked root must not wait for the next cut.
      this.assertOrigin();
      return value;
    }finally{this.exclusiveReadCut=undefined;this.exclusiveReadCutActive=false;}
  }
  // One verified immutable Host cut for code-installed original readers.
  // Not a caller-controlled approval, write transaction or retained cache.
  readExclusiveNamespaces(names: string[]): {namespace:string;id:string;ticket:AgentStartTicket;basis:unknown}[] {
    if(!Array.isArray(names)||!names.length||names.length>16||new Set(names).size!==names.length||names.some(n=>typeof n!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(n)))fail('agent_start_exclusive_identity_invalid');
    const selected=new Set(names);
    if(this.exclusiveReadCut&&names.every(name=>this.exclusiveReadCut!.names.has(name)))return structuredClone(this.exclusiveReadCut.rows.filter(row=>selected.has(row.namespace)));
    return this.transaction(()=>{
      const seen=new Set<string>();
      return this.db.prepare('SELECT id,basis_digest,body FROM tickets').all().flatMap(row=>{
        const value=object(String(row.body)) as Record<string,unknown>;
        if(value?.format!=='cimiloop/host-exclusive-ticket/1.0.0'||typeof value.namespace!=='string'||!selected.has(value.namespace))return [];
        const key=value.namespace+'/'+String(value.id);
        if(Object.keys(value).sort().join(',')!=='basis,format,id,namespace'||typeof value.id!=='string'||!sha.test(value.id)||seen.has(key))fail('agent_start_exclusive_conflict');
        seen.add(key);return [{namespace:value.namespace,id:value.id,ticket:{format:'cimiloop/agent-start-ticket/1.0.0' as const,identity_digest:this.identityDigest,ticket_id:String(row.id),basis_digest:String(row.basis_digest)},basis:structuredClone(value.basis)}];
      });
    },false);
  }
  readExclusive(namespace: string, id: string): { ticket: AgentStartTicket; basis: unknown } | null {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(namespace) || !sha.test(id)) fail("agent_start_exclusive_identity_invalid");
    if(this.exclusiveReadCut?.names.has(namespace)){
      const row=this.exclusiveReadCut.rows.find(row=>row.namespace===namespace&&row.id===id);
      return row?structuredClone({ticket:row.ticket,basis:row.basis}):null;
    }
    return this.transaction(() => {
      const matches = this.db.prepare("SELECT id,basis_digest,body FROM tickets").all().filter(row => {
        const value = object(String(row.body)) as Record<string, unknown>;
        return value?.format === "cimiloop/host-exclusive-ticket/1.0.0" && value.namespace === namespace && value.id === id;
      });
      if (matches.length > 1) fail("agent_start_exclusive_conflict");
      if (!matches.length) return null;
      const row = matches[0]!, value = object(String(row.body)) as Record<string, unknown>;
      if (Object.keys(value).sort().join(",") !== "basis,format,id,namespace") fail("agent_start_exclusive_conflict");
      return { ticket: { format: "cimiloop/agent-start-ticket/1.0.0", identity_digest: this.identityDigest, ticket_id: String(row.id), basis_digest: String(row.basis_digest) }, basis: structuredClone(value.basis) };
    },false);
  }
  issueExclusive(namespace: string, id: string, rawBasis: unknown): AgentStartTicket {
    return this.claimExclusiveOnce(namespace, id, rawBasis).ticket;
  }
  // Same immutable format1 rows; the insertion result elects exactly one
  // dispatcher across connections/processes. A replay never grants an effect.
  claimExclusiveOnce(namespace: string, id: string, rawBasis: unknown): { created: boolean; ticket: AgentStartTicket } {return this.claimExclusiveBeforeSkillClosure(namespace,id,rawBasis);}
  // Prospective immutable capacity tickets inside Host1. No user database or
  // Host DDL migration. Sum and insert share ONE writer across all processes.
  private capacityState(ticket:AgentStartTicket){
    const envelope=this.ticketBody(ticket) as {format?:unknown;namespace?:unknown;basis?:any};
    const policy=envelope?.basis;
    if(envelope?.format!=='cimiloop/host-exclusive-ticket/1.0.0'||envelope.namespace!=='capacity_policy'||!policy||Object.keys(policy).sort().join(',')!=='binding,format,limits'||policy.format!=='cimiloop/host-capacity-policy/1.0.0')fail('agent_capacity_policy_invalid');
    const limits=policy.limits as Record<string,number>,keys=Object.keys(limits??{}).sort();
    if(!limits||Array.isArray(limits)||!keys.length||keys.length>8||keys.some(k=>!/^[a-z][a-z0-9_]{0,31}$/.test(k)||!Number.isSafeInteger(limits[k])||limits[k]!<1||limits[k]!>1000000000))fail('agent_capacity_policy_invalid');
    const held=Object.fromEntries(keys.map(k=>[k,0])),reservations:{id:string;ticket:AgentStartTicket;units:Record<string,number>;basis:unknown}[]=[];
    for(const row of this.db.prepare('SELECT id,basis_digest,body FROM tickets').all()){
      const value=object(String(row.body)) as any;
      if(value?.format!=='cimiloop/host-exclusive-ticket/1.0.0'||value.namespace!=='capacity_hold'||value.basis?.policy?.ticket_id!==ticket.ticket_id)continue;
      const hold=value.basis;
      if(Object.keys(hold).sort().join(',')!=='basis,format,policy,units'||hold.format!=='cimiloop/host-capacity-hold/1.0.0'||!isDeepStrictEqual(hold.policy,ticket))fail('agent_capacity_original_unproven');
      this.capacityUnits(keys,hold.units);
      for(const k of keys){held[k]!+=hold.units[k];if(held[k]!>limits[k]!)fail('agent_capacity_original_unproven');}
      reservations.push({id:value.id,ticket:{format:'cimiloop/agent-start-ticket/1.0.0',identity_digest:this.identityDigest,ticket_id:String(row.id),basis_digest:String(row.basis_digest)},units:hold.units,basis:hold.basis});
    }
    return{binding:policy.binding,limits,held,remaining:Object.fromEntries(keys.map(k=>[k,limits[k]!-held[k]!])),reservations};
  }
  private capacityUnits(keys:string[],units:Record<string,number>){
    if(!units||typeof units!=='object'||Array.isArray(units)||Object.keys(units).sort().join(',')!==keys.join(',')||keys.some(k=>!Number.isSafeInteger(units[k])||units[k]!<0||units[k]!>1000000000)||!keys.some(k=>units[k]!>0))fail('agent_capacity_units_invalid');
  }
  readCapacity(rawPolicy:AgentStartTicket){const policy=structuredClone(rawPolicy);return this.transaction(()=>structuredClone(this.capacityState(policy)),false);}
  reserveCapacity(rawPolicy:AgentStartTicket,id:string,rawUnits:Record<string,number>,rawBasis:unknown):{created:boolean;ticket:AgentStartTicket}{
    const policy=structuredClone(rawPolicy),units=copyToolJson(rawUnits) as Record<string,number>,basis=copyToolJson(rawBasis);
    if(!sha.test(id))fail('agent_start_exclusive_identity_invalid');
    const body=encoded({format:'cimiloop/host-exclusive-ticket/1.0.0',namespace:'capacity_hold',id,basis:{format:'cimiloop/host-capacity-hold/1.0.0',policy,units,basis}});
    return this.transaction(()=>{
      const state=this.capacityState(policy);this.capacityUnits(Object.keys(state.limits).sort(),units);
      const rows=this.db.prepare('SELECT id,basis_digest,body FROM tickets').all(),matches=rows.filter(row=>{const value=object(String(row.body)) as any;return value?.format==='cimiloop/host-exclusive-ticket/1.0.0'&&value.namespace==='capacity_hold'&&value.id===id;});
      if(matches.length>1||matches[0]&&matches[0].body!==body)fail('agent_start_exclusive_conflict');
      if(matches[0])return{created:false,ticket:{format:'cimiloop/agent-start-ticket/1.0.0',identity_digest:this.identityDigest,ticket_id:String(matches[0].id),basis_digest:String(matches[0].basis_digest)}};
      if(Object.keys(units).some(k=>units[k]!>state.remaining[k]!))fail('agent_capacity_exhausted');
      if(rows.length>=1024)fail('agent_start_ticket_capacity');
      const ticketId=randomUUID(),hash=digest(body).value;this.db.prepare('INSERT INTO tickets VALUES (?, ?, ?)').run(ticketId,hash,body);
      return{created:true,ticket:{format:'cimiloop/agent-start-ticket/1.0.0',identity_digest:this.identityDigest,ticket_id:ticketId,basis_digest:hash}};
    });
  }
  // Account writer -> Host writer, never the reverse. The original hold and
  // closed-child check share this same immutable Host commit across processes.
  claimBudgetHoldBeforeSkillClosure(id:string,rawBasis:unknown,rawScope:AgentWorkspaceToolScope){
    const scope=parseAgentWorkspaceToolScope(rawScope),closedId=digest(encoded({invocation_key:scope.operation_key,project_id:scope.project_id})).value;
    return this.claimExclusiveBeforeSkillClosure('dedicated_account_hold',id,rawBasis,closedId);
  }
  private claimExclusiveBeforeSkillClosure(namespace: string, id: string, rawBasis: unknown,closedId?:string): { created: boolean; ticket: AgentStartTicket } {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(namespace) || !sha.test(id)) fail("agent_start_exclusive_identity_invalid");
    // Keep the check and insert in one writer transaction across processes.
    const body = encoded({ format: "cimiloop/host-exclusive-ticket/1.0.0", namespace, id, basis: rawBasis });
    return this.transaction(() => {
      const rows = this.db.prepare("SELECT id,basis_digest,body FROM tickets").all();
      if(closedId&&rows.some(row=>{const value=object(String(row.body)) as {format?:unknown;namespace?:unknown;id?:unknown;basis?:{format?:unknown}};return value?.format==='cimiloop/host-exclusive-ticket/1.0.0'&&value.namespace==='skill_invocation_dispatch'&&value.id===closedId&&value.basis?.format==='cimiloop/skill-invocation-dispatch-block/1.0.0';}))fail('agent_account_skill_scope_closed');
      const matches = rows.filter(row => {
        const value = object(String(row.body)) as Record<string, unknown>;
        return value?.format === "cimiloop/host-exclusive-ticket/1.0.0" && value.namespace === namespace && value.id === id;
      });
      if (matches.length > 1 || matches[0] && matches[0].body !== body) fail("agent_start_exclusive_conflict");
      if (matches[0]) return { created: false, ticket: { format: "cimiloop/agent-start-ticket/1.0.0" as const, identity_digest: this.identityDigest, ticket_id: String(matches[0].id), basis_digest: String(matches[0].basis_digest) } };
      if (rows.length >= 1024) fail("agent_start_ticket_capacity");
      const ticketId = randomUUID(), basis = digest(body).value;
      this.db.prepare("INSERT INTO tickets VALUES (?, ?, ?)").run(ticketId, basis, body);
      return { created: true, ticket: { format: "cimiloop/agent-start-ticket/1.0.0" as const, identity_digest: this.identityDigest, ticket_id: ticketId, basis_digest: basis } };
    });
  }
  inspect(ticket: AgentStartTicket, rawScope: AgentWorkspaceToolScope): { state: "unclaimed" } | { state: "claimed"; material_digest: Digest; claim_digest: Digest } {
    this.readTicket(ticket); return this.originalClaim(ticket,rawScope);
  }
  private originalClaim(ticket:AgentStartTicket,rawScope:AgentWorkspaceToolScope):ReturnType<AgentStartLedger["inspect"]> {
    const scope = parseAgentWorkspaceToolScope(rawScope), body = encoded(scope);
    const row = this.db.prepare("SELECT * FROM claims WHERE run_id=? OR operation_key=?").get(scope.run_id, scope.operation_key);
    if (!row) return { state: "unclaimed" };
    if (row.operation_key === scope.operation_key && row.run_id !== scope.run_id) fail("agent_start_operation_key_conflict");
    if (row.scope_body !== body || row.ticket_id !== ticket.ticket_id || typeof row.material_digest !== "string" || !sha.test(row.material_digest) ||
      typeof row.claim_digest !== "string" || row.claim_digest !== digest(encoded({ ticket, scope, material_digest: { algorithm: "sha256", value: row.material_digest } })).value) fail("agent_start_claim_conflict");
    return { state: "claimed", material_digest: { algorithm: "sha256", value: row.material_digest }, claim_digest: { algorithm: "sha256", value: row.claim_digest } };
  }
  // One synchronous read cut. No caller callback, effects or cache; repeat after
  // independent verification/await. Full physical/DDL/all-row audit on both sides.
  readOriginalScope(ticket:AgentStartTicket,scope:AgentWorkspaceToolScope) {
    const originalTicket=structuredClone(ticket),originalScope=parseAgentWorkspaceToolScope(scope);
    if(this.db.isTransaction)fail('agent_start_read_cut_nested');
    this.db.exec('BEGIN');
    try{this.assertOrigin();const result={basis:this.ticketBody(originalTicket),claim:this.originalClaim(originalTicket,originalScope)};this.assertOrigin();this.db.exec('COMMIT');return structuredClone(result);}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  claim(ticket: AgentStartTicket, rawScope: AgentWorkspaceToolScope, material: Digest): { created: boolean; claim_digest: Digest } {
    const scope = parseAgentWorkspaceToolScope(rawScope), original = { ...material };
    if (!material || Object.keys(material).sort().join(",") !== "algorithm,value" || material.algorithm !== "sha256" || !sha.test(material.value)) fail("agent_start_material_unproven");
    return this.transaction(() => {
      const prior = this.inspect(ticket, scope);
      if (prior.state === "claimed") { if (!isDeepStrictEqual(prior.material_digest, original)) fail("agent_start_claim_conflict"); return { created: false, claim_digest: prior.claim_digest }; }
      if (Number(this.db.prepare("SELECT count(*) AS n FROM claims").get()!.n) >= 4096) fail("agent_start_claim_capacity");
      const claimDigest = digest(encoded({ ticket, scope, material_digest: original }));
      this.db.prepare("INSERT INTO claims VALUES (?, ?, ?, ?, ?, ?)").run(scope.run_id, scope.operation_key, ticket.ticket_id, encoded(scope), original.value, claimDigest.value);
      return { created: true, claim_digest: claimDigest };
    });
  }

  // Code-only synchronous capture after semantic admission. It grants no
  // authority and never issues a ticket, claim, bill or model request.
  captureOriginalTickets(raw:AgentStartTicket[]):AgentStartOriginalTicketSeal{
    const state=originalHosts.get(this);if(!state)fail('agent_start_original_ticket_seal_unproven');const tickets=selectedOriginalTickets(state,raw);
    const checked:unknown=state.verify?.(state.root);if(checked instanceof Promise||checked!==null&&(typeof checked==='object'||typeof checked==='function')&&typeof Reflect.get(checked,'then')==='function'){void Promise.resolve(checked).then(undefined,()=>{});fail('agent_start_original_ticket_seal_async');}if(checked!==undefined)fail('agent_start_original_ticket_seal_unproven');
    const rows=readFixedOriginalTickets(state,tickets),seal=freezeOriginal({format:'cimiloop/agent-start-original-ticket-seal/1.0.0' as const,identity_digest:digest(encoded(state.original)).value,tickets:structuredClone(rows)});
    originalTicketSeals.set(seal,{state,tickets:structuredClone(tickets),rows:structuredClone(rows)});return seal;
  }

  close() { this.db.close(); }
}
