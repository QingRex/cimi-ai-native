# CimiLoop 工作台原 Agent 运行控制 v0.1

2026-10-10 D-262：原取消控制帧与独立Native取消证明已接入原采集、共享Human／CLI／HTTP／工作台ReconcileRun。Kernel原cancel_requested、完整调用账本与原认证费用同时成立时结清Cancelled原Run，启动次数不返还、Task不自动满足、原命令不重开账户或Run。实际Windows准备／挂起取消、普通EOF及错误取消帧通过；运行中SDK取消与费用结清仍是受控组合，真实模型／Skill／Matt／Superpowers及完整S1未通过。默认正式Agent关闭，库10／242 Schema、零付费及完整五组持续目标保持。 [实施记录](CimiLoop-原取消证明与终态核对-v0.1.md)。

2026-10-10 D-261：原Native终态、独立SDK／领域结果、原IPC／模型调用和认证账单已接入共享Human ReconcileRun、同一编译CLI与工作台原请求恢复。受控组合验证原Run成功／失败、现金12及剩余预算结清，保留启动次数且不自动满足Task；真实Windows已知账单但缺Native原件时拒绝结清，88继续冻结。受控Native／SDK及公开批准／账单不是实际智谱、真实Skill／Matt／Superpowers或S1证据，完整Native故障与四项账户确认仍未解决。默认正式Agent关闭，库10／242 Schema及完整五组目标保持。 [实施记录](CimiLoop-原执行终态与账单核对-v0.1.md)。

2026-10-10 D-260：原模型请求、账户占用和认证账单已逐笔接入共享Human费用观测、Kernel独立再核验、同一编译CLI及工作台原命令恢复。实际Kernel现金记入12、剩余88继续冻结；Run仍Unknown，不满足Task或ReconcileRun结清。真实Windows原账单保管漂移拒绝新观测，已提交回执仍按原命令重放。测试模型／批准／账单认证为公开构造，非真实智谱或SDK完整终态、Skill／Matt／Superpowers／S1证据；专用Native/Bun故障和四项账户确认继续。默认正式Agent关闭，项目库10／242 Schema保持，完整五组持续。 [实施记录](CimiLoop-原账单费用Kernel接通-v0.1.md)。

2026-10-10 D-259：原Run费用查询已接共享Human服务、受信代码安装的同一编译CLI命令、回环HTTP及工作台按钮。工厂与释放等待后复核原资料，错误只返固定公开码；页面拒绝旧查询／旧页面迟到结果。实际Windows原账户／账单保管→共享服务→HTTP查询与权限漂移Unknown通过，不启动模型、不产生领域结果或Kernel结算。普通CLI／工作台仍需真实原账户工厂，默认正式Agent关闭。上批专用Native／Bun段错误仍未解决；构造账单认证不是实际智谱／Skill／方法／S1证据。项目库10／242 Schema保持，完整五组持续。 [实施记录](CimiLoop-原Run费用共享入口-v0.1.md)。

2026-10-10 D-256：[专用模型原件共同核验](CimiLoop-专用模型原件共同核验-v0.1.md)已由共同采集器和共享应用服务提供给 CLI / 工作台，Kernel 新观察读取时独立重验原提供方请求 / 响应、冻结原 Runtime 输入与操作键、预算占用及每份 raw 字节。缺失 / 损坏原件不产生新成功或费用结清；已提交同 Command 仍精确重放原收据，不占新预算或重发模型请求。真实受批准账户 / 账单、默认正式 Agent 及完整五组 S1 继续，旧验证保持原范围。

2026-10-10 D-254：[原Native输入关闭与执行中断](CimiLoop-原Native输入关闭与执行中断-v0.1.md)已接受控EOF、原进程是否恢复的不可变证明、共享原采集 / Kernel核验及工作台提示；损坏输入仍失败，原Unknown与费用保留。正式默认Agent、真实模型 / Skill / 方法与完整五组S1继续；本批最终验证以新研究记录为准，以下旧批结果保留原范围。

2026-10-10 D-253：[工作台原Agent启动衔接](CimiLoop-工作台原Agent启动衔接-v0.1.md)已接Human请求核权、共享原组合、唯一启动与HTTP / 页面；Native实际放行前重新核权，丢响应只核对原Run。受信工厂默认未安装、真实模型账户未批准；完整五组S1继续，以下各批仍保留各自历史验证范围。

2026-10-10 D-250已接[原监督回读与新鲜工具准入](CimiLoop-原监督回读与新鲜工具准入-v0.1.md)：工作台共享应用服务沿原Runtime工具宿主复用Kernel，新鲜准入前处理停止机会；不能借此宣布正式Agent默认入口或S1完成。

2026-10-09 D-249已接[原恢复控制器保留](CimiLoop-原恢复控制器保留与编译配方-v0.1.md)：共享原查询 / 采集核验launcher2与冻结控制器，缓存丢失原资源恢复不重开Run；原件缺失仍可登记取消，但不能证明已停止或已清理。正式工作台Agent执行和完整S1继续。

2026-10-09，D-234，V1-10 续批。承接 [本地工作台与共享应用服务](CimiLoop-本地工作台与共享应用服务-v0.1.md)及 [Native 原回执独立核验](CimiLoop-Native原回执独立核验-v0.1.md)。本批接通 Human 对已有原 Agent Run 的查询、采集、停止和原资源恢复；正式 Agent 启动 / 接续执行、领域结果及费用结清仍待完成。

## 可执行路径与权限

`LocalAgentRuntimeControl` 位于共享 `packages/local-app`。工作台从自己已固定的 Project / instance / Human 身份调用服务，读取 Store 中原 Run、AgentRunRecord 和 Context，核对原项目、Task / WorkItem / executor / Context、Runtime / Skill / admission 固定关系，使用原 Run / operation_key 进入既有 Runtime Adapter。HTTP 或页面不能传入 Agent 身份、Scope、路径、工具输入或新的操作键。

纯原资料读取器不授予 Agent 权限。原 Agent 工具服务仍要求受信 Agent caller 与原执行者匹配，继续由 Kernel 当前授权决定实际工具许可。Human 控制入口没有借用 Agent caller，也没有安装模型宿主或开放启动入口。

| 动作 | 领域与 Native 行为 |
|---|---|
| 查询原运行 | 核对原登记及当前实际 OS 状态；缺少原资料保持 Unknown |
| 采集原资料 | 采集原字节 / SDK / IPC，以及 D-233 独立 Native 历史回执核验；没有新工具效果 |
| 请求停止原运行 | 先以本地 Human 和 `technical_owner` 请求 Kernel `CancelRun`，成功后再投递同一原操作的取消标记 |
| 重送原停止请求 | 必须已有 Kernel `cancel_requested`，只重送原标记；不创建领域命令或 Run |
| 恢复原资源 | 必须已有 Kernel 取消记录，并由既有 Adapter 核对原 OS 归属及处置证明；不重启 Run 或继续任务执行 |

Kernel 拒绝角色、版本或命令时，不接触 Native 控制端口。取消已提交但 Native 标记响应丢失或原资料缺失时，保留 Kernel 取消记录并显示原操作 Unknown。预算继续待核对，不能因用户按下停止或资源已恢复而释放预约、产生 RunObservation、完成 Task 或结清费用。每次异步操作返回前再次读取原 Scope / AgentRunRecord / Context，资料发生变化则拒绝返回为稳定结果。

## HTTP 与页面

工作台提供 `GET /api/agent-runs/:runId`，以及 `POST /api/agent-runs/:runId/collect|stop|cancel|recover`。`stop` 接受既有严格 `CancelRun` 命令，URL 和命令中的 Run ID 必须一致；其余写路由只接受空对象 `{}`。沿用回环 Host、精确 Origin、本地会话、CSRF、严格 JSON、请求 / 响应限额；读取请求体后再次核对会话与服务状态。

需求详情从 Kernel `getRuns().records` 判断原 Agent Run，显示查询、采集和停止按钮；已有取消记录后显示重送和恢复按钮。输出使用文本节点展示，状态解释明确区分原运行状态、原资源、任务结果与费用。

页面发送停止前保留原 `command_id`、时间和完整命令，另外在原标签页 `sessionStorage` 保存 `agent_runtime_control: true` 传输标记。同源重载后的“按原请求核对”仍选择原 Agent 停止入口，并发送完全相同的命令。标记发送前剥离，不进入 Kernel 命令、协议 Schema 或数据库。既有无标记的人工待核对请求保持原 `/api/commands` 路径。确定 Kernel 取消后可清除命令待核对状态；Native Unknown 继续通过原停止标记重送 / 查询核对，不换新 Run。

正式启动仍显示未启用；“恢复原资源”只处理原资源，不能当作 Agent 接续执行。工作台重启后的会话和浏览器 origin 边界沿用 D-209；随机端口变化不自动迁移旧标签页的请求。

## 操作入口

在满足仓库 Node / pnpm 版本、已安装并编译后，执行 `pnpm workbench --project-dir <已初始化项目目录>`，使用启动器打开的本地会话进入项目。进入需求详情，查看当前任务的原 Agent Run；已有原运行才显示原查询 / 采集 / 停止控制。请求停止须填写理由，并由 Kernel 校验当前 Human 技术责任。响应丢失时先点“按原请求核对”，不要预约新 Run。已有取消记录后，先查询原状态，再按需要重送原停止请求或恢复原资源；保留 Unknown 和未结费用，等待正式结果 / 账单核对。

无 Native 原登记的 Agent Run 会显示原操作 Unknown；本入口不能补造登记或启动原 Run。完整正式 Agent 接入与 S1 操作指南仍须随 V1-09 / V1-11 的真实验收完成。

## 验证与限制

实际结果、命令、初次失败和最终固定源码范围见 [D-234 研究记录](../research/CimiLoop-工作台原Agent运行控制-2026-10-09.json)。应用合同使用真实 Kernel / SQLite，Native 端口为明确构造；HTTP 和页面使用实际服务 / SQLite / DOM，但缺少 Native 原登记时只能验证 Unknown。新增 Windows 场景在实际 OpenCode SDK IPC 等待期间，经工作台 Human 取消，核对原进程停止、采集及原资源恢复。同 Command ID 重放不新增领域事件或 Run，预算保持待核对。

该 Windows 场景通过测试钩子暂停 IPC execute，验证 SDK 等待的中断；不代表文件工具 dispatch 中断、真实模型、真实方法或正式 Agent 准入。D-233 本机 Native / Bun 启动不稳定及历史 Unknown 资源继续按原记录保留，后续通过的独立夹具不能证明旧资源已处置。

最终固定源码受影响回归为 10 文件 / 63 项，61 通过、2 失败、0 跳过。新增共享应用服务7项、HTTP6项、页面丢响应重载1项及实际Windows工作台停止场景通过；失败为既有原操作场景在原身份辅助程序准备时 `native_control_unavailable`，以及既有工作台交接用例15秒测试超时。304个源码 / 测试 / 页面 / 配置摘要前后零变化，类型检查和编译后CLI帮助通过。同一冻结源码失败文件复验为2文件 / 19项全部通过、0跳过；未修改源码、测试或Runtime期限。该复验不覆盖原十文件中的两项失败，本机原生启动稳定性继续列为必要条件；不计作全仓库或S1验收。

本批保持 242 Schema、数据库格式 10 和锁文件，不升级用户库，凭据读取和外部模型请求均为零。完整五组 S1 目标保持：正式 Runtime / 领域结果与账户费用 / 配额 / 全恢复，真实技能及前置澄清，Matt / Superpowers 真实完整行为，工作台正式执行 / 接续，真实普通 Change 到 ReadyForDelivery 与 S1 接入验收。普通工程代码复核不作为 Matt / V1-22 证据。
