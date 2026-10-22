import { describe, it, expect } from "vitest";
import * as runtime from "../src/index.js";
import { fixedMethodFixture } from "./fixed-method-fixture.js";

// Public, constructed receipts only; no upstream Skill or real model evidence.
describe("Codex fixed clarification method projection", () => {
  function fixture(frontier = false) {
    const f = fixedMethodFixture(), loaded: any[] = [];
    const original: any = { operation_key: f.profile.invocation_key, input_digest: "PUBLIC transport", thread_id: "PUBLIC thread", turn_id: "PUBLIC turn", model: "gpt-6-luna",
      tool_calls: loaded, usage: { inputTokens: 1, outputTokens: 1 }, output_text: JSON.stringify({ purpose: "clarification", questions: ["PUBLIC next decision? 建议：验证可观察结果。", ...(frontier ? ["PUBLIC independent decision? 建议：保留固定边界。"] : [])], unresolved: [] }),
      original_ref: { provider: "codex_app_server", resource_type: "skill_invocation_proof", locator: "PUBLIC fixed original", digest: runtime.digest("PUBLIC original") } };
    let invokes = 0;
    const transport = {
      async execute(request: any, tool: any, guard: any) {
        invokes++; guard(); original.input_digest = runtime.digest(JSON.stringify(request)).value;
        for (const resource of f.profile.resources) {
          const args = resource.kind === "definition" ? { name: f.profile.modules.find(module => module.definition_path === resource.path)!.name } : { path: resource.path };
          const name = resource.kind === "definition" ? "invoke_skill" : "read_method_resource";
          loaded.push({ call_id: String(loaded.length), tool: name, arguments: args, output: await tool(name, args) });
        }
        const args = { questions: [{ question: "PUBLIC next decision?", recommendation: "验证可观察结果。" }, ...(frontier ? [{ question: "PUBLIC independent decision?", recommendation: "保留固定边界。" }] : [])] };
        loaded.push({ call_id: "interview", tool: "ask_human_round", arguments: args, output: await tool("ask_human_round", args) });
        return structuredClone(original);
      },
      readOriginal() { return loaded.length ? structuredClone(original) : null; }
    };
    const Constructor = Reflect.get(runtime, "CodexFixedClarificationMethod"); expect(Constructor).toBeTypeOf("function");
    const host: any = new Constructor(transport, "gpt-6-luna");
    return { ...f, host, original, loaded, invokes: () => invokes };
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
