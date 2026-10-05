import { fork } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel, assignmentIsEffective, resolveAssignment, type CallerContext } from "../../kernel/src/index.js";
import * as v2 from "../../protocol/src/v2/index.js";
import { StoreConflictError, type ProjectStore, type StoreTransaction } from "../../store/dist/index.js";
import { MigrationRunner, SqliteProjectStore } from "../src/index.js";
import { createM0Database } from "../../../tests/fixtures/m0-database.js";

const time = "2026-10-03T00:00:00.000Z", directories: string[] = [], resources: { close(): void }[] = [];
const base = () => ({ schema_version: v2.SCHEMA_VERSION, command_id: v2.createInternalId(), correlation_id: v2.createInternalId(),
  requested_at: time, source: { origin: "human_cli", producer: "governance-test" } });
const success = (result: ReturnType<CimiLoopKernel["execute"]>): v2.CommandSuccess => {
  if (!("ok" in result) || !("schema_version" in result)) throw new Error(JSON.stringify(result));
  return result;
};
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-governance-")); directories.push(directory);
  const path = join(directory, "project.db"), store = new SqliteProjectStore(path); resources.push(store);
  const bootstrap = new CimiLoopKernel({ store, caller: { kind: "bootstrap" }, now: () => time });
  const initCommand = { ...base(), command_type: "InitializeProject", payload: { name: "Governance", repository_kind: "directory", repository_path: directory, owner_name: "Owner" } };
  const initialized = success(bootstrap.execute(initCommand));
  if (initialized.command_type !== "InitializeProject") throw new Error("init expected");
  const { project, actor, assignment } = initialized.data;
  const caller: CallerContext = { kind: "local_operator", project_id: project.id, actor_id: actor.id };
  const kernel = new CimiLoopKernel({ store, caller, now: () => time });
  const context = () => ({ ...base(), project_id: project.id, actor_id: actor.id, acting_role: "project_owner" });
  const projectCommand = (commandType: string, payload: unknown, revision = store.getProject()!.revision) => ({
    ...context(), command_type: commandType, target: { object_type: "project", id: project.id }, expected_revision: revision, payload
  });
  const register = (payload: v2.ActorRegistration = { actor_type: "human", identity_source: "local_operator", display_name: "Next Owner" }) => {
    const result = success(kernel.execute(projectCommand("RegisterActor", payload)));
    if (result.command_type !== "RegisterActor") throw new Error("register expected"); return result.data.actor;
  };
  const create = (requirementOwner?: string) => {
    const result = success(kernel.execute({ ...context(), command_type: "CreateChange", payload: { title: "需求",
      ...(requirementOwner ? { requirement_owner_actor_id: requirementOwner } : {}) } }));
    if (result.command_type !== "CreateChange") throw new Error("create expected"); return result.data.change;
  };
  const transfer = (change: v2.Change, nextActorId: string, role = "change_owner") => ({ ...context(),
    command_type: "TransferChangeResponsibility", target: { object_type: "change", id: change.id }, expected_revision: change.revision,
    payload: { role_key: role, new_actor_id: nextActorId, grant_basis_refs: [{ object_type: "assignment", id: assignment.id }], reason: "明确责任移交" } });
  const snapshot = () => store.readSnapshot(reader => ({ project: reader.getProject(), actors: reader.listActors(),
    assignments: reader.listAssignments(), changes: reader.listChanges(), events: reader.listEvents(), outbox: reader.listOutbox() }));
  return { directory, path, store, kernel, bootstrap, caller, actor, project, assignment, context, projectCommand, register, create, transfer, snapshot, initCommand };
};
afterEach(() => { while (resources.length) resources.pop()!.close(); while (directories.length) rmSync(directories.pop()!, { recursive: true, force: true }); });

const race = async (path: string, caller: CallerContext, commands: unknown[]) => {
  const clients = commands.map(() => fork(resolve("tests/fixtures/governance-client.mjs"), [path], { silent: true, execArgv: ["--no-warnings"] }));
  try {
    await Promise.all(clients.map(client => new Promise<void>((resolveReady, reject) => {
      client.once("error", reject); client.once("exit", code => reject(new Error(`worker exited before ready: ${code}`)));
      client.once("message", message => { if ((message as { ready?: boolean }).ready) resolveReady(); else reject(new Error(JSON.stringify(message))); });
    })));
    const results = clients.map(client => new Promise<unknown>((resolveResult, reject) => {
      client.once("message", message => { const result = message as { result?: unknown; error?: string }; result.error ? reject(new Error(result.error)) : resolveResult(result.result); });
      client.once("error", reject); client.once("exit", code => { if (code !== 0) reject(new Error(`worker failed: ${code}`)); });
    }));
    const exits = clients.map(client => new Promise<void>((resolveExit, reject) => {
      client.once("exit", code => code === 0 ? resolveExit() : reject(new Error(`worker exit: ${code}`)));
      client.once("error", reject);
    }));
    clients.forEach((client, index) => client.send({ command: commands[index], caller, now: time }));
    const values = await Promise.all(results); await Promise.all(exits); return values;
  } finally { clients.forEach(client => { if (client.exitCode === null) client.kill(); }); }
};

describe("V1-03 responsibility governance", () => {
  it("requires a bound caller before receipt replay and rejects bootstrap reuse, spoofed human IDs and injected caller fields", () => {
    const f = fixture(), changeCommand = { ...f.context(), command_type: "CreateChange", payload: { title: "original" } };
    const original = success(f.kernel.execute(changeCommand)), before = f.snapshot();
    expect(new CimiLoopKernel({ store: f.store }).execute(changeCommand)).toMatchObject({ code: "CALLER_REQUIRED" });
    expect(f.bootstrap.execute(changeCommand)).toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" });
    expect(f.bootstrap.execute(f.initCommand)).toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" });
    const malicious = new CimiLoopKernel({ store: f.store, caller: { kind: "agent", project_id: f.project.id, actor_id: f.actor.id,
      provider_identity_ref: { provider: "fake", resource_type: "actor", locator: "agent" } } });
    expect(malicious.execute(changeCommand)).toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" });
    expect(f.kernel.execute({ ...changeCommand, actor_id: v2.createInternalId() })).toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" });
    expect(f.kernel.execute({ ...changeCommand, caller: f.caller })).toMatchObject({ code: "PROTOCOL_VALIDATION_FAILED" });
    expect(f.kernel.execute(changeCommand)).toEqual(original); expect(f.snapshot()).toEqual(before);
  });

  it("keeps same-person roles distinct and requires the exact Change scope and declared role", () => {
    const f = fixture(), change = f.create(f.actor.id), assignments = f.store.listAssignments(f.actor.id);
    expect(assignments.map(item => item.role_key)).toEqual(["project_owner", "change_owner", "requirement_owner"]);
    expect(new Set(assignments.map(item => item.id)).size).toBe(3);
    const pause = { ...f.context(), command_type: "PauseChange", target: { object_type: "change", id: change.id }, expected_revision: 1, payload: { reason: "等待" } };
    expect(f.kernel.execute(pause)).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    expect(f.kernel.execute({ ...pause, command_id: v2.createInternalId(), acting_role: "requirement_owner" })).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    expect(f.kernel.execute({ ...pause, command_id: v2.createInternalId(), acting_role: "change_owner" })).toMatchObject({ revision: 2 });
    expect(f.kernel.execute(f.projectCommand("AssignResponsibility", { actor_id: f.actor.id, role_key: "change_owner",
      scope: { kind: "project", id: f.project.id } }))).toMatchObject({ code: "SCOPE_INVALID" });
    expect(f.kernel.execute(f.projectCommand("AssignResponsibility", { actor_id: f.actor.id, role_key: "flow_owner",
      scope: { kind: "project", id: v2.createInternalId() } }))).toMatchObject({ code: "SCOPE_INVALID" });
  });

  it("registers typed provenance without granting authority, rejects Agent responsibility and validates runtime binding", () => {
    const f = fixture(), agent = f.register({ actor_type: "agent", identity_source: "runtime_binding", display_name: "Agent",
      provider_identity_ref: { provider: "fixture", resource_type: "actor", locator: "agent-1" } });
    if (agent.actor_type !== "agent") throw new Error("agent expected");
    expect(f.store.listAssignments(agent.id)).toHaveLength(0);
    expect(f.kernel.execute(f.projectCommand("AssignResponsibility", { actor_id: agent.id, role_key: "project_owner",
      scope: { kind: "project", id: f.project.id } }))).toMatchObject({ code: "HUMAN_RESPONSIBILITY_REQUIRED" });
    const caller: CallerContext = { kind: "agent", project_id: f.project.id, actor_id: agent.id, provider_identity_ref: agent.provider_identity_ref };
    const kernel = new CimiLoopKernel({ store: f.store, caller, now: () => time });
    const command = { ...f.context(), actor_id: agent.id, command_type: "CreateChange", payload: { title: "agent" } };
    expect(kernel.execute(command)).toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" });
    expect(kernel.execute({ ...command, source: { origin: "agent", producer: "runtime" } })).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    expect(new CimiLoopKernel({ store: f.store, caller: { ...caller, provider_identity_ref: { ...caller.provider_identity_ref, locator: "other" } } })
      .execute({ ...command, source: { origin: "agent", producer: "runtime" } })).toMatchObject({ code: "CALLER_IDENTITY_MISMATCH" });
    const before = f.snapshot();
    expect(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "human", identity_source: "runtime_binding", display_name: "spoof" }))).toMatchObject({ code: "PROTOCOL_VALIDATION_FAILED" });
    expect(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "agent", identity_source: "runtime_binding", display_name: "duplicate",
      provider_identity_ref: agent.provider_identity_ref }))).toMatchObject({ code: "ASSIGNMENT_CONFLICT" });
    expect(f.snapshot()).toEqual(before);
  });

  it("uses half-open UTC intervals, refuses duplicate grants and applies scheduled/expired Project Owner authority", () => {
    const f = fixture(), next = f.register(), effective = "2026-10-03T00:01:00Z", expires = "2026-10-03T00:02:00.000Z";
    const result = success(f.kernel.execute(f.projectCommand("AssignResponsibility", { actor_id: next.id, role_key: "project_owner",
      scope: { kind: "project", id: f.project.id }, effective_at: effective, expires_at: expires })));
    if (result.command_type !== "AssignResponsibility") throw new Error("assignment expected");
    const assignment = result.data.assignment;
    expect(assignmentIsEffective(assignment, time)).toBe(false);
    expect(assignmentIsEffective(assignment, "2026-10-03T00:01:00.000Z")).toBe(true);
    expect(assignmentIsEffective(assignment, expires)).toBe(false);
    const executeAt = (clock: string) => new CimiLoopKernel({ store: f.store,
      caller: { kind: "local_operator", project_id: f.project.id, actor_id: next.id }, now: () => clock }).execute({
      ...f.context(), actor_id: next.id, command_type: "CreateChange", payload: { title: clock } });
    expect(executeAt(time)).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    expect(executeAt("2026-10-03T00:01:00.000Z")).toHaveProperty("ok", true);
    expect(executeAt(expires)).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    expect(f.kernel.execute(f.projectCommand("AssignResponsibility", { actor_id: next.id, role_key: "project_owner",
      scope: { kind: "project", id: f.project.id }, effective_at: effective, expires_at: expires }))).toMatchObject({ code: "ASSIGNMENT_CONFLICT" });
    expect(f.kernel.execute(f.projectCommand("AssignResponsibility", { actor_id: next.id, role_key: "flow_owner",
      scope: { kind: "project", id: f.project.id }, effective_at: "2026-10-02T00:00:00Z" }))).toMatchObject({ code: "ASSIGNMENT_INTERVAL_INVALID" });
    expect(f.kernel.execute(f.projectCommand("AssignResponsibility", { actor_id: next.id, role_key: "flow_owner",
      scope: { kind: "project", id: f.project.id }, expires_at: "2026-99-03T00:00:00Z" }))).toMatchObject({ code: "ASSIGNMENT_INTERVAL_INVALID" });
    expect(f.kernel.execute(f.projectCommand("AssignResponsibility", { actor_id: next.id, role_key: "flow_owner",
      scope: { kind: "project", id: f.project.id }, effective_at: "2027-02-30T00:00:00Z" }))).toMatchObject({ code: "ASSIGNMENT_INTERVAL_INVALID" });
    expect(resolveAssignment([assignment], { projectId: f.project.id, actorId: next.id, role: "project_owner",
      scope: { kind: "change", id: v2.createInternalId() }, now: effective })).toBeUndefined();
  });

  it("atomically transfers one responsibility, records the actual grantor and leaves the other responsibility intact", () => {
    const f = fixture(), next = f.register(), change = f.create(f.actor.id), command = f.transfer(change, next.id);
    const before = f.snapshot(), result = success(f.kernel.execute(command));
    if (result.command_type !== "TransferChangeResponsibility") throw new Error("transfer expected");
    expect(result.data.change).toMatchObject({ owner_actor_id: next.id, requirement_owner_actor_id: f.actor.id, revision: 2 });
    expect(result.data.ended_assignments).toHaveLength(1);
    expect(result.data.assignment).toMatchObject({ actor_id: next.id, granted_by: f.actor.id, effective_at: time, role_key: "change_owner" });
    expect(result.events[0]).toMatchObject({ actor_id: f.actor.id, acting_role: "project_owner", payload: { previous_actor_id: f.actor.id,
      new_actor_id: next.id, reason: "明确责任移交", grant_basis_refs: command.payload.grant_basis_refs } });
    expect(f.store.listAssignments().filter(item => item.scope.id === change.id && item.role_key === "change_owner" && assignmentIsEffective(item, time))).toHaveLength(1);
    expect(f.store.listAssignments().find(item => item.role_key === "requirement_owner")).not.toHaveProperty("ended_at");
    expect(f.kernel.execute(command)).toEqual(result); expect(f.store.listEvents()).toHaveLength(before.value.events.length + 1);
    const pause = { ...f.context(), acting_role: "change_owner", command_type: "PauseChange", target: { object_type: "change", id: change.id }, expected_revision: 2, payload: { reason: "handoff" } };
    expect(f.kernel.execute(pause)).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    const nextKernel = new CimiLoopKernel({ store: f.store, caller: { kind: "local_operator", project_id: f.project.id, actor_id: next.id }, now: () => time });
    expect(nextKernel.execute({ ...pause, actor_id: next.id })).toHaveProperty("ok", true);
    expect(nextKernel.execute({ ...f.projectCommand("RegisterActor", { actor_type: "human", identity_source: "local_operator", display_name: "not allowed" }), actor_id: next.id })).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
  });

  it("refuses missing or unrelated handoff basis, responsibility vacancies, duplicate grants and closed Change transfers", () => {
    const f = fixture(), next = f.register(), change = f.create(), command = f.transfer(change, next.id), before = f.snapshot();
    expect(f.kernel.execute({ ...command, payload: { ...command.payload, grant_basis_refs: [{ object_type: "assignment", id: v2.createInternalId() }] } })).toMatchObject({ code: "GRANT_BASIS_INVALID" });
    const owner = f.store.listAssignments().find(item => item.role_key === "change_owner")!;
    expect(f.kernel.execute({ ...command, payload: { ...command.payload, grant_basis_refs: [{ object_type: "assignment", id: owner.id }] } })).toMatchObject({ code: "GRANT_BASIS_INVALID" });
    expect(f.kernel.execute(f.projectCommand("EndAssignment", { assignment_id: owner.id, expected_assignment_revision: 1, reason: "不能空缺" }))).toMatchObject({ code: "RESPONSIBILITY_HANDOFF_REQUIRED" });
    expect(f.kernel.execute(f.projectCommand("AssignResponsibility", { actor_id: next.id, role_key: "change_owner", scope: { kind: "change", id: change.id } }))).toMatchObject({ code: "RESPONSIBILITY_HANDOFF_REQUIRED" });
    expect(f.kernel.execute(f.projectCommand("AssignResponsibility", { actor_id: f.actor.id, role_key: "change_owner", scope: { kind: "change", id: change.id } }))).toMatchObject({ code: "ASSIGNMENT_CONFLICT" });
    expect(f.snapshot()).toEqual(before);
    const requirement = success(f.kernel.execute(f.transfer(change, f.actor.id, "requirement_owner")));
    expect(requirement).toMatchObject({ data: { change: { owner_actor_id: f.actor.id, requirement_owner_actor_id: f.actor.id }, assignment: { role_key: "requirement_owner" } } });
    const current = f.store.getChange(change.id)!;
    f.store.transaction(tx => tx.updateChange({ ...current, lifecycle_state: "Completed", revision: current.revision + 1 }, current.revision));
    expect(f.kernel.execute({ ...command, expected_revision: current.revision + 1 })).toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
  });

  it("protects a continuing Project Owner, records endings and revokes future operations without reapplying old receipts", () => {
    const f = fixture(), next = f.register(), end = () => f.projectCommand("EndAssignment", {
      assignment_id: f.assignment.id, expected_assignment_revision: 1, reason: "项目治理移交" });
    expect(f.kernel.execute(end())).toMatchObject({ code: "RESPONSIBILITY_HANDOFF_REQUIRED" });
    const grant = success(f.kernel.execute(f.projectCommand("AssignResponsibility", { actor_id: next.id, role_key: "project_owner", scope: { kind: "project", id: f.project.id } })));
    const endCommand = end(), ended = success(f.kernel.execute(endCommand));
    expect(ended).toMatchObject({ data: { assignment: { ended_at: time, revision: 2 } }, events: [{ event_type: "AssignmentEnded", payload: { reason: "项目治理移交" } }] });
    expect(f.kernel.execute({ ...f.context(), command_type: "CreateChange", payload: { title: "revoked" } })).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    const before = f.snapshot(); expect(f.kernel.execute(endCommand)).toEqual(ended); expect(f.snapshot()).toEqual(before);
    const nextKernel = new CimiLoopKernel({ store: f.store, caller: { kind: "local_operator", project_id: f.project.id, actor_id: next.id }, now: () => time });
    expect(nextKernel.execute({ ...f.projectCommand("EndAssignment", { assignment_id: f.assignment.id, expected_assignment_revision: 2, reason: "already ended" }), actor_id: next.id })).toMatchObject({ code: "ASSIGNMENT_ALREADY_ENDED" });
    expect(grant).toHaveProperty("ok", true);
  });

  it("rolls back responsibility pointers, assignment endings, event sequence, effects and receipt when append fails", () => {
    const f = fixture(), next = f.register(), change = f.create(), command = f.transfer(change, next.id), before = f.snapshot();
    const faultStore = new Proxy(f.store, { get(target, key) {
      if (key === "transaction") return <T>(work: (tx: StoreTransaction) => T) => target.transaction(tx => work(new Proxy(tx, {
        get(inner, method) { if (method === "enqueueOutbox") return () => { throw new Error("effect fault"); };
          const value = Reflect.get(inner, method); return typeof value === "function" ? value.bind(inner) : value; }
      })));
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } }) as ProjectStore;
    const kernel = new CimiLoopKernel({ store: faultStore, caller: f.caller, now: () => time });
    expect(kernel.execute(command)).toMatchObject({ code: "STORE_FAILURE" }); expect(f.snapshot()).toEqual(before);
    expect(f.store.transaction(tx => tx.getCommandReceipt(command.command_id))).toBeUndefined();
    expect(f.kernel.execute(command)).toHaveProperty("ok", true);
  });

  it("enforces Project/Assignment CAS and refuses rewriting an original grant", () => {
    const f = fixture(), assignment = f.assignment, project = f.store.getProject()!;
    expect(() => f.store.transaction(tx => tx.updateProject({ ...project, revision: 99 }, 1))).toThrow(StoreConflictError);
    expect(() => f.store.transaction(tx => tx.endAssignment({ ...assignment, actor_id: v2.createInternalId(), ended_at: time,
      updated_at: time, revision: 2 }, 1))).toThrow(StoreConflictError);
    f.store.transaction(tx => tx.updateProject({ ...project, revision: 2 }, 1));
    expect(() => f.store.transaction(tx => tx.updateProject({ ...project, revision: 2 }, 1))).toThrow(StoreConflictError);
    f.store.transaction(tx => tx.endAssignment({ ...assignment, ended_at: time, updated_at: time, revision: 2 }, 1));
    expect(() => f.store.transaction(tx => tx.endAssignment({ ...assignment, ended_at: time, updated_at: time, revision: 2 }, 1))).toThrow(StoreConflictError);
    expect(f.store.getProject()).toHaveProperty("revision", 2);
  });

  it("serializes two real client processes assigning the same role without overlapping grants", async () => {
    const f = fixture(), payload = { actor_id: f.actor.id, role_key: "flow_owner", scope: { kind: "project", id: f.project.id } };
    const results = await race(f.path, f.caller, [f.projectCommand("AssignResponsibility", payload), f.projectCommand("AssignResponsibility", payload)]);
    expect(results.filter(item => item && typeof item === "object" && "ok" in item)).toHaveLength(1);
    expect(results.filter(item => item && typeof item === "object" && "code" in item)).toEqual([expect.objectContaining({ code: "REVISION_CONFLICT" })]);
    expect(f.store.listAssignments().filter(item => item.role_key === "flow_owner")).toHaveLength(1);
    expect(f.store.getProject()).toHaveProperty("revision", 2); expect(f.store.listEvents()).toHaveLength(2);
  }, 20_000);

  it("serializes racing transfers with exactly one new owner and one ended grant", async () => {
    const f = fixture(), next = f.register(), third = f.register({ actor_type: "human", identity_source: "local_operator", display_name: "Third" }), change = f.create();
    const results = await race(f.path, f.caller, [f.transfer(change, next.id), f.transfer(change, third.id)]);
    expect(results.filter(item => item && typeof item === "object" && "ok" in item)).toHaveLength(1);
    expect(results.filter(item => item && typeof item === "object" && "code" in item)).toEqual([expect.objectContaining({ code: "REVISION_CONFLICT" })]);
    const owners = f.store.listAssignments().filter(item => item.role_key === "change_owner" && item.scope.id === change.id);
    expect(owners).toHaveLength(2); expect(owners.filter(item => assignmentIsEffective(item, time))).toHaveLength(1);
    expect(owners.filter(item => item.ended_at)).toHaveLength(1);
    expect(f.store.getChange(change.id)).toHaveProperty("revision", 2);
  }, 20_000);

  it("repairs a migrated Change with a new explicit grant while preserving every historical receipt and event", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-governance-m0-")); directories.push(directory);
    const legacy = createM0Database(directory); resources.push(legacy.store);
    await new MigrationRunner(legacy.databasePath).apply({ actorId: legacy.actor.id, now: time });
    const store = new SqliteProjectStore(legacy.databasePath); resources.push(store);
    const kernel = new CimiLoopKernel({ store, caller: { kind: "local_operator", project_id: legacy.project.id, actor_id: legacy.actor.id }, now: () => time });
    const current = store.getChange("CHG-0002")!, before = store.listEvents();
    const resume = { ...base(), project_id: legacy.project.id, actor_id: legacy.actor.id, acting_role: "change_owner", command_type: "ResumeChange",
      target: { object_type: "change", id: current.id }, expected_revision: current.revision, payload: {} };
    expect(kernel.execute(resume)).toMatchObject({ code: "ROLE_NOT_ASSIGNED" });
    const grant = success(kernel.execute({ ...base(), project_id: legacy.project.id, actor_id: legacy.actor.id, acting_role: "project_owner",
      command_type: "AssignResponsibility", target: { object_type: "project", id: legacy.project.id }, expected_revision: 1,
      payload: { actor_id: legacy.actor.id, role_key: "change_owner", scope: { kind: "change", id: current.id } } }));
    expect(grant).toMatchObject({ data: { assignment: { effective_at: time, granted_by: legacy.actor.id } } });
    expect(kernel.execute(resume)).toHaveProperty("ok", true);
    expect(store.listEvents().slice(0, before.length)).toEqual(before);
    for (const [index, command] of legacy.commands.entries()) expect(kernel.execute(command)).toEqual(legacy.results[index]);
  });
});
