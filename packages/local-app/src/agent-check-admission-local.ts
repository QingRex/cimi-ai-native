import { LocalAgentStartCustody } from "./agent-start-custody-local.js";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { AgentRunAdmissionInput, AgentRunToolAuthorityInput } from "@cimiloop/kernel";
import { runContextDigest } from "@cimiloop/kernel";
import { compileValidator, AgentHostAdmissionReferenceSchema, AgentRunBindingsSchema, ProjectSchema, TaskSchema, WorkItemSchema, SourceSnapshotSchema, WorkspaceSnapshotSchema, DigestSchema,
  type Project, type AgentContextManifest, type AgentRunRecord, type Digest } from "@cimiloop/protocol/v2";
import { WorkspaceCheckInstallation, parseWorkspaceCheckTemplate, parseWorkspaceCheckRecipe, copyToolJson, parseGatewayJson, digest,
  type WorkspaceCheckTemplate, type WorkspaceCheckRecipe, type AgentWorkspaceToolScope } from "@cimiloop/runtime-adapter";
import { LocalRunVerifier } from "./runs-local.js";

type AdmissionReference = AgentContextManifest["host_admission_ref"];
export interface AgentCheckCustodyPort {
  // The check subsystem cannot qualify a provider, bill an account or replace
  // the original full Runtime admission. Both callbacks are trusted host-only.
  admit(project: Project, input: AgentRunAdmissionInput): AdmissionReference;
  verify(project: Project, input: AgentRunToolAuthorityInput, original: AdmissionReference): Digest;
}
interface Options { repositoryPath: string; dataDirectory: string; nodeBinary: string; projectId: string; templates: WorkspaceCheckTemplate[]; custody: AgentCheckCustodyPort }
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const contains = (bound: string, path: string) => bound === path || bound.endsWith("/**") && path.startsWith(bound.slice(0, -2));
function fail(reason: string): never { throw Error(reason); }

// Explicit trusted composition; never installed by Human CLI/workbench. Pins
// actual Context inputs before Run IDs exist. This is only the checks portion
// of admission; the required original full custody port remains authoritative.
export class LocalAgentCheckAdmission {
  verifyInstallation():void {this.installation.verify();}
  assertInstalledConfiguration(nodeBinary:string,raw:readonly WorkspaceCheckTemplate[]):void {
    this.installation.verify();
    const templates=raw.map(parseWorkspaceCheckTemplate).sort((a,b)=>a.check_id<b.check_id?-1:a.check_id>b.check_id?1:0);
    if(resolve(nodeBinary)!==resolve(this.options.nodeBinary)||!isDeepStrictEqual(templates,this.options.templates))fail('Agent installed check configuration mismatch');
    this.installation.verify();
  }
  private constructor(private readonly options: Options, private readonly installation: WorkspaceCheckInstallation, private readonly runs: LocalRunVerifier) {}
  static async open(raw: Options): Promise<LocalAgentCheckAdmission> {
    if (!Array.isArray(raw.templates) || !raw.templates.length || raw.templates.length > 16 || typeof raw.custody?.admit !== "function" || typeof raw.custody?.verify !== "function") fail("Agent check admission configuration invalid");
    const templates = raw.templates.map(parseWorkspaceCheckTemplate).sort((a, b) => a.check_id < b.check_id ? -1 : a.check_id > b.check_id ? 1 : 0);
    if (new Set(templates.map(value => value.check_id)).size !== templates.length) fail("Agent check admission configuration invalid");
    const options: Options = { ...raw, templates, custody: { admit: raw.custody.admit, verify: raw.custody.verify } };
    const installation = await WorkspaceCheckInstallation.open(options);
    return new LocalAgentCheckAdmission(options, installation, new LocalRunVerifier(options.repositoryPath, options.dataDirectory));
  }
  private capture(rawProject: Project, rawInput: AgentRunAdmissionInput) {
    const project = compileValidator<Project>(ProjectSchema)(copyToolJson(rawProject)), value = copyToolJson(rawInput);
    if (!exact(value, ["task", "work_item", "source", "workspace", "runtime_binding", "skill_bindings"])) fail("Agent check admission inputs invalid");
    const input: AgentRunAdmissionInput = {
      task: compileValidator<AgentRunAdmissionInput["task"]>(TaskSchema)(value.task), work_item: compileValidator<AgentRunAdmissionInput["work_item"]>(WorkItemSchema)(value.work_item),
      source: compileValidator<AgentRunAdmissionInput["source"]>(SourceSnapshotSchema)(value.source), workspace: compileValidator<AgentRunAdmissionInput["workspace"]>(WorkspaceSnapshotSchema)(value.workspace),
      ...compileValidator<Pick<AgentRunAdmissionInput, "runtime_binding" | "skill_bindings">>(AgentRunBindingsSchema)({ runtime_binding: value.runtime_binding, skill_bindings: value.skill_bindings })
    };
    const { task, work_item: item, source, workspace } = input;
    if (project.id !== this.options.projectId || resolve(project.repository_path) !== resolve(this.options.repositoryPath) ||
      [task, item, source, workspace].some(record => record.project_id !== project.id || record.change_id !== task.change_id) || item.task_id !== task.id ||
      workspace.task_id !== task.id || workspace.work_item_ref.id !== item.id || workspace.source_snapshot_ref.id !== source.id || source.repository_ref.id !== project.id ||
      ["definition_ref", "contract_ref", "plan_ref"].some(key => !isDeepStrictEqual(item[key as "definition_ref"], task[key as "definition_ref"]) || !isDeepStrictEqual(workspace[key as "definition_ref"], task[key as "definition_ref"])) ||
      !item.allowed_actions.includes("read_files") || !item.allowed_actions.includes("run_checks")) fail("Agent check admission inputs mismatch");
    this.installation.verify();
    const manifest = this.runs.readAdmittedWorkspace(project, workspace);
    if (!isDeepStrictEqual(manifest.allowed_resources, item.allowed_resources) || manifest.head_commit_id !== source.commit_id || !isDeepStrictEqual(manifest.head_source_digest, source.source_digest)) fail("Agent check admission workspace mismatch");
    const recipes: WorkspaceCheckRecipe[] = this.options.templates.map(template => ({ ...template, ...(template.source_policy ? {editable_inputs:template.inputs.filter(source=>!source.expected_digest).map(source=>source.path)} : {}), inputs: template.inputs.map(required => {
      if (!item.allowed_resources.some(bound => contains(bound, required.path))) fail("Agent check input outside WorkItem");
      const file = manifest.files.find(file => file.path === required.path);
      if (!file || file.state !== "present") fail("Agent check input missing from original workspace");
      const bytes = this.runs.content.readContent(file.content_ref);
      if (bytes.length > 16384) fail("Agent check input exceeds file limit");
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (required.expected_digest && required.expected_digest !== file.content_ref.digest.value) fail("Agent check fixed harness changed");
      return { path: required.path, expected_digest: file.content_ref.digest.value };
    }) }));
    // Mutable Task usage/status/revision and generated workspace/Context/Run IDs
    // are excluded. Original definition, permissions, budget and workspace bytes
    // remain fixed through reservation and tool rechecks.
    const basis = { project_id: project.id, repository_path_digest: digest(this.installation.files.repositoryPath.toLowerCase()).value,
      task_id: task.id, change_id: task.change_id, definition_ref: task.definition_ref, contract_ref: task.contract_ref, plan_ref: task.plan_ref,
      work_item_id: item.id, executor_ref: item.executor_ref, allowed_actions: item.allowed_actions, allowed_resources: item.allowed_resources, budget: item.budget,
      stop_conditions: item.stop_conditions, source_ref: { object_type: "source_snapshot", id: source.id }, source_digest: source.source_digest, commit_id: source.commit_id,
      workspace_state_digest: workspace.state_digest, workspace_manifest_ref: workspace.manifest_ref, runtime_binding: input.runtime_binding, skill_bindings: input.skill_bindings };
    return { project, input, basis, recipes };
  }
  private body(captured: ReturnType<LocalAgentCheckAdmission["capture"]>, original: AdmissionReference) {
    return { format: "cimiloop/agent-check-host-admission/1.0.0" as const, original_host_admission_ref: original,
      basis_digest: digest(JSON.stringify(captured.basis)).value, templates_digest: digest(JSON.stringify(this.options.templates)).value,
      node_digest: this.installation.node.digest.value, policy_digest: this.installation.policyDigest, recipes: captured.recipes };
  }
  admit(project: Project, input: AgentRunAdmissionInput): AdmissionReference {
    const captured = this.capture(project, input), original = structuredClone(compileValidator<AdmissionReference>(AgentHostAdmissionReferenceSchema)(
      this.options.custody.admit(structuredClone(captured.project), structuredClone(captured.input))));
    this.runs.content.readContent(original);
    // Recheck after the delegated synchronous callback too. It cannot switch the
    // fixed installation or mutate the already detached original inputs.
    const current = this.capture(captured.project, captured.input);
    return this.runs.content.storeContent(Buffer.from(JSON.stringify(this.body(current, original))), "agent_host_admission");
  }
  read(project: Project, input: AgentRunAdmissionInput, reference: AdmissionReference, startCustody?: LocalAgentStartCustody) {
    if (startCustody !== undefined) {
      if (!(startCustody instanceof LocalAgentStartCustody)) fail("Agent original start custody invalid");
      reference = startCustody.originalAdmission(reference);
    }
    const captured = this.capture(project, input), originalReference = compileValidator<AdmissionReference>(AgentHostAdmissionReferenceSchema)(copyToolJson(reference));
    const record = copyToolJson(parseGatewayJson(this.runs.content.readContent(originalReference).toString("utf8"), 1048576));
    if (!exact(record, ["format", "original_host_admission_ref", "basis_digest", "templates_digest", "node_digest", "policy_digest", "recipes"]) || record.format !== "cimiloop/agent-check-host-admission/1.0.0") fail("Agent original check admission missing");
    const original = compileValidator<AdmissionReference>(AgentHostAdmissionReferenceSchema)(record.original_host_admission_ref);
    this.runs.content.readContent(original);
    const expected = this.body(captured, original);
    if (!isDeepStrictEqual(JSON.parse(JSON.stringify(record)), expected)) fail("Agent original check admission mismatch");
    return { original_host_admission_ref: structuredClone(original), recipes: structuredClone(captured.recipes), node_digest: expected.node_digest, policy_digest: expected.policy_digest };
  }
  validateTool(project: Project, input: AgentRunToolAuthorityInput, startCustody?: LocalAgentStartCustody): Digest {
    const captured = structuredClone(input), originalInput = { task: captured.task, work_item: captured.work_item, source: captured.source, workspace: captured.workspace,
      runtime_binding: captured.runtime_binding, skill_bindings: captured.skill_bindings }, admitted = this.read(project, originalInput, captured.record.host_admission_ref, startCustody);
    if (!isDeepStrictEqual(captured.context.host_admission_ref, captured.record.host_admission_ref) || !isDeepStrictEqual(captured.request.host_admission_ref, captured.record.host_admission_ref) ||
      captured.request.action === "run_checks" && !admitted.recipes.some(recipe => recipe.entry === captured.request.resource)) fail("Agent check tool outside admitted catalog");
    const original = compileValidator<Digest>(DigestSchema)(this.options.custody.verify(structuredClone(project), captured, admitted.original_host_admission_ref));
    // This is a combined validation digest, not an assertion of model/billing
    // qualification. The original full custody callback must still prove that.
    this.read(project, originalInput, input.record.host_admission_ref, startCustody);
    return digest(JSON.stringify({ original, check_admission: input.record.host_admission_ref }));
  }
  forRun(project: Project, input: AgentRunAdmissionInput, record: AgentRunRecord, context: AgentContextManifest, scope: AgentWorkspaceToolScope, startCustody?: LocalAgentStartCustody) {
    if ([record, context].some(value => value.project_id !== project.id || value.task_id !== input.task.id || value.change_id !== input.task.change_id || value.work_item_ref.id !== input.work_item.id ||
      value.executor_ref.id !== input.work_item.executor_ref.id || value.source_snapshot_ref.id !== input.source.id || ["definition_ref", "contract_ref", "plan_ref"].some(key => !isDeepStrictEqual(value[key as "definition_ref"], input.task[key as "definition_ref"]))) ||
      scope.project_id !== project.id || record.workspace_before_ref.id !== input.workspace.id || context.workspace_snapshot_ref.id !== input.workspace.id ||
      !isDeepStrictEqual(runContextDigest(context), context.input_digest) || record.run_id !== scope.run_id || record.operation_key !== scope.operation_key || record.executor_ref.id !== scope.executor_actor_id ||
      record.context_ref.id !== context.id || !isDeepStrictEqual(record.input_digest, scope.context_digest) || !isDeepStrictEqual(context.input_digest, scope.context_digest) ||
      !isDeepStrictEqual(record.host_admission_ref, context.host_admission_ref) || !isDeepStrictEqual(record.host_admission_ref, scope.host_admission_ref) ||
      !isDeepStrictEqual(record.runtime_binding, scope.runtime_binding) || !isDeepStrictEqual(record.skill_bindings, scope.skill_bindings)) fail("Agent original check Run mismatch");
    const admitted = this.read(project, input, record.host_admission_ref, startCustody);
    return { nodeBinary: this.installation.node.path, recipes: admitted.recipes.map(recipe => parseWorkspaceCheckRecipe(recipe, scope)), node_digest: admitted.node_digest, policy_digest: admitted.policy_digest };
  }
}
