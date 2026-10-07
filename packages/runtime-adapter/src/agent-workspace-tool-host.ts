import type { AgentToolAuthorityRequest } from "@cimiloop/protocol/v2";
import { agentWorkspaceToolAuthorityRequest, parseAgentToolAssessment, parseAgentWorkspaceToolScope, type AgentWorkspaceToolScope } from "./agent-workspace-authority.js";
import { parseWorkspaceToolInvocation, WindowsWorkspaceFileBroker, type WorkspaceToolInvocation, type PreparedWorkspaceEffect } from "./workspace-files.js";
import { WorkspaceToolJournal, type WorkspaceToolReceipt } from "./workspace-tool-journal.js";
import { openWorkspaceToolResources, type WorkspaceToolPhase } from "./workspace-tool-host.js";
import { RuntimeAdapterError } from "./files.js";

interface Options {
  journal: WorkspaceToolJournal; files: WindowsWorkspaceFileBroker; scope: AgentWorkspaceToolScope;
  assess: (request: AgentToolAuthorityRequest) => unknown | Promise<unknown>;
  phase?: (phase: WorkspaceToolPhase) => void | Promise<void>;
}
export class AgentWorkspaceToolHost {
  private readonly scope: AgentWorkspaceToolScope;
  private readonly options: Options;
  private readonly abort = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private closing?: Promise<void>;
  constructor(options: Options) { this.scope = parseAgentWorkspaceToolScope(options.scope); options.journal.assertWorkspace(options.files.scopeDigest); this.options = { ...options }; }
  execute(raw: unknown): Promise<{ receipt: WorkspaceToolReceipt; replay: boolean }> {
    if (this.abort.signal.aborted) return Promise.reject(new RuntimeAdapterError("workspace_tool_host_closed"));
    let input: WorkspaceToolInvocation;
    try { input = parseWorkspaceToolInvocation(raw); agentWorkspaceToolAuthorityRequest(this.scope, input); } catch (error) { return Promise.reject(error); }
    const operation = this.perform(input); this.pending.add(operation); void operation.finally(() => this.pending.delete(operation)).catch(() => {}); return operation;
  }
  private async perform(input: WorkspaceToolInvocation) {
    const { journal, files, assess, phase } = this.options, request = agentWorkspaceToolAuthorityRequest(this.scope, input);
    const checked = async () => {
      if (this.abort.signal.aborted) throw new RuntimeAdapterError("workspace_tool_host_closed");
      const value = parseAgentToolAssessment(await assess(structuredClone(request)), request);
      if (this.abort.signal.aborted) throw new RuntimeAdapterError("workspace_tool_host_closed"); return value;
    };
    const original = await checked(), claim = journal.claimAgent(input, this.scope, original); if (claim.replay) return { receipt: claim.replay, replay: true };
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
      if (effect) { await files.discard(effect); effect = undefined; }
      if (!completed) journal.stop(claim.permit, dispatched); throw error;
    } finally { if (effect) await files.discard(effect); }
  }
  recover() {
    if (this.abort.signal.aborted) return Promise.reject(new RuntimeAdapterError("workspace_tool_host_closed"));
    const operation = (async () => { const owners = await this.options.journal.reconcileOwners(); const resources = await this.options.journal.reclaimResources(); return { owners, resources }; })();
    this.pending.add(operation); void operation.finally(() => this.pending.delete(operation)).catch(() => {}); return operation;
  }
  close(): Promise<void> {
    if (!this.closing) { this.abort.abort(); this.closing = Promise.allSettled([...this.pending]).then(() => this.options.journal.close()); } return this.closing;
  }
}
export async function openAgentWorkspaceToolHost(options: { repositoryPath: string; dataDirectory: string; scope: AgentWorkspaceToolScope; assess: Options["assess"]; phase?: Options["phase"] }) {
  const scope = parseAgentWorkspaceToolScope(options.scope), resources = await openWorkspaceToolResources({ ...options, projectId: scope.project_id });
  try { const host = new AgentWorkspaceToolHost({ ...resources, scope, assess: options.assess, ...(options.phase ? { phase: options.phase } : {}) });
    return { host, journal: resources.journal, policy: resources.policy };
  } catch (error) { resources.journal.close(); throw error; }
}
