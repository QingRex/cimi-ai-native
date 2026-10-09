import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import type { Project, AgentRunRecord } from "@cimiloop/protocol/v2";
import { queryAgentRuntimeOperation, collectAgentRuntimeOperation, requestAgentRuntimeCancellation, recoverAgentRuntimeOperation,
  RuntimeAdapterError, type AgentWorkspaceToolScope } from "@cimiloop/runtime-adapter";
import { executeLocalCommand, type LocalProject } from "./project.js";
import { readOriginalAgentRunInputs } from "./agent-workspace-tools-local.js";
import { LocalProjectError } from "./errors.js";
export interface AgentRuntimeControlPort {
  query(root: string, scope: AgentWorkspaceToolScope): Promise<unknown>;
  collect(root: string, scope: AgentWorkspaceToolScope, inputs: { project: Project; record: AgentRunRecord }): Promise<unknown>;
  requestCancellation(root: string, scope: AgentWorkspaceToolScope): unknown;
  recover(root: string, scope: AgentWorkspaceToolScope): Promise<unknown>;
}
type Operation = { outcome: "observed"; result: unknown } | { outcome: "unknown"; reason: string };
export type AgentRuntimeControlContext = Pick<LocalProject, "location" | "instance"> & {
  store: Pick<LocalProject["store"], "getProject" | "getActor" | "getRun" | "getRuntimeRecord">;
  kernel: Pick<LocalProject["kernel"], "getObject" | "execute">;
};
const defaults: AgentRuntimeControlPort = { query: queryAgentRuntimeOperation, collect: collectAgentRuntimeOperation,
  requestCancellation: requestAgentRuntimeCancellation, recover: recoverAgentRuntimeOperation };
// Human project control never impersonates the original Agent. Cancellation
// authority is the Kernel command; this service only joins its original effect.
// No start/resume entry, domain observation or cost settlement is installed.
export class LocalAgentRuntimeControl {
  constructor(private readonly local: AgentRuntimeControlContext, private readonly port: AgentRuntimeControlPort = defaults) {}
  private original(runId: string) {
    const { store, instance, location } = this.local, project = store.getProject(), operator = store.getActor(instance.actor_id);
    if (!project || project.id !== instance.project_id || project.instance_id !== instance.instance_id || operator?.actor_type !== "human" ||
      operator.project_id !== project.id || resolve(project.repository_path) !== resolve(location.repositoryPath)) {
      throw new LocalProjectError("当前 Human 入口与原项目不符", "CALLER_IDENTITY_MISMATCH", "forbidden");
    }
    const read = this.local.kernel.getObject("run", runId); if ("code" in read) throw read;
    try { return readOriginalAgentRunInputs(this.local, runId); }
    catch { throw new LocalProjectError("原 Agent 运行资料缺失或固定关系不符", "CAPABILITY_UNAVAILABLE", "conflict"); }
  }
  private async observe(original: ReturnType<LocalAgentRuntimeControl["original"]>, action: () => unknown | Promise<unknown>) {
    let operation: Operation;
    try { operation = { outcome: "observed", result: await action() }; }
    catch (error) { operation = { outcome: "unknown", reason: error instanceof RuntimeAdapterError && /^[a-z_]{1,96}$/.test(error.reason)
      ? error.reason : "agent_original_operation_unavailable" }; }
    let fresh: ReturnType<LocalAgentRuntimeControl["original"]>;
    try { fresh = this.original(original.run.id); }
    catch { throw new LocalProjectError("采集期间原运行关系发生变化", "INPUT_CHANGED", "conflict"); }
    if (!isDeepStrictEqual({ scope: fresh.scope, record: fresh.record, context: fresh.context },
      { scope: original.scope, record: original.record, context: original.context })) throw new LocalProjectError("原运行资料已改变", "INPUT_CHANGED", "conflict");
    return { ok: true as const, run_id: original.run.id, operation, starts_run: false as const, domain_observation_produced: false as const };
  }
  async query(runId: string) { const original = this.original(runId); return this.observe(original, () => this.port.query(this.local.location.dataDirectory, original.scope)); }
  async collect(runId: string) { const original = this.original(runId); return this.observe(original, () => this.port.collect(this.local.location.dataDirectory, original.scope,
    { project: original.project, record: original.record })); }
  async stop(input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input) || !("command_type" in input) || input.command_type !== "CancelRun" ||
      !("target" in input) || !input.target || typeof input.target !== "object" || !("object_type" in input.target) || input.target.object_type !== "run" ||
      !("id" in input.target) || typeof input.target.id !== "string") throw new LocalProjectError("仅支持原 Run 的取消请求", "INVALID_COMMAND");
    const original = this.original(input.target.id), command_result = executeLocalCommand(this.local, input);
    if ("code" in command_result) return command_result;
    const result = await this.retryCancellation(original.run.id); return { ...result, command_result };
  }
  private cancelled(runId: string) {
    const original = this.original(runId);
    if (!original.run.cancel_requested) throw new LocalProjectError("须先由 Kernel 记录原运行取消请求", "RECOVERY_CONDITIONS_UNMET", "conflict");
    return original;
  }
  async retryCancellation(runId: string) { const original = this.cancelled(runId); return this.observe(original,
    () => this.port.requestCancellation(this.local.location.dataDirectory, original.scope)); }
  async recover(runId: string) { const original = this.cancelled(runId); return this.observe(original,
    () => this.port.recover(this.local.location.dataDirectory, original.scope)); }
}
