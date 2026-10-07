import { resolve } from "node:path";
import type { ChildProcess } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { callerMatchesActor, type CallerContext } from "@cimiloop/kernel";
import { AgentWorkspaceToolIpc, openAgentWorkspaceToolHost, parseAgentWorkspaceToolScope, parseWorkspaceToolInvocation, type AgentWorkspaceToolScope } from "@cimiloop/runtime-adapter";
import type { LocalProject } from "./project.js";
import type { AgentWorkspaceIpcEndpoint } from "@cimiloop/runtime-adapter";
export type AgentWorkspaceToolLocalContext = Pick<LocalProject, "location"> & {
  caller: Extract<CallerContext, { kind: "agent" }>;
  store: Pick<LocalProject["store"], "getProject" | "getActor" | "getRun" | "getRuntimeRecord">;
  kernel: Pick<LocalProject["kernel"], "assessAgentRunTool">;
};
const originalScope = (local: AgentWorkspaceToolLocalContext, runId: string): AgentWorkspaceToolScope => {
  const project = local.store.getProject(), run = local.store.getRun(runId), record = run && local.store.getRuntimeRecord("run_record", run.record_ref.id),
    context = record && local.store.getRuntimeRecord("context_manifest", record.context_ref.id), actor = record && local.store.getActor(record.executor_ref.id);
  if (!project || resolve(project.repository_path) !== resolve(local.location.repositoryPath) || !run || !record || record.run_kind !== "agent" || !context || !("runtime_binding" in context) ||
    !actor || local.caller.kind !== "agent" || !callerMatchesActor(local.caller, actor) || [run, record, context].some(value => value.project_id !== project.id) ||
    record.run_id !== run.id || record.task_id !== run.task_id || context.task_id !== run.task_id || record.change_id !== run.change_id || context.change_id !== run.change_id ||
    record.work_item_ref.id !== run.work_item_ref.id || context.work_item_ref.id !== run.work_item_ref.id || context.executor_ref.id !== actor.id ||
    !isDeepStrictEqual(record.input_digest, context.input_digest) || !isDeepStrictEqual(record.runtime_binding, context.runtime_binding) ||
    !isDeepStrictEqual(record.skill_bindings, context.skill_bindings) || !isDeepStrictEqual(record.host_admission_ref, context.host_admission_ref)) throw Error("Agent workspace original identity mismatch");
  return parseAgentWorkspaceToolScope({ project_id: project.id, run_id: run.id, operation_key: record.operation_key, executor_actor_id: actor.id, context_digest: record.input_digest,
    runtime_binding: record.runtime_binding, skill_bindings: record.skill_bindings, host_admission_ref: record.host_admission_ref });
};
// Trusted Agent composition only. CLI/workbench Human initialization never
// selects this caller or installs the required live qualification/custody port.
export class LocalAgentWorkspaceToolService {
  private ipc?: Promise<AgentWorkspaceToolIpc>;
  private constructor(private readonly local: AgentWorkspaceToolLocalContext, private readonly scope: AgentWorkspaceToolScope,
    private readonly execution: Awaited<ReturnType<typeof openAgentWorkspaceToolHost>>) {}
  static async open(local: AgentWorkspaceToolLocalContext, runId: string): Promise<LocalAgentWorkspaceToolService> {
    const scope = originalScope(local, runId), execution = await openAgentWorkspaceToolHost({ repositoryPath: local.location.repositoryPath, dataDirectory: local.location.dataDirectory,
      scope, assess: request => local.kernel.assessAgentRunTool(request) });
    return new LocalAgentWorkspaceToolService(local, scope, execution);
  }
  execute(raw: unknown) {
    const input = parseWorkspaceToolInvocation(raw);
    if (!isDeepStrictEqual(originalScope(this.local, this.scope.run_id), this.scope)) throw Error("Agent workspace original scope changed");
    return this.execution.host.execute(input);
  }
  recover() { return this.execution.host.recover(); }
  openIpc(supervisor: ChildProcess, originalSupervisor: AgentWorkspaceIpcEndpoint["supervisor"], originalPeer: AgentWorkspaceIpcEndpoint["peer"]) {
    if (this.ipc) return Promise.reject(Error("Agent workspace IPC original peer already installed"));
    if (!isDeepStrictEqual(originalScope(this.local, this.scope.run_id), this.scope)) return Promise.reject(Error("Agent workspace original scope changed"));
    this.ipc = AgentWorkspaceToolIpc.open({ toolsDirectory: this.local.location.dataDirectory, scope: this.scope, supervisor, originalSupervisor, originalPeer,
      execute: input => this.execute(input), cancel: () => this.execution.host.close() }); return this.ipc;
  }
  async close() { const channel = await this.ipc?.catch(() => undefined); await channel?.close(); await this.execution.host.close(); }
}
