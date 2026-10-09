# CimiLoop 原执行产物领域依据与 Kernel 核验 v0.1

2026-10-10 D-255：[专用模型原请求衔接](CimiLoop-专用模型原请求衔接-v0.1.md)已接实际 SDK 消息、原提供方思考 / 工具轮次、本机 HTTPS、持久原发送 / 响应锚点和共享 Runtime 工厂；重复或丢响应不重发。真实受批准账户服务、专用原件共同采集及账单结清尚未完成，默认正式 Agent 保持关闭，完整五组 S1 继续。最终验证及失败保留见该文研究记录，以下旧批结果保持原范围。

> D-252；V1-09 / V1-10 续批。完整五组 S1 目标 active，正式默认 Agent 关闭。

## 实际接通的路径

Runtime 包内的 ID 和 SDK / Native 原件相互一致，不能证明其中的约定、计划及任务正文就是 Kernel 原记录。新路径将三个不可变原记录作为独立领域依据传入实际结果核验器。按原 AgentRunRecord 的 contract_ref、plan_ref、definition_ref 读取，不使用当前 Change 的最新 Plan，不与后来更新状态 / 用量 / revision 的可变 Task 行完整结构和正文比较。

共享原观测准备通过既有 Kernel.getObject 获取这三个固定版本；Kernel RecordRunObservation / ReconcileRun 在原事务内再次取同样原记录，核对正文摘要、版本、项目 / 需求归属、计划约定引用及计划内唯一原任务定义，然后向原结果读取端口传递独立克隆。LocalRunVerifier、LocalAgentRunResultVerifier 与 Runtime 结果核验器完整转发，HTTP、CLI、模型或候选 JSON 不能安装领域依据端口。

Runtime 对原 ContractVersion、PlanVersion、TaskDefinitionRecord、包内 Task / WorkItem 执行完整现有 Schema 核验。三个正式记录必须与 Kernel 依据完整结构和正文相等；Task / WorkItem 的项目、需求、任务、全部固定版本引用、执行者及 scope 必须对应原 Run。任务定义正文必须是原计划内 task_id / version 唯一的一项，全文相同。外来版本、同 ID 改正文或不属于计划的任务定义在独立 Native 回读前拒绝，不生成结构化产物证明。

已有独立 Native / IPC / SDK / 模型账本、时序、修改后固定检查和输出逐项对应核验保持。正向产物仍明确 task_acceptance_proven:false、model_account_custody_proven:false、costs_reconciled:false、current_workspace_applicability_proven:false；正式自然语言需求验收、当前源码适用性和原账单各自待证。此步不将 Unknown 改成 RunSucceeded，不满足 Task 或释放未知费用。

## 历史与恢复

内部结果端口新增独立领域参数，不添加公共 Schema 或字段，不改变私有 Packet 2、执行产物1 / 原观测 proof1、242 Schema、用户库10或原启动账本1。没有用户库迁移。缺少独立领域依据时不能产生执行产物证明；如果现存原领域记录无法核对，Kernel 拒绝接受新观测并保留原 Run / 预算，不能复制包内正文充当 Kernel 原件。

旧 Unknown / 失败证明未包含 execution_result_ref 时不进入结构化产物校验，保持 Unknown / 原失败分类。已有 execution_result_ref 按原固定版本重新核验；不能仅因为旧记录曾通过而放行现在发现的不匹配。原证明字节不改写、原 Run 不重启，无法核对时保留原件。已完成的同 Command ID 仍由 Kernel 原收据短路重放，不要求重采集或生成新观测。

原计划后来变化不替换原 Run 的领域依据，也不证明历史产物现在适用；新的 Task 验收与新鲜源码验证仍须走既有 Kernel 规则。每个端口拿独立克隆，不能通过修改回读参数改变业务库。

## 验证与剩余条件

分阶段最终受影响8文件89项89通过0失败、0跳过；实际Windows / AppContainer SDK组合2文件2项2通过0失败、0跳过。614源码各实际阶段内摘要零漂移；中间仅人工Run测试断言更新，无生产代码变化，类型检查原命令复核及CLI帮助通过；完整Native限制按实际原件记录。

实际 Windows 两条新原操作各有一份 Kernel 原约定 / 计划 / 定义，与原 Runtime 包完整结构相等。读 / 检查原 Native 匹配2项，读 / 修改 / 检查匹配3项，固定检查各1、Kernel 原观测各1；产物字段均存在，同 Command ID 重放不再产生观测。SDK调用与实际 Native 效果核验通过，3 / 4轮模型回复及账户资格为构造输入；两个 Run 仍 Unknown、费用未知。原库在只读研究采集前后摘要相等。首次采集脚本误用 runtime_records 表名后按现有 run_records 修正，仅脚本更正、不改原库或生产代码。

先红后绿的反例包含：缺独立 Kernel 依据、同 ID 替换约定 / 计划 / 定义正文、外来 Task / WorkItem 原引用及 Kernel 未传独立第五参数。测试执行真实 SQLite / Kernel，原模型 / SDK 字节和 Native 读取端口仍是明确构造输入；不能作为真实模型、Skill、领域效果验收或 S1 证据。最终受影响回归和实际 Windows 组合详见[分阶段研究记录](../research/CimiLoop-原执行产物领域依据与Kernel核验-2026-10-10.json)。

首次 pnpm check 的 Go 编译器出现 Exception 0xc0000005 / PC=0，未见 TypeScript 诊断；原命令、工具和配置不变的复核通过。首次失败片段保留，原因未证明，不以复核通过消除该原失败或 D-250 Bun / CLR / clock 失败。

真实模型 / 账户 / 套餐 / 现金积分预算和原账单、正式领域验收、物理配额、历史容量 / 完整异常恢复继续；真实 Skill、全面 Plan / Task 前 Human / Matt、独立完整评审及新鲜 Superpowers、工作台正式 Agent 和真实普通需求至 ReadyForDelivery / S1 接入验收不缩减。智谱只确认提供方，模型 / 套餐 / 预算未批准；本批付费请求与真实凭据读取0，不清理历史 Unknown，仅本地提交、不 push。
