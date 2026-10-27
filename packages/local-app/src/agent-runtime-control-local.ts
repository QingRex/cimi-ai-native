import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import type { Project, AgentRunRecord } from "@cimiloop/protocol/v2";
import { queryAgentRuntimeOperation, collectAgentRuntimeOperation, requestAgentRuntimeCancellation, recoverAgentRuntimeOperation,
  RuntimeAdapterError, type AgentWorkspaceToolScope } from "@cimiloop/runtime-adapter";
import { executeLocalCommand, type LocalProject } from "./project.js";
import { readOriginalAgentRunInputs } from "./agent-workspace-tools-local.js";
import { LocalProjectError } from "./errors.js";
import {captureLocalAgentParentSkillResults,type LocalAgentParentSkillResultPort} from './agent-parent-skill-results-local.js';
import {readAgentRuntimeOriginalIdentity} from '@cimiloop/runtime-adapter';
export interface AgentRuntimeControlPort {
  query(root: string, scope: AgentWorkspaceToolScope): Promise<unknown>;
  collect(root: string, scope: AgentWorkspaceToolScope, inputs: { project: Project; record: AgentRunRecord },named?:Parameters<typeof collectAgentRuntimeOperation>[3],parent?:Parameters<typeof collectAgentRuntimeOperation>[4]): Promise<unknown>;
  requestCancellation(root: string, scope: AgentWorkspaceToolScope,beforeEffect?:()=>void): unknown;
  recover(root: string, scope: AgentWorkspaceToolScope,beforeEffect?:()=>void): Promise<unknown>;
}
type Operation = { outcome: "observed"; result: unknown } | { outcome: "unknown"; reason: string };
export type AgentRuntimeControlContext = Pick<LocalProject, "location" | "instance" | "agentParentSkillResults"> & {
  store: Pick<LocalProject["store"], "getProject" | "getActor" | "getRun" | "getRuntimeRecord">;
  kernel: Pick<LocalProject["kernel"], "getObject" | "execute" | "authorizeAgentRunControl"> & Partial<Pick<LocalProject["kernel"],"getRuns">>;
};
const defaults: AgentRuntimeControlPort = { query: queryAgentRuntimeOperation, collect: collectAgentRuntimeOperation,
  requestCancellation: requestAgentRuntimeCancellation, recover: recoverAgentRuntimeOperation };
export const readHumanOriginalAgentRunInputs = (local: AgentRuntimeControlContext, runId: string) => {
  const { store, instance, location } = local, project = store.getProject(), operator = store.getActor(instance.actor_id);
  if (!project || project.id !== instance.project_id || project.instance_id !== instance.instance_id || operator?.actor_type !== "human" ||
    operator.project_id !== project.id || resolve(project.repository_path) !== resolve(location.repositoryPath)) {
    throw new LocalProjectError("当前 Human 入口与原项目不符", "CALLER_IDENTITY_MISMATCH", "forbidden");
  }
  const read = local.kernel.getObject("run", runId); if ("code" in read) throw read;
  try { return readOriginalAgentRunInputs(local, runId); }
  catch { throw new LocalProjectError("原 Agent 运行资料缺失或固定关系不符", "CAPABILITY_UNAVAILABLE", "conflict"); }
};
// Human project control never impersonates the original Agent. Cancellation
// authority is the Kernel command; this service only joins its original effect.
// Each new physical retry/recovery also requires current Kernel permission.
// No start/resume entry, domain observation or cost settlement is installed.
export class LocalAgentRuntimeControl {
  private readonly parentResults:ReturnType<typeof captureLocalAgentParentSkillResults>;
  readonly #controlKernel: AgentRuntimeControlContext["kernel"];
  readonly #controlMethod: AgentRuntimeControlContext["kernel"]["authorizeAgentRunControl"];
  readonly #authorizeControl: AgentRuntimeControlContext["kernel"]["authorizeAgentRunControl"];
  constructor(private readonly local: AgentRuntimeControlContext, private readonly port: AgentRuntimeControlPort = defaults,parentResults:LocalAgentParentSkillResultPort|undefined=local.agentParentSkillResults) {
    this.#controlKernel = local.kernel;
    this.#controlMethod = local.kernel.authorizeAgentRunControl;
    this.#authorizeControl = this.#controlMethod.bind(local.kernel);
    this.parentResults=captureLocalAgentParentSkillResults(parentResults);
  }
  private assertControlIdentity(identity: { location: AgentRuntimeControlContext['location']; instance: AgentRuntimeControlContext['instance']; store: AgentRuntimeControlContext['store']; kernel: AgentRuntimeControlContext['kernel'] }) {
    if (this.local.store !== identity.store || this.local.kernel !== identity.kernel ||
      !isDeepStrictEqual(this.local.location, identity.location) || !isDeepStrictEqual(this.local.instance, identity.instance))
      throw new LocalProjectError('控制期间本地原操作身份发生变化', 'INPUT_CHANGED', 'conflict');
  }
  private original(runId: string) {
    const controlIdentity = { location: structuredClone(this.local.location), instance: structuredClone(this.local.instance), store: this.local.store, kernel: this.local.kernel };
    const original = readHumanOriginalAgentRunInputs(this.local, runId);
    this.assertControlIdentity(controlIdentity);
    return { ...original, controlIdentity };
  }
  private authorizeControl(original: ReturnType<LocalAgentRuntimeControl["original"]>) {
    const current = () => {
      this.assertControlIdentity(original.controlIdentity);
      if (this.local.kernel !== this.#controlKernel || this.#controlKernel.authorizeAgentRunControl !== this.#controlMethod)
        throw new LocalProjectError("原 Kernel 控制权限入口发生变化", "INPUT_CHANGED", "conflict");
    };
    current();
    const permission = this.#authorizeControl(original.run.id);
    current();
    if ("code" in permission) throw permission;
  }
  private async observe(original: ReturnType<LocalAgentRuntimeControl["original"]>, action: (guard:()=>void) => unknown | Promise<unknown>, physicalControl = false, beforeEffect:()=>void=()=>{}) {
    let guardFailed=false,guardError:unknown;
    const guard=()=>{if(guardFailed)throw guardError;try{
      const value:unknown=beforeEffect();
      if(value!==undefined){if(value instanceof Promise)void value.catch(()=>{});throw new LocalProjectError('控制 guard 须同步完成','CAPABILITY_UNAVAILABLE','conflict');}
      this.assertControlIdentity(original.controlIdentity);
      if(physicalControl)this.authorizeControl(original);
    }catch(error){guardFailed=true;guardError=error;throw error;}};
    guard();
    let operation: Operation;
    try { operation = { outcome: "observed", result: await action(guard) }; }
    catch (error) { if(guardFailed)throw guardError;operation = { outcome: "unknown", reason: error instanceof RuntimeAdapterError && /^[a-z_]{1,96}$/.test(error.reason)
      ? error.reason : "agent_original_operation_unavailable" }; }
    guard();
    let fresh: ReturnType<LocalAgentRuntimeControl["original"]>;
    try { fresh = this.original(original.run.id); }
    catch { throw new LocalProjectError("采集期间原运行关系发生变化", "INPUT_CHANGED", "conflict"); }
    if (!isDeepStrictEqual({ scope: fresh.scope, record: fresh.record, context: fresh.context },
      { scope: original.scope, record: original.record, context: original.context })) throw new LocalProjectError("原运行资料已改变", "INPUT_CHANGED", "conflict");
    guard();
    return { ok: true as const, run_id: original.run.id, operation, starts_run: false as const, domain_observation_produced: false as const };
  }
  async query(runId: string,beforeEffect:()=>void=()=>{}) { const original = this.original(runId); return this.observe(original, () => this.port.query(original.controlIdentity.location.dataDirectory, original.scope),false,beforeEffect); }
  async collect(runId: string,beforeEffect:()=>void=()=>{}) { const original = this.original(runId); return this.observe(original, guard => {
    guard();
    const parent=this.parentResults?.(original.scope);
    guard();
    if(parent&&!Object.hasOwn(readAgentRuntimeOriginalIdentity(original.controlIdentity.location.dataDirectory,original.scope).input as object,'parent_skill_original_binding'))throw Error('Original parent result mode unproven');
    return parent?this.port.collect(original.controlIdentity.location.dataDirectory,original.scope,{project:original.project,record:original.record},undefined,parent):this.port.collect(original.controlIdentity.location.dataDirectory,original.scope,{project:original.project,record:original.record});
  },false,beforeEffect); }
  async stop(input: unknown,beforeEffect:()=>void=()=>{}) {
    input=structuredClone(input);
    if (!input || typeof input !== "object" || Array.isArray(input) || !("command_type" in input) || input.command_type !== "CancelRun" ||
      !("target" in input) || !input.target || typeof input.target !== "object" || !("object_type" in input.target) || input.target.object_type !== "run" ||
      !("id" in input.target) || typeof input.target.id !== "string") throw new LocalProjectError("仅支持原 Run 的取消请求", "INVALID_COMMAND");
    const original = this.original(input.target.id);
    const checked:unknown=beforeEffect();if(checked!==undefined){if(checked instanceof Promise)void checked.catch(()=>{});throw new LocalProjectError('控制 guard 须同步完成','CAPABILITY_UNAVAILABLE','conflict');}
    this.assertControlIdentity(original.controlIdentity);
    const command_result = executeLocalCommand(this.local, input);
    if ("code" in command_result) return command_result;
    const result = await this.retryCancellation(original.run.id,beforeEffect); return { ...result, command_result };
  }
  private cancelled(runId: string) {
    const original = this.original(runId);
    if (!original.run.cancel_requested) throw new LocalProjectError("须先由 Kernel 记录原运行取消请求", "RECOVERY_CONDITIONS_UNMET", "conflict");
    return original;
  }
  async retryCancellation(runId: string,beforeEffect:()=>void=()=>{}) { const original = this.cancelled(runId); return this.observe(original,
    guard => this.port.requestCancellation(original.controlIdentity.location.dataDirectory, original.scope,guard), true,beforeEffect); }
  async recover(runId: string,beforeEffect:()=>void=()=>{}) { const original = this.cancelled(runId); return this.observe(original,
    guard => this.port.recover(original.controlIdentity.location.dataDirectory, original.scope,guard), true,beforeEffect); }
}
