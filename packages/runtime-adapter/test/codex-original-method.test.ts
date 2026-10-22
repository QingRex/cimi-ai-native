import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as runtime from "../src/index.js";

// An actual stdio child with public protocol fixtures. These cases establish
// transport/replay safety, not Codex/model/Skill qualification or S1 acceptance.
describe("original Codex method transport", () => {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-codex-method-"));
  const script = join(root, "public-server.mjs"), effects = join(root, "effects.txt");
  writeFileSync(script, `import {createInterface} from 'node:readline';import{appendFileSync}from'node:fs';
const mode=process.argv[2],effects=process.argv[3];let tid='public-thread',turn='public-turn',accountReads=0;
const send=v=>process.stdout.write(JSON.stringify(v)+'\\n');
createInterface({input:process.stdin}).on('line',l=>{const r=JSON.parse(l);if(!r.method){if(r.id===901){send({method:'item/completed',params:{threadId:tid,turnId:turn,item:{type:'dynamicToolCall',id:'public-call',namespace:null,tool:'invoke_skill',arguments:{name:'grill-me'},status:'completed',contentItems:r.result.contentItems,success:r.result.success}}});finish();}return;}
const reply=x=>send({id:r.id,result:x});if(r.method==='initialize')reply({userAgent:'PUBLIC fixture'});
if(r.method==='account/read'){accountReads++;reply({account:{type:mode==='api-key'?'apiKey':'chatgpt',email:mode==='account-wrong-start'||mode==='account-changed'&&accountReads>1?'other@example.test':'public@example.test',planType:'public'},requiresOpenaiAuth:true});}
if(r.method==='thread/start'){if(mode.startsWith('early'))send({method:'warning',params:{threadId:mode==='early-foreign'?'foreign':tid,message:'PUBLIC early startup warning'}});reply({thread:{id:tid},model:mode==='wrong-model'?'other-model':'gpt-6.1-sol',modelProvider:'openai',instructionSources:[],activePermissionProfile:{id:'cimiloop-method'},approvalPolicy:'never'});}
if(r.method==='turn/start'){appendFileSync(effects,'turn\\n');reply({turn:{id:turn,status:'inProgress'}});if(mode==='lost')process.exit(0);else if(mode==='forbidden'){send({method:'item/started',params:{threadId:tid,turnId:turn,item:{type:'commandExecution',id:'public-command'}}});}else if(mode==='foreign'){send({id:901,method:'item/tool/call',params:{threadId:'foreign',turnId:turn,callId:'public-call',namespace:null,tool:'invoke_skill',arguments:{name:'grill-me'}}});}else{const call={id:901,method:'item/tool/call',params:{threadId:tid,turnId:turn,callId:'public-call',namespace:null,tool:'invoke_skill',arguments:{name:'grill-me'}}};send(call);if(mode==='duplicate')send(call);}}
});function finish(){if(mode!=='no-usage')send({method:'thread/tokenUsage/updated',params:{threadId:tid,turnId:turn,tokenUsage:{total:{inputTokens:10,cachedInputTokens:2,outputTokens:3,totalTokens:13,reasoningOutputTokens:0,cacheWriteInputTokens:0}}}});if(mode==='invalid-utf8')process.stdout.write(Buffer.concat([Buffer.from('{"method":"PUBLIC","params":{"text":"'),Buffer.from([255]),Buffer.from('"}}\\n')]));send({method:'item/completed',params:{threadId:tid,turnId:turn,item:{type:'agentMessage',id:'public-output',phase:'final_answer',text:JSON.stringify({purpose:'clarification',questions:['PUBLIC question'],unresolved:[]})}}});send({method:'turn/completed',params:{threadId:tid,turn:{id:turn,status:'completed',error:null}}});if(mode==='tail')process.stdout.write('{"PUBLIC":');if(mode==='after-completion')send({id:902,method:'item/tool/call',params:{threadId:tid,turnId:turn,callId:'public-after',namespace:null,tool:'invoke_skill',arguments:{name:'grill-me'}}});}
`);
  const hash = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
  const requests = { model: "gpt-6.1-sol", prompt: "PUBLIC fixed method", instructions: "Use only fixed tools", tools: [{ type: "function", name: "invoke_skill", description: "PUBLIC method", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false } }], output_schema: { type: "object" } };
  function setup(mode = "normal", accountDigest?: string) {
    const operation = join(root, mode); mkdirSync(operation, { recursive: true });
    const Constructor = Reflect.get(runtime, "CodexOriginalMethodRuntime");
    expect(Constructor).toBeTypeOf("function");
    const adapter: any = new Constructor({ root: operation, command: { file: process.execPath, args: [script, mode, effects], sha256: hash(process.execPath) }, timeout_ms: 3000, ...(accountDigest ? { account_digest: accountDigest } : {}) });
    const input = { ...requests, operation_key: "PUBLIC_original_operation" };
    return { adapter, input };
  }
  const count = () => { try { return readFileSync(effects, "utf8").trim().split("\n").length; } catch { return 0; } };
  afterAll(() => {}); // Retain owned originals for diagnostics; never bulk-delete Temp.

  it("executes fixed tools, retains actual stdio originals and replays without a new turn", async () => {
    const { adapter, input } = setup(), before = count(); let calls = 0;
    const result = await adapter.execute(input, () => { calls++; return "PUBLIC pinned Skill source"; }, () => {});
    expect(result).toMatchObject({ thread_id: "public-thread", turn_id: "public-turn", model: "gpt-6.1-sol", usage: { inputTokens: 10, outputTokens: 3 }, tool_calls: [{ tool: "invoke_skill", arguments: { name: "grill-me" }, output: "PUBLIC pinned Skill source" }] });
    expect(await adapter.execute(input, () => { throw Error("must not call twice"); }, () => {})).toEqual(result);
    expect(adapter.readOriginal(input)).toEqual(result);
    expect(count() - before).toBe(1); expect(calls).toBe(1);
  });
  it("binds startup notifications delivered before the thread/start response to that original thread", async () => {
    const { adapter, input } = setup("early-valid");
    expect((await adapter.execute(input, () => "PUBLIC source", () => {})).thread_id).toBe("public-thread");
    expect(adapter.readOriginal(input).thread_id).toBe("public-thread");
  });
  it("rejects startup notifications for another thread before sending any model request", async () => {
    const { adapter, input } = setup("early-foreign"), before = count();
    await expect(adapter.execute(input, () => "PUBLIC source", () => {})).rejects.toThrow();
    expect(count()).toBe(before);
  });
  it("does not launch a replacement turn after losing the original response", async () => {
    const { adapter, input } = setup("lost"), before = count();
    await expect(adapter.execute(input, () => "PUBLIC", () => {})).rejects.toThrow();
    await expect(adapter.execute(input, () => "PUBLIC", () => {})).rejects.toThrow("codex_original_pending");
    expect(count() - before).toBe(1); expect(adapter.readOriginal(input)).toBeNull();
  });
  it.each(["wrong-model", "api-key"])("rejects %s before sending a model turn", async mode => {
    const { adapter, input } = setup(mode), before = count();
    await expect(adapter.execute(input, () => "PUBLIC", () => {})).rejects.toThrow();
    expect(count()).toBe(before);
  });
  it("binds the approved account before a model turn and rechecks it after completion", async () => {
    for (const mode of ["account-wrong-start", "account-changed"]) {
      const expected = createHash("sha256").update(JSON.stringify({ format: "cimiloop/codex-account/1.0.0", type: "chatgpt", email: "public@example.test", workspace: null })).digest("hex");
      const { adapter, input } = setup(mode, expected), before = count();
      await expect(adapter.execute(input, () => "PUBLIC source", () => {})).rejects.toThrow();
      expect(adapter.readOriginal(input)).toBeNull();
      expect(count() - before).toBe(mode === "account-wrong-start" ? 0 : 1);
    }
  });
  it.each(["forbidden", "foreign", "no-usage"])("does not certify %s execution", async mode => {
    const { adapter, input } = setup(mode); let calls = 0;
    await expect(adapter.execute(input, () => { calls++; return "PUBLIC"; }, () => {})).rejects.toThrow();
    expect(adapter.readOriginal(input)).toBeNull();
    if (mode !== "no-usage") expect(calls).toBe(0);
  });
  it("checks the current Human guard before the first irreversible start", async () => {
    const { adapter, input } = setup("guard"), before = count();
    await expect(adapter.execute(input, () => "PUBLIC", () => { throw Error("PUBLIC expired Human"); })).rejects.toThrow();
    expect(count()).toBe(before);
  });
  it.each(["duplicate", "after-completion", "invalid-utf8", "tail"])("rejects %s raw protocol without a second tool effect", async mode => {
    const { adapter, input } = setup(mode); let effects = 0;
    await expect(adapter.execute(input, () => { effects++; return "PUBLIC source"; }, () => {})).rejects.toThrow();
    expect(effects).toBe(1); expect(adapter.readOriginal(input)).toBeNull();
  });
  it("rejects changed input and corrupted retained raw records", async () => {
    const { adapter, input } = setup("tamper");
    const original = await adapter.execute(input, () => "PUBLIC pinned Skill source", () => {});
    await expect(adapter.execute({ ...input, prompt: "different" }, () => "PUBLIC", () => {})).rejects.toThrow();
    writeFileSync(original.original_ref.locator, "PUBLIC modified original");
    expect(() => adapter.readOriginal(input)).toThrow();
  });
});
