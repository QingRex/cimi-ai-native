import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInternalId, type SkillImportSpec } from "@cimiloop/protocol/v2";
import { packageGitSkill, verifySkillPackageBytes, parseSkillMethodInput, parseSkillMethodOutput, skillRegistration, skillInvocationPlan, fixedMethodInvocationPlan } from "../src/index.js";

describe("fixed Git skill packages and method outputs", () => {
  let root: string, spec: SkillImportSpec;
  const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=disabled-hooks", "-C", root, ...args], { encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trim();
  const write = (path: string, text: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  const save = () => { git("add", "."); git("commit", "-m", "skill fixture"); spec.commit_id = git("rev-parse", "HEAD"); };
  const packed = () => packageGitSkill(root, spec);
  const verify = (value: unknown) => verifySkillPackageBytes(Buffer.from(JSON.stringify(value)));
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cimiloop-skill-package-")); git("init"); git("config", "user.name", "Skill fixture"); git("config", "user.email", "fixture@example.test");
    write("LICENSE", "Synthetic fixture license; not an upstream license.\n");
    write("skills/grill-me/SKILL.md", '---\nname: grill-me\ndescription: Clarify a requirement.\ndisable-model-invocation: true\n---\nCall the Skill tool with "grilling".\n');
    write("skills/grilling/SKILL.md", "---\nname: grilling\ndescription: |\n  Ask about unsettled decisions.\nmetadata:\n  author: fixture\nallowed-tools: Read\n---\nReturn questions without approving anything.\n");
    write("skills/grilling/references/format.md", "A reference included by the entire module.\n");
    write("skills/grilling/scripts/untrusted.sh", "touch should-never-exist\n");
    spec = { format: "cimiloop/skill-import/1.0.0", repository_url: "https://example.test/skills", commit_id: "0".repeat(40), entry_path: "skills/grill-me", license_path: "LICENSE",
      name: "fixture-clarifier", version: "1.0.0", modules: [{ path: "skills/grill-me", dependencies: ["skills/grilling"] }, { path: "skills/grilling", dependencies: [] }],
      capabilities: [{ capability_id: "intent.clarify", version: "1.0.0" }], provider_dependencies: [], required_permissions: { actions: [], resources: [], environment_ids: [], network_hosts: [] },
      harness_requirements: ["invoke_skills"], dependency_review: "The explicit Skill call is included; scripts remain unexecuted data." }; save();
  });
  afterEach(() => {
    if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-skill-package-")) throw new Error("Unsafe skill fixture cleanup");
    rmSync(root, { recursive: true, force: true });
  });
  it("packs a complete dependency closure and verifies it offline without executing scripts", () => {
    const result = packed(); expect(result.modules.map(module => module.name)).toEqual(["grill-me", "grilling"]);
    expect(result.package.files.map(file => file.path)).toContain("skills/grilling/references/format.md");
    expect(result.modules[1]!.frontmatter["allowed-tools"]).toBe("Read");
    expect(result.package.spec.required_permissions.actions).toEqual([]); expect(existsSync(join(root, "should-never-exist"))).toBe(false);
    expect(verify(result.package).source_digest).toEqual(result.source_digest);
  });
  it("uses the exact commit despite dirty files and a subsequently moved HEAD", () => {
    const old = packed(); write("skills/grilling/SKILL.md", "dirty and invalid metadata\n");
    expect(packed().source_digest).toEqual(old.source_digest);
    git("add", "."); git("commit", "-m", "move HEAD"); expect(packed().source_digest).toEqual(old.source_digest);
  });
  it("loads only fixed declarative modules and requires the exact review artifact bytes", () => {
    const verified = packed(), clarification = skillInvocationPlan(verified, { purpose: "clarification", requirement: "Fixed", background: "Context", constraints: [] });
    expect(clarification.profile.skill_names).toEqual(["grill-me", "grilling"]);
    expect(clarification.files.map(file => file.path)).toContain("skill-source/grilling/references/format.md");
    expect(clarification.files.some(file => file.path.includes("scripts/") || file.path.includes("agents/"))).toBe(false);
    const bytes = Buffer.from("fixed diff"), ref = { provider: "local_content", resource_type: "provider_probe_artifact", locator: createHash("sha256").update(bytes).digest("hex"), digest: { algorithm: "sha256" as const, value: createHash("sha256").update(bytes).digest("hex") } };
    const input = { purpose: "review", goal: "Review", spec: "Spec", standards: "Standards", artifact_refs: [ref] };
    expect(() => skillInvocationPlan(verified, input)).toThrow("Fixed skill artifact missing");
    expect(() => skillInvocationPlan(verified, input, [{ ref, bytes: Buffer.from("changed") }])).toThrow("Fixed skill artifact required");
    expect(skillInvocationPlan(verified, input, [{ ref, bytes }]).files.map(file => file.path)).toContain(`skill-artifacts/${ref.digest.value}.txt`);
  });
  it("accepts bounded large upstream commit messages and rejects oversized commits before copying", () => {
    write("commit-message.txt", "x".repeat(104000)); git("commit", "--amend", "-F", join(root, "commit-message.txt")); spec.commit_id = git("rev-parse", "HEAD");
    const result = packed(); expect(Buffer.from(result.package.git_commit.content_base64, "base64").length).toBeGreaterThan(65536);
    expect(verify(result.package).source_digest).toEqual(result.source_digest);
    write("commit-message.txt", "x".repeat(300000)); git("commit", "--amend", "-F", join(root, "commit-message.txt")); spec.commit_id = git("rev-parse", "HEAD");
    expect(packed).toThrow("Skill commit limit");
  });
  it("pins explicit named requests, dependency names and every declarative resource without trusting a modified inspection", () => {
    const verified = packed(), request = { format: "cimiloop/named-skill-method/1.0.0", invocation_key: "explicit_method", method_name: "grill-me", source_digest: verified.source_digest,
      input: { purpose: "clarification", requirement: "Fixed", background: "Context", constraints: [] } };
    const result = fixedMethodInvocationPlan(verified, request);
    expect(result.profile.modules).toEqual([{ name: "grill-me", definition_path: "skill-source/grill-me/SKILL.md", dependencies: ["grilling"] }, { name: "grilling", definition_path: "skill-source/grilling/SKILL.md", dependencies: [] }]);
    expect(result.profile.resources.map(resource => resource.path)).toContain("skill-source/grilling/references/format.md");
    expect(result.profile.resources.map(resource => resource.path)).not.toContain("skill-source/grilling/scripts/untrusted.sh");
    expect(JSON.parse(result.files[0]!.content)).toEqual(request); expect(result.prompt).toContain("invoke_skill");
    expect(() => fixedMethodInvocationPlan(verified, { ...request, method_name: "grilling" })).toThrow("Fixed method request source or capability mismatch");
    expect(() => fixedMethodInvocationPlan(verified, { ...request, source_digest: { algorithm: "sha256", value: "0".repeat(64) } })).toThrow();
    const altered = structuredClone(verified); altered.package.files[0]!.content_base64 = Buffer.from("altered").toString("base64");
    expect(() => fixedMethodInvocationPlan(altered, request)).toThrow();
  });
  it("rejects changed file bytes even when their content hash and size are recomputed", () => {
    const pkg = structuredClone(packed().package), file = pkg.files.find(item => item.path.endsWith("format.md"))!;
    const bytes = Buffer.from("tampered\n"); file.content_base64 = bytes.toString("base64"); file.bytes = bytes.length; file.digest.value = createHash("sha256").update(bytes).digest("hex");
    expect(() => verify(pkg)).toThrow("Git object identity mismatch");
    file.git_oid = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    expect(() => verify(pkg)).toThrow("Package file identity mismatch");
  });
  it("rejects a changed commit or missing tree proof", () => {
    const pkg = structuredClone(packed().package); pkg.spec.commit_id = "1".repeat(40); expect(() => verify(pkg)).toThrow("Commit reference mismatch");
    const missing = structuredClone(packed().package); missing.git_trees.splice(0, 1); expect(() => verify(missing)).toThrow();
  });
  it("rejects an omitted module file and duplicate file identities", () => {
    const pkg = structuredClone(packed().package); pkg.files.pop(); expect(() => verify(pkg)).toThrow("Incomplete or unrelated package content");
    const duplicate = structuredClone(packed().package); duplicate.files[1] = duplicate.files[0]!; expect(() => verify(duplicate)).toThrow("Package file identity mismatch");
  });
  it("rejects unresolved and cyclic dependencies", () => {
    spec.modules[0]!.dependencies = ["skills/missing"]; expect(packed).toThrow("Unresolved skill dependency");
    spec.modules[0]!.dependencies = ["skills/grilling"]; spec.modules[1]!.dependencies = ["skills/grill-me"]; expect(packed).toThrow("Cyclic skill dependency");
  });
  it("rejects an explicit undeclared Skill-tool call", () => {
    spec.modules[0]!.dependencies = []; spec.modules.pop(); expect(packed).toThrow("Undeclared explicit Skill-tool dependency");
  });
  it("rejects unrelated, overlapping and case-colliding modules", () => {
    spec.modules[0]!.dependencies = []; expect(packed).toThrow("Unrelated modules");
    spec.modules[0]!.dependencies = ["skills/grilling"]; spec.modules[1]!.path = "skills/grill-me/child"; expect(packed).toThrow("Overlapping modules");
    spec.modules[0]!.dependencies = ["SKILLS/GRILL-ME"]; spec.modules[1]!.path = "SKILLS/GRILL-ME"; expect(packed).toThrow("Case-colliding modules");
  });
  it.each(["../escape", "/absolute", "C:/outside", "skills/../outside", "skills/NUL.txt", "skills/name."])("rejects non-portable source path %s", path => {
    spec.entry_path = path; expect(packed).toThrow();
  });
  it("rejects symbolic-link blobs without needing Windows symlink privileges", () => {
    const oid = git("hash-object", "-w", "--stdin"); // Empty ordinary blob is also a valid symlink payload fixture.
    git("update-index", "--add", "--cacheinfo", `120000,${oid},skills/grilling/escape`); git("commit", "-m", "linked source"); spec.commit_id = git("rev-parse", "HEAD");
    expect(packed).toThrow("Linked or submodule skill source");
  });
  it("rejects oversize source before copying its content", () => {
    write("skills/grilling/too-large.txt", "x".repeat(262145)); save(); expect(packed).toThrow("Skill content limit");
  });
  it.each([
    '---\nname: grilling\nname: duplicate\ndescription: invalid\n---\nbody\n',
    '---\nname: wrong-directory\ndescription: invalid\n---\nbody\n',
    '---\nname: grilling\ndescription: !!python/object invalid\n---\nbody\n',
    '---\nname: grilling\ndescription: valid\nmetadata: &data {author: fixture}\nother: *data\n---\nbody\n',
    '---\nname: grilling\ndescription: valid\nmetadata: {version: 2}\n---\nbody\n'
  ])("rejects ambiguous or unsafe YAML metadata", content => { write("skills/grilling/SKILL.md", content); save(); expect(packed).toThrow(); });
  it("binds a registration to the actual package and fixed IO contract", () => {
    const verified = packed(), digest = verified.source_digest, ref = { provider: "local_content" as const, resource_type: "skill_package" as const, locator: digest.value, digest };
    const input = { schema_id: "SkillMethodInput", digest }, output = { schema_id: "SkillMethodOutput", digest };
    const registration = skillRegistration(verified, ref, input, output); expect(registration.provider_kind).toBe("skill"); expect(registration.source_ref.version).toBe(spec.commit_id);
    expect(registration).not.toHaveProperty("trust_status"); expect(() => skillRegistration(verified, { ...ref, locator: "0".repeat(64) }, input, output)).toThrow();
  });
  it("allows method proposals and findings but rejects authoritative outputs and purpose changes", () => {
    const request = { purpose: "clarification", requirement: "Need a query", background: "A local project", constraints: [] };
    expect(parseSkillMethodOutput(request, { purpose: "clarification", questions: ["Which result?"], unresolved: [] })).toHaveProperty("questions");
    for (const field of ["decision", "task_status", "gate", "approved"]) expect(() => parseSkillMethodOutput(request, { purpose: "clarification", questions: [], unresolved: [], [field]: true })).toThrow();
    expect(() => parseSkillMethodOutput(request, { purpose: "review", findings: [], limitations: [] })).toThrow("purpose mismatch");
    expect(() => parseSkillMethodOutput({ purpose: "review", goal: "Review", spec: "Spec", standards: "Standards", artifact_refs: [{ provider: "fixture", resource_type: "file", locator: "file" }] },
      { purpose: "review", findings: [{ axis: "spec", severity: "blocking", observation: "Missing", basis_refs: [] }], limitations: [] })).toThrow();
  });
  it("rejects mixed Provider dependency identities and credentials in repository URLs", () => {
    const id = createInternalId(), digest = { algorithm: "sha256" as const, value: "a".repeat(64) };
    spec.provider_dependencies = [{ descriptor_ref: { object_type: "provider_descriptor", id }, digest }, { descriptor_ref: { object_type: "provider_descriptor", id }, digest: { ...digest, value: "b".repeat(64) } }];
    expect(packed).toThrow("Duplicate Provider dependency identity"); spec.provider_dependencies = []; spec.repository_url = "https://user:password@example.test/skills"; expect(packed).toThrow();
  });
  it("bounds complete method inputs and outputs including inherited reference fields", () => {
    const reference = { provider: "fixture", resource_type: "file", locator: "x".repeat(384 * 1024) };
    expect(() => parseSkillMethodInput({ purpose: "review", goal: "Review", spec: "Spec", standards: "Standards", artifact_refs: [reference] })).toThrow("Skill method byte limit");
    const request = { purpose: "review", goal: "Review", spec: "Spec", standards: "Standards", artifact_refs: [{ ...reference, locator: "file" }] };
    expect(() => parseSkillMethodOutput(request, { purpose: "review", findings: [{ axis: "spec", severity: "blocking", observation: "Missing", basis_refs: [{ ...reference, locator: "x".repeat(1024 * 1024) }] }], limitations: [] })).toThrow("Skill method byte limit");
  });
});
