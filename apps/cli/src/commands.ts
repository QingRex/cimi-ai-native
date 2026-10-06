import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CimiLoopKernel } from "@cimiloop/kernel";
import {
  SCHEMA_VERSION, parseMigrationReport, compileValidator, GovernanceListResultSchema, FlowStatusResultSchema, IntentShowResultSchema,
  createInternalId,
  parseChangeListResult,
  parseChangeShowResult,
  parseDoctorResult,
  ExecutionShowResultSchema, type InternalId, type ActingRole
} from "@cimiloop/protocol/v2";
import { VerificationShowResultSchema } from "@cimiloop/protocol/v2";
import { LocalEvidenceVerifier } from "./evidence-local.js";
import { LocalRunVerifier } from "./runs-local.js";
import { LocalProviderVerifier } from "./providers-local.js";
import { openLocalProject } from "@cimiloop/local-app";
import { RunShowResultSchema, ProviderCatalogResultSchema } from "@cimiloop/protocol/v2";
import { MigrationRunner, SqliteProjectRegistry, SqliteProjectStore } from "@cimiloop/store-sqlite";
import { parseVersionedCommandResult } from "@cimiloop/protocol";
import { readInstance, writeInstance } from "./instance.js";
import { locateProject, readGitIdentity, registryDatabasePath } from "./location.js";
import { CliInputError, readJsonObject, targetNotFound, importInputFile } from "./input.js";
import { isDomainError, outputError, outputJson, outputObject } from "./output.js";

export interface GlobalOptions {
  json?: boolean;
  projectDir?: string;
  commandId?: string;
  actingRole?: ActingRole;
}

export const inspectObject = (kind: string, id: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const result = context.kernel.getObject(kind, id);
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    outputObject(result, Boolean(options.json));
  } finally { context.store.close(); }
};

interface InitOptions extends GlobalOptions {
  name?: string;
  ownerName?: string;
  ownerEmail?: string;
  yes?: boolean;
}

const receiptVersion = (store: SqliteProjectStore, commandId?: string) => {
  const receipt = commandId ? store.transaction(tx => tx.getCommandReceipt(commandId)) : undefined;
  return receipt && !("schema_version" in receipt.result) ? "1.0.0" : SCHEMA_VERSION;
};
const now = (): string => new Date().toISOString();

const source = (repositoryPath: string) => ({
  origin: "human_cli" as const,
  producer: "cimiloop-cli",
  repository_path: repositoryPath
});

const commandIdentity = (options: GlobalOptions): { commandId: InternalId; correlationId: InternalId } => ({
  commandId: options.commandId as InternalId | undefined ?? createInternalId(),
  correlationId: createInternalId()
});

const confirmIdentity = async (
  suggestedName: string | undefined,
  suggestedEmail: string | undefined,
  options: InitOptions
): Promise<{ name: string; email?: string }> => {
  if (options.ownerName) {
    return { name: options.ownerName, ...(options.ownerEmail ? { email: options.ownerEmail } : {}) };
  }
  if (options.yes) {
    if (!suggestedName) throw new CliInputError("非交互初始化必须提供 --owner-name，或配置 Git user.name");
    return { name: suggestedName, ...(suggestedEmail ? { email: suggestedEmail } : {}) };
  }
  if (options.json) throw new CliInputError("--json 初始化须提供 --owner-name 或 --yes，避免交互提示混入机器输出");
  if (!stdin.isTTY) {
    throw new CliInputError("非交互初始化需要 --yes 和明确的 Owner 信息");
  }

  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const name = (await prompt.question(`Owner 名称${suggestedName ? ` [${suggestedName}]` : ""}: `)).trim() || suggestedName;
    if (!name) throw new CliInputError("Owner 名称不能为空");
    const email =
      (await prompt.question(`Owner 邮箱${suggestedEmail ? ` [${suggestedEmail}]` : "（可选）"}: `)).trim() ||
      suggestedEmail;
    const confirmation = (await prompt.question(`确认使用 ${name}${email ? ` <${email}>` : ""}？[Y/n] `)).trim();
    if (confirmation && !/^y(es)?$/i.test(confirmation)) throw new CliInputError("初始化已取消");
    return { name, ...(email ? { email } : {}) };
  } finally {
    prompt.close();
  }
};

export const initProject = async (options: InitOptions): Promise<void> => {
  const start = options.projectDir ? resolve(options.projectDir) : process.cwd();
  const location = locateProject(start, Boolean(options.projectDir));
  const identity = readGitIdentity(location.repositoryPath);
  const owner = await confirmIdentity(identity.name, identity.email, options);
  mkdirSync(location.dataDirectory, { recursive: true });
  const store = new SqliteProjectStore(location.databasePath);
  const instance = existsSync(location.instancePath) ? readInstance(location.instancePath) : undefined;
  const kernel = new CimiLoopKernel({ store, caller: instance ? { kind: "local_operator", project_id: instance.project_id,
    actor_id: instance.actor_id } : { kind: "bootstrap" } });
  try {
    const ids = commandIdentity(options);
    const command = {
      schema_version: receiptVersion(store, options.commandId),
      command_id: ids.commandId,
      correlation_id: ids.correlationId,
      command_type: "InitializeProject",
      requested_at: now(),
      source: source(location.repositoryPath),
      payload: {
        name: options.name ?? location.suggestedName,
        repository_kind: location.repositoryKind,
        repository_path: location.repositoryPath,
        owner_name: owner.name,
        ...(owner.email ? { owner_email: owner.email } : {})
      }
    };
    const result = kernel.execute(command);
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (!("project" in result.data) || !("actor" in result.data) ||
      ("command_type" in result && result.command_type !== "InitializeProject")) throw new Error("初始化命令返回了非 Project 结果");
    const project = result.data.project;
    const actor = result.data.actor;
    writeInstance(location.instancePath, {
      schema_version: "1.0.0",
      instance_id: project.instance_id,
      project_id: project.id,
      actor_id: actor.id,
      created_at: command.requested_at
    });
    const registry = new SqliteProjectRegistry(registryDatabasePath());
    try {
      registry.register({
        project_id: project.id,
        repository_path: location.repositoryPath,
        database_path: location.databasePath,
        last_opened_at: now()
      });
    } finally {
      registry.close();
    }
    if (options.json) outputJson(result, parseVersionedCommandResult);
    else {
      stdout.write(`CimiLoop Project 已初始化：${project.name}\n`);
      stdout.write(`Project ID：${project.id}\n`);
      stdout.write(`Project Owner：${actor.display_name}\n`);
    }
  } finally {
    store.close();
  }
};

const openProject = (options: GlobalOptions) => openLocalProject(options);

export const createChange = (title: string, options: GlobalOptions & { kind?: string; requirementOwner?: string; targetVersion?: string }): void => {
  const context = openProject(options);
  try {
    const ids = commandIdentity(options);
    const result = context.kernel.execute({
      schema_version: receiptVersion(context.store, options.commandId),
      command_id: ids.commandId,
      correlation_id: ids.correlationId,
      command_type: "CreateChange",
      requested_at: now(),
      project_id: context.instance.project_id,
      actor_id: context.instance.actor_id,
      ...(receiptVersion(context.store, options.commandId) === SCHEMA_VERSION ? { acting_role: options.actingRole ?? "project_owner" } : {}),
      source: source(context.location.repositoryPath),
      payload: { title, ...(options.kind ? { kind: options.kind } : {}),
        ...(options.targetVersion ? { target_version_id: options.targetVersion } : {}),
        ...(options.requirementOwner ? { requirement_owner_actor_id: options.requirementOwner } : {}) }
    });
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (!("change" in result.data)) throw new Error("创建命令返回了非 Change 结果");
    const change = result.data.change;
    if (options.json) outputJson(result, parseVersionedCommandResult);
    else stdout.write(`已创建 ${change.display_key}：${change.title}\nInternal ID：${change.id}\n`);
  } finally {
    context.store.close();
  }
};

export const listChanges = (options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const result = context.kernel.getChangeList();
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    const changes = result.changes;
    if (options.json) return outputJson(result, parseChangeListResult);
    if (changes.length === 0) return void stdout.write("当前 Project 暂无 Change。\n");
    for (const change of changes) {
      stdout.write(`${change.display_key}\t${change.lifecycle_state}\t${change.operating_status}\t${change.title}\n`);
    }
  } finally {
    context.store.close();
  }
};

export const showChange = (idOrKey: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const view = context.kernel.getChangeSnapshot(idOrKey);
    if (isDomainError(view)) return outputError(view, Boolean(options.json));
    if (options.json) return outputJson(view, parseChangeShowResult);
    const result = view.change;
    stdout.write(`${result.display_key} ${result.title}\n`);
    stdout.write(`生命周期：${result.lifecycle_state}\n运行状态：${result.operating_status}\nRevision：${result.revision}\n`);
    if ("pause_reason" in result && result.pause_reason) stdout.write(`暂停原因：${result.pause_reason}\n`);
  } finally {
    context.store.close();
  }
};

const transitionChange = (
  commandType: "PauseChange" | "ResumeChange",
  idOrKey: string,
  reason: string | undefined,
  options: GlobalOptions & { expectedRevision?: string; reconciliationFile?: string }
): void => {
  const context = openProject(options);
  try {
    const current = context.kernel.getChange(idOrKey);
    if (isDomainError(current)) return outputError(current, Boolean(options.json));
    const previous = options.commandId ? context.store.transaction(tx => tx.getCommandReceipt(options.commandId!)) : undefined;
    const expectedRevision = options.expectedRevision ? Number(options.expectedRevision) : previous && "revision" in previous.result ? previous.result.revision - 1 : current.revision;
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new CliInputError("expected-revision 必须是正整数");
    const ids = commandIdentity(options);
    const command = {
      schema_version: receiptVersion(context.store, options.commandId),
      command_id: ids.commandId,
      correlation_id: ids.correlationId,
      command_type: commandType,
      requested_at: now(),
      project_id: context.instance.project_id,
      actor_id: context.instance.actor_id,
      ...(receiptVersion(context.store, options.commandId) === SCHEMA_VERSION ? { acting_role: options.actingRole ?? "change_owner" } : {}),
      target: { object_type: "change" as const, id: current.id, ...(receiptVersion(context.store, options.commandId) === "1.0.0" ? { domain_version: 1 } : {}) },
      expected_revision: expectedRevision,
      source: source(context.location.repositoryPath),
      payload: commandType === "PauseChange" ? { reason: reason ?? "" } : options.reconciliationFile ? readJsonObject(options.reconciliationFile) : {}
    };
    const result = context.kernel.execute(command);
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (!("change" in result.data)) throw new Error("状态命令返回了非 Change 结果");
    const change = result.data.change;
    if (options.json) outputJson(result, parseVersionedCommandResult);
    else stdout.write(`${change.display_key} 当前状态：${change.operating_status}（Revision ${change.revision}）\n`);
  } finally {
    context.store.close();
  }
};

export const pauseChange = (
  idOrKey: string,
  reason: string,
  options: GlobalOptions & { expectedRevision?: string }
): void => transitionChange("PauseChange", idOrKey, reason, options);

export const resumeChange = (
  idOrKey: string,
  options: GlobalOptions & { expectedRevision?: string; reconciliationFile?: string }
): void => transitionChange("ResumeChange", idOrKey, undefined, options);

interface GovernanceOptions extends GlobalOptions { expectedRevision?: string; rawFile?: string }
const runGovernance = (commandType: "RegisterProvider" | "RecordProviderEvidence" | "EvaluateProvider" | "RegisterProviderBinding" | "RegisterActor" | "AssignResponsibility" | "EndAssignment" | "TransferChangeResponsibility" |
  "UpdateProjectSettings" | "CreateTargetVersion" | "CloseTargetVersion" | "ChangePlanning" | "StartChange" |
  "SubmitContractProposal" | "SubmitPlanProposal" | "RecordRiskAssessment" | "RequestDecision" | "RecordDecision" | "ConfirmContract" | "ConfirmPlan",
  options: GovernanceOptions, payload: Record<string, unknown>, changeKey?: string): void => {
  const context = openProject(options);
  try {
    const project = context.store.getProject();
    if (!project) throw new Error("Project 缺失");
    if (commandType === "RecordDecision" && options.rawFile) payload.raw_review_ref = importInputFile(options.rawFile, () => new LocalEvidenceVerifier(context.location.repositoryPath, context.location.dataDirectory).importRawResult(resolve(options.rawFile!), "manual_review"));
    const previous = options.commandId ? context.store.transaction(tx => tx.getCommandReceipt(options.commandId!)) : undefined;
    const change = changeKey ? context.kernel.getChange(changeKey) : undefined;
    if (change && isDomainError(change)) return outputError(change, Boolean(options.json));
    const revision = options.expectedRevision ? Number(options.expectedRevision) : previous && "revision" in previous.result
      ? previous.result.revision - (["RecordRiskAssessment", "RequestDecision", "RecordDecision"].includes(commandType) ? 0 : 1) : change?.revision ?? project.revision;
    if (commandType === "SubmitContractProposal" || commandType === "SubmitPlanProposal") {
      const old = previous && "command_type" in previous.result && (previous.result.command_type === "SubmitContractProposal" || previous.result.command_type === "SubmitPlanProposal") ? previous.result.data.proposal : undefined;
      payload.base_version_ref ??= old ? old.base_version_ref : commandType === "SubmitContractProposal" ? change?.contract_ref ?? null : change?.plan_ref ?? null;
    }
    if (commandType === "EndAssignment") {
      const assignment = context.store.listAssignments().find(item => item.id === payload.assignment_id);
      payload.expected_assignment_revision ??= previous && "command_type" in previous.result && previous.result.command_type === "EndAssignment"
        ? previous.result.data.assignment.revision - 1 : assignment?.revision ?? 1;
    }
    if (commandType === "CloseTargetVersion") {
      const target = context.store.getTargetVersion(String(payload.target_version_id));
      payload.expected_target_revision ??= previous && "command_type" in previous.result && previous.result.command_type === "CloseTargetVersion"
        ? previous.result.data.target_version.revision - 1 : target?.revision ?? 1;
    }
    if (commandType === "UpdateProjectSettings") {
      const old = previous && "command_type" in previous.result && previous.result.command_type === "UpdateProjectSettings" ? previous.result.data.settings_version : undefined;
      const current = project.settings_ref ? context.store.getSettingsVersion(project.settings_ref.id) : undefined;
      const defaults = old?.settings ?? current?.settings;
      const supplied = payload.settings as Record<string, unknown>;
      payload.settings = { flow_owner_actor_id: defaults?.flow_owner_actor_id ?? context.instance.actor_id,
        priority_arbiter_actor_id: defaults?.priority_arbiter_actor_id ?? context.instance.actor_id,
        priority_order: defaults?.priority_order ?? "higher_first", check_interval_ms: defaults?.check_interval_ms ?? 60_000, ...supplied };
      payload.base_settings_ref ??= old ? old.predecessor_ref ?? null : project.settings_ref ?? null;
    }
    if (commandType === "TransferChangeResponsibility" && !payload.grant_basis_refs) {
      if (previous && "command_type" in previous.result && previous.result.command_type === "TransferChangeResponsibility") {
        const event = previous.result.events.find(item => item.event_type === "ChangeResponsibilityTransferred");
        if (event?.event_type === "ChangeResponsibilityTransferred") payload.grant_basis_refs = event.payload.grant_basis_refs;
      }
      payload.grant_basis_refs ??= context.store.listAssignments(context.instance.actor_id)
        .filter(item => item.role_key === "project_owner" && item.scope.kind === "project" && item.scope.id === project.id &&
          Date.parse(item.effective_at) <= Date.now() && (!item.expires_at || Date.parse(item.expires_at) > Date.now()) &&
          (!item.ended_at || Date.parse(item.ended_at) > Date.now()))
        .map(item => ({ object_type: "assignment", id: item.id }));
    }
    const ids = commandIdentity(options);
    const conditionSubject = commandType === "RequestDecision" && payload.action === "verify_decision_conditions" ? payload.professional_subject_ref as { id: string } | undefined : undefined;
    const parent = conditionSubject ? context.store.getIntentRecord("decision", conditionSubject.id) : undefined;
    const conditionRole = parent ? context.store.getIntentRecord("decision_request", parent.request_id)?.required_role : undefined;
    const defaultRole = conditionRole ?? (commandType === "SubmitContractProposal" || (commandType === "RequestDecision" && payload.action === "confirm_contract") ? "change_owner" :
      ["SubmitPlanProposal", "RecordRiskAssessment", "ConfirmPlan", "RequestDecision"].includes(commandType) ? "technical_owner" : commandType === "ConfirmContract" ? "requirement_owner" :
      commandType === "RecordDecision" ? context.store.getIntentRecord("decision_request", String(payload.request_id))?.required_role ?? "requirement_owner" :
      ["CreateTargetVersion", "CloseTargetVersion", "ChangePlanning", "StartChange"].includes(commandType) && !payload.arbitration ? "flow_owner" : "project_owner");
    const result = context.kernel.execute({ schema_version: SCHEMA_VERSION, command_type: commandType,
      command_id: ids.commandId, correlation_id: ids.correlationId, requested_at: now(),
      project_id: project.id, actor_id: context.instance.actor_id, acting_role: options.actingRole ?? defaultRole,
      source: source(context.location.repositoryPath), target: change ? { object_type: "change", id: change.id } : { object_type: "project", id: project.id },
      expected_revision: revision, payload });
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseVersionedCommandResult);
    stdout.write(`${commandType} 已完成（Revision ${result.revision}）\n`);
    if ("actor" in result.data) stdout.write(`Actor ID：${result.data.actor.id}\n`);
    if ("descriptor" in result.data) stdout.write(`Provider Descriptor ID：${result.data.descriptor.id}（candidate，尚未授权执行）\n`);
    if ("evidence" in result.data) stdout.write(`Provider Evidence：${result.data.evidence.id}\n`);
    if ("evaluation" in result.data) stdout.write(`Provider Evaluation：${result.data.evaluation.id}\t${result.data.evaluation.outcome}\t${result.data.evaluation.input_digest.value}\n`);
    if ("binding" in result.data) stdout.write(`Provider Binding：${result.data.binding.id}（${result.data.binding.approval?.binding_scope}，Agent执行未启用）\n`);
    if ("assignment" in result.data) stdout.write(`Assignment ID：${result.data.assignment.id}\n`);
    if ("change" in result.data) stdout.write(`Change：${result.data.change.display_key}\n`);
    if ("target_version" in result.data) stdout.write(`Target Version ID：${result.data.target_version.id}\n`);
    if ("settings_version" in result.data) stdout.write(`设置版本：${result.data.settings_version.version}\n`);
    if ("proposal" in result.data) stdout.write(`候选记录：${result.data.proposal.id}\n候选链：${result.data.proposal.proposal_id}\n修订：${result.data.proposal.proposal_revision}\n`);
    if ("risk_assessment" in result.data) stdout.write(`风险判断：${result.data.risk_assessment.id}\n`);
    if ("request" in result.data) stdout.write(`决定请求：${result.data.request.id}\n输入摘要：${result.data.request.input_digest.value}\n`);
    if ("decision" in result.data) stdout.write(`决定：${result.data.decision.id}（${result.data.decision.choice}）\n`);
    if ("contract_version" in result.data) stdout.write(`正式约定：${result.data.contract_version.id}（版本${result.data.contract_version.version}）\n`);
    if ("plan_version" in result.data) stdout.write(`正式计划：${result.data.plan_version.id}（版本${result.data.plan_version.version}）\n`);
  } finally { context.store.close(); }
};

export const registerActor = (options: GovernanceOptions & { type: string; name: string; email?: string;
  provider?: string; resourceType?: string; locator?: string; version?: string }): void => runGovernance("RegisterActor", options, {
  actor_type: options.type, display_name: options.name,
  identity_source: options.type === "human" ? "local_operator" : options.type === "agent" ? "runtime_binding" : "local_service",
  ...(options.email ? { email: options.email } : {}),
  ...(options.type === "agent" ? { provider_identity_ref: { provider: options.provider, resource_type: options.resourceType,
    locator: options.locator, ...(options.version ? { version: options.version } : {}) } } : {})
});
export const registerProvider = (options: GovernanceOptions & { file: string }): void =>
  runGovernance("RegisterProvider", options, readJsonObject(options.file));
export const providerMutation = (kind: "RecordProviderEvidence" | "EvaluateProvider" | "RegisterProviderBinding",
  options: GovernanceOptions & { file: string; probeFile?: string; artifactRoot?: string }): void => {
  const payload = readJsonObject(options.file);
  if (kind === "RecordProviderEvidence" && options.probeFile) {
    const context = openProject(options);
    try { payload.raw_result_ref = importInputFile(options.probeFile, () => new LocalProviderVerifier(context.location.repositoryPath, context.location.dataDirectory)
      .importProbe(resolve(options.probeFile!), resolve(options.artifactRoot ?? context.location.repositoryPath))); }
    finally { context.store.close(); }
  }
  runGovernance(kind, options, payload);
};
export const showProviders = (options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const result = context.kernel.getProviderCatalog();
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, compileValidator(ProviderCatalogResultSchema));
    stdout.write(`Provider 目录（Event ${result.as_of_event_sequence}）\n`);
    for (const check of result.assessment_checks) stdout.write(`Evaluation ${check.evaluation_ref.id}\t${check.profile}\t${check.outcome}\t${check.blockers.join(", ")}\n`);
    for (const descriptor of result.descriptors) {
      const status = result.admission.find(a => a.descriptor_ref.id === descriptor.id)!;
      stdout.write(`${descriptor.id}  ${descriptor.name}@${descriptor.version}  ${descriptor.trust_status}\n  未启用：${status.blockers.join("、")}\n`);
    }
    for (const actor of result.agent_bindings) stdout.write(`Agent ${actor.actor_ref.id}  身份匹配：${actor.identity_matches_binding}\n  未启用：${actor.blockers.join("、")}\n`);
    for (const binding of result.binding_checks) stdout.write(`Binding ${binding.binding_ref.id}\n  未启用：${binding.blockers.join("、")}\n`);
    if (!result.descriptors.length) stdout.write("尚无候选 Provider\n");
  } finally { context.store.close(); }
};
export const assignResponsibility = (options: GovernanceOptions & { actor: string; role: string; scope: string;
  scopeId?: string; effectiveAt?: string; expiresAt?: string }): void => {
  const context = openProject(options);
  let projectId: string;
  try { projectId = context.instance.project_id; } finally { context.store.close(); }
  runGovernance("AssignResponsibility", options, { actor_id: options.actor, role_key: options.role,
    scope: { kind: options.scope, id: options.scopeId ?? (options.scope === "project" ? projectId : "") },
    ...(options.effectiveAt ? { effective_at: options.effectiveAt } : {}), ...(options.expiresAt ? { expires_at: options.expiresAt } : {}) });
};
export const endAssignment = (id: string, options: GovernanceOptions & { reason: string; expectedAssignmentRevision?: string }): void =>
  runGovernance("EndAssignment", options, { assignment_id: id, reason: options.reason,
    ...(options.expectedAssignmentRevision ? { expected_assignment_revision: Number(options.expectedAssignmentRevision) } : {}) });
export const transferResponsibility = (idOrKey: string, options: GovernanceOptions & { role: string; toActor: string;
  reason: string; basis?: string[] }): void => runGovernance("TransferChangeResponsibility", options, {
  role_key: options.role, new_actor_id: options.toActor, reason: options.reason,
  ...(options.basis ? { grant_basis_refs: options.basis.map(id => ({ object_type: "assignment", id })) } : {})
}, idOrKey);
export const listGovernance = (options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const result = context.kernel.getGovernance();
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, compileValidator(GovernanceListResultSchema));
    for (const actor of result.actors) stdout.write(`${actor.id}\t${actor.actor_type}\t${actor.display_name}\n`);
    for (const assignment of result.assignments) stdout.write(`${assignment.id}\t${assignment.role_key}\t${assignment.actor_id}\t${assignment.scope.kind}:${assignment.scope.id}\t${assignment.ended_at ? "已结束" : assignment.expires_at ? `到期 ${assignment.expires_at}` : "持续有效或待生效"}\n`);
  } finally { context.store.close(); }
};

export const updateSettings = (options: GovernanceOptions & { wipLimit: string; flowOwner?: string; priorityArbiter?: string;
  priorityOrder?: string; checkIntervalMs?: string; baseSettingsId?: string; baseSettingsVersion?: string }): void => {
  if (!!options.baseSettingsId !== !!options.baseSettingsVersion) throw new CliInputError("base-settings-id 与 base-settings-version 必须同时提供");
  runGovernance("UpdateProjectSettings", options, { settings: { wip_limit: Number(options.wipLimit),
    ...(options.flowOwner ? { flow_owner_actor_id: options.flowOwner } : {}),
    ...(options.priorityArbiter ? { priority_arbiter_actor_id: options.priorityArbiter } : {}),
    ...(options.priorityOrder ? { priority_order: options.priorityOrder } : {}),
    ...(options.checkIntervalMs ? { check_interval_ms: Number(options.checkIntervalMs) } : {}) },
    ...(options.baseSettingsId ? { base_settings_ref: { object_type: "project_settings_version", id: options.baseSettingsId,
      domain_version: Number(options.baseSettingsVersion) } } : {}) });
};
export const createTargetVersion = (options: GovernanceOptions & { name: string; startsAt?: string; endsAt?: string }): void =>
  runGovernance("CreateTargetVersion", options, { name: options.name,
    ...(options.startsAt || options.endsAt ? { planned_window: { starts_at: options.startsAt, ends_at: options.endsAt } } : {}) });
export const closeTargetVersion = (id: string, options: GovernanceOptions & { reason: string; expectedTargetRevision?: string }): void =>
  runGovernance("CloseTargetVersion", options, { target_version_id: id, reason: options.reason,
    ...(options.expectedTargetRevision ? { expected_target_revision: Number(options.expectedTargetRevision) } : {}) });
export const changePlanning = (idOrKey: string, options: GovernanceOptions & { reason: string; priority?: string; targetVersion?: string;
  clearTargetVersion?: boolean; arbitration?: boolean }): void => {
  if (options.targetVersion && options.clearTargetVersion) throw new CliInputError("target-version 与 clear-target-version 不能同时指定");
  runGovernance("ChangePlanning", options, { reason: options.reason, ...(options.priority !== undefined ? { priority: Number(options.priority) } : {}),
    ...(options.targetVersion ? { target_version_id: options.targetVersion } : options.clearTargetVersion ? { target_version_id: null } : {}),
    ...(options.arbitration ? { arbitration: true } : {}) }, idOrKey);
};
export const startChange = (idOrKey: string, options: GovernanceOptions & { planId: string; planVersion: string; reason: string }): void =>
  runGovernance("StartChange", options, { plan_ref: { object_type: "plan_version", id: options.planId, domain_version: Number(options.planVersion) }, opening_reason: options.reason }, idOrKey);
export const submitIntentProposal = (kind: "contract" | "plan", id: string, options: GovernanceOptions & { file: string; proposalId?: string; expectedProposalRevision?: string; baseId?: string; baseVersion?: string }): void => {
  if (!!options.baseId !== !!options.baseVersion) throw new CliInputError("base-id与base-version须同时提供");
  runGovernance(kind === "contract" ? "SubmitContractProposal" : "SubmitPlanProposal", options, { body: readJsonObject(options.file),
    ...(options.proposalId ? { proposal_id: options.proposalId } : {}), ...(options.expectedProposalRevision !== undefined ? { expected_proposal_revision: Number(options.expectedProposalRevision) } : {}),
    ...(options.baseId ? { base_version_ref: { object_type: `${kind}_version`, id: options.baseId, domain_version: Number(options.baseVersion) } } : {}) }, id);
};
export const assessRisk = (id: string, options: GovernanceOptions & { proposalId: string; proposalRevision: string; level: string; reason: string }): void =>
  runGovernance("RecordRiskAssessment", options, { proposal_ref: { object_type: "contract_proposal", id: options.proposalId, domain_version: Number(options.proposalRevision) }, level: options.level, rationale: options.reason }, id);
export const requestIntentDecision = (id: string, options: GovernanceOptions & { action: string; proposalId: string; proposalRevision: string; proposalKind?: string; subjectKind?: string; subjectId?: string; riskId?: string; expiresAt?: string }): void =>
  runGovernance("RequestDecision", options, { action: options.action, proposal_ref: { object_type: options.proposalKind ?? (options.action === "confirm_plan" ? "plan_proposal" : "contract_proposal"), id: options.proposalId, domain_version: Number(options.proposalRevision) },
    ...(options.subjectKind || options.subjectId ? { professional_subject_ref: { object_type: options.subjectKind, id: options.subjectId } } : {}),
    ...(options.riskId ? { risk_ref: { object_type: "risk_assessment", id: options.riskId } } : {}), ...(options.expiresAt ? { expires_at: options.expiresAt } : {}) }, id);
export const recordIntentDecision = (id: string, options: GovernanceOptions & { requestId: string; inputDigest: string; choice: string; reason: string; condition?: string[] }): void =>
  runGovernance("RecordDecision", options, { request_id: options.requestId, input_digest: { algorithm: "sha256", value: options.inputDigest }, choice: options.choice, reason: options.reason, conditions: options.condition ?? [] }, id);
export const confirmIntent = (kind: "contract" | "plan", id: string, options: GovernanceOptions & { proposalId: string; proposalRevision: string; requestId: string; decisionId: string; inputDigest: string }): void =>
  runGovernance(kind === "contract" ? "ConfirmContract" : "ConfirmPlan", options, { proposal_ref: { object_type: `${kind}_proposal`, id: options.proposalId, domain_version: Number(options.proposalRevision) },
    decision_request_ref: { object_type: "decision_request", id: options.requestId }, decision_ref: { object_type: "decision", id: options.decisionId }, input_digest: { algorithm: "sha256", value: options.inputDigest } }, id);
export const showIntent = (id: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const result = context.kernel.getIntent(id); if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, compileValidator(IntentShowResultSchema));
    stdout.write(`${result.change.display_key} ${result.change.lifecycle_state}（Revision ${result.change.revision}）\n`);
    for (const version of result.contract_versions) stdout.write(`Contract ${version.version}\t${version.id}\n`);
    for (const version of result.plan_versions) stdout.write(`Plan ${version.version}\t${version.id}\n`);
    for (const proposal of [...result.contract_proposals, ...result.plan_proposals]) stdout.write(`候选 ${proposal.id}\t链 ${proposal.proposal_id}\t修订 ${proposal.proposal_revision}\n`);
    for (const risk of result.risk_assessments) stdout.write(`风险判断 ${risk.id}\t${risk.level}\t${risk.rationale}\n`);
    for (const item of result.decision_requests) stdout.write(`${item.request.id}\t${item.request.action}\t${item.status}\t${item.request.required_role}\t${item.request.input_digest.value}\n`);
    for (const decision of result.decisions) stdout.write(`决定 ${decision.id}\t${decision.choice}\t${decision.reason}\t条件：${decision.conditions.join("；") || "无"}\n`);
  } finally { context.store.close(); }
};
export const executionMutation = (kind: "InitializePlanTasks" | "PublishStandingAuthorization" | "RevokeStandingAuthorization" | "CreateWorkItem" | "RevokeWorkItem", id: string | undefined,
  options: GovernanceOptions & { file?: string; planId?: string; planVersion?: string; reason?: string }): void => {
  const context = openProject(options);
  try {
    const project = context.store.getProject()!;
    const previous = options.commandId ? context.store.transaction(tx => tx.getCommandReceipt(options.commandId!))?.result : undefined;
    const old = previous && "command_type" in previous && previous.command_type === kind ? previous : undefined;
    const change = kind === "InitializePlanTasks" ? context.kernel.getChange(id!) : undefined;
    if (change && isDomainError(change)) return outputError(change, Boolean(options.json));
    const objectType = kind === "InitializePlanTasks" ? "change" : kind === "CreateWorkItem" ? "task" : kind === "RevokeWorkItem" ? "work_item" : id ? "standing_authorization" : "project";
    const object = objectType === "change" ? change : objectType === "project" ? project : context.store.getExecutionObject(objectType, id!);
    if (!object) return targetNotFound(objectType, id);
    const payload: Record<string, unknown> = kind === "InitializePlanTasks" ? { plan_ref: { object_type: "plan_version", id: options.planId, domain_version: Number(options.planVersion) } } :
      kind === "PublishStandingAuthorization" ? { body: readJsonObject(options.file!), base_version_ref: old?.command_type === "PublishStandingAuthorization" ? old.data.authorization_version.predecessor_ref ?? null : "current_version_ref" in object ? object.current_version_ref : null } :
      kind === "CreateWorkItem" ? readJsonObject(options.file!) : { reason: options.reason };
    const revision = options.expectedRevision ? Number(options.expectedRevision) : old?.command_type === "PublishStandingAuthorization" && objectType === "project" ? old.data.authorization_version.source_project_revision : old ? old.revision - 1 : object.revision;
    const ids = commandIdentity(options), defaultRole = kind.includes("StandingAuthorization") ? "policy_owner" : payload.standing_authorization_ref ? "executor" : "technical_owner";
    const result = context.kernel.execute({ schema_version: SCHEMA_VERSION, command_id: ids.commandId, correlation_id: ids.correlationId, command_type: kind,
      requested_at: now(), source: source(context.location.repositoryPath), project_id: project.id, actor_id: context.instance.actor_id, acting_role: options.actingRole ?? defaultRole,
      target: { object_type: objectType, id: object.id }, expected_revision: revision, payload });
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseVersionedCommandResult);
    stdout.write(`${kind} 已完成（Revision ${result.revision}）\n`);
    if ("tasks" in result.data) for (const task of result.data.tasks) stdout.write(`Task：${task.id}\t${task.status}\n`);
    if ("work_item" in result.data) stdout.write(`WorkItem：${result.data.work_item.id}\t${result.data.work_item.status}\n`);
    if ("authorization" in result.data) stdout.write(`Authorization：${result.data.authorization.id}\n`);
    if ("authorization_version" in result.data) stdout.write(`精确授权版本：${result.data.authorization_version.id}\t${result.data.authorization_version.version}\n`);
  } finally { context.store.close(); }
};
export const showExecution = (mode: "task" | "work_item" | "authorization", change: string | undefined, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const result = context.kernel.getExecution(change); if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, compileValidator(ExecutionShowResultSchema));
    if (mode === "task") for (const task of result.tasks) { const readiness = result.readiness.find(item => item.task_id === task.id)!;
      stdout.write(`${task.id}\t${task.status}\t授权准入：${readiness.ready ? "满足" : readiness.reasons.join("、")}\t累计尝试 ${task.usage.attempts_consumed}\t用量摘要 ${readiness.usage_digest.value}\n`); }
    else if (mode === "work_item") for (const item of result.work_items) stdout.write(`${item.id}\t${item.status}\tTask ${item.task_id}\tExecutor ${item.executor_ref.id}\n`);
    else for (const item of result.authorizations) stdout.write(`${item.id}\t${item.status}\t版本 ${item.current_version_ref.domain_version}\t${item.current_version_ref.id}\n`);
  } finally { context.store.close(); }
};
export type VerificationCommandType = "CaptureSourceSnapshot" | "RecordEvidence" | "PrepareTaskEvaluation" | "EvaluateTask" | "SatisfyTask" | "EvaluateIntegration" | "MarkReadyForIntegration";
export type RunCommandType = "PrepareRunContext" | "ReserveRun" | "RecordRunObservation" | "ReconcileRun" | "CancelRun" | "SaveHandoff" | "CheckResumption";
export const runMutation = (kind: RunCommandType, id: string, options: GovernanceOptions & { file: string; rawFile?: string }): void => {
  const context = openProject(options);
  try {
    const project = context.store.getProject()!, objectType = kind === "ReserveRun" ? "task" : ["RecordRunObservation", "ReconcileRun", "CancelRun"].includes(kind) ? "run" : "work_item";
    const object = objectType === "run" ? context.store.getRun(id) : context.store.getExecutionObject(objectType, id);
    if (!object) return targetNotFound(objectType, id);
    const payload: Record<string, unknown> = readJsonObject(options.file);
    if ((kind === "RecordRunObservation" || kind === "ReconcileRun") && options.rawFile) payload.raw_result_ref = importInputFile(options.rawFile, () => new LocalEvidenceVerifier(context.location.repositoryPath, context.location.dataDirectory).importRawResult(resolve(options.rawFile!), "manual_run"));
    const receipt = options.commandId ? context.store.transaction(tx => tx.getCommandReceipt(options.commandId!))?.result : undefined;
    const old = receipt && "command_type" in receipt && receipt.command_type === kind ? receipt : undefined;
    const increment = ["ReserveRun", "RecordRunObservation", "ReconcileRun", "CancelRun"].includes(kind) ? 1 : 0;
    const revision = options.expectedRevision ? Number(options.expectedRevision) : old ? old.revision - increment : object.revision;
    const ids = commandIdentity(options);
    const result = context.kernel.execute({ schema_version: SCHEMA_VERSION, command_id: ids.commandId, correlation_id: ids.correlationId, requested_at: now(), source: source(context.location.repositoryPath),
      command_type: kind, project_id: project.id, actor_id: context.instance.actor_id, acting_role: options.actingRole ?? (kind === "ReconcileRun" ? "technical_owner" : "executor"),
      target: { object_type: objectType, id: object.id }, expected_revision: revision, payload });
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseVersionedCommandResult);
    stdout.write(`${kind} 已记录（Revision ${result.revision}）\n`);
    if ("run" in result.data) stdout.write(`Run：${result.data.run.id}\t${result.data.run.status}\n`);
    if ("command_type" in result && result.command_type === "PrepareRunContext") stdout.write(`Context：${result.data.context.id}\t输入摘要：${result.data.context.input_digest.value}\n`);
    if ("handoff" in result.data) stdout.write(`Handoff：${result.data.handoff.id}\n`);
    if ("resumption" in result.data) stdout.write(`Resumption：${result.data.resumption.id}\n`);
  } finally { context.store.close(); }
};
export const showRuns = (change: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const result = context.kernel.getRuns(change); if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, compileValidator(RunShowResultSchema));
    for (const run of result.runs) stdout.write(`${run.id}\t${run.status}\tTask ${run.task_id}\t累计费用 ${run.cost_charged_micros}\t费用${run.cost_known ? "已知" : "未知"}\n`);
    stdout.write(`上下文 ${result.contexts.length}；工作区 ${result.workspaces.length}；观测 ${result.observations.length}；交接 ${result.handoffs.length}；接续核验 ${result.resumptions.length}\n`);
    for (const item of result.contexts) stdout.write(`Context ${item.id}\t${item.input_digest.value}\tWorkItem ${item.work_item_ref.id}\n`);
    for (const item of result.workspaces) stdout.write(`工作区 ${item.id}\t${item.state_digest.value}\n`);
    for (const item of result.records) stdout.write(`预约记录 ${item.id}\tRun ${item.run_id}\t操作键 ${item.operation_key}\n`);
    for (const item of result.observations) stdout.write(`观测 ${item.id}\t${item.applicability}\t${item.resulting_status}\tRun ${item.run_ref.id}\n`);
    for (const item of result.handoffs) stdout.write(`交接 ${item.id}\t接续者 ${item.next_actor_ref.id}\n已完成：${item.completed.join("；")}\n待处理：${item.unresolved.join("；")}\n下一步：${item.next_action}\n`);
    for (const item of result.resumptions) stdout.write(`接续核验 ${item.id}\t交接 ${item.handoff_ref.id}\t${item.input_digest.value}\n`);
  } finally { context.store.close(); }
};
export const verificationMutation = (kind: VerificationCommandType, id: string, options: GovernanceOptions & { file: string; rawFile?: string }): void => {
  const context = openProject(options);
  try {
    const project = context.store.getProject()!, taskTarget = ["RecordEvidence", "PrepareTaskEvaluation", "EvaluateTask", "SatisfyTask"].includes(kind);
    const object = taskTarget ? context.store.getExecutionObject("task", id) : context.store.getChange(id);
    if (!object) return targetNotFound(taskTarget ? "task" : "change", id);
    const payload: Record<string, unknown> = readJsonObject(options.file);
    if (kind === "RecordEvidence" && options.rawFile) payload.raw_result_ref = importInputFile(options.rawFile, () => new LocalEvidenceVerifier(context.location.repositoryPath, context.location.dataDirectory).importRawResult(resolve(options.rawFile!)));
    const receipt = options.commandId ? context.store.transaction(tx => tx.getCommandReceipt(options.commandId!))?.result : undefined;
    const old = receipt && "command_type" in receipt && receipt.command_type === kind ? receipt : undefined;
    const increment = ["SatisfyTask", "MarkReadyForIntegration"].includes(kind) ? 1 : 0;
    const revision = options.expectedRevision ? Number(options.expectedRevision) : old ? old.revision - increment : object.revision;
    const ids = commandIdentity(options), role = taskTarget && kind !== "SatisfyTask" ? "executor" : "technical_owner";
    const result = context.kernel.execute({ schema_version: SCHEMA_VERSION, command_id: ids.commandId, correlation_id: ids.correlationId, requested_at: now(), source: source(context.location.repositoryPath),
      command_type: kind, project_id: project.id, actor_id: context.instance.actor_id, acting_role: options.actingRole ?? role,
      target: { object_type: taskTarget ? "task" : "change", id: object.id }, expected_revision: revision, payload });
    if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, parseVersionedCommandResult);
    stdout.write(`${kind} 已记录（Revision ${result.revision}）\n`);
    if ("source_snapshot" in result.data) stdout.write(`SourceSnapshot：${result.data.source_snapshot.id}\t${result.data.source_snapshot.source_digest.value}\n`);
    if ("evidence" in result.data) stdout.write(`Evidence：${result.data.evidence.id}\n`);
    if ("requirement_set" in result.data) { stdout.write(`RequirementSet：${result.data.requirement_set.id}\t输入摘要：${result.data.input_digest.value}\n`);
      for (const item of result.data.requirement_set.requirements) stdout.write(`${item.key}\t${item.description}\n`); }
    if ("evaluation" in result.data) stdout.write(`Evaluation：${result.data.evaluation.id}\t${result.data.evaluation.outcome}\t${result.data.evaluation.input_digest.value}\n${result.data.evaluation.reasons.join("\n")}\n`);
  } finally { context.store.close(); }
};
export const showVerification = (id: string, options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const result = context.kernel.getVerification(id); if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, compileValidator(VerificationShowResultSchema));
    stdout.write(`源码快照 ${result.source_snapshots.length}；证据 ${result.evidence.length}；评价 ${result.evaluations.length}；任务满足 ${result.satisfactions.length}；集成准入 ${result.integration_readiness.length}\n`);
    for (const evaluation of result.evaluations) stdout.write(`${evaluation.id}\t${evaluation.purpose}\t${evaluation.outcome}\t${evaluation.input_digest.value}\n${evaluation.reasons.join("\n")}\n`);
    for (const [kind, records] of Object.entries({ source_snapshot: result.source_snapshots, evidence: result.evidence, policy_snapshot: result.policy_snapshots,
      requirement_set_record: result.requirement_sets, evaluation_context: result.contexts, task_satisfaction_record: result.satisfactions, integration_readiness_record: result.integration_readiness })) {
      for (const record of records) stdout.write(`${kind}\t${record.id}\n`);
    }
  } finally { context.store.close(); }
};

export const showFlow = (mode: "settings" | "targets" | "priority" | "wip", options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const result = context.kernel.getFlowStatus(); if (isDomainError(result)) return outputError(result, Boolean(options.json));
    if (options.json) return outputJson(result, compileValidator(FlowStatusResultSchema));
    if (mode === "settings") {
      if (!result.settings_version) return void stdout.write("尚未配置项目设置；开工保持阻塞。\n");
      const value = result.settings_version;
      stdout.write(`设置版本 ${value.version}（${value.id}）\n协调人：${value.settings.flow_owner_actor_id}\n裁决人：${value.settings.priority_arbiter_actor_id}\n在制上限：${value.settings.wip_limit}\n排序：${value.settings.priority_order}\n检查间隔：${value.settings.check_interval_ms}ms\n`);
    } else if (mode === "targets") {
      for (const target of result.target_versions) stdout.write(`${target.id}\t${target.status}\t${target.name}\n`);
    } else if (mode === "wip") {
      stdout.write(`在制：${result.wip.used} / ${result.wip.limit ?? "未配置"}，可用容量：${result.wip.available ?? "未知"}\n`);
      for (const change of result.wip_changes) stdout.write(`${change.display_key}\t${change.lifecycle_state}\t${change.title}\n`);
      stdout.write(`暂停的执行 / 待交付需求：${result.paused_changes.length}\n`);
      for (const change of result.paused_changes) stdout.write(`${change.display_key}\t${change.lifecycle_state}\t${"pause_reason" in change ? change.pause_reason : ""}\n`);
    } else for (const change of result.changes) stdout.write(`${change.display_key}\t优先级 ${change.priority}\t${change.lifecycle_state}\t${change.operating_status}\t${change.title}\n`);
  } finally { context.store.close(); }
};

export const doctor = (options: GlobalOptions): void => {
  const context = openProject(options);
  try {
    const snapshot = context.store.readSnapshot(reader => ({ project: context.kernel.getProject(),
      changes: reader.listChanges().length, events: reader.listEvents().length, pending_outbox: reader.listOutbox("pending").length }));
    const project = snapshot.value.project;
    if (isDomainError(project)) return outputError(project, Boolean(options.json));
    const report = {
      schema_version: SCHEMA_VERSION, as_of_event_sequence: snapshot.as_of_event_sequence,
      ok: true,
      project_id: project.id,
      repository_path: context.location.repositoryPath,
      database_path: context.location.databasePath,
      changes: snapshot.value.changes,
      events: snapshot.value.events,
      pending_outbox: snapshot.value.pending_outbox
    };
    if (options.json) outputJson(report, parseDoctorResult);
    else {
      stdout.write("CimiLoop Project 健康检查通过。\n");
      stdout.write(`Change：${report.changes}，Event：${report.events}，待投递 Outbox：${report.pending_outbox}\n`);
    }
  } finally {
    context.store.close();
  }
};

export const migrateProject = async (options: GlobalOptions & { check?: boolean }): Promise<void> => {
  const start = options.projectDir ? resolve(options.projectDir) : process.cwd();
  const location = locateProject(start, Boolean(options.projectDir) || existsSync(join(start, ".cimiloop", "instance.json")));
  const runner = new MigrationRunner(location.databasePath);
  const report = options.check ? runner.check() : await runner.apply({ actorId: readInstance(location.instancePath).actor_id });
  if (options.json) outputJson(report, parseMigrationReport);
  else {
    stdout.write(report.mode === "check" ? `数据库格式 ${report.from_format}，${report.migration_required ? `可显式升级到 ${report.to_format}` : "无需升级"}。\n` : "数据库升级完成。\n");
    if (report.migration_required) stdout.write(`Change：${report.counts.changes}，历史 Event：${report.counts.event_ledger}，成功 Receipt：${report.counts.command_receipts}，Outbox：${report.counts.outbox_messages}\n`);
    if (report.backup_path) stdout.write(`一致性备份：${report.backup_path}\n`);
  }
};
