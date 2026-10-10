import { DatabaseSync } from 'node:sqlite';
import { lstatSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assertOrdinaryPath, digest, RuntimeAdapterError } from './files.js';
import { parseGatewayJson } from './gateway-conversation.js';
import { AgentStartLedger } from './agent-start-ledger.js';
import type { DedicatedAgentAccountPolicy } from './agent-dedicated-account.js';
import type { DedicatedAgentBudgetHold } from './agent-dedicated-model.js';
export interface DedicatedAgentBillItem {
 request_id:string;scope_digest:string;call_id:string;request_digest:string;hold_digest:string;
 cash_charged_micros:number;credit_charged_micro_units:number;
}
export interface DedicatedAgentBill {
 format:'cimiloop/dedicated-account-bill/1.0.0';bill_id:string;
 account_digest:string;approval_digest:string;package_digest:string;tariff_digest:string;connection_digest:string;
 currency:string;credit_unit:string;items:DedicatedAgentBillItem[];
}
// Code-installed, synchronous authority. Authenticate original provider bytes,
// historical approved tariff/units and FINAL request charges on EVERY audit.
// No credential, usage conversion, imported JSON or permissive default here.
export interface DedicatedAgentBillVerification {
 identity_digest:string;currency:string;credit_unit:string;
 verifyOriginal(bytes:Uint8Array,basis:{policy:DedicatedAgentAccountPolicy;holds:DedicatedAgentBudgetHold[]}):unknown;
}
export interface AccountBillingOrigin {
 format:'cimiloop/account-billing-origin/1.0.0';file_identity:string;policy_digest:string;
 verifier_identity_digest:string;currency:string;credit_unit:string;
}
interface BillRecord {
 format:'cimiloop/account-bill-original/1.0.0';account_digest:string;billing_origin:AccountBillingOrigin;
 bytes_base64:string;bytes_digest:string;projection:DedicatedAgentBill;
}
interface BillSeal {id:unknown;body:unknown;digest:unknown}
const appId=0x434d4231,namespace='dedicated_account_bill',sha=/^[a-f0-9]{64}$/;
function fail(reason='agent_account_bill_original_unproven'):never{throw new RuntimeAdapterError(reason);}
const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x)) as T;
const canonical=(x:unknown):unknown=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x;
const policyDigest=(p:DedicatedAgentAccountPolicy)=>digest(JSON.stringify(canonical(p))).value;
const exact=(x:unknown,keys:string[]):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
const encoded=(x:unknown)=>{const s=JSON.stringify(x);if(Buffer.byteLength(s)>60000)fail('agent_account_bill_record_limit');return s;};
const physical=(path:string)=>{const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!s.isFile()||s.nlink!==1n||s.ino<=0n)fail();return digest(JSON.stringify({device:String(s.dev),inode:String(s.ino),created_ns:String(s.birthtimeNs)})).value;};
const ddl=[
 'CREATE TABLE billing_origin (singleton INTEGER PRIMARY KEY CHECK(singleton=1), body TEXT NOT NULL, digest TEXT NOT NULL) STRICT',
 'CREATE TABLE bills (id TEXT PRIMARY KEY, body TEXT NOT NULL, digest TEXT NOT NULL) STRICT',
 ...['billing_origin','bills'].flatMap(table=>['UPDATE','DELETE'].map(action=>`CREATE TRIGGER ${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'immutable billing original'); END`))
];
export function captureBillVerification(port:DedicatedAgentBillVerification):DedicatedAgentBillVerification {
 if(!port||!sha.test(port.identity_digest)||typeof port.currency!=='string'||!/^[A-Z]{3}$/.test(port.currency)||typeof port.credit_unit!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(port.credit_unit)||typeof port.verifyOriginal!=='function')fail('agent_account_bill_verifier_unavailable');
 return {identity_digest:port.identity_digest,currency:port.currency,credit_unit:port.credit_unit,verifyOriginal:port.verifyOriginal.bind(port)};
}
export class AccountBillingStore {
 private constructor(private readonly path:string,private readonly descriptor:AccountBillingOrigin,private readonly policy:DedicatedAgentAccountPolicy,private readonly port:DedicatedAgentBillVerification,private readonly host:AgentStartLedger,private readonly db:DatabaseSync){}
 static initialize(root:string,policy:DedicatedAgentAccountPolicy,rawPort:DedicatedAgentBillVerification):AccountBillingOrigin {
  const port=captureBillVerification(rawPort),path=join(root,'billing.sqlite');if(existsSync(path))fail();const db=new DatabaseSync(path,{timeout:5000});
  try{db.exec(`PRAGMA application_id=${appId}; PRAGMA user_version=1; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA max_page_count=32768;`);for(const sql of ddl)db.exec(sql);
   const descriptor:AccountBillingOrigin={format:'cimiloop/account-billing-origin/1.0.0',file_identity:physical(path),policy_digest:policyDigest(policy),verifier_identity_digest:port.identity_digest,currency:port.currency,credit_unit:port.credit_unit};
   const body=encoded(descriptor);db.prepare('INSERT INTO billing_origin VALUES(1,?,?)').run(body,digest(body).value);return descriptor;
  }finally{db.close();}
 }
 static open(root:string,descriptor:AccountBillingOrigin,policy:DedicatedAgentAccountPolicy,rawPort:DedicatedAgentBillVerification|undefined,host:AgentStartLedger){
  if(!rawPort)fail('agent_account_bill_verifier_unavailable');const port=captureBillVerification(rawPort),path=join(root,'billing.sqlite');
  if(!exact(descriptor,['format','file_identity','policy_digest','verifier_identity_digest','currency','credit_unit'])||descriptor.format!=='cimiloop/account-billing-origin/1.0.0'||!sha.test(descriptor.file_identity)||descriptor.policy_digest!==policyDigest(policy)||descriptor.verifier_identity_digest!==port.identity_digest||descriptor.currency!==port.currency||descriptor.credit_unit!==port.credit_unit)fail();
  try{if(physical(path)!==descriptor.file_identity)fail();}catch{fail('agent_account_bill_original_missing');}
  for(const suffix of ['-wal','-shm','-journal'])assertOrdinaryPath(path+suffix);
  const db=new DatabaseSync(path,{timeout:5000});try{db.exec('PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=128; PRAGMA max_page_count=32768;');return new AccountBillingStore(path,clone(descriptor),clone(policy),port,host,db);}catch(error){db.close();throw error;}
 }
 private projection(bytes:Uint8Array,holds:DedicatedAgentBudgetHold[]):DedicatedAgentBill {
  let value:unknown;try{value=this.port.verifyOriginal(Buffer.from(bytes),{policy:clone(this.policy),holds:clone(holds)});}catch{fail('agent_account_bill_verification_unavailable');}
  const p=this.policy;
  if(!exact(value,['format','bill_id','account_digest','approval_digest','package_digest','tariff_digest','connection_digest','currency','credit_unit','items'])||value.format!=='cimiloop/dedicated-account-bill/1.0.0'||typeof value.bill_id!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.bill_id)||value.account_digest!==p.account_digest||value.approval_digest!==p.approval_digest||value.package_digest!==p.package_digest||value.tariff_digest!==p.tariff_digest||value.connection_digest!==p.connection_digest||value.currency!==this.descriptor.currency||value.credit_unit!==this.descriptor.credit_unit||!Array.isArray(value.items)||value.items.length<1||value.items.length>64)fail('agent_account_bill_projection_invalid');
  const seen=new Set<string>();for(const item of value.items){
   if(!exact(item,['request_id','scope_digest','call_id','request_digest','hold_digest','cash_charged_micros','credit_charged_micro_units'])||typeof item.request_id!=='string'||!sha.test(item.request_id)||seen.has(item.request_id)||![item.cash_charged_micros,item.credit_charged_micro_units].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=1000000000000))fail('agent_account_bill_projection_invalid');
   const hold=holds.find(h=>h.request_id===item.request_id);
   if(!hold||hold.scope_digest!==item.scope_digest||hold.call_id!==item.call_id||hold.request_digest!==item.request_digest||digest(JSON.stringify(hold)).value!==item.hold_digest)fail('agent_account_bill_request_unproven');seen.add(item.request_id);
  }
  return clone(value) as unknown as DedicatedAgentBill;
 }
 private identity(bill:DedicatedAgentBill){return digest(JSON.stringify([this.policy.account_digest,bill.bill_id])).value;}
 // Called only under the parent account transaction/writer. This independent
 // store is mandatory in the dual-pinned account origin, including zero bills.
 audit(holds:DedicatedAgentBudgetHold[],seals:BillSeal[]):BillRecord[]{
  if(physical(this.path)!==this.descriptor.file_identity)fail();
  const schema=this.db.prepare('SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY sql').all().map(r=>String(r.sql));
  if(this.db.prepare('PRAGMA application_id').get()?.application_id!==appId||this.db.prepare('PRAGMA user_version').get()?.user_version!==1||!isDeepStrictEqual(schema,[...ddl].sort())||this.db.prepare('PRAGMA quick_check').get()?.quick_check!=='ok')fail('agent_account_bill_corrupt');
  const origin=this.db.prepare('SELECT body,digest FROM billing_origin WHERE singleton=1').get();if(typeof origin?.body!=='string'||origin.digest!==digest(origin.body).value||!isDeepStrictEqual(clone(parseGatewayJson(origin.body)),this.descriptor))fail();
  const rows=this.db.prepare('SELECT id,body,digest FROM bills ORDER BY id').all(),anchors=this.host.listExclusive(namespace).filter(x=>(x.basis as Record<string,unknown>)?.account_digest===this.policy.account_digest);
  if(rows.length>1023||rows.length!==anchors.length||rows.length!==seals.length)fail('agent_account_bill_original_missing');
  const seen=new Set<string>();return rows.map(row=>{
   if(typeof row.body!=='string'||row.digest!==digest(row.body).value)fail();
   const value=clone(parseGatewayJson(row.body,60000));if(!exact(value,['format','account_digest','billing_origin','bytes_base64','bytes_digest','projection'])||value.format!=='cimiloop/account-bill-original/1.0.0'||value.account_digest!==this.policy.account_digest||!isDeepStrictEqual(value.billing_origin,this.descriptor)||typeof value.bytes_base64!=='string')fail();
   const bytes=Buffer.from(value.bytes_base64,'base64');if(bytes.length<1||bytes.length>16384||bytes.toString('base64')!==value.bytes_base64||value.bytes_digest!==digest(bytes).value)fail();
   const projection=this.projection(bytes,holds),seal=seals.find(s=>s.id===row.id);if(!seal||typeof seal.body!=='string'||seal.digest!==digest(seal.body).value||!isDeepStrictEqual(clone(parseGatewayJson(seal.body,60000)),value)||!isDeepStrictEqual(projection,value.projection)||row.id!==this.identity(projection)||!isDeepStrictEqual(anchors.find(a=>a.id===row.id)?.basis,value))fail();
   for(const item of projection.items){if(seen.has(item.request_id))fail('agent_account_bill_duplicate_request');seen.add(item.request_id);}
   return clone(value) as unknown as BillRecord;
  });
 }
 observe(rawBytes:Uint8Array,holds:DedicatedAgentBudgetHold[],readSeals:()=>BillSeal[],sealOriginal:(id:string,body:string,hash:string)=>void){
  if(!(rawBytes instanceof Uint8Array)||rawBytes.length<1||rawBytes.length>16384)fail('agent_account_bill_record_limit');const bytes=Buffer.from(rawBytes);
  this.db.exec('BEGIN IMMEDIATE');try{
   const records=this.audit(holds,readSeals()),projection=this.projection(bytes,holds),id=this.identity(projection);
   const record:BillRecord={format:'cimiloop/account-bill-original/1.0.0',account_digest:this.policy.account_digest,billing_origin:clone(this.descriptor),bytes_base64:bytes.toString('base64'),bytes_digest:digest(bytes).value,projection};
   const body=encoded(record),prior=records.find(r=>r.projection.bill_id===projection.bill_id);
   if(prior){if(!isDeepStrictEqual(prior,record))fail('agent_account_bill_conflict');this.db.exec('COMMIT');return{bill_id:projection.bill_id,replay:true};}
   if(records.some(r=>r.projection.items.some(i=>projection.items.some(next=>next.request_id===i.request_id))))fail('agent_account_bill_duplicate_request');
   if(records.length>=1023)fail('agent_account_bill_capacity_exhausted');
   // Host FIRST, independent SQL SECOND. Interrupted commits remain Unknown,
   // never a refund, repair, replacement bill or authorization to resend.
   // Parent account intent is written first and commits LAST. A Host or bill
   // commit without the parent intent must remain Unknown on every later audit.
   sealOriginal(id,body,digest(body).value);this.host.issueExclusive(namespace,id,record);this.db.prepare('INSERT INTO bills VALUES(?,?,?)').run(id,body,digest(body).value);this.audit(holds,readSeals());this.db.exec('COMMIT');return{bill_id:projection.bill_id,replay:false};
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 close(){this.db.close();}
}
