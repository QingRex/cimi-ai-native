import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import { compileValidator, AgentHostAdmissionReferenceSchema, ProjectSchema, TaskSchema, WorkItemSchema, SourceSnapshotSchema, WorkspaceSnapshotSchema,
  AgentRunBindingsSchema, DigestSchema, type Digest, type Project, type AgentRunRecord, type AgentContextManifest, type Task, type WorkItem, type SourceSnapshot, type WorkspaceSnapshot, type AgentRunBindings } from "@cimiloop/protocol/v2";
import { requestDigest, runContextDigest, type AgentRunAdmissionInput, type AgentRunLaunchAuthorityInput } from "@cimiloop/kernel";
import { AgentStartLedger, parseGatewayJson, copyToolJson, parseAgentWorkspaceToolScope, type AgentStartTicket, type AgentWorkspaceToolScope } from "@cimiloop/runtime-adapter";
import { LocalEvidenceVerifier } from "./evidence-local.js";
type Reference = AgentContextManifest["host_admission_ref"];
export interface AgentStartFullCustodyPort {
  // Complete Runtime/model/account/cost/quota/recovery admission remains an
  // independent trusted port. This start ledger never qualifies any provider.
  admit(project: Project, input: AgentRunAdmissionInput): Reference;
  verifyLaunch(project: Project, input: AgentRunLaunchAuthorityInput, original: Reference): Digest;
}
const exact = (raw: unknown, fields: string[]): raw is Record<string, unknown> => !!raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).sort().join(",") === [...fields].sort().join(",");
interface Admission { format: "cimiloop/agent-start-host-admission/1.0.0"; original_host_admission_ref: Reference; ticket: AgentStartTicket }
function fail(): never { throw Error("Original Agent start custody unavailable"); }
export class LocalAgentStartCustody {
  private readonly content: LocalEvidenceVerifier;
  constructor(private readonly repositoryPath: string, dataDirectory: string, private readonly ledger: AgentStartLedger, private readonly full: AgentStartFullCustodyPort) {
    this.content = new LocalEvidenceVerifier(repositoryPath, dataDirectory);
  }
  private capture(rawProject: Project, rawInput: AgentRunAdmissionInput) {
    const project = structuredClone(compileValidator<Project>(ProjectSchema)(rawProject));
    const input = { task: structuredClone(compileValidator<Task>(TaskSchema)(rawInput.task)), work_item: structuredClone(compileValidator<WorkItem>(WorkItemSchema)(rawInput.work_item)),
      source: structuredClone(compileValidator<SourceSnapshot>(SourceSnapshotSchema)(rawInput.source)), workspace: structuredClone(compileValidator<WorkspaceSnapshot>(WorkspaceSnapshotSchema)(rawInput.workspace)),
      ...structuredClone(compileValidator<AgentRunBindings>(AgentRunBindingsSchema)({ runtime_binding: rawInput.runtime_binding, skill_bindings: rawInput.skill_bindings })) };
    if (resolve(project.repository_path) !== resolve(this.repositoryPath) || [input.task, input.work_item, input.source, input.workspace].some(value => value.project_id !== project.id || value.change_id !== input.task.change_id) ||
      input.work_item.task_id !== input.task.id || input.workspace.task_id !== input.task.id || input.workspace.work_item_ref.id !== input.work_item.id || input.source.id !== input.workspace.source_snapshot_ref.id || input.source.repository_ref.id !== project.id ||
      ["definition_ref", "contract_ref", "plan_ref"].some(key => !isDeepStrictEqual(input.work_item[key as "definition_ref"], input.task[key as "definition_ref"]) || !isDeepStrictEqual(input.workspace[key as "definition_ref"], input.task[key as "definition_ref"]))) fail();
    // Mutable Task revision/status/usage are intentionally not part of the old
    // Context identity. Current authority remains the Kernel's live decision.
    const basis = { project_id: project.id, task_id: input.task.id, change_id: input.task.change_id, work_item_id: input.work_item.id, executor_actor_id: input.work_item.executor_ref.id,
      definition_ref: input.task.definition_ref, contract_ref: input.task.contract_ref, plan_ref: input.task.plan_ref,
      allowed_actions: input.work_item.allowed_actions, allowed_resources: input.work_item.allowed_resources, budget: input.work_item.budget, stop_conditions: input.work_item.stop_conditions,
      source_id: input.source.id, source_digest: input.source.source_digest, commit_id: input.source.commit_id, workspace_id: input.workspace.id, workspace_digest: input.workspace.state_digest, workspace_manifest_ref: input.workspace.manifest_ref,
      runtime_binding: input.runtime_binding, skill_bindings: input.skill_bindings };
    return { project, input, basis };
  }
  admit(project: Project, input: AgentRunAdmissionInput): Reference {
    const captured = this.capture(project, input), original = structuredClone(compileValidator<Reference>(AgentHostAdmissionReferenceSchema)(
      this.full.admit(structuredClone(captured.project), structuredClone(captured.input))));
    this.content.readContent(original); const ticket = this.ledger.issue(captured.basis);
    return this.content.storeContent(Buffer.from(JSON.stringify({ format: "cimiloop/agent-start-host-admission/1.0.0", original_host_admission_ref: original, ticket })), "agent_host_admission");
  }
  private read(reference: Reference): Admission {
    const ref = compileValidator<Reference>(AgentHostAdmissionReferenceSchema)(structuredClone(reference));
    const body = copyToolJson(parseGatewayJson(new TextDecoder("utf-8", { fatal: true }).decode(this.content.readContent(ref)), 65536));
    if (!exact(body, ["format", "original_host_admission_ref", "ticket"]) || body.format !== "cimiloop/agent-start-host-admission/1.0.0") fail();
    const original = structuredClone(compileValidator<Reference>(AgentHostAdmissionReferenceSchema)(body.original_host_admission_ref));
    this.content.readContent(original); this.ledger.readTicket(body.ticket as AgentStartTicket);
    return { format: "cimiloop/agent-start-host-admission/1.0.0", original_host_admission_ref: original, ticket: structuredClone(body.ticket) as AgentStartTicket };
  }
  // Trusted composition only: re-read and prove the pinned start origin before
  // delegating the unchanged inner admission to its own independent subsystem.
  originalAdmission(reference: Reference): Reference { return structuredClone(this.read(reference).original_host_admission_ref); }
  private original(project: Project, record: AgentRunRecord, context: AgentContextManifest, rawScope: AgentWorkspaceToolScope) {
    const scope = parseAgentWorkspaceToolScope(rawScope), admission = this.read(context.host_admission_ref), basis = this.ledger.readTicket(admission.ticket);
    if (resolve(project.repository_path) !== resolve(this.repositoryPath) || !isDeepStrictEqual(record.host_admission_ref, context.host_admission_ref) ||
      record.project_id !== project.id || context.project_id !== project.id || record.run_id !== scope.run_id || record.operation_key !== scope.operation_key ||
      context.id !== record.context_ref.id || !isDeepStrictEqual(scope.host_admission_ref, record.host_admission_ref) ||
      !isDeepStrictEqual(scope.context_digest, record.input_digest) || !isDeepStrictEqual(scope.context_digest, runContextDigest(context)) ||
      scope.executor_actor_id !== record.executor_ref.id || !isDeepStrictEqual(scope.runtime_binding, record.runtime_binding) || !isDeepStrictEqual(scope.skill_bindings, record.skill_bindings) ||
      !basis || typeof basis !== "object" || !("project_id" in basis) || basis.project_id !== project.id || !("task_id" in basis) || basis.task_id !== record.task_id ||
      !("work_item_id" in basis) || basis.work_item_id !== record.work_item_ref.id || !("workspace_id" in basis) || basis.workspace_id !== record.workspace_before_ref.id) fail();
    return { admission, scope };
  }
  inspectOriginal(project: Project, record: AgentRunRecord, context: AgentContextManifest, scope: AgentWorkspaceToolScope) {
    const original = this.original(project, record, context, scope); return this.ledger.inspect(original.admission.ticket, original.scope);
  }
  claimOriginal(project: Project, record: AgentRunRecord, context: AgentContextManifest, scope: AgentWorkspaceToolScope, material: Digest) {
    const original = this.original(project, record, context, scope); return this.ledger.claim(original.admission.ticket, original.scope, material);
  }
  checkRunAuthority(project: Project, rawInput: AgentRunLaunchAuthorityInput): Digest {
    const input = structuredClone(rawInput), captured = this.capture(project, input), original = this.original(captured.project, input.record, input.context, input.request);
    if (!isDeepStrictEqual(this.ledger.readTicket(original.admission.ticket), captured.basis)) fail();
    this.ledger.inspect(original.admission.ticket, original.scope); // Claimed is read-only identity; service never launches it again.
    const validation = structuredClone(compileValidator<Digest>(DigestSchema)(this.full.verifyLaunch(structuredClone(project), input, structuredClone(original.admission.original_host_admission_ref))));
    this.ledger.readTicket(original.admission.ticket);
    return { algorithm: "sha256", value: requestDigest({ validation, ticket: original.admission.ticket, original_host_admission_ref: original.admission.original_host_admission_ref }) };
  }
}
