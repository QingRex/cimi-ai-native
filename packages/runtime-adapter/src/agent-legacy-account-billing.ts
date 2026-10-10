import {DatabaseSync} from 'node:sqlite';
import {existsSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';
import {AgentStartLedger,type AgentStartTicket} from './agent-start-ledger.js';
import {AccountBillingStore,captureBillVerification,type AccountBillingOrigin,type DedicatedAgentBillVerification} from './agent-account-bills.js';
import type {DedicatedAgentAccountPolicy,DedicatedAgentAccountCustody} from './agent-dedicated-account.js';
import {assertOrdinaryPath,digest,RuntimeAdapterError} from './files.js';
import {parseGatewayJson} from './gateway-conversation.js';

const claimNamespace='dedicated_account_billing_attachment_claim',completeNamespace='dedicated_account_billing_attachment';
const appId=0x434d4232;
const ddl=[
 'CREATE TABLE attachment_origin (singleton INTEGER PRIMARY KEY CHECK(singleton=1), body TEXT NOT NULL, digest TEXT NOT NULL) STRICT',
 'CREATE TABLE bill_intents (id TEXT PRIMARY KEY, body TEXT NOT NULL, digest TEXT NOT NULL) STRICT',
 ...['attachment_origin','bill_intents'].flatMap(t=>['UPDATE','DELETE'].map(a=>`CREATE TRIGGER ${t}_${a.toLowerCase()} BEFORE ${a} ON ${t} BEGIN SELECT RAISE(ABORT,'immutable legacy billing attachment'); END`))
];
interface Basis {root:string;policy:DedicatedAgentAccountPolicy;directory_identity:string;file_identity:string;format:string}
interface Descriptor {format:'cimiloop/legacy-account-billing-attachment/1.0.0';claim:unknown;billing:AccountBillingOrigin;intent_file_identity:string}
function fail(reason='agent_account_billing_attachment_unproven'):never{throw new RuntimeAdapterError(reason);}
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
const physical=(file:string)=>{const s=lstatSync(assertOrdinaryPath(file),{bigint:true});if(!s.isFile()||s.nlink!==1n||s.ino<=0n)fail();return digest(JSON.stringify({device:String(s.dev),inode:String(s.ino),created_ns:String(s.birthtimeNs)})).value;};
const parse=(s:string)=>copy(parseGatewayJson(s,65536));
const intentPath=(root:string)=>join(root,'billing-attachment.sqlite');
const present=(root:string)=>['billing.sqlite','billing-attachment.sqlite'].some(f=>['','-wal','-shm','-journal'].some(s=>existsSync(join(root,f)+s)));

// Explicit additive migration. The historical account origin, SQL1 schema,
// holds, original Run and request identities are never rewritten. A distinct
// durable intent DB prevents consistent loss of Host + bill rows from refunding.
export class LegacyAccountBillingAttachment {
 private constructor(private readonly root:string,private readonly descriptor:Descriptor,private readonly host:AgentStartLedger,private readonly account:string,private readonly custody:DedicatedAgentAccountCustody,private readonly db:DatabaseSync){}
 get billing(){return copy(this.descriptor.billing);}
 static open(original:Basis,ticket:AgentStartTicket,host:AgentStartLedger,custody:DedicatedAgentAccountCustody):LegacyAccountBillingAttachment|undefined {
  const account=original.policy.account_digest,claim=host.readExclusive(claimNamespace,account),complete=host.readExclusive(completeNamespace,account);
  if(!claim&&!complete){if(present(original.root)||host.listExclusive('dedicated_account_bill').some(r=>(r.basis as Record<string,unknown>)?.account_digest===account))fail();return undefined;}
  if(!claim||!complete)fail('agent_account_billing_attachment_pending');
  const c=claim.basis as Record<string,unknown>,d=complete.basis as Descriptor;
  if(!equal(Object.keys(c).sort(),['format','account_ticket','account_origin','verifier_identity_digest','currency','credit_unit'].sort())||c.format!=='cimiloop/legacy-account-billing-attachment-claim/1.0.0'||!equal(c.account_ticket,ticket)||!equal(c.account_origin,original)||
   !equal(Object.keys(d).sort(),['format','claim','billing','intent_file_identity'].sort())||d.format!=='cimiloop/legacy-account-billing-attachment/1.0.0'||!equal(d.claim,claim)||d.billing?.verifier_identity_digest!==c.verifier_identity_digest||d.billing?.currency!==c.currency||d.billing?.credit_unit!==c.credit_unit)fail();
  custody.verify(original.root);const path=intentPath(original.root);try{if(physical(path)!==d.intent_file_identity)fail();}catch{fail('agent_account_billing_attachment_missing');}
  for(const s of ['-wal','-shm','-journal'])assertOrdinaryPath(path+s);
  const db=new DatabaseSync(path,{timeout:5000});let result:LegacyAccountBillingAttachment|undefined;try{db.exec('PRAGMA synchronous=FULL; PRAGMA max_page_count=32768; PRAGMA wal_autocheckpoint=128;');result=new LegacyAccountBillingAttachment(original.root,copy(d),host,account,custody,db);result.seals();return result;}catch(e){if(result)result.close();else db.close();throw e;}
 }
 static attach(original:Basis,ticket:AgentStartTicket,host:AgentStartLedger,custody:DedicatedAgentAccountCustody,rawPort:DedicatedAgentBillVerification):LegacyAccountBillingAttachment {
  const port=captureBillVerification(rawPort),account=original.policy.account_digest;
  if(original.format!=='cimiloop/dedicated-agent-account-origin/1.0.0')fail('agent_account_billing_attachment_legacy_only');
  const basis={format:'cimiloop/legacy-account-billing-attachment-claim/1.0.0',account_ticket:copy(ticket),account_origin:copy(original),verifier_identity_digest:port.identity_digest,currency:port.currency,credit_unit:port.credit_unit};
  let claim=host.readExclusive(claimNamespace,account);const fresh=!claim;
  if(claim&&!equal(claim.basis,basis))fail('agent_account_billing_attachment_conflict');
  if(!claim){if(present(original.root)||host.readExclusive(completeNamespace,account))fail();host.issueExclusive(claimNamespace,account,basis);claim=host.readExclusive(claimNamespace,account);}
  if(!claim)fail();
  if(!host.readExclusive(completeNamespace,account)){
   // Without the independently committed physical descriptor, self-reported
   // DB identities cannot prove these are the initial files. Preserve Unknown.
   if(!fresh)fail('agent_account_billing_attachment_pending');
   const billing=AccountBillingStore.initialize(original.root,original.policy,port);
   const path=intentPath(original.root);let descriptor:Descriptor;
   if(existsSync(path))fail();
    for(const s of ['-wal','-shm','-journal']){assertOrdinaryPath(path+s);if(existsSync(path+s))fail();}
    const db=new DatabaseSync(path,{timeout:5000});try{db.exec(`PRAGMA application_id=${appId}; PRAGMA user_version=1; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA max_page_count=32768; PRAGMA wal_autocheckpoint=128;`);for(const sql of ddl)db.exec(sql);
     descriptor={format:'cimiloop/legacy-account-billing-attachment/1.0.0',claim:copy(claim),billing,intent_file_identity:physical(path)};const body=JSON.stringify(descriptor);db.prepare('INSERT INTO attachment_origin VALUES(1,?,?)').run(body,digest(body).value);
    }finally{db.close();}
   custody.protect(original.root);custody.verify(original.root);
   // Validate before completing registration. A committed descriptor with a
   // lost acknowledgement can reopen only these same physical DBs.
   const verifierDb=new DatabaseSync(path,{readOnly:true});try{verifyDb(verifierDb,descriptor);}finally{verifierDb.close();}
   host.issueExclusive(completeNamespace,account,descriptor);
  }
  const attached=this.open(original,ticket,host,custody);if(!attached)fail();return attached;
 }
 static assertAbsent(original:Basis,ticket:AgentStartTicket,host:AgentStartLedger,custody:DedicatedAgentAccountCustody){const value=this.open(original,ticket,host,custody);if(value){value.close();fail('agent_account_billing_attachment_changed');}}
 seals(){
  this.custody.verify(this.root);const complete=this.host.readExclusive(completeNamespace,this.account),claim=this.host.readExclusive(claimNamespace,this.account);
  if(!complete||!equal(complete.basis,this.descriptor)||!equal(claim,this.descriptor.claim)||physical(intentPath(this.root))!==this.descriptor.intent_file_identity)fail();
  verifyDb(this.db,this.descriptor);const rows=this.db.prepare('SELECT id,body,digest FROM bill_intents ORDER BY id').all();if(rows.length>1023)fail();return rows.map(r=>({id:r.id,body:r.body,digest:r.digest}));
 }
 seal(id:string,body:string,hash:string){this.seals();if(body.length>60000||hash!==digest(body).value)fail();this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO bill_intents VALUES(?,?,?)').run(id,body,hash);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 close(){this.db.close();}
}
function verifyDb(db:DatabaseSync,descriptor:Descriptor){
 const schema=db.prepare('SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY sql').all().map(r=>String(r.sql)),row=db.prepare('SELECT body,digest FROM attachment_origin WHERE singleton=1').get();
 if(db.prepare('PRAGMA application_id').get()?.application_id!==appId||db.prepare('PRAGMA user_version').get()?.user_version!==1||db.prepare('PRAGMA quick_check').get()?.quick_check!=='ok'||!equal(schema,[...ddl].sort())||typeof row?.body!=='string'||row.digest!==digest(row.body).value||!equal(parse(row.body),descriptor))fail();
}
