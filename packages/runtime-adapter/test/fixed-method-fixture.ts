import { randomUUID } from "node:crypto";
import type { FixedMethodProfile, NamedSkillMethodRequest, SkillMethodInput } from "@cimiloop/protocol/v2";
import { digest } from "../src/files.js";
import type { ProbeOperationInput } from "../src/operations.js";

// Constructed protocol fixtures; they do not establish Git source provenance or
// actual SDK/model behavior. The native integration test separately proves reads.
export const fixedMethodFixture = (input: SkillMethodInput = { purpose: "clarification", requirement: "Fixed", background: "Context", constraints: [] }) => {
  const request: NamedSkillMethodRequest = { format: "cimiloop/named-skill-method/1.0.0", invocation_key: "named_method_fixture", method_name: "entry", source_digest: digest("synthetic source"), input };
  const files = [{ path: "skill-source/entry/SKILL.md", content: "---\nname: entry\ndescription: Fixed\n---\nCall dependency.\n" },
    { path: "skill-source/dependency/SKILL.md", content: "---\nname: dependency\ndescription: Fixed dependency\n---\nAsk questions.\n" },
    { path: "skill-request.json", content: JSON.stringify(request, null, 2) }, { path: "skill-input.json", content: JSON.stringify(request.input, null, 2) },
    { path: "skill-source/dependency/references/format.md", content: "Fixed output format.\n" }];
  const profile: FixedMethodProfile = { format: "cimiloop/fixed-method-adapter/1.0.0", invocation_key: request.invocation_key, entry_name: request.method_name,
    source_digest: request.source_digest, request_digest: digest(JSON.stringify(request)), modules: [{ name: "entry", dependencies: ["dependency"], definition_path: files[0]!.path }, { name: "dependency", dependencies: [], definition_path: files[1]!.path }],
    resources: files.map(file => ({ path: file.path, digest: digest(file.content), kind: file.path.endsWith("/SKILL.md") ? "definition" : file.path === "skill-request.json" ? "request" : file.path === "skill-input.json" ? "input" : "reference" })) };
  const operation: ProbeOperationInput = { scope: "isolated_provider_probe", operation_key: request.invocation_key, mode: "read", prompt: "Synthetic named method fixture; no behavior qualification.", files, fixed_method_profile: profile, max_elapsed_ms: 40000 };
  return { request, files, profile, operation };
};
export const sdkInput = () => ({ request_id: randomUUID(), messages: [{ role: "user", content: "Synthetic method request." }] as Record<string, unknown>[],
  tools: [{ type: "function", function: { name: "read", description: "Pinned read", parameters: { type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"], additionalProperties: false } } }],
  response_mode: "json" as const, input_tokens: 65536, max_output_tokens: 128 });
export const nativeReadOutput = (filePath: string, content: string) => {
  const lines = content.split(/\r?\n/); if (lines.at(-1) === "") lines.pop();
  return `<path>${filePath}</path>\n<type>file</type>\n<content>\n` + lines.map((line, i) => `${i + 1}: ${line}`).join("\n") + `\n\n(End of file - total ${lines.length} lines)\n</content>`;
};
