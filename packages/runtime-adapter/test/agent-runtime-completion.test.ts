import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ ipc: vi.fn(), native: vi.fn() }));
vi.mock("../src/agent-workspace-ipc-journal.js", async original => ({ ...await original<typeof import("../src/agent-workspace-ipc-journal.js")>(), readAgentWorkspaceIpcOriginals: ports.ipc }));
vi.mock("../src/agent-runtime-result.js", async original => ({ ...await original<typeof import("../src/agent-runtime-result.js")>(), readAgentRuntimeNativeResult: ports.native }));
import { createAgentRunProject } from "../../../tests/fixtures/agent-run-project.js";
import { digest, rawReference } from "../src/files.js";
import { agentWorkspaceIpcScopeDigest } from "../src/agent-workspace-ipc.js";
import { correlateAgentWorkspaceSdkOriginals } from "../src/agent-workspace-ipc-journal.js";
import { originalTaskResultContract, verifyOriginalTaskExecutionResult } from "../src/agent-runtime-completion.js";
// Constructed Kernel/domain, SDK/model bytes and Native read ports. These tests
// verify the executable result contract only, not real models/Native/Skill/S1.

describe("original structured Task execution result", () => {
  let root: string, f: ReturnType<typeof createAgentRunProject>, base: any, terminal: any, responses: any[], events: any[], ipc: any, collection: any;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "cimiloop-task-result-contract-")); f = createAgentRunProject(root);
    const prepared = f.prepareAgent(), reserved = f.reserveAgent(prepared), record = reserved.record;
    if (record.run_kind !== "agent") throw Error("Agent record expected");
    const scope = { project_id: f.project.id, run_id: reserved.run.id, operation_key: record.operation_key, executor_actor_id: f.agent.id,
      context_digest: record.input_digest, runtime_binding: record.runtime_binding, skill_bindings: record.skill_bindings, host_admission_ref: record.host_admission_ref };
    const definition = f.store.getExecutionRecord("task_definition", record.definition_ref.id)!;
    const core = { format: "cimiloop/workspace-check-catalog/1.0.0", scope_digest: agentWorkspaceIpcScopeDigest(scope), node_digest: digest("constructed node").value,
      policy_digest: digest("constructed fixed checks").value, recipes: [{ check_id: "query_test", profile: "node_test", entry: "query.test.mjs", inputs: [{ path: "src/query.ts", expected_digest: digest("source").value }], max_elapsed_ms: 1000, max_output_bytes: 1024 }] };
    const catalog = { ...core, catalog_digest: digest(JSON.stringify(core)).value };
    const packet = { format: "cimiloop/agent-runtime-task-packet/2.0.0", operation_key: scope.operation_key, context_digest: scope.context_digest,
      task: f.task(), work_item: f.item, definition, contract: f.store.getIntentRecord("contract_version", record.contract_ref.id), plan: f.store.getIntentRecord("plan_version", record.plan_ref.id),
      context: prepared.context, check_catalog: catalog, result_contract: originalTaskResultContract(scope, record.definition_ref, definition.body.outputs, ["query_test"]) };
    base = { record, scope, context: prepared.context, packet, catalog };
  }, 90000);
  afterAll(() => { f?.store.close(); if (dirname(root) !== tmpdir() || !basename(root).startsWith("cimiloop-task-result-contract-")) throw Error("Unsafe cleanup"); rmSync(root, { recursive: true, force: true }); });
  beforeEach(() => {
    ports.native.mockReset().mockReturnValue({ status: "Verified", native_effect_reverified: true, unresolved_native_calls: 0, unmatched_native_calls: 0 });
    const scopeDigest = agentWorkspaceIpcScopeDigest(base.scope), callId = "sdk_" + digest(JSON.stringify(["session_original", "message_tools", "model_tool_1"])).value;
    terminal = { format: "cimiloop/task-execution-result/1.0.0", run_id: base.scope.run_id, operation_key: base.scope.operation_key, input_digest: base.scope.context_digest,
      definition_ref: base.record.definition_ref, outputs: base.packet.definition.body.outputs.map((_: unknown, output_index: number) => ({ output_index, evidence_call_ids: [callId] })), summary: "Constructed original result contract" };
    responses = [{ content: [{ type: "tool-call", tool_call_id: "model_tool_1", tool_name: "cimi_check", arguments: JSON.stringify({ check_id: "query_test" }) }], usage: { input_tokens: 5, output_tokens: 5 }, finish: "tool_calls" },
      { content: [{ type: "text", text: JSON.stringify(terminal) }], usage: { input_tokens: 5, output_tokens: 5 }, finish: "stop" }];
    const receipt = { format: "cimiloop/workspace-check-receipt/1.0.0", input_digest: digest("check input").value, run_id: base.scope.run_id, call_id: callId,
      profile: "node_test", entry: "query.test.mjs", outcome: "passed", exit_code: 0, reason: "passed", stdout_digest: digest("ok").value, stderr_digest: digest("").value, source_digest: digest("source").value, formal_agent_execution_enabled: false };
    const request = { format: "cimiloop/agent-workspace-check-request/1.0.0", scope_digest: scopeDigest, call_id: callId, tool: "run_check", check_id: "query_test", check_catalog_digest: base.catalog.catalog_digest };
    ipc = { header: { scope: base.scope, endpoint: { scope_digest: scopeDigest, check_catalog_digest: base.catalog.catalog_digest } }, status: "Observed", unresolved: 0,
      exchanges: [{ ordinal: "0001", request, reply: { outcome: "completed", receipt, replay: false } }] };
    const sdkOutput = { format: "cimiloop/opencode-check-output/1.0.0", call_id: callId, check_id: "query_test", check_catalog_digest: base.catalog.catalog_digest, outcome: "passed", exit_code: 0, reason: "passed", source_digest: receipt.source_digest,
      stdout_digest: receipt.stdout_digest, stderr_digest: receipt.stderr_digest, replay: false, formal_agent_execution_enabled: false };
    const event = (type: string, messageID: string, fields: any) => ({ type, timestamp: 1, sessionID: "session_original", part: { id: "part_" + type + messageID, messageID, sessionID: "session_original", ...fields } });
    events = [event("step_start", "message_tools", { type: "step-start" }), event("tool_use", "message_tools", { type: "tool", callID: "model_tool_1", tool: "cimi_check", state: { status: "completed", input: { check_id: "query_test" }, output: JSON.stringify(sdkOutput) } }),
      event("step_finish", "message_tools", { type: "step-finish", reason: "tool-calls" }), event("step_start", "message_final", { type: "step-start" }),
      event("text", "message_final", { type: "text", text: JSON.stringify(terminal) }), event("step_finish", "message_final", { type: "step-finish", reason: "stop" })];
    ports.ipc.mockReturnValue(ipc); collection = { format: "cimiloop/agent-runtime-originals/1.0.0", scope_digest: scopeDigest,
      status: { status: "Stopped", operation: root, resources_disposed: true, cancellation_requested: false }, artifacts: [], synthetic_model_responses: null,
      model: { status: "Observed", calls: 2, unresolved: 0 }, ipc: { status: "Observed", unresolved: 0, correlation: null }, native: { status: "Verified" } };
  });
  function verify(options: { packet?: any; omitDomain?: boolean; refreshTerminal?: boolean; disposal?: any; result?: any; suspended?: any; envelope?: (events: any[]) => any[]; originalChange?: (root: string) => void; ipcChange?: () => void; snapshotChange?: () => void; jobBinding?: boolean } = {}) {
    if (options.refreshTerminal !== false) { responses[1].content[0].text = JSON.stringify(terminal); events.find(event => event.type === "text").part.text = JSON.stringify(terminal); }
    collection.artifacts = []; const artifact = (name: string, value: any, raw = false) => { const bytes = Buffer.from(raw ? value : JSON.stringify(value)); collection.artifacts.push({ name, reference: rawReference(root, bytes, "agent_runtime_original_bytes", name) }); };
    const prompt = JSON.stringify(options.packet ?? base.packet), owner = { pid: 1234, creation_ticks: "1", image: process.execPath }, admission = digest("constructed unapproved model/account").value;
    // Explicit historical config3 constructed result fixture; no prospective
    // interpreter policy, actual Native/account or S1 qualification is supplied.
    const config = { format:'cimiloop/agent-workspace-sandbox-config/3.0.0', prompt, nonce: "constructed_nonce", pipe_nonce: "constructed_pipe", scope_digest: collection.scope_digest, owner, provider_options: { admission_digest: admission } };
    const disposal = { format: "cimiloop/agent-workspace-sandbox/1.0.0", phase: "ended", nonce: config.nonce, reason: "exited", exit_code: 0, resources_disposed: true, cleanup_errors: [], formal_agent_execution_enabled: false, ...options.disposal };
    const supervisor={pid:2345,creation_ticks:"2",image:process.execPath},peer={pid:2346,creation_ticks:"3",image:process.execPath},appcontainer_sid="S-1-15-2-1-2-3-4-5-6-7";
    const suspended={format:"cimiloop/agent-workspace-sandbox/1.0.0",phase:"suspended",nonce:config.nonce,supervisor,peer,appcontainer_sid,network_capability_sids:[],active_process_limit:1,...options.suspended};
    Object.assign(ipc.header.endpoint,{supervisor,peer,appcontainer_sid});
    artifact("original-launcher.json",{supervisor});artifact("agent-sandbox-resources.json",{runtime:peer,phase:"ended",resources_disposed:true});artifact("agent-sandbox-original.json",suspended);
    artifact("original-config.json", config); artifact("agent-sandbox-cleanup.json", disposal); artifact("result.json", { format: "cimiloop/opencode-workspace-runtime/1.0.0", mode: "host_gateway", operation: root, sandbox: suspended, original_scope_digest: collection.scope_digest, native_exit: { code: 0, signal: null }, disposal, output_limit_exceeded: false, source_bytes_unchanged: true, ...options.result });
    artifact("check-catalog.json", base.catalog); const stream=[suspended,...events,disposal]; const stdout = (options.envelope?.(structuredClone(stream))??stream).map(event => JSON.stringify(event)).join("\n") + "\n"; artifact("stdout.raw", stdout, true);
    collection.ipc.correlation = correlateAgentWorkspaceSdkOriginals(ipc, Buffer.from(stdout));
    // Constructed bytes in actual private model ledger layout. The production
    // reader, including its independent start spine, is never mocked.
    const modelRoot = mkdtempSync(join(root, "original-model-"));
    const modelDir = join(modelRoot, "agent-runtime-model-originals", base.scope.project_id, base.scope.run_id), spine = join(modelRoot, "agent-runtime-model-starts", base.scope.project_id, base.scope.run_id);
    const modelArtifact = (name: string, value: any) => { const target = name.startsWith("start/") ? join(spine, name.slice(6)) : join(modelDir, name); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(value)); artifact("model/" + name, value); };
    const header = { format: "cimiloop/agent-runtime-model-originals/1.0.0", scope: base.scope, task_packet_digest: digest(prompt).value, admission_digest: admission, permitted: ["cimi_read", "cimi_replace", "cimi_check"], maximum_calls: 64 };
    modelArtifact("header.json", header); modelArtifact("start/header.json", header);
    ipc.header.endpoint.model_admission_digest = admission;
    ipc.exchanges = ipc.exchanges.filter((exchange: any) => exchange.request.tool !== "model_step");
    const modelExchanges: any[] = [];
    responses.forEach((response, i) => { const callId = "model_" + String(i + 1).padStart(4, "0"), request = { format: "cimiloop/agent-runtime-model-request/1.0.0", scope_digest: collection.scope_digest, admission_digest: admission, call_id: callId, tool: "model_step", prompt: [{ role: "user", content: "Constructed input" }], tools: header.permitted.map(name => ({ name })), max_output_tokens: 512 };
      modelArtifact("start/" + callId + "/request.json", request); modelArtifact(callId + "/request.json", request); modelArtifact(callId + "/reply.json", { request_digest: digest(JSON.stringify(request)).value, response_digest: digest(JSON.stringify(response)).value, response });
      modelExchanges.push({ ordinal: "", request, reply: { outcome: "completed", receipt: structuredClone(response), replay: false } }); });
    ipc.exchanges = [modelExchanges[0], ...ipc.exchanges, modelExchanges[1]];
    ipc.exchanges.forEach((exchange: any, i: number) => exchange.ordinal = String(i + 1).padStart(4, "0"));
    collection.ipc.correlation = correlateAgentWorkspaceSdkOriginals(ipc, Buffer.from(stdout));
    options.originalChange?.(modelRoot); options.ipcChange?.(); options.snapshotChange?.();
    const original = { operation: root, scope: base.scope, input: { prompt, provider_options: { admission_digest: admission }, ...(options.jobBinding?{job_resource_policy:{format:"cimiloop/agent-job-resource-policy/1.0.0",limit_flags:8712,active_process_limit:1,job_memory_limit_bytes:2147483648,process_memory_limit_bytes:0},job_observer_original:{format:"cimiloop/runtime-binary-original-proof/1.0.0",path:process.execPath,sha:digest("constructed missing observer").value}}:{}) }, claim: { owner } };
    return (verifyOriginalTaskExecutionResult as (...args: any[]) => any)(modelRoot, f.project, base.record, base.context, original, collection,
      options.omitDomain ? undefined : { definition: base.packet.definition, contract: base.packet.contract, plan: base.packet.plan });
  }
  it("refuses success without independent Job evidence when the new original input froze a resource policy",()=>{expect(verify()).not.toBeNull();expect(verify({jobBinding:true})).toBeNull();});
  it.each([{active_process_limit:2},{network_capability_sids:["S-1-15-3-1"]},{extra:true}])("rejects mutually consistent unsafe Native policy %j",suspended=>{expect(verify()).not.toBeNull();expect(verify({suspended})).toBeNull();});
  it.each([{operation:"foreign-original-operation"},{sandbox:{phase:"suspended",active_process_limit:1}}])("rejects a result paired with another original %j",result=>{expect(verify()).not.toBeNull();expect(verify({result})).toBeNull();});
  it("requires unique matching Native suspension before SDK and cleanup after SDK",()=>{
    expect(verify()).not.toBeNull();
    for(const envelope of [(s:any[])=>s.slice(1),(s:any[])=>s.slice(0,-1),(s:any[])=>[s[0],...s],(s:any[])=>[...s,s.at(-1)],(s:any[])=>[s.at(-1),...s.slice(0,-1)],(s:any[])=>[{...s[0],active_process_limit:2},...s.slice(1)],(s:any[])=>[...s,{type:"unrecognized-event"}]])expect(verify({envelope})).toBeNull();
  });
  it("requires independent Kernel domain records rather than trusting mutually consistent Runtime bytes", () => {
    expect(verify()).not.toBeNull();
    expect(verify({ omitDomain: true })).toBeNull();
  });
  it.each(["contract", "plan", "definition"] as const)("rejects substituted %s body even when collected Runtime evidence agrees", field => {
      const packet = structuredClone(base.packet);
      if (field === "contract") packet.contract.body.goal = "Substituted formal contract with unchanged ID";
      if (field === "plan") packet.plan.body.approach = "Substituted formal plan with unchanged ID";
      if (field === "definition") {
        packet.definition.body.outputs = ["Substituted Task output with unchanged ID"];
        packet.plan.body.task_definitions = packet.plan.body.task_definitions.map((item: any) => item.task_id === packet.definition.task_id ? structuredClone(packet.definition.body) : item);
        packet.result_contract = originalTaskResultContract(base.scope, base.record.definition_ref, packet.definition.body.outputs, ["query_test"]);
      }
      expect(verify({ packet })).toBeNull();
  });
  it("rejects foreign domain versions and mismatched WorkItem/Task ownership before Native result verification", () => {
    const changes = [
      (p: any) => p.contract.id = base.record.task_id,
      (p: any) => p.plan.id = base.record.task_id,
      (p: any) => p.work_item.task_id = base.record.run_id,
      (p: any) => p.work_item.definition_ref.domain_version++,
      (p: any) => p.task.project_id = base.record.task_id,
      (p: any) => p.task.change_id = base.record.task_id,
      (p: any) => p.task.definition_ref.domain_version++
    ];
    for (const change of changes) {
      const packet = structuredClone(base.packet); change(packet); ports.native.mockClear();
      expect(verify({ packet })).toBeNull(); expect(ports.native).not.toHaveBeenCalled();
    }
  });
  it("matches original SDK/model output, every fixed Task output and fresh independent Native receipts without claiming billing or acceptance", () => {
    expect(verify()).toMatchObject({ native_effect_reverified: true, model_account_custody_proven: false, costs_reconciled: false, task_acceptance_proven: false,
      outputs: [{ output_index: 0, requirement: base.packet.definition.body.outputs[0] }], sdk: { final_model_call_id: "model_0002" } });
    expect(ports.native).toHaveBeenCalledTimes(1); ports.native.mockReturnValue({ status: "Unknown", native_effect_reverified: false }); expect(verify()).toBeNull();
  });
  it("rejects foreign identity, missing outputs, repeated indexes and a made-up or stale evidence call", () => {
    const original = structuredClone(terminal);
    for (const change of [{ run_id: "foreign" }, { input_digest: digest("foreign") }, { outputs: [] }, { outputs: [{ output_index: 0, evidence_call_ids: ["made_up"] }] }, { outputs: [{ output_index: 1, evidence_call_ids: original.outputs[0].evidence_call_ids }] }, { status: "succeeded" }, { usage: { cost_known: true, cost_micros: 0 } }]) {
      terminal = { ...structuredClone(original), ...change }; expect(verify()).toBeNull();
    }
  });
  it("rejects SDK/model disagreement, partial or duplicate steps and substituted tool input", () => {
    const original = structuredClone(events); events[4].part.text = "changed SDK text"; expect(verify({ refreshTerminal: false })).toBeNull();
    events = structuredClone(original); events.pop(); expect(verify()).toBeNull();
    events = structuredClone(original); events.push(structuredClone(events[5])); expect(verify()).toBeNull();
    events = structuredClone(original); events[1].part.state.input.check_id = "foreign"; expect(verify()).toBeNull();
  });
  it("keeps legacy packets, unfinished/cancelled originals, failed checks and post-check edits unverified", () => {
    expect(verify({ packet: { ...base.packet, format: "cimiloop/agent-runtime-task-packet/1.0.0" } })).toBeNull();
    expect(verify({ result: { source_bytes_unchanged: false } })).toBeNull(); expect(verify({ disposal: { reason: "task_deadline" } })).toBeNull();
    collection.status.cancellation_requested = true; expect(verify()).toBeNull(); collection.status.cancellation_requested = false;
    const check = ipc.exchanges.find((exchange: any) => exchange.request.tool === "run_check");
    check.reply.receipt.outcome = "failed"; check.reply.receipt.exit_code = 1; expect(verify()).toBeNull();
    check.reply.receipt.outcome = "passed"; check.reply.receipt.exit_code = 0;
    ipc.exchanges.push({ ordinal: "0002", request: { tool: "replace_file", call_id: "sdk_late_edit", path: "src/query.ts" }, reply: { outcome: "completed", receipt: {} } }); expect(verify()).toBeNull();
  });
  it("rejects stale snapshots when the independent model reply/spine or completed model IPC no longer matches", () => {
    const modelPath = (modelRoot: string, area: string, file: string) => join(modelRoot, area, base.scope.project_id, base.scope.run_id, file);
    expect(verify({ originalChange: modelRoot => rmSync(modelPath(modelRoot, "agent-runtime-model-originals", "model_0002/reply.json")) })).toBeNull();
    expect(verify({ originalChange: modelRoot => writeFileSync(modelPath(modelRoot, "agent-runtime-model-starts", "model_0002/request.json"), "{}") })).toBeNull();
    expect(verify({ ipcChange: () => { ipc.exchanges.find((exchange: any) => exchange.request.call_id === "model_0002").reply.receipt.content[0].text = "Replaced IPC response"; } })).toBeNull();
    expect(verify({ ipcChange: () => { ipc.exchanges = ipc.exchanges.filter((exchange: any) => exchange.request.call_id !== "model_0002"); } })).toBeNull();
    expect(verify({ ipcChange: () => { ipc.exchanges.push(structuredClone(ipc.exchanges.find((exchange: any) => exchange.request.call_id === "model_0002"))); } })).toBeNull();
    expect(verify({ snapshotChange: () => {
      const replaced = structuredClone(responses[1]); replaced.content[0].text = JSON.stringify({ ...terminal, summary: "Forged mutually consistent SDK and collected model reply" });
      const request = ipc.exchanges.find((exchange: any) => exchange.request.call_id === "model_0002").request;
      const saved = { request_digest: digest(JSON.stringify(request)).value, response_digest: digest(JSON.stringify(replaced)).value, response: replaced };
      collection.artifacts.find((artifact: any) => artifact.name === "model/model_0002/reply.json").reference = rawReference(root, Buffer.from(JSON.stringify(saved)), "agent_runtime_original_bytes", "model/model_0002/reply.json");
      const forgedEvents = structuredClone(events); forgedEvents.find((event: any) => event.type === "text").part.text = replaced.content[0].text;
      const stdout = Buffer.from(forgedEvents.map((event: any) => JSON.stringify(event)).join("\n") + "\n");
      collection.artifacts.find((artifact: any) => artifact.name === "stdout.raw").reference = rawReference(root, stdout, "agent_runtime_original_bytes", "stdout.raw");
      collection.ipc.correlation = correlateAgentWorkspaceSdkOriginals(ipc, stdout);
      expect(collection.ipc.correlation).toMatchObject({ uncorrelated_exchanges: 0, unmatched_sdk_calls: 0 });
    } })).toBeNull();
  });
  it("requires original model/tool causal order and rejects an early stop before the final response", () => {
    const renumber = () => ipc.exchanges.forEach((exchange: any, i: number) => exchange.ordinal = String(i + 1).padStart(4, "0"));
    expect(verify({ ipcChange: () => { [ipc.exchanges[0], ipc.exchanges[1]] = [ipc.exchanges[1], ipc.exchanges[0]]; renumber(); collection.ipc.correlation = correlateAgentWorkspaceSdkOriginals(ipc, Buffer.from(events.map(event => JSON.stringify(event)).join("\n") + "\n")); } })).toBeNull();
    expect(verify({ ipcChange: () => { [ipc.exchanges[1], ipc.exchanges[2]] = [ipc.exchanges[2], ipc.exchanges[1]]; renumber(); collection.ipc.correlation = correlateAgentWorkspaceSdkOriginals(ipc, Buffer.from(events.map(event => JSON.stringify(event)).join("\n") + "\n")); } })).toBeNull();
    responses[0] = { content: [{ type: "text", text: "Premature completion" }], usage: { input_tokens: 5, output_tokens: 5 }, finish: "stop" };
    events = events.filter(event => event.type !== "tool_use"); events.splice(1, 0, { ...structuredClone(events[3]), type: "text", part: { type: "text", text: "Premature completion", messageID: "message_tools", sessionID: "session_original" } });
    events.find(event => event.type === "step_finish").part.reason = "stop";
    expect(verify()).toBeNull();
  });
  it("rejects a stale read followed by a Windows case alias edit, even when all fixed checks pass after that edit", () => {
    const template = structuredClone(events[1]), before = digest("source").value, after = digest("edited").value;
    const add = (tool: string, modelId: string, path: string) => {
      const sdkId = "sdk_" + digest(JSON.stringify(["session_original", "message_tools", modelId])).value;
      const args = { path, expected_digest: before, ...(tool === "replace_file" ? { replacement_utf8: "edited" } : {}) }, name = tool === "read_file" ? "cimi_read" : "cimi_replace";
      const native = { before_digest: before, after_digest: tool === "read_file" ? before : after, text: tool === "read_file" ? "source" : "edited" };
      const receipt = { run_id: base.scope.run_id, call_id: sdkId, native };
      const request = { scope_digest: collection.scope_digest, call_id: sdkId, tool, ...args };
      const event = structuredClone(template); event.part.callID = modelId; event.part.tool = name; event.part.state = { status: "completed", input: args, output: JSON.stringify({ format: "cimiloop/opencode-workspace-output/1.0.0", call_id: sdkId, tool, path, ...native, replay: false, formal_agent_execution_enabled: false }) };
      return { sdkId, exchange: { ordinal: "", request, reply: { outcome: "completed", receipt, replay: false } }, event, content: { type: "tool-call", tool_call_id: modelId, tool_name: name, arguments: JSON.stringify(args) } };
    };
    const read = add("read_file", "model_read", "src/query.ts"), edit = add("replace_file", "model_edit", "src/QUERY.ts");
    ipc.exchanges.unshift(read.exchange, edit.exchange); ipc.exchanges.forEach((exchange: any, i: number) => exchange.ordinal = String(i + 1).padStart(4, "0"));
    events.splice(1, 0, read.event, edit.event); responses[0].content.unshift(read.content, edit.content);
    terminal.outputs[0].evidence_call_ids = [read.sdkId];
    // Explicitly assert the complete chain correlates; a rejected unrelated
    // or missing exchange must not masquerade as the stale-read counterexample.
    expect(correlateAgentWorkspaceSdkOriginals(ipc, Buffer.from(events.map(event => JSON.stringify(event)).join("\n")))).toMatchObject({ uncorrelated_exchanges: 0, unmatched_sdk_calls: 0 });
    expect(verify()).toBeNull();
    terminal.outputs[0].evidence_call_ids = [edit.sdkId]; expect(verify()).not.toBeNull();
  });
});
