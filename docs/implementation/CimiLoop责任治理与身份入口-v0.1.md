# CimiLoop 责任治理与身份入口 v0.1

> 2026-10-04：V1-03 的责任治理及设置 / 规划 / 容量基础已实现，V1-04 已接通真实约定 / 计划确认及 StartChange 正向准入。任务总数仍为 23；V1-05 已实现任务 / 授权，下一步 V1-06证据评价及V1-07运行恢复。

当前规则以 [V1 可执行设计与实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)为准。责任治理沿用既有表；设置 / 规划由格式 3 引入，确认记录由格式 4 引入，任务 / 授权由格式 5 引入，当前格式 1 / 2 / 3 / 4 项目须显式升级至 5，详见 [迁移操作说明](CimiLoop-M0数据库迁移与恢复-v0.1.md)。

## 已实现的入口与权限

`CimiLoopKernel` 由可信装配入口注入 `caller`，命令不能携带或覆盖该字段。没有绑定返回 `CALLER_REQUIRED`；项目、Actor、类型或 Provider 身份与绑定不符返回 `CALLER_IDENTITY_MISMATCH`。检查在回执查询之前执行，已存在的回执不能绕过身份检查。

| caller.kind | 绑定要求 | 当前边界 |
|---|---|---|
| bootstrap | 由本地初始化入口装配 | 只允许尚未初始化的 Project 执行 InitializeProject；不能复用为日常身份 |
| local_operator | 已登记 Human Actor 与 Project；接受现有 local_operator / git_config 来源 | CLI 从 instance.json 绑定初始化操作者；没有选择另一位 Actor 的命令行开关 |
| agent | 已登记 Agent Actor、同一 Project、精确 provider_identity_ref | 不得声明 Human 来源或承担责任角色；真实 Runtime 认证与 Adapter 尚未接入 |
| system | 已登记 System Actor、同一 Project、local_service 来源 | 不承担 Human 责任角色；具体自动化动作后续实现 |

`caller` 是进程内可信入口契约，不是远程登录凭证。Embedded Solo 信任本地操作者及项目数据目录；登记另一位 Human 只记录参与者元数据，不证明对方已登录、亲自签署或批准。未来 AgentGateway 必须使用 Agent 绑定，并限制 Agent 经人类 CLI 或直接 Store 绕过入口；本次没有实现进程隔离或真实 Runtime 认证。

身份验证之后，每次新操作核对声明的 acting_role、同项目作用域和当前有效 Assignment。角色没有默认继承：Project Owner 可以治理指派，但不能凭项目身份代行本条 Change Owner 的暂停 / 恢复。Actor 一人兼任时，每个角色仍需要独立 Assignment，不表示独立人员复核。

## 命令与原子性

| 命令 | 目标 / 并发条件 | 权限与结果 |
|---|---|---|
| RegisterActor | Project，expected_revision | Human Project Owner 登记三类 Actor 的严格来源元数据；Project Revision +1；不自动授予权限。Agent 的 Provider 身份定位符不得重复登记 |
| AssignResponsibility | Project，expected_revision | Human Project Owner 指派注册 Human；检查角色适用范围、目标存在、同项目、有效时间及重叠；Project Revision +1 |
| EndAssignment | Project，expected_revision；payload 含 expected_assignment_revision | 只追加结束时间并将 Assignment / Project Revision 各 +1；原授予人、角色、作用域、期限不改写；非终结 Change 的当前责任须原子移交 |
| TransferChangeResponsibility | Change，expected_revision | Human Project Owner 提供其当前有效的项目负责人 Assignment 作为 grant_basis_refs；同事务结束旧责任、新建指派、更新对应负责人指针及 Change Revision +1 |
| CreateChange | Project 上的项目负责人角色 | 创建独立 Change Owner 指派；可显式提供 requirement_owner_actor_id，另建需求负责人指派；同人也保留两个不同 Assignment |
| PauseChange / ResumeChange | Change，expected_revision | 原生v2要求此Change当前Human Change Owner的显式指派；暂停保留非终结位置，Draft可恢复，非Draft恢复须等正式基线与执行核对接通；v1兼容仅支持Draft |

AssignResponsibility 的 effective_at 可省略，默认事务提交操作时立即生效；显式时间不能回溯，expires_at 必须晚于 effective_at。有效区间为左闭右开，时间比较按 UTC 的实际瞬间处理，兼容有无毫秒的表示。相同 Actor / 角色 / 作用域不允许重叠；Change 的两种负责人角色分别在所有 Actor 间保持唯一。

Change Owner / Requirement Owner 指派立即生效且不自动到期，直到明确移交；普通指派命令只能补齐与现有负责人指针一致的角色。更换负责人或首次设置需求负责人使用 TransferChangeResponsibility。已关闭的 Change 不再移交。结束最后一名当前项目负责人时，必须已有另一名有效、持续的 Human Project Owner，不能依赖稍后生效或即将到期的替代人。

release_batch / environment 的角色范围已定义，但对象未实现时返回 CAPABILITY_UNAVAILABLE，不能给不存在的发布对象授予权限。策略规定的业务批准、双人确认及精确输入摘要校验属于后续任务；当前不接收虚构 Decision 作为移交依据。

所有成功写入在同一 SQLite 事务中提交 Current State、Project / Change / Assignment CAS、Event、Outbox 和 Receipt。移交 / 结束审计保存在不可变 `ChangeResponsibilityTransferred` / `AssignmentEnded` 事件中，保留实际操作者、原因、指派快照及依据，不另存一份可改写的交接台账，不修改过去批准人的署名。事件、指派、Outbox 或回执任一写入失败，整个命令回滚。

成功回执保留原结果及摘要；绑定一致的操作者可以在角色结束后读取自己原命令的回执，但不会再次授权或写入。新 command_id 按当前指派重新核对，撤销后拒绝新操作。拒绝结果当前不持久化为 Kernel Receipt。

## CLI 用法

所有动作支持 `--json` 和 `--command-id`；机器输出经过严格 Schema 校验。以下使用示意 ID，替换成 actor / role list 返回的 UUID：

```text
node apps/cli/dist/bin.js actor list --json
node apps/cli/dist/bin.js actor register --type human --name "需求负责人"
node apps/cli/dist/bin.js role assign --actor <human-id> --role flow_owner --scope project
node apps/cli/dist/bin.js change create --title "修复登录提示" --kind bug --requirement-owner <human-id>
node apps/cli/dist/bin.js change transfer CHG-0001 --role requirement_owner --to-actor <human-id> --reason "责任移交"
node apps/cli/dist/bin.js role end <assignment-id> --reason "结束额外职责"
node apps/cli/dist/bin.js role list --json
```

`--acting-role` 只声明本次使用的角色，不能切换绑定身份。治理命令默认 project_owner，原生暂停 / 恢复默认 change_owner。Project / Change 的 expected_revision 默认读取当前事实；可显式提供。EndAssignment 另支持 `--expected-assignment-revision`。责任移交可用 `--basis <assignment-ids...>` 指定依据；省略时读取操作者真实有效的 Project Owner 指派。

重试已有成功命令时，CLI 从原回执恢复原 expected_revision；结束指派和移交也沿用原指派版本 / 依据，避免被后续 Revision 影响。不同参数仍触发 COMMAND_ID_REUSED。actor list / role list 在一致读快照中返回参与者、所有当前及历史指派和 as_of_event_sequence。

## 旧项目兼容

本次不补造 M0 / 早期 v2 Change 的历史角色。原 v1 回执保留原摘要与结果；新 v1 基础命令仍经过原兼容规则，使用真实绑定 Human Project Owner 和原负责人检查。原生 v2 暂停 / 恢复必须具备显式 Change Owner 指派。

旧 Change 若只有负责人指针，可通过 AssignResponsibility 为同一负责人建立提交时的新指派，或通过 TransferChangeResponsibility 留下实际移交依据。之后继续原生Draft暂停 / 恢复，不改写历史事件和回执。当前格式 1 / 2 / 3 / 4 项目均按 [迁移操作说明](CimiLoop-M0数据库迁移与恢复-v0.1.md)显式升级至 5；升级不默认生成设置、Flow Owner 指派或批准。

## 验证与剩余任务

责任治理交付时，Node 24.15.0 + pnpm 12.4.2 下构建、类型检查、Schema 制品同步及 10 个测试文件 70 项通过。治理验证覆盖身份冒用与回执重放、同人多角色、指派期限与作用域、原子移交、责任空缺、撤销、故障回滚、CLI 幂等重试、两个实际子进程竞争同一角色 / Change 责任、真实 M0 样本升级后的新指派与历史保留。治理测试中的终结状态由测试夹具注入，只用于验证拒绝移交，不代表 CompleteChange 已实现。当前全量结果见实施基线第 10 节。

V1-03 的 ProjectSettingsVersion、目标版本与规划调整、优先级和 WIP 查询、事务内容量检查已接通，具体规则见 [项目设置、规划与容量](CimiLoop项目设置规划与容量-v0.1.md)。V1-04 已以真实确认的 Contract / Plan、专业风险和实际Human决定完成正向开工联调，详见 [约定、计划确认与开工](CimiLoop约定计划确认与开工-v0.1.md)。高风险检查另一位实际Human，登记身份不代表本人批准，Solo CLI不支持代签或切换人类身份；多人登录、AgentGateway与进程隔离继续留给对应任务。
