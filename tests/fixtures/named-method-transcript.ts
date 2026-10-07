import { randomUUID } from "node:crypto";
import type { FixedMethodProfile, FixedMethodTranscript, SkillMethodOutput } from "../../packages/protocol/src/v2/index.js";
import { FixedMethodConversationAdapter } from "../../packages/runtime-adapter/src/fixed-method.js";
import { prepareGatewayConversation, parseGatewayConversation } from "../../packages/runtime-adapter/src/gateway-conversation.js";
import { digest } from "../../packages/runtime-adapter/src/files.js";
import { sdkInput, nativeReadOutput } from "../../packages/runtime-adapter/test/fixed-method-fixture.js";

// Constructed conversations and SDK events, not an actual SDK/model/bill run.
export function constructedNamedTranscript(profile: FixedMethodProfile, files: { path: string; content: string }[], output: SkillMethodOutput, prompt?: string, emptyAssistantText = false) {
  const adapter = new FixedMethodConversationAdapter(profile, files, profile.invocation_key), sdk = sdkInput();
  if (prompt) sdk.messages[0]!.content = prompt;
  const transcript: FixedMethodTranscript = { format: "cimiloop/fixed-method-transcript/1.0.0", invocation_key: profile.invocation_key, mapping: "Z:",
    source_digest: profile.source_digest, request_digest: profile.request_digest, profile_digest: digest(JSON.stringify(profile)), exchanges: [] };
  const sessionID = "ses_" + randomUUID().replaceAll("-", ""), native = { pid: 123, profile: "CimiLoop." + randomUUID().replaceAll("-", ""), phase: "ended", reason: "exited", exit_code: 0 };
  const events: unknown[] = [{ event: "sandbox.started", pid: native.pid, profile: native.profile }];
  const gateway_inputs: unknown[] = [], raw_responses: Buffer[] = [];
  const orderedModules: FixedMethodProfile["modules"] = [];
  const order = (name: string) => { if (orderedModules.some(module => module.name === name)) return; const module = profile.modules.find(module => module.name === name)!;
    orderedModules.push(module); module.dependencies.forEach(order); };
  order(profile.entry_name);
  const orderedResources = [...orderedModules.map(module => profile.resources.find(resource => resource.path === module.definition_path)!),
    ...profile.resources.filter(resource => resource.kind !== "definition")];
  for (const [i, resource] of [...orderedResources, undefined].entries()) {
    const projection = adapter.project(sdk, "Z:"), module = profile.modules.find(module => module.definition_path === resource?.path);
    const fn = module ? { name: "invoke_skill", arguments: JSON.stringify({ name: module.name }) } : { name: "read_method_resource", arguments: JSON.stringify({ path: resource?.path }) };
    const raw = Buffer.from(JSON.stringify({ id: "fixture_" + i, model: "glm-5.3", request_id: sdk.request_id,
      choices: [{ index: 0, message: resource ? { role: "assistant", content: emptyAssistantText ? "" : null, tool_calls: [{ id: "call_" + i, type: "function", function: fn }] } :
        { role: "assistant", content: JSON.stringify(output) }, finish_reason: resource ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
    const prepared = prepareGatewayConversation(projection.input);
    gateway_inputs.push(structuredClone(projection.input)); raw_responses.push(Buffer.from(raw));
    const upstream = parseGatewayConversation(raw, prepared.prepared, prepared.tools, prepared.prior_call_ids, "PUBLIC_TEST_SECRET_NOT_PRESENT");
    const mapped = adapter.accept(upstream, projection);
    transcript.exchanges.push({ sdk_input: structuredClone(sdk), upstream_response: structuredClone(upstream), mapped_response: structuredClone(mapped) });
    if (resource) {
      const call = mapped.tool_calls[0]!, filePath = JSON.parse(call.function.arguments).filePath, content = nativeReadOutput(filePath, files.find(file => file.path === resource.path)!.content);
      sdk.messages.push({ role: "assistant", content: null, tool_calls: mapped.tool_calls }, { role: "tool", tool_call_id: call.id, content });
      events.push({ type: "tool_use", sessionID, part: { sessionID, callID: call.id, tool: "read", state: { status: "completed", input: { filePath }, output: content } } });
      sdk.request_id = randomUUID();
    } else {
      events.push({ type: "text", sessionID, part: { sessionID, text: JSON.stringify(output) } }, { type: "step_finish", sessionID, part: { sessionID, reason: "stop" } });
    }
  }
  return { transcript, native, stdout: Buffer.from(events.map(event => JSON.stringify(event)).join("\n") + "\n"), events, sessionID, gateway_inputs, raw_responses };
}
