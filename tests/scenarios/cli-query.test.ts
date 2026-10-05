import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { writeInstance } from "../../apps/cli/src/instance.js";
import { createRunProject } from "../fixtures/run-project.js";
import { flowSuccess, flowTime } from "../fixtures/flow-project.js";
import * as v2 from "../../packages/protocol/src/v2/index.js";
import { CimiLoopKernel } from "../../packages/kernel/src/index.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-cli-query-")); dirs.push(directory);
  const f = createRunProject(directory); stores.push(f.store);
  writeInstance(join(dirname(f.path), "instance.json"), { schema_version: "1.0.0", instance_id: f.project.instance_id, project_id: f.project.id, actor_id: f.actor.id, created_at: flowTime });
  const invoke = (args: string[], json = true) => spawnSync(process.execPath, ["--no-warnings", resolve("apps/cli/dist/bin.js"), "--project-dir", directory, ...(json ? ["--json"] : []), ...args], { encoding: "utf8", windowsHide: true });
  return { ...f, directory, invoke };
};
const parseObject = v2.parseObjectShowResult;
const parseDiagnostic = v2.compileValidator<v2.CommandDiagnostic>(v2.CommandDiagnosticSchema);

it("queries persisted native records through one Kernel snapshot and rejects unsupported, wrong and malformed objects", () => {
  const f = fixture(), source = f.capture(), wi = f.authorize(), context = f.prepareContext(wi, source), reserved = f.reserve(wi, context);
  flowSuccess(f.observe(reserved.run, "succeeded"));
  const handoff = flowSuccess(f.kernel.execute(f.command("SaveHandoff", "work_item", wi.id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id }, next_actor_ref: { object_type: "actor", id: f.actor.id }, completed: ["具名人工完成观察"], unresolved: ["待评价"], next_action: "固定证据后评价", evidence_refs: [] })));
  expect(handoff.command_type).toBe("SaveHandoff");
  const families = {
    project: [f.store.getProject()!], actor: f.store.listActors(), assignment: f.store.listAssignments(), change: f.store.listChanges(),
    project_settings_version: [f.store.getSettingsVersion(f.store.getProject()!.settings_ref!.id)!],
    ...Object.fromEntries(Object.keys(v2.intentRecordSchemas).map(kind => [kind, f.store.listIntentRecords(kind as v2.IntentRecordType, f.change.id)])),
    ...Object.fromEntries(Object.keys(v2.executionObjectSchemas).map(kind => [kind, f.store.listExecutionObjects(kind as v2.ExecutionObjectType)])),
    ...Object.fromEntries(Object.keys(v2.executionRecordSchemas).map(kind => [kind, f.store.listExecutionRecords(kind as v2.ExecutionRecordType)])),
    ...Object.fromEntries(Object.keys(v2.verificationRecordSchemas).map(kind => [kind, f.store.listVerificationRecords(kind as v2.VerificationRecordType, f.change.id)])),
    run: f.store.listRuns(f.change.id), ...Object.fromEntries(Object.keys(v2.runtimeRecordSchemas).map(kind => [kind, f.store.listRuntimeRecords(kind as v2.RuntimeRecordType, f.change.id)]))
  };
  const events = f.store.listEvents();
  for (const [kind, objects] of Object.entries(families)) for (const object of objects) {
    const result = parseObject(f.kernel.getObject(kind, object.id));
    expect(result.object).toEqual(object); expect(result.as_of_event_sequence).toBe(events.length);
  }
  const result = parseObject(f.kernel.getObject("task", f.task().id));
  expect(() => parseObject({ ...result, object_type: "work_item" })).toThrow(v2.ProtocolValidationError);
  expect(() => parseObject({ ...result, object: { ...result.object, rogue: true } })).toThrow(v2.ProtocolValidationError);
  expect(() => parseObject({ ...result, rogue: true })).toThrow(v2.ProtocolValidationError);
  expect(f.kernel.getObject("provider_binding", v2.createInternalId())).toMatchObject({ code: "OBJECT_NOT_FOUND" });
  expect(f.kernel.getObject("__proto__", f.change.id)).toMatchObject({ code: "UNSUPPORTED_OBJECT_TYPE" });
  expect(f.kernel.getObject("run", f.task().id)).toMatchObject({ code: "OBJECT_NOT_FOUND" });
  expect(f.kernel.getObject("change", f.change.display_key)).toMatchObject({ object: { id: f.change.id } });
  expect(f.store.listEvents()).toEqual(events);
}, 45_000); // Cold native-schema compilation and real Git/SQLite fixtures under four file workers.

it("reports current versions and authorization gaps after a rejected command without writing or changing replay", () => {
  const f = fixture(), source = f.capture(), wi = f.authorize(), prepared = f.prepareContext(wi, source);
  const command = f.command("ReserveRun", "task", wi.task_id, { work_item_ref: { object_type: "work_item", id: wi.id }, context_ref: { object_type: "context_manifest", id: prepared.context.id }, input_digest: prepared.context.input_digest });
  const original = flowSuccess(f.kernel.execute(command)), events = f.store.listEvents();
  const rejectedCommandId = v2.createInternalId(), rejected = f.kernel.execute({ ...command, command_id: rejectedCommandId });
  if (!("code" in rejected)) throw new Error("rejection expected");
  expect(rejected.code).toBe("REVISION_CONFLICT");
  const diagnostic = parseDiagnostic(rejected.details.diagnostic);
  expect(diagnostic).toMatchObject({ expected_revision: command.expected_revision, current: { revision: f.task().revision, status: "InProgress", active_run_ref: { id: original.command_type === "ReserveRun" ? original.data.run.id : "" } }, readiness: { ready: false } });
  expect(diagnostic.missing_conditions).toContain("WORK_ITEM_STATE_INVALID"); expect(diagnostic.as_of_event_sequence).toBe(events.length);
  v2.parseErrorResult({ schema_version: v2.SCHEMA_VERSION, ok: false, error: rejected });
  expect(() => v2.parseErrorResult({ schema_version: v2.SCHEMA_VERSION, ok: false, error: { ...rejected, details: { diagnostic: { ...diagnostic, rogue: true } } } })).toThrow(v2.ProtocolValidationError);
  expect(f.kernel.execute(command)).toEqual(original); expect(f.store.listEvents()).toEqual(events);
  expect(f.store.transaction(tx => tx.getCommandReceipt(rejectedCommandId))).toBeUndefined();
  const unbound = new CimiLoopKernel({ store: f.store }).execute(command); expect(unbound).toMatchObject({ code: "CALLER_REQUIRED", details: {} });
});

it("identifies nested assignment and target-version CAS facts separately from the Project revision", () => {
  const f = fixture(), assignment = f.store.listAssignments().find(item => item.role_key === "flow_owner")!;
  const created = flowSuccess(f.kernel.execute(f.projectCommand("CreateTargetVersion", { name: "CLI诊断规划" }, "flow_owner")));
  if (created.command_type !== "CreateTargetVersion") throw new Error("target expected");
  const commands = [
    { command: f.projectCommand("EndAssignment", { assignment_id: assignment.id, expected_assignment_revision: 99, reason: "过期前置修订" }), kind: "assignment", id: assignment.id, revision: assignment.revision },
    { command: f.projectCommand("CloseTargetVersion", { target_version_id: created.data.target_version.id, expected_target_revision: 99, reason: "过期前置修订" }, "flow_owner"), kind: "target_version", id: created.data.target_version.id, revision: created.data.target_version.revision }
  ];
  const events = f.store.listEvents();
  for (const { command, kind, id, revision } of commands) {
    const result = f.kernel.execute(command); if (!("code" in result)) throw new Error("conflict expected");
    expect(result.code).toBe("REVISION_CONFLICT");
    expect(parseDiagnostic(result.details.diagnostic).related).toContainEqual({ reference: { object_type: kind, id }, revision, ...(kind === "target_version" ? { status: "open" } : {}) });
  }
  expect(f.store.listEvents()).toEqual(events);
});

it("provides schema-valid CLI detail aliases, readable handoffs and identical text/JSON rejection facts", () => {
  const f = fixture(), source = f.capture(), wi = f.authorize(), context = f.prepareContext(wi, source);
  const handoff = flowSuccess(f.kernel.execute(f.command("SaveHandoff", "work_item", wi.id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id }, next_actor_ref: { object_type: "actor", id: f.actor.id }, completed: ["已固定上下文"], unresolved: ["还未实际运行"], next_action: "核验接续后预约", evidence_refs: [] })));
  if (handoff.command_type !== "SaveHandoff") throw new Error("handoff expected");
  const events = f.store.listEvents();
  for (const args of [["task", "show", wi.task_id], ["work-item", "show", wi.id], ["inspect", "context_manifest", context.context.id], ["inspect", "handoff_record", handoff.data.handoff.id]]) {
    const response = f.invoke(args); expect(response.status, response.stderr).toBe(0); expect(response.stderr).toBe("");
    const result = parseObject(JSON.parse(response.stdout)); expect(result.as_of_event_sequence).toBe(events.length);
  }
  const text = f.invoke(["run", "show", f.change.display_key], false); expect(text.status).toBe(0); expect(text.stdout).toContain("核验接续后预约"); expect(text.stdout).toContain(handoff.data.handoff.id);
  const detail = f.invoke(["inspect", "work_item", wi.id], false); expect(detail.stdout).toContain("资源范围"); expect(detail.stdout).toContain("src/query.ts");
  const args = ["work-item", "revoke", wi.id, "--reason", "旧版本测试", "--expected-revision", "99"];
  const jsonError = f.invoke(args); expect(jsonError.status).toBe(1); expect(jsonError.stderr).toBe("");
  const failure = v2.parseErrorResult(JSON.parse(jsonError.stdout)); const diagnostic = parseDiagnostic(failure.error.details.diagnostic);
  expect(diagnostic.current?.revision).toBe(wi.revision);
  const textError = f.invoke(args, false); expect(textError.status).toBe(jsonError.status); expect(textError.stdout).toBe("");
  expect(textError.stderr).toContain("REVISION_CONFLICT"); expect(textError.stderr).toContain(`Revision：${wi.revision}`); expect(textError.stderr).toContain(`cimiloop inspect work_item ${wi.id}`);
  expect(f.store.listEvents()).toEqual(events);
}, 60_000);

it("returns consistent input and missing-target errors and does not leak invalid JSON or create receipts", () => {
  const f = fixture(), events = f.store.listEvents(), path = join(dirname(f.path), "bad-input.json");
  const args = ["contract", "submit", f.change.display_key, "--file", path];
  for (const content of ["{secret-malformed-payload", "null", "[]"]) {
    writeFileSync(path, content); const response = f.invoke(args); expect(response.status).toBe(2); expect(response.stderr).toBe("");
    const result = v2.parseErrorResult(JSON.parse(response.stdout)); expect(result.error.code).toBe("CLI_ARGUMENT_INVALID"); expect(response.stdout).not.toContain("secret-malformed-payload");
  }
  const fileError = f.invoke(["contract", "submit", f.change.display_key, "--file", join(dirname(f.path), "missing.json")]); expect(fileError.status).toBe(2);
  const textError = f.invoke(args, false); expect(textError.status).toBe(2); expect(textError.stdout).toBe(""); expect(textError.stderr).toContain("CLI_ARGUMENT_INVALID");
  const commandError = f.invoke(["--unsupported-option"]); expect(commandError.status).toBe(2); v2.parseErrorResult(JSON.parse(commandError.stdout));
  const missing = f.invoke(["work-item", "revoke", v2.createInternalId(), "--reason", "无目标"]); expect(missing.status).toBe(3); expect(JSON.parse(missing.stdout)).toMatchObject({ error: { code: "WORK_ITEM_NOT_FOUND" } });
  const query = f.invoke(["inspect", "task", v2.createInternalId()]); expect(query.status).toBe(3); expect(JSON.parse(query.stdout)).toMatchObject({ error: { code: "OBJECT_NOT_FOUND" } });
  const directoryError = f.invoke(["--project-dir", join(f.directory, "does-not-exist"), "doctor"]); expect(directoryError.status).toBe(2); expect(JSON.parse(directoryError.stdout)).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID" } });
  const interactive = f.invoke(["init"]); expect(interactive.status).toBe(2); expect(JSON.parse(interactive.stdout)).toMatchObject({ error: { code: "CLI_ARGUMENT_INVALID" } });
  writeFileSync(path, JSON.stringify({ unexpected: true })); const schemaError = f.invoke(args); expect(schemaError.status).toBe(2); expect(JSON.parse(schemaError.stdout)).toMatchObject({ error: { code: "PROTOCOL_VALIDATION_FAILED" } });
  writeFileSync(path, "{}"); const rawError = f.invoke(["verification", "record-evidence", f.task().id, "--file", path, "--raw-file", join(dirname(f.path), "missing-raw.json")]); expect(rawError.status).toBe(2);
  writeFileSync(path, Buffer.alloc(8 * 1024 * 1024 + 1)); expect(f.invoke(args).status).toBe(2);
  expect(f.store.listEvents()).toEqual(events);
}, 60_000);
