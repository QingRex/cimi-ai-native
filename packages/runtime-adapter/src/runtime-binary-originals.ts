import { DatabaseSync } from "node:sqlite";
import { constants, mkdirSync, existsSync, copyFileSync, openSync, closeSync, fsyncSync, writeFileSync, lstatSync, readdirSync } from "node:fs";
import { join, resolve, toNamespacedPath } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { bytesAt, digest, assertOrdinaryPath, directory, RuntimeAdapterError } from "./files.js";
import { readFileWriteGenerations, retainedBinaryWriteGenerationFloor } from "./file-write-generation.js";
const applicationId=0x4349424f, maximumEntries=128, maximumBytes=4*1024*1024*1024, fileLimit=512*1024*1024;
function fail():never {throw new RuntimeAdapterError("runtime_binary_original_unproven");}
type Physical={dev:string;ino:string;birthtime_ns:string};
const physical=(path:string,kind:"file"|"directory"="file"):Physical=>{const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(kind==="file"? !s.isFile()||s.nlink!==1n:!s.isDirectory())fail();return {dev:String(s.dev),ino:String(s.ino),birthtime_ns:String(s.birthtimeNs)};};
const identity=(path:string)=>{const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(s.size<1n||s.size>BigInt(fileLimit))fail();return {...physical(path),bytes:Number(s.size)};};
// One synchronous observation may hash the same retained binary many times.
// Repeats inside that observation reuse the first byte digest. The outermost
// observation replays every repeated read, then reads it again, then checks
// the retained dev/ino/birthtime/size and a fresh digest. A later replay cannot
// leave an earlier result accepted, and a same-byte new file cannot keep the
// old proof. Calls outside a turn always read bytes.
type BinaryHit={dev:string;ino:string;birthtime_ns:string;bytes:number;sha:string};
type ObservationMemo={key:string;value:unknown;hits:number;rerun:()=>unknown;identity?:object};
let binaryTurn:Map<string,BinaryHit>|undefined,binaryDepth=0,observationMemos:ObservationMemo[]|undefined,observationBypass=false,bypassCache:Map<string,unknown>|undefined,retainedFresh:Map<string,BinaryHit>|undefined;
function contentSha(path:string,fresh=false){const id=identity(path),key=resolve(path);if(!fresh&&retainedFresh?.has(key)){const held=retainedFresh.get(key)!;if(held.dev!==id.dev||held.ino!==id.ino||held.birthtime_ns!==id.birthtime_ns||held.bytes!==id.bytes)fail();return held.sha;}const hit=!fresh?binaryTurn?.get(key):undefined;if(hit&&hit.dev===id.dev&&hit.ino===id.ino&&hit.birthtime_ns===id.birthtime_ns&&hit.bytes===id.bytes)return hit.sha;const sha=digest(bytesAt(path,fileLimit)).value;if(!fresh&&binaryTurn)binaryTurn.set(key,{dev:id.dev,ino:id.ino,birthtime_ns:id.birthtime_ns,bytes:id.bytes,sha});return sha;}
export function digestRuntimeBinaryFile(path:string){return contentSha(path);}
// Repeated original observations inside one synchronous proof reuse the first
// plain result. A single observation is not replayed. Reused observations are
// read again after every callback, and then read once more. The optional
// reread is that final check: it must not close over a scoped reader or an
// installed callback. Without it, the original producer is read again.
export function rememberOriginalObservation<T>(key:string,produce:()=>T,reread?:()=>T):T{
 if(!observationMemos)return produce();
 if(observationBypass){const cached=bypassCache?.get(key);if(cached)return structuredClone(cached) as T;const value=(reread??produce)();bypassCache?.set(key,value);return structuredClone(value) as T;}
 const hit=observationMemos.find(entry=>entry.key===key);
 if(hit){hit.hits++;return structuredClone(hit.value) as T;}
 const value=produce();observationMemos.push({key,value:structuredClone(value),hits:1,rerun:reread??produce});return value;
}
// Branded originals keep the object that owns their private verifier. A repeated
// observation returns that same object. The outermost proof reads it again.
export function rememberOriginalIdentity<T extends object>(key:string,produce:()=>T):T{
 if(observationBypass||!observationMemos)return produce();
 const hit=observationMemos.find(entry=>entry.key===key);
 if(hit?.identity){hit.hits++;return hit.identity as T;}
 const identity=produce();observationMemos.push({key,value:structuredClone(identity),identity,hits:1,rerun:produce});return identity;
}
export function digestBoundedOriginalFile(path:string,maximum:number,bytes?:Buffer){const stat=lstatSync(assertOrdinaryPath(path),{bigint:true});if(!stat.isFile()||stat.isSymbolicLink()||stat.size>BigInt(maximum))fail();const id={dev:String(stat.dev),ino:String(stat.ino),birthtime_ns:String(stat.birthtimeNs),bytes:Number(stat.size)},key=resolve(path);if(!bytes&&binaryTurn){const hit=binaryTurn.get(key);if(hit&&hit.dev===id.dev&&hit.ino===id.ino&&hit.birthtime_ns===id.birthtime_ns&&hit.bytes===id.bytes)return hit.sha;}const body=bytes??bytesAt(path,maximum);if(body.length!==Number(stat.size))fail();if(stat.nlink!==1n||stat.ino<=0n||stat.size<1n)return digest(body).value;const sha=digest(body).value;if(binaryTurn&&!observationBypass)binaryTurn.set(key,{...id,sha});return sha;}
function replayOriginalObservations(){
 observationBypass=true;bypassCache=new Map();
 try{for(const entry of observationMemos!){if(entry.hits<=1)continue;const already=bypassCache.get(entry.key),fresh=already??entry.rerun();if(!already)bypassCache.set(entry.key,fresh);if(!isDeepStrictEqual(structuredClone(fresh),entry.value))fail();}}
 finally{observationBypass=false;bypassCache=undefined;}
}
export type RetainedBinaryProofIdentity={path:string;dev:string;ino:string;birthtime_ns:string;bytes:number;bytes_sha:string;bytes_usn?:string};
// A later admission may recheck these identities without re-entering a child
// callback. The snapshot is only valid inside the turn that hashed the files.
// bytes_usn is the NTFS write generation observed with that hash. It is absent
// when the generation cannot be read; absence never skips the byte hash.
export function snapshotRuntimeBinaryProofIdentities(ownedHelperRoot?:string):RetainedBinaryProofIdentity[]{
 if(!binaryTurn)fail();
 const entries=[...binaryTurn.entries()],large=entries.filter(([,hit])=>hit.bytes>=retainedBinaryWriteGenerationFloor).map(([path])=>path);
 const generations=large.length?readFileWriteGenerations(large,ownedHelperRoot):undefined;
 return entries.map(([path,hit])=>{const usn=hit.bytes>=retainedBinaryWriteGenerationFloor?generations?.get(path):undefined;return {path,dev:hit.dev,ino:hit.ino,birthtime_ns:hit.birthtime_ns,bytes:hit.bytes,bytes_sha:hit.sha,...(usn?{bytes_usn:usn}:{})};});
}
export function proveRetainedBinaryProof(hits:readonly RetainedBinaryProofIdentity[],ownedHelperRoot?:string):void{
 const large=hits.filter(hit=>hit.bytes>=retainedBinaryWriteGenerationFloor&&hit.bytes_usn).map(hit=>hit.path);
 const generations=large.length?readFileWriteGenerations(large,ownedHelperRoot):undefined;
 for(const hit of hits){
  const id=identity(hit.path);if(id.dev!==hit.dev||id.ino!==hit.ino||id.birthtime_ns!==hit.birthtime_ns||id.bytes!==hit.bytes)fail();
  // Same write generation after the survey: the sealed bytes were not written.
  // A mismatch, a new file, or an unreadable generation still hashes.
  const usn=hit.bytes_usn&&hit.bytes>=retainedBinaryWriteGenerationFloor?generations?.get(resolve(hit.path)):undefined;
  if(usn&&usn===hit.bytes_usn)continue;
  if(contentSha(hit.path,true)!==hit.bytes_sha)fail();
 }
}
// One later admission recheck may reuse the sealed byte digest while it re-reads
// the same survey. Physical identity is checked before that reuse. After the
// survey, the sealed NTFS write generation is read again. Unchanged generation
// closes that file; any other result hashes it. Neither result is kept.
export function withRetainedBinaryRecheck<T>(hits:readonly RetainedBinaryProofIdentity[],run:()=>T,ownedHelperRoot?:string):T{
 if(retainedFresh)fail();
 const installed=new Map<string,BinaryHit>();
 for(const hit of hits){const id=identity(hit.path);if(id.dev!==hit.dev||id.ino!==hit.ino||id.birthtime_ns!==hit.birthtime_ns||id.bytes!==hit.bytes)fail();installed.set(resolve(hit.path),{dev:hit.dev,ino:hit.ino,birthtime_ns:hit.birthtime_ns,bytes:hit.bytes,sha:hit.bytes_sha});}
 retainedFresh=installed;recheckProofs=new Map();
 try{
  const value=run();
  const pending=recheckProofs? [...recheckProofs.values()]:[];
  recheckProofs=undefined;
  for(const hit of pending)if(!isDeepStrictEqual(readRuntimeBinaryOriginal(hit.root,hit.path,hit.sha),hit.proof))fail();
  proveRetainedBinaryProof(hits,ownedHelperRoot);return value;
 }
 finally{retainedFresh=undefined;recheckProofs=undefined;}
}
export function withRuntimeBinaryProofTurn<T>(run:()=>T):T{
 const outer=binaryDepth===0;if(outer){binaryTurn=new Map();observationMemos=[];}binaryDepth++;
 try{
  const value=run();
  if(outer){
   // Callbacks may still run in the first replay. The second replay starts
   // only after every one of those callbacks has returned, so a later replay
   // cannot change an earlier result and still be accepted. Physical identity
   // is closed after both replays, not by digest alone.
   replayOriginalObservations();replayOriginalObservations();
   for(const [path,hit] of binaryTurn!){const id=identity(path);if(id.dev!==hit.dev||id.ino!==hit.ino||id.birthtime_ns!==hit.birthtime_ns||id.bytes!==hit.bytes||contentSha(path,true)!==hit.sha)fail();}
  }
  return value;
 }
 finally{binaryDepth--;if(binaryDepth===0){binaryTurn=undefined;observationMemos=undefined;}}
}
const syncFile=(path:string)=>{const fd=openSync(path,"r+");try{fsyncSync(fd);}finally{closeSync(fd);}};
const save=(path:string,value:unknown)=>{writeFileSync(assertOrdinaryPath(path),JSON.stringify(value),{flag:"wx"});syncFile(path);};
const read=(path:string):unknown=>JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytesAt(path,16384)));
const schema=[
 ["table","originals", "CREATE TABLE originals (sha TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, bytes INTEGER NOT NULL CHECK(bytes>0), origin TEXT NOT NULL CHECK(origin IN ('retained','legacy')), state TEXT NOT NULL CHECK(state IN ('reserved','retained')), dev TEXT, ino TEXT, birthtime_ns TEXT) STRICT"],
 ["trigger","originals_no_delete","CREATE TRIGGER originals_no_delete BEFORE DELETE ON originals BEGIN SELECT RAISE(ABORT,'original_immutable'); END"],
 ["trigger","originals_once","CREATE TRIGGER originals_once BEFORE UPDATE ON originals WHEN OLD.state!='reserved' OR NEW.state!='retained' OR NEW.sha IS NOT OLD.sha OR NEW.path IS NOT OLD.path OR NEW.bytes IS NOT OLD.bytes OR NEW.origin IS NOT OLD.origin OR NEW.dev IS NULL OR NEW.ino IS NULL OR NEW.birthtime_ns IS NULL BEGIN SELECT RAISE(ABORT,'original_immutable'); END"]
].sort((a,b)=>a[1]!.localeCompare(b[1]!));
function open(root:string,create:boolean){
 root=assertOrdinaryPath(resolve(root));
 const base=join(root,"runtime-binary-originals"),claims=join(root,"runtime-binary-original-claims"),database=join(base,"index.sqlite"),marker=join(root,"runtime-binary-original-registry.json");
 const registered=existsSync(assertOrdinaryPath(marker));
 if(!registered){
  if(!create||existsSync(assertOrdinaryPath(base))||existsSync(assertOrdinaryPath(claims)))fail();
  mkdirSync(base);mkdirSync(claims);
 } else if(!existsSync(assertOrdinaryPath(database))||!existsSync(assertOrdinaryPath(claims)))fail();
 for(const path of [database,database+"-wal",database+"-shm",database+"-journal"])assertOrdinaryPath(path);
 // Canonical names and physical custody remain unchanged. Only the Windows
 // driver filename uses its extended spelling for nested child operation roots.
 const db=new DatabaseSync(toNamespacedPath(database),{timeout:5000,readOnly:!create});
 try{
  if(!registered){
   db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;"+schema.map(x=>x[2]+";").join("")+`PRAGMA application_id=${applicationId}; PRAGMA user_version=1;`);
   save(marker,{format:"cimiloop/runtime-binary-originals/1.0.0",root,base:physical(base,"directory"),claims:physical(claims,"directory"),database:physical(database),maximum_entries:maximumEntries,maximum_bytes:maximumBytes,physical_quota_enforced:false});
  }
  const registry=read(marker), expected={format:"cimiloop/runtime-binary-originals/1.0.0",root,base:physical(base,"directory"),claims:physical(claims,"directory"),database:physical(database),maximum_entries:maximumEntries,maximum_bytes:maximumBytes,physical_quota_enforced:false};
  if(!isDeepStrictEqual(registry,expected)||db.prepare("PRAGMA application_id").get()!.application_id!==applicationId||db.prepare("PRAGMA user_version").get()!.user_version!==1||db.prepare("PRAGMA quick_check").get()!.quick_check!=="ok")fail();
  return {root,base,claims,db,registry_digest:digest(bytesAt(marker,16384)).value};
 }catch(error){db.close();throw error;}
}
type Store=ReturnType<typeof open>;
type Reservation={format:string;registry_digest:string;sha:string;path:string;bytes:number;origin:"retained"|"legacy"};
function audit(s:Store){
 const ddl=s.db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name").all().map(x=>[x.type,x.name,x.sql]);
 if(!isDeepStrictEqual(ddl,schema))fail();
 const rows=s.db.prepare("SELECT * FROM originals ORDER BY sha").all();
 const names=readdirSync(assertOrdinaryPath(s.claims));if(names.length>maximumEntries||rows.length!==names.length)fail();
 let reservedBytes=0;
 for(const name of names){
  if(!/^[a-f0-9]{64}$/.test(name))fail();
  const claimDir=join(s.claims,name);physical(claimDir,"directory");
  const files=readdirSync(claimDir).sort(),row=rows.find(x=>x.sha===name);if(!row||!isDeepStrictEqual(files,row.state==="retained"?["reserved.json","retained.json"]:["reserved.json"]))fail();
  const reservation:Reservation={format:"cimiloop/runtime-binary-reservation/1.0.0",registry_digest:s.registry_digest,sha:name,path:row.origin==="legacy"?join(s.root,"tools",name,"runtime.exe"):join(s.base,name,"runtime.exe"),bytes:Number(row.bytes),origin:row.origin as Reservation["origin"]};
  if(!["legacy","retained"].includes(reservation.origin)||!Number.isSafeInteger(reservation.bytes)||reservation.bytes<1||reservation.bytes>fileLimit||row.path!==reservation.path||!isDeepStrictEqual(read(join(claimDir,"reserved.json")),reservation))fail();
  if(row.state==="retained"){
   const expected={format:"cimiloop/runtime-binary-retention/1.0.0",reservation_digest:digest(bytesAt(join(claimDir,"reserved.json"),16384)).value,physical:{dev:row.dev,ino:row.ino,birthtime_ns:row.birthtime_ns},prior_custody_proven:false};
   if(!isDeepStrictEqual(read(join(claimDir,"retained.json")),expected)||![row.dev,row.ino,row.birthtime_ns].every(x=>typeof x==="string"&&/^\d+$/.test(x)))fail();
  }else if(row.state!=="reserved"||row.dev!==null||row.ino!==null||row.birthtime_ns!==null)fail();
  reservedBytes+=reservation.bytes;
 }
 if(reservedBytes>maximumBytes)fail();return {rows,reservedBytes};
}
function snapshot(s:Store,path:string,sha:string,rows=audit(s).rows){
 const row=rows.find(x=>x.sha===sha), expectedPath=row?.origin==="legacy"?join(s.root,"tools",sha,"runtime.exe"):join(s.base,sha,"runtime.exe");
 if(!row||row.state!=="retained"||path!==expectedPath)fail();
 const current=identity(path);
 if(current.dev!==row.dev||current.ino!==row.ino||current.birthtime_ns!==row.birthtime_ns||current.bytes!==row.bytes||contentSha(path)!==sha)fail();
 return {format:"cimiloop/runtime-binary-original-proof/1.0.0",path,sha,bytes:current.bytes,origin:row.origin as "retained"|"legacy",physical:physical(path),registry_digest:s.registry_digest,reservation_digest:digest(bytesAt(join(s.claims,sha,"reserved.json"),16384)).value,retention_digest:digest(bytesAt(join(s.claims,sha,"retained.json"),16384)).value,prior_custody_proven:false as const,physical_quota_enforced:false as const};
}
type RetainedProof=ReturnType<typeof snapshot>;
// Repeats inside one recheck reuse the registry audit. Physical identity is
// checked on every repeat. The recheck reads the registry again before it
// returns, so a changed registration cannot keep the earlier proof.
let recheckProofs:Map<string,{root:string;path:string;sha:string;proof:RetainedProof}>|undefined;
// Read-only revalidation: never initializes, repairs, copies or frees capacity.
// This proof is not an observation memo. Callers compare it with the retained
// JSON proof; a cloned replay is not that proof.
export function readRuntimeBinaryOriginal(root:string,path:string,sha:string){
 const resolved=resolve(path),key=resolve(root)+"\0"+resolved+"\0"+sha;
 if(recheckProofs){const hit=recheckProofs.get(key);if(hit){const id=identity(resolved);if(id.dev!==hit.proof.physical.dev||id.ino!==hit.proof.physical.ino||id.birthtime_ns!==hit.proof.physical.birthtime_ns||id.bytes!==hit.proof.bytes)fail();return structuredClone(hit.proof);}}
 let s:Store|undefined;
 try {if(!/^[a-f0-9]{64}$/.test(sha))fail();s=open(root,false);s.db.exec("BEGIN");const proof=snapshot(s,resolved,sha);s.db.exec("COMMIT");if(recheckProofs)recheckProofs.set(key,{root,path:resolved,sha,proof});return proof;}
 catch(error){if(error instanceof RuntimeAdapterError)throw error;throw new RuntimeAdapterError("runtime_binary_original_unproven");}finally{s?.db.close();}
}
// Host-private registry format1 is new; this does not migrate user DB10.
// Independent write-once claims hold capacity even if SQLite rows disappear.
// Claims and completed physical receipts are created while the write transaction
// is held. Any crash leaves either a retained original or an ambiguous reservation;
// no later caller can resume the copy or turn absence into a fresh registration.
export function retainRuntimeBinary(root:string,binary:string):{path:string;digest:ReturnType<typeof digest>} {
 let s:Store|undefined;
 try {
  root=directory(root);binary=assertOrdinaryPath(binary);const source=identity(binary), hash=digest(bytesAt(binary,fileLimit));
  s=open(root,true);s.db.exec("PRAGMA synchronous=FULL; BEGIN IMMEDIATE");
  const {rows,reservedBytes}=audit(s),existing=rows.find(row=>row.sha===hash.value);
  if(existing){snapshot(s,String(existing.path),hash.value,rows);s.db.exec("COMMIT");return {path:String(existing.path),digest:hash};}
  if(rows.length>=maximumEntries||reservedBytes+source.bytes>maximumBytes)throw new RuntimeAdapterError("runtime_binary_history_capacity_exhausted");
  const legacyDir=join(root,"tools",hash.value),legacy=existsSync(assertOrdinaryPath(legacyDir)),target=legacy?join(legacyDir,"runtime.exe"):join(s.base,hash.value,"runtime.exe");
  if(legacy){if(identity(target).bytes!==source.bytes||digest(bytesAt(target,fileLimit)).value!==hash.value)fail();}
  else if(existsSync(assertOrdinaryPath(join(s.base,hash.value))))fail();
  const reservation:Reservation={format:"cimiloop/runtime-binary-reservation/1.0.0",registry_digest:s.registry_digest,sha:hash.value,path:target,bytes:source.bytes,origin:legacy?"legacy":"retained"},claimDir=join(s.claims,hash.value);
  mkdirSync(assertOrdinaryPath(claimDir));save(join(claimDir,"reserved.json"),reservation);
  s.db.prepare("INSERT INTO originals(sha,path,bytes,origin,state) VALUES(?,?,?,?,'reserved')").run(hash.value,target,source.bytes,reservation.origin);
  if(!legacy){mkdirSync(assertOrdinaryPath(join(s.base,hash.value)));copyFileSync(binary,target,constants.COPYFILE_EXCL);syncFile(target);}
  const current=identity(target);if(current.bytes!==source.bytes||digest(bytesAt(target,fileLimit)).value!==hash.value||!isDeepStrictEqual(identity(binary),source)||digest(bytesAt(binary,fileLimit)).value!==hash.value)fail();
  save(join(claimDir,"retained.json"),{format:"cimiloop/runtime-binary-retention/1.0.0",reservation_digest:digest(bytesAt(join(claimDir,"reserved.json"),16384)).value,physical:physical(target),prior_custody_proven:false});
  if(s.db.prepare("UPDATE originals SET state='retained',dev=?,ino=?,birthtime_ns=? WHERE sha=? AND state='reserved'").run(current.dev,current.ino,current.birthtime_ns,hash.value).changes!==1)fail();
  snapshot(s,target,hash.value,[{sha:hash.value,path:target,bytes:source.bytes,origin:reservation.origin,state:"retained",dev:current.dev,ino:current.ino,birthtime_ns:current.birthtime_ns}]);s.db.exec("COMMIT");return {path:target,digest:hash};
 }catch(error){if(error instanceof RuntimeAdapterError)throw error;throw new RuntimeAdapterError("runtime_binary_original_unproven");}finally{s?.db.close();}
}
