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
  writeFileSync(script, `import {createInterface} from 'node:readline';import{appendFileSync,existsSync}from'node:fs';
const mode=process.argv[2],effects=process.argv[3],sleepDisabled=process.argv.some(value=>value.includes('"sleep_tool"=false'));let tid='public-thread',turn='public-turn',accountReads=0,turnStarted=false;
const send=v=>process.stdout.write(JSON.stringify(v)+'\\n');
createInterface({input:process.stdin}).on('line',l=>{const r=JSON.parse(l);if(!r.method){if(r.id===901){send({method:'item/completed',params:{threadId:tid,turnId:turn,item:{type:'dynamicToolCall',id:'public-call',namespace:null,tool:'invoke_skill',arguments:{name:'grill-me'},status:'completed',contentItems:r.result.contentItems,success:r.result.success}}});finish();}return;}
const reply=x=>send({id:r.id,result:x});if(r.method==='initialize')reply({userAgent:'PUBLIC fixture'});
if(r.method==='account/read'){accountReads++;const result={account:{type:mode==='api-key'?'apiKey':'chatgpt',email:mode==='account-wrong-start'||mode==='account-changed'&&turnStarted?'other@example.test':'public@example.test',planType:'public'},requiresOpenaiAuth:true};if(mode==='auth-after-ready'&&accountReads===2)process.stdout.write(JSON.stringify({id:r.id,result})+'\\n'+JSON.stringify({method:'account/updated',params:{authMode:'chatgpt'}})+'\\n');else reply(result);}
if(r.method==='thread/start'){if(mode==='auth-late')send({method:'account/updated',params:{authMode:'chatgpt'}});if(mode.startsWith('early'))send({method:'warning',params:{threadId:mode==='early-foreign'?'foreign':tid,message:'PUBLIC early startup warning'}});reply({thread:{id:tid},model:mode==='wrong-model'?'other-model':r.params.model,modelProvider:'openai',instructionSources:[],activePermissionProfile:{id:'cimiloop-method'},approvalPolicy:'never'});}
if(r.method==='mcpServerStatus/list')reply({data:mode==='mcp-active'?[{name:'PUBLIC-external',runtimeStatus:'connected',tools:{PUBLIC_tool:{}},resources:[],resourceTemplates:[],toolsError:null}]:[],nextCursor:null});
if(r.method==='turn/start'){turnStarted=true;appendFileSync(effects,'turn\\n');reply({turn:{id:turn,status:'inProgress'}});if(mode==='lost')process.exit(0);else if(mode==='forbidden'||mode==='sleep-leak'&&!sleepDisabled){send({method:'item/started',params:{threadId:tid,turnId:turn,item:{type:mode==='sleep-leak'?'sleep':'commandExecution',id:'public-command'}}});}else if(mode==='foreign'){send({id:901,method:'item/tool/call',params:{threadId:'foreign',turnId:turn,callId:'public-call',namespace:null,tool:'invoke_skill',arguments:{name:'grill-me'}}});}else{const call={id:901,method:'item/tool/call',params:{threadId:tid,turnId:turn,callId:'public-call',namespace:null,tool:'invoke_skill',arguments:{name:'grill-me'}}};send(call);if(mode==='duplicate')send(call);}}
});
if(mode.startsWith('flood-')){const waiting=setInterval(()=>{if(!existsSync(effects+'.'+mode+'.ready'))return;clearInterval(waiting);const notification=JSON.stringify({method:'PUBLIC',params:{text:mode==='flood-bytes'?'x'.repeat(32768):''}})+'\\n';process.stdout.write(notification.repeat(mode==='flood-bytes'?210:9000));},5);}
function finish(){if(mode!=='no-usage')send({method:'thread/tokenUsage/updated',params:{threadId:tid,turnId:turn,tokenUsage:{total:{inputTokens:10,cachedInputTokens:2,outputTokens:3,totalTokens:13,reasoningOutputTokens:0,cacheWriteInputTokens:0}}}});if(mode==='invalid-utf8')process.stdout.write(Buffer.concat([Buffer.from('{"method":"PUBLIC","params":{"text":"'),Buffer.from([255]),Buffer.from('"}}\\n')]));send({method:'item/completed',params:{threadId:tid,turnId:turn,item:{type:'agentMessage',id:'public-output',phase:'final_answer',text:JSON.stringify({purpose:'clarification',questions:['PUBLIC question'],unresolved:[]})}}});send({method:'turn/completed',params:{threadId:tid,turn:{id:turn,status:'completed',error:null}}});if(mode==='tail')process.stdout.write('{"PUBLIC":');if(mode==='after-completion')send({id:902,method:'item/tool/call',params:{threadId:tid,turnId:turn,callId:'public-after',namespace:null,tool:'invoke_skill',arguments:{name:'grill-me'}}});}
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
  it("pins explicitly low reasoning in a new original request without changing legacy medium requests", async () => {
    const { adapter, input } = setup("low-effort"), request = { ...input, reasoning_effort: "low" }, before = count();
    const first = await adapter.execute(request, () => "PUBLIC fixed response", () => {});
    expect(adapter.readOriginal(request)).toEqual(first); expect(await adapter.execute(request, () => { throw Error("No repeat"); }, () => {})).toEqual(first); expect(count() - before).toBe(1);
    const start = JSON.parse(readFileSync(join(root, "low-effort", input.operation_key, "start.json"), "utf8"));
    expect(start.format).toBe("cimiloop/codex-method-start/4.0.0"); expect(start.request.reasoning_effort).toBe("low");
    const frames = readFileSync(join(root, "low-effort", input.operation_key, "stdio.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(Buffer.from(JSON.parse(line).bytes, "base64").toString("utf8")));
    expect(frames.find(frame => frame.method === "turn/start").params.effort).toBe("low");
    expect(() => adapter.readOriginal({ ...request, reasoning_effort: "medium" })).toThrow();
    // PUBLIC mutation fixture: even self-consistent re-sealed bytes cannot
    // change the actual wire effort while retaining the original request.
    const transcriptPath = join(root, "low-effort", input.operation_key, "stdio.jsonl"), rawFrames = readFileSync(transcriptPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
    const index = frames.findIndex(frame => frame.method === "turn/start"); frames[index]!.params.effort = "medium";
    rawFrames[index]!.bytes = Buffer.from(JSON.stringify(frames[index]) + "\n").toString("base64"); writeFileSync(transcriptPath, rawFrames.map(frame => JSON.stringify(frame)).join("\n") + "\n");
    const sealPath = join(root, "low-effort", input.operation_key, "seal.json"), seal = JSON.parse(readFileSync(sealPath, "utf8")); seal.transcript_digest = hash(transcriptPath); writeFileSync(sealPath, JSON.stringify(seal));
    expect(() => adapter.readOriginal(request)).toThrow(); expect(count() - before).toBe(1);
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
  it("rechecks the same account after a delayed startup authentication notification", async () => {
    const { adapter, input } = setup("auth-late"), before = count();
    expect((await adapter.execute(input, () => "PUBLIC source", () => {})).account_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(count() - before).toBe(1);
  });
  it("refuses an active external MCP catalog before sending a model request", async () => {
    const { adapter, input } = setup("mcp-active"), before = count();
    await expect(adapter.execute(input, () => "PUBLIC", () => {})).rejects.toThrow(); expect(count()).toBe(before);
  });
  it("disables the built-in sleep tool before executing a fixed clarification", async () => {
    const { adapter, input } = setup("sleep-leak");
    expect((await adapter.execute(input, () => "PUBLIC fixed tool", () => {})).operation_key).toBe(input.operation_key);
  });
  it("processes an already received account change before sending the first model request", async () => {
    const { adapter, input } = setup("auth-after-ready"), before = count();
    await expect(adapter.execute(input, () => "PUBLIC", () => {})).rejects.toThrow();
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
  it("gives a nested tool its exact original call identity and revokes its effect guard after closure", async () => {
    const { adapter, input } = setup("tool-context"); let context: any;
    const result = await adapter.execute(input, (_name: string, _args: unknown, original: any) => {
      context = original;
      expect(original).toMatchObject({ call_id: "public-call", thread_id: "public-thread", turn_id: "public-turn" });
      expect(original.signal.aborted).toBe(false); original.beforeEffect(); return "PUBLIC source";
    }, () => {});
    expect(result.thread_id).toBe("public-thread");
    expect(() => context.beforeEffect()).toThrow(); expect(context.signal.aborted).toBe(true);
  });
  it("cancels original execution and propagated tools without a replacement turn", async () => {
    const { adapter, input } = setup("abort"), controller = new AbortController(), before = count();
    await expect(adapter.execute(input, () => { controller.abort(); return "PUBLIC source"; }, () => {}, controller.signal)).rejects.toThrow();
    expect(adapter.readOriginal(input)).toBeNull();
    await expect(adapter.execute(input, () => "PUBLIC", () => {})).rejects.toThrow("codex_original_pending");
    expect(count() - before).toBe(1);
  });
  it.each(['flood-bytes', 'flood-frames'])("bounds %s while the original tool is still awaiting, without resending", async mode => {
    const { adapter, input } = setup(mode), before = count(); let context: any, calls = 0;
    await expect(adapter.execute(input, (_name: string, _args: unknown, original: any) => {
      context = original; calls++;
      return new Promise<string>(resolve => {
        original.signal.addEventListener('abort', () => resolve('PUBLIC cancelled tool'), { once: true });
        // The real child sends only after the callback has begun waiting.
        writeFileSync(effects + '.' + mode + '.ready', 'PUBLIC ready', { flag: 'wx' });
      });
    }, () => {})).rejects.toThrow('codex_capacity_exhausted');
    expect(calls).toBe(1); expect(context.signal.aborted).toBe(true); expect(() => context.beforeEffect()).toThrow();
    expect(adapter.readOriginal(input)).toBeNull();
    await expect(adapter.execute(input, () => { throw Error('must not retry a dispatched tool'); }, () => {})).rejects.toThrow('codex_original_pending');
    expect(count() - before).toBe(1);
    const frames = readFileSync(join(root, mode, input.operation_key, 'stdio.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const outbound = frames.filter(frame => frame.direction === 'out').map(frame => JSON.parse(Buffer.from(frame.bytes, 'base64').toString('utf8')));
    expect(outbound.some(frame => frame.id === 901 && frame.result)).toBe(false);
  });
  it("propagates cancellation across two actual stdio children and retains both original identities", async () => {
    const parent = setup("nested-parent"), child = setup("nested-child"), controller = new AbortController(), before = count();
    child.input.operation_key = "PUBLIC_child_original";
    await expect(parent.adapter.execute(parent.input, async (_name: string, _args: unknown, original: any) => {
      await child.adapter.execute(child.input, () => { controller.abort(); return "PUBLIC child source"; }, original.beforeEffect, original.signal);
      return "PUBLIC parent source";
    }, () => {}, controller.signal)).rejects.toThrow();
    expect(parent.adapter.readOriginal(parent.input)).toBeNull(); expect(child.adapter.readOriginal(child.input)).toBeNull();
    await expect(parent.adapter.execute(parent.input, () => "PUBLIC", () => {})).rejects.toThrow("codex_original_pending");
    await expect(child.adapter.execute(child.input, () => "PUBLIC", () => {})).rejects.toThrow("codex_original_pending");
    expect(count() - before).toBe(2);
  });
  it.each(["account", "model"])("refuses a different child %s before the child sends a model turn", async mismatch => {
    const parent = setup("admission-parent-" + mismatch), child = setup(mismatch === "account" ? "account-wrong-start" : "admission-child-model"), before = count();
    child.input.operation_key = "PUBLIC_approved_child";
    if (mismatch === "model") child.input.model = "gpt-6-luna";
    await expect(parent.adapter.execute(parent.input, async (_name: string, _args: unknown, original: any) => {
      await child.adapter.execute(child.input, () => "PUBLIC child source", original.beforeEffect, original.signal, { model: original.model, account_digest: original.account_digest });
      return "PUBLIC parent source";
    }, () => {})).rejects.toThrow();
    expect(count() - before).toBe(1);
    expect(child.adapter.readOriginal(child.input)).toBeNull();
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
