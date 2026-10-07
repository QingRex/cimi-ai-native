import { compileValidator, SkillRuntimeProfileSchema, type SkillRuntimeProfile, type ExternalReference } from "@cimiloop/protocol/v2";
import { createHash } from "node:crypto";
import { parseSkillMethodInput, type VerifiedSkillPackage } from "./package.js";

// These files and the explicit profile are immutable operation inputs. No
// bootstrap, install, agent config or executable script is generated.
export const skillInvocationPlan = (verified: VerifiedSkillPackage, input: unknown, artifacts: { ref: ExternalReference; bytes: Uint8Array }[] = []) => {
  const request = parseSkillMethodInput(input), entry = verified.modules.find(module => module.path === verified.package.spec.entry_path)!;
  const profile = compileValidator<SkillRuntimeProfile>(SkillRuntimeProfileSchema)({ version: "cimiloop/skill-method/1.0.0",
    source_digest: verified.source_digest, skill_names: verified.modules.map(module => module.name), purpose: request.purpose });
  const files = [{ path: "skill-input.json", content: JSON.stringify(request) }];
  const index = artifacts.map(({ ref, bytes }) => {
    if (!ref.digest || ref.digest.algorithm !== "sha256" || bytes.length > 256 * 1024 || createHash("sha256").update(bytes).digest("hex") !== ref.digest.value ||
      request.purpose !== "review" || !request.artifact_refs.some(actual => JSON.stringify(actual) === JSON.stringify(ref))) throw new Error("Fixed skill artifact required");
    const path = `skill-artifacts/${ref.digest.value}.txt`;
    if (!files.some(file => file.path === path)) files.push({ path, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) });
    return { ref, path };
  });
  if (request.purpose === "review" && request.artifact_refs.some(ref => !artifacts.some(actual => JSON.stringify(actual.ref) === JSON.stringify(ref)))) throw new Error("Fixed skill artifact missing");
  if (index.length) files.push({ path: "skill-artifacts/index.json", content: JSON.stringify(index) });
  for (const module of verified.modules) for (const file of verified.package.files.filter(file => file.path.startsWith(`${module.path}/`))) {
    const relative = file.path.slice(module.path.length + 1);
    // Only declarative skill definitions and references can enter the loader.
    // Harness agent configs and scripts remain in the immutable source package.
    if (relative !== "SKILL.md" && !relative.startsWith("references/")) continue;
    const content = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(file.content_base64, "base64"));
    files.push({ path: `skill-source/${module.name}/${relative}`, content });
  }
  if (files.length > 32 || files.some(file => Buffer.byteLength(file.content) > 256 * 1024)) throw new Error("Skill invocation file limit");
  const prompt = `CimiLoop explicit skill method ${profile.version}. Load the skill named ${entry.name} using the skill tool; load its declared skill dependencies when called. Read skill-input.json for the fixed request; fixed artifact files are mapped in skill-artifacts/index.json when supplied. Only return one JSON object matching the ${request.purpose} SkillMethodOutput contract. Questions and findings are proposals; never claim a Decision, Task status, or Gate. If a required harness capability is unavailable, report the limitation instead of inventing results.\n${request.purpose === "clarification" ? 'Output keys: purpose="clarification", questions:string[], unresolved:string[], optional candidate:ContractBody.' : 'Output keys: purpose="review", findings:[{axis:"spec"|"standards"|"verification",severity:"blocking"|"non_blocking"|"uncertain",observation:string,basis_refs:ExternalReference[]}], limitations:string[]. Basis references must come from the fixed input artifact_refs.'}`;
  return { profile, files, prompt };
};
