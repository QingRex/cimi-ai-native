import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";import {join,dirname,basename} from "node:path";import {spawn} from "node:child_process";import {randomUUID} from "node:crypto";import {once} from "node:events";
import {describe,it,expect,vi} from "vitest";
import {buildWindowsLauncher,buildWindowsAgentWorkspaceSandbox,nativeControl} from "../src/native.js";
import {retainRuntimeBinary} from "../src/runtime-binary-originals.js";
import {digest} from "../src/files.js";import {verifyAgentRuntimeInterruption} from "../src/agent-runtime-interruption.js";
vi.setConfig({testTimeout:120000});
// Actual retained controller, Windows OS identities and suspended process.
// No SDK resume, account/model request or Skill qualification in these cases.
// Retain this batch's fixtures, including passing original bytes and cleanup.
describe.runIf(process.platform==="win32"&&process.arch==="x64")("Native input frame boundaries",()=>{
 it.each(["registered_eof","runtime_created_eof","registered_truncated","registered_utf8","registered_frame"])("preserves original %s and independently checks disposal",async kind=>{
  const root=mkdtempSync(join(tmpdir(),"cimiloop-native-input-close-"));if(dirname(root)!==tmpdir()||!basename(root).startsWith("cimiloop-native-input-close-"))throw Error("Fixture scope");
  const observer=await buildWindowsLauncher(root),controller=await buildWindowsAgentWorkspaceSandbox(root),binary=await retainRuntimeBinary(root,process.execPath),nonce=randomUUID(),scope_digest=digest("Native-only input fixture "+nonce).value;
  const operation=join(root,"workspace-tool-rehearsals",randomUUID()),sandbox=join(operation,"sandbox");for(const name of ["workspace","state","config"])mkdirSync(join(sandbox,name),{recursive:true});
  const owner=(await nativeControl(observer,["--identity",String(process.pid)])).value;
  const config={format:"cimiloop/agent-workspace-sandbox-config/2.0.0",nonce,root:sandbox,binary:binary.path,owner,pipe_nonce:randomUUID(),scope_digest,elapsed_ms:60000,provider_options:{check_id:"fixture",check_only:true},deadline_uptime_ms:null};
  writeFileSync(join(operation,"original-config.json"),JSON.stringify(config),{flag:"wx"});
  const child=spawn(controller.path,[],{stdio:["pipe","pipe","pipe"],windowsHide:true});let stdout="",stderr="",pending="",closed=false;const exit=once(child,"close"),target=kind.startsWith("runtime_created")?"runtime_created":"registered";
  child.stdout.on("data",chunk=>{const part=chunk.toString("utf8");stdout+=part;pending+=part;let end:number;while((end=pending.indexOf("\n"))>=0){const line=pending.slice(0,end).trim();pending=pending.slice(end+1);if(!line)continue;const value=JSON.parse(line);if(value.format!=="cimiloop/agent-workspace-preparation/1.0.0")continue;
   if(!existsSync(join(operation,"original-launcher.json")))writeFileSync(join(operation,"original-launcher.json"),JSON.stringify({format:"cimiloop/agent-workspace-launcher/1.0.0",nonce,owner,supervisor:value.supervisor,launcher_path:controller.path,launcher_digest:controller.digest.value}),{flag:"wx"});
   if(value.phase!==target){child.stdin.write(JSON.stringify({format:"cimiloop/agent-workspace-prepare-continue/1.0.0",nonce,phase:value.phase})+"\n");continue;}
   closed=true;if(kind.endsWith("truncated"))child.stdin.end(Buffer.from("{"));else if(kind.endsWith("utf8"))child.stdin.end(Buffer.from([0xff,10]));else if(kind.endsWith("frame"))child.stdin.end("{}\n");else child.stdin.end();
  }});child.stderr.on("data",chunk=>{stderr+=chunk.toString("utf8");});child.stdin.on("error",()=>{});
  child.stdin.write(JSON.stringify(config)+"\n");const timer=setTimeout(()=>child.stdin.end(),90000);let result:unknown[];try{result=await exit;}finally{clearTimeout(timer);writeFileSync(join(operation,"stdout.raw"),stdout);writeFileSync(join(operation,"stderr.raw"),stderr);}
  expect(closed).toBe(true);const good=kind.endsWith("eof"),cleanup=JSON.parse(readFileSync(join(operation,"agent-sandbox-cleanup.json"),"utf8")),resources=JSON.parse(readFileSync(join(operation,"agent-sandbox-resources.json"),"utf8"));
  expect(result![0]).toBe(good?125:12);expect(cleanup).toMatchObject({nonce,resources_disposed:true,cleanup_errors:[],reason:good?"agent_sandbox_parent_ended":"agent_sandbox_unavailable"});
  expect((await nativeControl(observer,["--inspect-identity",JSON.stringify(resources.supervisor)])).value).toEqual({state:"absent"});
  if(resources.runtime!==null)expect((await nativeControl(observer,["--inspect-identity",JSON.stringify(resources.runtime)])).value).toEqual({state:"absent"});
  const interruption=verifyAgentRuntimeInterruption({scope_digest,owner},name=>existsSync(join(operation,name))?readFileSync(join(operation,name)):undefined);
  if(good){expect(stderr).toBe("");expect(interruption).toMatchObject({status:"Observed",phase:target,runtime_resumed:false,completion_proven:false,costs_reconciled:false});if(target==="runtime_created")expect(resources.runtime).not.toBeNull();}
  else {expect(interruption).toBeUndefined();expect(stderr).toContain('"exception_type":"');expect(existsSync(join(operation,"agent-sandbox-interruption.json"))).toBe(false);}
 });
});
