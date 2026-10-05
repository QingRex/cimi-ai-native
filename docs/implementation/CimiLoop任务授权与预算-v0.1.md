# CimiLoop 任务、授权与预算 v0.1

> 2026-10-04：V1-05 已接通 Protocol、Store、Kernel 与 CLI。实施入口为 [V1 可执行设计与实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)。本阶段支持正式计划任务初始化、具体执行授权、常规授权命中 / 修订 / 撤销与累计预算准入；创建 WorkItem 不启动 Runtime。

后续进展：V1-06已接通人工任务满足、依赖评价核验、条件核验、证据失效处置及普通 / 高风险安全集成，当前数据库为格式7；V1-05当时格式5及测试记录保留。实际边界见[证据、评价与安全集成](CimiLoop证据评价与安全集成-v0.1.md)，V1-07已接通Human运行预约 / 消费、未知核对、交接与接续；见[运行预约与交接恢复](CimiLoop运行预约与交接恢复-v0.1.md)。真实Agent Runtime及执行隔离仍待V1-09。

## 任务与固定定义

先完成 [约定、计划确认与开工](CimiLoop约定计划确认与开工-v0.1.md)。`InitializePlanTasks` 从当前真实正式 Plan 提取不可变 TaskDefinitionRecord，记录 ID 与 Plan 中的逻辑 `task_id` 分开，运行 Task 使用后者。任务绑定精确 Contract、Plan 和定义版本，初始为 Pending，用量为零。

初始化须由实际 Human technical_owner 发起，目标 Change 有独立 CAS，且为 Active IntentReady / Executing。同一正式计划已初始化时返回 TASKS_UNCHANGED，成功命令按原 ID 可重放；失败不留下半批任务。定义 ID / 版本不能改变内容，任务 ID 不能跨需求复用。

开工前调整正式计划时，尚无授权历史的 Pending 任务可重新绑定新版本，保留 Task ID 与用量；被移除的未授权任务记录为 Cancelled。已有授权或执行历史时拒绝重新初始化，须等待后续受控回流 / 恢复流程。当前只初始化需求计划中的任务；项目 / 批次共享任务仍在 S2 对应任务实现。

## 具体授权与常规授权

`CreateWorkItem` 以 Task Revision 为 CAS，原子保存 WorkItem、Task 关联、具体授权记录（适用时）、事件、Outbox 与 Receipt，不增加 Change Revision。需求必须已正式开工且 Active，Task 定义及当前正式基准须一致；任务依赖须真实 Satisfied 且核对实际评价；V1-06已接通人工评价 / 原生满足记录核验，任意 Satisfied 标签与虚构引用不能解锁。跨需求依赖也重新核对。每个 Task 最多一个 Ready / Active WorkItem；并发创建只有一条成功。

WorkItem 固定执行者、精确基准、授权依据、动作 / 资源、预算、停止条件和继承用量。只允许 `read_files / edit_files / run_checks`；资源采用有界仓库相对路径或 `目录/**`。拒绝绝对路径、越界、根通配符、控制目录、编码路径和 Windows 路径别名。编辑须在 TaskDefinition.allowed_changes 内，验证任务只读。实际命令和文件访问的约束将在受控 Runtime / Tool Adapter 中实施；`run_checks` 不是任意 shell 权限。

两种授权入口分别保存事实：

- 具体授权：实际 Human technical_owner 核对目标与历史，产生不可变 WorkItemAuthorizationRecord，包含精确内容、实际 Assignment 和历史用量摘要。首单摘要由 Kernel 生成；有既有 WorkItem 时必须显式提交当前 acknowledged_usage_digest。
- 常规授权：实际 Human policy_owner 另有相应资源范围 technical_owner 指派，发布有期限的 StandingAuthorizationVersion。版本包含 scope、执行者清单、动作 / 资源、风险 / 目的条件、额度和双方责任依据；旧版本不可改写，修订须匹配精确前置版本。首次命令核对 Project CAS，创建独立授权聚合而不增加 Project Revision；后续修订 / 撤销使用该聚合自身 Revision。

常规授权当前只覆盖 Project / Change 范围、ordinary 风险，无环境权限；必须给出有效 UTC 起止时间，不能回溯，期限距提交不超过 30 天。命中时仍核对实际身份、当前版本、指派期限、风险、目的、动作、资源和预算。命令使用 acting_role=executor，必须由绑定执行者本人发起；executor 是执行身份声明，不是新增 Human 责任角色。Agent 无法借此取得 technical_owner 或 policy_owner 权力。CLI 只能使用本地绑定 Human 本人的常规授权；真实 Agent 入口由后续 Runtime 接通。

独立验证 WorkItem 与同需求实施 WorkItem 必须使用不同 Actor，检查不依赖授权先后顺序；另一个 Actor 本身不能证明独立会话 / Context 或评价有效，V1-06已接通独立Human最小只读Context，真实Agent会话 / 运行隔离在V1-07 / 09接通。发布操作任务当前拒绝授权，等待环境与发布边界。

规则固定为 `work-item/1.0.0`，不接受任意 policy_ref 作为授权。通用策略、条件批准和受控例外在相应后续任务实现。

## 累计预算与撤销

预算使用正整数 max_attempts、max_elapsed_ms，以及可选 max_cost `{currency: 三位大写币种, amount_micros: 整数微单位}`，避免浮点费用。Task.usage 持久保存累计尝试、首次开始时间、已知费用 / 币种及在途核对标记。WorkItem 保存授权时的继承快照；用量计算以当前 Task 事实为准。

本阶段实现额度持久化和准入计算；实际尝试预约、Provider 启动、运行消费 / 费用核对在 V1-07 的 StartRun / RunObservation 实现。正常新任务尚无消费，测试中的累计耗尽样本用于拒绝验证，不是实际运行或费用记录。

经过时间从 Task 首次 StartRun 预约提交计算，包含排队、等待和停机，换单 / 重启 / 新会话不重置。次数、费用或时间耗尽、费用币种不符，以及在途 / 费用未知均阻止新授权。具体 Human 新授权可以在核对真实历史后增加明确额度，用量不会归零；常规授权不能自动加额或绕过人工停止。

`RevokeWorkItem` 由实际 Human technical_owner 提交，只修改撤销状态 / 原因并原子解除 Task 关联，原始授权条件与累计消费保留。若已 Active，则标记在途待核对并阻止继续授权。撤销不证明 Runtime 已停止，取消 / 核对在运行阶段实现。

`RevokeStandingAuthorization` 记录独立不可变撤销事实，同时更新授权状态。修订或撤销使引用旧版本的 WorkItem 派生准入失效；不把撤销记录冒充外部动作已取消，也不重写旧单的依据。后续 StartRun 必须再次校验当前授权事实。

ExecutionShowResult 在同一读快照返回任务、定义、WorkItem、常规授权 / 版本 / 撤销、具体授权、派生 readiness / 用量摘要 / 剩余额度和事件序号。ready 只表示本阶段授权准入满足，不代表工作区、Context、Provider、运行预约、独立评价或生产交付已完成。

## CLI

使用 Node.js 24.15+ / pnpm 12.4.2，`pnpm build` 后执行；角色先通过 `role assign` 单独指派。

```powershell
pnpm cimiloop --json task initialize CHG-0001 --plan-id <正式Plan记录ID> --plan-version 1
pnpm cimiloop --json change start CHG-0001 --plan-id <正式Plan记录ID> --plan-version 1 --reason "正式开工"
pnpm cimiloop --json task list CHG-0001
pnpm cimiloop --json work-item create <Task逻辑ID> --file work-item.json
pnpm cimiloop --json work-item revoke <WorkItemID> --reason "人工停止"
pnpm cimiloop --json work-item list CHG-0001
pnpm cimiloop --json authorization publish --file authorization.json
pnpm cimiloop --json authorization publish --authorization-id <既有授权ID> --file authorization.json
pnpm cimiloop --json authorization revoke <授权ID> --reason "收回权限"
pnpm cimiloop --json authorization list
```

`work-item.json` 是严格 CreateWorkItem payload，不是完整命令：

```json
{
  "definition_ref": { "object_type": "task_definition", "id": "<实际定义记录ID>", "domain_version": 1 },
  "executor_ref": { "object_type": "actor", "id": "<已登记执行者ID>" },
  "allowed_actions": ["read_files", "edit_files", "run_checks"],
  "allowed_resources": ["src/query.ts"],
  "budget": { "max_attempts": 3, "max_elapsed_ms": 60000, "max_cost": { "currency": "USD", "amount_micros": 1000000 } },
  "stop_conditions": ["超出授权范围或预算即停止"],
  "reason": "技术责任人核对后授权"
}
```

占位 ID 须替换为 task list / actor list 中真实 UUID；文件编辑范围须实际属于任务。使用常规授权时加入精确 standing_authorization_ref `{object_type: standing_authorization_version, id, domain_version}`，执行者必须是当前可信入口绑定 Actor。修复具体授权时加入 task list 返回的 acknowledged_usage_digest，期间历史改变会拒绝，需重新核对。

authorization.json 保存 [StandingAuthorizationBody Schema](../../packages/protocol/schemas/v2/StandingAuthorizationBody.schema.json) 中的 body：scope、executor_actor_ids、allowed_actions / resources、空 environment_ids、ordinary 风险及 allowed_purposes、未来 valid_from、expires_at、limits。正文不嵌入命令 Envelope；授权详情可用 authorization list 的完整 JSON 查看。

所有修改命令支持 --command-id 和 --expected-revision。省略 CAS 时读取真实对象；重复原 ID / 原参数可在后续写入后重放原回执。原输入不同返回 COMMAND_ID_REUSED，不把重放当作新授权。初始化及具体授权分别核对 Change / Task CAS，撤销核对 WorkItem CAS；常规授权首次核对 Project、修订 / 撤销核对 Authorization。

## 存储与验证

SQLite 当前格式为 5，增加 execution_objects 和严格不可变 execution_records；固定定义、授权版本、具体授权及撤销记录保存唯一约束。任务用量不允许回退，WorkItem 原始授权条件不允许改写；事件、关联、Outbox 和成功回执随事务整体提交 / 回滚。

格式 1 / 2 / 3 / 4 须通过 [显式迁移](CimiLoop-M0数据库迁移与恢复-v0.1.md)。格式 4 另检查确认历史、正式指针、生命周期及回执连续性，保留实际 IntentReady / Executing 和暂停事实；新增空任务 / 授权表，不补造任务、批准或运行。测试仅升级临时样本。

验证覆盖真实任务初始化与计划版本调整、绑定 Agent 的自动授权、精确范围 / 目的 / 指派 / 期限、独立执行身份、具体授权修复、预算耗尽 / 未知拒绝、故障整体回滚、双进程 Task CAS、格式 4 历史升级及四处回滚、CLI 全链路及原回执重放。全量结果与下一步见实施基线第 10 节；V1-06 本阶段人工证据、专业复核和安全集成已接通，下一步 V1-07 接实际运行预约和交接恢复，Runtime / Matt / Superpowers 包装仍在 S1。
