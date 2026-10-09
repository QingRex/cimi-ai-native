import { LocalAgentStartCustody } from "./agent-start-custody-local.js";
import { resolve } from "node:path";
import type { ChildProcess } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { callerMatchesActor, type CallerContext } from "@cimiloop/kernel";
import { AgentWorkspaceToolIpc, openAgentWorkspaceToolHost, parseAgentWorkspaceToolScope, parseWorkspaceToolInvocation, AgentWorkspaceCheckHost,
  parseGatewayJson, type WorkspaceCheckRecipe, type AgentWorkspaceToolScope } from "@cimiloop/runtime-adapter";
import { LocalAgentCheckAdmission } from "./agent-check-admission-local.js";
import { LocalRunVerifier } from "./runs-local.js";
import type { LocalProject } from "./project.js";
import type { AgentWorkspaceIpcEndpoint } from "@cimiloop/runtime-adapter";
export type AgentWorkspaceToolLocalContext = Pick<LocalProject, "location"> & {
  caller: Extract<CallerContext, { kind: "agent" }>;
  store: Pick<LocalProject["store"], "getProject" | "getActor" | "getRun" | "getRuntimeRecord" | "getExecutionObject" | "getVerificationRecord">;
  kernel: Pick<LocalProject["kernel"], "assessAgentRunTool">;
};
// Original metadata reader only; this grants no Agent caller or tool authority.
export const readOriginalAgentRunInputs = (local: Pick<AgentWorkspaceToolLocalContext, "location"> & {
  store: Pick<AgentWorkspaceToolLocalContext["store"], "getProject" | "getActor" | "getRun" | "getRuntimeRecord">;
}, runId: string) => {
  const project = local.store.getProject(), run = local.store.getRun(runId), record = run && local.store.getRuntimeRecord("run_record", run.record_ref.id),
    context = record && local.store.getRuntimeRecord("context_manifest", record.context_ref.id), actor = record && local.store.getActor(record.executor_ref.id);
  if (!project || resolve(project.repository_path) !== resolve(local.location.repositoryPath) || !run || !record || record.run_kind !== "agent" || !context || !("runtime_binding" in context) ||
    !actor || actor.actor_type !== "agent" || actor.project_id !== project.id || [run, record, context].some(value => value.project_id !== project.id) ||
    record.run_id !== run.id || record.task_id !== run.task_id || context.task_id !== run.task_id || record.change_id !== run.change_id || context.change_id !== run.change_id ||
    record.work_item_ref.id !== run.work_item_ref.id || context.work_item_ref.id !== run.work_item_ref.id || context.executor_ref.id !== actor.id ||
    !isDeepStrictEqual(record.input_digest, context.input_digest) || !isDeepStrictEqual(record.runtime_binding, context.runtime_binding) ||
    !isDeepStrictEqual(record.skill_bindings, context.skill_bindings) || !isDeepStrictEqual(record.host_admission_ref, context.host_admission_ref)) throw Error("Agent workspace original identity mismatch");
  const scope = parseAgentWorkspaceToolScope({ project_id: project.id, run_id: run.id, operation_key: record.operation_key, executor_actor_id: actor.id, context_digest: record.input_digest,
    runtime_binding: record.runtime_binding, skill_bindings: record.skill_bindings, host_admission_ref: record.host_admission_ref });
  return { project, run, record, context, actor, scope };
};
export const originalAgentWorkspaceScope = <T extends Pick<AgentWorkspaceToolLocalContext, "caller" | "location" | "store">>(local: T, runId: string): AgentWorkspaceToolScope => {
  const original = readOriginalAgentRunInputs(local, runId);
  if (local.caller.kind !== "agent" || !callerMatchesActor(local.caller, original.actor)) throw Error("Agent workspace original identity mismatch");
  return original.scope;
};
const originalScope = originalAgentWorkspaceScope;
// Trusted Agent composition only. CLI/workbench Human initialization never
// selects this caller or installs the required live qualification/custody port.
export class LocalAgentWorkspaceToolService {
  private ipc?: Promise<AgentWorkspaceToolIpc>;
  private checks?: Promise<AgentWorkspaceCheckHost>;
  private checkAdmission?: LocalAgentCheckAdmission;
  private startCustody: LocalAgentStartCustody | undefined;
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
  async installChecks(nodeBinary: string, recipes: WorkspaceCheckRecipe[]) {
    if (this.checks || this.ipc) return Promise.reject(Error("Agent workspace checks already installed or IPC fixed"));
    if (!isDeepStrictEqual(originalScope(this.local, this.scope.run_id), this.scope)) return Promise.reject(Error("Agent workspace original scope changed"));
    const reader = new LocalRunVerifier(this.local.location.repositoryPath, this.local.location.dataDirectory);
    const original = parseGatewayJson(reader.content.readContent(this.scope.host_admission_ref).toString("utf8"), 1048576) as Record<string, unknown>;
    if (["cimiloop/agent-check-host-admission/1.0.0", "cimiloop/agent-start-host-admission/1.0.0"].includes(String(original?.format))) return Promise.reject(Error("Agent original admitted checks required"));
    this.checks = AgentWorkspaceCheckHost.open({ repositoryPath: this.local.location.repositoryPath, dataDirectory: this.local.location.dataDirectory,
      nodeBinary, recipes, scope: this.scope, assess: request => this.local.kernel.assessAgentRunTool(request) });
    return this.checks.then(() => undefined);
  }
  private admittedChecks(admission: LocalAgentCheckAdmission) {
    if (!isDeepStrictEqual(originalScope(this.local, this.scope.run_id), this.scope)) throw Error("Agent workspace original scope changed");
    const store = this.local.store, project = store.getProject(), run = store.getRun(this.scope.run_id), record = run && store.getRuntimeRecord("run_record", run.record_ref.id),
      context = record && store.getRuntimeRecord("context_manifest", record.context_ref.id), task = run && store.getExecutionObject("task", run.task_id),
      item = run && store.getExecutionObject("work_item", run.work_item_ref.id), source = context && store.getVerificationRecord("source_snapshot", context.source_snapshot_ref.id),
      workspace = context && store.getRuntimeRecord("workspace_snapshot", context.workspace_snapshot_ref.id);
    if (!project || !record || record.run_kind !== "agent" || !context || !("runtime_binding" in context) || !task || !item || !source || !workspace) throw Error("Agent original check inputs missing");
    return admission.forRun(project, { task, work_item: item, source, workspace, runtime_binding: record.runtime_binding, skill_bindings: record.skill_bindings }, record, context, this.scope, this.startCustody);
  }
  async installAdmittedChecks(admission: LocalAgentCheckAdmission, startCustody?: LocalAgentStartCustody) {
    if (this.checks || this.ipc) return Promise.reject(Error("Agent workspace checks already installed or IPC fixed"));
    this.startCustody = startCustody;
    const installed = this.admittedChecks(admission); this.checkAdmission = admission;
    this.checks = AgentWorkspaceCheckHost.open({ repositoryPath: this.local.location.repositoryPath, dataDirectory: this.local.location.dataDirectory, nodeBinary: installed.nodeBinary,
      recipes: installed.recipes, scope: this.scope, assess: request => this.local.kernel.assessAgentRunTool(request) }).then(async host => {
      try {
        const original = this.admittedChecks(admission), catalog = host.getCatalog();
        if (catalog.node_digest !== original.node_digest || catalog.policy_digest !== original.policy_digest || !isDeepStrictEqual(catalog.recipes, original.recipes)) throw Error("Agent installed check catalog changed");
        return host;
      } catch (error) { await host.close(); throw error; }
    });
    return this.checks.then(() => undefined);
  }
  async runChecks(raw: unknown) {
    if (!this.checks) throw Error("Agent workspace checks not installed");
    const host = await this.checks;
    if (!isDeepStrictEqual(originalScope(this.local, this.scope.run_id), this.scope)) throw Error("Agent workspace original scope changed");
    if (this.checkAdmission) this.admittedChecks(this.checkAdmission);
    return host.execute(raw);
  }
  async getCheckCatalog() {
    if (!this.checks) throw Error("Agent workspace checks not installed");
    const host = await this.checks;
    if (!isDeepStrictEqual(originalScope(this.local, this.scope.run_id), this.scope)) throw Error("Agent workspace original scope changed");
    if (this.checkAdmission) this.admittedChecks(this.checkAdmission);
    return host.getCatalog();
  }
  openIpc(supervisor: ChildProcess, originalSupervisor: AgentWorkspaceIpcEndpoint["supervisor"], originalPeer: AgentWorkspaceIpcEndpoint["peer"], options: { nonce?: string; signal?: AbortSignal | undefined } = {}) {
    const { signal, nonce } = options;
    if (signal?.aborted) return Promise.reject(Error("Agent workspace IPC aborted"));
    if (this.ipc) return Promise.reject(Error("Agent workspace IPC original peer already installed"));
    if (!isDeepStrictEqual(originalScope(this.local, this.scope.run_id), this.scope)) return Promise.reject(Error("Agent workspace original scope changed"));
    const installed = this.checks;
    this.ipc = (async () => {
      const checks = installed ? { catalog: (await installed).getCatalog(), execute: (input: unknown) => this.runChecks(input) } : undefined;
      return AgentWorkspaceToolIpc.open({ toolsDirectory: this.local.location.dataDirectory, scope: this.scope, supervisor, originalSupervisor, originalPeer, ...(nonce !== undefined ? { nonce } : {}),
        signal, ...(checks ? { checks } : {}), execute: input => this.execute(input), cancel: () => this.closeHosts() });
    })(); return this.ipc;
  }
  private async closeHosts() { await Promise.all([this.checks?.then(host => host.close(), () => undefined), this.execution.host.close()]); }
  async close() { await this.closeHosts(); const channel = await this.ipc?.catch(() => undefined); await channel?.close(); }
}
