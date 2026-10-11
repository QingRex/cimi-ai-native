# CimiLoop 原父子运行费用聚合 v0.1

2026-10-11，D-272，接续 [D-271 原 Skill 账单用量](CimiLoop-Skill原账单用量与领域观察-v0.1.md)。本批把父 Run 与全部原 Skill 子调用的费用接到共享 Human 应用与 Kernel 原 RunObservation；不以已出账证明领域成功。正式 Agent 默认仍关闭，242 Schema、用户库格式 10 不变。

## 可执行路径

共享 LocalHumanAgentRunCostObservation 打开原账户，经 LocalAgentRuntimeObservation 准备不可变费用证明，交给 Kernel RecordRunObservation。生产 openLocalProject 的原结果核验器再次独立读取同一完整集合、原模型与认证账单。工作台既有费用观察路径复用这套服务；浏览器、CLI JSON、Agent 工具均不能安装账户或认证器。无需新 Run、SDK、模型请求或凭据读取。

原集合先由 Kernel 当前 Reader 列举全部同一 Run 的 SkillInvocation，再与实际 DedicatedAgentAccountLedger 原登记双向匹配。不能仅用账户 children 推断完整业务集合：已预约但未登记、额外已登记零 hold 子调用、重复身份、错 invocation/input/parent 都拒绝。每个子调用重新核对 Schema、自身摘要、原父身份、Runtime/Skill/Host 固定关系、原 admission ticket、完整 Kernel preparation basis、原资格内容及启动文件的路径/设备/inode/创建时间独立身份。

子原件路径由本地 dataDirectory、原项目和 invocation_key 固定派生。费用 JSON、远端参数和历史旧电脑绝对路径不能选择路径。复用同一父账户的完整 family 读取，逐笔核对每个父子原 model call/hold、request_id、请求摘要、连接/准入/账户摘要和原最终账单认证。相同 model_0001 号在父子原 scope 下分别核对原 request_id，不合并。集合、账户、Host 和模型原件两次读取相等，费用不能超出安全整数。

费用核验使用现有 Kernel Writer 连接的 Reader，不开启嵌套项目事务，不制造 Agent effect authority。账单缺失、部分账单、未开始成员、缺原模型、账单认证失效或独立启动文件被相同字节的新文件替换，都不能把费用写为 Known。

## 费用、预算与结果

family 总额已经包含父费用和所有子费用。Kernel 既有子费用只是父总额的下界，不能再次加入 Task 消耗。受控正向例：八次 child 模型现金 96、一次构造父模型现金 12，family 现金 108；原 Task 预约 500，记录后消耗 108、保留 392，而非重复加上 child 96。积分共 36 coding_request_micro_units，保持原单位，不能推定换成现金。

该例 Run 继续 Unknown、reservation_released=false，Task pending_reconciliation、attempts_released=0。子候选输出没有变成领域成功；没有执行终态、全子调用成功与正式资格的独立证明，就不能 ReconcileRun、释放余量或满足 Task。认证账单用量 Known 与完整预算结清不同。

同一 command_id 重试沿用不可变 request/prepared/proof/raw reference。Kernel 未提交前必须重核当前原账户/模型/启动身份；成功后原命令重放返回原回执，不重新打开账户、采集、发送或记账。后来出现额外子登记会阻止新费用观测，但不会改写历史原命令回执。

## 兼容与界限

新增内部 cimiloop/agent-run-family-cost-evidence/1.0.0，含原 scope、各 member 的 scope/model/calls、原 registration/admission 摘要和完整 costs。旧 cimiloop/agent-run-cost-evidence/1.0.0 保持原语义；只有 Kernel 和账户均没有子成员时才走原单 scope 路径。新增成员后旧单 scope 不能替代完整 family；旧回执仍按原身份重放。没有自动升级用户库、没有回填历史原件。

大型 family 证明只允许严格 canonical JSON，最多 8 MiB、524288 节点、深度 64；重复键、危险键、非 UTF-8、非 canonical 和未知格式拒绝。原 Gateway parser 与旧证据解析不放宽。65 个 member 各 64 个原调用的构造解析压力例，仅验证解析边界，不证明真实 family 历史容量、原件持久可靠性或物理配额。

## 验证及接入

最终冻结源码复验：受影响 27 文件 337 项、实际 Windows 原生 5 文件 30 项全部通过；失败、跳过和未处理错误均为 0。pnpm check、CLI 帮助与 242 Schema 无漂移通过，696 份源码冻结前后一致。不是全仓库或完整 S1 验收。

计划见 [D-272 计划](../plans/2026-10-11-cimiloop-original-family-costs.md)，最终冻结范围和所有诊断阶段见 [D-272 研究记录](../research/CimiLoop-original-family-costs-2026-10-11.json)。固定 Node >=24.15 <25、pnpm 12.4.2，锁文件安装后先 pnpm check。普通 PATH Node 24.14 不合规；本机使用 24.19.0。Windows/AppContainer 原生不能以跳过代替通过。

在仓库根目录运行费用与共享服务检查：

```powershell
pnpm check
pnpm exec vitest run packages/runtime-adapter/test/agent-run-family-costs.test.ts packages/local-app/test/agent-family-cost-proof-capacity.test.ts packages/local-app/test/agent-run-cost-observation.test.ts packages/local-app/test/agent-run-reconciliation.test.ts --maxWorkers 1 --testTimeout 240000 --hookTimeout 120000
pnpm exec vitest run tests/scenarios/skill-invocation-native-runtime.test.ts --maxWorkers 1 --testTimeout 240000 --hookTimeout 120000
```

完整最终文件清单以研究记录为准，上述是重点接入检查。Skill 场景验证超时 720 秒，包含采集、对抗核验与原回执检查；实际原 Task 执行预算保持 240 秒。本地 TLS 费用例的 child 实际经过共享应用、Windows Native/AppContainer、OS IPC、SDK 命名工具和原账户；父模型为直接 Host 调用且父 claim 为构造进程身份，不能算真实父 Native 执行。

资格、模型返回、准入、公开虚构凭据和账单认证器均为受控构造。没有真实智谱模型、套餐、真实 Skill/Matt/Superpowers、真实账单或 S1 验收证据。D-269 旧本地 check 日志误覆盖的历史缺口沿 [D-270](CimiLoop-Skill原应用执行与结果采集-v0.1.md#验证及证据边界) 保留，本批新检查不修复历史。

## 五组目标继续

V1-09 的正式领域成功、完整真实 Native/SDK/工具/模型/账户关系、真实账单和预算结清、物理配额/历史容量/全异常恢复；V1-21 真实 Skill 与 Plan/Task 前 Human/Matt 澄清；V1-22 Matt 独立完整评审、当前源码新鲜 Superpowers 与真实行为对照；V1-10 工作台正式 Agent 执行/查询/停止/原操作接续；V1-11 真实普通 Change 到 ReadyForDelivery、真实技能、中断恢复、S1 验收与可操作指南，全部保持活动。

用户仅确认智谱提供方，具体模型、套餐、现金上限及币种、积分上限尚未确认。未读真实 Key、未执行付费请求。凭据应在仓库及整个数据目录外通过既有安全连接配置；历史 Unknown、原 Temp/Profile/映射及两份既有临时文件保留。完成本批验证、文档后仅本地提交，不 push，不宣布 S1 完成。
