import { compileValidator, SCHEMA_VERSION, inspectableSchemas, intentRecordSchemas, executionObjectSchemas, executionRecordSchemas,
  verificationRecordSchemas, runtimeRecordSchemas, parseObjectShowResult, CommandDiagnosticSchema,
  type InspectableObjectType, type InspectableRecords, type ObjectShowResult, type CommandDiagnostic, type AnyCommand,
  type IntentRecordType, type ExecutionObjectType, type ExecutionRecordType, type VerificationRecordType, type RuntimeRecordType } from "@cimiloop/protocol/v2";
import type { ProjectReader, ProjectStore } from "@cimiloop/store";
import { executionReadiness } from "./execution.js";

const owns = (map: object, key: string): boolean => Object.hasOwn(map, key);
export const supportedQueryType = (kind: string): kind is InspectableObjectType => owns(inspectableSchemas, kind);
export const readObject = (reader: ProjectReader, kind: InspectableObjectType, id: string): InspectableRecords[InspectableObjectType] | undefined => {
  let object: InspectableRecords[InspectableObjectType] | undefined;
  if (kind === "project") { const project = reader.getProject(); object = project?.id === id ? project : undefined; }
  else if (kind === "actor") object = reader.getActor(id);
  else if (kind === "assignment") object = reader.listAssignments().find(item => item.id === id);
  else if (kind === "change") object = reader.getChange(id);
  else if (kind === "project_settings_version") object = reader.getSettingsVersion(id);
  else if (kind === "target_version") object = reader.getTargetVersion(id);
  else if (kind === "run") object = reader.getRun(id);
  else if (kind === "provider_descriptor") object = reader.getProviderDescriptor(id);
  else if (kind === "provider_binding") object = reader.getProviderBinding(id);
  else if (kind === "evidence") object = reader.getProviderEvidence(id) ?? reader.getVerificationRecord("evidence", id);
  else if (kind === "evaluation") object = reader.getProviderEvaluation(id) ?? reader.getVerificationRecord("evaluation", id);
  else if (owns(intentRecordSchemas, kind)) object = reader.getIntentRecord(kind as IntentRecordType, id);
  else if (owns(executionObjectSchemas, kind)) object = reader.getExecutionObject(kind as ExecutionObjectType, id);
  else if (owns(executionRecordSchemas, kind)) object = reader.getExecutionRecord(kind as ExecutionRecordType, id);
  else if (owns(verificationRecordSchemas, kind)) object = reader.getVerificationRecord(kind as VerificationRecordType, id);
  else if (owns(runtimeRecordSchemas, kind)) object = reader.getRuntimeRecord(kind as RuntimeRecordType, id);
  const project = reader.getProject();
  return object && project && (kind === "project" || ("project_id" in object && object.project_id === project.id)) ? object : undefined;
};
const taskFor = (reader: ProjectReader, kind: InspectableObjectType, object: InspectableRecords[InspectableObjectType]) =>
  kind === "task" ? reader.getExecutionObject("task", object.id) : (kind === "work_item" || kind === "run") && "task_id" in object ? reader.getExecutionObject("task", object.task_id) : undefined;

export const queryObject = (store: ProjectStore, kind: InspectableObjectType, id: string, now: string): ObjectShowResult | undefined => {
  const snapshot = store.readSnapshot(reader => {
    const object = readObject(reader, kind, id); if (!object) return;
    const task = taskFor(reader, kind, object);
    return { schema_version: SCHEMA_VERSION, ok: true, object_type: kind, object,
      ...(task ? { readiness: executionReadiness(reader, task, now) } : {}) };
  });
  return snapshot.value ? parseObjectShowResult({ ...snapshot.value, as_of_event_sequence: snapshot.as_of_event_sequence }) : undefined;
};
const fact = (kind: InspectableObjectType, object: InspectableRecords[InspectableObjectType]): CommandDiagnostic["related"][number] => {
  const fields = ["revision", "status", "lifecycle_state", "operating_status", "contract_ref", "plan_ref", "settings_ref", "current_version_ref", "definition_ref", "record_ref", "active_work_item_ref", "active_run_ref"] as const;
  return { reference: { object_type: kind, id: object.id }, ...Object.fromEntries(fields.filter(key => key in object).map(key => [key, Reflect.get(object, key)])) };
};
// This is a later, labelled read snapshot, never a replacement for the failed
// transaction's decision or a guarantee that the next command will succeed.
export const commandDiagnostic = (store: ProjectStore, command: AnyCommand, now: string): CommandDiagnostic | undefined => {
  const target = "target" in command ? command.target : undefined; if (!target || !supportedQueryType(target.object_type)) return;
  const kind = target.object_type;
  const snapshot = store.readSnapshot(reader => {
    const object = readObject(reader, kind, target.id), related: CommandDiagnostic["related"] = [];
    const task = object ? taskFor(reader, kind, object) : undefined;
    const readiness = task ? executionReadiness(reader, task, now, ["PrepareTaskEvaluation", "EvaluateTask", "SatisfyTask"].includes(command.command_type)) : undefined;
    if (task && kind !== "task") related.push(fact("task", task));
    const changeId = task?.change_id ?? (object && "change_id" in object ? object.change_id : undefined);
    const change = changeId ? reader.getChange(changeId) : undefined;
    if (change && kind !== "change") related.push(fact("change", change));
    if (command.command_type === "EndAssignment") {
      const assignment = reader.listAssignments().find(item => item.id === command.payload.assignment_id);
      if (assignment) related.push(fact("assignment", assignment));
    }
    if (command.command_type === "CloseTargetVersion") {
      const version = reader.getTargetVersion(command.payload.target_version_id);
      if (version) related.push(fact("target_version", version));
    }
    return { current: object ? fact(kind, object) : null, related, missing_conditions: readiness?.reasons ?? [], ...(readiness ? { readiness } : {}) };
  });
  return compileValidator<CommandDiagnostic>(CommandDiagnosticSchema)({ schema_version: SCHEMA_VERSION, observed_at: now,
    as_of_event_sequence: snapshot.as_of_event_sequence, command_type: command.command_type, target,
    ...("expected_revision" in command ? { expected_revision: command.expected_revision } : {}), ...snapshot.value });
};
