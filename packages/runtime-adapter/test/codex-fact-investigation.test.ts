import { describe, it, expect } from "vitest";
import * as runtime from "../src/index.js";

// Constructed transport receipts and fixed source bytes, not a real model,
// source snapshot qualification, Native evidence or a business verdict.
describe("Codex delegated original fact investigation", () => {
  function fixture(mode = "normal",ordinaryQuotaAccountDigest?:string) {
    const source = [{ path: "src/rules.ts", content: "PUBLIC: Kernel alone confirms business decisions." }];
    const originals = new Map<string, any>(), requests = new Map<string, any>(); let effects = 0, loaded = "";
    const transport = {
      async execute(request: any, tool: any, guard: any) {
        guard(); const prior = requests.get(request.operation_key);
        if (prior && JSON.stringify(prior) !== JSON.stringify(request)) throw Error("PUBLIC input changed");
        if (originals.has(request.operation_key)) return structuredClone(originals.get(request.operation_key));
        requests.set(request.operation_key, structuredClone(request)); effects++;
        const calls = [];
        if (mode !== "unread") {
          const args = { path: mode === "escape" ? "../auth.json" : "src/rules.ts" };
          loaded = await tool("read_fact", args);
          calls.push({ call_id: "PUBLIC read", tool: "read_fact", arguments: args, output: loaded });
        }
        const value = { operation_key: request.operation_key, model: "gpt-6-luna", input_digest: runtime.digest(JSON.stringify(request)).value,
          thread_id: "PUBLIC child", turn_id: "PUBLIC child turn", account_digest: runtime.digest("PUBLIC account").value,
          tool_calls: calls, output_text: JSON.stringify({ observations: [{ path: "src/rules.ts", observation: "Kernel owns business decisions." }], unresolved: [] }),
          original_ref: { provider: "codex_app_server", resource_type: "skill_invocation_proof", locator: "PUBLIC child originals", digest: runtime.digest("PUBLIC retained child") } };
        originals.set(request.operation_key, value); return structuredClone(value);
      },
      readOriginal(request: any) {
        if (!originals.has(request.operation_key)) return null;
        if (JSON.stringify(requests.get(request.operation_key)) !== JSON.stringify(request)) throw Error("PUBLIC input changed");
        return structuredClone(originals.get(request.operation_key));
      }
    };
    const Constructor = Reflect.get(runtime, "CodexFactInvestigator"); expect(Constructor).toBeTypeOf("function");
    const investigator: any = new Constructor(transport, "gpt-6-luna", source, runtime.digest("PUBLIC source identity").value,ordinaryQuotaAccountDigest);
    const parent = { operation_key: "PUBLIC_parent", profile_digest: runtime.digest("PUBLIC profile").value, request_digest: runtime.digest("PUBLIC method request").value,
      model: "gpt-6-luna", account_digest: runtime.digest("PUBLIC account").value };
    return { investigator, parent, originals, requests, source, effects: () => effects, loaded: () => loaded };
  }
  it('fixes the prospective child quota account while preserving legacy child requests',()=>{
    const old=fixture(),current=fixture('normal','a'.repeat(64)),args={question:'PUBLIC environmental fact?'};
    expect(old.investigator.originalRequest(old.parent,'fact_1',args)).not.toHaveProperty('usage_policy');
    expect(current.investigator.originalRequest(current.parent,'fact_1',args)).toMatchObject({usage_policy:'require_ordinary_permission/1.0.0',quota_account_digest:'a'.repeat(64)});
    expect(()=>fixture('normal','invalid')).toThrow();expect(current.effects()).toBe(0);
  });
  it("keeps a separate original child bound to its parent and call, with fixed read evidence", async () => {
    const f = fixture(), args = { question: "Who confirms a business decision?" };
    const result = await f.investigator.execute(f.parent, "PUBLIC_call", args, () => {});
    expect(result.output.observations[0].path).toBe("src/rules.ts");
    expect(result.original.operation_key).not.toBe(f.parent.operation_key);
    expect(f.investigator.readOriginal(f.parent, "PUBLIC_call", args)).toEqual(result);
    await f.investigator.execute(f.parent, "PUBLIC_call", args, () => {}); expect(f.effects()).toBe(1);
  });
  it("does not give a reused child call a new identity when its question changes", async () => {
    const f = fixture(); await f.investigator.execute(f.parent, "PUBLIC_call", { question: "First?" }, () => {});
    await expect(f.investigator.execute(f.parent, "PUBLIC_call", { question: "Changed?" }, () => {})).rejects.toThrow();
    expect(f.effects()).toBe(1);
  });
  it.each(["escape", "unread"])("refuses %s facts or unobserved file references", async mode => {
    const f = fixture(mode);
    await expect(f.investigator.execute(f.parent, "PUBLIC_call", { question: "What is the rule?" }, () => {})).rejects.toThrow();
  });
  it("pins the supplied facts and rejects a modified original child read", async () => {
    const f = fixture(), args = { question: "What is the rule?" };
    f.source[0]!.content = "PUBLIC changed after installation";
    const result = await f.investigator.execute(f.parent, "PUBLIC_call", args, () => {});
    expect(f.loaded()).toBe("PUBLIC: Kernel alone confirms business decisions.");
    f.originals.get(result.original.operation_key).tool_calls[0].output = "PUBLIC forged source";
    expect(() => f.investigator.readOriginal(f.parent, "PUBLIC_call", args)).toThrow();
  });
  it("does not treat missing historical children as successful fact investigations", async () => {
    const f = fixture(), args = { question: "What is the rule?" };
    const result = await f.investigator.execute(f.parent, "PUBLIC_call", args, () => {});
    f.originals.delete(result.original.operation_key);
    expect(f.investigator.readOriginal(f.parent, "PUBLIC_call", args)).toBeNull();
    expect(f.effects()).toBe(1);
  });
  it("rejects accidental asynchronous admission before starting the child", async () => {
    const f = fixture();
    await expect(f.investigator.execute(f.parent, "PUBLIC_call", { question: "What is the rule?" }, async () => {})).rejects.toThrow();
    expect(f.effects()).toBe(0);
  });
});
