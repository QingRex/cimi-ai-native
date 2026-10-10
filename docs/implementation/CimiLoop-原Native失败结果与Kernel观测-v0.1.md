# CimiLoop 原 Native 失败结果与 Kernel 观测 v0.1

2026-10-10 D-260：原模型请求、账户占用和认证账单已逐笔接入共享Human费用观测、Kernel独立再核验、同一编译CLI及工作台原命令恢复。实际Kernel现金记入12、剩余88继续冻结；Run仍Unknown，不满足Task或ReconcileRun结清。真实Windows原账单保管漂移拒绝新观测，已提交回执仍按原命令重放。测试模型／批准／账单认证为公开构造，非真实智谱或SDK完整终态、Skill／Matt／Superpowers／S1证据；专用Native/Bun故障和四项账户确认继续。默认正式Agent关闭，项目库10／242 Schema保持，完整五组持续。 [实施记录](CimiLoop-原账单费用Kernel接通-v0.1.md)。

2026-10-10 D-254：[原Native输入关闭与执行中断](CimiLoop-原Native输入关闭与执行中断-v0.1.md)已接受控EOF、原进程是否恢复的不可变证明、共享原采集 / Kernel核验及工作台提示；损坏输入仍失败，原Unknown与费用保留。正式默认Agent、真实模型 / Skill / 方法与完整五组S1继续；本批最终验证以新研究记录为准，以下旧批结果保留原范围。

2026-10-09 D-249后续负向执行事实读取支持[launcher2原控制器证明](CimiLoop-原恢复控制器保留与编译配方-v0.1.md)，须匹配唯一claim冻结输入，拒绝降级。旧launcher1负向格式兼容保持，不能升级领域成功或结清费用。

D-241，2026-10-09。V1-09 / V1-10 的领域结果核验续批，完整五组 S1 持续目标保持进行中。

## 实际路径

共享 `LocalAgentRuntimeObservation` 在原采集后识别可独立核对的执行失败。现有工作台 `POST /api/agent-runs/:runId/observe` 仍只接受原 Command ID 和空 payload；用户不能提交成功状态、账单或替换证明。按钮改为“记录原运行观测”，结果由 Kernel 记录。

原采集须证明原监督与 Runtime 进程已停止且本次资源已处置。失败核验从不可变原字节读取 Native 配置、启动登记、暂停身份、资源登记、清理记录及执行中断记录，核对 nonce / scope、原宿主、监督进程、Runtime peer、配置摘要和原 Task 绝对期限。原查询中的停止或 disposed 状态单独不够。

以下两种负面结果可形成失败报告：

- 原 Native 原因是 Task 到期，停止 uptime 不早于输入和 Native 配置共同固定的原期限；中断和退出记录对应。
- 原 Native 明确记录正常观察到 Runtime 退出，原退出码非零且与宿主原退出记录是同一个32位值。

Windows DWORD 被 Native int 和 Node 以不同符号表示时，核验保留两个原数字，仅对安全 signed/unsigned32 值按位比较。退出信号、不同退出值、越界数字、退出零、缺记录、错误 nonce / scope / 身份 / 配置摘要、未到期限、资源清理错误、取消或仍运行均不能依此认定失败；保持原 Unknown 路径。未开始返还、成功、模型 / 账户及账单核对另有证明要求。

## 不可变报告与 Kernel 边界

新的失败证明使用独立私有格式 `cimiloop/agent-failed-observation-proof/1.0.0`，保留原请求 / 身份 / 采集引用和失败原因。现有 `cimiloop/agent-unknown-observation-proof/1.0.0` 明确按旧语义读取；不会因后来文件或新规则重算为失败。原 prepared / request 身份和同 Command ID 约束保持。

Kernel 原结果读取器再独立核验同一不可变采集，重新推导失败原因，并逐字核对派生报告；不能从报告自称失败或其内嵌回执得出结论。原报告先存内容引用，再执行 Kernel，提交后响应丢失继续重放同一回执，不采集新结果或重开 Run。首次验证需要原身份；已提交同请求重放沿用 Kernel 不可变回执。

失败报告始终 `usage.cost_known=false`、`completion_proven=false`、`costs_reconciled=false`。在原 Reserved Run 的核验路径中，Kernel 可记录 Failed，但保持该 Run 活跃、费用冻结、尝试消耗和 Task InProgress；不能自动结清、返还预算、满足 Task 或 ReadyForDelivery。已有 Unknown 或取消请求时，Kernel 仍可能保留 Run Unknown。原工具或技能未决时，Kernel 可拒绝终态报告；它们必须按各自原身份处理，不能通过本批绕过。

当前只接通负面执行事实到领域观测。正式正向 Task / Contract 输出与适用源码证据、真实模型账户和费用、完整 Runtime 生命周期、物理配额 / 历史容量 / 恢复、真实 Skill / Human与Matt澄清、独立 Matt / Superpowers 新鲜验证 / 行为对照、正式工作台默认执行和真实 Change 全链路仍待完成。

242 Schema、用户库格式10和 Kernel 命令保持；没有升级用户库。默认正式 Agent 启动关闭，仅确认智谱提供方；未确认模型、套餐、现金 / 积分上限前不读取真实凭据或发出付费 / 真实模型请求。

## 操作与验证

工作台已有原 Agent Run 时，使用“记录原运行观测”。原 Native 失败资格成立时读取失败报告；仅停止、资料缺失或归属不明时继续待核对。原请求响应丢失后，用页面保留的同 Command ID 接续，不手动新建 Run。

本机回归要求 Node >=24.15 <25、pnpm12.4.2，先执行 `pnpm check`。实际 Native / HTTP 联调用 `pnpm exec vitest run tests/scenarios/agent-run-budget-runtime.test.ts --maxWorkers=1`，必须在 Windows x64 运行，跳过不计通过。它使用真实 AppContainer / OpenCode SDK、原 Task 时钟、工作台 HTTP / Kernel 和同请求重放；模型回复与提供方资格仍构造，不能作为真实模型、Skill 或 S1 验收。

最终固定354个源码 / 测试 / Native / 配置后，受影响回归实际8文件 / 63项全部通过、0跳过、退出0；包括实际Windows Task-clock / AppContainer / SDK的4项，原到期场景经工作台HTTP提交失败观测、再原共享服务重放同Command ID，仅一份Kernel回执且原Run / 尝试 / 未知费用冻结保持。工作台HTTP8项、浏览器丢响应接续2项、共享控制7项、失败边界16项、原观测12项、原操作9项和Native回执5项通过。源码摘要前后零变化，pnpm check、编译CLI帮助、20文档UTF-8 / 围栏 / 本地链接、242 Schema / 用户库10和diff检查通过；范围是受影响回归，不是全仓库或完整S1。

最终验证范围及所有中间失败见[研究记录](../research/CimiLoop-原Native失败结果与Kernel观测-2026-10-09.json)。D-240 生产组合正向用例的期限失败仍保留，不因本批负面路径通过而覆盖。