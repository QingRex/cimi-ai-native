import { isDeepStrictEqual } from "node:util";
import { compileValidator, FixedMethodTranscriptSchema, type FixedMethodProfile, type FixedMethodTranscript } from "@cimiloop/protocol/v2";
import { FixedMethodConversationAdapter } from "./fixed-method.js";
import { prepareGatewayConversation, parseCachedGatewayConversationResponse, createGatewayConversationCacheContract, parseGatewayJson } from "./gateway-conversation.js";
import { digest, RuntimeAdapterError } from "./files.js";

const same = (a: unknown, b: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
const fail = (reason: string): never => { throw new RuntimeAdapterError(reason); };
type Input = { request_id: string; messages: { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }[] };
const sameHistoryMessage = (actual: Input["messages"][number], expected: Input["messages"][number]) => {
  if (same(actual, expected)) return true;
  // Pinned SDK renders the empty SSE assistant text as null when recording a
  // tool proposal. This exact empty/null pair has no visible content to drop.
  return expected.role === "assistant" && !!expected.tool_calls?.length && actual.role === "assistant" &&
    (actual.content === null && expected.content === "" || actual.content === "" && expected.content === null) &&
    same({ ...actual, content: expected.content }, expected);
};

// Replay from the first original conversation, never from an imported snapshot.
// This proves the read mapping/contract only. Runtime custody, real model origin,
// billing and method behavior remain separate trusted checks.
export function replayFixedMethodTranscript(profile: FixedMethodProfile, files: { path: string; content: string }[], raw: unknown, expectedPrompt?: string) {
  const transcript = compileValidator<FixedMethodTranscript>(FixedMethodTranscriptSchema)(structuredClone(raw));
  if (transcript.invocation_key !== profile.invocation_key || !same(transcript.source_digest, profile.source_digest) ||
    !same(transcript.request_digest, profile.request_digest) || !same(transcript.profile_digest, digest(JSON.stringify(profile)))) fail("fixed_method_transcript_pins_changed");
  const adapter = new FixedMethodConversationAdapter(profile, files, transcript.invocation_key), ids = new Set<string>();
  const original_requests: { input: unknown; response: unknown }[] = [];
  let previous: Input | undefined, expectedHistory: Input["messages"] | undefined;
  for (const [index, exchange] of transcript.exchanges.entries()) {
    const projection = adapter.project(exchange.sdk_input, transcript.mapping), input = projection.sdk;
    if (ids.has(input.request_id)) fail("fixed_method_transcript_request_repeated"); ids.add(input.request_id);
    if (!previous) {
      if (input.messages.some(message => !["system", "user"].includes(message.role))) fail("fixed_method_transcript_history_changed");
      // The pinned Windows launcher may preserve its JSON-encoded CLI argument
      // as the literal user message. Accept only that exact known encoding.
      if (expectedPrompt !== undefined && !input.messages.some(message => message.role === "user" &&
        (message.content === expectedPrompt || message.content === JSON.stringify(expectedPrompt)))) fail("fixed_method_transcript_prompt_changed");
    } else {
      if (!expectedHistory || input.messages.length !== expectedHistory.length || !input.messages.every((message, i) =>
        expectedHistory![i]!.role === "tool" && expectedHistory![i]!.content === null ? message.role === "tool" &&
          message.tool_call_id === expectedHistory![i]!.tool_call_id : sameHistoryMessage(message, expectedHistory![i]!))) fail("fixed_method_transcript_history_changed");
      const { request_id: _oldId, messages: _oldMessages, ...oldSettings } = previous;
      const { request_id: _newId, messages: _newMessages, ...newSettings } = input;
      if (!same(oldSettings, newSettings)) fail("fixed_method_transcript_settings_changed");
    }
    const prepared = prepareGatewayConversation(projection.input);
    const upstream = parseCachedGatewayConversationResponse(exchange.upstream_response,
      createGatewayConversationCacheContract(prepared.prepared, prepared.tools, prepared.prior_call_ids));
    const mapped = adapter.accept(upstream, projection);
    original_requests.push({ input: structuredClone(projection.input), response: structuredClone(upstream) });
    if (!same(mapped, exchange.mapped_response)) fail("fixed_method_transcript_mapping_changed");
    if (mapped.finish_reason === "stop") {
      if (index !== transcript.exchanges.length - 1) fail("fixed_method_transcript_after_completion");
    } else if (!mapped.tool_calls.length) fail("fixed_method_transcript_incomplete");
    expectedHistory = [...structuredClone(input.messages), { role: "assistant", content: mapped.text, tool_calls: structuredClone([...mapped.tool_calls]) },
      ...mapped.tool_calls.map(call => ({ role: "tool", tool_call_id: call.id, content: null }))];
    previous = structuredClone(input);
  }
  const proof = adapter.snapshot();
  if (proof.status !== "Succeeded") fail("fixed_method_transcript_incomplete");
  return { transcript, proof, original_requests };
}

export function verifyFixedMethodSdkEffects(replay: ReturnType<typeof replayFixedMethodTranscript>, stdout: Uint8Array, native: unknown) {
  if (stdout.byteLength > 2 * 1024 * 1024) fail("fixed_method_stdout_limit");
  const n = native as Record<string, unknown>;
  if (!n || Object.keys(n).sort().join(",") !== "exit_code,phase,pid,profile,reason" || !Number.isSafeInteger(n.pid) || Number(n.pid) < 1 ||
    typeof n.profile !== "string" || !/^CimiLoop\.[a-f0-9]{32}$/.test(n.profile) || n.phase !== "ended" || n.reason !== "exited" || n.exit_code !== 0) fail("fixed_method_native_completion_unproven");
  let source: string; try { source = new TextDecoder("utf-8", { fatal: true }).decode(stdout); } catch { return fail("fixed_method_sdk_utf8_unproven"); }
  const events = source.split(/\r?\n/).filter(Boolean).map(line => parseGatewayJson(line, 256 * 1024) as Record<string, any>);
  if (events.length > 512 || !events.length || events[0]!.event !== "sandbox.started" || events[0]!.pid !== n.pid || events[0]!.profile !== n.profile ||
    events.some(event => event.type === "error" || event.event && event.event !== "sandbox.started")) fail("fixed_method_sdk_completion_unproven");
  const sdk = events.filter(event => event.type), sessions = new Set(sdk.map(event => event.sessionID));
  if (sessions.size !== 1 || !/^ses_[A-Za-z0-9]+$/.test([...sessions][0]) || sdk.some(event => event.part?.sessionID !== event.sessionID)) fail("fixed_method_sdk_session_unproven");
  const calls = sdk.filter(event => event.type === "tool_use");
  if (calls.length !== replay.proof.calls.length) fail("fixed_method_sdk_effect_mismatch");
  for (const [index, call] of replay.proof.calls.entries()) {
    const matching = calls.filter(event => event.part?.callID === call.call_id), part = matching[0]?.part;
    if (matching.length !== 1 || calls[index]?.part?.callID !== call.call_id || part.tool !== "read" || part.state?.status !== "completed" ||
      Object.keys(part.state.input ?? {}).join(",") !== "filePath" || part.state.input.filePath !== call.sdk_file_path ||
      typeof part.state.output !== "string" || !same(digest(part.state.output), call.output_digest)) fail("fixed_method_sdk_effect_mismatch");
  }
  const last = sdk.at(-1), output = sdk.filter(event => event.type === "text").at(-1);
  if (last?.type !== "step_finish" || last.part?.reason !== "stop" || !output || !same(parseGatewayJson(output.part?.text), replay.proof.output) ||
    sdk.indexOf(output) <= sdk.indexOf(calls.at(-1)!)) fail("fixed_method_sdk_completion_unproven");
  return { session_id: [...sessions][0] as string, native_pid: Number(n.pid), native_profile: n.profile as string };
}
