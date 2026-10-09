import {DatabaseSync} from "node:sqlite";
import {existsSync,mkdirSync,lstatSync,readdirSync,writeFileSync,openSync,fsyncSync,closeSync} from "node:fs";
import {join} from "node:path";
import {isDeepStrictEqual} from "node:util";
import {assertOrdinaryPath,directory,bytesAt,digest,RuntimeAdapterError} from "./files.js";
import {retainRuntimeBinary,readRuntimeBinaryOriginal} from "./runtime-binary-originals.js";
const maximum=128,app=0x43495342;
function fail():never{throw new RuntimeAdapterError("agent_sandbox_build_original_unproven");}
const physical=(path:string,dir=false)=>{const s=lstatSync(assertOrdinaryPath(path),{bigint:true});if(dir?!s.isDirectory():!s.isFile()||s.nlink!==1n)fail();return {dev:String(s.dev),ino:String(s.ino),birthtime_ns:String(s.birthtimeNs)};};
const save=(path:string,value:unknown)=>{writeFileSync(assertOrdinaryPath(path),JSON.stringify(value),{flag:"wx"});const fd=openSync(path,"r+");try{fsyncSync(fd);}finally{closeSync(fd);}};
const read=(path:string):unknown=>JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytesAt(path,65536)));
const schema=[
 ["table","builds","CREATE TABLE builds (recipe TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('reserved','retained')), proof TEXT) STRICT"],
 ["trigger","builds_no_delete","CREATE TRIGGER builds_no_delete BEFORE DELETE ON builds BEGIN SELECT RAISE(ABORT,'original_immutable'); END"],
 ["trigger","builds_once","CREATE TRIGGER builds_once BEFORE UPDATE ON builds WHEN OLD.state!='reserved' OR NEW.state!='retained' OR NEW.recipe IS NOT OLD.recipe OR NEW.proof IS NULL BEGIN SELECT RAISE(ABORT,'original_immutable'); END"]
].sort((a,b)=>a[1]!.localeCompare(b[1]!));
function open(root:string){
 root=directory(root);const base=join(root,"agent-sandbox-build-originals"),claims=join(root,"agent-sandbox-build-claims"),dbPath=join(base,"index.sqlite"),marker=join(root,"agent-sandbox-build-registry.json");
 const registered=existsSync(assertOrdinaryPath(marker));
 if(!registered){if(existsSync(assertOrdinaryPath(base))||existsSync(assertOrdinaryPath(claims)))fail();mkdirSync(base);mkdirSync(claims);}
 else if(!existsSync(assertOrdinaryPath(dbPath))||!existsSync(assertOrdinaryPath(claims)))fail();
 for(const p of [dbPath,dbPath+"-journal",dbPath+"-wal",dbPath+"-shm"])assertOrdinaryPath(p);
 const db=new DatabaseSync(dbPath,{timeout:5000});
 try{
  if(!registered){db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;"+schema.map(x=>x[2]+";").join("")+`PRAGMA application_id=${app}; PRAGMA user_version=1;`);
   save(marker,{format:"cimiloop/agent-sandbox-build-registry/1.0.0",root,base:physical(base,true),claims:physical(claims,true),database:physical(dbPath),maximum_recipes:maximum,physical_quota_enforced:false});}
  const expected={format:"cimiloop/agent-sandbox-build-registry/1.0.0",root,base:physical(base,true),claims:physical(claims,true),database:physical(dbPath),maximum_recipes:maximum,physical_quota_enforced:false};
  if(!isDeepStrictEqual(read(marker),expected)||db.prepare("PRAGMA application_id").get()!.application_id!==app||db.prepare("PRAGMA user_version").get()!.user_version!==1||db.prepare("PRAGMA quick_check").get()!.quick_check!=="ok")fail();
  return {root,base,claims,db,registry_digest:digest(bytesAt(marker,65536)).value};
 }catch(e){db.close();throw e;}
}
type Store=ReturnType<typeof open>;
function audit(s:Store){
 if(!isDeepStrictEqual(s.db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY name").all().map(x=>[x.type,x.name,x.sql]),schema))fail();
 const rows=s.db.prepare("SELECT * FROM builds ORDER BY recipe").all(),names=readdirSync(assertOrdinaryPath(s.claims)).sort(),directories=readdirSync(s.base).filter(x=>!x.startsWith("index.sqlite")).sort();
 if(rows.length>maximum||!isDeepStrictEqual(names,rows.map(x=>String(x.recipe)))||!isDeepStrictEqual(names,directories))fail();
 for(const row of rows){
  const key=String(row.recipe);if(!/^[a-f0-9]{64}$/.test(key))fail();physical(join(s.base,key),true);
  const reservation=read(join(s.claims,key)) as Record<string,unknown>;
  if(!reservation||!isDeepStrictEqual(Object.keys(reservation).sort(),["format","recipe","registry_digest"].sort())||reservation.format!=="cimiloop/agent-sandbox-build-reservation/1.0.0"||reservation.registry_digest!==s.registry_digest||digest(JSON.stringify(reservation.recipe)).value!==key)fail();
  const receipt=join(s.base,key,"retained.json");
  if(row.state==="reserved"){if(row.proof!==null||existsSync(assertOrdinaryPath(receipt)))fail();}
  else if(row.state!=="retained"||typeof row.proof!=="string"||!isDeepStrictEqual(read(receipt),JSON.parse(row.proof)))fail();
 }
 return rows;
}
// A reservation is durable before csc starts. An interrupted build remains
// Unknown and holds its recipe slot; no caller recompiles or resumes it.
// Host-private format1, separate from user DB10 and the public qualification.
export async function retainAgentSandboxBuild(root:string,recipe:unknown,compile:(build:string)=>Promise<string>){
 let s:Store|undefined;
 try{
  const frozen=JSON.parse(JSON.stringify(recipe)),key=digest(JSON.stringify(frozen)).value;s=open(root);s.db.exec("PRAGMA synchronous=FULL; BEGIN IMMEDIATE");const rows=audit(s),existing=rows.find(x=>x.recipe===key);
  if(existing){if(existing.state!=="retained"||typeof existing.proof!=="string")fail();const proof=JSON.parse(existing.proof) as ReturnType<typeof readRuntimeBinaryOriginal>;
   if(!isDeepStrictEqual(readRuntimeBinaryOriginal(s.root,proof.path,proof.sha),proof))fail();s.db.exec("COMMIT");return {path:proof.path,digest:digest(bytesAt(proof.path)),original:proof};}
  if(rows.length>=maximum)throw new RuntimeAdapterError("agent_sandbox_build_history_capacity_exhausted");
  const build=join(s.base,key);mkdirSync(assertOrdinaryPath(build));save(join(s.claims,key),{format:"cimiloop/agent-sandbox-build-reservation/1.0.0",registry_digest:s.registry_digest,recipe:frozen});
  s.db.prepare("INSERT INTO builds(recipe,state,proof) VALUES(?,'reserved',NULL)").run(key);s.db.exec("COMMIT");
  const output=await compile(build),pinned=retainRuntimeBinary(s.root,output),proof=readRuntimeBinaryOriginal(s.root,pinned.path,pinned.digest.value);
  s.db.exec("BEGIN IMMEDIATE");audit(s);save(join(build,"retained.json"),proof);
  if(s.db.prepare("UPDATE builds SET state='retained',proof=? WHERE recipe=? AND state='reserved'").run(JSON.stringify(proof),key).changes!==1)fail();
  s.db.exec("COMMIT");return {...pinned,original:proof};
 }catch(e){if(e instanceof RuntimeAdapterError)throw e;throw new RuntimeAdapterError("agent_sandbox_build_original_unproven");}finally{s?.db.close();}
}
