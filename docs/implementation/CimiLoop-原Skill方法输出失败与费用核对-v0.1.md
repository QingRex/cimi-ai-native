# CimiLoop 原 Skill 方法输出失败与费用核对 v0.1

2026-10-11，D-276。接续 [D-275 原 Skill 终态](CimiLoop-原Skill终态与历史资格核对-v0.1.md)，完整 V1-09/21/22/10/11 目标继续 active。默认正式 Agent 关闭，Schema 242、用户库格式 10 保持；本批不读取真实凭据、不调用付费模型、不 push。

原 Native/SDK 正常完成而末步原模型文本不符合固定方法输出契约时，旧实现只返回 Unknown。现在独立核验器能证明这一类方法失败；共享 Human 应用服务与工作台可将同一原 Skill 核对为 Failed，同时计入已独立核对的最终现金和积分账单。失败不携带 output，不接受为 Task 产物；父 Run 仍 Unknown，父预约不释放。

## 实现与边界

核验器先核对原操作、启动身份、实际 Native/SDK/IPC/Job、全部模型请求和响应、方法材料、实际 SDK 工具身份/入参/输出、正常 SDK 结束及资源回收。只在最后文本的严格 JSON/固定方法契约校验处分类失败。返回前复读原操作、模型、IPC、方法和所有原件摘要；缺失、半份记录、SDK/模型文本错配、身份或资源状态不明仍保持 Unknown。方法失败事实不是领域终态，费用或历史资格未齐仍不能提交 Kernel Failed。

专用事实为 method_failure_reverified:true、固定失败码 agent_named_method_output_invalid 和原返回文本的 SHA-256；method_result_reverified 保持 false。取消、从未启动、SDK 非零退出和期限中断有各自的原证明要求，不由无效输出、文件不存在或新电脑找不到旧资源推断。

Skill collector 仍核对预约固定的历史资格、原账户与全部调用最终账单。候选报告继续 Unknown；Human reconciliation 才可提交 failed，且必须完整账单和当前 Human 权限。共享服务保存原 command/准备意图，已有原 Kernel 回执时，响应丢失或工作台重启后重放该回执，不需要重新安装 collector 工厂，不重开 Run，不再产生模型效果。

新增三个私有证明格式：cimiloop/original-skill-result-failed-candidate/1.0.0、cimiloop/original-skill-result-failed-billed-candidate/1.0.0、cimiloop/original-skill-result-failed-reconciliation/1.0.0。既有成功和 Unknown 的格式、形状保持，公共 Schema 与用户库不变。生成端和独立读回端均依据原事实选择 failed/succeeded，并在失败时完全省略 output。

## 验证

当前705份源码核对，受影响11文件158项通过；实际Windows/AppContainer完整4文件9项通过，0失败、0跳过、未处理错误0。pnpm check、CLI帮助、242 Schema无漂移通过；不是全仓库或完整S1验收。

实际原Skill成功与失败分别使用新的原操作：完整Native/SDK/IPC/Job、构造资格及最终账单通过工作台共享服务提交Kernel。失败不携带output；两条路径原请求与工作台重启后回执一致、工厂只开一次，无新模型/账单效果，父Run/预约和Task仍独立待核对。新失败夹具同时验证截断stdout和SDK文本错配保持Unknown；仅修改、还原本次新测试自己拥有的副本路径，不改旧红测原件。

原行为红测：本地2项失败（缺失败支持、混杂成功/失败旗标错误通过），实际Native无效输出1项失败（旧读者Unknown）；过滤产生的其余跳过仅诊断，不作验收。TS2379测试闭包类型和生成/读回状态不同步在最终冻结前修正。红测及失败日志完整保留，不覆盖，不重开旧Run。首轮完整Windows4文件8通过1失败，失败分支测试138行仍期待旧成功billed格式而实际返回设计的新failed-billed格式；仅修正这一条断言。生产代码及11个受影响文件全部不变，已有158项通过保留；完整Windows4文件使用全新原操作复跑。修正后的源码快照比较曾因Windows反斜杠与正斜杠路径不同而在保存前误拒绝，诊断原计算只得到预期的一处测试文件差异；随后在驱动开始后保存当前705份快照并结束后重读，未在测试中修改源码。相同生产代码的原完整冻结和最终单文件差异记录分别保留，不把后写快照说成驱动启动前保存。

普通工程只读复审已复核生成/读回一致性及失败闭合边界；它不是 Matt 独立完整评审或 Superpowers 新鲜验证。真实 Windows/AppContainer/SDK/Native 与公开构造模型、受控资格核验器、账单夹具分别标识；构造部分不计真实 Skill、批准模型/账户/费用或 S1。

## 本批接入复验

使用新电脑实际安装的 Node >=24.15 <25、pnpm 12.4.2；不要照搬本机缓存绝对路径。先按锁文件安装并执行 pnpm check，再运行本批实际 Windows/x64 文件。非 Windows 的 runIf 跳过不算通过。

~~~powershell
node -p process.version
pnpm --version
pnpm install --frozen-lockfile
pnpm check
pnpm exec vitest run tests/scenarios/skill-invocation-native-runtime.test.ts tests/scenarios/agent-named-method-runtime.test.ts packages/runtime-adapter/test/native-control-runtime.test.ts packages/runtime-adapter/test/agent-job-native-runtime.test.ts --maxWorkers 1 --testTimeout 240000 --hookTimeout 120000
~~~

完整范围应有4文件9项，不用 -t 过滤或把跳过计通过。Skill两条路径建立各自的新原操作；保存打印出的原目录和原成功/失败摘要，失败不修补后重用。各次日志与 JSON 报告使用新文件名，检查 actual_native/actual_sdk/actual_http_kernel/original_command_replayed_after_restart 为 true，构造标记为 true，real_skill/s1_accepted/reservation_released/task_accepted 为 false。本机研究记录的摘要和忽略目录不替代新电脑复验。

应用接入使用 LocalHumanSkillInvocationReconciliation 的代码安装租约与既有工作台 POST /api/skill-invocations/:id/reconcile-original。调用方需原项目 Human technical_owner、当前会话、同 Origin、Cookie 与 X-CimiLoop-CSRF；请求必须提供原 command_id、requested_at、acting_role:'technical_owner'、command_type:'ReconcileSkillInvocation'、target:{object_type:'run',id:原父Run}、expected_revision 和 payload:{invocation_ref:{object_type:'skill_invocation',id:原invocation}}，共7个顶层字段；不提供状态、输出、证据路径或账户根目录。取得可释放租约后重新检查会话与关闭状态，该次拒绝不采集；紧邻 Kernel 提交再检查，拒绝时不产生 Kernel 事件、释放租约，并保留已有原采集和请求。

已有原回执时跨重启重发完全相同原请求；响应丢失不能换 command/Run 发起新效果。没有原回执且未代码安装有效 collector/历史资格/最终账单时，CAPABILITY_UNAVAILABLE 是预期保护，不是应手填成功事实的入口。具体模型、套餐和现金/积分预算获用户确认前，接入只使用公开夹具，不配置真实凭据、不付费。完整 S1 仍需五组真实证据，以上命令不是 S1 验收。

## 后续条件

V1-09 继续真实模型/账户和账单接入、磁盘硬配额、历史容量和完整异常恢复；V1-21 继续真实 Skill/资格与 Plan/Task 前 Human/Matt 澄清；V1-22 继续独立完整 Matt、当前源码 Superpowers 与真实行为对照；V1-10 继续正式 Agent 默认组合和完整执行/停止/接续；V1-11 继续真实普通 Change 到 ReadyForDelivery、中断恢复及 S1 接入验收。

还需用户确认智谱具体模型、套餐、现金上限与币种、积分上限。旧 Bun 崩溃、DNS 期限、Unknown/资源归属、D-275 Job 小配额空输出根因和 D-269 原日志覆盖缺口均保留，不因本批通过消除，也不据此清理旧资源。

[D-276 研究记录](../research/CimiLoop-original-skill-failure-2026-10-11.json)保存验证范围、不可变本机原日志摘要及夹具边界；忽略目录不随 Git 迁移，新电脑必须新鲜复验。
