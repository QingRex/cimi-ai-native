import { describe, it, expect } from "vitest";
import * as runtime from "../src/index.js";
import { fixedMethodFixture } from "./fixed-method-fixture.js";

// Public, constructed receipts only; no upstream Skill or real model evidence.
describe("Codex fixed clarification method projection", () => {
  function fixture(frontier = false, delegated = false, maximumQuestions = 16, applicationContext?: string) {
    const f = fixedMethodFixture(), loaded: any[] = [];
    const original: any = { operation_key: f.profile.invocation_key, input_digest: "PUBLIC transport", thread_id: "PUBLIC thread", turn_id: "PUBLIC turn", model: "gpt-6-luna",
      tool_calls: loaded, usage: { inputTokens: 1, outputTokens: 1 }, output_text: JSON.stringify({ purpose: "clarification", questions: ["PUBLIC next decision? 建议：验证可观察结果。", ...(frontier ? ["PUBLIC independent decision? 建议：保留固定边界。"] : [])], unresolved: [] }),
      original_ref: { provider: "codex_app_server", resource_type: "skill_invocation_proof", locator: "PUBLIC fixed original", digest: runtime.digest("PUBLIC original") } };
    original.account_digest = runtime.digest("PUBLIC account").value;
    let invokes = 0, delegatedInvokes = 0;
    const children = new Map<string, any>();
    const facts = {
      snapshot: () => ({ format: "cimiloop/codex-fact-snapshot/1.0.0" as const, source_identity: runtime.digest("PUBLIC source").value, files: [{ path: "src/rules.ts", digest: runtime.digest("PUBLIC rule"), bytes: 11 }], digest: runtime.digest("PUBLIC snapshot").value }),
      async execute(parent: any, callId: string, args: any, guard: any, signal?: AbortSignal) {
        guard(); expect(signal?.aborted).toBe(false); delegatedInvokes++;
        const value: any = { parent, call_id: callId, output: { observations: [{ path: "src/rules.ts", observation: "PUBLIC rule" }], unresolved: [] }, text: "PUBLIC original child facts",
          original: { account_digest: original.account_digest, model: "gpt-6-luna", original_ref: { provider: "codex_app_server", resource_type: "skill_invocation_proof", locator: "PUBLIC child original", digest: runtime.digest("PUBLIC child") } } };
        children.set(callId, value); return value;
      },
      readOriginal(_parent: any, callId: string) { return children.get(callId) ?? null; }
    };
    const transport = {
      async execute(request: any, tool: any, guard: any) {
        invokes++; guard(); original.input_digest = runtime.digest(JSON.stringify(request)).value;
        for (const resource of f.profile.resources) {
          const args = resource.kind === "definition" ? { name: f.profile.modules.find(module => module.definition_path === resource.path)!.name } : { path: resource.path };
          const name = resource.kind === "definition" ? "invoke_skill" : "read_method_resource";
          loaded.push({ call_id: String(loaded.length), tool: name, arguments: args, output: await tool(name, args) });
        }
        if (applicationContext) loaded.push({ call_id: "context", tool: "read_clarification_context", arguments: {}, output: await tool("read_clarification_context", {}) });
        if (delegated) {
          const args = { question: "Which rule controls business decisions?" };
          const output = await tool("delegate_facts", args, { call_id: "PUBLIC_child_call", thread_id: original.thread_id, turn_id: original.turn_id, model: original.model, account_digest: original.account_digest, signal: new AbortController().signal, beforeEffect: guard });
          loaded.push({ call_id: "PUBLIC_child_call", tool: "delegate_facts", arguments: args, output });
        }
        const args = { questions: [{ question: "PUBLIC next decision?", recommendation: "验证可观察结果。" }, ...(frontier ? [{ question: "PUBLIC independent decision?", recommendation: "保留固定边界。" }] : [])] };
        loaded.push({ call_id: "interview", tool: "ask_human_round", arguments: args, output: await tool("ask_human_round", args) });
        return structuredClone(original);
      },
      readOriginal() { return loaded.length ? structuredClone(original) : null; }
    };
    const Constructor = Reflect.get(runtime, "CodexFixedClarificationMethod"); expect(Constructor).toBeTypeOf("function");
    const host: any = new Constructor(transport, "gpt-6-luna", { ...(delegated ? { facts } : {}), maximum_questions: maximumQuestions, ...(applicationContext ? { application_context: applicationContext } : {}) });
    return { ...f, host, original, loaded, children, invokes: () => invokes, delegatedInvokes: () => delegatedInvokes };
  }
  it("executes named entry and dependencies, reads all fixed resources, and returns one Human question", async () => {
    const f = fixture(), result = await f.host.execute(f.profile, f.files, () => {});
    expect(result.output.questions).toEqual(["PUBLIC next decision? 建议：验证可观察结果。"]);
    expect(result.method_name).toBe("entry"); expect(result.source_digest).toEqual(f.profile.source_digest);
    expect(f.host.readOriginal(f.profile, f.files)).toEqual(result);
  });
  it("preserves the pinned Skill frontier round containing multiple independent Human decisions", async () => {
    const f = fixture(true), result = await f.host.execute(f.profile, f.files, () => {});
    expect(result.output.questions).toHaveLength(2);
    expect(result.output.questions[1]).toBe("PUBLIC independent decision? 建议：保留固定边界。");
  });
  it("requires the complete bound application context and rejects changed context on original replay", async () => {
    const context = JSON.stringify({ human_answers: ["PUBLIC actual Human answer"], original_change: "PUBLIC original Change" });
    const f = fixture(false, false, 16, context); await f.host.execute(f.profile, f.files, () => {});
    expect(f.loaded.find((call: any) => call.tool === "read_clarification_context")?.output).toBe(context);
    expect(f.host.readOriginal(f.profile, f.files)).not.toBeNull();
    f.loaded.find((call: any) => call.tool === "read_clarification_context").output = "PUBLIC missing actual answer";
    expect(() => f.host.readOriginal(f.profile, f.files)).toThrow();
  });
  it("delegates a fixed fact question and rechecks the original child when rereading the parent", async () => {
    const f = fixture(false, true), result = await f.host.execute(f.profile, f.files, () => {});
    expect(f.delegatedInvokes()).toBe(1); expect(result.fact_investigations).toHaveLength(1);
    f.children.clear();
    expect(() => f.host.readOriginal(f.profile, f.files)).toThrow();
    expect(f.delegatedInvokes()).toBe(1);
  });
  it("rejects a delegated child from another account", async () => {
    const f = fixture(false, true); await f.host.execute(f.profile, f.files, () => {});
    f.children.get("PUBLIC_child_call").original.account_digest = runtime.digest("PUBLIC other account").value;
    expect(() => f.host.readOriginal(f.profile, f.files)).toThrow();
  });
  it("enforces the available Human question capacity before accepting a larger frontier", async () => {
    const f = fixture(true, false, 1);
    await expect(f.host.execute(f.profile, f.files, () => {})).rejects.toThrow();
  });
  it.each(["missing-source", "changed-output", "wrong-model", "fake-human"])("rejects %s rather than trusting a final JSON claim", async mode => {
    const f = fixture(); await f.host.execute(f.profile, f.files, () => {});
    if (mode === "missing-source") f.loaded.splice(1, 1);
    if (mode === "changed-output") f.loaded[0].output += "PUBLIC changed source";
    if (mode === "wrong-model") f.original.model = "other-model";
    if (mode === "fake-human") f.original.output_text = JSON.stringify({ purpose: "clarification", questions: ["PUBLIC fabricated question"], unresolved: [] });
    expect(() => f.host.readOriginal(f.profile, f.files)).toThrow();
  });
  it("rejects changed fixed inputs before invoking a model", async () => {
    const f = fixture(); f.files[0]!.content += "changed";
    await expect(f.host.execute(f.profile, f.files, () => {})).rejects.toThrow(); expect(f.invokes()).toBe(0);
  });
});
