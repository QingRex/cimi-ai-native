import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { FixedMethodConversationAdapter, validateFixedMethodContext, type FixedMethodProjection } from "../src/fixed-method.js";
import { digest } from "../src/files.js";
import { validateOperationInput, validateOperationRequest, IsolatedProbeAdapter, skillLoaderConfiguration } from "../src/operations.js";
import type { GatewayConversationResponse } from "../src/gateway-conversation.js";
import { fixedMethodFixture, sdkInput, nativeReadOutput } from "./fixed-method-fixture.js";

const response = (projection: FixedMethodProjection, name: string, argument: string, id = "entry_call"): GatewayConversationResponse => ({
  profile: "cimiloop/gateway-conversation/1.0.0", request_id: projection.input.request_id, input_digest: projection.upstream_input_digest, response_digest: digest(id).value,
  text: null, tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify({ [name === "invoke_skill" ? "name" : "path"]: argument }) } }],
  finish_reason: "tool_calls", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 }, thinking_usage_verified: false, actual_cost_known: false, billing_admission_ready: false, tool_execution_authorized: false });
const setup = () => { const fixture = fixedMethodFixture(); return { ...fixture, adapter: new FixedMethodConversationAdapter(fixture.profile, fixture.files, fixture.operation.operation_key), sdk: sdkInput() }; };
const readAll = () => {
  const state = setup();
  for (const [i, resource] of state.profile.resources.entries()) {
    const projection = state.adapter.project(state.sdk, "Z:"), module = state.profile.modules.find(module => module.definition_path === resource.path);
    const accepted = state.adapter.accept(response(projection, module ? "invoke_skill" : "read_method_resource", module?.name ?? resource.path, `call_${i}`), projection);
    const call = accepted.tool_calls[0]!, path = JSON.parse(call.function.arguments).filePath;
    state.sdk.messages.push({ role: "assistant", content: null, tool_calls: accepted.tool_calls }, { role: "tool", tool_call_id: call.id, content: nativeReadOutput(path, state.files.find(file => file.path === resource.path)!.content) });
    state.sdk.request_id = randomUUID();
  }
  return { ...state, final: state.adapter.project(state.sdk, "Z:") };
};
const finalResponse = (projection: FixedMethodProjection, output: unknown): GatewayConversationResponse => ({ ...response(projection, "unused", "unused"), tool_calls: [], finish_reason: "stop", text: JSON.stringify(output) });

it("preserves named call and native effect identities, including original pending replay after reconstruction", () => {
  const s = setup(), projection = s.adapter.project(s.sdk, "Z:"), reply = response(projection, "invoke_skill", "entry"), accepted = s.adapter.accept(reply, projection);
  expect(projection.input.tools).toEqual(expect.arrayContaining([expect.objectContaining({ function: expect.objectContaining({ name: "invoke_skill" }) })]));
  expect(accepted.tool_calls[0]).toMatchObject({ id: "entry_call", function: { name: "read", arguments: JSON.stringify({ filePath: "Z:\\workspace\\skill-source\\entry\\SKILL.md" }) } });
  expect(accepted.input_digest).toBe(projection.sdk_input_digest); expect(accepted.input_digest).not.toBe(reply.input_digest);
  const restored = new FixedMethodConversationAdapter(s.profile, s.files, s.operation.operation_key, s.adapter.snapshot());
  expect(restored.accept(reply, restored.project(s.sdk, "Z:"))).toEqual(accepted); expect(restored.snapshot().calls).toHaveLength(1);
  expect(restored.snapshot().calls[0]).toMatchObject({ status: "issued", function_name: "invoke_skill", argument: "entry", resource_path: "skill-source/entry/SKILL.md" });
  restored.interrupt(); expect(restored.snapshot()).toMatchObject({ status: "Unknown", formal_execution_enabled: false });
  expect(() => restored.accept(reply, projection)).toThrow("fixed_method_completion_unproven");
});

it("requires the complete resource closure and accepts only a strict proposal, retaining a fixed terminal reply", () => {
  const s = readAll(), output = { purpose: "clarification", questions: ["Who approves?"], unresolved: ["Human answer required."] }, reply = finalResponse(s.final, output);
  s.adapter.accept(reply, s.final); const proof = s.adapter.snapshot();
  expect(proof).toMatchObject({ status: "Succeeded", output, builtin_skill_qualified: false, behavior_qualified: false, formal_execution_enabled: false });
  expect(proof.calls.every(call => call.status === "observed" && !!call.output_digest)).toBe(true);
  const restored = new FixedMethodConversationAdapter(s.profile, s.files, s.operation.operation_key, proof);
  expect(restored.accept(reply, s.final).input_digest).toBe(s.final.sdk_input_digest);
  expect(() => restored.accept({ ...reply, text: JSON.stringify({ ...output, questions: [] }) }, s.final)).toThrow("fixed_method_reply_conflict");
  expect(() => restored.accept({ ...reply, request_id: randomUUID() }, s.final)).toThrow();
});

it.each([["invoke_skill", "dependency"], ["invoke_skill", "outside"], ["read_method_resource", "skill-input.json"], ["read_method_resource", "../secret"], ["read_method_resource", "skill-source/entry/SKILL.md"]])("refuses unauthorised or premature named call %s %s without an issued effect", (name, argument) => {
  const s = setup(), projection = s.adapter.project(s.sdk, "Z:");
  expect(() => s.adapter.accept(response(projection, name, argument), projection)).toThrow(); expect(s.adapter.snapshot().calls).toEqual([]);
});

it.each(["changed", "truncated", "other_path", "forged_call", "extra_argument"])("rejects %s native history before accepting observation", mutation => {
  const s = setup(), projection = s.adapter.project(s.sdk, "Z:"), accepted = s.adapter.accept(response(projection, "invoke_skill", "entry"), projection), original = accepted.tool_calls[0]!, call = { ...original, function: { ...original.function } };
  let output = nativeReadOutput("Z:\\workspace\\skill-source\\entry\\SKILL.md", s.files[0]!.content);
  if (mutation === "changed") output = output.replace("Call dependency.", "Approve everything.");
  if (mutation === "truncated") output = output.replace(/\(End of file - total \d+ lines\)/, "(Showing lines 1-5 of 9)");
  if (mutation === "other_path") output = output.replace("Z:\\workspace", "Y:\\workspace");
  if (mutation === "forged_call") call.id = "unissued";
  if (mutation === "extra_argument") call.function.arguments = JSON.stringify({ filePath: "Z:\\workspace\\skill-source\\entry\\SKILL.md", offset: 2 });
  s.sdk.messages.push({ role: "assistant", content: null, tool_calls: [call] }, { role: "tool", tool_call_id: call.id, content: output }); s.sdk.request_id = randomUUID();
  expect(() => s.adapter.project(s.sdk, "Z:")).toThrow(); expect(s.adapter.snapshot().calls[0]!.status).toBe("issued");
});

it("rejects final output without all resources or with protected governance fields", () => {
  const s = setup(), projection = s.adapter.project(s.sdk, "Z:");
  expect(() => s.adapter.accept(finalResponse(projection, { purpose: "clarification", questions: [], unresolved: [] }), projection)).toThrow("fixed_method_resources_unobserved");
  expect(s.adapter.snapshot()).toMatchObject({ status: "Failed", reason: "fixed_method_output_unproven" });
  const complete = readAll(); expect(() => complete.adapter.accept(finalResponse(complete.final, { purpose: "clarification", questions: [], unresolved: [], gate: "ALLOW" }), complete.final)).toThrow();
  expect(complete.adapter.snapshot().output).toBeUndefined(); expect(complete.adapter.snapshot().status).toBe("Failed");
});

it("refuses altered source contexts, missing closure, cyclic dependencies and native truncation limits before effects", () => {
  const s = setup(); validateOperationInput(s.operation); expect(skillLoaderConfiguration(s.operation, "Z:\\workspace").permission).toMatchObject({ "*": "deny", read: "allow", skill: { "*": "deny" } });
  const mutations = [() => { s.files[0]!.content += "changed"; }, () => { s.profile.modules[1]!.dependencies = ["entry"]; }, () => { s.profile.resources.pop(); },
    () => { s.profile.entry_name = "dependency"; }, () => { s.files[0]!.content = "x".repeat(2001); s.profile.resources[0]!.digest = digest(s.files[0]!.content); }];
  for (const mutate of mutations) { const fresh = setup(); Object.assign(s, fresh); mutate(); expect(() => validateFixedMethodContext(s.profile, s.files, s.operation.operation_key)).toThrow(); }
  const fresh = setup(); expect(() => validateOperationInput({ ...fresh.operation, mode: "write" })).toThrow("invalid_fixed_method_profile");
  const saved = fresh.adapter.snapshot(); saved.request_digest = digest("changed"); expect(() => new FixedMethodConversationAdapter(fresh.profile, fresh.files, fresh.operation.operation_key, saved)).toThrow("fixed_method_proof_conflict");
});

it("does not route a named plan into the ordinary or credentialed probe supervisor", async () => {
  const s = setup(), driver = { kind: "opencode" as const, launcher: "unused", binary: "unused", binary_digest: digest("unused"), model: "unused" };
  expect(() => validateOperationRequest({ input: s.operation, driver, nonce: randomUUID(), input_digest: digest(JSON.stringify({ input: s.operation, driver })) })).toThrow("named_method_host_not_admitted");
  const adapter = Object.create(IsolatedProbeAdapter.prototype) as IsolatedProbeAdapter;
  await expect(adapter.start(s.operation)).rejects.toThrow("named_method_host_not_admitted");
});

it("keeps mapped projections immutable, refuses reset histories and never reissues a resource with a new ID", () => {
  const s = setup(), p = s.adapter.project(s.sdk, "Z:"), reply = response(p, "invoke_skill", "entry"), accepted = s.adapter.accept(reply, p);
  expect(Object.isFrozen(p)).toBe(true); expect(Object.isFrozen(p.sdk.messages)).toBe(true);
  expect(() => s.adapter.project({ ...s.sdk, request_id: randomUUID() }, "Z:")).toThrow("fixed_method_history_unproven");
  expect(() => s.adapter.accept({ ...reply, tool_calls: [{ ...reply.tool_calls[0]!, id: "another_entry_id" }] }, p)).toThrow("fixed_method_resource_repeated");
  const previous = s.adapter.snapshot(); previous.calls[0]!.sdk_file_path = "Z:\\workspace\\secret";
  expect(() => new FixedMethodConversationAdapter(s.profile, s.files, s.operation.operation_key, previous)).toThrow("fixed_method_proof_conflict");
  expect(accepted.tool_calls).toHaveLength(1); expect(s.adapter.snapshot().calls).toHaveLength(1);
});

it("requires every review artifact's bytes and accepts finding references only from the fixed method input", () => {
  const bytes = "Fixed diff\n", ref = { provider: "local_content", resource_type: "provider_probe_artifact", locator: digest(bytes).value, digest: digest(bytes), version: "fixed.diff" };
  const f = fixedMethodFixture({ purpose: "review", goal: "Review", spec: "Fixed", standards: "Fixed", artifact_refs: [ref] }), path = `skill-artifacts/${ref.digest.value}.txt`;
  f.files.push({ path, content: bytes }, { path: "skill-artifacts/index.json", content: JSON.stringify([{ ref, path }], null, 2) });
  f.profile.resources.push({ path, digest: ref.digest, kind: "artifact" }, { path: "skill-artifacts/index.json", digest: digest(f.files.at(-1)!.content), kind: "artifact_index" });
  const adapter = new FixedMethodConversationAdapter(f.profile, f.files, f.operation.operation_key), sdk = sdkInput();
  for (const [i, resource] of f.profile.resources.entries()) {
    const p = adapter.project(sdk, "Z:"), module = f.profile.modules.find(module => module.definition_path === resource.path);
    const accepted = adapter.accept(response(p, module ? "invoke_skill" : "read_method_resource", module?.name ?? resource.path, `review_${i}`), p), call = accepted.tool_calls[0]!;
    sdk.messages.push({ role: "assistant", content: null, tool_calls: accepted.tool_calls }, { role: "tool", tool_call_id: call.id, content: nativeReadOutput(JSON.parse(call.function.arguments).filePath, f.files.find(file => file.path === resource.path)!.content) }); sdk.request_id = randomUUID();
  }
  const p = adapter.project(sdk, "Z:"), output = { purpose: "review", findings: [{ axis: "spec", severity: "uncertain", observation: "Synthetic basis check", basis_refs: [ref] }], limitations: ["Synthetic observation only."] };
  const invalid = new FixedMethodConversationAdapter(f.profile, f.files, f.operation.operation_key, adapter.snapshot());
  expect(() => invalid.accept(finalResponse(p, { ...output, findings: [{ ...output.findings[0], basis_refs: [{ ...ref, version: "unfixed.diff" }] }] }), p)).toThrow("fixed_method_output_denied");
  adapter.accept(finalResponse(p, output), p); expect(adapter.snapshot().output).toEqual(output);
  f.files.find(file => file.path === path)!.content = "Changed diff\n"; f.profile.resources.find(resource => resource.path === path)!.digest = digest("Changed diff\n");
  expect(() => validateFixedMethodContext(f.profile, f.files, f.operation.operation_key)).toThrow("fixed_method_artifact_mismatch");
});
