import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";
import { LocalRunVerifier } from "../../apps/cli/src/runs-local.js";
import * as v2 from "../../packages/protocol/src/v2/index.js";
import { createVerificationProject } from "./verification-project.js";
import { flowSuccess, flowTime } from "./flow-project.js";

export const createRunProject = (directory: string) => {
  const f = createVerificationProject(directory); let time = flowTime;
  const runPort = new LocalRunVerifier(directory, dirname(f.path));
  const kernel = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => time, evidenceVerifier: f.port, runVerifier: runPort });
  const reviewerKernel = new CimiLoopKernel({ store: f.store, caller: { kind: "local_operator", project_id: f.project.id, actor_id: f.reviewer.id }, now: () => time, evidenceVerifier: f.port, runVerifier: runPort });
  const command = <P>(kind: string, objectType: "task" | "work_item" | "run", id: string, payload: P, role = "executor", actorId = f.actor.id) => {
    const target = objectType === "run" ? f.store.getRun(id) : f.store.getExecutionObject(objectType, id);
    return { ...f.context(role), actor_id: actorId, command_type: kind, target: { object_type: objectType, id }, expected_revision: target!.revision, payload };
  };
  const authorize = (attempts = 3, cost?: number, resources = ["src/query.ts"], actorId = f.actor.id, acknowledged?: v2.Digest) => {
    const result = flowSuccess(kernel.execute(f.taskCommand("CreateWorkItem", f.task().id, { definition_ref: f.task().definition_ref, executor_ref: { object_type: "actor", id: actorId },
      allowed_actions: ["read_files"], allowed_resources: resources, budget: { max_attempts: attempts, max_elapsed_ms: 60_000, ...(cost ? { max_cost: { currency: "USD", amount_micros: cost } } : {}) },
      stop_conditions: ["任务边界改变即停止"], reason: "有界人工运行控制测试", ...(acknowledged ? { acknowledged_usage_digest: acknowledged } : {}) }, f.actor.id, "technical_owner")));
    if (result.command_type !== "CreateWorkItem") throw new Error("work item expected"); return result.data.work_item;
  };
  const prepare = (wi: v2.WorkItem, source: v2.SourceSnapshot) => {
    const result = flowSuccess((wi.executor_ref.id === f.actor.id ? kernel : reviewerKernel).execute(command("PrepareRunContext", "work_item", wi.id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id } }, "executor", wi.executor_ref.id)));
    if (result.command_type !== "PrepareRunContext") throw new Error("context expected"); return result.data;
  };
  const reserve = (wi: v2.WorkItem, prepared: ReturnType<typeof prepare>, cost?: number, resumption?: v2.ResumptionRecord) => {
    const result = flowSuccess((wi.executor_ref.id === f.actor.id ? kernel : reviewerKernel).execute(command("ReserveRun", "task", wi.task_id, {
      work_item_ref: { object_type: "work_item", id: wi.id }, context_ref: { object_type: "context_manifest", id: prepared.context.id }, input_digest: prepared.context.input_digest,
      ...(cost === undefined ? {} : { reserved_cost_micros: cost }), ...(resumption ? { resumption_ref: { object_type: "resumption_record", id: resumption.id } } : {}) }, "executor", wi.executor_ref.id)));
    if (result.command_type !== "ReserveRun") throw new Error("run expected"); return result.data;
  };
  const raw = (run: v2.Run, status: v2.RawHumanRunObservation["status"], overrides: Partial<v2.RawHumanRunObservation> = {}) => {
    const record = f.store.getRuntimeRecord("run_record", run.record_ref.id)!;
    const report: v2.RawHumanRunObservation = { format: "cimiloop/manual-run/1.0.0", run_id: run.id, operation_key: record.operation_key, producer_actor_id: f.actor.id, observed_at: time,
      input_digest: record.input_digest, basis: "direct_observation", status, usage: { cost_known: true, cost_micros: 0, ...(record.cost_currency ? { currency: record.cost_currency } : {}) }, method: "实际人工核对执行及用量", observation: "测试仅验证运行控制路径", resolves_observation_refs: [], ...overrides };
    const path = join(dirname(f.path), `run-${v2.createInternalId()}.json`); writeFileSync(path, JSON.stringify(report));
    return { report, path, reference: runPort.content.importRawResult(path, "manual_run") };
  };
  const observe = (run: v2.Run, status: v2.RawHumanRunObservation["status"], overrides: Partial<v2.RawHumanRunObservation> = {}) => kernel.execute(command("RecordRunObservation", "run", run.id, { raw_result_ref: raw(run, status, overrides).reference }));
  const reconcile = (run: v2.Run, status: v2.RawHumanRunObservation["status"], overrides: Partial<v2.RawHumanRunObservation> = {}) => kernel.execute(command("ReconcileRun", "run", run.id, {
    raw_result_ref: raw(run, status, { basis: "reconciliation", resolves_observation_refs: f.store.listRuntimeRecords("run_observation", f.change.id).filter(o => o.run_ref.id === run.id && (o.report.status === "unknown" || !o.report.usage.cost_known || o.applicability === "conflicting")).map(o => ({ object_type: "run_observation", id: o.id })), ...overrides }).reference }, "technical_owner"));
  return { ...f, kernel, reviewerKernel, runPort, command, authorize, prepareContext: prepare, reserve, raw, observe, reconcile, setTime: (value: string) => { time = value; } };
};
