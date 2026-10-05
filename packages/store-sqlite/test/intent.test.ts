import { fork } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { CimiLoopKernel } from "../../kernel/src/index.js";
import * as v2 from "../../protocol/src/v2/index.js";
import type { ProjectStore, StoreTransaction } from "../../store/dist/index.js";
import { createIntentProject, contractBody, planBody } from "../../../tests/fixtures/intent-project.js";
import { flowSuccess, flowTime } from "../../../tests/fixtures/flow-project.js";

const dirs: string[] = [], stores: { close(): void }[] = [];
afterEach(() => { while (stores.length) stores.pop()!.close(); while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const fixture = () => { const dir = mkdtempSync(join(tmpdir(), "cimiloop-intent-")); dirs.push(dir); const f = createIntentProject(dir); stores.push(f.store); return f; };
const snapshot = (f: ReturnType<typeof fixture>, id: string) => ({ intent: f.kernel.getIntent(id), events: f.store.listEvents(), effects: f.store.listOutbox() });
const command = <P>(f: ReturnType<typeof fixture>, type: string, id: string, payload: P, role: string) => f.changeCommand(type, f.store.getChange(id)!, payload, role);

describe("V1-04 exact confirmation and admission", () => {
  it("confirms real immutable Contract / Plan then starts with atomic lifecycle facts and idempotent receipts", () => {
    const f = fixture(), change = f.create(), contract = f.prepareContract(change.id), plan = f.preparePlan(change.id);
    expect(f.store.getChange(change.id)).toMatchObject({ lifecycle_state: "IntentReady", contract_ref: { id: contract.version.id }, plan_ref: { id: plan.version.id } });
    const start = command(f, "StartChange", change.id, { plan_ref: f.store.getChange(change.id)!.plan_ref, opening_reason: "实际确认后开工" }, "flow_owner"), before = f.store.listEvents().length;
    const result = f.kernel.execute(start); expect(result).toMatchObject({ command_type: "StartChange", data: { change: { lifecycle_state: "Executing" } }, events: [{ event_type: "ChangeStarted" }] });
    expect(f.kernel.execute(start)).toEqual(result); expect(f.store.listEvents()).toHaveLength(before + 1);
    const view = f.kernel.getIntent(change.id); if ("code" in view) throw new Error(view.message);
    expect(view.lifecycle_transitions.map(item => [item.from_state, item.to_state])).toEqual([["Draft", "IntentReady"], ["IntentReady", "Executing"]]);
    expect(view.decision_requests.map(item => item.status)).toEqual(["applied", "applied"]);
    const db = new DatabaseSync(f.path); try { expect(() => db.exec("DELETE FROM intent_records")).toThrow("immutable record"); } finally { db.close(); }
  }, 15_000); // Includes first compilation of every confirmation/query branch under full-suite CPU contention.

  it("revises candidates with explicit CAS and prevents old approval from confirming new content", () => {
    const f = fixture(), change = f.create(), proposal = f.submitContract(change.id), risk = f.assess(change.id, proposal), request = f.request(change.id, proposal, "contract", risk), decision = f.decide(change.id, request);
    const body = { ...proposal.body, goal: "新范围" };
    const revise = command(f, "SubmitContractProposal", change.id, { proposal_id: proposal.proposal_id, expected_proposal_revision: 1, base_version_ref: null, body }, "change_owner");
    expect(f.kernel.execute({ ...revise, payload: { ...revise.payload, expected_proposal_revision: 0 } })).toMatchObject({ code: "PROPOSAL_REVISION_CONFLICT" });
    expect(f.kernel.execute(revise)).toMatchObject({ data: { proposal: { proposal_revision: 2, predecessor_ref: { id: proposal.id, domain_version: 1 } } } });
    const before = snapshot(f, change.id);
    expect(f.kernel.execute(command(f, "ConfirmContract", change.id, f.confirmPayload(request, decision), "requirement_owner"))).toMatchObject({ code: "DECISION_STALE" });
    expect(snapshot(f, change.id)).toEqual(before); expect(f.store.getIntentRecord("contract_proposal", proposal.id)).toEqual(proposal);
  });

  it("requires a real risk assessment, explicit requirement responsibility, unique criteria and resolved questions", () => {
    const f = fixture(), change = f.create(), body = { ...contractBody(), unresolved_questions: ["关键范围未定"] }, proposal = f.submitContract(change.id, body);
    const ref = { object_type: "contract_proposal", id: proposal.id, domain_version: 1 };
    expect(f.kernel.execute(command(f, "RequestDecision", change.id, { action: "confirm_contract", proposal_ref: ref, risk_ref: { object_type: "risk_assessment", id: v2.createInternalId() } }, "change_owner"))).toMatchObject({ code: "RISK_ASSESSMENT_REQUIRED" });
    const risk = f.assess(change.id, proposal);
    expect(f.kernel.execute(command(f, "RequestDecision", change.id, { action: "confirm_contract", proposal_ref: ref, risk_ref: { object_type: "risk_assessment", id: risk.id } }, "change_owner"))).toMatchObject({ code: "PROPOSAL_INVALID" });
    const missing = flowSuccess(f.kernel.execute({ ...f.context(), command_type: "CreateChange", payload: { title: "未指派验收责任" } }));
    if (missing.command_type !== "CreateChange") throw new Error("change expected");
    const p = f.submitContract(missing.data.change.id), r = f.assess(missing.data.change.id, p);
    expect(f.kernel.execute(command(f, "RequestDecision", missing.data.change.id, { action: "confirm_contract", proposal_ref: { object_type: "contract_proposal", id: p.id, domain_version: 1 }, risk_ref: { object_type: "risk_assessment", id: r.id } }, "change_owner"))).toMatchObject({ code: "HUMAN_RESPONSIBILITY_REQUIRED" });
  });

  it("rejects expired, mismatched and duplicate decisions; a decision alone does not advance state", () => {
    const f = fixture(), change = f.create(), p = f.submitContract(change.id), risk = f.assess(change.id, p), request = f.request(change.id, p, "contract", risk);
    const record = command(f, "RecordDecision", change.id, { request_id: request.id, input_digest: request.input_digest, choice: "approve", reason: "人工检查", conditions: [] }, "requirement_owner");
    expect(f.kernel.execute({ ...record, payload: { ...record.payload, input_digest: { algorithm: "sha256", value: "a".repeat(64) } } })).toMatchObject({ code: "DECISION_STALE" });
    expect(new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => "2026-10-03T00:15:00.000Z" }).execute(record)).toMatchObject({ code: "DECISION_STALE" });
    expect(f.kernel.execute(record)).toHaveProperty("ok", true); expect(f.store.getChange(change.id)).toHaveProperty("lifecycle_state", "Draft");
    expect(f.kernel.execute({ ...record, command_id: v2.createInternalId() })).toMatchObject({ code: "DECISION_ALREADY_RECORDED" });
  });

  it.each(["reject", "request_changes"] as const)("preserves %s without cancelling or confirming a Change", choice => {
    const f = fixture(), change = f.create(), p = f.submitContract(change.id), risk = f.assess(change.id, p), request = f.request(change.id, p, "contract", risk), decision = f.decide(change.id, request, choice);
    expect(f.kernel.execute(command(f, "ConfirmContract", change.id, f.confirmPayload(request, decision), "requirement_owner"))).toMatchObject({ code: "DECISION_NOT_APPROVED" });
    expect(f.store.getChange(change.id)).toMatchObject({ lifecycle_state: "Draft", operating_status: "Active" });
  });

  it("blocks conditional approval and checks role revocation again at confirmation", () => {
    const f = fixture(), change = f.create(), p = f.submitContract(change.id), risk = f.assess(change.id, p), request = f.request(change.id, p, "contract", risk), decision = f.decide(change.id, request, "approve", ["补原始证据"]);
    expect(f.kernel.execute(command(f, "ConfirmContract", change.id, f.confirmPayload(request, decision), "requirement_owner"))).toMatchObject({ code: "EVIDENCE_MISSING" });
    const freshRequest = f.request(change.id, p, "contract", risk), approved = f.decide(change.id, freshRequest);
    const assignment = f.store.listAssignments(f.actor.id).find(item => item.role_key === "technical_owner")!;
    flowSuccess(f.kernel.execute(f.projectCommand("EndAssignment", { assignment_id: assignment.id, expected_assignment_revision: 1, reason: "专业责任撤销" })));
    expect(f.kernel.execute(command(f, "ConfirmContract", change.id, f.confirmPayload(freshRequest, approved), "requirement_owner"))).toMatchObject({ code: "DECISION_STALE" });
  });

  it("clears old Plan when a new Contract is confirmed and keeps all prior formal versions", () => {
    const f = fixture(), change = f.create(), first = f.prepareContract(change.id), plan = f.preparePlan(change.id), next = f.prepareContract(change.id, { ...contractBody(), goal: "变更承诺" });
    expect(next.version).toMatchObject({ version: 2, predecessor_ref: { id: first.version.id, domain_version: 1 } });
    expect(f.store.getChange(change.id)).not.toHaveProperty("plan_ref"); expect(f.store.getIntentRecord("plan_version", plan.version.id)).toEqual(plan.version);
    expect(f.kernel.execute(command(f, "StartChange", change.id, { plan_ref: { object_type: "plan_version", id: plan.version.id, domain_version: 1 }, opening_reason: "旧计划" }, "flow_owner"))).toMatchObject({ code: "EVIDENCE_MISSING" });
  });

  it.each(["cycle", "missing_coverage", "missing_independent", "self_check_coverage", "wrong_scope", "missing_knowledge"])("rejects invalid plan: %s", scenario => {
    const f = fixture(), change = f.create(), body = contractBody(); if (scenario === "missing_knowledge") body.knowledge_impact = [{ key: "K1", description: "文档义务", required_before: "before_change_complete" }];
    f.prepareContract(change.id, body); const plan = planBody(change.id, f.store.getChange(change.id)!.contract_ref!);
    if (scenario === "cycle") plan.task_definitions[0]!.dependencies = [plan.task_definitions[1]!.task_id];
    if (scenario === "missing_coverage") plan.task_definitions[1]!.verification.acceptance_keys = [];
    if (scenario === "missing_independent") plan.task_definitions[1]!.verification.mode = "self_check";
    if (scenario === "self_check_coverage") {
      plan.task_definitions.push({ ...plan.task_definitions[1]!, task_id: v2.createInternalId(), verification: { ...plan.task_definitions[1]!.verification, mode: "self_check" } });
      plan.task_definitions[1]!.verification.acceptance_keys = [];
    }
    if (scenario === "wrong_scope") plan.task_definitions[0]!.scope.id = v2.createInternalId();
    const proposal = f.submitPlan(change.id, plan);
    expect(f.kernel.execute(command(f, "RequestDecision", change.id, { action: "confirm_plan", proposal_ref: { object_type: "plan_proposal", id: proposal.id, domain_version: 1 } }, "technical_owner"))).toMatchObject({ code: "PLAN_INVALID" });
  });

  it("checks current real dependency conditions at StartChange and rejects cross-Change cycles", () => {
    const f = fixture(), a = f.create("依赖方"), b = f.create("被依赖方"); f.prepareContract(a.id); f.prepareContract(b.id);
    const pa = planBody(a.id, f.store.getChange(a.id)!.contract_ref!); pa.dependencies = [{ change_id: b.id, contract_ref: f.store.getChange(b.id)!.contract_ref!, required_state: "completed" }]; f.preparePlan(a.id, pa);
    const pb = planBody(b.id, f.store.getChange(b.id)!.contract_ref!); pb.dependencies = [{ change_id: a.id, contract_ref: f.store.getChange(a.id)!.contract_ref!, required_state: "completed" }];
    const p = f.submitPlan(b.id, pb);
    expect(f.kernel.execute(command(f, "RequestDecision", b.id, { action: "confirm_plan", proposal_ref: { object_type: "plan_proposal", id: p.id, domain_version: 1 } }, "technical_owner"))).toMatchObject({ code: "PLAN_INVALID" });
    expect(f.kernel.execute(command(f, "StartChange", a.id, { plan_ref: f.store.getChange(a.id)!.plan_ref, opening_reason: "依赖尚未交付" }, "flow_owner"))).toMatchObject({ code: "DEPENDENCY_UNSATISFIED" });
  });

  it("requires a second actual Human for high risk and refuses self-declared lowering", () => {
    const f = fixture(), change = f.create(), body = contractBody(); body.risk.impact_categories = ["permissions"];
    const p = f.submitContract(change.id, body);
    expect(f.kernel.execute(command(f, "RecordRiskAssessment", change.id, { proposal_ref: { object_type: "contract_proposal", id: p.id, domain_version: 1 }, level: "ordinary", rationale: "不能忽略权限影响" }, "technical_owner"))).toMatchObject({ code: "RISK_DOWNGRADE_FORBIDDEN" });
    const risk = f.assess(change.id, p, "high"), request = f.request(change.id, p, "contract", risk);
    expect(f.kernel.execute(command(f, "RecordDecision", change.id, { request_id: request.id, input_digest: request.input_digest, choice: "approve", reason: "同人多角色", conditions: [] }, "requirement_owner"))).toMatchObject({ code: "INDEPENDENCE_REQUIRED" });
  });

  it("admits high risk only with a different bound Human approving the Contract and reviewing the Plan", () => {
    const f = fixture(), registered = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "human", identity_source: "local_operator", display_name: "Independent Human" })));
    if (registered.command_type !== "RegisterActor") throw new Error("actor expected");
    const reviewer = registered.data.actor; f.grant("technical_owner", reviewer.id);
    const created = flowSuccess(f.kernel.execute({ ...f.context(), command_type: "CreateChange", payload: { title: "高风险", requirement_owner_actor_id: reviewer.id } }));
    if (created.command_type !== "CreateChange") throw new Error("change expected");
    const change = created.data.change;
    // A trusted test entry binds the second real Human. The production Solo CLI cannot switch identities.
    const reviewKernel = new CimiLoopKernel({ store: f.store, caller: { kind: "local_operator", project_id: f.project.id, actor_id: reviewer.id }, now: () => flowTime });
    const review = (type: string, payload: unknown, role: string) => flowSuccess(reviewKernel.execute({ ...command(f, type, change.id, payload, role), actor_id: reviewer.id }));
    const body = contractBody(); body.risk.impact_categories = ["important_data"];
    const proposal = f.submitContract(change.id, body), risk = f.assess(change.id, proposal, "high"), request = f.request(change.id, proposal, "contract", risk);
    const decision = review("RecordDecision", { request_id: request.id, input_digest: request.input_digest, choice: "approve", reason: "独立需求确认", conditions: [] }, "requirement_owner");
    if (decision.command_type !== "RecordDecision") throw new Error("decision expected");
    review("ConfirmContract", f.confirmPayload(request, decision.data.decision), "requirement_owner");
    const plan = f.submitPlan(change.id), planRequest = f.request(change.id, plan, "plan");
    expect(f.kernel.execute(command(f, "RecordDecision", change.id, { request_id: planRequest.id, input_digest: planRequest.input_digest, choice: "approve", reason: "计划作者自审", conditions: [] }, "technical_owner"))).toMatchObject({ code: "INDEPENDENCE_REQUIRED" });
    const planDecision = review("RecordDecision", { request_id: planRequest.id, input_digest: planRequest.input_digest, choice: "approve", reason: "独立技术复核", conditions: [] }, "technical_owner");
    if (planDecision.command_type !== "RecordDecision") throw new Error("decision expected");
    review("ConfirmPlan", f.confirmPayload(planRequest, planDecision.data.decision), "technical_owner");
    expect(f.kernel.execute(command(f, "StartChange", change.id, { plan_ref: f.store.getChange(change.id)!.plan_ref, opening_reason: "独立确认完成" }, "flow_owner"))).toHaveProperty("ok", true);
  });

  it("preserves confirmed baselines after request expiry and rejects another Change's real Contract", () => {
    const f = fixture(), a = f.create("a"), b = f.create("b"); f.prepareContract(a.id); f.preparePlan(a.id); f.prepareContract(b.id);
    const c = f.create("否定测试夹具"); f.seedState(c, { lifecycle_state: "IntentReady", contract_ref: f.store.getChange(b.id)!.contract_ref! });
    expect(f.kernel.execute(command(f, "SubmitPlanProposal", c.id, { base_version_ref: null, body: planBody(c.id, f.store.getChange(c.id)!.contract_ref!) }, "technical_owner"))).toMatchObject({ code: "CONTRACT_NOT_FOUND" });
    const assignment = f.store.listAssignments(f.actor.id).find(item => item.role_key === "technical_owner")!;
    flowSuccess(f.kernel.execute(f.projectCommand("EndAssignment", { assignment_id: assignment.id, expected_assignment_revision: 1, reason: "确认后专业职责交接" })));
    const later = new CimiLoopKernel({ store: f.store, caller: f.caller, now: () => "2026-10-04T00:00:00.000Z" });
    expect(later.execute(command(f, "StartChange", a.id, { plan_ref: f.store.getChange(a.id)!.plan_ref, opening_reason: "请求期限与后续角色结束不抹去已确认事实" }, "flow_owner"))).toHaveProperty("ok", true);
  });

  it("covers knowledge closure and requires a new fixed TaskDefinition version when task content changes", () => {
    const f = fixture(), change = f.create(), body = contractBody(); body.knowledge_impact = [{ key: "K1", description: "更新查询说明", required_before: "before_change_complete" }];
    f.prepareContract(change.id, body); const plan = planBody(change.id, f.store.getChange(change.id)!.contract_ref!);
    plan.task_definitions.push({ ...plan.task_definitions[0]!, task_id: v2.createInternalId(), purpose: "knowledge", goal: "同步说明", outputs: ["docs/query.md"], allowed_changes: ["docs/query.md"], knowledge_keys: ["K1"], closure_requirement: "before_change_complete" });
    const first = f.preparePlan(change.id, plan); plan.task_definitions[0]!.goal = "修改实施步骤";
    const proposal = f.submitPlan(change.id, plan);
    expect(f.kernel.execute(command(f, "RequestDecision", change.id, { action: "confirm_plan", proposal_ref: { object_type: "plan_proposal", id: proposal.id, domain_version: 1 } }, "technical_owner"))).toMatchObject({ code: "PLAN_INVALID" });
    plan.task_definitions[0]!.version = 2;
    const second = f.preparePlan(change.id, plan);
    expect(second.version).toMatchObject({ version: 2, predecessor_ref: { id: first.version.id } });
    expect(f.store.getIntentRecord("plan_version", first.version.id)!.body.task_definitions[0]!.goal).not.toBe(plan.task_definitions[0]!.goal);
  });

  it("rolls back formal version, pointer, lifecycle, event, effect and receipt on an injected late failure", () => {
    const f = fixture(), change = f.create(), p = f.submitContract(change.id), risk = f.assess(change.id, p), request = f.request(change.id, p, "contract", risk), decision = f.decide(change.id, request);
    const confirm = command(f, "ConfirmContract", change.id, f.confirmPayload(request, decision), "requirement_owner"), before = snapshot(f, change.id);
    const store = new Proxy(f.store, { get(target, key) { if (key === "transaction") return <T>(work: (tx: StoreTransaction) => T) => target.transaction(tx => work(new Proxy(tx, { get(inner, method) {
      if (method === "enqueueOutbox") return () => { throw new Error("fault"); }; const value = Reflect.get(inner, method); return typeof value === "function" ? value.bind(inner) : value;
    } }))); const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value; } }) as ProjectStore;
    expect(new CimiLoopKernel({ store, caller: f.caller, now: () => flowTime }).execute(confirm)).toMatchObject({ code: "STORE_FAILURE" });
    expect(snapshot(f, change.id)).toEqual(before); expect(f.kernel.execute(confirm)).toHaveProperty("ok", true);
  });

  it("allows only one real confirmed StartChange when two processes race for the last capacity slot", async () => {
    const f = fixture(); flowSuccess(f.kernel.execute(f.settingsCommand({ wip_limit: 1 })));
    const changes = [f.create("a"), f.create("b")]; for (const change of changes) { f.prepareContract(change.id); f.preparePlan(change.id); }
    const cmds = changes.map(change => command(f, "StartChange", change.id, { plan_ref: f.store.getChange(change.id)!.plan_ref, opening_reason: "并发真实开工" }, "flow_owner"));
    const clients = cmds.map(() => fork(resolve("tests/fixtures/governance-client.mjs"), [f.path], { silent: true, execArgv: ["--no-warnings"] }));
    try {
      await Promise.all(clients.map(client => new Promise<void>((ready, reject) => { client.once("error", reject); client.once("message", () => ready()); })));
      const outcomes = clients.map(client => new Promise<unknown>((done, reject) => { client.once("error", reject); client.once("message", message => { const value = message as { result?: unknown; error?: string }; value.error ? reject(new Error(value.error)) : done(value.result); }); }));
      const exits = clients.map(client => new Promise<void>((done, reject) => client.once("exit", code => code === 0 ? done() : reject(new Error(`exit ${code}`)))));
      clients.forEach((client, index) => client.send({ caller: f.caller, command: cmds[index], now: flowTime }));
      const results = await Promise.all(outcomes); await Promise.all(exits);
      expect(results.filter(value => value && typeof value === "object" && "ok" in value)).toHaveLength(1);
      expect(results).toContainEqual(expect.objectContaining({ code: "WIP_LIMIT_EXCEEDED" }));
      expect(f.store.listEvents().filter(event => event.event_type === "ChangeStarted")).toHaveLength(1);
    } finally { clients.forEach(client => { if (client.exitCode === null) client.kill(); }); }
  }, 20_000);
});
