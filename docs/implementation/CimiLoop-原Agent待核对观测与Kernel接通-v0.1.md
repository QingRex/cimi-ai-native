# CimiLoop 原 Agent 待核对观测与 Kernel 接通 v0.1

2026-10-09，D-235，V1-09 / V1-10 续批。承接[原运行控制](CimiLoop-工作台原Agent运行控制-v0.1.md)与[原 Native 回执核验](CimiLoop-Native原回执独立核验-v0.1.md)。本批把已有原操作采集接入共享应用服务和 Kernel RecordRunObservation，形成可查询、可按原请求恢复的 Unknown 领域观测。完整正式终态、模型 / 账户、账单、配额、真实技能及 S1 仍须继续完成。

## 可执行路径

工作台以固定 Project / instance / Human 读取原 Run、AgentRunRecord、Context 和原启动登记，不能接受用户传入 Scope、执行者、路径或模型结果。共享 LocalAgentRuntimeObservation 将空 payload 的原命令登记到项目数据目录，以原 project / Run / command_id 为键固定请求、原记录和 Context 摘要。

服务读取唯一原 claim 及完整原 input，调用既有原采集器，重新核对原身份和固定关系，再核对捕获原字节的不可变 blob 摘要。采集快照、原归属证明和 RawAgentRunObservation 保存为摘要寻址的 local_content。持久准备文件固定唯一 rawref / proofref 后，由共享 executeLocalCommand 提交 Kernel；领域权限、CAS、producer / 时间 / Runtime / Skill / admission 固定关系及唯一回执均由 Kernel 校验。

默认 LocalRunVerifier.agent.readRunResult 只读取此版原 Unknown 证明，重核原 claim / input、完整 AgentRunRecord / Context 摘要、准备登记、报告及捕获 blob；报告所有值必须与证明一致。默认启动准入仍拒绝，工具授权端口没有安装。本批没有开放正式 Agent 启动或 JSON 安装模型 / Runtime 端口。

## 证据和费用边界

报告恒为 status unknown、usage cost_known false，由本地 Human 直接观察原采集，固定说明任务终态与费用尚未核对。Native 历史回执 Verified、SDK / IPC 对应、停止或资源处置证明，均不能转成任务成功、真实模型 / 账户资格或费用结清。Kernel 记录一个 Unknown RunObservation，父 Run 保持 Unknown，原 Task 的待核对预算不释放。

本版采集仍标记模型回复为构造、正式执行未启用，不能接受或伪造正式模型终态。资格夹具仅验证接入合同；真实 Windows AppContainer / SDK 场景证明原中断采集到领域观测的组合，不证明正式生产模型或 S1 验收。

原 IPC 最多 128 次交换，每次最多四份原字节 / 元资料，另含一份 header、九份运行资料和一份检查目录；观测读取器允许最多 523 份，每份沿用原采集器 4 MiB 上界。此上界只说明当前采集合同容量，不代替历史保留策略、物理存储配额或完整 V1-09 容量验收。

## 原请求恢复

请求和准备文件以 wx 创建并同步，不覆盖已有内容。同 command_id 不同输入拒绝；并发相同请求使用第一个持久准备结果，Kernel 唯一回执只产生一个领域效果。采集响应丢失时保留原请求，重试继续同一原 claim；不会创建新 Run 或再次执行工具。已形成准备结果但 Kernel 响应丢失时，按同一请求和原 rawref 重放，不重新采集。已提交的原 Kernel 回执可以在后续 Native input 损坏时继续返回；新命令仍须核验原证据。

request / prepared 损坏以存储错误闭锁，保留原文件、原请求与预算。损坏无法证明原命令没有提交；应保留现场核对 Kernel 原回执，不能删除文件或重新预约 Run 绕过。历史 Unknown 资源及旧电脑归属边界继续保持。严格 JSON 在拒绝重复 / 危险键后统一对象原型再进行值比较；不会把解析器的 null 原型差异误判为请求改变。

## 工作台操作

满足仓库 Node / pnpm 要求并安装 / 编译后：

```powershell
pnpm workbench --project-dir <已初始化项目目录>
```

使用本地启动会话进入需求详情。在已有原 Agent Run 上查询 / 采集，点击“记录待核对观测”。`POST /api/agent-runs/:runId/observe` 只接受严格原命令和空 payload，URL 与命令 Run ID 必须一致；沿用精确 Host / Origin / 会话 / CSRF，用户不能提供 rawref 或成功报告。

页面发送前保存原命令及仅在浏览器使用的传输标记。丢响应后的“按原请求核对”使用同 command_id、时间、payload 和观测入口；跨同源重载保持原输入，标记不进入协议或数据库。既有停止请求仍走原停止入口。observe 返回 Kernel 原回执；collect 只读原资料，不自动写领域观测。

原登记缺失或无法核验时拒绝制造观测。Unknown 观测只是待核对事实，不能作为完成或释放预算的按钮。工作台重启的随机端口 / origin 边界沿用 D-209 / D-234，不自动迁移旧标签页。

## 验证范围

实际命令、源码固定摘要、失败后实现及最终结果见[D-235 研究记录](../research/CimiLoop-原Agent待核对观测与Kernel接通-2026-10-09.json)。合同使用真实 Kernel / SQLite，但 Agent 资格、owner 和不完整 claim 为构造；523 份容量资料也明确构造，不作为真实 IPC 证据。HTTP / DOM 使用真实服务与原命令回执，覆盖丢响应重载。Windows 场景在真实 SDK 等待中断、原进程停止、采集和资源恢复后，以 Human 记录一个 Unknown 观测并重放同一回执；模型回复 / 资格仍为构造。

最终固定源码受影响回归为15文件 / 111项：110通过、1失败、0跳过。新增共享原观测11项、原身份读取2项、HTTP观测2项、页面观测丢响应重载1项及实际Windows工作台原SDK等待中断→采集→Unknown观测与原回执重放组合均通过。失败为既有原Task累计期限场景，预期期限耗尽中断却收到 native_control_unavailable；根因尚未确认，不计作通过，也不扩大为全部Native能力失效。306个源码 / 测试 / 页面 / 配置摘要前后零变化。类型检查和编译后CLI帮助通过；不是全仓库或完整S1验收。

同一冻结源码失败文件复验为1文件 / 4项全部通过、0跳过；未修改源码、测试或期限，不覆盖首次111项回归中的失败。本机Native原生启动稳定性仍未证实，D-233 / D-234旧失败及历史Unknown资源继续保留。

242 Schema、数据库格式10及锁文件保持，不升级用户库；凭据读取和付费请求均为零。普通工程独立复核不作为 Matt / V1-22 真实方法。完整五组 S1 目标保持：正式 Runtime / 领域终态与模型账户费用 / 配额 / 全恢复，真实技能与前置澄清，Matt / Superpowers 实际方法，工作台正式执行 / 接续，以及真实普通 Change 到 ReadyForDelivery 和可操作 S1 接入验收。
