import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { writeInstance } from "../../apps/cli/src/instance.js";
import { createRunProject } from "../fixtures/run-project.js";
import { flowTime } from "../fixtures/flow-project.js";
import * as v2 from "../../packages/protocol/src/v2/index.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
it("runs actual context/reservation/observation/handoff CLI and replays immutable receipts", () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-run-cli-")); dirs.push(directory); const f = createRunProject(directory); stores.push(f.store);
  writeInstance(join(dirname(f.path), "instance.json"), { schema_version: "1.0.0", instance_id: f.project.instance_id, project_id: f.project.id, actor_id: f.actor.id, created_at: flowTime });
  const source = f.capture(), wi = f.authorize(3), history: { args: string[]; result: v2.CommandSuccess }[] = [];
  const invoke = (args: string[]) => JSON.parse(execFileSync(process.execPath, ["--no-warnings", resolve("apps/cli/dist/bin.js"), "--project-dir", directory, "--json", ...args], { encoding: "utf8", windowsHide: true }));
  const act = <T extends v2.CommandSuccess["command_type"]>(kind: T, name: string, target: string, payload: unknown, rawFile?: string): Extract<v2.CommandSuccess, { command_type: T }> => {
    const path = join(dirname(f.path), `payload-${v2.createInternalId()}.json`); writeFileSync(path, JSON.stringify(payload));
    const args = ["--command-id", v2.createInternalId(), "run", name, target, "--file", path, ...(rawFile ? ["--raw-file", rawFile] : [])];
    const result = v2.parseCommandSuccess(invoke(args)); expect(result.command_type).toBe(kind); history.push({ args, result }); return result as Extract<v2.CommandSuccess, { command_type: T }>;
  };
  const prepared = act("PrepareRunContext", "prepare-context", wi.id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id } });
  const reserved = act("ReserveRun", "reserve", wi.task_id, { work_item_ref: { object_type: "work_item", id: wi.id }, context_ref: { object_type: "context_manifest", id: prepared.data.context.id }, input_digest: prepared.data.context.input_digest });
  expect(reserved.data.run.status).toBe("Reserved"); expect(reserved.data.task.usage.attempts_consumed).toBe(1);
  f.setTime(new Date().toISOString()); const report = f.raw(reserved.data.run, "succeeded");
  const observed = act("RecordRunObservation", "observe", reserved.data.run.id, {}, report.path); expect(observed.data.run.status).toBe("Succeeded"); expect(observed.data.task.status).toBe("InProgress");
  const handoff = act("SaveHandoff", "handoff", wi.id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id }, run_ref: { object_type: "run", id: reserved.data.run.id }, next_actor_ref: { object_type: "actor", id: f.actor.id }, completed: ["人工运行已记录"], unresolved: ["任务证据待评价"], next_action: "按固定证据集继续", evidence_refs: [] });
  const next = act("PrepareRunContext", "prepare-context", wi.id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id } });
  const proof = act("CheckResumption", "check-resumption", wi.id, { handoff_ref: { object_type: "handoff_record", id: handoff.data.handoff.id }, context_ref: { object_type: "context_manifest", id: next.data.context.id }, input_digest: next.data.context.input_digest }); expect(proof.data.resumption.budget_remaining.attempts).toBe(2);
  const events = f.store.listEvents(); for (const item of history) expect(invoke(item.args)).toEqual(item.result); expect(f.store.listEvents()).toEqual(events);
  const show = v2.compileValidator(v2.RunShowResultSchema)(invoke(["run", "show", f.change.display_key])); expect(show).toMatchObject({ runs: [{ status: "Succeeded" }], handoffs: [{ id: handoff.data.handoff.id }], resumptions: [{ id: proof.data.resumption.id }] });
}, 120_000);
