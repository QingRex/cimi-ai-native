import { CimiLoopKernel, providerBindingIdentity, type AgentRunVerifierPort } from "../../packages/kernel/src/index.js";
import { contentDigest } from "../../packages/kernel/src/intent.js";
import * as v2 from "../../packages/protocol/src/v2/index.js";
import { createRunProject } from "./run-project.js";
import { flowSuccess, flowTime } from "./flow-project.js";
import type { ContentReference } from "../../packages/local-app/src/evidence-local.js";

// CONSTRUCTED DOMAIN FIXTURE ONLY. Controlled ALLOW facts below are inserted
// directly for testing this future host contract. They cannot be produced by the
// current qualification commands, and prove no live model/OS/billing admission.
export const createAgentRunProject = (directory: string, scope: "task_execution" | "isolated_provider_probe" = "task_execution", cost: number | undefined = 100,
  runtimeResources: v2.ExternalReference[] = [{ provider: "cimiloop_workspace", resource_type: "repository_path", locator: "src/query.ts", version: "1.0.0" }],
  runtimeActions: v2.WorkItem["allowed_actions"] = ["read_files"]) => {
  const f = createRunProject(directory);
  const metadata = () => ({ schema_version: v2.SCHEMA_VERSION, id: v2.createInternalId(), project_id: f.project.id, created_at: flowTime, producer_actor_id: f.actor.id });
  const content = <T extends ContentReference["resource_type"]>(value: unknown, kind: T) => f.runPort.content.storeContent(Buffer.from(JSON.stringify(value)), kind);
  const seed = (kind: "runtime" | "skill", runtime?: v2.ProviderBinding) => {
    const registered = flowSuccess(f.kernel.execute(f.projectCommand("RegisterProvider", { provider_kind: kind, name: `constructed-${kind}`, version: "1.0.0",
      source_ref: { provider: "fixture", resource_type: "unexecuted", locator: `constructed-${kind}`, version: "1.0.0", digest: contentDigest(kind) },
      capabilities: [{ capability_id: kind === "runtime" ? "runtime.execute" : "verification.review", version: "1.0.0" }], dependencies: [],
      required_permissions: { actions: kind === "runtime" ? runtimeActions : [], resources: kind === "runtime" ? runtimeResources : [], environment_ids: [], network_hosts: [] },
      input_schema_ref: { schema_id: "constructed-input", digest: contentDigest("input") }, output_schema_ref: { schema_id: "constructed-output", digest: contentDigest("output") } })));
    if (registered.command_type !== "RegisterProvider") throw new Error("Descriptor expected");
    const descriptor = registered.data.descriptor, descriptor_ref = { object_type: "provider_descriptor" as const, id: descriptor.id }, descriptor_digest = contentDigest(descriptor);
    const evidence: v2.ProviderEvidence = { ...metadata(), descriptor_ref, descriptor_digest,
      ...(kind === "runtime" ? { purpose: "provider_probe" as const, origin: "local_probe_observation" as const } : { purpose: "skill_probe" as const, origin: "local_skill_observation" as const }),
      observed_at: flowTime, raw_result_ref: content({ synthetic: true }, "provider_probe_snapshot") };
    const evaluation: v2.ProviderEvaluation = { ...metadata(), descriptor_ref, descriptor_digest, purpose: "provider_assessment", profile: "controlled_execution",
      rule_version: kind === "runtime" ? "provider-assessment/1.0.0" : "skill-provider-assessment/1.0.0", input_digest: contentDigest({ synthetic: true, descriptor }),
      evidence_refs: [{ object_type: "evidence", id: evidence.id }], outcome: "ALLOW", reasons: [], assessments: [{ key: "constructed-domain-only", result: "supports", evidence_refs: [] }] };
    const assignment = f.store.listAssignments(f.actor.id).find(a => a.role_key === "project_owner")!;
    const binding: v2.ProviderBinding = { ...metadata(), descriptor_ref, descriptor_digest, capability: descriptor.capabilities[0]!, resolved_dependencies: [],
      input_schema_ref: descriptor.input_schema_ref, output_schema_ref: descriptor.output_schema_ref, effective_permissions: descriptor.required_permissions,
      approval: { assignment_ref: { object_type: "assignment", id: assignment.id }, evaluation_ref: { object_type: "evaluation", id: evaluation.id }, input_digest: evaluation.input_digest, binding_scope: scope },
      probe_evidence_refs: evaluation.evidence_refs, ...(runtime ? { runtime_binding_ref: { object_type: "provider_binding" as const, id: runtime.id } } : {}) };
    f.store.transaction(tx => { tx.insertProviderEvidence(evidence); tx.insertProviderEvaluation(evaluation); tx.insertProviderBinding(binding); }); return binding;
  };
  const runtime = seed("runtime"), skill = seed("skill", runtime), identity = providerBindingIdentity(runtime);
  const registered = flowSuccess(f.kernel.execute(f.projectCommand("RegisterActor", { actor_type: "agent", identity_source: "runtime_binding", display_name: "Constructed Agent executor", provider_identity_ref: identity })));
  if (registered.command_type !== "RegisterActor" || registered.data.actor.actor_type !== "agent") throw new Error("Agent expected");
  const agent = registered.data.actor, pins: v2.AgentRunBindings = { runtime_binding: { binding_ref: { object_type: "provider_binding", id: runtime.id }, digest: contentDigest(runtime) },
    skill_bindings: [{ binding_ref: { object_type: "provider_binding", id: skill.id }, digest: contentDigest(skill) }] };
  const state = { admission_epoch: 1, admission_available: true, proof_available: true, admission_calls: 0, result_calls: 0 };
  const agentPort: AgentRunVerifierPort = {
    admitContext(project, input) {
      state.admission_calls++; if (!state.admission_available) throw new Error("Constructed host unavailable");
      return content({ synthetic: true, epoch: state.admission_epoch, project_id: project.id, task_id: input.task.id,
        definition_ref: input.task.definition_ref, work_item_id: input.work_item.id, allowed_actions: input.work_item.allowed_actions,
        allowed_resources: input.work_item.allowed_resources, budget: input.work_item.budget, source_digest: input.source.source_digest,
        workspace_digest: input.workspace.state_digest, runtime_binding: input.runtime_binding, skill_bindings: input.skill_bindings }, "agent_host_admission");
    },
    readRunResult(_project, record, context, reference) {
      state.result_calls++; if (!state.proof_available) throw new Error("Constructed proof unavailable");
      const raw = JSON.parse(f.runPort.content.readContent(reference).toString("utf8")) as v2.RawAgentRunObservation;
      const proof = JSON.parse(f.runPort.content.readContent(raw.result_proof_ref).toString("utf8"));
      if (proof.synthetic !== true || proof.run_id !== record.run_id || proof.operation_key !== record.operation_key || proof.context_id !== context.id || proof.input_digest !== record.input_digest.value) throw new Error("Constructed proof mismatch");
      return raw;
    }
  };
  const runPort = Object.assign(f.runPort, { agent: agentPort });
  const caller = { kind: "agent" as const, project_id: f.project.id, actor_id: agent.id, provider_identity_ref: identity };
  const kernel = new CimiLoopKernel({ store: f.store, caller, now: () => flowTime, runVerifier: runPort });
  const source = f.capture(), work = flowSuccess(f.kernel.execute(f.taskCommand("CreateWorkItem", f.task().id, { definition_ref: f.task().definition_ref,
    executor_ref: { object_type: "actor", id: agent.id }, allowed_actions: runtimeActions, allowed_resources: ["src/query.ts"],
    budget: { max_attempts: 3, max_elapsed_ms: 60_000, ...(cost ? { max_cost: { currency: "USD", amount_micros: cost } } : {}) },
    stop_conditions: ["任务边界改变即停止"], reason: "有界构造 Agent 运行测试" }, f.actor.id, "technical_owner")));
  if (work.command_type !== "CreateWorkItem") throw Error("WorkItem expected"); const item = work.data.work_item;
  const command = (kind: string, type: "task" | "work_item" | "run", id: string, payload: unknown) => ({ ...f.command(kind, type, id, payload, "executor", agent.id), source: { origin: "agent", producer: "constructed-host" } });
  const prepareCommand = (bindings: v2.AgentRunBindings = pins) => command("PrepareRunContext", "work_item", item.id, { source_snapshot_ref: { object_type: "source_snapshot", id: source.id }, ...bindings });
  const prepare = () => { const result = flowSuccess(kernel.execute(prepareCommand())); if (result.command_type !== "PrepareRunContext" || !("runtime_binding" in result.data.context)) throw new Error("Agent context expected"); return { ...result.data, context: result.data.context }; };
  const reserveCommand = (prepared: ReturnType<typeof prepare>, reserved = 100) => command("ReserveRun", "task", item.task_id, { work_item_ref: { object_type: "work_item", id: item.id }, context_ref: { object_type: "context_manifest", id: prepared.context.id }, input_digest: prepared.context.input_digest, reserved_cost_micros: reserved });
  const reserve = (prepared: ReturnType<typeof prepare>, reserved = 100) => { const result = flowSuccess(kernel.execute(reserveCommand(prepared, reserved))); if (result.command_type !== "ReserveRun" || result.data.record.run_kind !== "agent") throw new Error("Agent reservation expected"); return result.data; };
  const raw = (run: v2.Run, status: v2.RawAgentRunObservation["status"], overrides: Partial<v2.RawAgentRunObservation> = {}) => {
    const record = f.store.getRuntimeRecord("run_record", run.record_ref.id)!; if (record.run_kind !== "agent") throw new Error("Agent record expected");
    const report: v2.RawAgentRunObservation = { format: "cimiloop/agent-run/1.0.0", run_id: run.id, operation_key: record.operation_key,
      context_ref: record.context_ref, input_digest: record.input_digest, runtime_binding: record.runtime_binding, skill_bindings: record.skill_bindings, host_admission_ref: record.host_admission_ref,
      result_proof_ref: content({ synthetic: true, run_id: run.id, operation_key: record.operation_key, context_id: record.context_ref.id, input_digest: record.input_digest.value }, "agent_run_proof"),
      producer_actor_id: agent.id, observed_at: flowTime, basis: "direct_observation", status, usage: { cost_known: true, cost_micros: 25, currency: "USD" },
      method: "Constructed trusted port; no live execution", observation: "Domain test only", resolves_observation_refs: [], ...overrides };
    return { report, reference: content(report, "agent_run") };
  };
  const observe = (run: v2.Run, status: v2.RawAgentRunObservation["status"], overrides: Partial<v2.RawAgentRunObservation> = {}) => kernel.execute(command("RecordRunObservation", "run", run.id, { raw_result_ref: raw(run, status, overrides).reference }));
  const reconcile = (run: v2.Run, status: v2.RawAgentRunObservation["status"], overrides: Partial<v2.RawAgentRunObservation> = {}) => f.kernel.execute(f.command("ReconcileRun", "run", run.id, { raw_result_ref: raw(run, status, {
    producer_actor_id: f.actor.id, basis: "reconciliation", resolves_observation_refs: f.store.listRuntimeRecords("run_observation", f.change.id).filter(o => o.run_ref.id === run.id && (o.report.status === "unknown" || !o.report.usage.cost_known || o.applicability === "conflicting")).map(o => ({ object_type: "run_observation", id: o.id })), ...overrides }).reference }, "technical_owner"));
  return { ...f, kernel, humanKernel: f.kernel, humanCommand: f.command, runPort, caller, runtime, skill, agent, pins, state, source, item, command, prepareCommand, prepareAgent: prepare, reserveCommand, reserveAgent: reserve, agentRaw: raw, agentObserve: observe, agentReconcile: reconcile };
};
