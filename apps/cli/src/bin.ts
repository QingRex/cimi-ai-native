#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { SCHEMA_VERSION, createInternalId, type DomainError } from "@cimiloop/protocol/v2";
import { MigrationError } from "@cimiloop/store-sqlite";
import {
  createChange,
  doctor,
  initProject,
  listChanges,
  migrateProject,
  pauseChange,
  resumeChange,
  showChange,
  registerActor, assignResponsibility, endAssignment, transferResponsibility, listGovernance, registerProvider, showProviders, providerMutation,
  updateSettings, createTargetVersion, closeTargetVersion, changePlanning, startChange, showFlow,
  submitIntentProposal, assessRisk, requestIntentDecision, recordIntentDecision, confirmIntent, showIntent,
  executionMutation, showExecution, verificationMutation, showVerification, runMutation, showRuns, inspectObject,
  type GlobalOptions
} from "./commands.js";
import { outputError } from "./output.js";
import { CliInputError } from "./input.js";
import { runtimeProbe, runtimeOperation, runtimeRecover, runtimeTransportProbe, runtimeGatewayProbe, runtimeGatewayBridgeProbe, runtimeGatewayNetworkProbe, runtimeGatewayCreditProbe } from "./runtime-probe.js";

const program = new Command();
const jsonRequested = process.argv.includes("--json");

program
  .name("cimiloop")
  .description("CimiLoop Embedded Solo Mode CLI")
  .version("0.0.0")
  .option("--json", "输出稳定 JSON")
  .option("--project-dir <path>", "显式指定 Project 目录")
  .option("--command-id <uuid>", "显式指定幂等 Command ID")
  .option("--acting-role <role>", "声明本次操作使用的角色；Kernel 校验实际指派");

program.exitOverride();
program.configureOutput({ writeErr: () => undefined });

const globals = (command: Command): GlobalOptions => command.optsWithGlobals<GlobalOptions>();
const provider = program.command("provider").description("登记候选Provider、查看固定描述与正式接入缺口");
provider.command("register").requiredOption("--file <json>", "严格ProviderRegistration；不接受信任状态、身份或凭据")
  .option("--expected-revision <revision>", "期望Project Revision")
  .action((options, command) => registerProvider({ ...globals(command), ...options }));
provider.command("list").description("读取一致的Provider目录、摘要及Agent绑定缺口")
  .action((_options, command) => showProviders(globals(command)));
for (const [name, kind] of [["record-evidence", "RecordProviderEvidence"], ["evaluate", "EvaluateProvider"], ["bind", "RegisterProviderBinding"]] as const) {
  const entry = provider.command(name).requiredOption("--file <json>", "严格Provider作用域输入；不能用Task验收或自报准入")
    .option("--expected-revision <revision>", "期望Project Revision");
  if (kind === "RecordProviderEvidence") entry.option("--probe-file <json>", "实际Runtime探针快照，核对并导入原始字节")
    .option("--artifact-root <path>", "原始引用可读取的显式根目录；缺省当前项目目录");
  entry.action((options, command) => providerMutation(kind, { ...globals(command), ...options }));
}
const runtime = program.command("runtime").description("Runtime版本与操作系统隔离探针；尚未启用正式Agent任务");
runtime.command("gateway-credit-probe").description("历史费率下的持久积分预算演练；不发送HTTP、读取凭据或批准计费")
  .option("--output-dir <path>", "结果及独立积分演练账本目录；默认.cimiloop/gateway-credit-probe")
  .action((options, command) => runtimeGatewayCreditProbe({ ...globals(command), ...options }));
runtime.command("gateway-network-probe").description("固定智谱Coding Plan公网DNS及TLS边界；不发送HTTP或读取凭据")
  .option("--output-dir <path>", "结果及原始观测目录；默认.cimiloop/gateway-network-probe")
  .option("--max-elapsed-ms <ms>", "DNS与TLS合计时限；1000–30000，默认8000")
  .action((options, command) => runtimeGatewayNetworkProbe({ ...globals(command), ...options }));
runtime.command("gateway-bridge-probe").description("无网络权限的OpenCode经IPC接入合成HTTPS宿主网关；不调用外部模型")
  .requiredOption("--binary <path>", "实际OpenCode原生可执行文件，按SHA256固定副本")
  .option("--output-dir <path>", "结果、操作及预算账本目录；默认.cimiloop/gateway-bridge-probe")
  .option("--max-elapsed-ms <ms>", "实际进程时限；1000–180000，默认30000")
  .action((options, command) => runtimeGatewayBridgeProbe({ ...globals(command), ...options }));
runtime.command("gateway-probe").description("合成HTTPS宿主网关与持久预算探针；不启动Runtime，不读取真实凭据")
  .option("--output-dir <path>", "结果及预算账本目录；默认.cimiloop/gateway-probe")
  .action((options, command) => runtimeGatewayProbe({ ...globals(command), ...options }));
runtime.command("transport-probe").description("无网络权限的OpenCode命名管道传输；仅返回合成数据，无外部模型请求")
  .requiredOption("--binary <path>", "实际OpenCode原生可执行文件，按SHA256固定副本")
  .option("--output-dir <path>", "结果及原始字节目录；默认.cimiloop/transport-probe")
  .option("--max-elapsed-ms <ms>", "实际进程时限；1000–180000，默认20000")
  .action((options, command) => runtimeTransportProbe({ ...globals(command), ...options }));
runtime.command("probe").requiredOption("--binary <path>", "实际OpenCode原生可执行文件，按SHA256固定副本")
  .option("--output-dir <path>", "探针结果及原始字节目录；默认.cimiloop/runtime-probe")
  .option("--model-probe", "在合成工作区验证真实模型修改及独立只读会话")
  .option("--connection-file <json>", "专用智谱模型连接；仅引用DPAPI凭据，不读人类OpenCode登录")
  .option("--disk-limits-file <json>", "沙箱采样阈值与日志写入上限；默认64MiB总量 / 256条目 / 8MiB单文件及日志")
  .option("--execution-policy-file <json>", "网络及费用策略；默认禁止网络，联网模型探针须显式选择未限主机 / 未计费的探针模式")
  .option("--max-elapsed-ms <ms>", "每个模型操作的实际进程时限；1000–180000，默认90000")
  .action((options, command) => runtimeProbe({ ...globals(command), ...options }));
for (const name of ["show", "cancel", "collect"] as const) runtime.command(`${name} <operation-key>`)
  .description("读取 / 取消 / 收集合成探针操作；不修改Task、WorkItem或原生Run")
  .requiredOption("--output-dir <path>", "对应探针目录")
  .action((key, options, command) => runtimeOperation(name, key, { ...globals(command), ...options }));
runtime.command("recover <operation-key>").description("核对原进程身份，清理该合成操作的残留资源；不重新启动或修改Task")
  .requiredOption("--output-dir <path>", "对应探针目录")
  .action((key, options, command) => runtimeRecover(key, { ...globals(command), ...options }));
program.command("inspect <object-type> <id-or-key>").description("查看当前项目中单个原生对象的完整记录；change 支持 CHG key，其余使用 ID")
  .action((kind, id, _options, command) => inspectObject(kind, id, globals(command)));

program
  .command("init")
  .description("在当前 Repository 初始化 CimiLoop Project")
  .option("--name <name>", "Project 名称")
  .option("--owner-name <name>", "Project Owner 名称")
  .option("--owner-email <email>", "Project Owner 邮箱")
  .option("--yes", "确认使用提供或检测到的身份")
  .action(async (options, command) => initProject({ ...globals(command), ...options }));

const change = program.command("change").description("管理 Change");

change
  .command("create")
  .description("创建 Draft Change")
  .requiredOption("--title <title>", "Change 标题")
  .option("--kind <kind>", "requirement 或 bug")
  .option("--requirement-owner <actor-id>", "独立指派需求责任人")
  .option("--target-version <id>", "纳入开放目标版本；另需当前 Flow Owner 指派")
  .action((options, command) => createChange(options.title, { ...globals(command), ...options }));

change
  .command("list")
  .description("列出当前 Project 的 Change")
  .action((_options, command) => listChanges(globals(command)));

change
  .command("show <id-or-key>")
  .description("查看 Change")
  .action((idOrKey, _options, command) => showChange(idOrKey, globals(command)));

change
  .command("pause <id-or-key>")
  .description("暂停 Change")
  .requiredOption("--reason <reason>", "暂停原因")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((idOrKey, options, command) => pauseChange(idOrKey, options.reason, { ...globals(command), ...options }));

change
  .command("resume <id-or-key>")
  .description("恢复 Change")
  .option("--reconciliation-file <json>", "严格恢复 payload：reconciliation_refs 指向接续核验记录或固定源码")
  .option("--expected-revision <revision>", "期望 Revision")
  .action((idOrKey, options, command) => resumeChange(idOrKey, { ...globals(command), ...options }));

change.command("transfer <id-or-key>").description("原子移交 Change 责任；首次设置需求责任也走此入口")
  .requiredOption("--role <role>", "change_owner 或 requirement_owner")
  .requiredOption("--to-actor <actor-id>", "接任 Human Actor")
  .requiredOption("--reason <reason>", "移交原因")
  .option("--basis <assignment-ids...>", "操作者有效 Project Owner 指派依据；默认读取真实指派")
  .option("--expected-revision <revision>", "期望 Change Revision")
  .action((idOrKey, options, command) => transferResponsibility(idOrKey, { ...globals(command), ...options }));

const actor = program.command("actor").description("登记参与者元数据；登记不构成登录或授权");
actor.command("register").requiredOption("--type <type>", "human、agent 或 system")
  .requiredOption("--name <name>", "显示名称").option("--email <email>", "Human 邮箱")
  .option("--provider <provider>", "Agent Runtime Provider").option("--resource-type <type>", "Provider 身份类型")
  .option("--locator <locator>", "Provider 身份定位符").option("--version <version>", "Provider 身份版本")
  .option("--expected-revision <revision>", "期望 Project Revision")
  .action((options, command) => registerActor({ ...globals(command), ...options }));
actor.command("list").description("列出参与者和责任指派（含历史）")
  .action((_options, command) => listGovernance(globals(command)));
const role = program.command("role").description("管理责任指派");
role.command("assign").requiredOption("--actor <actor-id>", "承担责任的 Human Actor")
  .requiredOption("--role <role>", "责任角色").requiredOption("--scope <kind>", "作用域类型")
  .option("--scope-id <id>", "作用域 ID；project 默认当前 Project")
  .option("--effective-at <utc>", "生效时间；默认提交时立即生效")
  .option("--expires-at <utc>", "到期时间；Change 负责人持续到明确移交")
  .option("--expected-revision <revision>", "期望 Project Revision")
  .action((options, command) => assignResponsibility({ ...globals(command), ...options }));
role.command("end <assignment-id>").requiredOption("--reason <reason>", "结束原因")
  .option("--expected-revision <revision>", "期望 Project Revision")
  .option("--expected-assignment-revision <revision>", "期望 Assignment Revision")
  .action((id, options, command) => endAssignment(id, { ...globals(command), ...options }));
role.command("list").description("列出参与者和责任指派（含历史）")
  .action((_options, command) => listGovernance(globals(command)));

const settings = program.command("settings").description("项目协调责任、排序与在制设置");
settings.command("show").action((_options, command) => showFlow("settings", globals(command)));
settings.command("update").requiredOption("--wip-limit <number>", "在制上限")
  .option("--flow-owner <actor-id>", "持续有效的 Flow Owner；默认当前值或本地操作者")
  .option("--priority-arbiter <actor-id>", "有项目负责人指派的裁决人；默认当前值或本地操作者")
  .option("--priority-order <order>", "higher_first 或 lower_first；默认当前值或 higher_first")
  .option("--check-interval-ms <ms>", "检查间隔毫秒；默认当前值或60000")
  .option("--base-settings-id <id>", "显式前置设置ID").option("--base-settings-version <version>", "显式前置设置版本")
  .option("--expected-revision <revision>", "期望 Project Revision")
  .action((options, command) => updateSettings({ ...globals(command), ...options }));
const target = program.command("target-version").description("规划目标版本；关闭不完成 Change");
target.command("create").requiredOption("--name <name>", "项目内唯一名称")
  .option("--starts-at <utc>", "规划窗口开始 UTC").option("--ends-at <utc>", "规划窗口结束 UTC")
  .option("--expected-revision <revision>", "期望 Project Revision")
  .action((options, command) => createTargetVersion({ ...globals(command), ...options }));
target.command("close <id>").requiredOption("--reason <reason>", "关闭原因")
  .option("--expected-revision <revision>", "期望 Project Revision")
  .option("--expected-target-revision <revision>", "期望目标版本 Revision")
  .action((id, options, command) => closeTargetVersion(id, { ...globals(command), ...options }));
target.command("list").action((_options, command) => showFlow("targets", globals(command)));
change.command("planning <id-or-key>").requiredOption("--reason <reason>", "规划原因")
  .option("--priority <number>", "非负整数优先级").option("--target-version <id>", "开放目标版本")
  .option("--clear-target-version", "取消规划归属").option("--arbitration", "由设置指定的裁决人处理争议")
  .option("--expected-revision <revision>", "期望 Change Revision")
  .action((id, options, command) => changePlanning(id, { ...globals(command), ...options }));
change.command("priority").description("按项目设置排序查询")
  .action((_options, command) => showFlow("priority", globals(command)));
change.command("wip").description("查询在制与暂停需求；等待评审、测试和发布仍计在制")
  .action((_options, command) => showFlow("wip", globals(command)));
change.command("start <id-or-key>").description("核对正式约定 / 计划、依赖和在制容量后开工")
  .requiredOption("--plan-id <id>", "正式 Plan ID").requiredOption("--plan-version <version>", "正式 Plan 版本")
  .requiredOption("--reason <reason>", "开工原因").option("--expected-revision <revision>", "期望 Change Revision")
  .action((id, options, command) => startChange(id, { ...globals(command), ...options }));

for (const kind of ["contract", "plan"] as const) {
  const intent = program.command(kind).description(kind === "contract" ? "约定候选与正式确认" : "计划候选、DAG和正式确认");
  intent.command("submit <change>").requiredOption("--file <json>", "严格候选Body JSON文件")
    .option("--proposal-id <id>", "修订既有候选链ID").option("--expected-proposal-revision <revision>", "候选链前置修订")
    .option("--base-id <id>", "正式基准ID").option("--base-version <version>", "正式基准版本")
    .option("--expected-revision <revision>", "Change Revision")
    .action((id, options, command) => submitIntentProposal(kind, id, { ...globals(command), ...options }));
  intent.command("confirm <change>").requiredOption("--proposal-id <id>", "精确候选记录ID").requiredOption("--proposal-revision <revision>", "精确候选修订")
    .requiredOption("--request-id <id>", "决定请求ID").requiredOption("--decision-id <id>", "实际批准决定ID")
    .requiredOption("--input-digest <sha256>", "固定决定输入摘要").option("--expected-revision <revision>", "Change Revision")
    .action((id, options, command) => confirmIntent(kind, id, { ...globals(command), ...options }));
  intent.command("show <change>").action((id, _options, command) => showIntent(id, globals(command)));
}
const risk = program.command("risk").description("真实专业责任人的风险判断");
risk.command("assess <change>").requiredOption("--proposal-id <id>", "约定候选记录ID").requiredOption("--proposal-revision <revision>", "精确修订")
  .requiredOption("--level <level>", "ordinary / high").requiredOption("--reason <reason>", "专业判断依据")
  .option("--expected-revision <revision>", "Change Revision").action((id, options, command) => assessRisk(id, { ...globals(command), ...options }));
const decision = program.command("decision").description("精确输入的人工决定；记录决定不自动确认版本");
decision.command("request <change>").requiredOption("--action <action>", "confirm_contract / confirm_plan / confirm_integration / verify_decision_conditions / invalidate_evidence")
  .requiredOption("--proposal-id <id>", "候选记录ID").requiredOption("--proposal-revision <revision>", "精确候选修订")
    .option("--proposal-kind <kind>", "contract_proposal / plan_proposal；默认按动作推导")
    .option("--subject-kind <kind>", "专业复核对象：evaluation / decision / evidence").option("--subject-id <id>", "专业复核对象的精确记录ID")
  .option("--risk-id <id>", "约定确认所需真实风险判断").option("--expires-at <utc>", "未来UTC期限，默认15分钟、最长24小时")
  .option("--expected-revision <revision>", "Change Revision").action((id, options, command) => requestIntentDecision(id, { ...globals(command), ...options }));
decision.command("record <change>").requiredOption("--request-id <id>", "决定请求ID").requiredOption("--input-digest <sha256>", "请求固定输入摘要")
  .requiredOption("--choice <choice>", "approve / request_changes / reject").requiredOption("--reason <reason>", "决定原因")
    .option("--condition <conditions...>", "批准条件；正式确认前须逐项核验")
    .option("--raw-file <json>", "专业决定的实际人工复核报告；导入后固定内容摘要")
  .option("--expected-revision <revision>", "Change Revision").action((id, options, command) => recordIntentDecision(id, { ...globals(command), ...options }));
decision.command("list <change>").action((id, _options, command) => showIntent(id, globals(command)));

const task = program.command("task").description("正式计划中的任务与累计用量");
task.command("initialize <change>").requiredOption("--plan-id <id>", "正式Plan记录ID").requiredOption("--plan-version <version>", "精确版本")
  .option("--expected-revision <revision>", "Change Revision")
  .action((id, options, command) => executionMutation("InitializePlanTasks", id, { ...globals(command), ...options }));
task.command("list [change]").action((id, _options, command) => showExecution("task", id, globals(command)));
task.command("show <id>").action((id, _options, command) => inspectObject("task", id, globals(command)));
const workItem = program.command("work-item").description("固定范围与预算的执行授权；创建不启动Runtime");
workItem.command("create <task-id>").requiredOption("--file <json>", "严格CreateWorkItem payload JSON；包含定义、执行者、动作、资源、预算与停止条件")
  .option("--expected-revision <revision>", "Task Revision")
  .action((id, options, command) => executionMutation("CreateWorkItem", id, { ...globals(command), ...options }));
workItem.command("revoke <id>").requiredOption("--reason <reason>", "撤销原因").option("--expected-revision <revision>", "WorkItem Revision")
  .action((id, options, command) => executionMutation("RevokeWorkItem", id, { ...globals(command), ...options }));
workItem.command("list [change]").action((id, _options, command) => showExecution("work_item", id, globals(command)));
workItem.command("show <id>").action((id, _options, command) => inspectObject("work_item", id, globals(command)));
const authorization = program.command("authorization").description("有期限、有边界的低风险常规授权");
authorization.command("publish").requiredOption("--file <json>", "严格StandingAuthorization Body JSON")
  .option("--authorization-id <id>", "修订既有授权；省略则创建")
  .option("--expected-revision <revision>", "首次Project Revision，修订Authorization Revision")
  .action((options, command) => executionMutation("PublishStandingAuthorization", options.authorizationId, { ...globals(command), ...options }));
authorization.command("revoke <id>").requiredOption("--reason <reason>", "撤销原因").option("--expected-revision <revision>", "Authorization Revision")
  .action((id, options, command) => executionMutation("RevokeStandingAuthorization", id, { ...globals(command), ...options }));
authorization.command("list").action((_options, command) => showExecution("authorization", undefined, globals(command)));
authorization.command("show <id>").action((id, _options, command) => inspectObject("standing_authorization", id, globals(command)));

const verification = program.command("verification").description("固定源码、人工原始证据与当前适用评价；成功记录不等于 ALLOW");
for (const [name, kind] of [["capture-source", "CaptureSourceSnapshot"], ["record-evidence", "RecordEvidence"], ["prepare-task", "PrepareTaskEvaluation"],
  ["evaluate-task", "EvaluateTask"], ["satisfy-task", "SatisfyTask"], ["evaluate-integration", "EvaluateIntegration"], ["mark-ready", "MarkReadyForIntegration"]] as const) {
  const command = verification.command(`${name} <target>`).requiredOption("--file <json>", "严格命令 payload JSON；Task 命令使用 Task ID，其余使用 Change ID / key")
    .option("--expected-revision <revision>", "目标 Revision");
  if (kind === "RecordEvidence") command.option("--raw-file <json>", "导入真实人工原始报告并固定内容摘要");
  command.action((id, options, command) => verificationMutation(kind, id, { ...globals(command), ...options }));
}
verification.command("show <change>").action((id, _options, command) => showVerification(id, globals(command)));
const runs = program.command("run").description("Human 运行预约、原始观测、取消核对与工作区交接");
for (const [name, kind] of [["prepare-context", "PrepareRunContext"], ["reserve", "ReserveRun"], ["observe", "RecordRunObservation"], ["reconcile", "ReconcileRun"], ["cancel", "CancelRun"], ["handoff", "SaveHandoff"], ["check-resumption", "CheckResumption"]] as const) {
  const command = runs.command(`${name} <target>`).requiredOption("--file <json>", "严格命令 payload JSON；预约用 Task ID，观测/核对/取消用 Run ID，其余用 WorkItem ID")
    .option("--expected-revision <revision>", "目标 Revision");
  if (kind === "RecordRunObservation" || kind === "ReconcileRun") command.option("--raw-file <json>", "导入具名 Human 实际运行/核对报告");
  command.action((id, options, command) => runMutation(kind, id, { ...globals(command), ...options }));
}
runs.command("show <change>").action((id, _options, command) => showRuns(id, globals(command)));

program
  .command("migrate")
  .description("检查并显式升级旧格式项目数据库；升级前请停止外部 Worker")
  .option("--check", "只读预检查，不备份或升级")
  .action((options, command) => migrateProject({ ...globals(command), ...options }));

program
  .command("doctor")
  .description("检查当前 Project 本地状态")
  .action((_options, command) => doctor(globals(command)));

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError && error.exitCode === 0) {
    process.exitCode = 0;
  } else {
    const argumentFailure = error instanceof CommanderError;
    const domainError: DomainError = {
      schema_version: SCHEMA_VERSION,
      code: error instanceof CliInputError || error instanceof MigrationError ? error.code : argumentFailure ? "CLI_ARGUMENT_INVALID" : "CLI_EXECUTION_FAILED",
      message: error instanceof CliInputError || error instanceof MigrationError || argumentFailure ? error.message : "CLI 执行失败",
      category: error instanceof CliInputError ? error.category : error instanceof MigrationError ? "storage" : argumentFailure ? "validation" : "internal",
      retryable: false,
      details: error instanceof CliInputError ? error.details : argumentFailure ? { commander_code: error.code } : {},
      correlation_id: createInternalId()
    };
    outputError(domainError, jsonRequested);
  }
}
