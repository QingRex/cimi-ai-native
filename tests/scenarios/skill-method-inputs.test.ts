import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createInternalId, SCHEMA_VERSION, type AgentContextManifest, type AgentRunRecord, type ProviderBinding,
  type ProviderDescriptor, type SkillImportSpec, type SkillInvocation } from "../../packages/protocol/src/v2/index.js";
import { requestDigest, runContextDigest } from "../../packages/kernel/src/index.js";
import { LocalSkillMethodInputs, type LocalSkillMethodQualificationPort } from "../../packages/local-app/src/index.js";
import { createFlowProject, flowTime, flowSuccess } from "../fixtures/flow-project.js";

// Real local Git packages/content IO; Native admission and qualification below
// are constructed fixtures only. No actual method, SDK, model or billing is run.
describe("local fixed skill method bytes and Native preparation", () => {
  let root: string, f: ReturnType<typeof createFlowProject>, inputs: LocalSkillMethodInputs,
    descriptor: ProviderDescriptor, record: AgentRunRecord, context: AgentContextManifest, binding: ProviderBinding;
  const digest = (value: unknown) => ({ algorithm: "sha256" as const, value: requestDigest(value) });
  const ref = <const T extends string>(object_type: T, id = createInternalId()) => ({ object_type, id });
  const input = (value: unknown = { purpose: "clarification", requirement: "Clarify", background: "Fixed context", constraints: [] }) => ({
    invocation_key: createInternalId(), method_name: "entry",
    input_ref: inputs.packages.content.storeContent(Buffer.from(JSON.stringify(value)), "skill_method_input") });
  const prepare = (request = input(), port?: LocalSkillMethodQualificationPort) => inputs.prepare(f.project, record, context, binding, descriptor, request, port);
  const constructedQualification = (verify?: LocalSkillMethodQualificationPort["verify"]): LocalSkillMethodQualificationPort => ({
    verify: verify ?? (() => inputs.packages.content.storeContent(Buffer.from("Constructed qualification only; no execution approval"), "skill_method_qualification"))
  });
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cimiloop-skill-method-inputs-")); f = createFlowProject(root, { repositoryKind: "git" });
    inputs = new LocalSkillMethodInputs(root, root);
    const source = join(root, "source"); mkdirSync(join(source, "skills", "entry"), { recursive: true });
    mkdirSync(join(source, "skills", "dependency", "references"), { recursive: true }); mkdirSync(join(source, "skills", "dependency", "scripts"));
    writeFileSync(join(source, "LICENSE"), "Synthetic Git source license\n");
    writeFileSync(join(source, "skills", "entry", "SKILL.md"), '---\nname: entry\ndescription: A fixed method\n---\nCall the Skill tool with "dependency".\n');
    writeFileSync(join(source, "skills", "dependency", "SKILL.md"), "---\nname: dependency\ndescription: A fixed dependency\n---\nOnly propose questions and findings.\n");
    writeFileSync(join(source, "skills", "dependency", "references", "format.md"), "Read the fixed request.\n");
    writeFileSync(join(source, "skills", "dependency", "scripts", "untrusted.txt"), "Never execute this source file.\n");
    const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=disabled-hooks", "-C", source, ...args],
      { encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trim();
    git("init"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test"); git("add", "."); git("commit", "-m", "local source fixture");
    const spec: SkillImportSpec = { format: "cimiloop/skill-import/1.0.0", repository_url: "https://example.test/skills", commit_id: git("rev-parse", "HEAD"),
      entry_path: "skills/entry", license_path: "LICENSE", name: "local-method-fixture", version: "1.0.0",
      modules: [{ path: "skills/entry", dependencies: ["skills/dependency"] }, { path: "skills/dependency", dependencies: [] }],
      capabilities: [{ capability_id: "intent.clarify", version: "1.0.0" }, { capability_id: "verification.review", version: "1.0.0" }], provider_dependencies: [],
      required_permissions: { actions: [], resources: [], environment_ids: [], network_hosts: [] }, harness_requirements: ["invoke_skills", "ask_user_questions"],
      dependency_review: "Synthetic two-module closure; no actual method executed." };
    const imported = inputs.packages.importGit(source, spec);
    const metadata = () => ({ schema_version: SCHEMA_VERSION, id: createInternalId(), project_id: f.project.id, created_at: flowTime, producer_actor_id: f.actor.id });
    const registered = flowSuccess(f.kernel.execute(f.projectCommand("RegisterProvider", imported.registration)));
    if (registered.command_type !== "RegisterProvider") throw new Error("Expected native candidate descriptor");
    descriptor = registered.data.descriptor;
    binding = { ...metadata(), descriptor_ref: ref("provider_descriptor", descriptor.id), descriptor_digest: digest(descriptor), capability: spec.capabilities[0]!,
      resolved_dependencies: [], input_schema_ref: descriptor.input_schema_ref, output_schema_ref: descriptor.output_schema_ref, effective_permissions: descriptor.required_permissions,
      runtime_binding_ref: ref("provider_binding"), probe_evidence_refs: [ref("evidence")], approval: {
        assignment_ref: ref("assignment"), evaluation_ref: ref("evaluation"), input_digest: digest("constructed qualification"), binding_scope: "task_execution" } };
    const runtime_binding = { binding_ref: binding.runtime_binding_ref!, digest: digest("constructed runtime") }, executor_ref = ref("actor"),
      common = { ...metadata(), change_id: createInternalId(), task_id: createInternalId(), work_item_ref: ref("work_item"),
        definition_ref: { ...ref("task_definition"), domain_version: 1 }, contract_ref: { ...ref("contract_version"), domain_version: 1 }, plan_ref: { ...ref("plan_version"), domain_version: 1 } },
      source_snapshot_ref = ref("source_snapshot"), workspace_snapshot_ref = ref("workspace_snapshot"),
      host_admission_ref = inputs.packages.content.storeContent(Buffer.from("Constructed Agent host only"), "agent_host_admission");
    context = { ...common, source_snapshot_ref, workspace_snapshot_ref, executor_ref, boundary: "agent_scoped", runtime_binding,
      skill_bindings: [{ binding_ref: ref("provider_binding", binding.id), digest: digest(binding) }], host_admission_ref,
      input_refs: [source_snapshot_ref, workspace_snapshot_ref, common.contract_ref, common.plan_ref, common.definition_ref],
      allowed_actions: ["read_files"], allowed_resources: ["src/file.ts"], input_digest: digest("placeholder") };
    context.input_digest = runContextDigest(context);
    record = { ...common, id: createInternalId(), run_kind: "agent", run_id: createInternalId(), attempt_no: 1, operation_key: createInternalId(),
      context_ref: ref("context_manifest", context.id), source_snapshot_ref, workspace_before_ref: workspace_snapshot_ref, executor_ref,
      reserved_at: flowTime, input_digest: context.input_digest, reserved_cost_micros: 100, cost_currency: "USD", runtime_binding,
      skill_bindings: context.skill_bindings, host_admission_ref };
  });
  afterEach(() => {
    f?.store.close(); if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith("cimiloop-skill-method-inputs-")) throw new Error("Unsafe fixture cleanup");
    rmSync(root, { recursive: true, force: true });
  });
  it("re-reads Git provenance, exact schemas/input and all declarative dependencies without Native mutation", () => {
    const before = f.store.listEvents(), request = input(), plan = inputs.read(f.project, descriptor, request);
    expect(plan.request.invocation_key).toBe(request.invocation_key); expect(plan.profile.modules.map(module => module.name)).toEqual(["entry", "dependency"]);
    expect(plan.files.map(file => file.path)).toContain("skill-source/dependency/references/format.md");
    expect(plan.files.some(file => file.path.includes("scripts/"))).toBe(false); expect(plan.harness_requirements).toEqual(["invoke_skills", "ask_user_questions"]);
    expect(inputs.read(f.project, descriptor, request)).toEqual(plan); expect(f.store.listEvents()).toEqual(before); expect(f.store.listRuns(record.change_id)).toEqual([]);
    expect(() => prepare(request)).toThrow("qualification host unavailable");
  });
  it("rejects changed package/input/schema, malformed UTF-8 and mismatched entry before qualification", () => {
    const request = input(); expect(() => inputs.read(f.project, descriptor, { ...request, method_name: "dependency" })).toThrow("source or capability mismatch");
    const badSchema = { ...descriptor, output_schema_ref: { ...descriptor.output_schema_ref, digest: digest("changed") } };
    expect(() => inputs.read(f.project, badSchema, request)).toThrow("Skill Schema changed");
    const badUtf8 = inputs.packages.content.storeContent(Buffer.from([0xff]), "skill_method_input");
    expect(() => inputs.read(f.project, descriptor, { ...request, input_ref: badUtf8 })).toThrow();
    const file = join(root, "objects", request.input_ref.locator), original = readFileSync(file); writeFileSync(file, "changed");
    expect(() => inputs.read(f.project, descriptor, request)).toThrow("digest mismatch"); writeFileSync(file, original);
    const packageFile = join(root, "objects", descriptor.source_ref.locator), packageBytes = readFileSync(packageFile); writeFileSync(packageFile, "{}");
    expect(() => inputs.read(f.project, descriptor, request)).toThrow("digest mismatch"); writeFileSync(packageFile, packageBytes);
  });
  it("loads exact review diff/file bytes and rejects unsafe refs, missing digests, tampering and SDK truncation", () => {
    const artifact = inputs.packages.content.storeContent(Buffer.from("Fixed diff\n"), "workspace_diff");
    const review = (artifact_refs: unknown[]) => input({ purpose: "review", goal: "Review", spec: "Fixed specification", standards: "Fixed standard", artifact_refs });
    const plan = inputs.read(f.project, descriptor, review([{ ...artifact, version: "diff.txt" }]));
    expect(plan.files.find(file => file.path === `skill-artifacts/${artifact.digest.value}.txt`)!.content).toBe("Fixed diff\n");
    expect(() => inputs.read(f.project, descriptor, review([{ provider: "local_file", resource_type: "file", locator: "C:/private.txt", digest: artifact.digest }]))).toThrow("Unsupported fixed skill artifact");
    expect(() => inputs.read(f.project, descriptor, review([{ provider: "local_content", resource_type: "workspace_diff", locator: artifact.locator }]))).toThrow("Unsupported fixed skill artifact");
    writeFileSync(join(root, "objects", artifact.locator), "Changed diff\n"); expect(() => inputs.read(f.project, descriptor, review([artifact]))).toThrow("digest mismatch");
    const largeLine = inputs.packages.content.storeContent(Buffer.from("x".repeat(2001)), "workspace_file");
    expect(() => inputs.read(f.project, descriptor, review([largeLine]))).toThrow("fixed_method_read_limit");
  });
  it("passes complete cloned pins and harness requirements to trusted qualification, with no default self-approval", () => {
    const request = input(); let calls = 0;
    const port = constructedQualification((p, r, c, b, d, plan) => {
      calls++; expect([p.id, r.operation_key, c.id, b.id, d.id]).toEqual([f.project.id, record.operation_key, context.id, binding.id, descriptor.id]);
      expect(plan.harness_requirements).toContain("ask_user_questions"); plan.files[0]!.content = "mutated clone";
      b.approval!.binding_scope = "isolated_provider_probe";
      return inputs.packages.content.storeContent(Buffer.from("Constructed host qualification receipt"), "skill_method_qualification");
    });
    const result = prepare(request, port); expect(calls).toBe(1); expect(result.request.input.purpose).toBe("clarification");
    expect(binding.approval!.binding_scope).toBe("task_execution"); expect(result).not.toHaveProperty("verified");
    expect(() => prepare(request, constructedQualification(() => { throw new Error("Real method qualification not established"); }))).toThrow("not established");
    const wrong = inputs.packages.content.storeContent(Buffer.from("An imported report is not method qualification"), "skill_invocation_report");
    expect(() => prepare(request, constructedQualification(() => wrong as unknown as SkillInvocation["method_qualification_ref"]))).toThrow();
  });
  it("rejects unfixed parent/Binding, probe-only scope and clarification in independent read-only context", () => {
    const request = input(), port = constructedQualification();
    const original = record.context_ref; record.context_ref = ref("context_manifest"); expect(() => prepare(request, port)).toThrow("parent or Binding mismatch"); record.context_ref = original;
    const approval = binding.approval!; binding.approval = { ...approval, binding_scope: "isolated_provider_probe" };
    context.skill_bindings[0]!.digest = digest(binding); context.input_digest = runContextDigest(context); record.input_digest = context.input_digest;
    expect(() => prepare(request, port)).toThrow("capability or execution scope mismatch"); binding.approval = approval;
    context.skill_bindings[0]!.digest = digest(binding); context.boundary = "agent_independent_read_only"; context.input_digest = runContextDigest(context); record.input_digest = context.input_digest;
    expect(() => prepare(request, port)).toThrow("capability or execution scope mismatch");
    context.input_digest = digest("forged context"); record.input_digest = context.input_digest;
    expect(() => prepare(request, port)).toThrow("parent or Binding mismatch");
  });
  it("composes the Kernel prepare signature with the actual Native candidate lookup and preserves lookup identity", () => {
    const request = input(), callback = inputs.invocationPreparer(id => f.store.getProviderDescriptor(id), constructedQualification());
    expect(callback(f.project, record, context, binding, request)).toEqual(prepare(request, constructedQualification()));
    expect(() => inputs.invocationPreparer(id => f.store.getProviderDescriptor(id))(f.project, record, context, binding, request)).toThrow("qualification host unavailable");
    expect(() => inputs.invocationPreparer(() => undefined, constructedQualification())(f.project, record, context, binding, request)).toThrow("Original Skill descriptor unavailable");
    let lookups = 0;
    expect(() => inputs.invocationPreparer(() => ++lookups === 1 ? descriptor : { ...descriptor, id: createInternalId() }, constructedQualification())(
      f.project, record, context, binding, request)).toThrow("descriptor changed during admission");
  });
  it("re-reads after qualification and compares original invocation packets without starting a new operation", () => {
    const request = input();
    expect(() => prepare(request, constructedQualification(() => {
      writeFileSync(join(root, "objects", request.input_ref.locator), "changed during admission");
      return inputs.packages.content.storeContent(Buffer.from("Constructed receipt"), "skill_method_qualification");
    }))).toThrow("digest mismatch");
    const fresh = input({ purpose: "clarification", requirement: "A second fixed input", background: "Fixed context", constraints: [] }), prepared = prepare(fresh, constructedQualification());
    const invocation: SkillInvocation = { schema_version: SCHEMA_VERSION, id: createInternalId(), project_id: f.project.id, created_at: flowTime, producer_actor_id: record.executor_ref.id,
      change_id: record.change_id, task_id: record.task_id, work_item_ref: record.work_item_ref, definition_ref: record.definition_ref, contract_ref: record.contract_ref, plan_ref: record.plan_ref,
      run_ref: ref("run", record.run_id), run_operation_key: record.operation_key, invocation_key: fresh.invocation_key, context_ref: record.context_ref, executor_ref: record.executor_ref,
      runtime_binding: record.runtime_binding, skill_binding: context.skill_bindings[0]!, host_admission_ref: record.host_admission_ref, capability: binding.capability,
      input_ref: fresh.input_ref, ...prepared, input_digest: digest("Constructed original record") };
    const { input_digest: _inputDigest, ...invocationBody } = invocation; invocation.input_digest = digest(invocationBody);
    expect(inputs.readInvocation(f.project, descriptor, invocation).request).toEqual(prepared.request);
    expect(() => inputs.readInvocation(f.project, descriptor, { ...invocation, input_digest: digest("changed") })).toThrow("Original skill invocation digest mismatch");
    const alteredRequest = { ...invocationBody, request: { ...invocation.request, input: { purpose: "clarification" as const, requirement: "changed", background: "context", constraints: [] } } };
    expect(() => inputs.readInvocation(f.project, descriptor, { ...alteredRequest, input_digest: digest(alteredRequest) })).toThrow("Original skill invocation inputs changed");
    const alteredSchema = { ...invocationBody, input_schema_ref: { ...invocation.input_schema_ref, digest: digest("changed") } };
    expect(() => inputs.readInvocation(f.project, descriptor, { ...alteredSchema, input_digest: digest(alteredSchema) })).toThrow("Original skill invocation inputs changed");
    expect(f.store.listRuns(record.change_id)).toEqual([]);
  });
});
