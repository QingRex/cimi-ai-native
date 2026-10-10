# CimiLoop 工作台原 Agent 启动衔接 v0.1

2026-10-10 D-259：原Run费用查询已接共享Human服务、受信代码安装的同一编译CLI命令、回环HTTP及工作台按钮。工厂与释放等待后复核原资料，错误只返固定公开码；页面拒绝旧查询／旧页面迟到结果。实际Windows原账户／账单保管→共享服务→HTTP查询与权限漂移Unknown通过，不启动模型、不产生领域结果或Kernel结算。普通CLI／工作台仍需真实原账户工厂，默认正式Agent关闭。上批专用Native／Bun段错误仍未解决；构造账单认证不是实际智谱／Skill／方法／S1证据。项目库10／242 Schema保持，完整五组持续。 [实施记录](CimiLoop-原Run费用共享入口-v0.1.md)。

2026-10-10 D-256：[专用模型原件共同核验](CimiLoop-专用模型原件共同核验-v0.1.md)已接原提供方请求 / 响应与预算占用的独立读取、共同采集及 Kernel / Task 结果再核验。新专用 Host 身份绑定原 Runtime 输入与独立操作键，预算缺原件保持未知；不重发、不释放或结清占用。共享应用服务供 CLI / 工作台复用，真实受批准持久账户及原账单仍未接通，正式默认 Agent 关闭。242 Schema / 用户库10保持，完整五组 S1 继续；本批验证见新研究记录，以下旧批结果保持原范围。

2026-10-10 D-255：[专用模型原请求衔接](CimiLoop-专用模型原请求衔接-v0.1.md)已接实际 SDK 消息、原提供方思考 / 工具轮次、本机 HTTPS、持久原发送 / 响应锚点和共享 Runtime 工厂；重复或丢响应不重发。真实受批准账户服务、专用原件共同采集及账单结清尚未完成，默认正式 Agent 保持关闭，完整五组 S1 继续。最终验证及失败保留见该文研究记录，以下旧批结果保持原范围。

2026-10-10 D-254：[原Native输入关闭与执行中断](CimiLoop-原Native输入关闭与执行中断-v0.1.md)已接受控EOF、原进程是否恢复的不可变证明、共享原采集 / Kernel核验及工作台提示；损坏输入仍失败，原Unknown与费用保留。正式默认Agent、真实模型 / Skill / 方法与完整五组S1继续；本批最终验证以新研究记录为准，以下旧批结果保留原范围。

> D-253；V1-10 / V1-09 续批。完整五组 S1 持续目标 active；正式默认 Agent 仍关闭。

## 可执行路径

工作台现在能向受信代码安装的原 Agent 组合请求启动。路径为 Human 会话 → 共享 LocalHumanAgentRuntimeStart → Kernel.authorizeAgentRunStart → 原 LocalAgentRuntimeComposition → LocalAgentRuntimeStart 的唯一登记 → 当前 Native / IPC / SDK / 模型与固定检查组合。业务状态、角色指派、原 Agent 效果授权仍由 Kernel 决定；Human 请求权限不是 Agent 工具授权，也不授予模型或账户资格。

Kernel 只读核对当前项目、本地 Human 身份、原 Agent Run / Record 及当前 technical_owner 指派，不产生事件、Run、Attempt 或预算变化。共享服务先核对原固定范围和权限，再等待受信工厂，确认规范组合实例与原 Scope 相同，并固定原指派 ID / revision。异步准备前后、实际 Native 配置发送、每个准备阶段继续及最终 SDK resume 放行前再次核对。等待期间撤销或替换指派，不能继续放行 Native；已有原登记与不完整原件保留，不能重开 Run。

受信工厂只能由宿主代码安装，必须只返回原组合、不得自行启动效果。HTTP 不接收工厂、Agent Caller、二进制、模型、路径、凭据、预算或任意提示词。组合仍要求独立原宿主首次启动账本、当前模型 / 账户准入、原 Task 预算、固定检查及原 Agent 授权。默认未安装工厂时明确拒绝，context 的 agent_start_available 仅表示入口组合已安装，不能表示账户已批准或 S1 已通过。

## HTTP 与浏览器接续

POST /api/agent-runs/:runId/start 仅接受空对象 {}，沿用回环 Host、精确 Origin、会话、CSRF、JSON 和容量约束。同一原 Run 的启动复用原在途请求与持久唯一登记；原响应丢失后只核对同一 Run / operation_key，不重发模型 / 工具效果、不产生第二次启动。停止、观测继续使用原 Kernel 命令与收据；资源恢复仍不表示重新执行任务。

浏览器发送前在 sessionStorage 的 cimiloop.agent-start.<projectId>.<runId> 保存原 run_id，丢响应后显示“核对原启动请求”。这份启动身份独立于停止 / 观测的业务命令待核对槽；等待启动 HTTP 返回时，查询及请求停止仍可使用。原启动存储不可读取时仅禁用启动，保留查询 / 停止；无法保存身份时请求尚未发送。会话 / origin 仍沿用既有边界，随机端口改变不自动搬迁旧 origin 的浏览器请求。

本机 Node 必须满足 >=24.15 <25，pnpm12.4.2，先按锁文件安装并完成 pnpm check，确保本机 dist 与当前源码一致。实际 Windows x64 场景使用本机安装的 OpenCode / C# / AppContainer；不能将非Windows跳过或缺工具当通过。可执行验证命令为：

```powershell
pnpm check
pnpm exec vitest run tests/scenarios/agent-production-lifetime-runtime.test.ts tests/scenarios/agent-original-edit-check-runtime.test.ts --no-file-parallelism
```

该命令覆盖构造模型资格的实际Windows路径，不进行付费请求；本批组合有已保留的Bun失败，不能承诺无故障。生产宿主尚需在仓库外安全连接批准的真实模型 / 账户与预算，不能复制测试资格或构造模型实现作为正式端口。缺工厂 / 权限 / 原件时分别沿当前拒绝和Unknown处理，先读取原操作事实再接续，不能清理或重开Run。

新字段是本地工作台 context 能力和内部代码回调，不增加公共领域 Schema，不改变242 Schema、用户库10、原启动账本1、原 Native 配置5或其他原格式，不迁移用户库。旧启动登记继续按原格式核对；缺文件、缺原 OS 身份或历史 Unknown 不能借新入口重新认定无操作。Native 内部权限回调不写入配置或不可变证据。

## 接入与验证边界

受信宿主先为原 Agent Caller 建立规范 LocalAgentRuntimeComposition，再以 startWorkbench({projectDir, agentRuntimeForRun}) 安装返回该组合的工厂。普通 Workbench CLI 默认没有安装此工厂；没有可从页面选择的模型 / 提供方开关。参考实际场景 tests/scenarios/agent-production-lifetime-runtime.test.ts 与 agent-original-edit-check-runtime.test.ts；两条实际组合均从工作台 HTTP 启动，再由共享原控制 / 观测读取结果。当前场景的模型回复和资格是构造输入，不可用于真实模型、账户、Skill 或 S1 验收。

分阶段最终受影响8文件55项全部通过、0跳过；首轮8文件55项52通过3旧启动测试15秒超时，原启动代码及15秒期限不变的完整10项复验通过，原因未证明。最终浏览器2文件5项通过并退出0，首次4项断言绿但退出1的阶段保留。实际Windows组合2文件3项2通过1失败、0跳过；独立新读取检查复验1项通过（另1项过滤），收紧原Native suspended中断证明后的撤权反例1项通过（另1项过滤），均不覆盖组合Bun崩溃。

类型检查、CLI帮助通过；同一实际阶段内617源码前后零漂移。独立读取检查复验期间仅无关浏览器测试收尾 / 类型修正发生变化，其余616源码（包括Runtime及该场景）摘要不变，此阶段不计617文件零漂移。原业务库只读采集前后摘要相等。

实际读改查及独立读查各有一份Kernel原Unknown观测 / 结构化产物，固定检查各1，构造模型4 / 3轮、Native效果匹配3 / 2项；费用、真实账户、Task验收和当前源码适用性仍false。初次读查0模型调用、Bun退出3 / segmentation fault。两个撤权反例0模型调用、原Native在suspended阶段中断，关闭resume输入仍有ArgumentNullException / exit12，不归类成功，完整受控异常分类继续。全部原件清理记录resources_disposed:true，无cleanup_errors，旧历史Unknown未清理。

本批验证结果按最终实际退出码、分阶段源码摘要及原件登记到[研究记录](../research/CimiLoop-工作台原Agent启动衔接-2026-10-10.json)，包含实际 Windows 读 / 检查、读 / 修改后检查及最终模型准入等待期间撤销 Human 权限。类型错误、浏览器首次退出异常和工具编辑挂起均独立保留，后续通过不覆盖原失败。此前 Bun / CLR / clock 原失败和历史 Unknown 未清理。

## 仍需完成

正式领域验收、批准的真实智谱模型 / 账户 / 套餐 / 原费用预算账单、物理配额、历史容量与完整异常恢复继续；真实 Skill、所有 Plan / Task 前 Human / Matt、完整独立 Matt 评审与新鲜 Superpowers 行为验证、正式默认 Agent 接入和真实普通 Change 至 ReadyForDelivery / S1 接入验收继续。本批付费请求与真实凭据读取0；只有五组全部完成且有真实证据才完成目标。仅本地提交，不 push。
