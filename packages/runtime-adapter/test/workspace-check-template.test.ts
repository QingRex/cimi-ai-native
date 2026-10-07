import { describe, expect, it } from "vitest";
import { digest } from "../src/files.js";
import { parseWorkspaceCheckTemplate } from "../src/workspace-checks.js";
const template = () => ({ check_id: "query_test", profile: "node_test", entry: "src/check.mjs", inputs: [{ path: "src/check.mjs", expected_digest: digest("fixed harness").value }, { path: "src/query.ts" }], max_elapsed_ms: 30000, max_output_bytes: 32768 });
describe("trusted fresh workspace check templates", () => {
  it("allows actual workspace digests only for non-entry inputs and detaches the original definition", () => {
    const raw = template(), original = parseWorkspaceCheckTemplate(raw); raw.inputs[1]!.path = "foreign.ts";
    expect(original.inputs).toEqual([{ path: "src/check.mjs", expected_digest: digest("fixed harness").value }, { path: "src/query.ts" }]);
    const unfixed = template(); delete unfixed.inputs[0]!.expected_digest;
    expect(() => parseWorkspaceCheckTemplate(unfixed)).toThrow("workspace_check_fixed_entry_required");
  });
  it("rejects executable definitions, unknown fields, path aliases and unbounded profiles", () => {
    const raw = template(); Object.defineProperty(raw, "entry", { enumerable: true, get() { throw Error("Getter must not run"); } });
    expect(() => parseWorkspaceCheckTemplate(raw)).toThrow("tool_contract_invalid");
    for (const path of [".git/check.mjs", "src/../check.mjs", "C:/check.mjs", "src/NUL", "src/query.ts.", "src\\query.ts"])
      expect(() => parseWorkspaceCheckTemplate({ ...template(), inputs: [...template().inputs, { path }] })).toThrow("workspace_check_template_invalid");
    for (const patch of [{ shell: "node" }, { profile: "shell" }, { max_elapsed_ms: 30001 }, { max_output_bytes: 131073 }])
      expect(() => parseWorkspaceCheckTemplate({ ...template(), ...patch })).toThrow("workspace_check_template_invalid");
    expect(() => parseWorkspaceCheckTemplate({ ...template(), inputs: [...template().inputs, { path: "SRC/QUERY.TS" }] })).toThrow("workspace_check_template_invalid");
  });
});
