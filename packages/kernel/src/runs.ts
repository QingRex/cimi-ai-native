import { SCHEMA_VERSION, compileValidator, RawRunObservationSchema, WorkspaceManifestSchema,
  type AnyCommand, type CommandSuccess, type DomainError, type Project, type SourceSnapshot, type Digest,
  type Task, type WorkItem, type Run, type RunRecord, type ContextManifest, type WorkspaceSnapshot, type WorkspaceManifest,
  type RawRunObservation, type RunObservation, type HandoffRecord, type ResumptionRecord } from "@cimiloop/protocol/v2";
import type { StoreTransaction } from "@cimiloop/store";
import { assignmentIsEffective } from "./authorization.js";
import { admissionFailure, contentDigest, IntentFailure, type IntentContext } from "./intent.js";
import { budgetRemaining, executionReadiness, usageDigest, resourceContains } from "./execution.js";
import { agentBindingStatus } from "./providers.js";

// A host verifies bytes and captures the real workspace. Commands cannot provide
// their own verifier. This stage records Human runs; it does not launch a runtime.
export interface RunVerifierPort {
  sourceDigest(project: Project, commitId: string): Digest;
  sourceIsCurrent(project: Project, snapshot: SourceSnapshot): boolean;
  captureWorkspace(project: Project, allowedResources: string[]): { manifest: WorkspaceManifest; manifest_ref: WorkspaceSnapshot["manifest_ref"] };
  readWorkspace(project: Project, snapshot: WorkspaceSnapshot): WorkspaceManifest;
  workspaceIsCurrent(project: Project, snapshot: WorkspaceSnapshot): boolean;
  readRunResult(project: Project, reference: RunObservation["raw_result_ref"]): unknown;
}
export type RunCommand = Extract<AnyCommand, { command_type: "PrepareRunContext" | "ReserveRun" | "RecordRunObservation" | "ReconcileRun" | "CancelRun" | "SaveHandoff" | "CheckResumption" }>;
interface Mutation { event_type: string; aggregate: CommandSuccess["aggregate"]; revision: number; data: CommandSuccess["data"]; payload: Record<string, unknown> }
const equal = (a: unknown, b: unknown) => contentDigest(a ?? null).value === contentDigest(b ?? null).value;
const ref = <T extends string>(object_type: T, id: string) => ({ object_type, id });
export const runIsSettled = (run: Run) => ["Succeeded", "Failed", "Cancelled", "NotStarted"].includes(run.status) && run.cost_known;
export const runContextDigest = (context: Omit<ContextManifest, "input_digest"> | ContextManifest) => {
  const { schema_version: _schema, id: _id, created_at: _created, producer_actor_id: _producer, input_digest: _digest, ...input } = context as ContextManifest;
  return contentDigest(input);
};
const fail = (command: RunCommand, code: DomainError["code"], message: string): never => {
  throw new IntentFailure({ schema_version: SCHEMA_VERSION, code, message, category: "conflict", retryable: false, details: {}, correlation_id: command.correlation_id });
};
const meta = (context: IntentContext, task: Task, item: WorkItem) => ({ schema_version: SCHEMA_VERSION, id: context.id(), project_id: task.project_id, created_at: context.now,
  producer_actor_id: context.actorId, change_id: task.change_id, task_id: task.id, work_item_ref: ref("work_item", item.id), definition_ref: task.definition_ref, contract_ref: task.contract_ref, plan_ref: task.plan_ref });
export const executeRun = (tx: StoreTransaction, command: RunCommand, context: IntentContext, host?: RunVerifierPort): Mutation => {
  const mutation = (event_type: string, aggregate: Mutation["aggregate"], revision: number, data: Record<string, unknown>): Mutation => ({ event_type, aggregate, revision, data: data as Mutation["data"], payload: data });
  const run = command.target.object_type === "run" ? tx.getRun(command.target.id) : undefined;
  const itemId = command.command_type === "ReserveRun" ? command.payload.work_item_ref.id : run?.work_item_ref.id ?? (command.target.object_type === "work_item" ? command.target.id : undefined);
  const item = itemId ? tx.getExecutionObject("work_item", itemId) : undefined;
  const task = item ? tx.getExecutionObject("task", item.task_id) : undefined;
  if (!item || !task || item.project_id !== context.project.id || task.project_id !== context.project.id || (command.target.object_type === "run" && !run) ||
    (command.target.object_type === "task" && command.target.id !== task.id)) fail(command, "WORK_ITEM_NOT_FOUND", "运行目标与当前项目任务不符");
  const wi = item!, currentTask = task!, scope = { kind: "change" as const, id: currentTask.change_id };
  const actualRevision = command.target.object_type === "run" ? run!.revision : command.target.object_type === "task" ? currentTask.revision : wi.revision;
  if (actualRevision !== command.expected_revision) fail(command, "REVISION_CONFLICT", "运行目标已变化");
  const human = tx.getActor(context.actorId)?.actor_type === "human";
  const technical = human && command.acting_role === "technical_owner" && tx.listAssignments(context.actorId).some(a => a.project_id === context.project.id && a.role_key === "technical_owner" && assignmentIsEffective(a, context.now) &&
    ((a.scope.kind === "project" && a.scope.id === context.project.id) || (a.scope.kind === scope.kind && a.scope.id === scope.id)));
  const executor = human && command.acting_role === "executor" && context.actorId === wi.executor_ref.id;
  const requireExecutor = () => {
    if (executor) return;
    const actor = tx.getActor(context.actorId);
    if (actor?.actor_type === "agent") {
      const status = agentBindingStatus(tx, context.project.id, actor.provider_identity_ref);
      throw new IntentFailure({ schema_version: SCHEMA_VERSION, code: "CAPABILITY_UNAVAILABLE", category: "forbidden", retryable: false,
        message: "Agent 运行尚未满足正式 Provider、可信入口及运行契约", details: { blockers: status.blockers }, correlation_id: command.correlation_id });
    }
    fail(command, human ? "EXECUTOR_NOT_ALLOWED" : "CAPABILITY_UNAVAILABLE", "本阶段运行须由绑定 Human 执行者发起");
  };
  const requireRecorder = () => { if (!executor && !technical) fail(command, "ROLE_NOT_ASSIGNED", "需要原执行者或当前 Human 技术责任核对运行事实"); };
  const ready = () => {
    requireExecutor();
    const readiness = executionReadiness(tx, currentTask, context.now);
    const change = tx.getChange(currentTask.change_id)!;
    const pausedInspection = ["PrepareRunContext", "CheckResumption"].includes(command.command_type) && change.operating_status === "Paused" && change.lifecycle_state === "Executing";
    const reasons = readiness.reasons.filter(reason => !pausedInspection || reason !== "CHANGE_NOT_EXECUTING");
    if (reasons.length || currentTask.active_work_item_ref?.id !== wi.id) fail(command, currentTask.usage.pending_reconciliation ? "RECOVERY_CONDITIONS_UNMET" : "BUDGET_EXCEEDED", `执行条件未满足：${reasons.join("；")}`);
    const admission = admissionFailure(tx, command, change, false); if (admission) throw new IntentFailure(admission);
    if (currentTask.active_run_ref || tx.listRuns(currentTask.change_id).some(r => r.task_id === currentTask.id && !runIsSettled(r))) fail(command, "RECOVERY_CONDITIONS_UNMET", "前一运行尚未结清");
  };
  const port = () => { if (!host) fail(command, "CAPABILITY_UNAVAILABLE", "宿主尚未接通工作区与运行事实核验"); return host!; };
  const sourceFor = (id: string) => {
    const source = tx.getVerificationRecord("source_snapshot", id);
    if (!source || source.project_id !== context.project.id || source.change_id !== currentTask.change_id || source.repository_ref.id !== context.project.id) fail(command, "BASELINE_MISMATCH", "源码快照不属于当前任务需求");
    try { if (!equal(port().sourceDigest(context.project, source!.commit_id), source!.source_digest)) fail(command, "BASELINE_MISMATCH", "源码快照内容不符"); }
    catch (error) { if (error instanceof IntentFailure) throw error; fail(command, "EVIDENCE_MISSING", "固定源码内容不可读取"); }
    return source!;
  };
  const capture = (source: SourceSnapshot, sameHead: boolean): WorkspaceSnapshot => {
    try {
      const captured = port().captureWorkspace(context.project, wi.allowed_resources), manifest = compileValidator<WorkspaceManifest>(WorkspaceManifestSchema)(captured.manifest);
      if (manifest.project_id !== context.project.id || !equal(manifest.allowed_resources, wi.allowed_resources) || manifest.files.some(f => !wi.allowed_resources.some(r => resourceContains(r, f.path))) ||
        (sameHead && (manifest.head_commit_id !== source.commit_id || !equal(manifest.head_source_digest, source.source_digest)))) fail(command, "BASELINE_MISMATCH", "真实工作区与固定源码或授权边界不符");
      const workspace: WorkspaceSnapshot = { ...meta(context, currentTask, wi), source_snapshot_ref: ref("source_snapshot", source.id), head_commit_id: manifest.head_commit_id,
        state_digest: contentDigest(manifest), manifest_ref: captured.manifest_ref };
      if (!equal(port().readWorkspace(context.project, workspace), manifest)) fail(command, "EVIDENCE_MISSING", "工作区保存后核验失败");
      tx.insertRuntimeRecord("workspace_snapshot", workspace); return workspace;
    } catch (error) { if (error instanceof IntentFailure) throw error; return fail(command, "EVIDENCE_MISSING", "无法保存并核对授权范围内的工作区"); }
  };
  const contextFor = (id: string, digest: Digest) => {
    const manifest = tx.getRuntimeRecord("context_manifest", id);
    if (!manifest || manifest.task_id !== currentTask.id || manifest.work_item_ref.id !== wi.id || !equal(manifest.definition_ref, currentTask.definition_ref) || !equal(manifest.contract_ref, currentTask.contract_ref) || !equal(manifest.plan_ref, currentTask.plan_ref) ||
      manifest.executor_ref.id !== context.actorId || !equal(manifest.allowed_resources, wi.allowed_resources) || !equal(manifest.allowed_actions, wi.allowed_actions) || !equal(manifest.input_digest, digest) || !equal(runContextDigest(manifest), digest) ||
      (command.expected_input_digest && !equal(command.expected_input_digest, digest))) fail(command, "INPUT_CHANGED", "上下文与任务、授权或输入摘要不符");
    const workspace = tx.getRuntimeRecord("workspace_snapshot", manifest!.workspace_snapshot_ref.id);
    const source = sourceFor(manifest!.source_snapshot_ref.id);
    try { if (!workspace || workspace.work_item_ref.id !== wi.id || workspace.head_commit_id !== source.commit_id || !equal(workspace.source_snapshot_ref, manifest!.source_snapshot_ref) || !port().workspaceIsCurrent(context.project, workspace)) fail(command, "INPUT_CHANGED", "上下文对应工作区已改变"); }
    catch (error) { if (error instanceof IntentFailure) throw error; fail(command, "EVIDENCE_MISSING", "上下文工作区原始资料不可核验"); }
    return { manifest: manifest!, workspace: workspace! };
  };
  if (command.command_type === "PrepareRunContext") {
    ready(); const source = sourceFor(command.payload.source_snapshot_ref.id), workspace = capture(source, true);
    const definition = tx.getExecutionRecord("task_definition", currentTask.definition_ref.id)!;
    const body = { ...meta(context, currentTask, wi), source_snapshot_ref: ref("source_snapshot", source.id), workspace_snapshot_ref: ref("workspace_snapshot", workspace.id), executor_ref: wi.executor_ref,
      boundary: definition.body.verification.mode === "independent" ? "manual_independent_read_only" as const : "manual_scoped" as const,
      input_refs: [ref("source_snapshot", source.id), ref("workspace_snapshot", workspace.id), currentTask.contract_ref, currentTask.plan_ref, currentTask.definition_ref], allowed_actions: wi.allowed_actions, allowed_resources: wi.allowed_resources };
    const manifest: ContextManifest = { ...body, input_digest: runContextDigest(body) };
    tx.insertRuntimeRecord("context_manifest", manifest); return mutation("RunContextPrepared", ref("work_item", wi.id), wi.revision, { workspace, context: manifest });
  }
  if (command.command_type === "ReserveRun") {
    ready(); const { manifest, workspace } = contextFor(command.payload.context_ref.id, command.payload.input_digest);
    const left = budgetRemaining(currentTask, wi.budget, context.now), reserved = command.payload.reserved_cost_micros ?? 0;
    if (wi.budget.max_cost ? command.payload.reserved_cost_micros === undefined || left.cost_micros === null || reserved > left.cost_micros : reserved !== 0) fail(command, "BUDGET_EXCEEDED", "须按剩余同币种预算预约费用");
    const latestHandoff = tx.listRuntimeRecords("handoff_record", currentTask.change_id).filter(h => h.task_id === currentTask.id).at(-1);
    if (latestHandoff || command.payload.resumption_ref) {
      const proof = command.payload.resumption_ref ? tx.getRuntimeRecord("resumption_record", command.payload.resumption_ref.id) : undefined;
      if (!proof || proof.work_item_ref.id !== wi.id || proof.handoff_ref.id !== latestHandoff?.id || proof.context_ref.id !== manifest.id || !equal(proof.input_digest, manifest.input_digest) || !equal(proof.usage_digest, usageDigest(tx, currentTask))) fail(command, "RECOVERY_CONDITIONS_UNMET", "交接后的预约须使用最新接续核验与累计用量");
    }
    const id = context.id(), record: RunRecord = { ...meta(context, currentTask, wi), run_id: id, run_kind: "human", attempt_no: currentTask.usage.attempts_consumed + 1,
      operation_key: context.id(), context_ref: ref("context_manifest", manifest.id), source_snapshot_ref: manifest.source_snapshot_ref, workspace_before_ref: ref("workspace_snapshot", workspace.id), executor_ref: wi.executor_ref,
      reserved_at: context.now, input_digest: manifest.input_digest, reserved_cost_micros: reserved, ...((wi.budget.max_cost?.currency ?? currentTask.usage.cost_currency) ? { cost_currency: (wi.budget.max_cost?.currency ?? currentTask.usage.cost_currency)! } : {}), ...(command.payload.resumption_ref ? { resumption_ref: command.payload.resumption_ref } : {}) };
    const nextRun: Run = { schema_version: SCHEMA_VERSION, id, project_id: context.project.id, change_id: currentTask.change_id, task_id: currentTask.id, work_item_ref: ref("work_item", wi.id), record_ref: ref("run_record", record.id),
      revision: 1, created_at: context.now, updated_at: context.now, status: "Reserved", cancel_requested: false, reservation_released: false, cost_charged_micros: 0, cost_known: true };
    const nextTask: Task = { ...currentTask, revision: currentTask.revision + 1, updated_at: context.now, status: "InProgress", active_run_ref: ref("run", id), usage: { ...currentTask.usage,
      attempts_consumed: record.attempt_no, first_started_at: currentTask.usage.first_started_at ?? context.now, cost_reserved_micros: (currentTask.usage.cost_reserved_micros ?? 0) + reserved, pending_reconciliation: true } };
    const nextItem: WorkItem = { ...wi, revision: wi.revision + 1, updated_at: context.now, status: "Active" };
    tx.insertRuntimeRecord("run_record", record); tx.insertRun(nextRun); tx.updateExecutionObject("task", nextTask, currentTask.revision); tx.updateExecutionObject("work_item", nextItem, wi.revision);
    return mutation("RunReserved", ref("task", currentTask.id), nextTask.revision, { task: nextTask, work_item: nextItem, run: nextRun, record });
  }
  if (command.command_type === "SaveHandoff") {
    requireRecorder();
    if (!equal(wi.definition_ref, currentTask.definition_ref) || !equal(wi.contract_ref, currentTask.contract_ref) || !equal(wi.plan_ref, currentTask.plan_ref)) fail(command, "BASELINE_MISMATCH", "只能交接当前任务基准");
    const nextActor = tx.getActor(command.payload.next_actor_ref.id);
    if (nextActor?.project_id !== context.project.id || nextActor.actor_type !== "human") fail(command, "ACTOR_NOT_FOUND", "接续者须为当前项目 Human");
    if (command.payload.evidence_refs.some(r => tx.getVerificationRecord("evidence", r.id)?.task_id !== currentTask.id) ||
      (command.payload.run_ref && tx.getRun(command.payload.run_ref.id)?.work_item_ref.id !== wi.id)) fail(command, "BASELINE_MISMATCH", "交接证据或运行引用跨任务");
    const source = sourceFor(command.payload.source_snapshot_ref.id), workspace = capture(source, true);
    const handoff: HandoffRecord = { ...meta(context, currentTask, wi), ...command.payload, workspace_snapshot_ref: ref("workspace_snapshot", workspace.id), usage_snapshot: currentTask.usage, budget_remaining: budgetRemaining(currentTask, wi.budget, context.now) };
    tx.insertRuntimeRecord("handoff_record", handoff); return mutation("HandoffSaved", ref("work_item", wi.id), wi.revision, { workspace, handoff });
  }
  if (command.command_type === "CheckResumption") {
    ready(); const { manifest, workspace } = contextFor(command.payload.context_ref.id, command.payload.input_digest), handoff = tx.getRuntimeRecord("handoff_record", command.payload.handoff_ref.id);
    if (!handoff || handoff.task_id !== currentTask.id || handoff.next_actor_ref.id !== context.actorId || !equal(handoff.definition_ref, currentTask.definition_ref) || !equal(handoff.contract_ref, currentTask.contract_ref) || !equal(handoff.plan_ref, currentTask.plan_ref)) fail(command, "RECOVERY_CONDITIONS_UNMET", "接续者或固定任务基准与交接不符");
    const oldWorkspace = tx.getRuntimeRecord("workspace_snapshot", handoff!.workspace_snapshot_ref.id);
    try { if (!oldWorkspace || !equal(oldWorkspace.state_digest, workspace.state_digest) || !equal(contentDigest(port().readWorkspace(context.project, oldWorkspace)), oldWorkspace.state_digest)) fail(command, "INPUT_CHANGED", "交接工作区内容已改变或缺失"); }
    catch (error) { if (error instanceof IntentFailure) throw error; fail(command, "EVIDENCE_MISSING", "交接原始工作区不可核验"); }
    const resumption: ResumptionRecord = { ...meta(context, currentTask, wi), handoff_ref: ref("handoff_record", handoff!.id), context_ref: ref("context_manifest", manifest.id), source_snapshot_ref: manifest.source_snapshot_ref,
      workspace_snapshot_ref: manifest.workspace_snapshot_ref, usage_digest: usageDigest(tx, currentTask), input_digest: manifest.input_digest, budget_remaining: budgetRemaining(currentTask, wi.budget, context.now) };
    tx.insertRuntimeRecord("resumption_record", resumption); return mutation("ResumptionChecked", ref("work_item", wi.id), wi.revision, { resumption });
  }
  requireRecorder(); const original = run!, record = tx.getRuntimeRecord("run_record", original.record_ref.id);
  if (!record || record.run_id !== original.id || record.task_id !== currentTask.id) fail(command, "BASELINE_MISMATCH", "运行预约事实缺失");
  const updateTaskUsage = (nextRun: Run, deltaCost = 0, released = false, reversed = false): Task => {
    const all = tx.listRuns(currentTask.change_id).filter(r => r.task_id === currentTask.id).map(r => r.id === nextRun.id ? nextRun : r);
    const pending = all.some(r => !runIsSettled(r)), known = all.every(r => r.cost_known);
    const reserved = all.filter(r => !runIsSettled(r)).reduce((sum, r) => sum + Math.max(0, (tx.getRuntimeRecord("run_record", r.record_ref.id)?.reserved_cost_micros ?? 0) - r.cost_charged_micros), 0);
    const consumed = (currentTask.usage.cost_consumed_micros ?? 0) + deltaCost;
    if (!Number.isSafeInteger(consumed) || !Number.isSafeInteger(reserved)) fail(command, "BUDGET_EXCEEDED", "费用累计超出安全整数范围");
    const next: Task = { ...currentTask, revision: currentTask.revision + 1, updated_at: context.now, usage: { ...currentTask.usage, cost_known: known, pending_reconciliation: pending,
      cost_consumed_micros: consumed, cost_reserved_micros: reserved, attempts_released: (currentTask.usage.attempts_released ?? 0) + (released ? 1 : 0), attempt_releases_reversed: (currentTask.usage.attempt_releases_reversed ?? 0) + (reversed ? 1 : 0), ...(record!.cost_currency ? { cost_currency: record!.cost_currency } : {}) } };
    if (next.active_run_ref?.id === nextRun.id && runIsSettled(nextRun)) delete next.active_run_ref;
    tx.updateExecutionObject("task", next, currentTask.revision); return next;
  };
  if (command.command_type === "CancelRun") {
    if (runIsSettled(original)) fail(command, "TASK_STATE_INVALID", "已结清运行不能请求取消");
    const nextRun: Run = { ...original, revision: original.revision + 1, updated_at: context.now, cancel_requested: true, status: "Unknown" };
    tx.updateRun(nextRun, original.revision); const nextTask = updateTaskUsage(nextRun);
    return mutation("RunCancellationRequested", ref("run", original.id), nextRun.revision, { task: nextTask, run: nextRun, reason: command.payload.reason });
  }
  if (command.command_type !== "RecordRunObservation" && command.command_type !== "ReconcileRun") fail(command, "INVALID_COMMAND", "未知运行命令");
  if (command.command_type === "ReconcileRun" && !technical) fail(command, "ROLE_NOT_ASSIGNED", "未知或冲突结果须由 Human 技术责任核对");
  let raw: RawRunObservation;
  try { raw = compileValidator<RawRunObservation>(RawRunObservationSchema)(port().readRunResult(context.project, command.payload.raw_result_ref)); }
  catch { fail(command, "EVIDENCE_MISSING", "原始运行报告缺失、摘要不符或结构无效"); }
  if (raw!.run_id !== original.id || raw!.operation_key !== record!.operation_key || raw!.producer_actor_id !== context.actorId || !equal(raw!.input_digest, record!.input_digest) ||
    !Number.isFinite(Date.parse(raw!.observed_at)) || new Date(raw!.observed_at).toISOString() !== (raw!.observed_at.length === 20 ? raw!.observed_at.replace("Z", ".000Z") : raw!.observed_at) || Date.parse(raw!.observed_at) < Date.parse(record!.reserved_at) || Date.parse(raw!.observed_at) > Date.parse(context.now) ||
    (raw!.usage.cost_known && (raw!.usage.currency ?? record!.cost_currency) !== record!.cost_currency)) fail(command, "BASELINE_MISMATCH", "运行报告身份、时间、输入或币种不符");
  const prior = tx.listRuntimeRecords("run_observation", currentTask.change_id).filter(o => o.run_ref.id === original.id), latest = original.latest_observation_ref ? tx.getRuntimeRecord("run_observation", original.latest_observation_ref.id) : undefined;
  const reconciling = command.command_type === "ReconcileRun";
  if (raw!.basis !== (reconciling ? "reconciliation" : "direct_observation") || (!reconciling && (raw!.status === "not_started" || raw!.resolves_observation_refs.length))) fail(command, "RECOVERY_CONDITIONS_UNMET", "未启动返还及冲突解决须有技术责任核对报告");
  const unresolved = prior.filter(o => o.report.status === "unknown" || !o.report.usage.cost_known || o.applicability === "conflicting");
  if (reconciling && (raw!.status === "unknown" || raw!.status === "running" || !raw!.usage.cost_known || unresolved.some(o => !raw!.resolves_observation_refs.some(r => r.id === o.id)) ||
    raw!.resolves_observation_refs.some(r => !prior.some(o => o.id === r.id)) || (latest && Date.parse(raw!.observed_at) < Date.parse(latest.report.observed_at)))) fail(command, "RECOVERY_CONDITIONS_UNMET", "核对须覆盖全部未知/冲突事实并提供最新确定结果及用量");
  if (raw!.status === "not_started" && (original.cost_charged_micros > 0 || !raw!.usage.cost_known || raw!.usage.cost_micros !== 0 || prior.some(o => o.report.status !== "unknown" && o.report.status !== "not_started"))) fail(command, "RECOVERY_CONDITIONS_UNMET", "已有实际运行或费用事实，不能返还未启动次数");
  const desired: Run["status"] = ({ running: "Running", succeeded: "Succeeded", failed: "Failed", cancelled: "Cancelled", unknown: "Unknown", not_started: "NotStarted" } as const)[raw!.status];
  const late = !!latest && Date.parse(raw!.observed_at) < Date.parse(latest.report.observed_at);
  const reversal = original.reservation_released && !original.release_reversed && (raw!.status !== "not_started" && raw!.status !== "unknown" || raw!.usage.cost_known && raw!.usage.cost_micros > 0);
  const conflict = !reconciling && runIsSettled(original) && desired !== original.status && (!late || reversal);
  const status = reconciling ? desired : conflict ? "Unknown" : late ? original.status : runIsSettled(original) && desired === original.status ? original.status : original.status === "Unknown" || original.cancel_requested ? "Unknown" : desired;
  const source = sourceFor(record!.source_snapshot_ref.id), workspace = capture(source, false);
  const observation: RunObservation = { ...meta(context, currentTask, wi), definition_ref: record!.definition_ref, contract_ref: record!.contract_ref, plan_ref: record!.plan_ref,
    run_ref: ref("run", original.id), raw_result_ref: command.payload.raw_result_ref, report: raw!, received_at: context.now,
    workspace_received_ref: ref("workspace_snapshot", workspace.id), applicability: conflict ? "conflicting" : late ? "late" : workspace.head_commit_id !== source.commit_id || !equal(currentTask.definition_ref, record!.definition_ref) || !equal(currentTask.contract_ref, record!.contract_ref) || !equal(currentTask.plan_ref, record!.plan_ref) ? "stale" : "current", resulting_status: status };
  const charged = raw!.usage.cost_known ? Math.max(original.cost_charged_micros, raw!.usage.cost_micros) : original.cost_charged_micros;
  const release = desired === "NotStarted" && reconciling && !original.reservation_released;
  const nextRun: Run = { ...original, revision: original.revision + 1, updated_at: context.now, status, cost_charged_micros: charged,
    cost_known: reconciling ? true : original.cost_known && raw!.usage.cost_known, reservation_released: original.reservation_released || release, ...(reversal ? { release_reversed: true } : {}),
    ...(!late || reconciling ? { latest_observation_ref: ref("run_observation", observation.id) } : {}) };
  tx.insertRuntimeRecord("run_observation", observation); tx.updateRun(nextRun, original.revision);
  const nextTask = updateTaskUsage(nextRun, charged - original.cost_charged_micros, release, reversal);
  let nextItem = wi;
  if (runIsSettled(nextRun) && wi.status === "Active" && currentTask.active_run_ref?.id === original.id) {
    nextItem = { ...wi, revision: wi.revision + 1, updated_at: context.now, status: "Ready" }; tx.updateExecutionObject("work_item", nextItem, wi.revision);
  }
  return mutation(reconciling ? "RunReconciled" : "RunObserved", ref("run", original.id), nextRun.revision, { task: nextTask, work_item: nextItem, run: nextRun, workspace, observation });
};

export const verifyChangeResumption = (tx: StoreTransaction, command: Extract<AnyCommand, { command_type: "ResumeChange" }>, project: Project, now: string, host?: RunVerifierPort): DomainError | undefined => {
  const reject = (code: DomainError["code"], message: string): DomainError => ({ schema_version: SCHEMA_VERSION, code, message, category: "conflict", retryable: false, details: {}, correlation_id: command.correlation_id });
  const tasks = tx.listExecutionObjects("task", command.target.id), runs = tx.listRuns(command.target.id), refs = command.payload.reconciliation_refs ?? [];
  if (tasks.some(t => t.usage.pending_reconciliation || !t.usage.cost_known || t.active_run_ref) || runs.some(r => !runIsSettled(r))) return reject("RECOVERY_CONDITIONS_UNMET", "在途运行或用量尚未核对");
  const items = tx.listExecutionObjects("work_item", command.target.id).filter(w => ["Ready", "Active"].includes(w.status));
  if (!host) return reject("CAPABILITY_UNAVAILABLE", "恢复需要真实工作区核验器");
  if (items.some(w => w.status !== "Ready")) return reject("RECOVERY_CONDITIONS_UNMET", "执行授权仍在使用中");
  try {
    for (const wi of items) {
      const task = tasks.find(t => t.id === wi.task_id), proof = refs.filter(r => r.object_type === "resumption_record").map(r => tx.getRuntimeRecord("resumption_record", r.id)).find(r => r?.work_item_ref.id === wi.id);
      if (!task || !proof || proof.task_id !== task.id || proof.producer_actor_id !== wi.executor_ref.id || !equal(proof.definition_ref, task.definition_ref) || !equal(proof.contract_ref, task.contract_ref) || !equal(proof.plan_ref, task.plan_ref) || !equal(proof.usage_digest, usageDigest(tx, task)) || executionReadiness(tx, task, now).reasons.some(r => r !== "CHANGE_NOT_EXECUTING")) return reject("RECOVERY_CONDITIONS_UNMET", "每份未关闭授权均须有当前接续核验");
      const manifest = tx.getRuntimeRecord("context_manifest", proof.context_ref.id), workspace = tx.getRuntimeRecord("workspace_snapshot", proof.workspace_snapshot_ref.id), handoff = tx.listRuntimeRecords("handoff_record", command.target.id).filter(h => h.task_id === task.id).at(-1);
      const saved = handoff ? tx.getRuntimeRecord("workspace_snapshot", handoff.workspace_snapshot_ref.id) : undefined;
      if (!manifest || !workspace || !saved || handoff?.id !== proof.handoff_ref.id || handoff.next_actor_ref.id !== wi.executor_ref.id || !equal(manifest.input_digest, proof.input_digest) || !equal(runContextDigest(manifest), proof.input_digest) || !equal(saved.state_digest, workspace.state_digest) || !equal(contentDigest(host.readWorkspace(project, saved)), saved.state_digest) || !host.workspaceIsCurrent(project, workspace)) return reject("INPUT_CHANGED", "接续核验的上下文或实际工作区已改变");
    }
    if (!items.length) {
      const sourceRef = refs.find(r => r.object_type === "source_snapshot"), source = sourceRef ? tx.getVerificationRecord("source_snapshot", sourceRef.id) : undefined;
      if (!source || source.change_id !== command.target.id || source.project_id !== project.id || !equal(host.sourceDigest(project, source.commit_id), source.source_digest)) return reject("RECOVERY_CONDITIONS_UNMET", "无未关闭授权时须提交当前固定源码核对");
      if (!host.sourceIsCurrent(project, source)) return reject("INPUT_CHANGED", "当前代码或未授权差异已偏离恢复依据");
    }
  } catch { return reject("EVIDENCE_MISSING", "恢复工作区或原始交接资料缺失"); }
};
