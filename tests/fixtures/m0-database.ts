import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CimiLoopKernel } from "../../packages/kernel/dist/v1.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/dist/v1.js";
import { createInternalId, type AnyCommand, type CommandSuccess } from "../../packages/protocol/dist/v1/index.js";

export const fixtureTime = "2026-09-20T00:00:00.000Z";
export const createM0Database = (directory: string, repositoryPath = directory) => {
  mkdirSync(directory, { recursive: true });
  const databasePath = join(directory, "project.db"), store = new SqliteProjectStore(databasePath);
  const kernel = new CimiLoopKernel({ store, now: () => fixtureTime });
  const commands: AnyCommand[] = [], results: CommandSuccess[] = [];
  const execute = (command: AnyCommand): CommandSuccess => {
    commands.push(command); const result = kernel.execute(command);
    if (!("ok" in result)) throw new Error(JSON.stringify(result));
    results.push(result); return result;
  };
  const base = () => ({ schema_version: "1.0.0" as const, command_id: createInternalId(), correlation_id: createInternalId(), requested_at: fixtureTime,
    source: { origin: "human_cli" as const, producer: "cimiloop-cli", repository_path: repositoryPath } });
  const initialized = execute({ ...base(), command_type: "InitializeProject", payload: { name: "M0 Migration", repository_kind: "directory", repository_path: repositoryPath, owner_name: "原项目负责人", owner_email: "owner@example.com" } });
  if (!("project" in initialized.data)) throw new Error("Expected Project result");
  const project = initialized.data.project, actor = initialized.data.actor;
  const context = () => ({ ...base(), project_id: project.id, actor_id: actor.id });
  const active = execute({ ...context(), command_type: "CreateChange", payload: { title: "活动需求" } });
  const paused = execute({ ...context(), command_type: "CreateChange", payload: { title: "待恢复需求" } });
  if (!("change" in paused.data)) throw new Error("Expected Change result");
  const target = { object_type: "change" as const, id: paused.data.change.id, domain_version: 1 };
  execute({ ...context(), command_type: "PauseChange", target, expected_revision: 1, payload: { reason: "等待需求确认" } });
  execute({ ...context(), command_type: "ResumeChange", target, expected_revision: 2, payload: {} });
  execute({ ...context(), command_type: "PauseChange", target, expected_revision: 3, payload: { reason: "等待依赖交付" } });
  const delivered = store.claimOutbox(fixtureTime, "2026-09-20T00:01:00.000Z");
  if (!delivered) throw new Error("Expected Outbox");
  store.markOutboxDelivered(delivered.id, "2026-09-20T00:00:01.000Z");
  store.claimOutbox(fixtureTime, "2026-09-20T00:01:00.000Z"); // Expired historical lease remains recoverable.
  writeFileSync(join(directory, "instance.json"), `${JSON.stringify({ schema_version: "1.0.0", instance_id: project.instance_id, project_id: project.id, actor_id: actor.id, created_at: fixtureTime }, null, 2)}\n`);
  return { directory, databasePath, store, kernel, project, actor, active, paused, commands, results };
};
