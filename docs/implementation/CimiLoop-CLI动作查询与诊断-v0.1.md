# CimiLoop CLI 动作、查询与诊断 v0.1

2026-10-04，V1-08。当前执行依据为 [V1 可执行设计与实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)。本文汇总已实现的 S1 CLI 入口及失败处理；数据库仍为格式7，协议仍为2.0.0。真实 Agent / Tool Runtime、权限隔离及工作台在后续任务中实现。

## 1. 入口与身份

仓库使用 Node.js 24.15.0 及 pnpm 12.4.2。先运行 `pnpm build`，再通过 `pnpm cimiloop` 调用；下文的 `cimiloop` 表示同一 CLI 可执行入口。路径参数含空格时用引号。

```powershell
pnpm cimiloop --project-dir D:\work\example --json doctor
pnpm cimiloop --project-dir D:\work\example change show CHG-0001
pnpm cimiloop --project-dir D:\work\example --json inspect task <task-id>
```

通用参数：`--project-dir` 定位项目，`--json` 选择严格机器结果，`--command-id` 固定写命令身份，`--acting-role` 声明本次角色。没有 `--acting-role` 时按操作选择默认角色，实际指派、有效期、范围及身份仍由 Kernel 核验。注册 Human 或修改命令来源不能切换登录人；当前 CLI 使用项目初始化时保存的本地操作者绑定。

`init --json` 须提供 `--owner-name` 或 `--yes`，避免交互提示混入 JSON。`--help` / `--version` 是明确的文本帮助入口；业务查询、写命令、迁移、健康检查及失败结果在 `--json` 下使用对应 Protocol Schema 校验后输出。

## 2. 当前动作与查询覆盖

| 领域 | 写入动作 | 读取入口 | 详细操作依据 |
|---|---|---|---|
| 项目与责任 | `init`、`actor register`、`role assign / end`、`change transfer` | `doctor`、`actor list`、`role list`、`inspect project / actor / assignment` | [责任治理与身份入口](CimiLoop责任治理与身份入口-v0.1.md) |
| Provider候选 | `provider register --file`，仅candidate | `provider list`、`inspect provider_descriptor / provider_binding` | [Provider候选登记与接入检查](CimiLoop-Provider候选登记与接入检查-v0.1.md)，正式评测 / 绑定与执行仍未启用 |
| 需求与规划 | `change create / planning / start / pause / resume`、`settings update`、`target-version create / close` | `change list / show / priority / wip`、`settings show`、`target-version list`、单对象 `inspect` | [设置、规划与容量](CimiLoop项目设置规划与容量-v0.1.md) |
| 约定、方案与决定 | `contract submit / confirm`、`plan submit / confirm`、`risk assess`、`decision request / record` | `contract show`、`plan show`、`decision list`、候选 / 版本 / 风险 / 请求 / 决定 `inspect` | [约定、计划确认与开工](CimiLoop约定计划确认与开工-v0.1.md) |
| 任务与授权 | `task initialize`、`work-item create / revoke`、`authorization publish / revoke` | `task list / show`、`work-item list / show`、`authorization list / show`、固定定义和授权记录 `inspect` | [任务、授权与预算](CimiLoop任务授权与预算-v0.1.md) |
| 证据与评价 | `verification capture-source / record-evidence / prepare-task / evaluate-task / satisfy-task / evaluate-integration / mark-ready` | `verification show`、源码 / 证据 / 策略 / 需求集 / Context / 评价 / 满足 / 准入 `inspect` | [证据、评价与安全集成](CimiLoop证据评价与安全集成-v0.1.md) |
| 运行与交接 | `run prepare-context / reserve / observe / reconcile / cancel / handoff / check-resumption` | `run show`、Run / 工作区 / Context / 预约 / 观测 / 交接 / 接续记录 `inspect` | [运行预约与交接恢复](CimiLoop运行预约与交接恢复-v0.1.md) |
| 迁移 | `migrate` | `migrate --check` | [数据库迁移与恢复](CimiLoop-M0数据库迁移与恢复-v0.1.md) |

`change resume --reconciliation-file` 携带实际恢复依据；其余结构化写入按对应命令使用 `--file`。写命令的 `--expected-revision` 指向命令实际目标：Project、Change、Task、WorkItem、Run 或 StandingAuthorization，不能互换。`role end` 和 `target-version close` 还分别比较指派 / 目标版本自己的修订。

候选 Body、WorkItem、运行及验证 payload 必须符合生成的 [v2 Schema 制品目录](../../packages/protocol/schemas/v2)。文件不存在、非普通文件、超过8 MiB、JSON 语法无效、顶层数组或 null 都返回 `CLI_ARGUMENT_INVALID`；格式正确但字段不符由 Kernel 返回 `PROTOCOL_VALIDATION_FAILED`，包含字段校验信息。原始报告使用 `--raw-file` 导入实际字节，报告的语义、身份、摘要与适用性仍由对应受控核验器验证。

## 3. 单对象详情

```text
cimiloop inspect <object-type> <id-or-key>
cimiloop task show <task-id>
cimiloop work-item show <work-item-id>
cimiloop authorization show <authorization-id>
```

后三条是 `inspect` 的便捷入口，文本和 JSON 使用同一 Kernel 查询。Change 可以用 `CHG-0001` 或内部 ID，其余对象使用内部 ID。查询包含完整持久记录及 `as_of_event_sequence`，不会追加 Event、成功 Receipt 或 Outbox。记录内的引用可以继续用 `inspect` 查询。

支持的类型：

| 领域 | object-type |
|---|---|
| 基础与规划 | `project`、`actor`、`assignment`、`change`、`project_settings_version`、`target_version` |
| Provider元数据 | `provider_descriptor`、`provider_binding`；可查询不表示正式绑定获批 |
| 意图 | `contract_proposal`、`plan_proposal`、`contract_version`、`plan_version`、`risk_assessment`、`decision_request`、`decision`、`lifecycle_transition_record` |
| 执行 | `task`、`task_definition`、`work_item`、`standing_authorization`、`standing_authorization_version`、`authorization_revocation_record`、`work_item_authorization_record` |
| 验证 | `source_snapshot`、`evidence`、`policy_snapshot`、`requirement_set_record`、`evaluation_context`、`evaluation`、`task_satisfaction_record`、`integration_readiness_record` |
| 运行 | `run`、`workspace_snapshot`、`context_manifest`、`run_record`、`run_observation`、`handoff_record`、`resumption_record` |

`ObjectShowResult` 按 `object_type` 选择完整原生对象 Schema，拒绝对象类型错配、嵌套额外字段及未知顶层字段。尚未进入本阶段持久对象查询的类型返回 `UNSUPPORTED_OBJECT_TYPE`；当前项目没有相应对象时返回 `OBJECT_NOT_FOUND`。不会因为协议预留了类型，就声称对应能力已经可用。

Task / WorkItem / Run 的详情还提供该任务当前的 `readiness`、用量摘要及剩余预算。这是当前任务授权 / 再次运行的派生准入，查看旧 WorkItem 或旧 Run 时仍指向任务目前的事实。它不证明旧记录仍适用，也不替代实际源码、工作区、Context、Provider 或恢复核验。详情读取保留的原始引用；不会自行读取或恢复工作区文件。

文本摘要中，Intent 列出候选修订、风险与决定条件；Verification 列出各类记录 ID 及评价原因；Run 列出 Context、工作区、预约、观测适用性、交接接续者、未解决问题和下一步动作。完整内容继续通过 `inspect` 读取。

## 4. 失败、冲突与重试

| 退出码 | 类别 | 示例 |
|---|---|---|
| 0 | 成功 | 已记录命令或返回查询 |
| 2 | 输入 / 校验失败 | 缺参数、坏 JSON、Protocol 校验失败 |
| 3 | 目标不存在 | 未初始化项目、找不到 Task / WorkItem / 查询对象 |
| 1 | 其他失败 | 修订冲突、无权限、预算 / 外部状态冲突、存储或迁移失败 |

业务规则沿用 Kernel 的实际错误类别，不按错误名称猜退出码。`--json` 的失败结果使用 `{schema_version, ok:false, error}`，错误正文在 stdout；文本模式使用 stderr。输入错误不会回显无效文件内容。

已解析的当前版本命令在校验、目标或冲突失败后，可以附加 `error.details.diagnostic`。它通过严格 `CommandDiagnostic` Schema，包含目标及期望版本、当前目标事实、相关 Task / Change、任务准入缺项、用量摘要与剩余预算、读取时刻和事件序号。非修订 / 命令身份冲突还列出原拒绝码。文本模式展示这些事实，并给出 `cimiloop inspect` 定位命令。身份 / 权限失败不附加这类诊断；存储失败不能读取诊断时保留原错误。

诊断来自失败事务结束后的另一次一致读快照，读取时刻可能已有新的并发变更。原错误继续表示原事务为何失败；诊断表示后来读到的事实。`missing_conditions` 不是完整开工或执行条件清单，空数组不表示下一次调用必定成功。

重试方式：

1. 用 `inspect` 核对实际目标、当前版本和正式指针；需要时查看对应 Intent / Execution / Verification / Run 查询。
2. 对已成功命令的网络 / 输出不确定重试，保留原 `--command-id` 和原输入，Kernel 返回原成功 Receipt。CLI 使用原回执中的前置版本；后来的写入不会让重放重复消耗预算或追加事件。
3. 修改了输入、版本、依据或授权后，使用新的命令 ID 提交。不得用旧命令 ID 表达新的操作；失败命令没有成功 Receipt，也不自动重试、合并或推进状态。
4. Unknown、取消请求、费用不明或交接失效按运行文档核对真实原始事实；不能只刷新 Revision 或修改数据库解除阻塞。

## 5. 应用服务与验证

读入口集中在 `CimiLoopKernel`：`getChangeList / getChangeSnapshot / getGovernance / getFlowStatus / getIntent / getExecution / getVerification / getRuns / getObject`。CLI 仅定位项目、绑定操作者、读取输入文件、调用 Kernel 并渲染结果。未来 Workbench 可复用同一查询及写命令服务；本阶段没有另建前端状态机或远程 API。

本批验证包括持久原生记录详情及严格 Schema、真实 CLI 详情与交接文本、修订冲突当前事实和缺项、文本 / JSON 错误一致性、坏输入不泄露正文、查询与失败不追加事件 / 成功回执、原命令重放及全仓库回归。最终通过数量见实施基线第10节及决策账本 D-191。
