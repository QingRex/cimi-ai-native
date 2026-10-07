import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createInternalId, compileValidator, NamedSkillMethodAssessmentSchema, type SkillImportSpec, type NamedSkillMethodEvidence,
  type NamedSkillMethodSample, type ProviderDescriptor, type AgentRunRecord, type AgentContextManifest, type ProviderBinding } from "../../packages/protocol/src/v2/index.js";
import { LocalNamedSkillMethodAssessment, type NamedSkillMethodOriginalsPort, type ContentReference } from "../../packages/local-app/src/index.js";
import { requestDigest } from "../../packages/kernel/src/index.js";
import { createFlowProject, flowTime, flowSuccess } from "../fixtures/flow-project.js";
import { constructedNamedTranscript } from "../fixtures/named-method-transcript.js";

// Actual local Git/content/SQLite candidate registration, with CONSTRUCTED SDK,
// model-origin/billing/harness callbacks only. No production qualification claim.
let root: string, f: ReturnType<typeof createFlowProject>, assessor: LocalNamedSkillMethodAssessment, descriptor: ProviderDescriptor, evidence: NamedSkillMethodEvidence;
const digest = (value: unknown) => ({ algorithm: "sha256" as const, value: requestDigest(value) });
const store = <T extends ContentReference["resource_type"]>(value: unknown, type: T) => assessor.inputs.packages.content.storeContent(
  Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value)), type);
const artifact = (value: unknown, version: string) => ({ ...store(value, "provider_probe_artifact"), version });
const evidenceRef = () => store(evidence, "named_skill_method_evidence");
const sample = (purpose: "clarification" | "review" = "clarification"): NamedSkillMethodSample => {
  const input = purpose === "clarification" ? { purpose, requirement: "Fixed", background: "Constructed review", constraints: [] } :
    { purpose, goal: "Review", spec: "Fixed", standards: "Fixed", artifact_refs: [store(Buffer.from("Fixed diff\n"), "workspace_diff")] };
  const input_ref = store(input, "skill_method_input"), invocation_key = createInternalId();
  const plan = assessor.inputs.read(f.project, descriptor, { invocation_key, method_name: "entry", input_ref });
  const constructed = constructedNamedTranscript(plan.profile, plan.files, purpose === "clarification" ?
    { purpose, questions: [], unresolved: ["Constructed fixture only."] } : { purpose, findings: [], limitations: ["Constructed fixture only."] }, plan.prompt);
  return { invocation_key, input_ref, transcript_ref: artifact(constructed.transcript, "transcript.json"), stdout_ref: artifact(constructed.stdout, "stdout.raw"),
    native_proof_ref: artifact(constructed.native, "native-proof.json") } satisfies NamedSkillMethodSample;
};
const constructedOriginals = (change?: (result: ReturnType<NamedSkillMethodOriginalsPort["verify"]>) => void): NamedSkillMethodOriginalsPort => ({ verify: () => {
  const result: ReturnType<NamedSkillMethodOriginalsPort["verify"]> = { origin: "external_model", checks: { runtime_custody: "passed", cost_accounting_and_cap: "passed",
    independent_context: "passed", provider_dependencies: "passed", permission_intersection: "passed", invocation_recovery: "passed", behavior: "passed", harness: { invoke_skills: "passed", human_interview: "passed" } } }; change?.(result); return result;
} });
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cimiloop-named-assessment-")); f = createFlowProject(root, { repositoryKind: "git" }); assessor = new LocalNamedSkillMethodAssessment(root, root);
  const source = join(root, "source"); mkdirSync(join(source, "skills", "entry"), { recursive: true });
  writeFileSync(join(source, "LICENSE"), "Constructed source license\n");
  writeFileSync(join(source, "skills", "entry", "SKILL.md"), "---\nname: entry\ndescription: Fixed method\n---\nRead fixed input.\n");
  const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=disabled-hooks", "-C", source, ...args],
    { encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trim();
  git("init"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test"); git("add", "."); git("commit", "-m", "fixed method fixture");
  const spec: SkillImportSpec = { format: "cimiloop/skill-import/1.0.0", repository_url: "https://example.test/skills", commit_id: git("rev-parse", "HEAD"),
    entry_path: "skills/entry", license_path: "LICENSE", name: "method-assessment-fixture", version: "1.0.0", modules: [{ path: "skills/entry", dependencies: [] }],
    capabilities: [{ capability_id: "intent.clarify", version: "1.0.0" }, { capability_id: "verification.review", version: "1.0.0" }], provider_dependencies: [],
    required_permissions: { actions: [], resources: [], environment_ids: [], network_hosts: [] }, harness_requirements: ["invoke_skills", "human_interview"],
    dependency_review: "Constructed method only." };
  const imported = assessor.inputs.packages.importGit(source, spec), registered = flowSuccess(f.kernel.execute(f.projectCommand("RegisterProvider", imported.registration)));
  if (registered.command_type !== "RegisterProvider") throw new Error("Expected candidate descriptor"); descriptor = registered.data.descriptor;
  evidence = { format: "cimiloop/named-skill-method-evidence/1.0.0", project_id: f.project.id, descriptor_ref: { object_type: "provider_descriptor", id: descriptor.id },
    descriptor_digest: digest(descriptor), runtime_binding: { binding_ref: { object_type: "provider_binding", id: createInternalId() }, digest: digest("Constructed runtime pin") },
    method_name: "entry", purpose: "clarification", observed_at: flowTime, samples: [sample()] };
});
afterEach(() => { f?.store.close(); if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-named-assessment-")) throw new Error("Unsafe fixture cleanup"); rmSync(root, { recursive: true, force: true }); });
it("separates named read-contract qualification from builtin Skill and formal execution", () => {
  const events = f.store.listEvents(), ref = evidenceRef(), contract = assessor.evaluate(f.project, descriptor, ref);
  expect(contract).toMatchObject({ rule_version: "named-skill-method-assessment/1.0.0", profile: "method_contract", outcome: "ALLOW", builtin_skill_qualified: false, formal_execution_enabled: false });
  const controlled = assessor.evaluate(f.project, descriptor, ref, "controlled_execution");
  expect(controlled.outcome).toBe("NEED_MORE_EVIDENCE"); expect(controlled.assessments).toContainEqual({ key: "sample_0_real_model", result: "inconclusive" });
  expect(controlled.assessments).toContainEqual({ key: "sample_0_harness_human_interview", result: "inconclusive" });
  expect(f.store.listEvents()).toEqual(events); expect(assessor.evaluate(f.project, descriptor, ref)).toEqual(contract);
});
it("retains positive public fixture reads as negative real-model evidence", () => {
  evidence.samples.push(sample()); const ref = evidenceRef();
  const result = assessor.evaluate(f.project, descriptor, ref, "controlled_execution", constructedOriginals(r => { r.origin = "public_fixture"; }));
  expect(result.outcome).toBe("DENY"); expect(result.assessments).toContainEqual({ key: "sample_1_real_model", result: "failed" });
});
it.each(["cost_accounting_and_cap", "invocation_recovery", "behavior", "runtime_custody", "independent_context", "provider_dependencies", "permission_intersection"] as const)("keeps missing %s proof inconclusive", key => {
  evidence.samples.push(sample()); const result = assessor.evaluate(f.project, descriptor, evidenceRef(), "controlled_execution", constructedOriginals(r => { r.checks[key] = "inconclusive"; }));
  expect(result.outcome).toBe("NEED_MORE_EVIDENCE"); expect(result.assessments).toContainEqual({ key: `sample_0_${key}`, result: "inconclusive" });
});
it("requires every original harness declaration and two independent original sessions", () => {
  expect(assessor.evaluate(f.project, descriptor, evidenceRef(), "controlled_execution", constructedOriginals()).outcome).toBe("NEED_MORE_EVIDENCE");
  evidence.samples.push(sample()); expect(assessor.evaluate(f.project, descriptor, evidenceRef(), "controlled_execution", constructedOriginals()).outcome).toBe("ALLOW");
  expect(assessor.evaluate(f.project, descriptor, evidenceRef(), "controlled_execution", constructedOriginals(r => { delete r.checks.harness.human_interview; })).outcome).toBe("NEED_MORE_EVIDENCE");
});
it("rejects changed Native descriptor, reused operation/session and cross-purpose evidence", () => {
  const ref = evidenceRef(); expect(() => assessor.evaluate(f.project, { ...descriptor, name: "changed" }, ref)).toThrow("descriptor pin mismatch");
  evidence.samples.push(evidence.samples[0]!); expect(() => assessor.evaluate(f.project, descriptor, evidenceRef())).toThrow("invocation repeated");
  const second = sample(), firstTranscript = JSON.parse(assessor.inputs.packages.content.readContent(evidence.samples[0]!.transcript_ref).toString());
  const secondTranscript = JSON.parse(assessor.inputs.packages.content.readContent(second.transcript_ref).toString());
  expect(firstTranscript.invocation_key).not.toBe(secondTranscript.invocation_key);
  const secondStdout = second.stdout_ref;
  second.stdout_ref = evidence.samples[0]!.stdout_ref; evidence.samples[1] = second;
  expect(() => assessor.evaluate(f.project, descriptor, evidenceRef())).toThrow("sdk_completion_unproven");
  const firstEvents = assessor.inputs.packages.content.readContent(evidence.samples[0]!.stdout_ref).toString().trim().split("\n").map(line => JSON.parse(line));
  const secondEvents = assessor.inputs.packages.content.readContent(secondStdout).toString().trim().split("\n").map(line => JSON.parse(line));
  for (const event of secondEvents) if (event.type) { event.sessionID = firstEvents[1].sessionID; event.part.sessionID = firstEvents[1].sessionID; }
  second.stdout_ref = artifact(Buffer.from(secondEvents.map(event => JSON.stringify(event)).join("\n")), "stdout.raw");
  expect(() => assessor.evaluate(f.project, descriptor, evidenceRef())).toThrow("original session repeated");
  const originalSecondEvents = assessor.inputs.packages.content.readContent(secondStdout).toString().trim().split("\n").map(line => JSON.parse(line));
  originalSecondEvents[0].profile = firstEvents[0].profile;
  const secondNative = JSON.parse(assessor.inputs.packages.content.readContent(second.native_proof_ref).toString()); secondNative.profile = firstEvents[0].profile;
  second.stdout_ref = artifact(Buffer.from(originalSecondEvents.map(event => JSON.stringify(event)).join("\n")), "stdout.raw"); second.native_proof_ref = artifact(secondNative, "native-proof.json");
  expect(() => assessor.evaluate(f.project, descriptor, evidenceRef())).toThrow("original context repeated");
  evidence.samples = [sample("review")]; expect(() => assessor.evaluate(f.project, descriptor, evidenceRef())).toThrow("purpose mismatch");
});
it("refuses artifact tampering, forged report properties and qualification changes during trusted checks", () => {
  const ref = evidenceRef(), artifactRef = evidence.samples[0]!.transcript_ref, path = join(root, "objects", artifactRef.locator), original = readFileSync(path);
  writeFileSync(path, "{}"); expect(() => assessor.evaluate(f.project, descriptor, ref)).toThrow("digest mismatch"); writeFileSync(path, original);
  const parsed = assessor.evaluate(f.project, descriptor, ref);
  expect(() => compileValidator(NamedSkillMethodAssessmentSchema)({ ...parsed, formal_execution_enabled: true })).toThrow();
  expect(() => compileValidator(NamedSkillMethodAssessmentSchema)({ ...parsed, behavior_qualified: true })).toThrow();
  expect(() => assessor.evaluate(f.project, descriptor, ref, "controlled_execution", { verify: () => {
    writeFileSync(path, "tampered during verification"); return constructedOriginals().verify(f.project, {} as never);
  } })).toThrow("digest mismatch");
});
it("recomputes controlled qualification around live admission and binds the current purpose/runtime", () => {
  evidence.samples.push(sample()); const ref = evidenceRef(), plan = assessor.inputs.read(f.project, descriptor, { ...evidence.samples[0]!, method_name: "entry" });
  // Direct composition contract fixtures; LocalSkillMethodInputs separately
  // strictly validates full Native parent objects before calling this verifier.
  const record = { runtime_binding: evidence.runtime_binding } as AgentRunRecord, context = {} as AgentContextManifest, binding = {} as ProviderBinding;
  let admissions = 0, checks = 0;
  const host = { evidence: () => ref, originals: { verify: ((...args) => { checks++; return constructedOriginals().verify(...args); }) as NamedSkillMethodOriginalsPort["verify"] },
    admitCurrent: () => { admissions++; } };
  const verifier = assessor.qualificationVerifier(host), receipt = verifier.verify(f.project, record, context, binding, descriptor, plan);
  expect(admissions).toBe(2); expect(checks).toBe(4); expect(JSON.parse(assessor.inputs.packages.content.readContent(receipt).toString()).profile).toBe("controlled_execution");
  expect(() => verifier.verify(f.project, { runtime_binding: { ...evidence.runtime_binding, digest: digest("changed") } } as AgentRunRecord, context, binding, descriptor, plan)).toThrow("controlled qualification unavailable");
  host.admitCurrent = () => { throw new Error("Current WorkItem revoked"); }; expect(() => verifier.verify(f.project, record, context, binding, descriptor, plan)).toThrow("WorkItem revoked");
  let liveChecks = 0;
  host.admitCurrent = () => { if (++liveChecks === 2) throw new Error("Authority changed during re-read"); };
  expect(() => verifier.verify(f.project, record, context, binding, descriptor, plan)).toThrow("Authority changed during re-read");
});
