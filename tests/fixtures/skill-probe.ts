import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import { LocalSkillPackageStore } from "../../packages/local-app/src/index.js";
import { skillInvocationPlan } from "../../packages/skill-adapter/src/index.js";
import * as v2 from "../../packages/protocol/src/v2/index.js";
import { createFlowProject, flowSuccess, flowTime } from "./flow-project.js";
import { createProviderProbe } from "./provider-probe.js";

// Synthetic governance fixtures: no executable, skill, model or OS sandbox is
// actually run. Positive cases exercise the verifier rules, not live admission.
export const createSkillProbeFixture = (root: string, purpose: "clarification" | "review" = "clarification",controlledRuntime=false) => {
  const f = createFlowProject(root), p = createProviderProbe(root, root), port = p.port;
  if(controlledRuntime){p.registration.capabilities.push({capability_id:'runtime.execute',version:'1.0.0'});Reflect.set(port,'readRuntimeControlEvidence',(project:v2.Project,descriptor:v2.ProviderDescriptor,evidence:v2.ProviderEvidence[])=>({format:'cimiloop/runtime-control-evidence/1.0.0',project_id:project.id,descriptor_digest:contentDigest(descriptor),evidence_digest:contentDigest(evidence.map(value=>({id:value.id,digest:contentDigest(value)}))),checks:Object.fromEntries(['network_host_limits','cost_accounting_and_cap','disk_limit','crash_recovery'].map(key=>[key,{result:'supports',basis_digest:contentDigest({PUBLIC:true,key})}]))}));}
  const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, providerVerifier: port, now: () => flowTime });
  const execute = (type: string, payload: unknown) => flowSuccess(kernel.execute(f.projectCommand(type, payload)));
  const runtimeRegistration = execute("RegisterProvider", p.registration); if (runtimeRegistration.command_type !== "RegisterProvider") throw new Error("Runtime expected");
  const runtime = runtimeRegistration.data.descriptor, runtimeScope = { descriptor_ref: { object_type: "provider_descriptor" as const, id: runtime.id }, descriptor_digest: contentDigest(runtime) };
  const runtimeObservation = execute("RecordProviderEvidence", { ...runtimeScope, raw_result_ref: p.save() }); if (runtimeObservation.command_type !== "RecordProviderEvidence") throw new Error("Runtime evidence expected");
  const runtimeEvaluation = execute("EvaluateProvider", { ...runtimeScope, profile: controlledRuntime?'controlled_execution':"technical_contract", evidence_refs: [{ object_type: "evidence", id: runtimeObservation.data.evidence.id }] }); if (runtimeEvaluation.command_type !== "EvaluateProvider") throw new Error("Runtime evaluation expected");
  const approved = execute("RegisterProviderBinding", { ...runtimeScope, evaluation_ref: { object_type: "evaluation", id: runtimeEvaluation.data.evaluation.id }, input_digest: runtimeEvaluation.data.evaluation.input_digest,
    binding_scope: controlledRuntime?'task_execution':"isolated_provider_probe", capability: controlledRuntime?runtime.capabilities.find(value=>value.capability_id==='runtime.execute'):runtime.capabilities[0], effective_permissions: runtime.required_permissions }); if (approved.command_type !== "RegisterProviderBinding") throw new Error("Runtime binding expected");
  const runtimeBinding = approved.data.binding;
  const source = join(root, "skill-source-repository"), entry = purpose === "review" ? "review" : "clarify";
  mkdirSync(join(source, "skills", entry), { recursive: true }); mkdirSync(join(source, "skills", "dependent"), { recursive: true });
  writeFileSync(join(source, "LICENSE"), "Synthetic fixture license\n");
  writeFileSync(join(source, "skills", entry, "SKILL.md"), `---\nname: ${entry}\ndescription: A synthetic method definition\n---\nCall the Skill tool with "dependent".\n`);
  writeFileSync(join(source, "skills", "dependent", "SKILL.md"), "---\nname: dependent\ndescription: A synthetic dependency\n---\nOnly report questions or findings.\n");
  const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=disabled-hooks", "-C", source, ...args], { encoding: "utf8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trim();
  git("init"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test"); git("add", "."); git("commit", "-m", "fixed method fixture");
  const capability = { capability_id: purpose === "review" ? "verification.review" : "intent.clarify", version: "1.0.0" };
  const spec: v2.SkillImportSpec = { format: "cimiloop/skill-import/1.0.0", repository_url: "https://example.test/methods", commit_id: git("rev-parse", "HEAD"),
    entry_path: `skills/${entry}`, license_path: "LICENSE", name: `fixture-${entry}`, version: "1.0.0",
    modules: [{ path: `skills/${entry}`, dependencies: ["skills/dependent"] }, { path: "skills/dependent", dependencies: [] }], capabilities: [capability], provider_dependencies: [],
    required_permissions: { actions: [], resources: [], environment_ids: [], network_hosts: [] }, harness_requirements: ["invoke_skills"], dependency_review: "Synthetic dependency is included; no live method executed." };
  const packages = new LocalSkillPackageStore(root, root), imported = packages.importGit(source, spec), registration = execute("RegisterProvider", imported.registration);
  if (registration.command_type !== "RegisterProvider") throw new Error("Skill descriptor expected");
  const descriptor = registration.data.descriptor, descriptor_ref = { object_type: "provider_descriptor" as const, id: descriptor.id }, descriptor_digest = contentDigest(descriptor);
  const artifact = (value: unknown, version: string) => ({ ...port.content.storeContent(Buffer.from(typeof value === "string" ? value : JSON.stringify(value)), "provider_probe_artifact"), version });
  const diff = artifact("Synthetic fixed diff\n", "diff.txt"), input: v2.SkillMethodInput = purpose === "review" ? { purpose, goal: "Review", spec: "A fixed requirement", standards: "A fixed standard", artifact_refs: [diff] } :
    { purpose, requirement: "Clarify a fixed requirement", background: "Synthetic context", constraints: [] };
  const output: v2.SkillMethodOutput = purpose === "review" ? { purpose, findings: [{ axis: "spec", severity: "uncertain", observation: "A fixture finding", basis_refs: [diff] }], limitations: [] } :
    { purpose, questions: ["Which behavior is expected?"], unresolved: ["Await the human answer."] };
  const snapshot: v2.SkillProbeResult = { schema_version: v2.SCHEMA_VERSION, scope: "isolated_provider_probe", kind: "skill_invocation_probe", observed_at: flowTime,
    descriptor_ref, descriptor_digest, capability, runtime_binding_ref: { object_type: "provider_binding", id: runtimeBinding.id }, runtime_binding_digest: contentDigest(runtimeBinding), calls: [], formal_execution_enabled: false };
  const driver = { kind: "opencode", binary: p.binary, binary_digest: runtime.source_ref.digest, launcher: "synthetic-unexecuted-launcher", model: "unit-test/structured-method" };
  const plan = skillInvocationPlan(imported.verified, input, purpose === "review" ? [{ ref: diff, bytes: port.readArtifact(f.project, diff) }] : []);
  const requests: { input: Record<string, unknown>; driver: typeof driver; input_digest: v2.Digest; nonce: string }[] = [];
  const hash = (value: unknown): v2.Digest => ({ algorithm: "sha256", value: createHash("sha256").update(JSON.stringify(value)).digest("hex") });
  const eventRows = (i: number, value: unknown = output) => [
    ...imported.verified.modules.map(module => ({ type: "tool_use", sessionID: `ses_unitmethod${i}`, part: { tool: "skill", state: { status: "completed", input: { name: module.name }, output: module.body } } })),
    { type: "text", sessionID: `ses_unitmethod${i}`, part: { text: JSON.stringify(value) } }, { type: "step_finish", sessionID: `ses_unitmethod${i}`, part: { reason: "stop" } }
  ];
  for (let i = 0; i < (purpose === "review" ? 2 : 1); i++) {
    const request = { input: { scope: "isolated_provider_probe", operation_key: `skill-method-${i}`, mode: "read", prompt: plan.prompt, files: plan.files, skill_profile: plan.profile, max_elapsed_ms: 1000 },
      driver: { ...driver }, input_digest: hash({}), nonce: `synthetic-${i}` };
    request.input_digest = hash({ input: request.input, driver: request.driver }); requests.push(request);
    snapshot.calls.push({ input_ref: artifact(input, "skill-input.json"), request_ref: artifact(request, "request.json"), operation: {
      schema_version: v2.SCHEMA_VERSION, scope: "isolated_provider_probe", operation_key: `skill-method-${i}`, input_digest: request.input_digest, status: "Succeeded", cancel_requested: false,
      observed_at: flowTime, session_id: `ses_unitmethod${i}`, exit_code: 0, reason: "synthetic observation only", usage: { cost_known: false },
      raw_refs: [artifact(eventRows(i).map(event => JSON.stringify(event)).join("\n") + "\n", "stdout.raw"), artifact("", "stderr.raw"),
        artifact({ phase: "ended", reason: "exited", exit_code: 0, profile: `CimiLoop.syntheticmethod${i}` }, "native-proof.json")], outputs: [] } });
  }
  const rewriteRequest = (i: number) => { const request = requests[i]!; request.input_digest = hash({ input: request.input, driver: request.driver });
    snapshot.calls[i]!.request_ref = artifact(request, "request.json"); snapshot.calls[i]!.operation.input_digest = request.input_digest; };
  const rewriteEvents = (i: number, rows: unknown[]) => { snapshot.calls[i]!.operation.raw_refs[0] = artifact(rows.map(row => JSON.stringify(row)).join("\n") + "\n", "stdout.raw"); };
  const save = () => port.content.storeContent(Buffer.from(JSON.stringify(snapshot)), "provider_probe_snapshot");
  const record = () => { const result = execute("RecordProviderEvidence", { descriptor_ref, descriptor_digest, raw_result_ref: save() }); if (result.command_type !== "RecordProviderEvidence") throw new Error("Skill evidence expected"); return result.data.evidence; };
  const assessPayload = (evidence: v2.ProviderEvidence[], profile = "technical_contract") => ({ descriptor_ref, descriptor_digest, profile, evidence_refs: evidence.map(value => ({ object_type: "evidence", id: value.id })) });
  const assess = (evidence: v2.ProviderEvidence[], profile = "technical_contract") => { const result = execute("EvaluateProvider", assessPayload(evidence, profile)); if (result.command_type !== "EvaluateProvider") throw new Error("Skill evaluation expected"); return result.data.evaluation; };
  const bindPayload = (evaluation: v2.ProviderEvaluation) => ({ descriptor_ref, descriptor_digest, evaluation_ref: { object_type: "evaluation", id: evaluation.id }, input_digest: evaluation.input_digest,
    capability, effective_permissions: descriptor.required_permissions, binding_scope: "isolated_provider_probe", runtime_binding_ref: snapshot.runtime_binding_ref, runtime_binding_digest: snapshot.runtime_binding_digest });
  return { ...f, ...p, kernel, packages, imported, descriptor, descriptor_ref, descriptor_digest, runtime, runtimeBinding, snapshot, requests, input, output, artifact, eventRows, rewriteRequest, rewriteEvents, save, record, assess, assessPayload, bindPayload };
};
