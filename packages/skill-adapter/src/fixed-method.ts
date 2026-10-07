import { createHash } from "node:crypto";
import { compileValidator, NamedSkillMethodRequestSchema, FixedMethodProfileSchema, type NamedSkillMethodRequest,
  type FixedMethodProfile, type ExternalReference } from "@cimiloop/protocol/v2";
import { skillInvocationPlan } from "./invocation.js";
import { verifySkillPackageBytes, parseSkillMethodInput, type VerifiedSkillPackage } from "./package.js";

const digest = (value: string) => ({ algorithm: "sha256" as const, value: createHash("sha256").update(value).digest("hex") });
// Re-verify portable Git proof at this boundary; a caller-supplied inspection is
// not enough to authorize even a fixed read projection.
export const fixedMethodInvocationPlan = (inspection: VerifiedSkillPackage, raw: unknown, artifacts: { ref: ExternalReference; bytes: Uint8Array }[] = []) => {
  const verified = verifySkillPackageBytes(Buffer.from(JSON.stringify(inspection.package)), inspection.source_digest);
  const request = compileValidator<NamedSkillMethodRequest>(NamedSkillMethodRequestSchema)(structuredClone(raw));
  parseSkillMethodInput(request.input);
  const entry = verified.modules.find(module => module.path === verified.package.spec.entry_path)!;
  if (request.method_name !== entry.name || request.source_digest.value !== verified.source_digest.value ||
    !verified.package.spec.capabilities.some(capability => capability.capability_id === (request.input.purpose === "review" ? "verification.review" : "intent.clarify"))) throw new Error("Fixed method request source or capability mismatch");
  const legacy = skillInvocationPlan(verified, request.input, artifacts);
  const files = [{ path: "skill-request.json", content: JSON.stringify(request, null, 2) }, ...legacy.files.map(file =>
    ["skill-input.json", "skill-artifacts/index.json"].includes(file.path) ? { ...file, content: JSON.stringify(JSON.parse(file.content), null, 2) } : file)];
  const profile = compileValidator<FixedMethodProfile>(FixedMethodProfileSchema)({ format: "cimiloop/fixed-method-adapter/1.0.0",
    invocation_key: request.invocation_key, source_digest: verified.source_digest, request_digest: digest(JSON.stringify(request)), entry_name: entry.name,
    modules: verified.modules.map(module => ({ name: module.name, definition_path: `skill-source/${module.name}/SKILL.md`,
      dependencies: verified.package.spec.modules.find(item => item.path === module.path)!.dependencies.map(path => verified.modules.find(dependency => dependency.path === path)!.name) })),
    resources: files.map(file => ({ path: file.path, digest: digest(file.content), kind: file.path === "skill-request.json" ? "request" : file.path === "skill-input.json" ? "input" :
      file.path === "skill-artifacts/index.json" ? "artifact_index" : file.path.startsWith("skill-artifacts/") ? "artifact" : file.path.endsWith("/SKILL.md") ? "definition" : "reference" })) });
  return { request, profile, files, prompt: `CimiLoop named method ${request.method_name}, invocation ${request.invocation_key}, adapter ${profile.format}. ` +
    `The host exposes invoke_skill({name}) for the fixed entry and declared dependencies, and read_method_resource({path}) for the fixed request, input, references and artifacts. These explicitly map to native read effects; they do not run the builtin skill tool. ` +
    `Invoke ${entry.name} first. Read skill-request.json and skill-input.json, invoke all declared dependencies, and read all fixed resources before returning one strict ${request.input.purpose} SkillMethodOutput JSON object. ` +
    `Only questions, candidate content or findings may be proposed. Human Decisions, Task status and Gates are outside this method. If a required harness capability is unavailable, state the limitation. ` +
    (request.input.purpose === "clarification" ? 'Output: {purpose:"clarification",questions:string[],unresolved:string[],candidate?:ContractBody}.' :
      'Output: {purpose:"review",findings:[{axis:"spec"|"standards"|"verification",severity:"blocking"|"non_blocking"|"uncertain",observation:string,basis_refs:ExternalReference[]}],limitations:string[]}. Finding references must exactly match fixed input artifact_refs.') };
};
