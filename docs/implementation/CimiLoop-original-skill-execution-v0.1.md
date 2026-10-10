# CimiLoop 原 SkillInvocation 执行与宿主固定 v0.1

2026-10-10 D-267：原 Skill 子账户及专用模型工厂已接共享应用服务，保留原父 Run 与原 invocation_key/input_digest；同一账户总额覆盖父子现金/积分，独立四份登记原件、当前 Kernel 与子账户准入、完整家庭费用投影阻断漏算、撤权及原件丢失后的补建。默认 Agent 关闭、零付费；完整 Native 子方法、领域结果/真实账单、真实 Human/Matt/Skill/Superpowers/S1仍待接通。项目库10/242 Schema及完整五组目标保持；实际验证范围、Windows锁失败、未定根因与当前复验见 [D-267实施记录](CimiLoop-skill-account-composition-v0.1.md)。

D-266 接通内部 Kernel 子调用评估、共享应用执行服务、原宿主预约票据及不可覆盖派发锚。实际可调用的接口是 `assessSkillInvocationExecution`、`LocalSkillInvocationStartCustody.bindPreparation/originalQualification/inspect`、`LocalSkillInvocationExecution.start/query`。这是一段已实现的执行编排；真实命名 Skill 的生产 Native/SDK/模型/账户组合尚未安装，正式 Agent 默认入口关闭。本批受控执行器不构成真实方法、模型、账单或 S1 验收。

## 原身份与权限

调用只提交原 parent 范围、`invocation_ref`、`input_digest`，不能序列化安装宿主、选择模型、补造批准或更换原调用。Kernel 从一致快照读取唯一未结清 SkillInvocation，核对原父 Run/RunRecord/context/Task/WorkItem/执行者、完整固定引用、方法用途、Binding/权限/预算和不可变输入。取消、未知费用、终态子调用、错误摘要、缺失/异常/异步宿主证明拒绝执行。父 Run 的启动、模型及工具限制继续存在；子评估不是父范围授权。

`SkillInvocationVerifierPort.checkExecutionAuthority` 是同步、只读、代码安装的独立证明口。真实实现须重新核验原方法资格、当前 Native/SDK/工具/模型/账户对应、预算/账单、物理配额和恢复资料；原上下文准入及构造 Digest 不能替代这些事实。该口没有默认正式实现。

## 宿主预约与兼容性

在原 `ReserveSkillInvocation` 的可信 `prepare` 阶段完成真实输入/包/Schema/资格核验后，调用 `LocalSkillInvocationStartCustody.bindPreparation` 包装原 qualification 引用。包装保留内层真实资格，并固定原 Host 格式1的 exclusive 预约票据、父范围/RunRecord/context/Skill/输入/完整 preparation，以及独立 admission 文件的物理身份；它本身不批准方法。

包装使用既有 `skill_method_qualification` 内容引用，没有新增公共 Schema、领域记录种类或库升级。公共 Schema 保持242、用户项目数据库格式10、Host启动库格式1。已有预约没有该原包装或物理原件时默认拒绝执行，不能在启动、跨电脑迁移或回读时自动补包装、重建宿主或升级用户库。历史资格与内容不覆盖；原包装须由独立资格读取口解包，再重新核验原实际资格。

## 一次派发与回读

`start` 先核验原调用者与不可变原件，再读原宿主票据、独立锚和派发登记。已有原登记可在没有 Runtime 工厂时回读，`query` 不准备 Runtime、不变更 Kernel 状态。首次执行必须安装真实输入读取器、受信 Runtime 工厂及完整当前宿主证明。

准备阶段不能产生 Native/SDK/模型/工具效果或费用。等待前后和派发前重新读 Kernel；方法输入再次读取并比较。Runtime 获得 `beforeEffect` 回调，实际安装器必须将它放入每一次 Native、SDK、模型和工具效果边界，不能只在开头调用一次。共享服务不能替尚未安装的 Runtime 保证其内部边界。

先以 `wx` 写不可覆盖 `dispatch.json`，再通过现有 SQLite 格式1的 `claimExclusiveOnce` 原子占位；跨连接/进程只有赢家可以派发。独立锚存在但 Host 记录丢失、反向丢失、两边内容不一致、锚后 writer 中断、派发响应丢失均保留 Unknown，不自动修复或重发。换根/换Host/原预约票据丢失拒绝。返回登记只证明启动回调曾返回，所有结果 `completion_proven:false`；不是 Native 独立效果核验、领域结果、费用结清或 Task 完成。

准备成功返回的 lease 无论成功、异常或竞争都等待一次 dispose；失败准备须由安装器释放自己尚未交出的资源。释放不停止原 Native 进程、不移除原件或恢复业务预算。默认错误隐藏输入路径、账户资料及安装器异常正文。

## 零付费接入验证

先定位本机合规 Node（>=24.15且<25）及 pnpm12.4.2，使用仓库已有按锁文件安装的依赖。以下命令不安装正式 Skill/模型端口，不读取真实凭据；测试仅构造执行器与资格：

```powershell
pnpm check
pnpm exec vitest run packages/local-app/test/skill-invocation-execution-local.test.ts packages/runtime-adapter/test/agent-child-claim.test.ts packages/runtime-adapter/test/agent-start-ledger.test.ts --maxWorkers 1 --testTimeout 120000 --hookTimeout 120000
```

Windows x64 在实际可执行原生助手的宿主运行以下文件，必须0跳过。它使用真实机器/主体、受保护 Host 存储和两个独立 Node 进程；basis/Run/Skill仍是构造契约，不启动真实 Skill、外部模型或账单：

```powershell
pnpm exec vitest run tests/scenarios/agent-start-custody-runtime.test.ts --maxWorkers 1 --testTimeout 120000 --hookTimeout 120000
```

接入应用前，安装器须实际复验：旧原 Host 可回读；新根拒绝；父授权在子未结清时仍拒绝；并发/重启不重复派发；取消和撤权贯穿等待；两侧原件丢失及 writer/响应中断不补发。原子登记与运行回读不代替 `RecordSkillInvocationObservation`/Human `ReconcileSkillInvocation`；这些仍经独立原 SDK/Native/工具/账单事实核验后由 Kernel 处理。

## 验证与完整目标

最终验证数据见 [D-266研究记录](../research/CimiLoop-original-skill-execution-2026-10-10.json)。源码验证前后快照、失败测试、普通代码审查修补和真实 Windows 范围分别保留。本批不覆盖 D-258 Bun 故障和 D-265控制器访问违例；旧 Unknown 原件未处理。

| 组 | 本批进展与继续条件 |
| --- | --- |
| V1-09 | 子调用当前权限与原宿主登记已实现；继续真实 Native/SDK/工具/模型/账户完整组合、费用预算/账单、物理配额、历史容量、领域结果与完整异常恢复。 |
| V1-21 | 原 SkillInvocation 有共享执行服务；继续实际生产子 Runtime、真实 Skill 调用及 Plan/Task 前真实 Human/Matt 澄清。 |
| V1-22 | 本批只有普通独立工程审查；仍须真实 Matt 完整独立评审、当前源码新鲜 Superpowers 验证及行为对照。 |
| V1-10 | 已有人工启动/查询/停止/恢复入口继续；子调用服务尚未接入工作台生产工厂，仍须共享应用服务完整复用 Kernel。 |
| V1-11 | 继续真实普通 Change 到 ReadyForDelivery 的技能、恢复、验收和真实接入指南；本页仅给已实现切片的零付费验证命令。 |

用户只确认智谱提供方。具体模型ID、套餐/计费方式、现金上限及币种、积分上限仍待确认；未确认前不付费，不读取真实 Key。持续目标保持 active，五组没有全部通过，不宣称 S1 完成。

最终暂存检查只清理新测试一处行尾空格，实际生产源码未改；原13文件121项及Windows3项结果保留，清理后的当前测试17项独立复验和 pnpm check/CLI帮助通过。研究记录保存原/最终源码SHA及单字节对应关系，最终676文件快照再核对。
