# CimiLoop 原 Skill 终态与历史资格核对 v0.1

2026-10-11，D-275，接续 [D-274](CimiLoop-原Job内存策略核验与结清-v0.1.md)。当前批次增加原成功 Skill 的独立再验、Human 核对及共享工作台入口。正式默认 Agent 仍关闭，零付费、未读取真实凭据；242 Schema、用户库10不变，完整 V1-09/21/22/10/11 持续目标 active。

## 原成功子调用的可执行路径

预约时固定的 method_qualification_ref 是原宿主准入包装；先由既有 custody.originalQualification 核验原 birth/basis 票据与独立物理锚，再取得其中不可变的原 controlled_execution 完整评测引用，不能把包装或调用者给定引用当评测。历史读者重读固定 Git 方法包、两份独立样本、原输入、Runtime、命名方法与 purpose、SDK 调用/Native 效果和全部原模型/harness 检查，并与原评测整体一致。严格解析继续拒绝重复键及危险键，只有全部原件和资格字节核验结束后将返回对象规范化，以便与持久原证据一致比较。缺独立原件核验器、仅公开夹具评测、仅 contract_only、标签 ALLOW、Runtime/方法/目的不一致或样本行为 inconclusive 均拒绝。异步 Promise 核验不能混入同步 Kernel 事务，拒绝后消费其异常。它不调用当前执行准入、不产生新资格或新的模型请求。

LocalSkillInvocationResultCollection.captureReconciliation 在原 Native/SDK/IPC/Job 命名方法成功、固定完整输出、原账户逐笔最终现金/积分账单、父币种与历史资格同时成立后，生成新 host-private original-skill-result-reconciliation/1.0.0。独立读者再次逐字核对原文件和不可变副本、费用、输出及所有未知费用/Unknown/冲突观察引用。Kernel 唯一负责 ReconcileSkillInvocation 的 Human 权限、当前 revision、观察时序及领域提交。

原 candidate 和 billed-candidate 继续原义：只记录 Unknown，账单 Known 不代替方法成功。新成功证明仍明确不授予当前模型/账户执行权，不打开默认 Agent；其中资格字段是历史完整再验，不等同真实 Skill 已合格。只支持原成功子方法，失败、取消或 not_started 尚不能使用这个分支，缺文件不能推断未启动或零费用。

## 共享 Human 服务及工作台

代码安装 LocalHumanSkillInvocationReconciliation 和只读 historical collector lease。输入只允许原 command_id、requested_at、technical_owner、ReconcileSkillInvocation、父 Run、expected_revision 与 invocation_ref；拒绝 caller、账户路径、工厂、raw_result_ref、状态或费用 JSON 注入。Human 身份来自当前本地实例，Kernel 再核实际角色。

POST /api/skill-invocations/:invocation_id/reconcile-original 使用工作台同一 session/CSRF/关闭检查和共享应用服务，不复制业务状态机。URL 与 payload 必须同一子调用。代码安装同步 beforeCommit guard，在等待工厂取得可释放租约后、紧邻 Kernel 提交前及原回执重放前复验 session/CSRF/closing；拒绝不采集、不提交，并释放租约，原 intent 可继续使用。HTTP JSON 不能安装或覆盖 guard。工厂及其回调错误只返回固定公开信息，release 完成后核对原身份/原调用；HTTP 不能安装 Runtime/账户/资格核验器。当前批次提供该共享服务和 HTTP 入口，普通 CLI 与页面子终态按钮未新增。

每次新 Human 原请求先持久冻结 intent，再保存 prepared 原结果引用；原 command_id 被用于不同输入则拒绝。Kernel 已有回执时，重启无需 factory/collector/账户，按原 prepared 命令返回原回执；release 异常发生在 Kernel 已提交之后也能这样恢复。它不重开父 Run/Skill、不登记模型或账单、不重新消费预算。子调用成功后父 Run 仍须独立核父终态和完整 family 账单；Task 仍待验收，不能由子输出满足。

## 验证与证据边界

冻结705份当前源码，最终受影响4文件36项通过；实际Windows/AppContainer完整4文件8项通过、0失败0跳过、未处理错误0。pnpm check、CLI帮助、242 Schema无漂移通过，不是全仓库或完整S1。

实际原Skill Native/SDK/OS IPC/Job成功与完整原字节、构造受控资格及认证夹具账单经共享工作台+Kernel核对为子Succeeded，原输出和现金96微单位相同；父Run仍Unknown/预约不释放，Task未验收。重复原请求及工作台重启后原回执一致，collector工厂仅开一次，无新增模型/账单效果。

首轮HTTP缺路由2项失败，工厂LocalProjectError文本透传红测3项中1失败；修补后完整3项通过。历史资格正向先缺方法而失败，修补后完整19项通过；最终完整回归另列。最初子结果5项均因默认10秒hook超时，不能作行为红测；调整测试准备hook到120秒后复现缺接口，保留旧报告。所有构造夹具和过程失败都不能补造真实Skill或S1。

此前同一冻结20文件189项通过之后，实际Native4文件6通过2失败：HTTP核对保护性409，32MiB Job内64MiB分配测试未得到JSON。公开保留原件诊断证实method_qualification_ref是固定原票据/物理锚的Admission包装，被错误当原评测；行为红测复现包装摘要与内层原评测不同。修补仅经既有custody.originalQualification核对birth/basis/anchor并取得原评测，不更改invocation，不补资格或原件。中间轮实际Native4文件7通过1失败，Job完整4项通过但原Skill仍保护性409；只读公开原件诊断及JSON往返行为红测定位严格解析的null原型与持久证据普通对象不一致。仅在全部原件核对结束后structuredClone返回已验证结果，未放宽严格解析和证据检查。另有等待工厂期间会话过期/关闭仍可提交的权限窗口，3项行为红测复现；共享服务增设代码安装的同步guard，在取得可释放租约后及紧邻Kernel提交/原回执重放前复验，HTTP传入会话与closing检查，拒绝无采集/业务事件并释放租约，原请求可继续。中间r4/r5回归期间新增这组权限测试和调整关闭合同，保留失败报告而不算最终冻结验证。r5会话过期已通过；关闭先误期望客户端收到503，既有closeAllConnections实际断开socket，修正为断线及guard真实抛WORKBENCH_CLOSING、release和零事件的组合检查。修补后新源码再冻结705份，最终4个相关文件完整复跑；此前20文件报告及中间Native失败报告保留为过程证据。Job三次新受控诊断均返回allocation_succeeded:false，未证明旧空输出根因；C#和32/64MiB上限不改，完整Job文件重新验证，不宣称旧故障已解决。

构造资格的原件核验器、模型、账户批准、公开凭据与账单投影是受控夹具，不能作为实际智谱、真实方法资格、Matt/Superpowers 或 S1 证据。真实运行文件中的 Windows AppContainer、原 SDK、OS IPC、原 Job 策略、共享 HTTP 与 Kernel 是否通过，单独按完整文件报告。普通工程只读评审确认回调 LocalProjectError 内部文本透传，HTTP 反例先失败，修补后要求通过；该评审不是 Matt 独立完整评审。

历史失败及旧 Unknown/Temp/Profile/映射保留；本批不推断其清理或故障根因。构造 fixture 超时、准入拒绝或 Native 恢复失败须保留报告，后续新原操作通过不补造旧原件。新增私有证明版本是显式兼容，无公开协议变更或用户库迁移。

## 新电脑接入复验

使用当前 checkout Node >=24.15 <25、pnpm12.4.2，按锁安装并 pnpm check。受信代码给原 collector 安装原账户及 NamedSkillMethodOriginalsPort，其 verify 必须回到真实原 Runtime/model/harness/成本/恢复/行为证据；本批公开假核验器仅测试。不得从 HTTP 或日志读取连接凭据，不以新电脑找不到旧进程证明已停止。

完整执行 tests/scenarios/skill-invocation-native-runtime.test.ts、tests/scenarios/agent-named-method-runtime.test.ts、packages/runtime-adapter/test/native-control-runtime.test.ts 和 packages/runtime-adapter/test/agent-job-native-runtime.test.ts；非 Windows 跳过不算通过。Skill fixture 的原 Task 240000ms 与外层720000ms保持，不通过提高预算掩盖失败。固定检查、父成功/失败/取消及更广历史容量分别沿已有指南验证，本批四文件不是完整 S1。

仅智谱提供方已确认，具体模型、套餐、现金上限/币种及积分上限仍缺，禁止付费请求。真实 Skill/原件资格核验器、前置 Human/Matt、独立 Matt、新鲜当前源码 Superpowers、工作台正式默认执行、物理磁盘硬配额和真实普通 Change 到 ReadyForDelivery/中断恢复/S1仍需完成。本机忽略目录内的测试日志、原生夹具、原进程和私有账本不会随 Git 迁移；研究记录中的本机路径与摘要用于回查已有原件，新设备必须重新核对实际原件及安装能力，不能用“找不到”替代结清或清理证据。最终命令和来源见 [D-275研究记录](../research/CimiLoop-original-skill-terminal-2026-10-11.json)。本批完成后仅本地提交，不 push。
