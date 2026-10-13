import { SCHEMA_VERSION, compileValidator, SkillInvocationPreparationSchema, RawSkillInvocationObservationSchema,
  AgentHostAdmissionReferenceSchema, DigestSchema, type Digest, type AnyCommand, type CommandSuccess, type Run, type Task,
  type SkillInvocation, type SkillInvocationObservation, type RawSkillInvocationObservation, type AgentContextManifest, type DomainError } from "@cimiloop/protocol/v2";
import type { StoreTransaction } from "@cimiloop/store";
import { assignmentIsEffective } from "./authorization.js";
import { activeToolScopeProblems } from "./execution.js";
import { agentRunBindingBlockers } from "./agent-runs.js";
import { contentDigest, IntentFailure, type IntentContext } from "./intent.js";
import { runContextDigest, runIsSettled, type RunVerifierPort, type AgentParentSkillCandidateReader, type AgentParentSkillCandidateAdmissionInput } from "./runs.js";
import { runSkillInvocationFacts, skillInvocationInputDigest, skillInvocationState } from "./skill-invocation-facts.js";

type Command = Extract<AnyCommand, { command_type: "ReserveSkillInvocation" | "RecordSkillInvocationObservation" | "ReconcileSkillInvocation" }>;
interface Mutation { event_type: string; aggregate: CommandSuccess["aggregate"]; revision: number; data: CommandSuccess["data"]; payload: Record<string, unknown> }
const same = (a: unknown, b: unknown) => contentDigest(a).value === contentDigest(b).value;
const fail = (command: Command, code: DomainError["code"], message: string): never => { throw new IntentFailure({ schema_version: SCHEMA_VERSION,
  code, message, category: "conflict", retryable: false, details: {}, correlation_id: command.correlation_id }); };
const ref = <const T extends "run" | "skill_invocation">(object_type: T, id: string) => ({ object_type, id });
const statusMap = { running: "Running", succeeded: "Succeeded", failed: "Failed", cancelled: "Cancelled", unknown: "Unknown", not_started: "NotStarted" } as const;

export const executeSkillInvocation = (tx: StoreTransaction, command: Command, context: IntentContext, host?: RunVerifierPort): Mutation => {
  const run = tx.getRun(command.target.id), record = run ? tx.getRuntimeRecord("run_record", run.record_ref.id) : undefined;
  const manifest = record ? tx.getRuntimeRecord("context_manifest", record.context_ref.id) : undefined;
  if (!run || run.project_id !== context.project.id || !record || record.run_kind !== "agent" || !manifest || !("runtime_binding" in manifest)) return fail(command, "BASELINE_MISMATCH", "技能调用须关联当前项目固定的 Agent 运行");
  const task = tx.getExecutionObject("task", run.task_id), item = tx.getExecutionObject("work_item", run.work_item_ref.id);
  if (!task || !item || record.task_id !== task.id || manifest.task_id !== task.id || manifest.work_item_ref.id !== item.id ||
    !same(record.runtime_binding, manifest.runtime_binding) || !same(record.skill_bindings, manifest.skill_bindings) || !same(record.host_admission_ref, manifest.host_admission_ref) ||
    !same(record.input_digest, manifest.input_digest) || !same(runContextDigest(manifest), manifest.input_digest)) return fail(command, "BASELINE_MISMATCH", "父运行或上下文固定关系无效");
  if (run.revision !== command.expected_revision) return fail(command, "REVISION_CONFLICT", "父运行已变化");
  const actor = tx.getActor(context.actorId), executor = actor?.actor_type === "agent" && actor.id === record.executor_ref.id && command.acting_role === "executor";
  const technical = actor?.actor_type === "human" && command.acting_role === "technical_owner" && tx.listAssignments(actor.id).some(assignment =>
    assignment.project_id === context.project.id && assignment.role_key === "technical_owner" && assignmentIsEffective(assignment, context.now) &&
    (assignment.scope.kind === "project" && assignment.scope.id === context.project.id || assignment.scope.kind === "change" && assignment.scope.id === task.change_id));
  if (command.command_type === "ReserveSkillInvocation" ? !executor : !executor && !technical) return fail(command, "ROLE_NOT_ASSIGNED", "需要固定 Agent 执行者或当前 Human 技术责任");
  const port = host?.agent?.skills;
  if (!port) return fail(command, "CAPABILITY_UNAVAILABLE", "可信技能调用宿主未接通");
  const mutation = (event_type: string, nextRun: Run, data: Record<string, unknown>): Mutation => ({ event_type,
    aggregate: ref("run", nextRun.id), revision: nextRun.revision, data: data as Mutation["data"], payload: data });

  if (command.command_type === "ReserveSkillInvocation") {
    if (!["Reserved", "Running"].includes(run.status) || run.cancel_requested || run.reservation_released || !run.cost_known || task.active_run_ref?.id !== run.id) return fail(command, "RECOVERY_CONDITIONS_UNMET", "父运行须保持有效且没有未知效果");
    const reasons = activeToolScopeProblems(tx, task, item, context.now);
    if (reasons.length) return fail(command, "WORK_ITEM_STATE_INVALID", reasons.join("；"));
    const facts = runSkillInvocationFacts(tx, run);
    if (facts.unresolved.length) return fail(command, "RECOVERY_CONDITIONS_UNMET", "前一技能调用尚未结清");
    if (facts.calls.length >= 64) return fail(command, "BUDGET_EXCEEDED", "单个父运行的技能调用数量已达上限");
    if (Math.max(run.cost_charged_micros, facts.costMicros) >= record.reserved_cost_micros) return fail(command, "BUDGET_EXCEEDED", "原运行预约费用已耗尽");
    const pins = manifest as AgentContextManifest, selected = pins.skill_bindings.find(pin => pin.binding_ref.id === command.payload.skill_binding_ref.id);
    const binding = selected ? tx.getProviderBinding(selected.binding_ref.id) : undefined;
    if (!selected || !binding) return fail(command, "CAPABILITY_UNAVAILABLE", "Skill Binding 未固定在原运行上下文中");
    const blockers = agentRunBindingBlockers(tx, context.project, actor!, item, pins, context.now);
    if (blockers.length) return fail(command, "CAPABILITY_UNAVAILABLE", blockers.join("；"));
    const source = tx.getVerificationRecord("source_snapshot", record.source_snapshot_ref.id), workspace = tx.getRuntimeRecord("workspace_snapshot", record.workspace_before_ref.id);
    if (!source || !workspace) return fail(command, "INPUT_CHANGED", "父运行固定源码不可核验或已变化");
    const currentCandidate=command.source.origin==='agent'&&command.source.producer==='cimiloop-parent-sdk-skill-current-candidate';
    if(currentCandidate&&!port.verifyParentCandidate)return fail(command,'CAPABILITY_UNAVAILABLE','原父当前候选独立核验宿主未安装');
    if(!currentCandidate&&!host!.sourceIsCurrent(context.project,source))return fail(command,'INPUT_CHANGED','父运行固定源码不可核验或已变化');
    const candidateInput:AgentParentSkillCandidateAdmissionInput={command,run,record:record as import('@cimiloop/protocol/v2').AgentRunRecord,context:pins,binding,
      task,work_item:item,source,workspace,runtime_binding:pins.runtime_binding,skill_bindings:pins.skill_bindings};
    const readCandidate=():Digest=>{
      let active=true;
      const take=<T>(read:()=>T):T=>{if(!active)throw Error('Original parent candidate Writer reader expired');return structuredClone(read());};
      const reader:AgentParentSkillCandidateReader=Object.freeze({
        getCurrentProject:()=>take(()=>tx.getCurrentProject()),getActor:id=>take(()=>tx.getActor(id)),getRun:id=>take(()=>tx.getRun(id)),
        getRuntimeRecord:(kind,id)=>take(()=>tx.getRuntimeRecord(kind,id)),listRuntimeRecords:(kind,changeId)=>take(()=>tx.listRuntimeRecords(kind,changeId)),
        getCommandReceipt:id=>take(()=>tx.getCommandReceipt(id)),getExecutionObject:(kind,id)=>take(()=>tx.getExecutionObject(kind,id)),getVerificationRecord:(kind,id)=>take(()=>tx.getVerificationRecord(kind,id)),
        getProviderBinding:id=>take(()=>tx.getProviderBinding(id)),getProviderDescriptor:id=>take(()=>tx.getProviderDescriptor(id))
      });
      try {
        const value:unknown=port.verifyParentCandidate!(structuredClone(context.project),structuredClone(candidateInput),reader);
        if(value instanceof Promise){void Promise.prototype.then.call(value,undefined,()=>{});throw Error('Asynchronous candidate proof unavailable');}
        if(value!==null&&(typeof value==='object'||typeof value==='function')){let then:unknown;try{then=Reflect.get(value,'then');}catch{void Promise.resolve(value).then(undefined,()=>{});throw Error('Asynchronous candidate proof unavailable');}if(typeof then==='function'){void Promise.resolve(value).then(undefined,()=>{});throw Error('Asynchronous candidate proof unavailable');}}
        return structuredClone(compileValidator<Digest>(DigestSchema)(value));
      }finally{active=false;}
    };
    let prepared: import("@cimiloop/protocol/v2").SkillInvocationPreparation,candidateBefore:Digest|undefined;
    const invocation_key = context.id();
    try {
      if(currentCandidate)candidateBefore=readCandidate();
      else {
        const admission=compileValidator<AgentContextManifest['host_admission_ref']>(AgentHostAdmissionReferenceSchema)(host!.agent!.admitContext(context.project,
          structuredClone({task,work_item:item,source,workspace,runtime_binding:pins.runtime_binding,skill_bindings:pins.skill_bindings})));
        if(!same(admission,record.host_admission_ref))return fail(command,'INPUT_CHANGED','Agent 宿主准入凭据已变化');
      }
      prepared=compileValidator<import('@cimiloop/protocol/v2').SkillInvocationPreparation>(SkillInvocationPreparationSchema)(port.prepare(context.project,
        structuredClone(record),structuredClone(pins),structuredClone(binding),{invocation_key,method_name:command.payload.method_name,input_ref:structuredClone(command.payload.input_ref)}));
    }catch(error){if(error instanceof IntentFailure)throw error;return fail(command,'EVIDENCE_MISSING','技能输入、原候选、包、Schema 或实际命名方法资格不可核验');}
    const request = prepared.request;
    if (request.invocation_key !== invocation_key || request.method_name !== command.payload.method_name) return fail(command, "BASELINE_MISMATCH", "命名技能请求与原调用不符");
    const descriptor = tx.getProviderDescriptor(binding.descriptor_ref.id)!;
    if (request.input.purpose === "review" && request.input.artifact_refs.some(reference => !reference.digest)) return fail(command, "PROVIDER_OUTPUT_INVALID", "正式评审资料必须固定内容摘要");
    if (!same(request.source_digest, descriptor.source_ref.digest) || !same(prepared.package_ref.digest, descriptor.source_ref.digest) ||
      prepared.package_ref.locator !== prepared.package_ref.digest.value || !same(prepared.input_schema_ref, binding.input_schema_ref) || !same(prepared.output_schema_ref, binding.output_schema_ref) ||
      binding.capability.capability_id !== (request.input.purpose === "clarification" ? "intent.clarify" : "verification.review") ||
      pins.boundary === "agent_independent_read_only" && request.input.purpose !== "review") return fail(command, "BASELINE_MISMATCH", "技能包、契约或能力用途与固定 Binding 不符");
    if(currentCandidate){
      try{if(!candidateBefore||!same(candidateBefore,readCandidate()))throw Error('Original candidate proof changed');}
      catch{return fail(command,'EVIDENCE_MISSING','方法资格核验后原父当前候选不可再验');}
      if(!same(tx.getRun(run.id),run)||!same(tx.getRuntimeRecord('run_record',record.id),record)||!same(tx.getRuntimeRecord('context_manifest',pins.id),pins)||
        !same(tx.getActor(actor!.id),actor)||!same(tx.getExecutionObject('task',task.id),task)||!same(tx.getExecutionObject('work_item',item.id),item)||
        !same(tx.getProviderBinding(binding.id),binding)||!same(tx.getVerificationRecord('source_snapshot',source.id),source)||!same(tx.getRuntimeRecord('workspace_snapshot',workspace.id),workspace))return fail(command,'INPUT_CHANGED','原父当前候选核验期间权限或固定关系改变');
      const freshProblems=[...activeToolScopeProblems(tx,task,item,context.now),...agentRunBindingBlockers(tx,context.project,actor!,item,pins,context.now)];
      if(freshProblems.length)return fail(command,'CAPABILITY_UNAVAILABLE',freshProblems.join('；'));
    }
    const body = { schema_version: SCHEMA_VERSION, id: context.id(), project_id: context.project.id, created_at: context.now, producer_actor_id: actor!.id,
      change_id: record.change_id, task_id: record.task_id, work_item_ref: record.work_item_ref, definition_ref: record.definition_ref, contract_ref: record.contract_ref, plan_ref: record.plan_ref,
      run_ref: ref("run", run.id), run_operation_key: record.operation_key, invocation_key, context_ref: record.context_ref, executor_ref: record.executor_ref,
      runtime_binding: record.runtime_binding, skill_binding: selected, host_admission_ref: record.host_admission_ref, capability: binding.capability,
      input_ref: command.payload.input_ref, ...prepared };
    const invocation: SkillInvocation = { ...body, input_digest: skillInvocationInputDigest(body) };
    const nextRun: Run = { ...run, revision: run.revision + 1, updated_at: context.now };
    tx.insertRuntimeRecord("skill_invocation", invocation); tx.updateRun(nextRun, run.revision);
    return mutation("SkillInvocationReserved", nextRun, { run: nextRun, invocation });
  }

  if (command.command_type === "ReconcileSkillInvocation" && !technical) return fail(command, "ROLE_NOT_ASSIGNED", "未知或冲突技能结果须由 Human 技术责任核对");
  const invocation = tx.getRuntimeRecord("skill_invocation", command.payload.invocation_ref.id);
  if (!invocation || invocation.run_ref.id !== run.id || invocation.run_operation_key !== record.operation_key || !same(invocation.input_digest, skillInvocationInputDigest(invocation))) return fail(command, "BASELINE_MISMATCH", "原技能调用预约缺失或输入摘要不符");
  let raw: RawSkillInvocationObservation;
  try { raw = compileValidator<RawSkillInvocationObservation>(RawSkillInvocationObservationSchema)(port.readResult(context.project, structuredClone(invocation), command.payload.raw_result_ref)); }
  catch { return fail(command, "EVIDENCE_MISSING", "原技能调用结果、Schema 或原始证明不可核验"); }
  if (raw.invocation_ref.id !== invocation.id || raw.invocation_key !== invocation.invocation_key || raw.run_ref.id !== run.id || raw.run_operation_key !== record.operation_key ||
    raw.producer_actor_id !== context.actorId || !same(raw.input_digest, invocation.input_digest) || !Number.isFinite(Date.parse(raw.observed_at)) ||
    new Date(raw.observed_at).toISOString() !== (raw.observed_at.length === 20 ? raw.observed_at.replace("Z", ".000Z") : raw.observed_at) ||
    Date.parse(raw.observed_at) < Date.parse(invocation.created_at) || Date.parse(raw.observed_at) > Date.parse(context.now) ||
    raw.usage.cost_known && raw.usage.currency !== record.cost_currency || raw.status === "succeeded" && raw.output.purpose !== invocation.request.input.purpose) return fail(command, "BASELINE_MISMATCH", "技能报告身份、时间、币种、输入或输出用途不符");
  const fixedInput = invocation.request.input;
  if (raw.status === "succeeded" && raw.output.purpose === "review" && fixedInput.purpose === "review" &&
    raw.output.findings.some(finding => finding.basis_refs.some(reference => !fixedInput.artifact_refs.some(bound => same(bound, reference))))) return fail(command, "PROVIDER_OUTPUT_INVALID", "评审依据必须来自固定输入的资料引用");
  const prior = tx.listRuntimeRecords("skill_invocation_observation", run.change_id).filter(observation => observation.invocation_ref.id === invocation.id);
  if (prior.length >= 256) return fail(command, "BUDGET_EXCEEDED", "原技能调用观测数量已达上限");
  const current = skillInvocationState(prior), reconciling = command.command_type === "ReconcileSkillInvocation";
  if (raw.basis !== (reconciling ? "reconciliation" : "direct_observation") || !reconciling && (raw.status === "not_started" || raw.resolves_observation_refs.length)) return fail(command, "RECOVERY_CONDITIONS_UNMET", "技能冲突解决及未启动核对须使用 Human 核对命令");
  const unresolved = prior.filter(observation => observation.report.status === "unknown" || !observation.report.usage.cost_known || observation.applicability === "conflicting");
  if (reconciling && (["unknown", "running"].includes(raw.status) || !raw.usage.cost_known || unresolved.some(observation => !raw.resolves_observation_refs.some(reference => reference.id === observation.id)) ||
    raw.resolves_observation_refs.some(reference => !prior.some(observation => observation.id === reference.id)) || current.latest && Date.parse(raw.observed_at) < Date.parse(current.latest.report.observed_at))) return fail(command, "RECOVERY_CONDITIONS_UNMET", "技能核对须覆盖全部未知 / 冲突事实及最新确定用量");
  if (raw.status === "not_started" && (current.costMicros > 0 || !raw.usage.cost_known || raw.usage.cost_micros !== 0 || prior.some(observation => !["unknown", "not_started"].includes(observation.report.status)))) return fail(command, "RECOVERY_CONDITIONS_UNMET", "已有技能调用或费用，不能认定未启动");
  const desired = statusMap[raw.status], late = !!current.latest && Date.parse(raw.observed_at) < Date.parse(current.latest.report.observed_at);
  const lateEffect = current.status === "NotStarted" && (!["unknown", "not_started"].includes(raw.status) || raw.usage.cost_known && raw.usage.cost_micros > 0);
  const changedOutput = raw.status === "succeeded" && current.latest?.report.status === "succeeded" && !same(raw.output, current.latest.report.output);
  const conflict = !reconciling && current.settled && (desired !== current.status || changedOutput) && (!late || lateEffect);
  const status: Run["status"] = reconciling ? desired : conflict ? "Unknown" : late ? current.status : current.status === "Unknown" ? "Unknown" : desired;
  const observation: SkillInvocationObservation = { schema_version: SCHEMA_VERSION, id: context.id(), project_id: invocation.project_id, created_at: context.now, producer_actor_id: context.actorId,
    change_id: invocation.change_id, task_id: invocation.task_id, work_item_ref: invocation.work_item_ref, definition_ref: invocation.definition_ref, contract_ref: invocation.contract_ref, plan_ref: invocation.plan_ref,
    invocation_ref: ref("skill_invocation", invocation.id), raw_result_ref: command.payload.raw_result_ref, report: raw, received_at: context.now,
    applicability: conflict ? "conflicting" : late ? "late" : "current", resulting_status: status };
  tx.insertRuntimeRecord("skill_invocation_observation", observation);
  const facts = runSkillInvocationFacts(tx, run), unknown = facts.calls.some(call => call.state.status === "Unknown" || !call.state.costKnown);
  const parentUnknown = unknown || runIsSettled(run) || run.status === "Unknown" || run.cancel_requested;
  const nextRun: Run = { ...run, revision: run.revision + 1, updated_at: context.now,
    status: parentUnknown ? "Unknown" : raw.status === "not_started" ? run.status : "Running", cost_known: run.cost_known && facts.calls.every(call => call.state.costKnown) };
  const nextTask: Task = { ...task, revision: task.revision + 1, updated_at: context.now,
    usage: { ...task.usage, pending_reconciliation: true, cost_known: task.usage.cost_known && nextRun.cost_known } };
  tx.updateRun(nextRun, run.revision); tx.updateExecutionObject("task", nextTask, task.revision);
  return mutation(reconciling ? "SkillInvocationReconciled" : "SkillInvocationObserved", nextRun, { run: nextRun, task: nextTask, observation });
};
