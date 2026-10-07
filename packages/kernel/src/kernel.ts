import {
  ProtocolValidationError,
  SCHEMA_VERSION,
  createInternalId,
  formatValidationErrors,
  parseCommand, compileValidator, parseCommandSuccess,
  type Actor,
  type AnyCommand,
  type Assignment,
  type Change,
  type CommandSuccess,
  type DomainError,
  type EventEnvelope,
  type InitializeProjectCommand,
  type InternalId,
  type Project,
  type Role
} from "@cimiloop/protocol/v2";
import {
  StoreConflictError,
  type OutboxMessage,
  type ProjectStore,
  type ProposedEvent,
  type StoreTransaction
} from "@cimiloop/store";
import { commandDigest } from "./canonical.js";
import { createDraftChange, pauseDraftChange, resumeDraftChange } from "./change.js";
import { callerMatchesActor, resolveAssignment, type CallerContext } from "./authorization.js";
import { executeGovernance, newAssignment } from "./governance.js";
import { checkWipCapacity, executeFlow, isWip, loadSettings, requireFlowOwner } from "./flow.js";
import { FlowStatusResultSchema, type FlowStatusResult } from "@cimiloop/protocol/v2";
import { IntentShowResultSchema, type IntentShowResult } from "@cimiloop/protocol/v2";
import { executeIntent, IntentFailure, requestIsCurrent, admissionFailure } from "./intent.js";
import { executeExecution, executionReadiness } from "./execution.js";
import { ExecutionShowResultSchema, type ExecutionShowResult } from "@cimiloop/protocol/v2";
import { VerificationShowResultSchema, type VerificationShowResult } from "@cimiloop/protocol/v2";
import { executeVerification, type EvidenceVerifierPort } from "./verification.js";
import { executeReview } from "./review.js";
import { executeRun, verifyChangeResumption, type RunVerifierPort } from "./runs.js";
import { executeSkillInvocation } from "./skill-invocations.js";
import { RunShowResultSchema, type RunShowResult } from "@cimiloop/protocol/v2";
import { professionalAction, professionalRequestCurrent, applicableInvalidations } from "./review-facts.js";
import { commandDiagnostic, queryObject, supportedQueryType } from "./queries.js";
import { providerCatalog, registerProvider } from "./providers.js";
import { executeProviderAssessment, type ProviderVerifierPort } from "./provider-assessment.js";
import { ProviderCatalogResultSchema, type ProviderCatalogResult } from "@cimiloop/protocol/v2";
import { ChangeListResultSchema, ChangeShowResultSchema, GovernanceListResultSchema,
  type ChangeListResult, type ChangeShowResult, type GovernanceListResult, type ObjectShowResult } from "@cimiloop/protocol/v2";

import { parseVersionedCommand, UnsupportedSchemaVersionError } from "@cimiloop/protocol";
import { ToolAuthorityRequestSchema, ToolAuthorityAssessmentSchema, type ToolAuthorityRequest, type ToolAuthorityAssessment } from "@cimiloop/protocol/v2";
import { assessToolAuthority } from "./tool-authority.js";
import { AgentToolAuthorityRequestSchema, AgentToolAuthorityAssessmentSchema, type AgentToolAuthorityRequest, type AgentToolAuthorityAssessment } from "@cimiloop/protocol/v2";
import { assessAgentToolAuthority } from "./agent-tool-authority.js";
import type * as v1 from "@cimiloop/protocol/v1";
import type { HistoricalSuccess, HistoricalEvent } from "@cimiloop/store";
export type KernelResult = HistoricalSuccess | DomainError;
type CurrentKernelResult = CommandSuccess | DomainError;
const upgradeCommand = (command: v1.AnyCommand | AnyCommand): AnyCommand => {
  if (command.schema_version === SCHEMA_VERSION) return command;
  const { target, ...fields } = command;
  return parseCommand({ ...fields, schema_version: SCHEMA_VERSION,
    ...(command.command_type === "InitializeProject" ? {} : { acting_role: "project_owner" }),
    ...(target ? { target: { object_type: target.object_type, id: target.id } } : {}) });
};

export interface KernelDependencies {
  store: ProjectStore;
  caller?: CallerContext;
  now?: () => string;
  id?: () => InternalId;
  evidenceVerifier?: EvidenceVerifierPort;
  runVerifier?: RunVerifierPort;
  providerVerifier?: ProviderVerifierPort;
}

const defaultClock = (): string => new Date().toISOString();

const domainError = (
  correlationId: InternalId,
  code: DomainError["code"],
  message: string,
  category: DomainError["category"],
  retryable = false,
  details: Record<string, unknown> = {}
): DomainError => ({ schema_version: SCHEMA_VERSION, code, message, category, retryable, details, correlation_id: correlationId });

const isDomainError = (value: KernelResult): value is DomainError => "code" in value;

export class CimiLoopKernel {
  readonly #store: ProjectStore;
  readonly #now: () => string;
  readonly #id: () => InternalId;
  readonly #caller: CallerContext | undefined;
  readonly #evidenceVerifier: EvidenceVerifierPort | undefined;
  readonly #runVerifier: RunVerifierPort | undefined;
  readonly #providerVerifier: ProviderVerifierPort | undefined;

  constructor(dependencies: KernelDependencies) {
    this.#store = dependencies.store;
    this.#now = dependencies.now ?? defaultClock;
    this.#id = dependencies.id ?? createInternalId;
    this.#caller = dependencies.caller ? structuredClone(dependencies.caller) : undefined;
    this.#evidenceVerifier = dependencies.evidenceVerifier;
    this.#runVerifier = dependencies.runVerifier;
    this.#providerVerifier = dependencies.providerVerifier;
  }

  execute(input: unknown): KernelResult {
    let command: v1.AnyCommand | AnyCommand;
    try {
      command = parseVersionedCommand(input);
    } catch (error) {
      const correlationId = this.#id();
      if (error instanceof ProtocolValidationError) {
        return domainError(
          correlationId,
          "PROTOCOL_VALIDATION_FAILED",
          "命令不符合 Cimi Change Protocol",
          "validation",
          false,
          { errors: formatValidationErrors(error.errors) }
        );
      }
      if (error instanceof UnsupportedSchemaVersionError) return domainError(correlationId, "UNSUPPORTED_SCHEMA_VERSION", "协议版本不受支持", "validation");
      return domainError(correlationId, "INVALID_COMMAND", "无法解析命令", "validation");
    }

    const digest = commandDigest(command);
    try {
      const result = this.#store.transaction((transaction) => {
        const callerFailure = this.#validateCaller(transaction, command);
        if (callerFailure) return callerFailure;
        const previous = transaction.getCommandReceipt(command.command_id);
        if (previous) {
          if (previous.request_digest !== digest) {
            return domainError(
              command.correlation_id,
              "COMMAND_ID_REUSED",
              "同一 command_id 已被用于不同命令",
              "conflict",
              false,
              { command_id: command.command_id }
            );
          }
          if (command.command_type === "InitializeProject" && "data" in previous.result && "actor" in previous.result.data &&
            this.#caller?.kind !== "bootstrap" && previous.result.data.actor.id !== this.#caller?.actor_id) {
            return domainError(command.correlation_id, "CALLER_IDENTITY_MISMATCH", "初始化回执属于另一位操作者", "forbidden");
          }
          return previous.result;
        }

        let current: AnyCommand;
        try { current = upgradeCommand(command); }
        catch { return domainError(command.correlation_id, "COMMAND_CONTEXT_REQUIRED", "旧命令缺少有效的项目、身份或目标上下文", "validation"); }
        const result = this.#dispatch(transaction, current, command.schema_version === "1.0.0");
        if (!isDomainError(result)) {
          transaction.saveCommandReceipt({
            command_id: command.command_id,
            request_digest: digest,
            result,
            created_at: this.#now()
          });
        }
        return result;
      });
      return isDomainError(result) ? this.#diagnose(result, command) : result;
    } catch (error) {
      if (error instanceof IntentFailure) return this.#diagnose(error.result, command);
      if (error instanceof StoreConflictError) {
        return this.#diagnose(domainError(
          command.correlation_id,
          "REVISION_CONFLICT",
          "目标对象已被其他命令修改，请刷新后重试",
          "conflict",
          false,
          { current_revision: error.currentRevision }
        ), command);
      }
      return domainError(command.correlation_id, "STORE_FAILURE", "本地存储操作失败", "storage", true);
    }
  }

  #diagnose(error: DomainError, command: v1.AnyCommand | AnyCommand): DomainError {
    if (command.schema_version !== SCHEMA_VERSION || !("target" in command) || !command.target || !["validation", "conflict", "not_found"].includes(error.category)) return error;
    try {
      const diagnostic = commandDiagnostic(this.#store, command, this.#now());
      if (!diagnostic) return error;
      if (!["REVISION_CONFLICT", "COMMAND_ID_REUSED"].includes(error.code) && !diagnostic.missing_conditions.includes(error.code)) diagnostic.missing_conditions.unshift(error.code);
      return { ...error, details: { ...error.details, diagnostic } };
    } catch { return error; } // A secondary read must never hide the original failure.
  }

  getObject(kind: string, idOrKey: string): ObjectShowResult | DomainError {
    if (!supportedQueryType(kind)) return domainError(this.#id(), "UNSUPPORTED_OBJECT_TYPE", "该对象类型尚未支持详情查询", "validation", false, { object_type: kind });
    try {
      return queryObject(this.#store, kind, idOrKey, this.#now()) ?? domainError(this.#id(), "OBJECT_NOT_FOUND", "未找到当前项目中的指定对象", "not_found", false, { object_type: kind, id_or_key: idOrKey });
    } catch { return domainError(this.#id(), "STORE_FAILURE", "无法读取一致的对象详情", "storage", true); }
  }

  getChangeList(): ChangeListResult | DomainError {
    try {
      const snapshot = this.#store.readSnapshot(reader => ({ changes: reader.listChanges() }));
      return compileValidator<ChangeListResult>(ChangeListResultSchema)({ schema_version: SCHEMA_VERSION, ok: true, ...snapshot.value, as_of_event_sequence: snapshot.as_of_event_sequence });
    } catch { return domainError(this.#id(), "STORE_FAILURE", "无法读取一致的需求列表", "storage", true); }
  }

  getProviderCatalog(): ProviderCatalogResult | DomainError {
    try {
      const snapshot = this.#store.readSnapshot(reader => reader.getProject() ? providerCatalog(reader) : undefined);
      if (!snapshot.value) return domainError(this.#id(), "PROJECT_NOT_INITIALIZED", "当前仓库尚未初始化 Project", "not_found");
      return compileValidator<ProviderCatalogResult>(ProviderCatalogResultSchema)({ schema_version: SCHEMA_VERSION, ok: true,
        ...snapshot.value, as_of_event_sequence: snapshot.as_of_event_sequence });
    } catch { return domainError(this.#id(), "STORE_FAILURE", "无法读取一致的 Provider 目录", "storage", true); }
  }

  getChangeSnapshot(idOrKey: string): ChangeShowResult | DomainError {
    try {
      const snapshot = this.#store.readSnapshot(reader => reader.getChange(idOrKey));
      return snapshot.value ? compileValidator<ChangeShowResult>(ChangeShowResultSchema)({ schema_version: SCHEMA_VERSION, ok: true, change: snapshot.value, as_of_event_sequence: snapshot.as_of_event_sequence }) :
        domainError(this.#id(), "CHANGE_NOT_FOUND", "未找到指定 Change", "not_found", false, { id_or_key: idOrKey });
    } catch { return domainError(this.#id(), "STORE_FAILURE", "无法读取一致的需求事实", "storage", true); }
  }

  getGovernance(): GovernanceListResult | DomainError {
    try {
      const snapshot = this.#store.readSnapshot(reader => ({ actors: reader.listActors(), assignments: reader.listAssignments() }));
      return compileValidator<GovernanceListResult>(GovernanceListResultSchema)({ schema_version: SCHEMA_VERSION, ok: true, ...snapshot.value, as_of_event_sequence: snapshot.as_of_event_sequence });
    } catch { return domainError(this.#id(), "STORE_FAILURE", "无法读取一致的责任事实", "storage", true); }
  }

  getProject(): Project | DomainError {
    return (
      this.#store.getProject() ??
      domainError(this.#id(), "PROJECT_NOT_INITIALIZED", "当前目录尚未初始化 CimiLoop Project", "not_found")
    );
  }

  getChange(idOrKey: string): Change | DomainError {
    return (
      this.#store.getChange(idOrKey) ??
      domainError(this.#id(), "CHANGE_NOT_FOUND", "未找到指定 Change", "not_found", false, { id_or_key: idOrKey })
    );
  }

  listChanges(): Change[] {
    return this.#store.listChanges();
  }

  listEvents(): HistoricalEvent[] {
    return this.#store.listEvents();
  }
  getFlowStatus(): FlowStatusResult | DomainError {
    try {
      const snapshot = this.#store.readSnapshot(reader => {
        const project = reader.getProject();
        if (!project) return domainError(this.#id(), "PROJECT_NOT_INITIALIZED", "当前目录尚未初始化 Project", "not_found");
        const settings = loadSettings(reader, project), order = settings?.settings.priority_order;
        const changes = reader.listChanges().filter(change => change.project_id === project.id).sort((left, right) =>
          (order ? (order === "higher_first" ? right.priority - left.priority : left.priority - right.priority) : 0) ||
          Number(left.display_key.slice(4)) - Number(right.display_key.slice(4)));
        const wip = changes.filter(isWip), limit = settings?.settings.wip_limit ?? null;
        return { schema_version: SCHEMA_VERSION, ok: true as const, settings_version: settings ?? null,
          target_versions: reader.listTargetVersions().filter(target => target.project_id === project.id), changes,
          wip_changes: wip, paused_changes: changes.filter(change => change.operating_status === "Paused" && ["Executing", "ReadyForDelivery"].includes(change.lifecycle_state)),
          priority_order: order ?? null, wip: { used: wip.length, limit, available: limit === null ? null : Math.max(0, limit - wip.length) } };
      });
      if ("code" in snapshot.value) return snapshot.value;
      return compileValidator<FlowStatusResult>(FlowStatusResultSchema)({ ...snapshot.value, as_of_event_sequence: snapshot.as_of_event_sequence });
    } catch { return domainError(this.#id(), "STORE_FAILURE", "无法读取一致的项目设置与在制事实", "storage", true); }
  }
  getIntent(idOrKey: string): IntentShowResult | DomainError {
    try {
      const snapshot = this.#store.readSnapshot(reader => {
        const change = reader.getChange(idOrKey);
        if (!change) return domainError(this.#id(), "CHANGE_NOT_FOUND", "未找到Change", "not_found");
        const decisions = reader.listIntentRecords("decision", change.id), contracts = reader.listIntentRecords("contract_version", change.id), plans = reader.listIntentRecords("plan_version", change.id);
        const applied = new Set([...contracts, ...plans].flatMap(version => [version.confirmation_decision_ref.id, ...(version.condition_verification_refs ?? []).map(ref => ref.id)]));
        reader.listVerificationRecords("evidence", change.id).flatMap(evidence => applicableInvalidations(reader, change.id, evidence)).forEach(decision => applied.add(decision.id));
        reader.listVerificationRecords("integration_readiness_record", change.id).forEach(fact => {
          const gate = reader.getVerificationRecord("evaluation", fact.evaluation_ref.id); if (gate?.purpose === "safe_integration" && gate.professional_decision_ref) applied.add(gate.professional_decision_ref.id);
        });
        return { schema_version: SCHEMA_VERSION, ok: true as const, change,
          contract_proposals: reader.listIntentRecords("contract_proposal", change.id), plan_proposals: reader.listIntentRecords("plan_proposal", change.id),
          contract_versions: contracts, plan_versions: plans, risk_assessments: reader.listIntentRecords("risk_assessment", change.id), decisions,
          lifecycle_transitions: reader.listIntentRecords("lifecycle_transition_record", change.id),
          decision_requests: reader.listIntentRecords("decision_request", change.id).map(request => {
            const decision = decisions.find(item => item.request_id === request.id);
            const current = professionalAction(request.action) ? professionalRequestCurrent(reader, change, request, this.#now()) : requestIsCurrent(reader, change, request, this.#now());
            const status = decision && applied.has(decision.id) ? "applied" as const : !current ? "stale" as const : decision?.choice ?? "pending" as const;
            return { request, status, ...(decision ? { decision_ref: { object_type: "decision" as const, id: decision.id } } : {}) };
          }) };
      });
      if ("code" in snapshot.value) return snapshot.value;
      return compileValidator<IntentShowResult>(IntentShowResultSchema)({ ...snapshot.value, as_of_event_sequence: snapshot.as_of_event_sequence });
    } catch { return domainError(this.#id(), "STORE_FAILURE", "无法读取一致的约定、计划与决定事实", "storage", true); }
  }

  getExecution(idOrKey?: string): ExecutionShowResult | DomainError {
    try {
      const at = this.#now(), snapshot = this.#store.readSnapshot(reader => {
        const project = reader.getProject();
        if (!project) return domainError(this.#id(), "PROJECT_NOT_INITIALIZED", "当前目录尚未初始化Project", "not_found");
        const change = idOrKey ? reader.getChange(idOrKey) : undefined;
        if (idOrKey && !change) return domainError(this.#id(), "CHANGE_NOT_FOUND", "未找到Change", "not_found");
        const tasks = reader.listExecutionObjects("task", change?.id);
        return { schema_version: SCHEMA_VERSION, ok: true as const, tasks,
          definitions: reader.listExecutionRecords("task_definition").filter(item => !change || item.change_id === change.id),
          work_items: reader.listExecutionObjects("work_item", change?.id), authorizations: reader.listExecutionObjects("standing_authorization"),
          authorization_versions: reader.listExecutionRecords("standing_authorization_version"), authorization_revocations: reader.listExecutionRecords("authorization_revocation_record"),
          work_item_authorizations: reader.listExecutionRecords("work_item_authorization_record").filter(item => !change || item.change_id === change.id),
          readiness: tasks.map(task => executionReadiness(reader, task, at)) };
      });
      if ("code" in snapshot.value) return snapshot.value;
      return compileValidator<ExecutionShowResult>(ExecutionShowResultSchema)({ ...snapshot.value, as_of_event_sequence: snapshot.as_of_event_sequence });
    } catch { return domainError(this.#id(), "STORE_FAILURE", "无法读取一致的任务与授权事实", "storage", true); }
  }

  assessRunTool(input: unknown): ToolAuthorityAssessment | DomainError {
    let request: ToolAuthorityRequest;
    try { request = structuredClone(compileValidator<ToolAuthorityRequest>(ToolAuthorityRequestSchema)(input)); }
    catch { return domainError(this.#id(), "PROTOCOL_VALIDATION_FAILED", "工具权限查询不符合协议", "validation"); }
    try {
      const at = this.#now(), snapshot = this.#store.readSnapshot(reader => assessToolAuthority(reader, request, this.#caller, at));
      return compileValidator<ToolAuthorityAssessment>(ToolAuthorityAssessmentSchema)({ ...snapshot.value, as_of_event_sequence: snapshot.as_of_event_sequence });
    } catch { return domainError(this.#id(), "STORE_FAILURE", "无法读取一致的工具授权事实", "storage", true); }
  }
  assessAgentRunTool(input: unknown): AgentToolAuthorityAssessment | DomainError {
    let request: AgentToolAuthorityRequest;
    try { request = structuredClone(compileValidator<AgentToolAuthorityRequest>(AgentToolAuthorityRequestSchema)(input)); }
    catch { return domainError(this.#id(), "PROTOCOL_VALIDATION_FAILED", "Agent 工具权限查询不符合协议", "validation"); }
    try {
      const at = this.#now(), snapshot = this.#store.readSnapshot(reader => assessAgentToolAuthority(reader, request, this.#caller, at, this.#runVerifier?.agent));
      return compileValidator<AgentToolAuthorityAssessment>(AgentToolAuthorityAssessmentSchema)({ ...snapshot.value, as_of_event_sequence: snapshot.as_of_event_sequence });
    } catch { return domainError(this.#id(), "STORE_FAILURE", "无法读取一致的 Agent 工具授权事实", "storage", true); }
  }

  getRuns(idOrKey: string): RunShowResult | DomainError {
    try {
      const snapshot = this.#store.readSnapshot(reader => {
        const change = reader.getChange(idOrKey);
        if (!change) return domainError(this.#id(), "CHANGE_NOT_FOUND", "未找到Change", "not_found");
        return { schema_version: SCHEMA_VERSION, ok: true as const, runs: reader.listRuns(change.id), workspaces: reader.listRuntimeRecords("workspace_snapshot", change.id),
          contexts: reader.listRuntimeRecords("context_manifest", change.id), records: reader.listRuntimeRecords("run_record", change.id), observations: reader.listRuntimeRecords("run_observation", change.id),
          handoffs: reader.listRuntimeRecords("handoff_record", change.id), resumptions: reader.listRuntimeRecords("resumption_record", change.id),
          skill_invocations: reader.listRuntimeRecords("skill_invocation", change.id), skill_observations: reader.listRuntimeRecords("skill_invocation_observation", change.id) };
      });
      if ("code" in snapshot.value) return snapshot.value;
      return compileValidator<RunShowResult>(RunShowResultSchema)({ ...snapshot.value, as_of_event_sequence: snapshot.as_of_event_sequence });
    } catch { return domainError(this.#id(), "STORE_FAILURE", "无法读取一致的运行与交接事实", "storage", true); }
  }
  getVerification(idOrKey: string): VerificationShowResult | DomainError {
    try {
      const snapshot = this.#store.readSnapshot(reader => {
        const change = reader.getChange(idOrKey);
        if (!change) return domainError(this.#id(), "CHANGE_NOT_FOUND", "未找到Change", "not_found");
        return { schema_version: SCHEMA_VERSION, ok: true as const, source_snapshots: reader.listVerificationRecords("source_snapshot", change.id),
          evidence: reader.listVerificationRecords("evidence", change.id), policy_snapshots: reader.listVerificationRecords("policy_snapshot", change.id),
          requirement_sets: reader.listVerificationRecords("requirement_set_record", change.id), contexts: reader.listVerificationRecords("evaluation_context", change.id),
          evaluations: reader.listVerificationRecords("evaluation", change.id), satisfactions: reader.listVerificationRecords("task_satisfaction_record", change.id),
          integration_readiness: reader.listVerificationRecords("integration_readiness_record", change.id) };
      });
      if ("code" in snapshot.value) return snapshot.value;
      return compileValidator<VerificationShowResult>(VerificationShowResultSchema)({ ...snapshot.value, as_of_event_sequence: snapshot.as_of_event_sequence });
    } catch { return domainError(this.#id(), "STORE_FAILURE", "无法读取一致的证据与评价事实", "storage", true); }
  }

  #validateCaller(transaction: StoreTransaction, command: v1.AnyCommand | AnyCommand): DomainError | undefined {
    const caller = this.#caller;
    if (!caller) return domainError(command.correlation_id, "CALLER_REQUIRED", "可信入口必须绑定调用身份", "forbidden");
    if (caller.kind === "bootstrap") {
      if (command.command_type === "InitializeProject" && !transaction.getCurrentProject() && command.source.origin === "human_cli") return;
      return domainError(command.correlation_id, "CALLER_IDENTITY_MISMATCH", "初始化身份仅能创建尚未初始化的 Project", "forbidden");
    }
    const actor = transaction.getActor(caller.actor_id);
    if (!actor || !callerMatchesActor(caller, actor) || !transaction.getProject(caller.project_id) ||
      (command.command_type !== "InitializeProject" && (command.actor_id !== actor.id || command.project_id !== caller.project_id))) {
      return domainError(command.correlation_id, "CALLER_IDENTITY_MISMATCH", "命令身份与可信入口绑定不一致", "forbidden");
    }
    if (actor.actor_type === "human" && !["human_cli", "human_ui"].includes(command.source.origin)) {
      return domainError(command.correlation_id, "ROLE_NOT_ASSIGNED", "Human 操作必须来自绑定的人类入口", "forbidden");
    }
    if (actor.actor_type !== "human" && ["human_cli", "human_ui"].includes(command.source.origin)) {
      return domainError(command.correlation_id, "CALLER_IDENTITY_MISMATCH", "Agent/System 不能自报 Human 来源", "forbidden");
    }
  }

  #dispatch(transaction: StoreTransaction, command: AnyCommand, legacy: boolean): CurrentKernelResult {
    if (command.expected_input_digest !== undefined && !["RecordDecision", "ConfirmContract", "ConfirmPlan", "ReserveRun", "CheckResumption"].includes(command.command_type)) return domainError(command.correlation_id, "CAPABILITY_UNAVAILABLE", "该命令尚未支持输入摘要条件", "validation");
    switch (command.command_type) {
      case "ReserveSkillInvocation": case "RecordSkillInvocationObservation": case "ReconcileSkillInvocation": {
        const project = transaction.getProject(command.project_id);
        if (!project) return domainError(command.correlation_id, "PROJECT_NOT_FOUND", "未找到Project", "not_found");
        const now = this.#now(), mutation = executeSkillInvocation(transaction, command, { project, actorId: command.actor_id, now, id: this.#id }, this.#runVerifier);
        const event = this.#appendEvent(transaction, { ...mutation, project_id: project.id, aggregate_revision: mutation.revision, actor_id: command.actor_id, command, occurred_at: now });
        return this.#success(command, mutation.aggregate, mutation.revision, [event], mutation.data);
      }
      case "RegisterProvider": {
        const loaded = this.#requireProjectActor(transaction, command);
        if ("code" in loaded) return loaded;
        const now = this.#now(), mutation = registerProvider(transaction, command, { ...loaded, now, id: this.#id });
        const event = this.#appendEvent(transaction, { ...mutation, project_id: loaded.project.id, aggregate_revision: mutation.revision,
          actor_id: loaded.actorId, command, occurred_at: now });
        return this.#success(command, mutation.aggregate, mutation.revision, [event], mutation.data);
      }
      case "RecordProviderEvidence": case "EvaluateProvider": case "RegisterProviderBinding": {
        const loaded = this.#requireProjectActor(transaction, command);
        if ("code" in loaded) return loaded;
        const now = this.#now(), mutation = executeProviderAssessment(transaction, command, { ...loaded, now, id: this.#id }, this.#providerVerifier);
        const event = this.#appendEvent(transaction, { ...mutation, project_id: loaded.project.id, aggregate_revision: mutation.revision,
          actor_id: loaded.actorId, command, occurred_at: now });
        return this.#success(command, mutation.aggregate, mutation.revision, [event], mutation.data);
      }
      case "PrepareRunContext": case "ReserveRun": case "RecordRunObservation": case "ReconcileRun": case "CancelRun": case "SaveHandoff": case "CheckResumption": {
        const project = transaction.getProject(command.project_id);
        if (!project) return domainError(command.correlation_id, "PROJECT_NOT_FOUND", "未找到Project", "not_found");
        const now = this.#now(), mutation = executeRun(transaction, command, { project, actorId: command.actor_id, now, id: this.#id }, this.#runVerifier);
        const event = this.#appendEvent(transaction, { ...mutation, project_id: project.id, aggregate_revision: mutation.revision, actor_id: command.actor_id, command, occurred_at: now });
        return this.#success(command, mutation.aggregate, mutation.revision, [event], mutation.data);
      }
      case "InitializeProject":
        return this.#initializeProject(transaction, command);
      case "CreateChange":
        return this.#createChange(transaction, command);
      case "PauseChange":
        return this.#pauseChange(transaction, command, legacy);
      case "ResumeChange":
        return this.#resumeChange(transaction, command, legacy);
      case "InitializePlanTasks": case "PublishStandingAuthorization": case "RevokeStandingAuthorization": case "CreateWorkItem": case "RevokeWorkItem": {
        const project = transaction.getProject(command.project_id);
        if (!project) return domainError(command.correlation_id, "PROJECT_NOT_FOUND", "未找到Project", "not_found");
        const now = this.#now(), mutation = executeExecution(transaction, command, { project, actorId: command.actor_id, now, id: this.#id });
        const event = this.#appendEvent(transaction, { ...mutation, project_id: project.id, aggregate_revision: mutation.revision, actor_id: command.actor_id, command, occurred_at: now });
        return this.#success(command, mutation.aggregate, mutation.revision, [event], mutation.data);
      }
      case "CaptureSourceSnapshot": case "RecordEvidence": case "PrepareTaskEvaluation": case "EvaluateTask": case "SatisfyTask":
      case "EvaluateIntegration": case "MarkReadyForIntegration": {
        const project = transaction.getProject(command.project_id);
        if (!project) return domainError(command.correlation_id, "PROJECT_NOT_FOUND", "未找到Project", "not_found");
        const now = this.#now(), mutation = executeVerification(transaction, command, { project, actorId: command.actor_id, now, id: this.#id }, this.#evidenceVerifier);
        const event = this.#appendEvent(transaction, { ...mutation, project_id: project.id, aggregate_revision: mutation.revision, actor_id: command.actor_id, command, occurred_at: now });
        return this.#success(command, mutation.aggregate, mutation.revision, [event], mutation.data);
      }
      case "SubmitContractProposal": case "SubmitPlanProposal": case "RecordRiskAssessment": case "RequestDecision":
      case "RecordDecision": case "ConfirmContract": case "ConfirmPlan": {
        const project = transaction.getProject(command.project_id);
        if (!project) return domainError(command.correlation_id, "PROJECT_NOT_FOUND", "未找到Project", "not_found");
        const now = this.#now(), context = { project, actorId: command.actor_id, now, id: this.#id };
        const isReview = command.command_type === "RequestDecision" ? professionalAction(command.payload.action) : command.command_type === "RecordDecision" &&
          professionalAction(transaction.getIntentRecord("decision_request", command.payload.request_id)?.action ?? "confirm_contract");
        const mutation = isReview && (command.command_type === "RequestDecision" || command.command_type === "RecordDecision") ? executeReview(transaction, command, context, this.#evidenceVerifier) : executeIntent(transaction, command, context, this.#evidenceVerifier);
        const event = this.#appendEvent(transaction, { ...mutation, project_id: project.id, aggregate_revision: mutation.revision, actor_id: command.actor_id, command, occurred_at: now });
        return this.#success(command, mutation.aggregate, mutation.revision, [event], mutation.data);
      }
      case "RegisterActor": case "AssignResponsibility": case "EndAssignment": case "TransferChangeResponsibility": {
        const loaded = this.#requireProjectActor(transaction, command);
        if ("code" in loaded) return loaded;
        const now = this.#now();
        const mutation = executeGovernance(transaction, command, { ...loaded, now, id: this.#id });
        if ("code" in mutation) return mutation;
        const event = this.#appendEvent(transaction, { ...mutation, project_id: loaded.project.id, aggregate_revision: mutation.revision,
          actor_id: loaded.actorId, command, occurred_at: now });
        return this.#success(command, mutation.aggregate, mutation.revision, [event], mutation.data);
      }
      case "UpdateProjectSettings": case "CreateTargetVersion": case "CloseTargetVersion": case "ChangePlanning": case "StartChange": {
        const project = transaction.getProject(command.project_id);
        if (!project) return domainError(command.correlation_id, "PROJECT_NOT_FOUND", "未找到指定 Project", "not_found");
        const now = this.#now(), mutation = executeFlow(transaction, command, { project, actorId: command.actor_id, now, id: this.#id });
        if ("code" in mutation) return mutation;
        const event = this.#appendEvent(transaction, { ...mutation, project_id: project.id, aggregate_revision: mutation.revision,
          actor_id: command.actor_id, command, occurred_at: now });
        return this.#success(command, mutation.aggregate, mutation.revision, [event], mutation.data);
      }
    }
  }

  #initializeProject(transaction: StoreTransaction, command: InitializeProjectCommand): CurrentKernelResult {
    if (command.source.origin !== "human_cli") return domainError(command.correlation_id, "ROLE_NOT_ASSIGNED", "初始化需要本地 Human 操作者", "forbidden");
    if (transaction.getCurrentProject()) {
      return domainError(
        command.correlation_id,
        "PROJECT_ALREADY_INITIALIZED",
        "当前仓库已经初始化 CimiLoop Project",
        "conflict"
      );
    }

    const now = this.#now();
    const projectId = this.#id();
    const actorId = this.#id();
    const roleId = this.#id();
    const assignmentId = this.#id();
    const instanceId = this.#id();
    const project: Project = {
      schema_version: SCHEMA_VERSION,
      id: projectId,
      name: command.payload.name,
      repository_kind: command.payload.repository_kind,
      repository_path: command.payload.repository_path,
      instance_id: instanceId,
      created_at: now, updated_at: now,
      revision: 1
    };
    const actor: Actor = {
      schema_version: SCHEMA_VERSION,
      id: actorId,
      project_id: projectId, actor_type: "human",
      display_name: command.payload.owner_name,
      ...(command.payload.owner_email ? { email: command.payload.owner_email } : {}),
      identity_source: "local_operator",
      created_at: now, updated_at: now,
      revision: 1
    };
    const role: Role = {
      schema_version: SCHEMA_VERSION,
      id: roleId,
      project_id: projectId, role_key: "project_owner",
      display_name: "项目负责人",
      created_at: now, updated_at: now,
      revision: 1
    };
    const assignment: Assignment = {
      schema_version: SCHEMA_VERSION,
      id: assignmentId,
      project_id: projectId,
      actor_id: actorId,
      role_id: roleId,
      scope: { kind: "project", id: projectId }, role_key: "project_owner", granted_by: actorId,
      effective_at: now,
      created_at: now, updated_at: now,
      revision: 1
    };

    transaction.insertProject(project);
    transaction.insertActor(actor);
    transaction.insertRole(role);
    transaction.insertAssignment(assignment);
    const event = this.#appendEvent(transaction, {
      event_type: "ProjectInitialized",
      project_id: projectId,
      aggregate: { object_type: "project", id: projectId },
      aggregate_revision: 1,
      actor_id: actorId,
      command,
      payload: { project_name: project.name, repository_kind: project.repository_kind },
      occurred_at: now
    });
    return this.#success(command, { object_type: "project", id: projectId }, 1, [event], {
      project,
      actor,
      assignment
    });
  }

  #createChange(transaction: StoreTransaction, command: Extract<AnyCommand, { command_type: "CreateChange" }>): CurrentKernelResult {
    const context = this.#requireProjectActor(transaction, command);
    if ("code" in context) return context;
    if (command.payload.target_version_id) {
      const qualified = requireFlowOwner(transaction, { ...command, acting_role: "flow_owner" }, { ...context, now: this.#now(), id: this.#id });
      if ("code" in qualified) return qualified;
      const target = transaction.getTargetVersion(command.payload.target_version_id);
      if (!target || target.project_id !== context.project.id) return domainError(command.correlation_id, "TARGET_VERSION_NOT_FOUND", "目标版本不属于当前 Project", "not_found");
      if (target.status === "closed") return domainError(command.correlation_id, "TARGET_VERSION_CLOSED", "不能纳入已关闭目标版本", "conflict");
    }
    if (command.payload.requirement_owner_actor_id) {
      const actor = transaction.getActor(command.payload.requirement_owner_actor_id);
      if (!actor || actor.project_id !== context.project.id) return domainError(command.correlation_id, "ACTOR_NOT_FOUND", "需求责任人未在当前 Project 注册", "not_found");
      if (actor.actor_type !== "human") return domainError(command.correlation_id, "HUMAN_RESPONSIBILITY_REQUIRED", "需求责任须由 Human Actor 承担", "forbidden");
    }
    const now = this.#now();
    const change = createDraftChange({
      id: this.#id(),
      projectId: context.project.id,
      displayKey: transaction.nextChangeDisplayKey(context.project.id),
      title: command.payload.title,
      ownerActorId: context.actorId,
      source: command.source,
      now
    });
    if (command.payload.kind) change.kind = command.payload.kind;
    if (command.payload.requirement_owner_actor_id) change.requirement_owner_actor_id = command.payload.requirement_owner_actor_id;
    if (command.payload.target_version_id) change.target_version_id = command.payload.target_version_id;
    transaction.insertChange(change);
    const ownerAssignment = newAssignment({ ...context, now, id: this.#id }, {
      actor_id: context.actorId, role_key: "change_owner", scope: { kind: "change", id: change.id }
    });
    transaction.insertAssignment(ownerAssignment);
    const requirementAssignment = change.requirement_owner_actor_id ? newAssignment({ ...context, now, id: this.#id }, {
      actor_id: change.requirement_owner_actor_id, role_key: "requirement_owner", scope: { kind: "change", id: change.id }
    }) : undefined;
    if (requirementAssignment) transaction.insertAssignment(requirementAssignment);
    const event = this.#appendEvent(transaction, {
      event_type: "ChangeCreated",
      project_id: context.project.id,
      aggregate: { object_type: "change", id: change.id },
      aggregate_revision: 1,
      actor_id: context.actorId,
      command,
      payload: { display_key: change.display_key, lifecycle_state: change.lifecycle_state, owner_assignment: ownerAssignment,
        ...(requirementAssignment ? { requirement_assignment: requirementAssignment } : {}) },
      occurred_at: now
    });
    return this.#success(command, { object_type: "change", id: change.id }, 1, [event], { change });
  }

  #pauseChange(transaction: StoreTransaction, command: Extract<AnyCommand, { command_type: "PauseChange" }>, legacy: boolean): CurrentKernelResult {
    const loaded = this.#requireChangeContext(transaction, command, legacy);
    if ("code" in loaded) return loaded;
    if (loaded.change.operating_status === "Paused") {
      return domainError(command.correlation_id, "CHANGE_ALREADY_PAUSED", "Change 已处于暂停状态", "conflict");
    }
    const now = this.#now();
    const mutation = pauseDraftChange(loaded.change, command.payload.reason, {
      now,
      actorId: loaded.actorId, actingRole: command.acting_role,
      commandId: command.command_id,
      id: this.#id
    });
    transaction.updateChange(mutation.change, loaded.expectedRevision);
    transaction.insertTransition(mutation.transition);
    const event = this.#appendEvent(transaction, {
      event_type: "ChangePaused",
      project_id: loaded.project.id,
      aggregate: { object_type: "change", id: mutation.change.id },
      aggregate_revision: mutation.change.revision,
      actor_id: loaded.actorId,
      command,
      payload: { reason: command.payload.reason },
      occurred_at: now
    });
    return this.#success(command, event.aggregate, mutation.change.revision, [event], { change: mutation.change });
  }

  #resumeChange(transaction: StoreTransaction, command: Extract<AnyCommand, { command_type: "ResumeChange" }>, legacy: boolean): CurrentKernelResult {
    const loaded = this.#requireChangeContext(transaction, command, legacy);
    if ("code" in loaded) return loaded;
    if (loaded.change.operating_status !== "Paused") {
      return domainError(command.correlation_id, "CHANGE_NOT_PAUSED", "Change 当前未暂停", "conflict");
    }
    if (loaded.change.lifecycle_state !== "Draft") {
      if (["Executing", "ReadyForDelivery"].includes(loaded.change.lifecycle_state)) {
        const settings = loadSettings(transaction, loaded.project);
        if (!settings) return domainError(command.correlation_id, "PROJECT_SETTINGS_REQUIRED", "恢复在制需求前须明确容量", "conflict");
        const capacity = checkWipCapacity(transaction, loaded.project.id, settings.settings.wip_limit, command.correlation_id);
        if (capacity) return capacity;
      }
      if (!["IntentReady", "Executing"].includes(loaded.change.lifecycle_state)) return domainError(command.correlation_id, "CAPABILITY_UNAVAILABLE", "此交付阶段恢复须由后续交付能力核对", "conflict");
      const admission = admissionFailure(transaction, command, loaded.change); if (admission) return admission;
      const resumption = verifyChangeResumption(transaction, command, loaded.project, this.#now(), this.#runVerifier); if (resumption) return resumption;
    }
    const now = this.#now();
    const mutation = resumeDraftChange(loaded.change, {
      now,
      actorId: loaded.actorId, actingRole: command.acting_role,
      commandId: command.command_id,
      id: this.#id
    });
    transaction.updateChange(mutation.change, loaded.expectedRevision);
    transaction.insertTransition(mutation.transition);
    const event = this.#appendEvent(transaction, {
      event_type: "ChangeResumed",
      project_id: loaded.project.id,
      aggregate: { object_type: "change", id: mutation.change.id },
      aggregate_revision: mutation.change.revision,
      actor_id: loaded.actorId,
      command,
      payload: command.payload.reconciliation_refs ? { reconciliation_refs: command.payload.reconciliation_refs } : {},
      occurred_at: now
    });
    return this.#success(command, event.aggregate, mutation.change.revision, [event], { change: mutation.change });
  }

  #requireProjectActor(
    transaction: StoreTransaction,
    command: Exclude<AnyCommand, InitializeProjectCommand>
  ): { project: Project; actorId: InternalId } | DomainError {
    if (!command.project_id || !command.actor_id) {
      return domainError(
        command.correlation_id,
        "COMMAND_CONTEXT_REQUIRED",
        "命令必须包含 project_id 与 actor_id",
        "validation"
      );
    }
    const project = transaction.getProject(command.project_id);
    if (!project) {
      return domainError(command.correlation_id, "PROJECT_NOT_FOUND", "未找到指定 Project", "not_found");
    }
    const actor = transaction.getActor(command.actor_id);
    if (!actor || actor.project_id !== project.id || actor.actor_type !== "human" || command.acting_role !== "project_owner") {
      return domainError(command.correlation_id, "ROLE_NOT_ASSIGNED", "基础命令需要现有 Human Project Owner 指派", "forbidden");
    }
    const now = this.#now();
    const assigned = resolveAssignment(transaction.listAssignments(actor.id), { projectId: project.id, actorId: actor.id,
      role: "project_owner", scope: { kind: "project", id: project.id }, now });
    if (!assigned) return domainError(command.correlation_id, "ROLE_NOT_ASSIGNED", "Project Owner 指派未生效或已结束", "forbidden");
    return { project, actorId: command.actor_id };
  }

  #requireChangeContext(
    transaction: StoreTransaction,
    command: Extract<AnyCommand, { command_type: "PauseChange" | "ResumeChange" }>,
    legacy: boolean
  ): { project: Project; actorId: InternalId; change: Change; expectedRevision: number } | DomainError {
    const project = transaction.getProject(command.project_id);
    if (!project) return domainError(command.correlation_id, "PROJECT_NOT_FOUND", "未找到指定 Project", "not_found");
    const context = { project, actorId: command.actor_id };
    if (!command.target || command.target.object_type !== "change" || command.expected_revision === undefined) {
      return domainError(
        command.correlation_id,
        "CHANGE_TARGET_REQUIRED",
        "修改 Change 必须提供目标和 expected_revision",
        "validation"
      );
    }
    const change = transaction.getChange(command.target.id);
    if (!change || change.project_id !== context.project.id) {
      return domainError(command.correlation_id, "CHANGE_NOT_FOUND", "未找到指定 Change", "not_found");
    }
    if (change.revision !== command.expected_revision) return domainError(command.correlation_id, "REVISION_CONFLICT", "目标对象已被其他命令修改，请刷新后重试", "conflict", false, { current_revision: change.revision });
    if (legacy) {
      const assigned = this.#requireProjectActor(transaction, command);
      if ("code" in assigned) return assigned;
    } else if (transaction.getActor(context.actorId)?.actor_type !== "human" || command.acting_role !== "change_owner" ||
      !resolveAssignment(transaction.listAssignments(context.actorId), { projectId: project.id, actorId: context.actorId,
        role: "change_owner", scope: { kind: "change", id: change.id }, now: this.#now() })) {
      return domainError(command.correlation_id, "ROLE_NOT_ASSIGNED", "需要此 Change 当前有效的 Human Change Owner 指派", "forbidden");
    }
    if (legacy && change.lifecycle_state !== "Draft") return domainError(command.correlation_id, "CAPABILITY_UNAVAILABLE", "旧命令只支持 Draft 暂停和恢复", "validation");
    if (["Completed", "Terminated"].includes(change.lifecycle_state)) return domainError(command.correlation_id, "CHANGE_STATE_INVALID", "已关闭 Change 不再暂停或恢复", "conflict");
    if (change.owner_actor_id !== context.actorId) {
      return domainError(command.correlation_id, "CHANGE_OWNER_REQUIRED", "只有当前 Change Owner 可以执行该操作", "forbidden");
    }
    return { ...context, change, expectedRevision: command.expected_revision };
  }

  #appendEvent(
    transaction: StoreTransaction,
    input: {
      event_type: string;
      project_id: InternalId;
      aggregate: ProposedEvent["aggregate"];
      aggregate_revision: number;
      actor_id: InternalId;
      command: AnyCommand;
      payload: Record<string, unknown>;
      occurred_at: string;
    }
  ): EventEnvelope {
    const event = transaction.appendEvent({
      acting_role: input.command.command_type === "InitializeProject" ? "project_owner" : input.command.acting_role,
      event_id: this.#id(),
      event_type: input.event_type,
      project_id: input.project_id,
      aggregate: input.aggregate,
      aggregate_revision: input.aggregate_revision,
      occurred_at: input.occurred_at,
      actor_id: input.actor_id,
      command_id: input.command.command_id,
      correlation_id: input.command.correlation_id,
      payload: input.payload
    } as ProposedEvent);
    const outbox: OutboxMessage = {
      schema_version: SCHEMA_VERSION,
      id: this.#id(),
      project_id: input.project_id,
      event_id: event.event_id,
      effect_key: "event_delivery", kind: "event_delivery", target_ref: { object_type: "event", id: event.event_id },
      status: "pending",
      attempt_count: 0,
      available_at: input.occurred_at,
      created_at: input.occurred_at
    };
    transaction.enqueueOutbox(outbox);
    return event;
  }

  #success(
    command: AnyCommand,
    aggregate: CommandSuccess["aggregate"],
    revision: number,
    events: EventEnvelope[],
    data: CommandSuccess["data"]
  ): CommandSuccess {
    return parseCommandSuccess({
      schema_version: SCHEMA_VERSION, command_type: command.command_type,
      ok: true,
      command_id: command.command_id,
      correlation_id: command.correlation_id,
      aggregate,
      revision,
      events,
      data
    });
  }
}
