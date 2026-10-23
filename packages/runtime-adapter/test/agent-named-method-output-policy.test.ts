import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
const originals = vi.hoisted(() => ({ identity: vi.fn(), operation: vi.fn(), method: vi.fn(), model: vi.fn(), ipc: vi.fn(), correlation: vi.fn(), job: vi.fn() }));
vi.mock("../src/agent-runtime-operation.js", async load => ({ ...await load<typeof import("../src/agent-runtime-operation.js")>(), readAgentRuntimeOriginalIdentity: originals.identity }));
vi.mock("../src/agent-workspace-sandbox-recovery.js", async load => ({ ...await load<typeof import("../src/agent-workspace-sandbox-recovery.js")>(), readOriginalAgentWorkspaceOperation: originals.operation }));
vi.mock("../src/agent-named-method-host.js", async load => ({ ...await load<typeof import("../src/agent-named-method-host.js")>(), readAgentNamedMethodOriginals: originals.method }));
vi.mock("../src/agent-runtime-model.js", async load => ({ ...await load<typeof import("../src/agent-runtime-model.js")>(), readAgentRuntimeModelOriginals: originals.model }));
vi.mock("../src/agent-workspace-ipc-journal.js", async load => ({ ...await load<typeof import("../src/agent-workspace-ipc-journal.js")>(), readAgentWorkspaceIpcOriginals: originals.ipc, correlateAgentWorkspaceSdkOriginals: originals.correlation }));
vi.mock("../src/agent-job-policy.js", async load => ({ ...await load<typeof import("../src/agent-job-policy.js")>(), readOriginalAgentJobObservation: originals.job }));
import { digest } from "../src/files.js";
import { readAgentRuntimeNamedMethodResult } from "../src/agent-named-method-result.js";

// PUBLIC independent-reader projections isolate cross-layer policy consumption.
// These fixtures are NOT actual Native, SDK, account, Skill or S1 evidence.
beforeEach(() => vi.resetAllMocks());
function fixture(nativeBounded: boolean, modelBounded: boolean, inputBounded = nativeBounded) {
  const root = mkdtempSync(join(tmpdir(), "cimiloop-method-policy-")), scope = { operation_key: "PUBLIC-method" }, operation = root;
  const profile = "bounded_2048/1.0.0", admission = digest("PUBLIC admission").value, prompt = "PUBLIC fixed method";
  const provider = (bounded: boolean) => ({ admission_digest: admission, ...(bounded ? { model_output_profile: profile } : {}) });
  const evidence = { kind: "codex_login/1.0.0", header_digest: digest("PUBLIC Codex backend").value };
  const header = { format: `cimiloop/agent-runtime-model-originals/${modelBounded ? 7 : 5}.0.0`, original_evidence: evidence, permitted: ["cimi_invoke_skill", "cimi_read_method_resource"], ...(modelBounded ? { output_profile: profile } : {}) };
  const bytes = Buffer.from(JSON.stringify(header)), modelHeader = { name: "header.json", path: join(root, "model-header.json"), digest: digest(bytes).value }; writeFileSync(modelHeader.path, bytes);
  const binding = { format: "PUBLIC fixed method binding" }, native = { format: "cimiloop/agent-workspace-sandbox/1.0.0", phase: "suspended", nonce: "PUBLIC nonce", supervisor: { pid: 13 }, peer: { pid: 14 }, appcontainer_sid: "PUBLIC SID", network_capability_sids: [], active_process_limit: 1 };
  const config = { format: `cimiloop/agent-workspace-sandbox-config/${nativeBounded ? 13 : 9}.0.0`, startup_profile: "bun_interpreter/1.0.0", provider_options: provider(nativeBounded), prompt, nonce: native.nonce, scope_digest: digest("PUBLIC scope").value, pipe_nonce: "PUBLIC pipe", method_original_binding: binding };
  const input = { prompt, provider_options: provider(inputBounded), model_original_binding: { format: "cimiloop/agent-model-original-binding/1.0.0", header_digest: modelHeader.digest, original_evidence: evidence } };
  const launch = { supervisor: native.supervisor }, resources = { phase: "ended", resources_disposed: true, runtime: native.peer };
  const request = { tool: "invoke_skill", call_id: "skill_1" }, receipt = { call_id: "skill_1", function_name: "invoke_skill", argument: "entry", resource_path: "skill-source/entry/SKILL.md" };
  const output = { purpose: "clarification", questions: ["Which business requirement?"], unresolved: [] }, text = JSON.stringify(output), args = { name: "entry" };
  const first = { call_id: "model_0001", request: { call_id: "model_0001", tool: "model_step" }, response: { content: [{ type: "tool-call", tool_call_id: "sdk_1", tool_name: "cimi_invoke_skill", arguments: JSON.stringify(args) }], finish: "tool_calls" } };
  const last = { call_id: "model_0002", request: { call_id: "model_0002", tool: "model_step" }, response: { content: [{ type: "text", text }], finish: "stop" } };
  const model = { status: "Observed", admission_digest: admission, task_packet_digest: digest(prompt).value, original_evidence: evidence, ...(modelBounded ? { output_profile: profile } : {}), calls: [first, last], artifacts: [modelHeader] };
  const cleanup = { format: native.format, phase: "ended", nonce: config.nonce, reason: "exited", exit_code: 0, resources_disposed: true, cleanup_errors: [], formal_agent_execution_enabled: false };
  const sdkEvent = (type: string, messageID: string, part: object) => ({ type, sessionID: "session_1", part: { sessionID: "session_1", messageID, ...part } });
  const stdout = [native, sdkEvent("step_start", "message_1", { type: "step-start" }), sdkEvent("tool_use", "message_1", { type: "tool", callID: "sdk_1", tool: "cimi_invoke_skill", state: { status: "completed", input: args } }), sdkEvent("step_finish", "message_1", { type: "step-finish", reason: "tool-calls" }),
    sdkEvent("step_start", "message_2", { type: "step-start" }), sdkEvent("text", "message_2", { type: "text", text }), sdkEvent("step_finish", "message_2", { type: "step-finish", reason: "stop" }), cleanup].map(value => JSON.stringify(value)).join("\n") + "\n";
  const records = { "original-config.json": config, "original-launcher.json": launch, "agent-sandbox-resources.json": resources, "agent-sandbox-original.json": native, "agent-sandbox-cleanup.json": cleanup,
    "result.json": { format: "cimiloop/opencode-workspace-runtime/1.0.0", original_scope_digest: config.scope_digest, operation, sandbox: native, method_original_binding: binding, native_exit: { code: 0, signal: null }, disposal: cleanup, source_bytes_unchanged: true, output_limit_exceeded: false } };
  for (const [name, value] of Object.entries(records)) writeFileSync(join(root, name), JSON.stringify(value)); writeFileSync(join(root, "stdout.raw"), stdout);
  originals.identity.mockReturnValue({ scope, operation, input }); originals.operation.mockReturnValue({ config, launch, resources }); originals.job.mockReturnValue(null);
  originals.method.mockReturnValue({ context: { profile: { entry_name: "entry", resources: [{ path: receipt.resource_path }] }, request: { input: { purpose: "clarification", requirement: "PUBLIC" } } }, calls: [{ request, receipt }], artifacts: [] });
  originals.model.mockReturnValue(model); originals.ipc.mockReturnValue({ status: "Observed", unresolved: 0, header: { endpoint: { model_admission_digest: admission, appcontainer_sid: native.appcontainer_sid, peer: native.peer, supervisor: native.supervisor } }, artifacts: [], exchanges: [
    { ordinal: 1, state: "reply_recorded", request: first.request, reply: { outcome: "completed", receipt: first.response, replay: false } },
    { ordinal: 2, state: "reply_recorded", request, reply: { outcome: "completed", receipt, replay: false } },
    { ordinal: 3, state: "reply_recorded", request: last.request, reply: { outcome: "completed", receipt: last.response, replay: false } }
  ] }); originals.correlation.mockReturnValue({ uncorrelated_exchanges: 0, unmatched_sdk_calls: 0, links: [{ correlated: true, ordinal: 2, sdk: { session_id: "session_1", message_id: "message_1" } }] });
  return () => readAgentRuntimeNamedMethodResult(root, scope, { profile: {}, files: [] });
}
it.each([false, true])("accepts a fully matched named Native/Host/input policy bounded=%s", bounded => { expect(fixture(bounded, bounded)()).toMatchObject({ status: "Observed", method_result_reverified: true }); });
it.each([[true, false, true], [false, true, false], [true, true, false], [false, false, true]])("keeps mismatched Native=%s/Host=%s/input=%s Unknown", (native, model, input) => {
  expect(fixture(native, model, input)()).toMatchObject({ status: "Unknown", method_result_reverified: false });
});
it("correlates parallel tool completions by original call identity rather than model array position", () => {
  const read = fixture(true, true), model = originals.model(), ipc = originals.ipc(), method = originals.method(), identity = originals.identity();
  const resource = "skill-input.json", args = { path: resource }, request = { tool: "read_method_resource", call_id: "skill_2" }, receipt = { call_id: "skill_2", function_name: "read_method_resource", argument: resource, resource_path: resource };
  model.calls[0].response.content.push({ type: "tool-call", tool_call_id: "sdk_2", tool_name: "cimi_read_method_resource", arguments: JSON.stringify(args) });
  method.context.profile.resources.push({ path: resource }); method.calls.push({ request, receipt });
  ipc.exchanges[2].ordinal = 4; ipc.exchanges.splice(2, 0, { ordinal: 3, state: "reply_recorded", request, reply: { outcome: "completed", receipt, replay: false } });
  originals.correlation().links.push({ correlated: true, ordinal: 3, sdk: { session_id: "session_1", message_id: "message_1" } });
  const path = join(identity.operation, "stdout.raw"), events = readFileSync(path, "utf8").trim().split("\n").map(line => JSON.parse(line));
  events.splice(2, 0, { type: "tool_use", sessionID: "session_1", part: { type: "tool", sessionID: "session_1", messageID: "message_1", callID: "sdk_2", tool: "cimi_read_method_resource", state: { status: "completed", input: args } } });
  writeFileSync(path, events.map(event => JSON.stringify(event)).join("\n") + "\n");
  expect(read()).toMatchObject({ status: "Observed", method_result_reverified: true, matched_calls: 2 });
});
