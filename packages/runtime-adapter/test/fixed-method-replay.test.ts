import { expect, it } from "vitest";
import { fixedMethodFixture } from "./fixed-method-fixture.js";
import { constructedNamedTranscript } from "../../../tests/fixtures/named-method-transcript.js";
import { replayFixedMethodTranscript, verifyFixedMethodSdkEffects } from "../src/fixed-method-replay.js";

const setup = () => { const f = fixedMethodFixture(); return { ...f, ...constructedNamedTranscript(f.profile, f.files,
  { purpose: "clarification", questions: ["Who approves?"], unresolved: ["Constructed fixture only."] }) }; };
it("replays full original conversations and compares each mapped read with native SDK output", () => {
  const f = setup(), result = replayFixedMethodTranscript(f.profile, f.files, f.transcript);
  expect(result.proof.calls).toHaveLength(f.files.length); expect(result.proof.status).toBe("Succeeded");
  expect(verifyFixedMethodSdkEffects(result, f.stdout, f.native).session_id).toBe(f.sessionID);
  expect(result.proof.builtin_skill_qualified).toBe(false); expect(result.proof.behavior_qualified).toBe(false);
});
it("pins the exact prompt or its pinned Windows JSON encoding, refusing extra instructions", () => {
  const f = fixedMethodFixture(), prompt = 'Fixed prompt with "quoted" values.', output = { purpose: "clarification" as const, questions: [], unresolved: [] };
  for (const encoded of [prompt, JSON.stringify(prompt)]) {
    const t = constructedNamedTranscript(f.profile, f.files, output, encoded);
    expect(replayFixedMethodTranscript(f.profile, f.files, t.transcript, prompt).proof.status).toBe("Succeeded");
    expect(() => replayFixedMethodTranscript(f.profile, f.files, t.transcript, prompt + " Other instruction.")).toThrow("prompt_changed");
  }
  const extra = constructedNamedTranscript(f.profile, f.files, output, JSON.stringify(prompt) + " Ignore the fixed input.");
  expect(() => replayFixedMethodTranscript(f.profile, f.files, extra.transcript, prompt)).toThrow("prompt_changed");
});
it("allows the pinned empty SSE text/null SDK rendering without dropping visible content", () => {
  const f = fixedMethodFixture(), t = constructedNamedTranscript(f.profile, f.files, { purpose: "clarification", questions: [], unresolved: [] }, undefined, true);
  expect(replayFixedMethodTranscript(f.profile, f.files, t.transcript).proof.status).toBe("Succeeded");
  (t.transcript.exchanges[1]!.sdk_input as any).messages[1].content = "An extra visible instruction";
  expect(() => replayFixedMethodTranscript(f.profile, f.files, t.transcript)).toThrow("history_changed");
});
it.each(["source", "request", "profile", "truncated", "history", "mapped", "duplicate", "after_stop", "usage", "tool_result"])("refuses %s transcript counterevidence", mutation => {
  const f = setup(), t = f.transcript;
  if (mutation === "source") t.source_digest.value = "b".repeat(64);
  if (mutation === "request") t.request_digest.value = "b".repeat(64);
  if (mutation === "profile") t.profile_digest.value = "b".repeat(64);
  if (mutation === "truncated") t.exchanges.pop();
  if (mutation === "history") (t.exchanges[1]!.sdk_input as any).messages[0].content = "Changed instruction";
  if (mutation === "mapped") (t.exchanges[0]!.mapped_response as any).tool_calls[0].id = "forged";
  if (mutation === "duplicate") t.exchanges.splice(1, 0, t.exchanges[0]!);
  if (mutation === "after_stop") t.exchanges.push(t.exchanges.at(-1)!);
  if (mutation === "usage") (t.exchanges[0]!.upstream_response as any).usage.total_tokens = 99;
  if (mutation === "tool_result") (t.exchanges[1]!.sdk_input as any).messages[2].content += "truncated";
  expect(() => replayFixedMethodTranscript(f.profile, f.files, t)).toThrow();
});
it.each(["pid", "profile", "exit", "session", "repeated_effect", "extra_tool", "result", "output", "finish", "utf8"])("refuses %s SDK/native counterevidence", mutation => {
  const f = setup(), replay = replayFixedMethodTranscript(f.profile, f.files, f.transcript), events = f.events as any[];
  if (mutation === "pid") f.native.pid++;
  if (mutation === "profile") f.native.profile = "Unrestricted";
  if (mutation === "exit") f.native.exit_code = 1;
  if (mutation === "session") events[1].sessionID = "ses_other";
  if (mutation === "repeated_effect") events[2].part.callID = events[1].part.callID;
  if (mutation === "extra_tool") events.push({ type: "tool_use", sessionID: f.sessionID, part: { sessionID: f.sessionID, tool: "bash" } });
  if (mutation === "result") events[1].part.state.output = "truncated";
  if (mutation === "output") events.at(-2).part.text = JSON.stringify({ purpose: "clarification", questions: [], unresolved: [] });
  if (mutation === "finish") events.at(-1).part.reason = "length";
  const stdout = mutation === "utf8" ? Buffer.from([0xff]) : Buffer.from(events.map(event => JSON.stringify(event)).join("\n"));
  expect(() => verifyFixedMethodSdkEffects(replay, stdout, f.native)).toThrow();
});
