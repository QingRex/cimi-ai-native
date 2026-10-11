# CimiLoop 原 Skill 账单用量与领域观察 v0.1

2026-10-11 D-272：父 Run 与 Kernel 全部原 Skill 子调用的模型/hold/认证账单已接共享 Human 费用服务和 Kernel RunObservation 复验；完整 family 总额只计一次，仍保持 Unknown、未决预约与 Task 待核对。新内部 family 费用证明显式兼容旧单范围原义，默认 Agent 关闭、零付费、242 Schema/库10与完整五组 active 保持。验证和构造父模型边界见 [D-272 实施记录](CimiLoop-原父子运行费用聚合-v0.1.md)。

2026-10-11，D-271，接续 [D-270 原应用执行与结果采集](CimiLoop-Skill原应用执行与结果采集-v0.1.md)。本批把原专用账户最终账单接入原 Skill 采集与 Kernel SkillInvocationObservation。账单用量、执行结果和父运行结清分别核验；正式 Agent 默认入口保持关闭，242 Schema、用户库格式 10 不变。

## 实际接入路径

可信应用组合向 LocalSkillInvocationResultCollection 安装原 DedicatedAgentAccountLedger，调用 captureCosts(originalInvocationId)，再通过既有原命令 RecordSkillInvocationObservation 把原引用交给 Kernel。readResult 仍由可信代码安装，浏览器、CLI JSON、Agent 工具参数均不能注入账户或账单认证器。采集不会重开 Run、重发模型、读取凭据、登记新账单或释放资金。

既有 capture 保持未知费用捕获；新增 captureCosts 必须找到原命名方法、Native、SDK、IPC、模型及专用调用原件。沿 custody 固定的真实父 Run 与子 operation/input digest，精确选择 child modelRoot、scope 和原专用账户。复用 readOriginalDedicatedAgentRunCosts 逐笔检查所有已发送原调用、原 hold、request_id、请求摘要、账户/连接/准入摘要和最终认证账单；全部调用必须已核定且无未决费用。

账单认证来自原账户安装的代码端口，并与账户、独立 Host 和原账单库的不可变登记一致。模型 token usage、返回 JSON、余额变化、文件名、导入 ALLOW 或用户提供的零费用不能替代原账单。账单缺失、部分账单、错误账户或认证端口拒绝，均不能捕获 Known 用量。

现金币种必须等于原父 AgentRunRecord.cost_currency。现金与积分分别核对；不把积分按推定汇率转换成现金。raw usage 中既有字段只记录核定现金，完整积分数量、credit_unit、原 bill/hold/call 关联保留在不可变 cost_evidence 中。

## 证据格式与历史兼容

原无账单格式 cimiloop/original-skill-result-candidate/1.0.0 保持原义与逐字核验。新增 cimiloop/original-skill-result-billed-candidate/1.0.0 是另一份不可变证明，保存 bills_reverified=true 和完整 cost_evidence；不改写旧证明、不升级用户库、不把后来出账自动嫁接到旧报告。

Kernel 核验每次重读原账户认证账单、原模型调用与原 hold，不把已保存的费用 JSON 当作权威。原字节副本、完整 Native/SDK/IPC/方法证据及整个费用关联须与当前独立读取结果相同。伪造现金、币种、积分或积分单位、缺账单、错误账户、账单认证失效均拒绝。Kernel 当前 Writer 使用已有原身份 Reader，不开启嵌套项目事务。

同一采集器对未知费用和已核定费用分别固定首次成功采集时间，确保账单后来齐全时不会声称早先已经观测到 Known 用量。同模式重复捕获返回相同引用；新实例可重核既有历史引用。旧未知证明在新账单出现后仍保持可读。

## Kernel 业务结果与预算

费用证明真实关联完整后，raw status 仍为 unknown，usage 为 cost_known=true 及核定现金。方法 output 仍是候选，资格、账户执行 custody、正式执行、Kernel 费用结清字段仍为 false；本批不以账单推出方法成功。

既有 RecordSkillInvocationObservation 只登记该原 Skill 子调用的已核定费用，原命令重放返回同一 Kernel 回执。先前 Unknown 保持 Unknown，子费用 Known 后也不清除父 Run 的待核对状态；Task 保持 pending_reconciliation，原父预约不释放，Task 不因此满足。积分核定不伪造新的 Schema 字段。

父费用与预算结清还须核对完整原 family：真实父 scope 加所有已登记 child scope，包含每个原调用及账单。Kernel 的父费用不得小于已观测子费用只是下界检查；不得再把子费用加到已包含它们的 family 总额。本批不宣称已实现该完整父费用聚合或真实账户结清。

## 回归与接入检查

最终冻结源码复验：受影响 23 文件 308 项、Windows 原生 5 文件 30 项全部通过，失败/跳过均为 0；pnpm check、CLI 帮助和 242 Schema 无漂移通过，693 份源码冻结前后摘要一致。此范围不等于全仓库或完整 S1 验收。

计划见 [D-271 计划](../plans/2026-10-11-cimiloop-skill-billed-observation.md)，最终范围、源码冻结与保留原件见 [D-271 研究记录](../research/CimiLoop-skill-billed-observation-2026-10-11.json)。固定环境与 Windows 回归命令沿用 [D-270 接入说明](CimiLoop-Skill原应用执行与结果采集-v0.1.md#本批接入回归命令)，本机须 Node >=24.15 <25、pnpm 12.4.2；普通 PATH Node 24.14 不可用于检查。

本批新增费用集成检查可在仓库根目录执行下列命令。第一条覆盖原费用应用服务，第二条覆盖共享 Skill 的实际 Native 与账单观察；它们是最终范围中的两项，不替代研究记录列出的全部 23 个受影响文件与五个 Windows 文件。Skill 场景自己的验证超时为 480 秒，原执行预算仍为 240 秒。

```powershell
pnpm exec vitest run packages/local-app/test/agent-run-cost-observation.test.ts --maxWorkers 1 --testTimeout 240000 --hookTimeout 120000
pnpm exec vitest run tests/scenarios/skill-invocation-native-runtime.test.ts --maxWorkers 1 --testTimeout 240000 --hookTimeout 120000
```

完整原生场景经过共享应用、AppContainer、OS IPC、SDK 命名工具、八次本地受控模型交互、原专用账户、部分与完整原账单、不可变采集及 Kernel 领域观察。模型、资格、准入、公开虚构凭据与账单认证器均为构造夹具；这证明接入行为，不能证明真实智谱模型/套餐、真实 Skill/Matt/Superpowers、真实账单或 S1 验收。Windows 原生跳过不计通过。

开发中的缺接口 RED、同实例时序 RED、修补前 Green 与最终冻结范围分别保留，不能用旧源码范围替代当前检查。D-269 旧本地检查日志被误覆盖的历史证据缺口沿 [D-270 说明](CimiLoop-Skill原应用执行与结果采集-v0.1.md#验证及证据边界) 保留，没有被本批新检查修复。

## 完整目标继续

V1-09 的独立正式领域成功、完整真实账户/模型/工具关系、全 family 账单与预算、物理配额/历史容量/完整异常恢复；V1-21 的真实 Skill 与 Plan/Task 前 Human/Matt 澄清；V1-22 的 Matt 独立完整评审、当前源码新鲜 Superpowers 与真实行为对照；V1-10 的工作台正式执行/查询/停止/原操作接续；V1-11 的真实普通 Change 到 ReadyForDelivery、真实中断恢复、S1 验收及可操作指南，仍全部为活动目标。

用户只确认智谱提供方。具体模型、套餐、现金上限及币种、积分上限仍未确认，未读取真实 API Key，未执行付费请求。保留旧 Unknown、已有两个临时文件和所有未结清原件，不 reset/clean/强推、不批量清理旧资源。本批验证与文档完成后只本地提交，不 push，不宣布 S1 完成。
