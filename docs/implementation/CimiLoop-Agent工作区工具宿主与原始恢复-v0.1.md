# CimiLoop Agent 工作区工具宿主与原始恢复 v0.1

日期：2026-10-07。D-222 延续 [Agent 实时工具授权](CimiLoop-Agent运行实时工具授权-v0.1.md)，将独立查询接入真实工作区文件效果及原调用恢复。生产 Runtime 准入、认证 IPC / OpenCode、固定检查命令、真实模型 / 费用与完整 S1 仍待完成。

## 固定原生 Agent 身份

新增 `LocalAgentWorkspaceToolService.open(context, runId)`。可信组合器提供项目位置、Agent Caller 与绑定该 Caller 的 Kernel；服务重新读取当前项目、原 Run / AgentRunRecord / AgentContextManifest 和原 Actor，核对项目 / 仓库、执行者及 Provider 身份、任务 / WorkItem / Context、Runtime / Skill Binding 与原宿主准入引用。从这些原生记录建立固定 `AgentWorkspaceToolScope`，每次执行前重新读取并比较。

工具输入沿用严格 `WorkspaceToolInvocation`，固定原 Run、operation_key、执行者和 Context 摘要，以及调用键、文件路径、原内容摘要与有限替换内容。Runtime 不能在帧中选择 Caller、Kernel、Binding、宿主证明、文件代理或账本；包含额外字段的输入被拒绝。Scope 只由受信组合器安装，独立解析器拒绝额外字段、可执行对象与无效引用。

`AgentWorkspaceToolHost` 从固定 Scope 和实际工具动作 / 路径构造当前 Agent 查询。返回结果须通过独立 Agent Schema 校验，完整请求及 authority.host_admission_ref 必须匹配；Human 查询结果、外来固定引用、导入标志或非 ALLOW 不授予效果。默认 Kernel 未安装可信实时宿主证明时仍拒绝，Human Kernel 也不能替代 Agent Kernel。

本批提供可信组合接口；现有 CLI / 工作台的 Human 初始化入口保持。未默认安装生产 Agent 资格 / 计费核验器，未通过该接口启用正式 Runtime。

## 当前授权与真实文件效果

首次预约工具、文件准备前、原生准备完成后、dispatch 持久提交后且实际执行前，都调用 `assessAgentRunTool()`。宿主把独立副本传给查询器，要求当前 basis_digest 与原调用一致。权限 / 状态撤销、预算 / 时间失效、原 Binding 或当前宿主证明变化均停止；回执重放也先查询当前授权。未结清 SkillInvocation 继续由 D-221 拒绝父权限访问。

文件效果使用原 WindowsWorkspaceFileBroker：持有固定仓库根 / 祖先 / 文件句柄，核对普通单链接文件、原内容摘要、卷 / file index、原文件代理身份和有限内容。原生准备证明、dispatch 和完成回执分别持久记录，实际效果必须完成且原文件代理完整退出后才提交回执。宿主不接收任意命令或模型选择的 cwd / 环境。

准备 / dispatch 之间拒绝时先停止并等待自己拥有的文件代理。未 dispatch 记录为 not_started；已持久 dispatch 而无完成回执保持 Unknown，即使本次代理被取消且工作区看起来未改变。单个文件回执仍不改变原生 Task、Run、Gate、费用或领域事件。

## Human 与 Agent 共用原效果账本

同一项目沿用固定 `workspace-tools/<project_id>.sqlite` 与原策略锚点。新增 `WorkspaceToolJournal.claimAgent()` 只消费独立 Agent 查询；旧 `claim()` 仍只消费 Human 查询。两者分别核验后进入同一个私有预约实现，没有生成或转换 Human 权限报告。

共同保留同一 Run、同一路径及实际文件身份的在途 / Unknown 阻断、不可变调用键 / 输入 / 依据、原宿主拥有者、永久槽位与原回执。Agent 调用不能创建第二个账本来绕过 Human 已记录效果，反向也一样。路径别名仍由原生准备中的卷 / file index 阻断。

工具输入中的 Context 摘要固定原 Agent Binding / 宿主准入；当前独立查询的 basis_digest 固定本次授权依据。原工具账本及回执格式保持 1.0.0，回执的 formal_agent_execution_enabled 恒为 false；它记录文件效果事实，正式 Agent 运行资格及 SDK / 计费证明仍由后续 Runtime 宿主裁定。本批不把文件回执升级为完整 AgentRunObservation 或方法资格。

现有 `LocalRunVerifier.tools.facts` 从同一原账本读取所有 Run 的原调用；读取器核对原 operation_key、执行者和 Context 摘要。Agent 工具 Unknown 继续阻止父 Run 不实成功 / 失败 / 取消结清及返还，不依赖导入的成功报告。

## 原拥有者退出与资源恢复

Agent 宿主及本地服务提供 `recover()`，沿用 [D-220 原暂存恢复](CimiLoop-工作区暂存资源原始恢复-v0.1.md)。恢复重新观测原 Node 与已记录原文件代理；任一活动或无法确认时保留事实。两者确认退出后按原 dispatch 事实恢复 not_started / Unknown，再按原 nonce、构建目录及 replacement_identity 删除匹配私有暂存资源。

实际删除由原生代理独立核对两个拥有者和文件身份，使用已验证 DELETE / READ_ATTRIBUTES 句柄。重复恢复只观测原资源缺失，不重发效果、不改写回执、不消除 Unknown，也不释放永久槽位或预算。缺少原准备记录、无法证明的路径 / 身份与物理配额仍按 D-220 边界保留。

## 验证与后续

报告、固定源码摘要及最终回归范围见 [D-222 验证记录](../research/CimiLoop-Agent工作区工具宿主与原始恢复-2026-10-07.json)。新场景使用真实临时 Git / SQLite、实际 Windows 文件句柄与自己创建的 Node / 文件代理；受控资格和实时宿主证明明确为**构造测试输入**，没有真实模型、账单或生产资格声明。

实际场景覆盖 Agent 读写 / 回执重放、默认宿主缺失 / Human Kernel 拒绝、原身份及额外字段拒绝、原生准备 / dispatch 后权限撤销、当前宿主证明变化、两处双拥有者强制退出后的原资源恢复，以及保留父 Run / 用量 / 事件和 Unknown。独立账本测试验证 Human / Agent 入口不能混用，双方共同受原 Unknown 阻断；旧 Human / Agent / 技能、文件恢复、CLI 与工作台回归纳入最终范围。

首轮 10 项中 7 项通过、3 项失败，原报告保留。两项恢复已经完成删除及事实保存，失败来自构造子进程的证明省略了恢复宿主使用的 epoch 字段；已统一固定证明，重放依原状态拒绝。另一个失败是无效 Scope 在 JSON 复制阶段返回通用错误码，已统一该入口错误码并补上返回准入引用与请求一致的检查。随后专项 3 文件、19 项全部通过。

最终构建及类型检查通过，固定的 11 个源码 / 测试文件下受影响的 14 个测试文件、140 项全部通过，没有跳过。242 个现有 Protocol Schema 保持，原生数据库仍为格式 10，原工具账本 / 回执保持；未升级用户库，未读取真实凭据或发送外部模型请求。结果由验证记录固定，不声明整仓一次通过。

下一步接认证 IPC / OpenCode 的固定原 Agent 消费、原 SDK / 工具 / 账户保管链和固定检查命令，再完成生产 Runtime / Task 准入、模型 / 套餐资格、费用上界与账单、物理配额及完整资源恢复。Plan / Task 前 Human / Matt 澄清、独立固定 diff / issue 与完整 harness、Superpowers 新鲜检查、方法行为与候选 / 证据投影、工作台正式执行 / 接续和普通真实 Change 到 ReadyForDelivery 的 S1 验收继续实施。
