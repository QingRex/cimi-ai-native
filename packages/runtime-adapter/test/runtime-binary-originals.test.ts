import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, linkSync, copyFileSync, existsSync, renameSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, basename, join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinBinary } from "../src/native.js";
import { digest } from "../src/files.js";
import { readRuntimeBinaryOriginal, withRuntimeBinaryProofTurn, digestRuntimeBinaryFile, proveRetainedBinaryProof, snapshotRuntimeBinaryProofIdentities, withRetainedBinaryRecheck } from "../src/runtime-binary-originals.js";
import { DatabaseSync } from "node:sqlite";
// Actual host files/SQLite only, never Native/model/account/Skill qualification.
describe("retained original runtime binaries", () => {
 const roots:string[]=[];
 afterEach(()=>{for(const root of roots.splice(0)){if(dirname(root)!==tmpdir()||!basename(root).startsWith("cimiloop-binary-originals-"))throw Error("Unsafe fixture cleanup");rmSync(root,{recursive:true,force:true});}});
 const setup=()=>{const root=mkdtempSync(join(tmpdir(),"cimiloop-binary-originals-"));roots.push(root);const binary=join(root,"installed.exe");writeFileSync(binary,"constructed executable bytes");return {root,binary};};
 const removeOwn=(root:string,path:string)=>{if(!resolve(path).startsWith(resolve(root)+sep))throw Error("Unsafe fixture target");rmSync(path,{recursive:true,force:true});};
 it("retains a new executable outside build cache, and returns the same original on duplicate pin",()=>{
  const f=setup(), first=pinBinary(f.root,f.binary);expect(first.path).toBe(join(f.root,"runtime-binary-originals",first.digest.value,"runtime.exe"));
  mkdirSync(join(f.root,"tools"),{recursive:true});writeFileSync(join(f.root,"tools/cache.txt"),"constructed disposable build cache");removeOwn(f.root,join(f.root,"tools"));
  expect(readFileSync(first.path,"utf8")).toBe("constructed executable bytes");expect(pinBinary(f.root,f.binary)).toEqual(first);
 });
 it("refuses to recreate a missing original even when the installed source still matches",()=>{
  const f=setup(), first=pinBinary(f.root,f.binary);removeOwn(f.root,first.path);
  expect(()=>pinBinary(f.root,f.binary)).toThrow();expect(existsSync(first.path)).toBe(false);
 });
 it("rejects a same-byte replacement with a different physical file identity",()=>{
  const f=setup(), first=pinBinary(f.root,f.binary), bytes=readFileSync(first.path);removeOwn(f.root,first.path);writeFileSync(first.path,bytes);
  expect(()=>pinBinary(f.root,f.binary)).toThrow();
 });
 it("accepts one unchanged original read inside a proof turn",()=>{
  const f=setup(), pinned=pinBinary(f.root,f.binary);
  const proof=withRuntimeBinaryProofTurn(()=>readRuntimeBinaryOriginal(f.root,pinned.path,pinned.digest.value));
  const now=lstatSync(pinned.path,{bigint:true});
  expect(proof.sha).toBe(pinned.digest.value);expect(proof.physical.ino).toBe(String(now.ino));expect(proof.physical.birthtime_ns).toBe(String(now.birthtimeNs));
 });
 it("rejects a same-byte physical replacement before a proof turn returns the old proof",()=>{
  const f=setup(), pinned=pinBinary(f.root,f.binary), retained=join(f.root,"PUBLIC-original-retained.exe");
  const before=readRuntimeBinaryOriginal(f.root,pinned.path,pinned.digest.value);
  expect(()=>withRuntimeBinaryProofTurn(()=>{
   const proof=readRuntimeBinaryOriginal(f.root,pinned.path,pinned.digest.value);
   renameSync(pinned.path,retained);copyFileSync(retained,pinned.path);return proof;
  })).toThrow(/runtime_binary_original_unproven/);
  const now=lstatSync(pinned.path,{bigint:true});
  expect(before.physical.ino).not.toBe(String(now.ino));
  expect(()=>readRuntimeBinaryOriginal(f.root,pinned.path,pinned.digest.value)).toThrow(/runtime_binary_original_unproven/);
  renameSync(pinned.path,join(f.root,"PUBLIC-replacement-retained.exe"));renameSync(retained,pinned.path);
 });
 it("rechecks a sealed proof by physical identity and rejects a same-byte replacement",()=>{
  const f=setup(),pinned=pinBinary(f.root,f.binary);
  const identities=withRuntimeBinaryProofTurn(()=>{digestRuntimeBinaryFile(pinned.path);return snapshotRuntimeBinaryProofIdentities();});
  expect(identities.some(hit=>hit.path===resolve(pinned.path))).toBe(true);
  proveRetainedBinaryProof(identities);
  const retained=join(f.root,"PUBLIC-sealed-retained.exe");
  renameSync(pinned.path,retained);copyFileSync(retained,pinned.path);
  expect(()=>proveRetainedBinaryProof(identities)).toThrow(/runtime_binary_original_unproven/);
  renameSync(pinned.path,join(f.root,"PUBLIC-sealed-replacement.exe"));renameSync(retained,pinned.path);
 });
 it("rechecks a large sealed file without treating a forged write generation as the bytes",()=>{
  const f=setup(),big=join(f.root,"large.exe");writeFileSync(big,Buffer.alloc(1024*1024,7));
  const identities=withRuntimeBinaryProofTurn(()=>{digestRuntimeBinaryFile(big);return snapshotRuntimeBinaryProofIdentities();});
  const hit=identities.find(item=>item.path===resolve(big));expect(hit).toBeTruthy();
  const forged=identities.map(item=>item.path===hit!.path?{...item,bytes_usn:"1"}:item);
  expect(proveRetainedBinaryProof(forged)).toBeUndefined();
  const body=readFileSync(big);body.writeUInt8(body.readUInt8(0)^0xff,0);writeFileSync(big,body);
  expect(()=>proveRetainedBinaryProof(identities)).toThrow(/runtime_binary_original_unproven/);
  if(process.platform==="win32"&&hit!.bytes_usn!==undefined)expect(hit!.bytes_usn).toMatch(/^\d+$/);
 });
 it("reuses one runtime registry audit inside a recheck and still rejects changed bytes",()=>{
  const f=setup(),pinned=pinBinary(f.root,f.binary);
  const identities=withRuntimeBinaryProofTurn(()=>{readRuntimeBinaryOriginal(f.root,pinned.path,pinned.digest.value);return snapshotRuntimeBinaryProofIdentities();});
  const sha=withRetainedBinaryRecheck(identities,()=>{const one=readRuntimeBinaryOriginal(f.root,pinned.path,pinned.digest.value),two=readRuntimeBinaryOriginal(f.root,pinned.path,pinned.digest.value);expect(two).toEqual(one);return one.sha;});
  expect(sha).toBe(pinned.digest.value);
  const body=readFileSync(pinned.path);body.writeUInt8(body.readUInt8(0)^0xff,0);writeFileSync(pinned.path,body);
  expect(()=>withRetainedBinaryRecheck(identities,()=>readRuntimeBinaryOriginal(f.root,pinned.path,pinned.digest.value))).toThrow(/runtime_binary_original_unproven/);
 });
 it("reuses a sealed digest only inside one recheck and still rejects changed bytes",()=>{
  const f=setup(),pinned=pinBinary(f.root,f.binary);
  const identities=withRuntimeBinaryProofTurn(()=>{digestRuntimeBinaryFile(pinned.path);return snapshotRuntimeBinaryProofIdentities();});
  expect(withRetainedBinaryRecheck(identities,()=>digestRuntimeBinaryFile(pinned.path))).toBe(pinned.digest.value);
  const body=readFileSync(pinned.path);body[0]=body[0]===0x41?0x42:0x41;writeFileSync(pinned.path,body);
  expect(()=>withRetainedBinaryRecheck(identities,()=>{expect(digestRuntimeBinaryFile(pinned.path)).toBe(pinned.digest.value);})).toThrow(/runtime_binary_original_unproven/);
 });
 it("adopts available legacy bytes at their original path, without inventing prior custody",()=>{
  const f=setup(), hash=digest(readFileSync(f.binary)).value, path=join(f.root,"tools",hash,"runtime.exe");mkdirSync(dirname(path),{recursive:true});copyFileSync(f.binary,path);
  expect(pinBinary(f.root,f.binary)).toEqual({path,digest:digest(readFileSync(f.binary))});removeOwn(f.root,path);
  expect(()=>pinBinary(f.root,f.binary)).toThrow();expect(existsSync(path)).toBe(false);
 });
 it("rejects a legacy hardlink instead of granting Native access to an installed source file",()=>{
  const f=setup(), hash=digest(readFileSync(f.binary)).value, path=join(f.root,"tools",hash,"runtime.exe");mkdirSync(dirname(path),{recursive:true});linkSync(f.binary,path);
  expect(()=>pinBinary(f.root,f.binary)).toThrow();expect(readFileSync(f.binary,"utf8")).toBe("constructed executable bytes");
 });
 it("refuses a missing original registry, including with intact binary bytes",()=>{
  const f=setup(), first=pinBinary(f.root,f.binary);removeOwn(f.root,join(f.root,"runtime-binary-originals/index.sqlite"));
  expect(()=>pinBinary(f.root,f.binary)).toThrow();expect(existsSync(first.path)).toBe(true);
 });
 it("refuses to rebuild a lost complete original directory under the old registration",()=>{
  const f=setup(), first=pinBinary(f.root,f.binary);removeOwn(f.root,join(f.root,"runtime-binary-originals"));
  expect(()=>pinBinary(f.root,f.binary)).toThrow();expect(existsSync(first.path)).toBe(false);
 });
 it("holds bounded history before the next executable is copied; no old original is deleted",()=>{
  const f=setup(), paths:string[]=[];
  for(let i=0;i<128;i++){writeFileSync(f.binary,"constructed version "+i);paths.push(pinBinary(f.root,f.binary).path);}
  writeFileSync(f.binary,"constructed version 129");const denied=digest(readFileSync(f.binary)).value;
  expect(()=>pinBinary(f.root,f.binary)).toThrow();expect(existsSync(join(f.root,"runtime-binary-originals",denied,"runtime.exe"))).toBe(false);expect(paths.every(path=>existsSync(path))).toBe(true);
 },180000);
 it("detects removed SQLite registration even after the original triggers are restored",()=>{
  const f=setup(), first=pinBinary(f.root,f.binary), db=new DatabaseSync(join(f.root,"runtime-binary-originals/index.sqlite"));
  const sql=String(db.prepare("SELECT sql FROM sqlite_schema WHERE name='originals_no_delete'").get()!.sql);
  db.exec("DROP TRIGGER originals_no_delete");db.prepare("DELETE FROM originals WHERE sha=?").run(first.digest.value);db.exec(sql);db.close();
  removeOwn(f.root,dirname(first.path));
  expect(()=>pinBinary(f.root,f.binary)).toThrow();expect(existsSync(first.path)).toBe(false);
 });
 it("does not release capacity when a different retained row is changed in the same SQLite file",()=>{
  const f=setup(),first=pinBinary(f.root,f.binary),db=new DatabaseSync(join(f.root,"runtime-binary-originals/index.sqlite"));
  const sql=String(db.prepare("SELECT sql FROM sqlite_schema WHERE name='originals_once'").get()!.sql);
  db.exec("DROP TRIGGER originals_once");db.prepare("UPDATE originals SET bytes=1 WHERE sha=?").run(first.digest.value);db.exec(sql);db.close();
  writeFileSync(f.binary,"constructed new executable");const hash=digest(readFileSync(f.binary)).value;
  expect(()=>pinBinary(f.root,f.binary)).toThrow();expect(existsSync(join(f.root,"runtime-binary-originals",hash))).toBe(false);expect(existsSync(first.path)).toBe(true);
 });
});
