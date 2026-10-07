# CimiLoop Agent 上下文与运行固定关系 v0.1

> D-221 续批实现独立 Agent 当前工具授权查询，见[入口及边界](CimiLoop-Agent运行实时工具授权-v0.1.md)。本页保留 D-214 原生记录与验证范围。

> 2026-10-07，D-214，V1-09 / V1-21 续批。新增原生 Agent 记录分支与可信宿主核验接口，数据库格式 10。生产 Agent 宿主及 Task 范围批准尚未接通，本批不表示正式执行已启用。

## 固定关系与准入

`AgentContextManifest` 固定任务、WorkItem、约定 / 计划 / 定义版本、源码与实际工作区，另固定 Runtime Binding、最多 8 个 Skill Binding 及宿主准入内容引用。Context 摘要包含这些关系。Human Context 保留独立严格 Schema 和原字段；Human 与 Agent 的准备输入不能混用。

Kernel 要求执行者通过可信 Agent Caller，并与 WorkItem、Runtime Binding 的原生身份一致。每个 Binding 必须属于当前项目，摘要、种类、声明能力、依赖、输入输出 Schema 和权限声明相符；要求 `task_execution` 范围批准、受控执行 ALLOW、准确的评测 / 证据关系和仍有效的 Human Project Owner 指派。Runtime 必须声明 `runtime.execute` 并覆盖 WorkItem 动作；Skill 必须固定同一个 Runtime Binding，所需动作须同时由 Runtime 和 WorkItem 覆盖，资源与网络声明须在 Runtime 的声明边界内；宿主另核验实际 WorkItem 资源交集。本阶段拒绝环境权限和重复 Binding。Provider Descriptor 依赖的正式准入尚未实现，当前有此类依赖时拒绝；包内方法依赖继续按 D-213 处理。

上述元数据只构成必要条件。宿主须通过进程内 `AgentRunVerifierPort` 重新读取实际资格、来源 / 包 / Schema 字节，核验当前权限交集、物理配额、费用上限与恢复账本，并返回固定的 `agent_host_admission` 内容引用。命令不能传入核验器、准入引用或 `verified` 标志。共享应用服务默认没有这个 Agent 宿主，CLI 和工作台不会因新增 Schema 而启动正式 Agent。

准备、预约、CheckResumption 和暂停需求恢复会核对固定关系及当前宿主凭据。凭据变化要求重新准备，凭据缺失 / 核验失败拒绝新运行。普通命令重放仍先核对可信调用身份，再返回原回执；重放不创造新的操作或消费次数。

## 原生预约、结果与核对

`AgentRunRecord` 从 Context 复制全部 Binding 与宿主凭据，保留原 `operation_key`、递增 attempt、固定输入和累计预算。Agent 必须具有明确的同币种费用预算。本阶段尚未接入每次模型调用的可信费用上界分配器，Agent 预约必须占用全部剩余批准费用上限，拒绝零额或部分预约；实际账单核对后按累计已知费用结清。此处为原生同币种金额预算，尚未代替真实 Coding Plan 套餐积分准入和账户账本。

`cimiloop/agent-run/1.0.0` 原始报告使用 `agent_run` 引用，另固定 Context、Binding、宿主准入及 `agent_run_proof`。宿主必须核对原操作归属和 SDK、工具、Native / 隔离、计费原始证明。Kernel 再核对预约身份、输入、时间、币种和全部固定关系。人工原始报告不能结清 Agent 运行，Agent 报告也不能用作 Human 运行报告。

Unknown、取消请求、冲突、迟到和未启动返还沿用原生累计账本语义。缺失证明或未知费用不能被成功状态、进程清理或重复请求抹掉。工作授权 / Provider 批准撤销后仍可以核对已发生的原操作，核对不授予新效果；确定性冲突解决与未启动返还须由当前 Human 技术责任发起，并覆盖全部待核对原始观测。Run 成功仍不自动满足 Task 或推进 Gate。

## 格式 10 与历史兼容

格式 10 增加 Agent 关系写守卫：预约须匹配原 Context 的任务 / 执行者 / 输入 / 工作区与固定 Binding；观测须匹配原运行类型、操作键和 Binding。守卫按摘要与引用的标量字段核对，JSON 键顺序不影响相同内容，Skill 数组顺序仍须匹配。Store 仍逐记录执行严格 Protocol 校验。

支持显式格式 1–9→10；新建项目使用格式 10，旧库不能自动打开为新格式。格式 9 预检查同时核对 Runtime / Skill 证据与评测规则、Skill 的固定 Runtime、原批准 / 事件 / 回执；格式 7–9 的运行记录使用冻结 Human Schema，拒绝把 Agent 事实塞入旧格式。迁移保留已有状态、历史及原始内容，备份原数据库和内容后才安装新守卫；四个中途故障点保持事务回滚。没有升级用户现有数据库。

## 验证边界与剩余工作

新增 Agent 领域测试使用**直接插入的构造受控 ALLOW 和构造宿主**，只验证 Native 记录、事务、固定关系、预算与 Unknown 核对。现有受控资格规则仍有缺项，不能经批准命令产出正式 Task Binding；这些测试不构成实际模型、隔离、费用或方法行为验收。验证结果及原始报告摘要见 [D-214 验证记录](../research/CimiLoop-Agent上下文与运行固定关系-2026-10-07.json)。

最终构建 / 类型检查通过。首轮全量 62 个文件、878 项测试中 875 项通过、3 项失败；修正 Owner 责任移交测试与当前迁移版本断言后，补充 JSON 键顺序及 Agent 暂停接续测试，最终受影响的 5 个文件、67 项全部通过。合并各文件最新结果覆盖 880 项，未声称再次全量一次通过。首次 IPC 清理失败及后续 12 项通过均保留，Runtime 实现未因该现象修改；固定等待时间是疑点，尚未证实根因。Schema 核对保留 196 个旧文件原字节，14 个聚合 / 运行契约有意扩展，新增 13 个独立 Schema；4 个 Human 契约正文与旧版本一致。

完整目标的验收逐项保留如下：

| 要求 | 本批后的实际状态 / 下一步 |
|---|---|
| 正式 Runtime | Agent 记录契约与可信核验接口已实现；接生产组合入口、实际受控资格及 Task 范围批准 |
| 真实工具效果 | 接正式工作区文件 / 命令约束，将 D-208 实时授权和工具账本接入 IPC / OpenCode |
| 原操作恢复 | 接真实 SDK / 工具 / Native / 费用证明；中断和接续不得换原操作键重启未知效果 |
| 费用与配额 | 落实真实套餐 / 工具资格、服务端输入 / 思考输出上界、受保护唯一账户账本、批准预算和账单；完成物理文件系统硬配额 |
| 技能 | Context / Run 已能固定 Skill Binding；新增明确命名适配资格规则和原生 SkillInvocation 记录，接真实分轮澄清、固定 diff / issue 与独立评审 |
| 方法行为 | 补齐声明的委派 / 命令 / 验证宿主能力，完成 Matt / Superpowers 行为对照与默认 Provider 结论 |
| 最小工作台 | Human 阶段已实现；接正式执行、状态和恢复操作 |
| S1 普通真实 Change | 完成批准→正式 Agent→独立评价→真实 Skill 记录→中断接续→ReadyForDelivery；当前未验收 |

继续按 [V1 实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md) 完成上述工作。本批不把记录层成功算作真实运行完成，不改变 `skill-provider-assessment/1.0.0` 的内置 Skill 要求；D-211 加载失败与 D-213 合成映射证据继续保留。
