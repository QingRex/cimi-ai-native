import { join } from "node:path";
import { CimiLoopKernel, type CallerContext } from "../../packages/kernel/src/index.js";
import * as v2 from "../../packages/protocol/src/v2/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/src/index.js";

export const flowTime = "2026-10-03T00:00:00.000Z";
export const flowBase = () => ({ schema_version: v2.SCHEMA_VERSION, command_id: v2.createInternalId(), correlation_id: v2.createInternalId(),
  requested_at: flowTime, source: { origin: "human_cli", producer: "flow-fixture" } });
export const flowSuccess = (result: ReturnType<CimiLoopKernel["execute"]>): v2.CommandSuccess => {
  if (!("ok" in result) || !("schema_version" in result)) throw new Error(JSON.stringify(result)); return result;
};
export interface FlowFixtureOptions { repositoryKind?: "git" | "directory"; databasePath?: string }
export const createFlowProject = (directory: string, options: FlowFixtureOptions = {}) => {
  const path = options.databasePath ?? join(directory, "project.db"), store = new SqliteProjectStore(path);
  const init = flowSuccess(new CimiLoopKernel({ store, caller: { kind: "bootstrap" }, now: () => flowTime }).execute({ ...flowBase(),
    command_type: "InitializeProject", payload: { name: "Flow", repository_kind: options.repositoryKind ?? "directory", repository_path: directory, owner_name: "Owner" } }));
  if (init.command_type !== "InitializeProject") throw new Error("init expected");
  const { project, actor, assignment } = init.data;
  const caller: CallerContext = { kind: "local_operator", project_id: project.id, actor_id: actor.id };
  const kernel = new CimiLoopKernel({ store, caller, now: () => flowTime });
  const context = (role = "project_owner") => ({ ...flowBase(), project_id: project.id, actor_id: actor.id, acting_role: role });
  const projectCommand = <P>(commandType: string, payload: P, role = "project_owner") => ({ ...context(role), command_type: commandType,
    target: { object_type: "project", id: project.id }, expected_revision: store.getProject()!.revision, payload });
  const changeCommand = <P>(commandType: string, change: v2.Change, payload: P, role = "flow_owner") => ({ ...context(role), command_type: commandType,
    target: { object_type: "change", id: change.id }, expected_revision: change.revision, payload });
  const grant = (role = "flow_owner", actorId = actor.id) => flowSuccess(kernel.execute(projectCommand("AssignResponsibility", {
    actor_id: actorId, role_key: role, scope: { kind: "project", id: project.id }
  })));
  const settingsCommand = (overrides: Partial<v2.ProjectSettings> = {}) => projectCommand("UpdateProjectSettings", {
    base_settings_ref: store.getProject()!.settings_ref ?? null, settings: { wip_limit: 3, flow_owner_actor_id: actor.id,
      priority_arbiter_actor_id: actor.id, priority_order: "higher_first", check_interval_ms: 60_000, ...overrides }
  });
  const configure = (overrides: Partial<v2.ProjectSettings> = {}) => { grant(); return flowSuccess(kernel.execute(settingsCommand(overrides))); };
  const create = (title = "需求") => {
    const result = flowSuccess(kernel.execute({ ...context(), command_type: "CreateChange", payload: { title } }));
    if (result.command_type !== "CreateChange") throw new Error("create expected"); return result.data.change;
  };
  // Test-only states exercise capacity/denial. They are not approved Contract/Plan facts or completed business commands.
  const seedState = (change: v2.Change, fields: Partial<v2.Change>) => {
    const current = store.getChange(change.id)!;
    const next = v2.compileValidator<v2.Change>(v2.ChangeSchema)({ ...current, ...fields, revision: current.revision + 1 });
    store.transaction(tx => tx.updateChange(next, current.revision)); return next;
  };
  return { directory, path, store, kernel, caller, project, actor, assignment, context, projectCommand, changeCommand, grant,
    settingsCommand, configure, create, seedState };
};
