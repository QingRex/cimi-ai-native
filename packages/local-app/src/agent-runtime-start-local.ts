import { lstatSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { inspectAgentRuntimeOriginalRegistration, directory, assertOrdinaryPath, digest } from "@cimiloop/runtime-adapter";
import { readOriginalAgentRunInputs, originalAgentWorkspaceScope, type AgentWorkspaceToolLocalContext } from "./agent-workspace-tools-local.js";
import { LocalProjectError } from "./errors.js";
import type { LocalProject } from "./project.js";
import type { AgentRunLaunchAssessment } from "@cimiloop/kernel";
import { LocalAgentStartCustody } from "./agent-start-custody-local.js";
export type AgentRuntimeStartContext = Omit<AgentWorkspaceToolLocalContext, "store" | "kernel"> & {
  store: Pick<LocalProject["store"], "readSnapshot"> & AgentWorkspaceToolLocalContext["store"];
  kernel: Pick<LocalProject["kernel"], "assessAgentRunLaunch">;
};
const unavailable = () => new LocalProjectError("原 Agent 启动资料或当前准入不可证明", "CAPABILITY_UNAVAILABLE", "conflict");
function materials(local: AgentRuntimeStartContext, runId: string) {
  const scope = originalAgentWorkspaceScope(local, runId);
  return local.store.readSnapshot(reader => {
    const original = readOriginalAgentRunInputs({ location: local.location, store: reader }, runId);
    if (!isDeepStrictEqual(original.scope, scope)) throw unavailable();
    const task = reader.getExecutionObject("task", original.run.task_id), work_item = reader.getExecutionObject("work_item", original.run.work_item_ref.id),
      source = reader.getVerificationRecord("source_snapshot", original.context.source_snapshot_ref.id), workspace = reader.getRuntimeRecord("workspace_snapshot", original.context.workspace_snapshot_ref.id),
      runtime = reader.getProviderBinding(scope.runtime_binding.binding_ref.id), skills = scope.skill_bindings.map(pin => reader.getProviderBinding(pin.binding_ref.id));
    if (!task || !work_item || !source || !workspace || !runtime || skills.some(value => !value)) throw unavailable();
    const definition = reader.getExecutionRecord("task_definition", task.definition_ref.id), contract = reader.getIntentRecord("contract_version", task.contract_ref.id), plan = reader.getIntentRecord("plan_version", task.plan_ref.id);
    if (!definition || !contract || !plan || definition.task_id !== task.id || [definition, contract, plan].some(value => value.project_id !== original.project.id || value.change_id !== task.change_id) ||
      definition.version !== task.definition_ref.domain_version || contract.version !== task.contract_ref.domain_version || plan.version !== task.plan_ref.domain_version ||
      !isDeepStrictEqual(definition.plan_ref, task.plan_ref) || !isDeepStrictEqual(plan.contract_ref, task.contract_ref)) throw unavailable();
    const input = { project: original.project, record: original.record, context: original.context, scope, task, work_item, source, workspace, runtime,
      skills: skills.filter((value): value is NonNullable<typeof value> => !!value), definition, contract, plan };
    return structuredClone({ ...input, material_digest: digest(JSON.stringify(input)) });
  });
}
export type AgentRuntimeLaunchInputs = ReturnType<typeof materials>["value"] & { launch_authority: NonNullable<AgentRunLaunchAssessment["authority"]> };
export interface AgentRuntimeStartPort {
  custody?: LocalAgentStartCustody;
  // Staging only: no Native start, model/tool effect, charge or credential export.
  // Independent live checkRunAuthority must prove original first-start custody;
  // absent local registration on a new machine is never sufficient admission.
  // Install the original budget/checks/model custody here. launch must use the
  // existing Native claim-before-effect path; no Human/JSON can supply this port.
  prepare(inputs: AgentRuntimeLaunchInputs): Promise<{ launch(): Promise<void>; dispose(): Promise<void> | void }>;
}
type StartResult = { ok: true; run_id: string; outcome: "original" | "unknown"; completion_proven: false; operation_id?: string; reason?: string };
const inflight = new Map<string, Promise<StartResult>>();
const unknown = (runId: string): StartResult => ({ ok: true, run_id: runId, outcome: "unknown", completion_proven: false, reason: "agent_original_start_unproven" });
// Kernel supplies domain authority. Durable dispatch precedes the only call to
// launch, preserving original identity even if Native claim/response is lost.
// Human callers use the guarded shared application bridge; this internal port
// still requires the original trusted Agent identity and installed composition.
export class LocalAgentRuntimeStart {
  constructor(private readonly local: AgentRuntimeStartContext, private readonly port?: AgentRuntimeStartPort) {}
  private scope(runId: string) { return originalAgentWorkspaceScope(this.local, runId); }
  private paths(runId: string) {
    const scope = this.scope(runId); return { scope, parent: join(this.local.location.dataDirectory, "agent-runtime-starts", scope.project_id, scope.run_id) };
  }
  private original(runId: string): StartResult | undefined {
    const { scope, parent } = this.paths(runId), registration = inspectAgentRuntimeOriginalRegistration(this.local.location.dataDirectory, scope);
    if (registration.status === "original") return { ok: true, run_id: runId, outcome: "original", completion_proven: false, operation_id: registration.identity.operation_id };
    if (registration.status === "unknown") return unknown(runId);
    try { assertOrdinaryPath(parent); lstatSync(parent); return unknown(runId); }
    catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) return unknown(runId); }
    if (!(this.port?.custody instanceof LocalAgentStartCustody)) throw unavailable();
    const original = readOriginalAgentRunInputs(this.local, runId);
    try { if (this.port.custody.inspectOriginal(original.project, original.record, original.context, scope).state === "claimed") return unknown(runId); }
    catch { throw unavailable(); }
  }
  private fresh(runId: string) {
    const scope = this.scope(runId), assessment = this.local.kernel.assessAgentRunLaunch(scope);
    if ("code" in assessment || assessment.decision !== "ALLOW" || !assessment.authority) throw unavailable();
    const snapshot = materials(this.local, runId), input = snapshot.value;
    if (snapshot.as_of_event_sequence !== assessment.as_of_event_sequence || assessment.authority.run_record_id !== input.record.id ||
      assessment.authority.context_id !== input.context.id || assessment.authority.work_item_id !== input.work_item.id || assessment.authority.task_id !== input.task.id) throw unavailable();
    try {
      if (!this.port?.custody) throw unavailable();
      const validation = this.port.custody.checkRunAuthority(input.project, { task: input.task, work_item: input.work_item, source: input.source,
        workspace: input.workspace, runtime_binding: input.scope.runtime_binding, skill_bindings: input.scope.skill_bindings,
        request: input.scope, record: input.record, context: input.context, runtime: input.runtime, skills: input.skills });
      if (!isDeepStrictEqual(validation, assessment.authority.host_validation_digest)) throw unavailable();
    } catch { throw unavailable(); }
    return { ...input, launch_authority: structuredClone(assessment.authority) };
  }
  async start(runId: string): Promise<StartResult> {
    const { parent } = this.paths(runId); // Validate trusted caller before joining.
    const key = resolve(parent), pending = inflight.get(key); if (pending) return pending;
    const promise = this.execute(runId); inflight.set(key, promise);
    try { return await promise; } finally { if (inflight.get(key) === promise) inflight.delete(key); }
  }
  private async execute(runId: string): Promise<StartResult> {
    const prior = this.original(runId); if (prior) return prior;
    if (!this.port || !(this.port.custody instanceof LocalAgentStartCustody)) throw unavailable();
    const input = this.fresh(runId), staged = await this.port.prepare(structuredClone(input));
    try {
      if (!isDeepStrictEqual(this.fresh(runId), input)) throw unavailable();
      const appeared = this.original(runId); if (appeared) return appeared;
      const global = this.port.custody.claimOriginal(input.project, input.record, input.context, input.scope, input.material_digest);
      if (!global.created) return unknown(runId);
      const { parent } = this.paths(runId);
      // mkdir is the atomic, never-repaired dispatch claim across processes.
      directory(join(parent, ".."));
      try { mkdirSync(parent); }
      catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") return this.original(runId) ?? unknown(runId); throw error; }
      const save = (name: string, value: unknown) => { const fd = openSync(join(parent, name), "wx");
        try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); } finally { closeSync(fd); } };
      save("materials.json", input);
      const dispatch = { format: "cimiloop/agent-runtime-start-dispatch/1.0.0", scope: input.scope, material_digest: input.material_digest,
        launch_authority: input.launch_authority };
      save("dispatch.json", dispatch);
      if (!isDeepStrictEqual(this.fresh(runId), input)) return unknown(runId);
      // No retry of launch after this persistent original dispatch, regardless
      // of error, missing acknowledgement, partial claim or machine change.
      try { await staged.launch(); } catch { /* Original dispatch retained. */ }
      return this.original(runId) ?? unknown(runId);
    } finally { await staged.dispose(); }
  }
}
