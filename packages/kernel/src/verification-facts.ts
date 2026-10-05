import type { Task, TaskEvaluation } from "@cimiloop/protocol/v2";
import type { ProjectReader } from "@cimiloop/store";
import { contentDigest } from "./intent.js";
import { applicableInvalidations, type ReviewReader } from "./review-facts.js";

type Reader = ReviewReader & Pick<ProjectReader, "getChange" | "getExecutionObject">;
const equal = (a: unknown, b: unknown) => contentDigest(a ?? null).value === contentDigest(b ?? null).value;
// Only a native satisfaction fact can unlock dependencies. A Satisfied tag and
// a schema-valid arbitrary evaluation reference are not a satisfaction record.
export const currentTaskEvaluation = (reader: Reader, task: Task): TaskEvaluation | undefined => {
  const change = reader.getChange(task.change_id), ref = task.result_evaluation_ref;
  const evaluation = ref ? reader.getVerificationRecord("evaluation", ref.id) : undefined;
  const fact = reader.listVerificationRecords("task_satisfaction_record", task.change_id).find(item => item.task_id === task.id && item.evaluation_ref.id === ref?.id);
  const item = fact ? reader.getExecutionObject("work_item", fact.work_item_ref.id) : undefined;
  if (!change || task.status !== "Satisfied" || !evaluation || evaluation.purpose === "safe_integration" || evaluation.outcome !== "ALLOW" || !fact ||
    fact.task_revision !== task.revision || !item || item.status !== "Closed" || item.task_id !== task.id || evaluation.task_id !== task.id ||
    evaluation.project_id !== task.project_id || fact.project_id !== task.project_id || evaluation.change_id !== task.change_id || item.executor_ref.id !== evaluation.producer_actor_id ||
    !equal(evaluation.work_item_ref, fact.work_item_ref) || !equal(evaluation.source_snapshot_ref, fact.source_snapshot_ref) ||
    [evaluation, fact, item, task].some(value => !equal(value.contract_ref, change.contract_ref) || !equal(value.plan_ref, change.plan_ref) || !equal(value.definition_ref, task.definition_ref))) return;
  const evidence = reader.listVerificationRecords("evidence", task.change_id).filter(value => value.task_id === task.id && equal(value.definition_ref, task.definition_ref) &&
    equal(value.contract_ref, task.contract_ref) && equal(value.plan_ref, task.plan_ref) && value.source_snapshot_ref.id === evaluation.source_snapshot_ref.id);
  const dispositions = evidence.flatMap(value => applicableInvalidations(reader, task.change_id, value)).filter((value, i, all) => all.findIndex(other => other.id === value.id) === i);
  if (!equal(evaluation.evidence_refs, evidence.map(value => ({ object_type: "evidence", id: value.id }))) || !equal(evaluation.disposition_refs ?? [], dispositions.map(value => ({ object_type: "decision", id: value.id })))) return;
  return evaluation;
};
