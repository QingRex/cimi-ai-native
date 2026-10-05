import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInternalId } from "../../packages/protocol/dist/index.js";
import { createM0Database } from "../fixtures/m0-database.js";
import { compileValidator, FlowStatusResultSchema, IntentShowResultSchema, ExecutionShowResultSchema, parseCommandSuccess, type CommandSuccess, type FlowStatusResult, type IntentShowResult, type ExecutionShowResult } from "../../packages/protocol/dist/v2/index.js";
import { contractBody, planBody } from "../fixtures/intent-project.js";

const temporaryDirectories: string[] = [];
const cli = resolve("apps/cli/dist/bin.js");

const run = (projectDirectory: string, appData: string, args: string[]): unknown => {
  const output = execFileSync(
    process.execPath,
    ["--no-warnings", cli, "--project-dir", projectDirectory, "--json", ...args],
    {
      encoding: "utf8",
      env: { ...process.env, LOCALAPPDATA: appData }
    }
  );
  return JSON.parse(output);
};

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("cimiloop CLI", () => {
  it("confirms real Contract and Plan, starts a Change and replays every original command after later writes", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-cli-intent-")); temporaryDirectories.push(root);
    const appData = join(root, "app-data"), history: { args: string[]; result: CommandSuccess }[] = [];
    const act = <T extends CommandSuccess["command_type"]>(type: T, args: string[]): Extract<CommandSuccess, { command_type: T }> => {
      const full = ["--command-id", createInternalId(), ...args], result = parseCommandSuccess(run(root, appData, full));
      expect(result.command_type).toBe(type); history.push({ args: full, result }); return result as Extract<CommandSuccess, { command_type: T }>;
    };
    const initialized = act("InitializeProject", ["init", "--owner-name", "Bound Human", "--yes"]), actorId = initialized.data.actor.id;
    for (const role of ["flow_owner", "technical_owner", "policy_owner"]) act("AssignResponsibility", ["role", "assign", "--actor", actorId, "--role", role, "--scope", "project"]);
    act("UpdateProjectSettings", ["settings", "update", "--wip-limit", "1"]);
    const change = act("CreateChange", ["change", "create", "--title", "实际CLI确认", "--requirement-owner", actorId]).data.change;
    const contractFile = join(root, "contract.json"), planFile = join(root, "plan.json"); writeFileSync(contractFile, JSON.stringify(contractBody()));
    const contractProposal = act("SubmitContractProposal", ["contract", "submit", change.display_key, "--file", contractFile]).data.proposal;
    const risk = act("RecordRiskAssessment", ["risk", "assess", change.display_key, "--proposal-id", contractProposal.id, "--proposal-revision", "1", "--level", "ordinary", "--reason", "已核对本地影响"]).data.risk_assessment;
    const confirm = (kind: "contract" | "plan", proposalId: string) => {
      const request = act("RequestDecision", ["decision", "request", change.display_key, "--action", `confirm_${kind}`, "--proposal-id", proposalId, "--proposal-revision", "1", ...(kind === "contract" ? ["--risk-id", risk.id] : [])]).data.request;
      const decision = act("RecordDecision", ["decision", "record", change.display_key, "--request-id", request.id, "--input-digest", request.input_digest.value, "--choice", "approve", "--reason", "本人核对后批准"]).data.decision;
      return act(kind === "contract" ? "ConfirmContract" : "ConfirmPlan", [kind, "confirm", change.display_key, "--proposal-id", proposalId, "--proposal-revision", "1", "--request-id", request.id, "--decision-id", decision.id, "--input-digest", request.input_digest.value]);
    };
    const contract = confirm("contract", contractProposal.id); writeFileSync(planFile, JSON.stringify(planBody(change.id, contract.data.change.contract_ref!)));
    const planProposal = act("SubmitPlanProposal", ["plan", "submit", change.display_key, "--file", planFile]).data.proposal;
    const plan = confirm("plan", planProposal.id), planRef = plan.data.change.plan_ref!;
    const tasks = act("InitializePlanTasks", ["task", "initialize", change.display_key, "--plan-id", planRef.id, "--plan-version", String(planRef.domain_version)]).data.tasks;
    const started = act("StartChange", ["change", "start", change.display_key, "--plan-id", planRef.id, "--plan-version", String(planRef.domain_version), "--reason", "正式依据与容量通过"]);
    expect(started.data.change.lifecycle_state).toBe("Executing");
    const execution = () => compileValidator<ExecutionShowResult>(ExecutionShowResultSchema)(run(root, appData, ["task", "list", change.display_key]));
    const workFile = join(root, "work.json"), budget = { max_attempts: 3, max_elapsed_ms: 60_000 };
    const payload = { definition_ref: tasks[0]!.definition_ref, executor_ref: { object_type: "actor", id: actorId }, allowed_actions: ["edit_files", "run_checks"], allowed_resources: ["src/query.ts"], budget, stop_conditions: ["范围或预算不符立即停止"], reason: "Human核对后具体授权" };
    writeFileSync(workFile, JSON.stringify(payload));
    const item = act("CreateWorkItem", ["work-item", "create", tasks[0]!.id, "--file", workFile]).data.work_item;
    expect(execution().readiness[0]).toMatchObject({ ready: true });
    act("RevokeWorkItem", ["work-item", "revoke", item.id, "--reason", "人工停止"]);
    const repairFile = join(root, "repair.json"); writeFileSync(repairFile, JSON.stringify({ ...payload, acknowledged_usage_digest: execution().readiness[0]!.usage_digest }));
    act("CreateWorkItem", ["work-item", "create", tasks[0]!.id, "--file", repairFile]);
    const grantFile = join(root, "authorization.json"); writeFileSync(grantFile, JSON.stringify({ scope: { kind: "project", id: initialized.data.project.id }, executor_actor_ids: [actorId], allowed_actions: ["edit_files", "run_checks"], allowed_resources: ["src/**"], environment_ids: [], risk_conditions: { allowed_levels: ["ordinary"], allowed_purposes: ["implementation"] }, valid_from: new Date(Date.now() + 60_000).toISOString(), expires_at: new Date(Date.now() + 86_400_000).toISOString(), limits: budget }));
    const authorization = act("PublishStandingAuthorization", ["authorization", "publish", "--file", grantFile]).data.authorization;
    act("PublishStandingAuthorization", ["authorization", "publish", "--authorization-id", authorization.id, "--file", grantFile]);
    act("RevokeStandingAuthorization", ["authorization", "revoke", authorization.id, "--reason", "收回常规权限"]);
    // Later Project write exercises replay of the initial authorization's Project CAS.
    act("RegisterActor", ["actor", "register", "--type", "human", "--name", "Later Human"]);
    const executionBeforeReplay = execution(); expect(executionBeforeReplay.work_items).toHaveLength(2); expect(executionBeforeReplay.authorization_versions).toHaveLength(2);
    const view = () => compileValidator<IntentShowResult>(IntentShowResultSchema)(run(root, appData, ["decision", "list", change.display_key]));
    const before = view(); expect(before.contract_versions).toHaveLength(1); expect(before.plan_versions).toHaveLength(1);
    expect(before.decision_requests.map(item => item.status)).toEqual(["applied", "applied"]); expect(before.lifecycle_transitions).toHaveLength(2);
    for (const item of history) expect(run(root, appData, item.args)).toEqual(item.result);
    expect(view()).toEqual(before); expect(execution()).toEqual(executionBeforeReplay);
    const denied = spawnSync(process.execPath, ["--no-warnings", cli, "--project-dir", root, "--json", "plan", "submit", change.display_key, "--file", planFile], { encoding: "utf8", env: { ...process.env, LOCALAPPDATA: appData } });
    expect(denied.status).toBe(1); expect(denied.stderr).toBe(""); expect(JSON.parse(denied.stdout)).toMatchObject({ error: { code: "CHANGE_STATE_INVALID" } });
  }, 90_000); // Full confirmation/authorization chain and replay in separate CLI processes.

  it("configures flow, manages target versions and planning, and preserves idempotent retries after later writes", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-cli-flow-")); temporaryDirectories.push(root);
    const appData = join(root, "app-data");
    const initialized = run(root, appData, ["init", "--owner-name", "Flow Owner", "--yes"]) as { data: { actor: { id: string } } };
    const actorId = initialized.data.actor.id;
    const flow = (args: string[]) => compileValidator<FlowStatusResult>(FlowStatusResultSchema)(run(root, appData, args));
    expect(flow(["settings", "show"])).toMatchObject({ settings_version: null, priority_order: null, wip: { used: 0, limit: null, available: null } });
    run(root, appData, ["role", "assign", "--actor", actorId, "--role", "flow_owner", "--scope", "project"]);
    const settingsId = createInternalId(), settingsArgs = ["--command-id", settingsId, "settings", "update", "--wip-limit", "2", "--priority-order", "higher_first"];
    const settings = run(root, appData, settingsArgs);
    expect(settings).toMatchObject({ command_type: "UpdateProjectSettings", data: { settings_version: { version: 1,
      settings: { wip_limit: 2, flow_owner_actor_id: actorId, priority_arbiter_actor_id: actorId } } } });
    run(root, appData, ["settings", "update", "--wip-limit", "3", "--priority-order", "lower_first"]);
    expect(run(root, appData, settingsArgs)).toEqual(settings);
    expect(flow(["settings", "show"])).toMatchObject({ settings_version: { version: 2 }, priority_order: "lower_first", wip: { used: 0, limit: 3, available: 3 } });
    const targetId = createInternalId(), targetArgs = ["--command-id", targetId, "target-version", "create", "--name", "release-1",
      "--starts-at", "2026-11-01T00:00:00.000Z", "--ends-at", "2026-12-01T00:00:00.000Z"];
    const target = run(root, appData, targetArgs) as { data: { target_version: { id: string } } };
    const targetVersionId = target.data.target_version.id;
    run(root, appData, ["change", "create", "--title", "First", "--target-version", targetVersionId]);
    run(root, appData, ["change", "create", "--title", "Second"]);
    const planningId = createInternalId(), planningArgs = ["--command-id", planningId, "change", "planning", "CHG-0002", "--priority", "5", "--target-version", targetVersionId, "--reason", "规划"];
    const planned = run(root, appData, planningArgs);
    expect(planned).toMatchObject({ command_type: "ChangePlanning", data: { change: { priority: 5, target_version_id: targetVersionId } } });
    run(root, appData, ["change", "planning", "CHG-0002", "--priority", "9", "--arbitration", "--reason", "争议裁决"]);
    expect(run(root, appData, planningArgs)).toEqual(planned);
    expect(flow(["change", "priority"]).changes.map(change => change.display_key)).toEqual(["CHG-0001", "CHG-0002"]);
    run(root, appData, ["change", "planning", "CHG-0002", "--clear-target-version", "--reason", "取消规划"]);
    const closeId = createInternalId(), closeArgs = ["--command-id", closeId, "target-version", "close", targetVersionId, "--reason", "结束规划窗口"];
    const closed = run(root, appData, closeArgs);
    expect(closed).toMatchObject({ command_type: "CloseTargetVersion", data: { target_version: { status: "closed", revision: 2 } } });
    expect(run(root, appData, closeArgs)).toEqual(closed); expect(run(root, appData, targetArgs)).toEqual(target);
    const state = flow(["target-version", "list"]);
    expect(state.target_versions).toHaveLength(1); expect(state.changes[0]).toMatchObject({ lifecycle_state: "Draft", target_version_id: targetVersionId });
    expect(state.changes[1]).not.toHaveProperty("target_version_id");
    expect(flow(["change", "wip"]).as_of_event_sequence).toBe(state.as_of_event_sequence);
    const denied = (args: string[]) => {
      const result = spawnSync(process.execPath, ["--no-warnings", cli, "--project-dir", root, "--json", ...args], { encoding: "utf8", env: { ...process.env, LOCALAPPDATA: appData } });
      expect(result.status).toBe(1); expect(result.stderr).toBe(""); return JSON.parse(result.stdout);
    };
    expect(denied(["change", "planning", "CHG-0002", "--target-version", targetVersionId, "--reason", "已关闭"])).toMatchObject({ error: { code: "TARGET_VERSION_CLOSED" } });
    expect(denied(["change", "start", "CHG-0001", "--plan-id", createInternalId(), "--plan-version", "1", "--reason", "尚未确认"])).toMatchObject({ error: { code: "CHANGE_STATE_INVALID" } });
    expect(flow(["change", "wip"]).as_of_event_sequence).toBe(state.as_of_event_sequence);
  }, 40_000);

  it("uses the bound local identity for role governance, handoff and idempotent CLI retries", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-cli-governance-")); temporaryDirectories.push(root);
    const appData = join(root, "app-data"), initId = createInternalId();
    const initialized = run(root, appData, ["--command-id", initId, "init", "--owner-name", "Bound Owner", "--yes"]) as {
      data: { project: { id: string }; actor: { id: string } }
    };
    expect(run(root, appData, ["--command-id", initId, "init", "--owner-name", "Bound Owner", "--yes"])).toEqual(initialized);
    const ownerId = initialized.data.actor.id, registerId = createInternalId();
    const registered = run(root, appData, ["--command-id", registerId, "actor", "register", "--type", "human", "--name", "Requirement Owner"]) as {
      data: { actor: { id: string } }
    };
    expect(run(root, appData, ["--command-id", registerId, "actor", "register", "--type", "human", "--name", "Requirement Owner"])).toEqual(registered);
    const grantId = createInternalId();
    const assigned = run(root, appData, ["--command-id", grantId, "role", "assign", "--actor", ownerId, "--role", "flow_owner", "--scope", "project"]) as {
      data: { assignment: { id: string } }
    };
    expect(run(root, appData, ["--command-id", grantId, "role", "assign", "--actor", ownerId, "--role", "flow_owner", "--scope", "project"])).toEqual(assigned);
    run(root, appData, ["change", "create", "--title", "Governed Change", "--kind", "bug", "--requirement-owner", ownerId]);
    const transferId = createInternalId(), transferArgs = ["--command-id", transferId, "change", "transfer", "CHG-0001", "--role", "requirement_owner", "--to-actor", registered.data.actor.id, "--reason", "责任移交"];
    const transferred = run(root, appData, transferArgs);
    expect(transferred).toMatchObject({ command_type: "TransferChangeResponsibility", revision: 2,
      data: { change: { owner_actor_id: ownerId, requirement_owner_actor_id: registered.data.actor.id } } });
    expect(run(root, appData, transferArgs)).toEqual(transferred);
    const endId = createInternalId(), endArgs = ["--command-id", endId, "role", "end", assigned.data.assignment.id, "--reason", "结束额外职责"];
    const ended = run(root, appData, endArgs);
    expect(ended).toMatchObject({ command_type: "EndAssignment", data: { assignment: { revision: 2 } } });
    expect(run(root, appData, endArgs)).toEqual(ended);
    run(root, appData, ["change", "pause", "CHG-0001", "--reason", "本人仍承担 Change Owner"]);
    const listed = run(root, appData, ["role", "list"]) as { actors: unknown[]; assignments: unknown[] };
    expect(listed.actors).toHaveLength(2); expect(listed.assignments).toHaveLength(5);
    expect(listed.assignments).toContainEqual(expect.objectContaining({ role_key: "flow_owner", ended_at: expect.any(String) }));
    expect(listed.assignments).toContainEqual(expect.objectContaining({ role_key: "requirement_owner", actor_id: registered.data.actor.id, granted_by: ownerId }));
    const denied = spawnSync(process.execPath, ["--no-warnings", cli, "--project-dir", root, "--json", "--acting-role", "flow_owner", "actor", "register", "--type", "human", "--name", "cannot govern"], { encoding: "utf8" });
    expect(denied.status).toBe(1); expect(JSON.parse(denied.stdout)).toMatchObject({ error: { code: "ROLE_NOT_ASSIGNED" } });
    expect(JSON.parse(readFileSync(join(root, ".cimiloop", "instance.json"), "utf8"))).toHaveProperty("actor_id", ownerId);
  }, 40_000);

  it("requires an explicit migration, then replays old create and pause receipts through the same CLI", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-cli-migration-")); temporaryDirectories.push(root);
    const f = createM0Database(join(root, ".cimiloop"), root); f.store.close();
    const appData = join(root, "app-data");
    const rejected = spawnSync(process.execPath, ["--no-warnings", cli, "--project-dir", root, "--json", "change", "list"], { encoding: "utf8" });
    expect(rejected.status).toBe(1); expect(JSON.parse(rejected.stdout)).toMatchObject({ schema_version: "2.0.0", ok: false, error: { code: "MIGRATION_REQUIRED" } });
    expect(run(root, appData, ["migrate", "--check"])).toMatchObject({ mode: "check", from_format: 1, migration_required: true });
    expect(run(root, appData, ["migrate"])).toMatchObject({ mode: "apply", from_format: 1, backup_digest: { algorithm: "sha256" } });
    expect(run(root, appData, ["--command-id", f.commands[1]!.command_id, "change", "create", "--title", "活动需求"])).toEqual(f.results[1]);
    expect(run(root, appData, ["--command-id", f.commands[3]!.command_id, "change", "pause", "CHG-0002", "--reason", "等待需求确认"])).toEqual(f.results[3]);
    expect(run(root, appData, ["change", "show", "CHG-0002"])).toMatchObject({ schema_version: "2.0.0", change: { operating_status: "Paused", pause_reason: "等待依赖交付", revision: 4 }, as_of_event_sequence: 7 });
    expect(run(root, appData, ["change", "create", "--title", "升级后需求"])).toMatchObject({ schema_version: "2.0.0", data: { change: { display_key: "CHG-0003" } } });
  }, 20_000);
  it("runs the M0 flow and keeps JSON output machine-readable", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-cli-test-"));
    temporaryDirectories.push(root);
    const repository = join(root, "repository");
    const appData = join(root, "app-data");
    execFileSync("git", ["init", repository], { stdio: "ignore" });

    const initialized = run(repository, appData, [
      "init",
      "--owner-name",
      "CLI Owner",
      "--owner-email",
      "cli@example.com",
      "--yes"
    ]) as { ok: boolean };
    expect(initialized.ok).toBe(true);

    const commandId = createInternalId();
    const created = run(repository, appData, ["--command-id", commandId, "change", "create", "--title", "CLI M0"]);
    const replayed = run(repository, appData, ["--command-id", commandId, "change", "create", "--title", "CLI M0"]);
    expect(replayed).toEqual(created);

    run(repository, appData, ["change", "pause", "CHG-0001", "--reason", "CLI test"]);
    const resumed = run(repository, appData, ["change", "resume", "CHG-0001"]) as { revision: number };
    expect(resumed.revision).toBe(3);

    const doctor = run(repository, appData, ["doctor"]) as {
      ok: boolean;
      changes: number;
      events: number;
      pending_outbox: number;
    };
    expect(doctor).toMatchObject({ ok: true, changes: 1, events: 4, pending_outbox: 4 });

    const instance = JSON.parse(readFileSync(join(repository, ".git", "cimiloop", "instance.json"), "utf8"));
    expect(instance.project_id).toBeTruthy();
  }, 20_000);

  it("returns schema-valid JSON for pre-kernel and argument failures", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-cli-error-test-"));
    temporaryDirectories.push(root);
    const missingProject = spawnSync(
      process.execPath,
      ["--no-warnings", cli, "--json", "--project-dir", root, "change", "list"],
      { encoding: "utf8" }
    );
    expect(missingProject.status).toBe(3);
    expect(missingProject.stderr).toBe("");
    expect(JSON.parse(missingProject.stdout)).toMatchObject({
      ok: false,
      error: { code: "PROJECT_NOT_INITIALIZED", category: "not_found", message: "当前目录尚未初始化 CimiLoop Project，请先运行 cimiloop init" }
    });
    expect(missingProject.stdout).not.toContain(root);

    const missingTitle = spawnSync(
      process.execPath,
      ["--no-warnings", cli, "--json", "--project-dir", root, "change", "create"],
      { encoding: "utf8" }
    );
    expect(missingTitle.status).toBe(2);
    expect(missingTitle.stderr).toBe("");
    expect(JSON.parse(missingTitle.stdout)).toMatchObject({
      ok: false,
      error: { code: "CLI_ARGUMENT_INVALID", category: "validation" }
    });
  });
});
