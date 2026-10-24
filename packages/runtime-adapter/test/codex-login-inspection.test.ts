import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as runtime from "../src/index.js";

// Actual stdio child, PUBLIC account fixtures. No Codex login/model evidence.
describe("read-only Codex login inspection", () => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-codex-login-")), script = join(root, "server.mjs"), methods = join(root, "methods.jsonl");
  writeFileSync(script, `import{createInterface}from'node:readline';import{appendFileSync}from'node:fs';const mode=process.argv[2],log=process.argv[3];createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);appendFileSync(log,JSON.stringify({method:r.method,home:process.env.CODEX_HOME,args:process.argv.slice(4)})+'\\n');if(r.id===undefined)return;if(r.method==='initialize')process.stdout.write(JSON.stringify({id:r.id,result:{userAgent:'PUBLIC'}})+'\\n');else if(r.method==='account/read')process.stdout.write(JSON.stringify({id:r.id,result:{account:{type:mode==='api-key'?'apiKey':'chatgpt',email:'PUBLIC@example.test',planType:'fixture'},requiresOpenaiAuth:true}})+'\\n');else throw Error('PUBLIC unexpected method');});`);
  const command = (mode: string) => ({ file: process.execPath, args: [script, mode, methods], sha256: createHash("sha256").update(readFileSync(process.execPath)).digest("hex") });
  it("reads only non-secret account metadata and never starts a model turn", async () => {
    const inspect = Reflect.get(runtime, "inspectCodexMethodLogin"); expect(inspect).toBeTypeOf("function");
    const result = await inspect({ root, command: command("normal") }, () => {});
    expect(result.account_digest).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(result)).not.toContain("example.test");
    expect(readFileSync(methods, "utf8").trimEnd().split("\n").map(line => JSON.parse(line).method)).toEqual(["initialize", "initialized", "account/read"]);
  });
  it('uses the pinned external home for metadata-only inspection and preserves the parent login',async()=>{
    const own=mkdtempSync(join(tmpdir(),'cimiloop-login-home-inspection-')),home=join(own,'home');mkdirSync(home);const descriptor=runtime.captureCodexLoginHome(home),parent=process.env.CODEX_HOME;
    await runtime.inspectCodexMethodLogin({root:join(own,'inspection'),command:command('normal'),login_home:descriptor},()=>{});const messages=readFileSync(methods,'utf8').trimEnd().split('\n').map(line=>JSON.parse(line)).filter(value=>value.home===home);
    expect(messages.map(value=>value.method)).toEqual(['initialize','initialized','account/read']);expect(messages[0].args).toContain('cli_auth_credentials_store="file"');expect(process.env.CODEX_HOME).toBe(parent);
  });
  it("refuses an API-key account without extracting credentials", async () => {
    const inspect = Reflect.get(runtime, "inspectCodexMethodLogin"); expect(inspect).toBeTypeOf("function");
    await expect(inspect({ root, command: command("api-key") }, () => {})).rejects.toThrow();
  });
  it("rejects changed executables before launching a process", async () => {
    const inspect = Reflect.get(runtime, "inspectCodexMethodLogin"); expect(inspect).toBeTypeOf("function");
    await expect(inspect({ root, command: { ...command("normal"), sha256: "0".repeat(64) } }, () => {})).rejects.toThrow();
  });
  it("requires the current synchronous Human guard before reading login metadata", async () => {
    const inspect = Reflect.get(runtime, "inspectCodexMethodLogin"); expect(inspect).toBeTypeOf("function");
    await expect(inspect({ root, command: command("normal") }, () => { throw Error("PUBLIC Human revoked"); })).rejects.toThrow("PUBLIC Human revoked");
  });
  it("rejects malformed bytes received after an otherwise valid account response", async () => {
    const faulty = join(root, "bad-frame.mjs");
    writeFileSync(faulty, readFileSync(script, "utf8").replace("requiresOpenaiAuth:true}})+'\\n'", "requiresOpenaiAuth:true}})+'\\n{bad\\n'"));
    const inspect = Reflect.get(runtime, "inspectCodexMethodLogin"); expect(inspect).toBeTypeOf("function");
    await expect(inspect({ root, command: { ...command("bad-frame"), args: [faulty, "bad-frame", methods] } }, () => {})).rejects.toThrow();
  });
  it("bounds inspection when the actual stdio child never completes the account read", async () => {
    const stalled = join(root, "stalled-account.mjs");
    writeFileSync(stalled, "import{createInterface}from'node:readline';createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.method==='initialize')process.stdout.write(JSON.stringify({id:r.id,result:{userAgent:'PUBLIC'}})+'\\n');});");
    const inspect = Reflect.get(runtime, "inspectCodexMethodLogin"), started = Date.now(); expect(inspect).toBeTypeOf("function");
    await expect(inspect({ root, command: { ...command("normal"), args: [stalled] } }, () => {})).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(20000);
  }, 25000);
});
