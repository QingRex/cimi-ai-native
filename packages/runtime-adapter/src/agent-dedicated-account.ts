import {DatabaseSync,type SQLOutputValue} from "node:sqlite";
import {mkdirSync,lstatSync,realpathSync,existsSync} from "node:fs";
import {join,resolve,dirname,relative,isAbsolute,sep} from "node:path";
import {isDeepStrictEqual} from "node:util";
import {assertOrdinaryPath,digest,RuntimeAdapterError} from "./files.js";
import {parseGatewayJson} from "./gateway-conversation.js";
import {AgentStartLedger,type AgentStartTicket} from "./agent-start-ledger.js";
import {validateModelConnection,type DedicatedModelConnection} from "./connection.js";
import {parseDedicatedAgentProfile,type DedicatedAgentProfile} from "./agent-dedicated-codec.js";
import {parseAgentWorkspaceToolScope,type AgentWorkspaceToolScope} from "./agent-workspace-authority.js";
import type {DedicatedAgentAccountPort,DedicatedAgentBudgetRequest,DedicatedAgentBudgetHold} from "./agent-dedicated-model.js";
import {AccountBillingStore,captureBillVerification,type AccountBillingOrigin,type DedicatedAgentBillVerification} from "./agent-account-bills.js";
import {openWindowsAgentStartCustody} from "./agent-start-custody-native.js";
import {LegacyAccountBillingAttachment} from './agent-legacy-account-billing.js';

export interface DedicatedAgentAccountPolicy {
 format:"cimiloop/dedicated-agent-account/1.0.0";host_identity_digest:string;account_digest:string;approval_digest:string;package_digest:string;tariff_digest:string;
 admission_digest:string;connection_digest:string;profile:DedicatedAgentProfile;
 cash_limit_micros:number;credit_limit_micro_units:number;cash_per_call_upper_micros:number;credit_per_call_upper_micro_units:number;input_token_limit:number;output_token_limit:number;
}
// Code-installed verifier, not a boolean/JSON approval. Must verify actual
// Human/model/package/caps/tariff and full physical quota/recovery qualification,
// including approved service-side input bounds. This module supplies no defaults.
export interface DedicatedAgentAccountAdmission {check(scope:AgentWorkspaceToolScope,connection:DedicatedModelConnection,policy:DedicatedAgentAccountPolicy):Promise<void>}
export interface DedicatedAgentAccountCustody {protect(root:string):void;verify(root:string):void}
interface OpenOptions {origin:AgentStartLedger;accountDigest:string;connection:DedicatedModelConnection;admission:DedicatedAgentAccountAdmission;custody:DedicatedAgentAccountCustody;billing?:DedicatedAgentBillVerification|undefined}
interface InitializeOptions extends Omit<OpenOptions,"accountDigest"> {repositoryPath:string;root:string;policy:DedicatedAgentAccountPolicy}
interface AccountOrigin {format:"cimiloop/dedicated-agent-account-origin/1.0.0"|"cimiloop/dedicated-agent-account-origin/2.0.0";billing?:AccountBillingOrigin;account_database_version?:2;root:string;directory_identity:string;file_identity:string;policy:DedicatedAgentAccountPolicy}
type Row=Record<string,SQLOutputValue>;
type AccountFunds={cashHeld:bigint;creditHeld:bigint;cashCharged:bigint;creditCharged:bigint;overBudget:boolean;billed:Set<string>;records:ReturnType<AccountBillingStore['audit']>};
const appId=0x434d4131,namespace="dedicated_agent_account",holdNamespace="dedicated_account_hold",sha=/^[a-f0-9]{64}$/;
const exact=(x:unknown,fields:string[]):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x)&&Object.keys(x).sort().join(",")===[...fields].sort().join(",");
const integer=(n:unknown,min=0,max=1000000000000):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=min&&n<=max;
function fail(reason="agent_account_original_unproven"):never{throw new RuntimeAdapterError(reason);}
const copy=<T>(x:T):T=>JSON.parse(JSON.stringify(x)) as T;
const encoded=(x:unknown):string=>{const s=JSON.stringify(x);if(Buffer.byteLength(s)>65536)fail("agent_account_record_limit");return s;};
const parse=(s:string)=>copy(parseGatewayJson(s,65536));
const ordinaryAbsolute=(path:string)=>{if(!isAbsolute(path)||(process.platform==="win32"&&!/^[a-zA-Z]:\\/.test(path)))fail("agent_account_root_invalid");return assertOrdinaryPath(path);};
const physical=(path:string,dir:boolean)=>{const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if((dir?!s.isDirectory():!s.isFile()||s.nlink!==1n)||s.ino<=0n)fail();return digest(JSON.stringify({device:String(s.dev),inode:String(s.ino),created_ns:String(s.birthtimeNs)})).value;};
const policyCopy=(raw:DedicatedAgentAccountPolicy):DedicatedAgentAccountPolicy=>{
 const keys=["format","host_identity_digest","account_digest","approval_digest","package_digest","tariff_digest","admission_digest","connection_digest","profile","cash_limit_micros","credit_limit_micro_units","cash_per_call_upper_micros","credit_per_call_upper_micro_units","input_token_limit","output_token_limit"];
 if(!exact(raw,keys)||raw.format!=="cimiloop/dedicated-agent-account/1.0.0"||keys.filter(k=>k.endsWith("digest")).some(k=>typeof raw[k]!=="string"||!sha.test(raw[k] as string))||
  ![raw.cash_limit_micros,raw.credit_limit_micro_units,raw.cash_per_call_upper_micros,raw.credit_per_call_upper_micro_units].every(n=>integer(n))||raw.cash_per_call_upper_micros>raw.cash_limit_micros||raw.credit_per_call_upper_micro_units>raw.credit_limit_micro_units||!integer(raw.input_token_limit,1,1000000)||!integer(raw.output_token_limit,1,65536))fail("agent_account_policy_invalid");
 const profile=parseDedicatedAgentProfile(raw.profile);return {...copy(raw),profile};
};
const ddl=[
 `CREATE TABLE account_origin (singleton INTEGER PRIMARY KEY CHECK(singleton=1), body TEXT NOT NULL, digest TEXT NOT NULL) STRICT`,
 `CREATE TABLE account_holds (request_id TEXT PRIMARY KEY, scope_digest TEXT NOT NULL, call_id TEXT NOT NULL, scope TEXT NOT NULL, request TEXT NOT NULL, body BLOB NOT NULL, hold TEXT NOT NULL, hold_digest TEXT NOT NULL, UNIQUE(scope_digest,call_id)) STRICT`,
 ...["account_origin","account_holds"].flatMap(table=>["UPDATE","DELETE"].map(action=>`CREATE TRIGGER ${table}_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'immutable account original'); END`))
];
// Explicit NEW billing-root format, never an in-place upgrade of SQL1 originals.
const billingAccountDdl=[...ddl,
 `CREATE TABLE account_bills (id TEXT PRIMARY KEY, body TEXT NOT NULL, digest TEXT NOT NULL) STRICT`,
 ...["UPDATE","DELETE"].map(action=>`CREATE TRIGGER account_bills_${action.toLowerCase()} BEFORE ${action} ON account_bills BEGIN SELECT RAISE(ABORT,'immutable account bill intent'); END`)
];

// One original host/account-root authority. No credential/network dependency,
// usage-based refunds or auto-upgrade. Final charges require original bills.
export class DedicatedAgentAccountLedger implements DedicatedAgentAccountPort {
 readonly admission_digest:string;
 private closed=false;
 private bills:AccountBillingStore|undefined;
 private attachment:LegacyAccountBillingAttachment|undefined;
 private billingOrigin:AccountBillingOrigin|undefined;
 private constructor(private readonly options:OpenOptions,private readonly original:AccountOrigin,private readonly ticket:AgentStartTicket,private readonly db:DatabaseSync,private attachmentRecovery=false){this.admission_digest=original.policy.admission_digest;
  try{
  this.attachment=original.format==="cimiloop/dedicated-agent-account-origin/1.0.0"&&!attachmentRecovery?LegacyAccountBillingAttachment.open(original,ticket,options.origin,options.custody):undefined;
  this.billingOrigin=original.billing??this.attachment?.billing;
  this.bills=this.billingOrigin?AccountBillingStore.open(original.root,this.billingOrigin,original.policy,options.billing,options.origin):undefined;
  if(!this.bills&&options.billing)fail("agent_account_billing_requires_new_origin");
  }catch(e){this.attachment?.close();throw e;}
  this.options={origin:options.origin,accountDigest:options.accountDigest,connection:copy(options.connection),admission:{check:options.admission.check.bind(options.admission)},custody:{protect:options.custody.protect.bind(options.custody),verify:options.custody.verify.bind(options.custody)}};
 }
 get profile():DedicatedAgentProfile{return copy(this.original.policy.profile);}
 static initialize(options:InitializeOptions):DedicatedAgentAccountLedger {
  if(options.billing)captureBillVerification(options.billing);
  const policy=policyCopy(options.policy),connection=copy(validateModelConnection(options.connection));
  if(!(options.origin instanceof AgentStartLedger)||policy.host_identity_digest!==options.origin.identityDigest||digest(JSON.stringify(connection)).value!==policy.connection_digest||connection.model!==connection.provider+"/"+policy.profile.model||typeof options.admission?.check!=="function"||typeof options.custody?.protect!=="function"||typeof options.custody?.verify!=="function")fail("agent_account_installation_unavailable");
  if(options.origin.readExclusive(namespace,policy.account_digest))fail("agent_account_already_registered");
  const root=ordinaryAbsolute(options.root);ordinaryAbsolute(options.repositoryPath);
  const repository=realpathSync.native(options.repositoryPath),target=join(realpathSync.native(assertOrdinaryPath(dirname(root))),root.slice(dirname(root).length+1));
  const path=relative(repository,target);if(path!==".."&&!path.startsWith(".."+sep)&&!isAbsolute(path))fail("agent_account_inside_repository_denied");
  try{mkdirSync(root);}catch{fail("agent_account_root_already_exists");}
  options.custody.protect(root);options.custody.verify(root);const file=join(root,"account.sqlite");if(existsSync(file))fail();
  const db=new DatabaseSync(file,{timeout:5000});let ledger:DedicatedAgentAccountLedger|undefined;try{
   db.exec(`PRAGMA application_id=${appId}; PRAGMA user_version=${options.billing?2:1}; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA max_page_count=32768; PRAGMA wal_autocheckpoint=128;`);
   for(const sql of options.billing?billingAccountDdl:ddl)db.exec(sql);
   const billing=options.billing?AccountBillingStore.initialize(root,policy,options.billing):undefined;
   const original:AccountOrigin={format:billing?"cimiloop/dedicated-agent-account-origin/2.0.0":"cimiloop/dedicated-agent-account-origin/1.0.0",...(billing?{billing,account_database_version:2}:{}),root:resolve(root),directory_identity:physical(root,true),file_identity:physical(file,false),policy};
   const body=encoded(original);db.prepare("INSERT INTO account_origin VALUES(1,?,?)").run(body,digest(body).value);
   const ticket=options.origin.issueExclusive(namespace,policy.account_digest,original);
   ledger=new DedicatedAgentAccountLedger({...options,accountDigest:policy.account_digest,connection},original,ticket,db);ledger.read(()=>undefined);return ledger;
  }catch(error){if(ledger)ledger.close();else db.close();throw error;}
 }
 static open(options:OpenOptions):DedicatedAgentAccountLedger {
  return this.openInternal(options);
 }
 // Explicit trusted installation; no JSON/HTTP field or ordinary-open upgrade.
 static attachOriginalBilling(options:OpenOptions & {billing:DedicatedAgentBillVerification}):DedicatedAgentAccountLedger {
  if(!(options.origin instanceof AgentStartLedger)||!sha.test(options.accountDigest))fail('agent_account_installation_unavailable');
  captureBillVerification(options.billing);
  if(options.origin.readExclusive('dedicated_account_billing_attachment',options.accountDigest))return this.open(options);
  const ledger=this.openInternal({...options,billing:undefined},true);
  try{ledger.read(()=>{
   ledger.attachment=LegacyAccountBillingAttachment.attach(ledger.original,ledger.ticket,options.origin,options.custody,options.billing);
   ledger.billingOrigin=ledger.attachment.billing;
   ledger.bills=AccountBillingStore.open(ledger.original.root,ledger.billingOrigin,ledger.original.policy,options.billing,options.origin);
   ledger.attachmentRecovery=false;
  },true);return ledger;}catch(e){ledger.close();throw e;}
 }
 private static openInternal(options:OpenOptions,attachmentRecovery=false):DedicatedAgentAccountLedger {
  if(!(options.origin instanceof AgentStartLedger)||!sha.test(options.accountDigest)||typeof options.admission?.check!=="function"||typeof options.custody?.verify!=="function")fail("agent_account_installation_unavailable");
  const registration=options.origin.readExclusive(namespace,options.accountDigest);if(!registration)fail("agent_account_original_missing");
  const original=copy(registration.basis) as AccountOrigin;
  if(!exact(original,["format","root","directory_identity","file_identity","policy",...(original.format==="cimiloop/dedicated-agent-account-origin/2.0.0"?["billing","account_database_version"]:[])])||!["cimiloop/dedicated-agent-account-origin/1.0.0","cimiloop/dedicated-agent-account-origin/2.0.0"].includes(original.format)||original.format==="cimiloop/dedicated-agent-account-origin/2.0.0"&&original.account_database_version!==2||typeof original.root!=="string"||!isAbsolute(original.root)||!sha.test(original.directory_identity)||!sha.test(original.file_identity))fail();
  policyCopy(original.policy);const connection=copy(validateModelConnection(options.connection));
  ordinaryAbsolute(original.root);
  if(original.policy.account_digest!==options.accountDigest||original.policy.host_identity_digest!==options.origin.identityDigest||original.policy.connection_digest!==digest(JSON.stringify(connection)).value)fail();
  // Stat before opening SQLite: absent originals must never create a new DB.
  try{if(physical(original.root,true)!==original.directory_identity||physical(join(original.root,"account.sqlite"),false)!==original.file_identity)fail();}catch{fail("agent_account_original_missing");}
  options.custody.verify(original.root);for(const suffix of ["-wal","-shm","-journal"])assertOrdinaryPath(join(original.root,"account.sqlite")+suffix);
  const db=new DatabaseSync(join(original.root,"account.sqlite"),{timeout:5000});let ledger:DedicatedAgentAccountLedger|undefined;try{db.exec("PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=128; PRAGMA max_page_count=32768;");ledger=new DedicatedAgentAccountLedger({...options,connection},original,registration.ticket,db,attachmentRecovery);ledger.read(()=>undefined);return ledger;}catch(error){if(ledger)ledger.close();else db.close();throw error;}
 }
 private request(scope:AgentWorkspaceToolScope,raw:DedicatedAgentBudgetRequest,bytes:Uint8Array):DedicatedAgentBudgetRequest {
  const fields=["scope_digest","admission_digest","connection_digest","call_id","request_id","request_digest","input_bytes","max_output_tokens"],p=this.original.policy;
  if(!exact(raw,fields)||!(bytes instanceof Uint8Array)||!integer(bytes.length,1,65536)||raw.scope_digest!==digest(JSON.stringify(scope)).value||raw.admission_digest!==p.admission_digest||raw.connection_digest!==p.connection_digest||typeof raw.call_id!=="string"||!/^model_\d{4}$/.test(raw.call_id)||!integer(Number(raw.call_id.slice(6)),1,64)||typeof raw.request_id!=="string"||!sha.test(raw.request_id)||raw.request_digest!==digest(bytes).value||raw.input_bytes!==bytes.length||!integer(raw.max_output_tokens,1,p.output_token_limit))fail("agent_account_request_invalid");
  return copy(raw);
 }
 private hold(request:DedicatedAgentBudgetRequest):DedicatedAgentBudgetHold {const p=this.original.policy;return {...copy(request),format:"cimiloop/agent-model-budget-hold/1.0.0",account_digest:p.account_digest,approval_digest:p.approval_digest,tariff_digest:p.tariff_digest,cash_upper_micros:p.cash_per_call_upper_micros,credit_upper_micro_units:p.credit_per_call_upper_micro_units,input_token_limit:p.input_token_limit,output_token_limit:request.max_output_tokens};}
 private anchorId(request:DedicatedAgentBudgetRequest){return digest(JSON.stringify([this.options.accountDigest,request.scope_digest,request.call_id])).value;}
 private anchor(scope:AgentWorkspaceToolScope,request:DedicatedAgentBudgetRequest,hold:DedicatedAgentBudgetHold,text:string){return {format:"cimiloop/dedicated-account-hold-origin/1.0.0",account_digest:this.options.accountDigest,account_ticket_id:this.ticket.ticket_id,scope:copy(scope),request:copy(request),hold:copy(hold),hold_digest:digest(text).value};}
 private validate():{rows:Row[];funds:AccountFunds} {
  if(this.closed)fail("agent_account_closed");this.options.custody.verify(this.original.root);
  const registration=this.options.origin.readExclusive(namespace,this.options.accountDigest);
  if(!registration||!isDeepStrictEqual(registration.ticket,this.ticket)||!isDeepStrictEqual(registration.basis,this.original)||this.original.policy.host_identity_digest!==this.options.origin.identityDigest||physical(this.original.root,true)!==this.original.directory_identity||physical(join(this.original.root,"account.sqlite"),false)!==this.original.file_identity)fail();
  const schema=this.db.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY sql").all().map(r=>String(r.sql));
  const sql2=this.original.account_database_version===2;
  if(this.db.prepare("PRAGMA application_id").get()?.application_id!==appId||this.db.prepare("PRAGMA user_version").get()?.user_version!==(sql2?2:1)||!isDeepStrictEqual(schema,[...(sql2?billingAccountDdl:ddl)].sort())||this.db.prepare("PRAGMA quick_check").get()?.quick_check!=="ok")fail("agent_account_corrupt");
  if(!sql2&&!this.attachmentRecovery){if(this.attachment)this.attachment.seals();else LegacyAccountBillingAttachment.assertAbsent(this.original,this.ticket,this.options.origin,this.options.custody);}
  const origin=this.db.prepare("SELECT body,digest FROM account_origin WHERE singleton=1").get();if(typeof origin?.body!=="string"||origin.digest!==digest(origin.body).value||!isDeepStrictEqual(parse(origin.body),this.original))fail();
  const rows=this.db.prepare("SELECT * FROM account_holds ORDER BY request_id").all();if(rows.length>1023)fail("agent_account_corrupt");let cash=0n,credits=0n;
  // Complete bidirectional audit, not just this call's anchor. A missing
  // account row after the durable host commit is Unknown, never free budget.
  const anchors=this.options.origin.listExclusive(holdNamespace).filter(x=>(x.basis as Record<string,unknown>)?.account_digest===this.options.accountDigest);
  if(anchors.length!==rows.length)fail("agent_account_hold_original_missing");
  for(const row of rows){if(typeof row.scope!=="string"||typeof row.request!=="string"||typeof row.hold!=="string"||!(row.body instanceof Uint8Array))fail("agent_account_corrupt");
   const scope=parseAgentWorkspaceToolScope(parse(row.scope)),request=this.request(scope,parse(row.request) as DedicatedAgentBudgetRequest,row.body),hold=this.hold(request);
   if(row.request_id!==request.request_id||row.scope_digest!==request.scope_digest||row.call_id!==request.call_id||row.hold_digest!==digest(row.hold).value||!isDeepStrictEqual(parse(row.hold),hold))fail("agent_account_corrupt");
   const anchor=anchors.find(x=>x.id===this.anchorId(request));if(!anchor||!isDeepStrictEqual(copy(anchor.basis),this.anchor(scope,request,hold,row.hold)))fail("agent_account_hold_original_missing");
   cash+=BigInt(hold.cash_upper_micros);credits+=BigInt(hold.credit_upper_micro_units);
  }
  if(!this.bills&&(cash>BigInt(this.original.policy.cash_limit_micros)||credits>BigInt(this.original.policy.credit_limit_micro_units)))fail("agent_account_corrupt");return{rows,funds:this.finances(rows)};
 }
 // Reads reserve the SAME parent writer cut. A WAL reader snapshot must not
 // compare an old account intent with a concurrently committed Host/bill row.
 private read<T>(action:(rows:Row[],funds:AccountFunds)=>T,write=false):T {this.db.exec("BEGIN IMMEDIATE");try{const {rows,funds}=this.validate(),out=action(rows,funds);if(write)this.validate();this.db.exec("COMMIT");return out;}catch(error){this.db.exec("ROLLBACK");throw error;}}
 async check(raw:AgentWorkspaceToolScope,connection:DedicatedModelConnection):Promise<void>{const scope=parseAgentWorkspaceToolScope(raw),fixed=copy(validateModelConnection(connection));if(!isDeepStrictEqual(fixed,this.options.connection))fail("agent_account_connection_changed");const budget=(_rows:Row[],funds:AccountFunds)=>{if(funds.overBudget)fail("agent_account_budget_exhausted");};this.read(budget);
  try{await this.options.admission.check(copy(scope),copy(fixed),copy(this.original.policy));}catch{fail("agent_account_admission_unavailable");}this.read(budget);
 }
 async reserve(raw:AgentWorkspaceToolScope,input:DedicatedAgentBudgetRequest,originalBody:Uint8Array,beforeHold?:()=>void):Promise<DedicatedAgentBudgetHold>{const scope=parseAgentWorkspaceToolScope(raw),body=Buffer.from(originalBody),request=this.request(scope,copy(input),body);await this.check(scope,this.options.connection);
  return this.read((rows,funds)=>{if(funds.overBudget)fail("agent_account_budget_exhausted");const prior=rows.find(r=>r.request_id===request.request_id||r.scope_digest===request.scope_digest&&r.call_id===request.call_id);
   if(prior){if(prior.scope!==JSON.stringify(scope)||!isDeepStrictEqual(parse(String(prior.request)),request)||!(prior.body instanceof Uint8Array)||!Buffer.from(prior.body).equals(body))fail("agent_account_request_conflict");return copy(parse(String(prior.hold)) as DedicatedAgentBudgetHold);}
   if(rows.length>=1023)fail("agent_account_capacity_exhausted");
   if(rows.some(r=>{const other=parseAgentWorkspaceToolScope(parse(String(r.scope)));return (other.run_id===scope.run_id||other.operation_key===scope.operation_key)&&r.scope_digest!==request.scope_digest;}))fail("agent_account_scope_conflict");
   const runRows=rows.filter(r=>r.scope_digest===request.scope_digest);if(request.call_id!=="model_"+String(runRows.length+1).padStart(4,"0"))fail("agent_account_call_sequence_denied");
   const hold=this.hold(request),cash=funds.cashHeld+funds.cashCharged+BigInt(hold.cash_upper_micros),credits=funds.creditHeld+funds.creditCharged+BigInt(hold.credit_upper_micro_units);
   if(funds.overBudget||cash>BigInt(this.original.policy.cash_limit_micros)||credits>BigInt(this.original.policy.credit_limit_micro_units))fail("agent_account_budget_exhausted");
   // Trusted synchronous Kernel recheck after awaited admission and the final
   // writer audit. No asynchronous gap may precede the irreversible hold.
   beforeHold?.();
   const text=encoded(hold);
   // Host commit FIRST under the account writer lock. SQL/crash failure after
   // this point retains the original anchor and blocks every subsequent read
   // or reserve; it must not repair, release funds or authorize a model resend.
   this.options.origin.issueExclusive(holdNamespace,this.anchorId(request),this.anchor(scope,request,hold,text));
   this.db.prepare("INSERT INTO account_holds VALUES(?,?,?,?,?,?,?,?)").run(request.request_id,request.scope_digest,request.call_id,encoded(scope),encoded(request),body,text,digest(text).value);return copy(hold);
  },true);
 }
 async verifyHold(raw:AgentWorkspaceToolScope,hold:DedicatedAgentBudgetHold):Promise<void>{const scope=parseAgentWorkspaceToolScope(raw),expected=copy(hold);await this.check(scope,this.options.connection);this.read((rows,funds)=>{if(funds.overBudget)fail("agent_account_budget_exhausted");const row=rows.find(r=>r.scope_digest===digest(JSON.stringify(scope)).value&&r.call_id===expected.call_id);if(!row||!isDeepStrictEqual(parse(String(row.hold)),expected))fail("agent_account_hold_unproven");});}
 readOriginalHold(raw:AgentWorkspaceToolScope,call:string):DedicatedAgentBudgetHold|null {const scope=parseAgentWorkspaceToolScope(raw);return this.read(rows=>{const row=rows.find(r=>r.scope_digest===digest(JSON.stringify(scope)).value&&r.call_id===call);return row?copy(parse(String(row.hold)) as DedicatedAgentBudgetHold):null;});}
 private finances(rows:Row[]):AccountFunds{
  const holds=rows.map(r=>parse(String(r.hold)) as DedicatedAgentBudgetHold),records=this.bills?.audit(holds,this.seals())??[],items=records.flatMap(r=>r.projection.items),billed=new Set(items.map(i=>i.request_id));
  let cashHeld=0n,creditHeld=0n,cashCharged=0n,creditCharged=0n,overBudget=false;
  for(const hold of holds){const item=items.find(i=>i.request_id===hold.request_id);if(!item){cashHeld+=BigInt(hold.cash_upper_micros);creditHeld+=BigInt(hold.credit_upper_micro_units);}else{cashCharged+=BigInt(item.cash_charged_micros);creditCharged+=BigInt(item.credit_charged_micro_units);if(item.cash_charged_micros>hold.cash_upper_micros||item.credit_charged_micro_units>hold.credit_upper_micro_units)overBudget=true;}}
  overBudget||=cashHeld+cashCharged>BigInt(this.original.policy.cash_limit_micros)||creditHeld+creditCharged>BigInt(this.original.policy.credit_limit_micro_units);
  return{cashHeld,creditHeld,cashCharged,creditCharged,overBudget,billed,records};
 }
 private seals(){return this.attachment?this.attachment.seals():this.db.prepare("SELECT id,body,digest FROM account_bills ORDER BY id").all().map(r=>({id:r.id,body:r.body,digest:r.digest}));}
 observeBill(bytes:Uint8Array){if(!this.bills)fail("agent_account_bill_verifier_unavailable");return this.read(rows=>this.bills!.observe(bytes,rows.map(r=>parse(String(r.hold)) as DedicatedAgentBudgetHold),()=>this.seals(),(id,body,hash)=>{if(this.attachment)this.attachment.seal(id,body,hash);else this.db.prepare("INSERT INTO account_bills VALUES(?,?,?)").run(id,body,hash);}),true);}
 readRunCosts(raw:AgentWorkspaceToolScope){const scope=parseAgentWorkspaceToolScope(raw),scopeDigest=digest(JSON.stringify(scope)).value;return this.read((rows,funds)=>{
  if(rows.some(r=>{const other=parseAgentWorkspaceToolScope(parse(String(r.scope)));return(other.run_id===scope.run_id||other.operation_key===scope.operation_key)&&r.scope_digest!==scopeDigest;}))fail("agent_account_scope_conflict");
  const selected=rows.filter(r=>r.scope_digest===scopeDigest),items=funds.records.flatMap(r=>r.projection.items).filter(i=>i.scope_digest===scopeDigest),unresolved=selected.length-items.length;
  return{account_digest:this.options.accountDigest,scope_digest:scopeDigest,currency:this.billingOrigin?.currency??null,credit_unit:this.billingOrigin?.credit_unit??null,holds:selected.length,unresolved,costs_reconciled:!!this.bills&&selected.length>0&&unresolved===0,cash_charged_micros:Number(items.reduce((n,i)=>n+BigInt(i.cash_charged_micros),0n)),credit_charged_micro_units:Number(items.reduce((n,i)=>n+BigInt(i.credit_charged_micro_units),0n)),bill_originals:funds.records.filter(r=>r.projection.items.some(i=>i.scope_digest===scopeDigest)).map(r=>({bill_id:r.projection.bill_id,bytes_digest:r.bytes_digest,projection_digest:digest(JSON.stringify(r.projection)).value})),starts_run:false as const};
 });}
 snapshot(){return this.read((rows,f)=>{const p=this.original.policy;return{account_digest:p.account_digest,holds:rows.length,billed_holds:f.billed.size,currency:this.billingOrigin?.currency??null,credit_unit:this.billingOrigin?.credit_unit??null,cash_limit_micros:p.cash_limit_micros,credit_limit_micro_units:p.credit_limit_micro_units,cash_held_micros:Number(f.cashHeld),credit_held_micro_units:Number(f.creditHeld),cash_charged_micros:Number(f.cashCharged),credit_charged_micro_units:Number(f.creditCharged),cash_remaining_micros:Number(BigInt(p.cash_limit_micros)>f.cashHeld+f.cashCharged?BigInt(p.cash_limit_micros)-f.cashHeld-f.cashCharged:0n),credit_remaining_micro_units:Number(BigInt(p.credit_limit_micro_units)>f.creditHeld+f.creditCharged?BigInt(p.credit_limit_micro_units)-f.creditHeld-f.creditCharged:0n),over_budget:f.overBudget,costs_reconciled:!!this.bills&&rows.length>0&&f.billed.size===rows.length,formal_agent_execution_enabled:false as const};});}
 close(){if(!this.closed){this.closed=true;this.bills?.close();this.attachment?.close();this.db.close();}}
}
export async function initializeWindowsDedicatedAgentAccountLedger(options:Omit<InitializeOptions,"custody"> & {toolsRoot:string},signal?:AbortSignal){const port=await openWindowsAgentStartCustody(options.toolsRoot,signal);signal?.throwIfAborted();return DedicatedAgentAccountLedger.initialize({...options,custody:{protect:root=>{port("protect",root);},verify:root=>{port("verify",root);}}});}
export async function openWindowsDedicatedAgentAccountLedger(options:Omit<OpenOptions,"custody"> & {toolsRoot:string},signal?:AbortSignal){const port=await openWindowsAgentStartCustody(options.toolsRoot,signal);signal?.throwIfAborted();return DedicatedAgentAccountLedger.open({...options,custody:{protect:root=>{port("protect",root);},verify:root=>{port("verify",root);}}});}
export async function attachWindowsDedicatedAgentAccountBilling(options:Omit<OpenOptions,"custody"> & {billing:DedicatedAgentBillVerification;toolsRoot:string},signal?:AbortSignal){const port=await openWindowsAgentStartCustody(options.toolsRoot,signal);signal?.throwIfAborted();return DedicatedAgentAccountLedger.attachOriginalBilling({...options,custody:{protect:root=>{port("protect",root);},verify:root=>{port("verify",root);}}});}
