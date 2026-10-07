# CimiLoop SkillInvocation 原生记录与核对 v0.1

> 2026-10-07，D-215，V1-21 续批。实现调用前预约、原始观测、Human 核对及父 Run 关联。复用格式 10 的不可变运行记录表，SQLite 布局未变。生产宿主、真实方法资格和真实调用仍待接通。

## 调用前预约

`ReserveSkillInvocation` 的目标为父 Run，要求固定 Agent 执行者、可信调用身份和当前 Run Revision。命令只能选择 Context 已固定的 Skill Binding、方法名和本地输入内容引用，不能指定原调用键、包、摘要、资格或 `verified` 字段。

Kernel 重新核验当前 WorkItem、原任务基准、授权与预算、源码和 Runtime / Skill 批准关系，并核对原宿主准入凭据。父 Run 必须是 Reserved / Running，没有取消、未知费用或未结清的前一技能调用。当前按原 Run 串行预约技能，单 Run 最多 64 次；次数和费用均不能重置。

正式评审输入的每个资料引用必须含内容摘要；裸 locator / version 不能固定可变化的 diff / issue 内容。实际资料字节和工作区权限由宿主继续核验，输入摘要不能代替读取原资料。

可信进程内 `SkillInvocationVerifierPort.prepare` 只读取和核验资料，不执行方法、不调用模型。宿主须验证实际输入、Git 包、输入 / 输出 Schema 字节、命名入口及完整依赖、真实方法资格与权限交集。Kernel 再验证源码 / 包摘要、Schema 引用、能力用途与 Binding：`intent.clarify` 对应 clarification，`verification.review` 对应 review；独立只读 Context 只接受 review。

不可变 `SkillInvocation` 固定父 Run / 原操作键、Context、Runtime / Skill Binding、执行者、宿主准入、能力、输入引用、命名请求、来源 / 包 / Schema 与方法资格引用。原调用键由 Kernel 分配，输入摘要覆盖整个原预约。预约、父 Run Revision、事件和回执在同一事务提交；同一命令重放返回原预约。真实宿主应在预约已提交后才按该键认领和发起实际效果，中断后继续核对原键。

原预约回执不授予新的执行权。实际 dispatch、工具效果与效果重放前，生产宿主仍须重新核对当前 WorkItem / Provider / 预算授权并持久认领原调用；本批尚未接入实际效果驱动器。

## 观测、输出和恢复

`RecordSkillInvocationObservation` 和 `ReconcileSkillInvocation` 以父 Run 为目标，并引用原 SkillInvocation。原始报告格式为 `cimiloop/skill-invocation/1.0.0`，使用 `skill_invocation_report` 内容引用，另固定 `skill_invocation_proof`、原调用键、父操作键、输入摘要、具名记录者、时间、币种和待解决观测。

宿主通过 `readResult` 读取原始结果，核对原 SDK / 工具 / Native / 计费账本、输出 Schema 和内容字节。Kernel 验证报告归属与固定输入，并严格解析方法输出；成功必须有输出，其他状态不携带成功输出。输出用途须匹配输入。评审依据须来自固定输入的资料引用，额外 Task 状态或 Gate 批准字段被拒绝。方法结果只保留候选 / 观察，不创建决定、满足任务或推进 Gate。

观测保留 current / late / conflicting 和 resulting_status。未知效果、未知费用或冲突保持待核对；之后的直接成功不能清除 Unknown。`ReconcileSkillInvocation` 要求当前 Human 技术责任、最新确定结果和完整未知 / 冲突覆盖。已有调用效果或费用时拒绝认定 not_started。批准或 WorkItem 撤销后仍可核对旧效果，核对不会授予新的执行权。

父 Run 结清前必须先结清全部子调用。父报告费用不得少于各原调用的累计已知费用；子调用原费用取已知最大值，不因迟到报告或较低报告减少。子调用记录不重复扣 Task 费用，Task 的账单和 attempt 仍由父 Run 统一结清。未知子效果 / 费用、冲突或已结清父 Run 收到新子事实会重新标记父 Run 为 Unknown / 待核对；完成子核对后仍须核对父 Run。迟到效果推翻 not_started 时保留原父 / 子操作键，并由原 Run 核对撤回次数返还。

本层是原生同币种金额账本。实际 Coding Plan 积分、账户唯一账本、模型输入 / 思考输出上限、每次调用的物理费用上界和真实账单仍须由生产宿主与计费准入完成；不能以记录层金额代替这些要求。

## Store、CLI 与工作台

新增 `skill_invocation` 和 `skill_invocation_observation` 记录复用既有 `run_records` 表与不可变触发器。Store 写入严格验证记录 Schema、原父 / 子归属、固定 Binding、任务版本及全表原调用键唯一性；事务写锁保护跨进程写入。没有新增 SQLite 表 / 索引 / 触发器，数据库格式仍为 10，没有升级用户库。格式 7–9 的预检查使用明确的冻结 Human 记录集合，不会因新注册种类而允许技能事实。

`object show skill_invocation <id>`、`object show skill_invocation_observation <id>` 和 `run show <change>` 返回实际保存的事实；工作台任务详情展示调用及原始观测。Run 查询新数组为可选字段，原响应仍可严格解析。

Human 技术责任核对入口：

```text
cimiloop run skill-observe <run-id> --file payload.json --raw-file observation.json
cimiloop run skill-reconcile <run-id> --file payload.json --raw-file reconciliation.json
```

payload 包含 `invocation_ref`，目标 Revision 为父 Run Revision。报告导入只是保存内容，不把人工编写内容变成可信调用证明；默认本地应用没有 Agent / Skill 宿主，正式预约和结果核验仍拒绝执行。工作台共享命令入口也仅增加观测 / 核对，不能自报 Agent 身份或预约正式技能。

## 验证边界与下一步

领域测试沿用 D-214 **直接插入的构造受控 ALLOW**，并使用构造方法资格、包引用和结果证明宿主，没有实际 SDK / 模型 / 包行为或计费。真实 SQLite 和本地内容摘要验证预约、重放、重开、关系、事务、费用、Unknown、撤销授权后核对、冲突与迟到效果。构造通过不作为正式 Provider 批准或真实方法验收。最终测试范围、原报告路径与摘要见 [D-215 验证记录](../research/CimiLoop-SkillInvocation原生记录与核对-2026-10-07.json)。

Node 24.15.0 / pnpm 12.4.2 下构建、类型检查与 Schema 导出通过。相关回归覆盖 15 个测试文件、133 项；最后补齐评审资料摘要约束后，直接受影响的 2 个文件、12 项再次通过。本批未重跑整个仓库测试。223 个既有 Schema 中 199 个内容不变，24 个因新增记录和命令扩展，另新增 11 个；13 个 Human / Agent / 固定方法 / 包契约主体保持原样，不变 Schema 的原检出字节已恢复。

下一步接实际命名方法资格规则与生产宿主，完成真实 Human 分轮澄清、固定 diff / issue 的独立评审、委派 / 命令 / 验证能力和 Matt / Superpowers 行为对照。继续完成真实工作区工具 / IPC 账本、原操作恢复、费用和物理硬配额准入、正式工作台操作，以及普通真实 Change 到 ReadyForDelivery 的 S1 验收。整体目标保持 [V1 实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md) 的原范围；本批不宣布正式 Runtime / 技能或 S1 完成。

当前 SkillInvocation 必须关联已预约的 Agent Run，不能替代 Draft / IntentReady 阶段的澄清入口。还须为确认 Plan / 创建 Task 之前的澄清建立原生受控授权和固定上下文，保留 Human 各轮回答及候选关系；不能先伪造正式 Plan / Task 才进行需求澄清。
