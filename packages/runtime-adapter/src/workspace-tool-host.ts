import type { ToolAuthorityRequest, Project, RunRecord } from "@cimiloop/protocol/v2";
import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { parseToolAssessment } from "./tool-journal.js";
import { parseWorkspaceToolInvocation, WindowsWorkspaceFileBroker, type PreparedWorkspaceEffect } from "./workspace-files.js";
import { WorkspaceToolJournal, workspaceToolAuthorityRequest, WORKSPACE_TOOL_SLOT_BYTES, type WorkspaceToolReceipt } from "./workspace-tool-journal.js";
import { RuntimeAdapterError, digest, directory, bytesAt, atomicJson, assertOrdinaryPath } from "./files.js";
import { rememberOriginalObservation } from "./runtime-binary-originals.js";
import { parseGatewayJson } from "./gateway-conversation.js";
import { buildWindowsLauncher } from "./native.js";
import { creditHostDependencies } from "./gateway-credit-owner.js";
import { AgentWorkspaceCheckHost } from "./workspace-checks.js";

export type WorkspaceToolPhase = "reserved_committed" | "native_prepared" | "dispatch_committed" | "effect_completed" | "completion_committed";
interface Options {
  journal: WorkspaceToolJournal; files: WindowsWorkspaceFileBroker;
  // Actual Kernel query installed by the trusted local composition. Neither
  // Runtime input nor an imported authority report supplies this callback.
  assess: (request: ToolAuthorityRequest) => unknown | Promise<unknown>;
  phase?: (phase: WorkspaceToolPhase) => void | Promise<void>;
}
export class WorkspaceToolHost {
  private readonly abort = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private closing?: Promise<void>;
  private readonly options: Options;
  constructor(options: Options) { options.journal.assertWorkspace(options.files.scopeDigest); this.options = { ...options }; }
  execute(raw: unknown): Promise<{ receipt: WorkspaceToolReceipt; replay: boolean }> {
    if (this.abort.signal.aborted) return Promise.reject(new RuntimeAdapterError("workspace_tool_host_closed"));
    let input: ReturnType<typeof parseWorkspaceToolInvocation>;
    try { input = parseWorkspaceToolInvocation(raw); } catch (error) { return Promise.reject(error); }
    const operation = this.perform(input); this.pending.add(operation); void operation.finally(() => this.pending.delete(operation)).catch(() => {}); return operation;
  }
  private async perform(input: ReturnType<typeof parseWorkspaceToolInvocation>) {
    const { journal, files, assess, phase } = this.options, request = workspaceToolAuthorityRequest(input);
    const checked = async () => {
      if (this.abort.signal.aborted) throw new RuntimeAdapterError("workspace_tool_host_closed");
      const value = parseToolAssessment(await assess(structuredClone(request)), request);
      if (this.abort.signal.aborted) throw new RuntimeAdapterError("workspace_tool_host_closed"); return value;
    };
    const original = await checked(), claim = journal.claim(input, original); if (claim.replay) return { receipt: claim.replay, replay: true };
    let effect: PreparedWorkspaceEffect | undefined, dispatched = false, completed = false;
    const current = async () => { const value = await checked(); if (original.decision !== "ALLOW" || value.decision !== "ALLOW" ||
      original.authority.basis_digest.value !== value.authority.basis_digest.value) throw new RuntimeAdapterError("workspace_tool_authority_changed"); };
    try {
      await phase?.("reserved_committed"); await current(); effect = await files.prepare(input, this.abort.signal);
      journal.prepare(claim.permit, effect.proof); await phase?.("native_prepared"); await current();
      journal.dispatch(claim.permit); dispatched = true; await phase?.("dispatch_committed"); await current();
      const native = await files.commit(effect); effect = undefined; await phase?.("effect_completed");
      const receipt = journal.complete(claim.permit, native); completed = true; await phase?.("completion_committed"); return { receipt, replay: false };
    } catch (error) {
      // Join the owned broker before declaring an undispatched call not_started.
      // Once dispatch is durable, any missing completion remains Unknown.
      if (effect) { await files.discard(effect); effect = undefined; }
      if (!completed) journal.stop(claim.permit, dispatched); throw error;
    } finally { if (effect) await files.discard(effect); }
  }
  close(): Promise<void> {
    if (!this.closing) { this.abort.abort(); this.closing = Promise.allSettled([...this.pending]).then(() => this.options.journal.close()); } return this.closing;
  }
  recover() {
    if (this.abort.signal.aborted) return Promise.reject(new RuntimeAdapterError("workspace_tool_host_closed"));
    const operation = (async () => { const owners = await this.options.journal.reconcileOwners(); const resources = await this.options.journal.reclaimResources(); return { owners, resources }; })();
    this.pending.add(operation); void operation.finally(() => this.pending.delete(operation)).catch(() => {}); return operation;
  }
}
const location = (dataDirectory: string, projectId: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(projectId)) throw new RuntimeAdapterError("workspace_tool_project_invalid");
  const root = assertOrdinaryPath(join(dataDirectory, "workspace-tools"));
  return { root, journal: join(root, projectId + ".sqlite"), marker: join(root, projectId + ".json") };
};
const markerAt = (path: string, projectId: string, repositoryPathDigest: string): string => {
  const value = parseGatewayJson(bytesAt(path, 4096).toString()) as Record<string, unknown>;
  if (!value || Object.keys(value).sort().join(",") !== "format,journal_policy_digest,project_id,repository_path_digest" || value.format !== "cimiloop/workspace-tool-anchor/1.0.0" ||
    value.project_id !== projectId || value.repository_path_digest !== repositoryPathDigest || typeof value.journal_policy_digest !== "string" || !/^[a-f0-9]{64}$/.test(value.journal_policy_digest)) throw new RuntimeAdapterError("workspace_tool_anchor_unproven");
  return value.journal_policy_digest;
};
// Shared original project resources. Human and Agent hosts cannot choose a
// second journal to evade an in-flight/Unknown path, file identity or slot.
export async function openWorkspaceToolResources(options: { repositoryPath: string; dataDirectory: string; projectId: string }) {
  const paths = location(options.dataDirectory, options.projectId), files = await WindowsWorkspaceFileBroker.open(options.repositoryPath, options.dataDirectory);
  const repository_path_digest = digest(files.repositoryPath.toLowerCase()).value;
  const policy = { format: "cimiloop/workspace-tool-journal/1.0.0" as const, scope: "authorized_workspace" as const, project_id: options.projectId,
    repository_path_digest, root_identity: { ...files.rootIdentity }, scope_digest: files.scopeDigest, maximum_entries: 128, maximum_bytes: 128 * WORKSPACE_TOOL_SLOT_BYTES };
  if (existsSync(paths.marker) !== existsSync(paths.journal)) throw new RuntimeAdapterError("workspace_tool_anchor_missing");
  if (existsSync(paths.marker) && markerAt(paths.marker, options.projectId, repository_path_digest) !== digest(JSON.stringify(policy)).value) throw new RuntimeAdapterError("workspace_tool_scope_changed");
  directory(paths.root); const launcher = await buildWindowsLauncher(options.dataDirectory), owners = await creditHostDependencies(launcher);
  const journal = new WorkspaceToolJournal(paths.journal, policy, { ...owners, reclaimStaging: (proof, owner) => files.reclaimStaging(proof, owner) });
  try {
    if (!existsSync(paths.marker)) atomicJson(paths.marker, { format: "cimiloop/workspace-tool-anchor/1.0.0", project_id: options.projectId, repository_path_digest, journal_policy_digest: digest(JSON.stringify(policy)).value });
    return { files, journal, policy };
  } catch (error) { journal.close(); throw error; }
}
export async function openWorkspaceToolHost(options: { repositoryPath: string; dataDirectory: string; projectId: string; assess: Options["assess"]; phase?: Options["phase"] }) {
  const resources = await openWorkspaceToolResources(options);
  try { const host = new WorkspaceToolHost({ ...resources, assess: options.assess, ...(options.phase ? { phase: options.phase } : {}) });
    return { host, journal: resources.journal, policy: resources.policy };
  } catch (error) { resources.journal.close(); throw error; }
}
// Missing an established anchor/journal is an error, never an empty successful
// ledger. Reads do not require current WorkItem permission or authorize effects.
export function readWorkspaceToolRunFacts(dataDirectory: string, project: Project, record: RunRecord) {
  const checks = AgentWorkspaceCheckHost.readRunFacts(dataDirectory, project, record);
  const paths = location(dataDirectory, project.id), marker = existsSync(paths.marker), journal = existsSync(paths.journal);
  if (!marker && !journal) return checks;
  if (!marker || !journal) throw new RuntimeAdapterError("workspace_tool_anchor_missing");
  const repositoryPathDigest = digest(realpathSync(assertOrdinaryPath(project.repository_path)).toLowerCase()).value;
  const files = WorkspaceToolJournal.readRunFacts(paths.journal, project.id, repositoryPathDigest, record, markerAt(paths.marker, project.id, repositoryPathDigest));
  return { invocations: files.invocations + checks.invocations, unresolved: files.unresolved + checks.unresolved, has_effect: files.has_effect || checks.has_effect };
}

export function readWorkspaceFileRunOriginals(dataDirectory: string, project: Pick<Project, "id" | "repository_path">,
  record: Pick<RunRecord, "run_id" | "operation_key" | "executor_ref" | "input_digest"> & Partial<Pick<RunRecord, "run_kind">> & Partial<{ runtime_binding: unknown; skill_bindings: unknown; host_admission_ref: unknown }>) {
  const repository_path=realpathSync(assertOrdinaryPath(project.repository_path)).toLowerCase();
  const verified=digest(JSON.stringify({repository_path,run_kind:record.run_kind??null,executor_ref:record.executor_ref,input_digest:record.input_digest,runtime_binding:record.runtime_binding??null,skill_bindings:record.skill_bindings??null,host_admission_ref:record.host_admission_ref??null})).value;
  return rememberOriginalObservation("workspace-files\0"+dataDirectory+"\0"+project.id+"\0"+record.run_id+"\0"+record.operation_key+"\0"+verified,()=>readWorkspaceFileRunOriginalsNow(dataDirectory,project,record));
}
function readWorkspaceFileRunOriginalsNow(dataDirectory: string, project: Pick<Project, "id" | "repository_path">,
  record: Pick<RunRecord, "run_id" | "operation_key" | "executor_ref" | "input_digest">) {
  const paths = location(dataDirectory, project.id), marker = existsSync(paths.marker), journal = existsSync(paths.journal);
  if (!marker && !journal) return { facts: { invocations: 0, unresolved: 0, has_effect: false }, calls: [] };
  if (!marker || !journal) throw new RuntimeAdapterError("workspace_tool_anchor_missing");
  const repositoryPathDigest = digest(realpathSync(assertOrdinaryPath(project.repository_path)).toLowerCase()).value;
  return WorkspaceToolJournal.readRunOriginals(paths.journal, project.id, repositoryPathDigest, record, markerAt(paths.marker, project.id, repositoryPathDigest));
}
