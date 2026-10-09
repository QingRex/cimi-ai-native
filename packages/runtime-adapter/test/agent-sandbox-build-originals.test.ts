import {mkdtempSync,rmSync,existsSync,readFileSync,writeFileSync,readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname,basename,resolve,sep} from "node:path";
import {describe,it,expect,afterEach,vi} from "vitest";
import {buildWindowsAgentWorkspaceSandbox} from "../src/native.js";
import {readRuntimeBinaryOriginal} from "../src/runtime-binary-originals.js";
import {retainAgentSandboxBuild} from "../src/agent-sandbox-build-originals.js";
import {DatabaseSync} from "node:sqlite";
vi.setConfig({testTimeout:60000});
// Actual Windows csc and retained host files; no model/account/Skill qualification.
describe.runIf(process.platform==="win32"&&process.arch==="x64")("original sandbox controller build",()=>{
 const roots:string[]=[];
 afterEach(()=>{for(const root of roots.splice(0)){if(dirname(root)!==tmpdir()||!basename(root).startsWith("cimiloop-sandbox-build-originals-"))throw Error("Unsafe fixture cleanup");rmSync(root,{recursive:true,force:true});}});
 const setup=()=>{const root=mkdtempSync(join(tmpdir(),"cimiloop-sandbox-build-originals-"));roots.push(root);return root;};
 const remove=(root:string,path:string)=>{if(!resolve(path).startsWith(resolve(root)+sep))throw Error("Unsafe fixture target");rmSync(path,{recursive:true,force:true});};
 it("keeps the same physical original after disposable tools cache is lost",async()=>{
  const root=setup(),first=await buildWindowsAgentWorkspaceSandbox(root);
  expect(first.path).toBe(join(root,"runtime-binary-originals",first.digest.value,"runtime.exe"));
  const proof=readRuntimeBinaryOriginal(root,first.path,first.digest.value),bytes=readFileSync(first.path);
  remove(root,join(root,"tools"));expect(await buildWindowsAgentWorkspaceSandbox(root)).toEqual(first);
  expect(readRuntimeBinaryOriginal(root,first.path,first.digest.value)).toEqual(proof);expect(readFileSync(first.path)).toEqual(bytes);
 });
 it("refuses to recompile a missing retained controller from intact sources",async()=>{
  const root=setup(),first=await buildWindowsAgentWorkspaceSandbox(root);remove(root,first.path);
  await expect(buildWindowsAgentWorkspaceSandbox(root)).rejects.toThrow();expect(existsSync(first.path)).toBe(false);
 });
 it("never retries an interrupted compiler and retains its reservation",async()=>{
  const root=setup(),recipe={constructed:"interrupted compile contract"};let attempts=0;
  const compile=async()=>{attempts++;throw Error("constructed interruption");};
  await expect(retainAgentSandboxBuild(root,recipe,compile)).rejects.toThrow();
  await expect(retainAgentSandboxBuild(root,recipe,compile)).rejects.toThrow();expect(attempts).toBe(1);
  expect(readdirSync(join(root,"agent-sandbox-build-claims"))).toHaveLength(1);
 });
 it("holds the original reservation while a competing caller cannot compile the same recipe",async()=>{
  const root=setup(),recipe={constructed:"competing compile contract"};let release!:(path:string)=>void,attempts=0;
  const source=join(root,"constructed-controller.exe");writeFileSync(source,"constructed controller bytes");
  const first=retainAgentSandboxBuild(root,recipe,async()=>{attempts++;return new Promise<string>(resolve=>{release=resolve;});});
  await expect(retainAgentSandboxBuild(root,recipe,async()=>{attempts++;return source;})).rejects.toThrow();expect(attempts).toBe(1);
  release(source);const original=await first;
  expect(await retainAgentSandboxBuild(root,recipe,async()=>{attempts++;return source;})).toEqual(original);expect(attempts).toBe(1);
 });
 it("holds all 128 recipe slots before a 129th compiler could start",async()=>{
  const root=setup(),source=join(root,"constructed-controller.exe");writeFileSync(source,"one constructed controller for logical history contract");let attempts=0;
  const compile=async()=>{attempts++;return source;};
  for(let i=0;i<128;i++)await retainAgentSandboxBuild(root,{constructed_recipe:i},compile);
  await expect(retainAgentSandboxBuild(root,{constructed_recipe:128},compile)).rejects.toThrow("agent_sandbox_build_history_capacity_exhausted");
  expect(attempts).toBe(128);expect(readdirSync(join(root,"agent-sandbox-build-claims"))).toHaveLength(128);
 },180000);
 it.each(["receipt","row","registry","claim","directory"])("rejects lost %s without recompiling or freeing the recipe slot",async kind=>{
  const root=setup(),first=await buildWindowsAgentWorkspaceSandbox(root),key=readdirSync(join(root,"agent-sandbox-build-claims"))[0]!;
  if(kind==="receipt")remove(root,join(root,"agent-sandbox-build-originals",key,"retained.json"));
  if(kind==="registry")remove(root,join(root,"agent-sandbox-build-registry.json"));
  if(kind==="claim")remove(root,join(root,"agent-sandbox-build-claims",key));
  if(kind==="directory")remove(root,join(root,"agent-sandbox-build-originals"));
  if(kind==="row") {const db=new DatabaseSync(join(root,"agent-sandbox-build-originals/index.sqlite"));try {const trigger=String(db.prepare("SELECT sql FROM sqlite_schema WHERE name='builds_no_delete'").get()!.sql);db.exec("DROP TRIGGER builds_no_delete");db.prepare("DELETE FROM builds WHERE recipe=?").run(key);db.exec(trigger);}finally{db.close();}}
  await expect(buildWindowsAgentWorkspaceSandbox(root)).rejects.toThrow();expect(readFileSync(first.path).length).toBeGreaterThan(0);
 });
 it("rejects a same-byte replacement of a retained controller",async()=>{
  const root=setup(),first=await buildWindowsAgentWorkspaceSandbox(root),bytes=readFileSync(first.path);remove(root,first.path);writeFileSync(first.path,bytes);
  await expect(buildWindowsAgentWorkspaceSandbox(root)).rejects.toThrow();
 });
});
