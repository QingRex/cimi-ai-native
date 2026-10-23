import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createInternalId, compileValidator } from "@cimiloop/protocol/v2";
import * as runtime from "../src/index.js";
import { AgentRuntimeModelHost } from "../src/agent-runtime-model.js";
import { claimAgentRuntimeOperation } from "../src/agent-runtime-operation.js";
import { digest } from "../src/files.js";
import { parseAgentWorkspaceToolScope } from "../src/agent-workspace-authority.js";

// Real stdio processes and original Host files, PUBLIC account/model replies.
// These tests never read a user login or qualify actual model/account behavior.
function fixture(reply: unknown = { content: [{ type: "tool-call", tool_call_id: "original_read_1", tool_name: "cimi_read", arguments: JSON.stringify({ path: "src/query.ts" }) }], finish: "tool_calls" }) {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-codex-agent-")), script = join(root, "server.mjs"), control = join(root, "reply.json"), log = join(root, "turns.jsonl");
  writeFileSync(control, JSON.stringify(reply));
  writeFileSync(script, String.raw`import{createInterface}from'node:readline';import{readFileSync,appendFileSync}from'node:fs';let model='',bridge=false,namedResult=false,output;
let duplicate=false,submittedTool='cimiloop_sdk_reply',submittedArgs;const send=v=>process.stdout.write(JSON.stringify(v)+'\n'),event=item=>send({method:'item/completed',params:{threadId:'PUBLIC_THREAD',turnId:'PUBLIC_TURN',item}});
let outputTokens=19;function finish(){event({type:'agentMessage',phase:'final_answer',text:JSON.stringify(bridge?{submitted:true}:output)});send({method:'thread/tokenUsage/updated',params:{threadId:'PUBLIC_THREAD',turnId:'PUBLIC_TURN',tokenUsage:{total:{inputTokens:57,cachedInputTokens:5,outputTokens,totalTokens:57+outputTokens,reasoningOutputTokens:7,cacheWriteInputTokens:0}}}});send({method:'turn/completed',params:{threadId:'PUBLIC_THREAD',turn:{id:'PUBLIC_TURN',status:'completed',error:null}}});}
createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line),ok=result=>send({id:r.id,result});
if(!r.method){if(r.id===901){event({type:'dynamicToolCall',id:'PUBLIC_SUBMISSION',namespace:null,tool:submittedTool,arguments:submittedArgs,status:'completed',contentItems:r.result.contentItems,success:r.result.success});if(duplicate)send({id:902,method:'item/tool/call',params:{threadId:'PUBLIC_THREAD',turnId:'PUBLIC_TURN',callId:'PUBLIC_SUBMISSION_2',namespace:null,tool:'cimiloop_sdk_reply',arguments:output}});else finish();}return;}
if(r.method==='initialize')ok({userAgent:'PUBLIC'});if(r.method==='account/read')ok({account:{type:'chatgpt',email:'PUBLIC@example.test'},requiresOpenaiAuth:true});
if(r.method==='account/rateLimits/read')ok({ordinaryUsageAllowed:JSON.parse(readFileSync(process.argv[2],'utf8')).PUBLIC_quota_allowed??true,accountId:'PUBLIC-account',rateLimits:{primary:null,secondary:null,credits:null}});
if(r.method==='thread/start'){model=r.params.model;namedResult=r.params.dynamicTools.some(tool=>tool.name==='cimiloop_skill_result');bridge=namedResult||r.params.dynamicTools.some(tool=>tool.name==='cimiloop_sdk_reply');ok({model,modelProvider:'openai',approvalPolicy:'never',activePermissionProfile:{id:'cimiloop-method'},instructionSources:[],thread:{id:'PUBLIC_THREAD'}});}
if(r.method==='mcpServerStatus/list')ok({data:[],nextCursor:null});if(r.method==='turn/start'){appendFileSync(process.argv[3],JSON.stringify(r.params)+'\n');ok({turn:{id:'PUBLIC_TURN'}});output=JSON.parse(readFileSync(process.argv[2],'utf8'));if(output.stall)return;outputTokens=output.PUBLIC_output_tokens??19;delete output.PUBLIC_output_tokens;duplicate=output.PUBLIC_duplicate_submission===true;delete output.PUBLIC_duplicate_submission;let proxy=output.PUBLIC_proxy;delete output.PUBLIC_proxy;if(!proxy&&namedResult){const call=output.content?.[0];proxy=call?.type==='tool-call'?{tool:call.tool_name,arguments:JSON.parse(call.arguments)}:{tool:'cimiloop_skill_result',arguments:{result:JSON.parse(call?.text??'{}')}};}submittedTool=proxy?.tool??'cimiloop_sdk_reply';submittedArgs=proxy?.arguments??output;if(bridge&&!output.skip_submission)send({id:901,method:'item/tool/call',params:{threadId:'PUBLIC_THREAD',turnId:'PUBLIC_TURN',callId:'PUBLIC_SUBMISSION',namespace:null,tool:submittedTool,arguments:submittedArgs}});else finish();}});`);
  const scope = parseAgentWorkspaceToolScope({ project_id: createInternalId(), run_id: createInternalId(), operation_key: createInternalId(), executor_actor_id: createInternalId(), context_digest: digest("PUBLIC context"), skill_bindings: [], runtime_binding: { binding_ref: { object_type: "provider_binding", id: createInternalId() }, digest: digest("PUBLIC binding") }, host_admission_ref: { provider: "local_content", resource_type: "agent_host_admission", locator: digest("PUBLIC admission").value, digest: digest("PUBLIC admission") } });
  const account = runtime.codexChatGptAccountDigest({ account: { type: "chatgpt", email: "PUBLIC@example.test" } }), admission = digest("PUBLIC budget/qualification only").value;
  const originalRoot = join(root, "originals"), transport = new runtime.CodexOriginalMethodRuntime({ root: originalRoot, command: { file: process.execPath, args: [script, control, log], sha256: createHash("sha256").update(readFileSync(process.execPath)).digest("hex") }, account_digest: account, timeout_ms: 10000 });
  let allowed = true;
  const authority = { async check() { if (!allowed) throw Error("PUBLIC authority revoked"); }, beforeEffect() { if (!allowed) throw Error("PUBLIC authority revoked"); } };
  const options = { root, scope, model: "gpt-6-luna", account_digest: account, admission_digest: admission, origin: "public_fixture" as const, runtime: transport, authority, permitted_tools: ["cimi_read"] };
  const request = { format: "cimiloop/agent-runtime-model-request/1.0.0", scope_digest: digest(JSON.stringify(scope)).value, admission_digest: admission, call_id: "model_0001", tool: "model_step", prompt: [{ role: "user", content: [{ type: "text", text: "PUBLIC read the admitted query file" }] }], tools: [{ type: "function", name: "cimi_read", description: "PUBLIC read only", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } }], max_output_tokens: 512 };
  const create = () => { const factory = Reflect.get(runtime, "createCodexAgentRuntimeModel"); expect(factory).toBeTypeOf("function"); return factory(options); };
  const open = async () => AgentRuntimeModelHost.initialize(root, scope, create(), ["cimi_read"]);
  const read = () => { const reader = Reflect.get(runtime, "readCodexAgentModelOriginals"); expect(reader).toBeTypeOf("function"); return reader(root, scope); };
  return { root, scope, options, transport, originalRoot, control, log, request, create, open, read, revoke() { allowed = false; }, turns() { return existsSync(log) ? readFileSync(log, "utf8").trimEnd().split("\n").length : 0; } };
}
describe("Codex model behind the original Agent SDK host", () => {
  function namedFixture() {
    const f = fixture({ content: [{ type: "tool-call", tool_call_id: "original_skill_1", tool_name: "cimi_invoke_skill", arguments: JSON.stringify({ name: "grill-me" }) }], finish: "tool_calls" });
    f.options.permitted_tools = ["cimi_invoke_skill", "cimi_read_method_resource"];
    Reflect.set(f.options, "output_profile", "bounded_2048/1.0.0"); Reflect.set(f.options, "usage_policy", "require_ordinary_permission/1.0.0"); Reflect.set(f.options, "quota_account_digest", digest("PUBLIC-account").value);
    const request = { ...f.request, format: "cimiloop/agent-runtime-model-request/3.0.0", max_output_tokens: 2048, tools: [
      { type: "function", name: "cimi_invoke_skill", description: "Load the fixed Skill entry", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false } },
      { type: "function", name: "cimi_read_method_resource", description: "Read a fixed method resource", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } }
    ] };
    const open = () => AgentRuntimeModelHost.initialize(f.root, f.scope, f.create(), f.options.permitted_tools);
    return { ...f, request, open };
  }
  it("executes and reopens the exact named Skill SDK pair under fixed account and original replay", async () => {
    const f = namedFixture(), host = await f.open(), reply = await host.execute(f.request);
    expect(reply.receipt).toMatchObject({ content: [{ tool_name: "cimi_invoke_skill" }], finish: "tool_calls" });
    expect(f.read()).toMatchObject({ status: "Observed", quota_account_digest: digest("PUBLIC-account").value });
    const path = join(f.root, "agent-codex-model-originals", f.scope.project_id, f.scope.run_id, "header.json");
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({ format: "cimiloop/codex-agent-model/13.0.0", permitted: f.options.permitted_tools });
    const sent = JSON.parse(readFileSync(f.log, "utf8").trim()).input[0].text;
    expect(sent).toContain("cimi_invoke_skill"); expect(sent).toContain("cimi_read_method_resource"); expect(sent).not.toContain("cimi_replace");
    expect(await (await f.open()).execute(f.request)).toMatchObject({ receipt: reply.receipt, replay: true }); expect(f.turns()).toBe(1);
  });
  it("records fixed Skill proxy advice without executing its business effect inside Codex", async () => {
    const f = namedFixture(); writeFileSync(f.control, JSON.stringify({ PUBLIC_proxy: { tool: "cimi_invoke_skill", arguments: { name: "grill-me" } } }));
    const reply = await (await f.open()).execute(f.request), original = f.read().calls[0]!.original!;
    expect(reply.receipt).toMatchObject({ content: [{ type: "tool-call", tool_name: "cimi_invoke_skill", arguments: '{"name":"grill-me"}', tool_call_id: expect.stringMatching(/^codex_[a-f0-9]{64}$/) }], finish: "tool_calls" });
    expect(original.tool_calls[0]).toMatchObject({ tool: "cimi_invoke_skill", arguments: { name: "grill-me" } });
    expect(JSON.parse(original.tool_calls[0]!.output)).toMatchObject({ sdk_effect_executed: false, response_submitted: true });
    expect(await (await f.open()).execute(f.request)).toMatchObject({ receipt: reply.receipt, replay: true }); expect(f.turns()).toBe(1);
  });
  it("projects only a schema-valid structured Skill result into the original final SDK text", async () => {
    const f = namedFixture(), result = { purpose: "clarification", questions: ["Which business scope?"], unresolved: ["No Human answer yet"] };
    writeFileSync(f.control, JSON.stringify({ PUBLIC_proxy: { tool: "cimiloop_skill_result", arguments: { result } } }));
    const reply = await (await f.open()).execute(f.request); expect(reply.receipt).toMatchObject({ content: [{ type: "text", text: JSON.stringify(result) }], finish: "stop" });
    const originals=f.read();expect(originals.calls[0]!.original!.tool_calls[0]!.tool).toBe("cimiloop_skill_result");
    const start=JSON.parse(readFileSync(originals.artifacts.find(a=>a.name.endsWith('/codex/start.json'))!.path,'utf8')),schema=start.request.tools.find((tool:{name:string})=>tool.name==='cimiloop_skill_result').inputSchema,validate=compileValidator(schema);
    expect(schema.$defs).toBeDefined();expect(()=>validate({result})).not.toThrow();expect(()=>validate({result:{...result,candidate:{requirement:'incomplete'}}})).toThrow();expect(()=>validate({result:{...result,format:'extra'}})).toThrow();
    expect(await (await f.open()).execute(f.request)).toMatchObject({ replay: true }); expect(f.turns()).toBe(1);
  });
  it.each(["incomplete_candidate", "extra_format", "unstructured_reply"])("retains %s as Unknown instead of repairing a model result", async kind => {
    const f = namedFixture(), result = { purpose: "clarification", questions: ["Scope?"], unresolved: [], ...(kind === "incomplete_candidate" ? { candidate: { requirement: "PUBLIC model fragment" } } : kind === "extra_format" ? { format: "model-invented" } : {}) };
    writeFileSync(f.control, JSON.stringify({ PUBLIC_proxy: kind === "unstructured_reply" ? { tool: "cimiloop_sdk_reply", arguments: { content: [{ type: "text", text: JSON.stringify(result) }], finish: "stop" } } : { tool: "cimiloop_skill_result", arguments: { result } } }));
    const host = await f.open(); await expect(host.execute(f.request)).rejects.toThrow(); expect(f.read().status).toBe("Unknown"); await expect(host.execute(f.request)).rejects.toThrow(); expect(f.turns()).toBe(1);
  });
  it.each(["wrong_arguments", "foreign_tool"])("refuses %s at the named proxy before producing SDK advice", async kind => {
    const f = namedFixture(); writeFileSync(f.control, JSON.stringify({ PUBLIC_proxy: kind === "foreign_tool" ? { tool: "bash", arguments: {} } : { tool: "cimi_invoke_skill", arguments: { path: "skill-source/grill-me/SKILL.md" } } }));
    const host = await f.open(); await expect(host.execute(f.request)).rejects.toThrow(); expect(f.read().status).toBe("Unknown"); await expect(host.execute(f.request)).rejects.toThrow(); expect(f.turns()).toBe(1);
  });
  it("reopens named header9 with its original instructions rather than upgrading the recorded request", async () => {
    const f = namedFixture(), header = { format: "cimiloop/codex-agent-model/9.0.0", scope: f.scope, model: f.options.model, account_digest: f.options.account_digest, admission_digest: f.options.admission_digest, origin: f.options.origin, runtime: f.transport.originalConfiguration,
      permitted: f.options.permitted_tools, output_profile: Reflect.get(f.options, "output_profile"), usage_policy: Reflect.get(f.options, "usage_policy"), quota_account_digest: Reflect.get(f.options, "quota_account_digest") };
    for (const kind of ["agent-codex-model-starts", "agent-codex-model-originals"]) { const path = join(f.root, kind, f.scope.project_id, f.scope.run_id); mkdirSync(path, { recursive: true }); writeFileSync(join(path, "header.json"), JSON.stringify(header)); }
    await (await f.open()).execute(f.request); const original = f.read();
    expect(JSON.parse(JSON.parse(readFileSync(f.log, "utf8").trim()).input[0].text).format).toBe("cimiloop/codex-agent-step/4.0.0");
    expect(await (await f.open()).execute(f.request)).toMatchObject({ replay: true }); expect(f.read()).toEqual(original); expect(f.turns()).toBe(1);
  });
  it("cannot reinterpret a named original as an older Codex backend", async () => {
    const f = namedFixture(); await (await f.open()).execute(f.request);
    for (const version of [5, 6, 7, 8]) {
      const paths = ["agent-codex-model-originals", "agent-codex-model-starts"].map(kind => join(f.root, kind, f.scope.project_id, f.scope.run_id, "header.json")), saved = paths.map(path => readFileSync(path));
      try { for (const path of paths) { const header = JSON.parse(readFileSync(path, "utf8")); header.format = `cimiloop/codex-agent-model/${version}.0.0`; writeFileSync(path, JSON.stringify(header)); } expect(() => f.read()).toThrow(); expect(() => f.create()).toThrow(); }
      finally { paths.forEach((path, i) => writeFileSync(path, saved[i]!)); }
    }
    expect(f.read().status).toBe("Observed"); expect(f.turns()).toBe(1);
  });
  it("refuses mixed Skill/workspace catalogs and missing installed account policy before a model turn", () => {
    for (const changed of ["output_profile", "usage_policy", "quota_account_digest", "mixed"]) {
      const f = namedFixture(); if (changed === "mixed") f.options.permitted_tools.push("cimi_read"); else Reflect.deleteProperty(f.options, changed);
      expect(() => f.create()).toThrow(); expect(f.turns()).toBe(0);
    }
  });
  it("retains Unknown named SDK originals and never resends a lost response", async () => {
    const f = namedFixture(); writeFileSync(f.control, JSON.stringify({ skip_submission: true })); const host = await f.open();
    await expect(host.execute(f.request)).rejects.toThrow(); expect(f.read().status).toBe("Unknown");
    await expect((await f.open()).execute(f.request)).rejects.toThrow(); expect(f.turns()).toBe(1);
  });
  it("rejects workspace advice returned inside a named Skill original", async () => {
    const f = namedFixture(); writeFileSync(f.control, JSON.stringify({ content: [{ type: "tool-call", tool_call_id: "foreign_read", tool_name: "cimi_read", arguments: '{"path":"src/query.ts"}' }], finish: "tool_calls" }));
    await expect((await f.open()).execute(f.request)).rejects.toThrow(); expect(f.read().status).toBe("Unknown"); expect(f.turns()).toBe(1);
  });
  it('pins the installed quota account through the SDK and refuses to remove that binding on reopen',async()=>{
    const f=fixture();Reflect.set(f.options,'output_profile','bounded_2048/1.0.0');Reflect.set(f.options,'usage_policy','require_ordinary_permission/1.0.0');Reflect.set(f.options,'quota_account_digest',digest('PUBLIC-account').value);
    const host=await f.open(),request={...f.request,format:'cimiloop/agent-runtime-model-request/3.0.0',max_output_tokens:2048};await host.execute(request);
    const original=f.read();expect(original).toMatchObject({status:'Observed',quota_account_digest:digest('PUBLIC-account').value});
    expect(await (await f.open()).execute(request)).toMatchObject({replay:true});expect(f.turns()).toBe(1);Reflect.deleteProperty(f.options,'quota_account_digest');expect(()=>f.create()).toThrow();
  });
  it('pins quota policy through the actual SDK model original without passing account snapshots to the SDK',async()=>{
    const f=fixture();Reflect.set(f.options,'output_profile','bounded_2048/1.0.0');Reflect.set(f.options,'usage_policy','require_ordinary_permission/1.0.0');const host=await f.open(),request={...f.request,format:'cimiloop/agent-runtime-model-request/3.0.0',max_output_tokens:2048};
    const reply=(await host.execute(request)).receipt;expect(JSON.stringify(reply)).not.toContain('ordinary_quota');expect(f.read()).toMatchObject({status:'Observed',usage_policy:'require_ordinary_permission/1.0.0',calls:[{original:{ordinary_quota:{before:{ordinary_usage_allowed:true},costs_reconciled:false}}}]});
    expect(await (await f.open()).execute(request)).toMatchObject({replay:true});expect(f.turns()).toBe(1);Reflect.deleteProperty(f.options,'usage_policy');expect(()=>f.create()).toThrow();
  });
  it('joins an explicit 2048 output policy to original transport usage, collection and unchanged replay',async()=>{
    const f=fixture({content:[{type:'text',text:'PUBLIC structured domain candidate'}],finish:'stop',PUBLIC_output_tokens:688});Reflect.set(f.options,'output_profile','bounded_2048/1.0.0');
    const host=await f.open(),request={...f.request,format:'cimiloop/agent-runtime-model-request/3.0.0',max_output_tokens:2048};
    expect((await host.execute(request)).receipt.usage.output_tokens).toBe(688);expect(host.outputProfile).toBe('bounded_2048/1.0.0');
    const original=f.read();expect(original).toMatchObject({status:'Observed',output_profile:'bounded_2048/1.0.0',real_model_turns:0,calls:[{original:{usage:{outputTokens:688}}}]});
    expect(await (await f.open()).execute(request)).toMatchObject({replay:true});expect(f.turns()).toBe(1);
    const headerPath=join(f.root,'agent-codex-model-originals',f.scope.project_id,f.scope.run_id,'header.json');expect(JSON.parse(readFileSync(headerPath,'utf8'))).toMatchObject({format:'cimiloop/codex-agent-model/6.0.0',output_profile:'bounded_2048/1.0.0'});
    Reflect.deleteProperty(f.options,'output_profile');expect(()=>f.create()).toThrow();expect(f.turns()).toBe(1);
  });
  it('refuses a 2048 policy appended to an existing legacy Codex operation before another model turn',async()=>{
    const f=fixture(),host=await f.open();await host.execute(f.request);Reflect.set(f.options,'output_profile','bounded_2048/1.0.0');expect(()=>f.create()).toThrow();expect(f.turns()).toBe(1);
  });
  it("takes the SDK proposal from one recorded client submission, never a claimed business effect", async () => {
    const f = fixture(), host = await f.open(); await host.execute(f.request);
    const original = f.read().calls[0]!.original!; expect(original.tool_calls).toHaveLength(1);
    expect(original.tool_calls[0]!.tool).toBe("cimiloop_sdk_reply");
    expect(JSON.parse(original.tool_calls[0]!.output)).toMatchObject({ sdk_effect_executed: false, response_submitted: true, next_action: "return_final_ack" });
    expect(JSON.parse(original.output_text)).toEqual({ submitted: true }); expect(f.turns()).toBe(1);
  });
  it("refuses a final submission acknowledgement without the actual client call", async () => {
    const f = fixture({ skip_submission: true }), host = await f.open();
    await expect(host.execute(f.request)).rejects.toThrow(); expect(f.read().status).toBe("Unknown");
    await expect(host.execute(f.request)).rejects.toThrow(); expect(f.turns()).toBe(1);
  });
  it("refuses a second response submission even when it uses another valid client call identity", async () => {
    const f = fixture({ content: [{ type: "text", text: "PUBLIC advice only" }], finish: "stop", PUBLIC_duplicate_submission: true }), host = await f.open();
    await expect(host.execute(f.request)).rejects.toThrow(); expect(f.read().status).toBe("Unknown");
    await expect(host.execute(f.request)).rejects.toThrow(); expect(f.turns()).toBe(1);
  });
  it("opens and replays an existing legacy backend without changing its original request policy", async () => {
    const f = fixture(), header = { format: "cimiloop/codex-agent-model/1.0.0", scope: f.scope, model: f.options.model, account_digest: f.options.account_digest, admission_digest: f.options.admission_digest, origin: f.options.origin, runtime: f.transport.originalConfiguration, permitted: f.options.permitted_tools };
    for (const kind of ["agent-codex-model-starts", "agent-codex-model-originals"]) { const path = join(f.root, kind, f.scope.project_id, f.scope.run_id); mkdirSync(path, { recursive: true }); writeFileSync(join(path, "header.json"), JSON.stringify(header)); }
    const host = await f.open(), first = await host.execute(f.request), reopened = await AgentRuntimeModelHost.open(f.root, f.scope, f.create(), ["cimi_read"]);
    f.revoke(); expect(await reopened.execute(f.request)).toMatchObject({ receipt: first.receipt, replay: true }); expect(f.read().calls[0]!.original!.tool_calls).toEqual([]); expect(f.turns()).toBe(1);
  });
  it("returns schema-checked SDK tool advice with actual full usage, without executing a business tool", async () => {
    const f = fixture(), host = await f.open(), first = await host.execute(f.request);
    expect(first.receipt).toEqual({ content: [{ type: "tool-call", tool_call_id: "original_read_1", tool_name: "cimi_read", arguments: '{"path":"src/query.ts"}' }], finish: "tool_calls", usage: { input_tokens: 57, output_tokens: 19 } });
    expect(f.turns()).toBe(1); expect(f.read()).toMatchObject({ status: "Observed", origin: "public_fixture", real_model_turns: 0, calls: [{ call_id: "model_0001", response: first.receipt }] });
    expect(JSON.parse(readFileSync(f.log, "utf8").trim()).input[0].text).toContain("PUBLIC read the admitted query file");
    expect(JSON.parse(readFileSync(f.log, "utf8").trim()).effort).toBe("low");
  });
  it("replays sealed originals after reopening and revocation without another turn", async () => {
    const f = fixture(), host = await f.open(), first = await host.execute(f.request);
    const reopened = await AgentRuntimeModelHost.open(f.root, f.scope, f.create(), ["cimi_read"]); f.revoke();
    expect(await reopened.execute(f.request)).toMatchObject({ receipt: first.receipt, replay: true }); expect(f.read().status).toBe("Observed"); expect(f.turns()).toBe(1);
  });
  it("continues from the exact SDK tool result to a second recorded model step", async () => {
    const f = fixture(), host = await f.open(), first = await host.execute(f.request);
    writeFileSync(f.control, JSON.stringify({ content: [{ type: "text", text: "PUBLIC original result read" }], finish: "stop" }));
    const next = { ...f.request, call_id: "model_0002", prompt: [...f.request.prompt, { role: "assistant", content: [{ type: "tool-call", toolCallId: "original_read_1", toolName: "cimi_read", input: { path: "src/query.ts" } }] }, { role: "tool", content: [{ type: "tool-result", toolCallId: "original_read_1", toolName: "cimi_read", output: { type: "text", value: "PUBLIC fixed file bytes" } }] }] };
    expect(first.receipt.finish).toBe("tool_calls"); expect((await host.execute(next)).receipt.finish).toBe("stop");
    expect(f.turns()).toBe(2); expect(f.read()).toMatchObject({ status: "Observed", calls: [{ state: "reply_recorded" }, { state: "reply_recorded" }] });
    expect(JSON.parse(readFileSync(f.log, "utf8").trim().split("\n")[1]!).input[0].text).toContain("PUBLIC fixed file bytes");
  }, 45000);
  it("joins the exact Codex parent header mode used by result and terminal consumers", async () => {
    const f = fixture(), permitted = [...runtime.AGENT_PARENT_SKILL_TOOLS], model = runtime.createCodexAgentRuntimeModel({ ...f.options, permitted_tools: permitted });
    const packet = '{"format":"PUBLIC-parent-task","note":"whole original packet"}', projection = '<content>\n1: ' + packet + '\n\n(End of file - total 1 lines)\n</content>';
    const host = await AgentRuntimeModelHost.initialize(f.root, f.scope, model, permitted, packet);
    const request = { ...f.request, format: "cimiloop/agent-runtime-model-request/2.0.0", prompt: [{ role: "user", content: [{ type: "text", text: projection }] }], tools: permitted.map(name => ({ ...f.request.tools[0]!, name })) };
    await host.execute(request); expect(f.read().status).toBe("Observed");
    const path = join(f.root, "agent-runtime-model-starts", f.scope.project_id, f.scope.run_id, "header.json"), header = JSON.parse(readFileSync(path, "utf8"));
    expect(header.format).toBe("cimiloop/agent-runtime-model-originals/6.0.0");
    expect(() => runtime.assertAgentRuntimeModelOriginalMode(header, true)).not.toThrow();
    expect(() => runtime.assertAgentRuntimeModelOriginalMode(header, false)).toThrow();
    expect(() => runtime.assertAgentRuntimeModelOriginalMode({ ...header, format: "cimiloop/agent-runtime-model-originals/4.0.0" }, true)).toThrow();
    expect(f.turns()).toBe(1);
  });
  it("cancels the owned original turn and never resends its pending SDK call", async () => {
    const f = fixture({ stall: true }), host = await f.open(), controller = new AbortController(), pending = host.execute(f.request, controller.signal);
    const stopped = expect(pending).rejects.toThrow(), deadline = Date.now() + 8000;
    while (!f.turns()) { if (Date.now() >= deadline) throw Error("PUBLIC stdio turn did not start"); await new Promise(done => setTimeout(done, 10)); }
    controller.abort(); await stopped;
    expect(f.read().status).toBe("Unknown"); await expect(host.execute(f.request)).rejects.toThrow(); expect(f.turns()).toBe(1);
  });
  it("rejects an unapproved tool name and model-reported usage", async () => {
    for (const reply of [ { content: [{ type: "tool-call", tool_call_id: "call_1", tool_name: "bash", arguments: "{}" }], finish: "tool_calls" }, { content: [{ type: "text", text: "PUBLIC" }], finish: "stop", usage: { input_tokens: 0, output_tokens: 0 } } ]) {
      const f = fixture(reply), host = await f.open(); await expect(host.execute(f.request)).rejects.toThrow();
      expect(f.turns()).toBe(1); expect(f.read().status).toBe("Unknown"); await expect((await AgentRuntimeModelHost.open(f.root, f.scope, f.create(), ["cimi_read"])).execute(f.request)).rejects.toThrow(); expect(f.turns()).toBe(1);
    }
  });
  it("retains full provider usage and refuses an SDK output cap instead of clamping it", async () => {
    const f = fixture(), host = await f.open(), request = { ...f.request, max_output_tokens: 18 };
    await expect(host.execute(request)).rejects.toThrow(); expect(f.turns()).toBe(1);
    const original = f.read(); expect(original.status).toBe("Unknown");
    expect(original.calls[0]!.original!.usage).toMatchObject({ outputTokens: 19, reasoningOutputTokens: 7 });
    await expect(host.execute(request)).rejects.toThrow(); expect(f.turns()).toBe(1);
  });
  it("rejects a same-byte physical replacement of the anchored provider receipt", async () => {
    const f = fixture(), host = await f.open(); await host.execute(f.request);
    const path = join(f.root, "agent-codex-model-originals", f.scope.project_id, f.scope.run_id, "model_0001/receipt.json"), bytes = readFileSync(path);
    renameSync(path, join(f.root, "retained-receipt.json")); writeFileSync(path, bytes);
    // Remove neither original: the reader must fail even if substituted bytes
    // match exactly, before another model turn or domain observation.
    expect(() => f.read()).toThrow(); expect(f.turns()).toBe(1);
  });
  it("retains sealed inner evidence when the outer SDK receipt was lost", async () => {
    const f = fixture(), model = f.create(), execute = model.execute.bind(model); let lose = true;
    const host = await AgentRuntimeModelHost.initialize(f.root, f.scope, { ...model, async execute(input: any, signal?: AbortSignal) { const reply = await execute(input, signal); if (lose) { lose = false; throw Error("PUBLIC outer response lost"); } return reply; } }, ["cimi_read"]);
    await expect(host.execute(f.request)).rejects.toThrow("PUBLIC outer response lost"); expect(f.turns()).toBe(1);
    // Outer Host deliberately never re-dispatches Unknown. Independent provider
    // evidence remains readable and bound to the original pending SDK request.
    expect(f.read()).toMatchObject({ status: "Unknown", calls: [{ state: "provider_recorded", call_id: "model_0001" }] }); expect(f.turns()).toBe(1);
  });
  it("validates the full assistant history against actual prior receipts before a second send", async () => {
    const f = fixture(), host = await f.open(); await host.execute(f.request);
    const next = { ...f.request, call_id: "model_0002", prompt: [...f.request.prompt, { role: "assistant", content: [{ type: "tool-call", toolCallId: "original_read_1", toolName: "cimi_read", input: { path: "src/SUBSTITUTED.ts" } }] }, { role: "tool", content: [{ type: "tool-result", toolCallId: "original_read_1", toolName: "cimi_read", output: { type: "text", value: "PUBLIC file bytes" } }] }] };
    await expect(host.execute(next)).rejects.toThrow(); expect(f.turns()).toBe(1);
  });
  it("refuses missing synchronous authority and a mismatched account before a turn", async () => {
    const f = fixture(), factory = Reflect.get(runtime, "createCodexAgentRuntimeModel"); expect(factory).toBeTypeOf("function");
    expect(() => factory({ ...f.options, account_digest: "0".repeat(64) })).toThrow(); expect(() => Reflect.apply(factory, undefined, [{ ...f.options, authority: { check: async () => {} } }])).toThrow(); expect(f.turns()).toBe(0);
    f.options.authority.beforeEffect = () => { throw Error("PUBLIC effect revoked"); };
    await expect((await f.open()).execute(f.request)).rejects.toThrow(); expect(f.turns()).toBe(0);
  });
  it("does not recreate missing originals when independently inspecting evidence", async () => {
    const f = fixture(), host = await f.open(); await host.execute(f.request); renameSync(f.originalRoot, f.originalRoot + ".retained");
    expect(() => f.read()).toThrow(); expect(existsSync(f.originalRoot)).toBe(false);
  });
  it("rechecks the exact pending SDK request after asynchronous authority callbacks", async () => {
    const f = fixture(); let mutated = false;
    f.options.authority.check = async () => {
      const path = join(f.root, "agent-runtime-model-starts", f.scope.project_id, f.scope.run_id, "model_0001", "request.json");
      if (existsSync(path)) { const value = JSON.parse(readFileSync(path, "utf8")); value.prompt[0].content[0].text = "PUBLIC substituted after await"; writeFileSync(path, JSON.stringify(value)); mutated = true; }
    };
    const host = await f.open(); await expect(host.execute(f.request)).rejects.toThrow(); expect(mutated).toBe(true); expect(f.turns()).toBe(0);
  });
  it("rejects unregistered provider call directories instead of omitting possible effects", async () => {
    const f = fixture(), host = await f.open(); await host.execute(f.request);
    mkdirSync(join(f.root, "agent-codex-model-starts", f.scope.project_id, f.scope.run_id, "model_0002"));
    expect(() => f.read()).toThrow();
  });
  it("collects Codex bytes under their own backend and independently verifies copied originals", async () => {
    const f = fixture(), host = await f.open(); await host.execute(f.request);
    claimAgentRuntimeOperation(f.root, f.scope, { purpose: "agent_runtime", model_original_binding: host.originalBinding }, { pid: process.pid, creation_ticks: "1", image: process.execPath });
    const collection = await runtime.collectAgentRuntimeOperation(f.root, f.scope);
    expect(Reflect.get(collection, "codex_model")).toMatchObject({ status: "Observed", original_requirement_pinned: true, real_model_turns: 0, calls: 1 });
    expect(collection.dedicated_model).toBeUndefined();
    const verifier = Reflect.get(runtime, "verifyCollectedCodexAgentModelOriginals"); expect(verifier).toBeTypeOf("function");
    verifier(f.root, f.scope, collection);
    const original = collection.artifacts.find(item => item.name.startsWith("codex-model/") && item.name.endsWith("stdio.jsonl"))!;
    expect(original).toBeDefined(); writeFileSync(original.reference.locator, "PUBLIC substituted blob");
    expect(() => verifier(f.root, f.scope, collection)).toThrow();
  });
});
