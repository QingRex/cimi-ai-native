# CimiLoop 技能证据、评测与 Runtime 绑定 v0.1

> 2026-10-07，D-211。承接 [D-210 固定来源包与候选登记](CimiLoop-技能包固定来源与候选登记-v0.1.md)，实施范围为 V1-21 的 Provider 资格观测、原生评测与探针批准。真实任务调用及 V1-22 行为试点仍未完成，当前进度以 [V1 实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)第 10 节为准。

## 已接通的原生事实链

复用既有 `RecordProviderEvidence` → `EvaluateProvider` → `RegisterProviderBinding`，由真实 Kernel / SQLite 保存 Project 作用域事实、原生事件、命令回执和 Outbox。命令核对本地 Human 身份、实际角色和 Project CAS；批准仍需要当前 Human Project Owner 指派。原命令重放不产生新事实。技能记录不进入 Task 验证集合，也不推进 Change、Task、Run 或 Gate。

技能使用独立严格分支：`SkillProviderEvidence` 的 `purpose=skill_probe`、`origin=local_skill_observation`；`SkillProviderEvaluation` 的规则版本为 `skill-provider-assessment/1.0.0`。旧 Runtime 证据和评测形状完整保留为 `RuntimeProviderEvidence` / `RuntimeProviderEvaluation`，公共查询、事件和回执只增加明确分支。

`SkillProbeResult` 固定技能 Descriptor 及摘要、能力、批准的 Runtime Binding 及摘要、观测时间和最多四次调用样本。每个 `SkillInvocationSample` 保存固定方法输入、Runtime 请求和原始操作结果的内容引用。这是 Provider 资格观测，尚不是正式 Task 的 SkillInvocationRecord；旧 Human Context / Run 没有被放宽。

## 核验依据与结论

可信宿主重新读取实际技能包，离线核对 Git 证明、来源内容、Descriptor 和 IO Schema 摘要；重新计算 Runtime Binding 原有技术资格依据。Skill 批准不能只携带一份声称已通过的 Runtime 报告。

每次调用核对输入用途与能力、完整制品字节及摘要、Runtime 请求结构和输入摘要、固定二进制摘要，以及精确的方法提示、文件集合和加载配置。原始 stdout、结束证明及全部声明输出都受字节和摘要约束。已完成样本必须有一致会话、实际 Skill 工具的完成记录、完整声明模块正文和严格方法结果；评审发现的依据必须来自固定输入，两个评审样本须为不同会话。Unknown、NotStarted 等未完成状态保留缺证，不推断完成。

技术评测检查 `fixed_source`、`method_io`、`skill_loaded`、`real_invocation`、`independent_sessions`。反证为 DENY，缺证为 NEED_MORE_EVIDENCE。合成驱动与已知合成模型别名不能提供真实行为依据。治理单元测试使用构造的原始观测覆盖规则的正反分支；它们不是实际模型行为证明。Human 提供的原始观测和结束文件仍遵循既有本地信任边界，不提供外部服务或操作系统的远程证明。

`controlled_execution` 继续明确要求 `harness_coverage`、`permission_intersection`、`cost_accounting_and_cap`、`invocation_recovery`，当前均为缺证。只有技术资格允许探针范围批准；`task_execution` 拒绝。Skill Binding 必须额外固定实际 `runtime_binding_ref` / `runtime_binding_digest`，且与每份观测及所选能力一致。Provider Catalog 的执行准入保持关闭，技术 ALLOW 不等于正式执行授权。

## 方法上下文与隔离加载验证

`skillInvocationPlan` 生成严格方法输入文件、按内容摘要映射的固定评审制品，以及固定模块的 `SKILL.md` 和 `references/`。制品字节与引用再次核对；上游脚本及 `agents/openai.yaml` 留在来源包中，不进入加载器。最多 32 个文件、单文件 256 KiB，沿用 Runtime 输入和资源约束。

`SkillRuntimeProfile` 固定包摘要、用途与技能名称。当前只接受 read 模式；缺少定义、夹带未声明模块或未带 profile 的技能目录均拒绝。宿主生成精确名称的 Skill 权限及本地加载路径，保留禁止其他工具和隔离网络的边界。1.18.34 使用 V1 配置形式；[V1/V2 迁移说明](https://opencode.ai/v2/docs/migrate-v1/)明确两代 `skills` 配置结构不同。

实际锁定版 OpenCode 的验证发现兼容缺项：其内置 Skill 工具在读到技能定义后，调用 ripgrep 列举附属文件。当前 Windows Job 限制子进程，该步骤返回 `ripgrep execution failed`。锁定版本的 [Skill 工具源码](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/tool/skill.ts)与原始工具失败记录相符。

三个 D-210 上游包分别在实际 AppContainer 中复现加载失败，使用固定公共合成回复、TLS / IPC 和既有演练账本；实际凭据读取、外部模型请求均为零。失败和演练账本的 Unknown 原样保留，没有将合成回复、发现技能目录或退出后的资源清理算作方法调用成功。先前一次磁盘观测不可用的失败也保留，不覆盖其原操作；后续独立验证使用新的明确演练身份。

这组加载演练与 `SkillProbeResult` 的资格观测是不同入口；不能直接拿演练结果批准 Skill Provider。当前尚无实际技能技术 ALLOW、默认技能选择或行为增益结论。下一步需要固定、可核验且不依赖任意子进程的技能加载适配，并验证明确调用、依赖、禁止外部模块、只读和失败恢复。

## 导入与批准入口

既有 CLI `provider record-evidence` 的 `--probe-file` / `--artifact-root` 支持严格技能观测，读取所选普通根目录内按 SHA-256 命名的原始内容对象，复制调用输入、请求、原始结果及固定评审制品。文件摘要不符、引用不完整、链接或超限拒绝。原生 Provider 动作及完整 CLI 操作见 [Provider 证据、评测与受限绑定](CimiLoop-Provider证据评测与受限绑定-v0.1.md)。

`provider evaluate` 继续使用固定 Descriptor、原生 evidence_refs 和评测 profile。`provider bind` 的技能输入在既有严格载荷基础上增加 Runtime Binding 引用与摘要；只接受同一固定 Runtime 和能力的原生允许结论。没有新增直接执行技能、安装框架或绕过任务授权的产品入口。

## 格式 9 与验证范围

领域数据库格式为 9，Protocol 仍为 2.0.0，冻结 v1 保持。显式 1–8→9 升级；正常 Store / CLI 不自动升级用户库。格式 8 预检查冻结 Runtime 记录分支及已知布局，交叉核对 Descriptor、摘要、Human 指派、批准依据、原生事件和回执；新 Skill 记录不能伪装成格式 8。新插入守卫约束 Provider 种类与证据用途 / 评测规则，不接受缺失判别字段。

升级前保留原格式数据库及完整内容对象备份并核对摘要；旧事实逐字保留，仅增加迁移记录、事件及对应事件序号。四处阶段故障回滚、原回执重放、篡改拒绝和升级幂等均有回归。未升级用户现有库。操作见 [数据库迁移与恢复](CimiLoop-M0数据库迁移与恢复-v0.1.md)。

构建 / 类型检查通过；全仓库回归与修复后受影响文件复验合计 58 个文件 833 项通过。初轮技能文件的两项失败和修复后完整复验 20 项分别保留原始报告，最终覆盖失败 0。验证记录见 [D-211 工程与实际加载验证](../research/CimiLoop-技能证据评测与Runtime绑定-2026-10-07.json)。新增七个 Schema，更新十一份明确的聚合 / 命令 / 迁移制品；其余 188 份及旧 Runtime 证据 / 评测形状保持。既有固定 IO 的实际检出字节恢复原样，避免 Schema 导出换行改变已保存引用。

## S1 剩余工作

完成隔离技能加载适配、真实澄清的 Human 分轮输入，以及固定 diff / issue 数据和独立会话的评审宿主。以版本化记录固定正式 Context / Run 的 Skill Binding、调用身份与结果，再做 Matt / Superpowers 行为对照和升级选择。正式 Runtime 的 Agent 绑定、真实工作区效果、权限交集、整体 Unknown 恢复、物理硬配额及批准的费用准入仍属 V1-09。之后执行 V1-11 普通修改全链路至 ReadyForDelivery，工作台展示正式执行与恢复事实；以上未完成前 S1 不退出。

2026-10-07 D-212验证固定方法读取适配：三个上游包的全部声明定义经实际OpenCode只读效果核对通过，保持无网络与单进程隔离；仍为合成读取演练，不是内置Skill成功或完整方法调用。见[适配验证](CimiLoop-固定方法读取适配验证-v0.1.md)。下一步仍需版本化命名调用 / 实际效果映射、固定Context / Run记录及完整宿主，然后验证真实方法行为；V1-21/22和正式Runtime仍未完成。
