# CimiLoop 原 Agent 启动授权与共享组合 v0.1

2026-10-09 D-249补[原恢复控制器保留与编译配方](CimiLoop-原恢复控制器保留与编译配方-v0.1.md)：共享启动工厂先登记源码配方、保存原物理控制器再启动，创建前和config发送前新鲜核验；编译中断不重试，Run启动身份和Kernel权限不变。

2026-10-09，D-236，V1-09 / V1-10 续批。承接[原待核对观测](CimiLoop-原Agent待核对观测与Kernel接通-v0.1.md)。本批实现 Kernel 当前启动检查、从原业务资料组装启动输入的共享服务，以及先登记再启动的本地屏障；实际 Windows 场景通过该服务接原 Native / SDK 执行器。正式生产驱动、模型账户账本、跨电脑启动保管链和完整五组 S1 继续实施。

## 当前可执行路径

受信 Agent 组合使用已由 Kernel 预约的 Run ID 调用 LocalAgentRuntimeStart.start。它不接受模型、提示词、文件替换参数、执行者、Provider 或批准标记。Human CLI / 工作台没有安装该组合；工作台现有原查询、取消、采集、Unknown 观测及恢复继续复用共享应用服务。

Kernel assessAgentRunLaunch 是内部受信宿主查询，沿用现有固定 Scope 字段校验，没有增加序列化协议、Schema 或数据库布局。查询和工具授权共用原 Run / Record / Context / Task / WorkItem 关系、当前授权与期限、取消、原预算、Provider 批准与固定绑定、未结 Skill、原 Source / Workspace 归属检查。工具的 action / resource / 只读边界及 checkToolAuthority 仍独立保留。

启动还必须重读当前 Source / Workspace，并调用独立 checkRunAuthority。工具许可、Context 旧准入或 JSON 的 approved / verified 不能替代此证明。无该端口、当前证明读取失败或摘要不合法，均拒绝；默认 LocalRunVerifier 不安装启动端口。启动查询只读业务事实，不创建 Run、事件或账单，不释放预算。

共享服务从同一 Store 快照读取原 TaskDefinition / Plan / Contract、Record / Context、Source / Workspace 和 Runtime / Skill 固定对象，核对版本与归属，将完整输入及摘要交给受信 prepare。prepare 只准备原时钟、固定检查和模型保管等运行资料，不执行 Native、工具、模型或计费效果。异步准备后再次核对 Kernel 与完整输入；变化或取消即拒绝启动并处置本次 staging。staging dispose 不得删除原 Native、账户或历史 Unknown 资料。

## 本地唯一启动与响应丢失

同一进程的相同原身份复用正在执行的 Promise。跨进程以项目数据目录 agent-runtime-starts / project / Run 的独占目录作为不可修复的本地启动登记，再以 wx 和 fsync 保存 materials.json 与 dispatch.json。原材料和当次启动准入摘要先落盘，之后再核对当前事实，才调用一次 launch。中断发生在目录创建、材料写入、Native claim 或响应任一位置时，登记均保留；损坏、半份或未确认的登记为 Unknown，不能删除登记或再调用 launch。

受信驱动仍必须使用既有 Native claim-before-effect。服务先检查原 Run 和 operation_key 两份登记；仅本地二者明确 ENOENT 才继续独立启动准入。单边登记、权限错误或原 input 损坏不视为 absent。已有完整原 claim 返回原 operation_id；不重新检查首次启动的当前工作区，因此工具已修改文件、后来取消或响应丢失时仍能核对原操作。返回 original 只说明原登记可读取，completion_proven 恒为 false；业务结果和费用继续由原观测 / Kernel 核对路径处理。

## 跨电脑与生产装配的未完成条件

本地 absent 不是从未启动的证明。旧电脑原 Run 可能仍为 Reserved / Running，而非 Git 宿主目录没有迁移。checkRunAuthority 必须从独立受保护原宿主账本证明固定原机器、登记根与首次启动资格；该跨电脑账本及生产驱动本批尚未实现。不得安装一个只依据本地缺文件的肯定端口，也不能将接口注释或构造测试当作该生产能力。新组合无原宿主证明时在 prepare / launch 前拒绝，测试覆盖此默认拒绝行为。

实际 Windows 测试的受控资格、启动证明和模型回复仍为构造，原 Native / AppContainer / SDK 效果是真实执行。本批只验证新共享路径与既有原登记、实际效果及原采集的组合；不能证明正式模型 / 账户、实际费用、完整生产 Runtime 或 S1。公开夹具 GatewayCreditLedger 没有提升成生产账户账本；智谱模型、套餐、现金 / 积分上限未确认前仍无付费调用。

## 验证与剩余工作

最终固定源码受影响回归为9文件 / 77项：76通过、1失败、0跳过；同源失败文件复验为1文件 / 9项：8通过、1失败、0跳过，两次均为IPC原生控制器启动的agent_ipc_native_exit_unproven，未完成该项预定阶段断言。根因尚未确认，不证明原生启动稳定性。实际AppContainer生命周期4项及其新共享启动组合通过。311个源码 / 测试 / 配置摘要零变化；pnpm check、编译CLI帮助、15文档UTF-8 / 链接 / 围栏及diff检查通过。首次失败和复验分开保存；旧IPC测试的自身清理没有保留失败夹具原目录，原JSON仍保留，故现场取证有缺口；没有删除历史Unknown。同源仅单独运行native_prepared一项通过，另8项被过滤；这是诊断，不算完整原生回归通过，也不覆盖两次完整文件中的启动失败。该结果区分了单例路径与完整文件执行，但没有确定根因。

新增合同覆盖独立启动证明、默认拒绝、原固定关系、源码变化、当前取消、异步准备后拒绝、并发原请求、响应丢失、原登记缺损以及新组合无原宿主证明；复验既有 Agent 工具权限与原 Agent 记录、Human 原控制 / Unknown 观测、实际 Windows SDK / IPC 生命周期。实际次数与原失败另见[本机研究记录](../research/CimiLoop-原Agent启动授权与共享组合-2026-10-09.json)。测试通过范围不能扩成全仓库或完整 S1。

当前仍须接完整生产驱动、真实模型 / 账户与单一受保护账本、批准费用 / 账单、原宿主启动资格、物理配额与历史容量、跨启动 / 登录恢复；推进真实 Skill、Plan / Task 前 Human / Matt 澄清、独立完整评审 / 当前源码验证、正式工作台执行及普通 Change 到 ReadyForDelivery 的真实验收。242 Schema（18 v1 + 224 v2）、数据库格式 10 保持，未升级用户库。完整持续目标保持 active，本批只本地提交、不 push。
