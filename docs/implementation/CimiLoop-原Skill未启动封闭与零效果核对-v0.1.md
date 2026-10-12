# CimiLoop 原 Skill 未启动封闭与零效果核对 v0.1

2026-10-12，D-279。接续 [原 Skill 取消终态](CimiLoop-原Skill取消终态与费用核对-v0.1.md)，本批将原未派发子调用的永久封闭、零效果、零费用、固定历史资格与共享 Human／工作台／Kernel NotStarted 核对接成可执行路径。五组持续目标保持 active，正式默认 Agent 入口仍关闭；没有付费请求或真实凭据读取，不push。

## 实际能力与必要条件

当前普通父Agent SDK仍只有读写／检查工具；现有Skill子路径由受信外部调用预约和执行，尚未接父SDK→原IPC→Kernel唯一预约→子执行／采集。父未结清child会阻断权限，子已Unknown后Human核对也不自动恢复父权限。后续须接明确的受证继续语义及版本化原SDK／IPC／子票据／父产物对应，不宽放旧Unknown。

原父 Run 已由 Kernel 登记取消，原子调用尚未取得启动派发登记时，Human 原 /stop、/cancel 或 /recover 可以永久封闭同一派发身份。封闭后重复执行或恢复不会创建新 Run、Native、SDK 或模型请求。/query、/collect 只回读原封闭事实，不直接登记领域状态。若原派发已发生，继续走其原操作查询、取消和恢复，不能改认未启动。

原封闭本身只证明 dispatch_closed，zero_effects_proven 仍为 false。另有完整原账户的跨账户零占用审计、原准备资料零效果和预约固定历史资格，Human 才能用原 ReconcileSkillInvocation 核对为 NotStarted。Kernel 始终唯一提交领域状态；原报告无 output，费用0来自正面封闭及原账户证明。父 Run 保持 Unknown、预约未释放、Task待核对；这不是完整父子结清或Task验收。

缺原出生／独立准入、单侧封闭资料、物理替换、已有派发、Native／SDK／IPC／模型／方法调用、未决发送、账户占用、其他账户关联、原准备资料不完整或不可读时保持 Unknown。目录不存在、unclaimed 或新电脑找不到旧资源均不是独立 NotStarted／零费用证明。

## 封闭与正常启动竞争同一个原身份

LocalSkillInvocationStartCustody.closeUndispatched 复核原出生 ticket、固定 preparation 和独立准入锚，再以 wx 写同一 dispatch.json。正常派发与永久封闭竞争这一独占文件，最多一个胜出；随后在原格式1 Host 的同一 skill_invocation_dispatch 槽登记。新 marker 的内部格式为 cimiloop/skill-invocation-dispatch-block/1.0.0，固定原 ticket、child scope 与 kernel_cancelled_before_dispatch，并由 Host 登记原路径和物理身份。

独立 readOriginalSkillDispatchClosure 核对原出生关系、原父子 scope、Host不可变登记、marker原字节／摘要和物理文件身份，禁止已有returned登记，前后复读。只有两侧完整一致才产生原封闭事实；部分文件／Host写入或ACK丢失不补原件。只剩Host时仍禁止后续模型效果，原封闭正向读取则拒绝。相同字节换了文件物理身份也不算原件。

原派发格式不改，旧成功／失败／Cancelled及回执语义保持。新的封闭原件不允许执行器再进入 prepare／launch；它只读原Unknown物理结果，等待Human核对。原Host格式1、242公开Schema和用户库格式10不变，不自动迁移用户数据库。

## 原账户零费用与跨进程竞争

账户模型check、子登记、reserve及等待后的最终writer切面冷读取原封闭，封闭后拒绝新的执行准入或hold。新增 AgentStartLedger.claimBudgetHoldBeforeSkillClosure，在同一个Host写事务内检查原child封闭并提交原hold。若封闭先提交，hold拒绝；若hold先提交，后续零费用审计必须看到它。原账户历史与账单仍可读，封闭不把历史视为损坏、不返还或删除占用。

锁顺序保持账户writer到Host writer。封闭只写原文件及Host，不持有Host锁等待账户；然后账户writer零费用审计等待已有原占用事务结束，再复读封闭。跨独立Node进程验证派发／封闭单胜者，以及hold／封闭的同Host事务顺序；不是单线程模拟。

DedicatedAgentAccountLedger.readOriginalSkillZeroCosts 要求真实安装的原账户句柄、原账单核验身份和币种／积分单位、同一原Host出生关系、正面永久封闭、目标scope零holds／零账单。它枚举同原Host全部相关scope、intent、hold及账户根中的原登记文件，按scope值和出生关系比较。账户A已有该child占用或部分登记意图时，空账户B不能证明零；其他账户关联／未决／丢失根保持Unknown。没有child账户登记也必须完成全Host审计，不能靠所选账户的空表放行。

此零费用结论专用于正面封闭的原未派发子，内部格式 cimiloop/original-skill-zero-costs/1.0.0。旧 readRunCosts／readRunFamilyCosts 的 costs_reconciled 语义不改，无调用scope不能自动让完整family费用通过。余额、token usage、缺模型目录及自报费用不能替代账单或这个原零效果证明。

## 原准备资料与 Kernel 再验

readAgentSkillPreparationZeroEffects 有界只读同一原child根。允许尚未准备，或完整方法／模型准备但尚无调用；原方法材料和独立锚、模型双侧header及零calls独立再验，禁止额外／Native／SDK／IPC／专用模型发送原件。只允许明确 ENOENT 表示缺失；EACCES、EPERM、ENOTDIR及其他读取错误均 Unknown。该入口自身的 dispatch_closed、costs_reconciled、domain_observation_produced 都为false，不能独立产生NotStarted。

collector新增 captureNotStartedReconciliation，选择入口 captureHumanReconciliation 在独立原封闭时走这个同步路径，避免调用Native采集。内部proof格式 cimiloop/original-skill-not-started-reconciliation/1.0.0。生成和Kernel readResult均两次重核Kernel原取消、原birth／closure、完整账户零费用、准备资料零effects、固定历史资格、当前待核对原观测集合，以及保存内容副本与原件逐字对应。序列化status／布尔字段不能替代核验；无output、completion_proven=false，不伪造SDK完成。

本批未启动proof最多40个原件、3MiB原字节；沿用8MiB／100000节点／64层和规范JSON的proof读者。封闭marker最多64KiB，方法材料仍最多32份每份50KiB；原调用容量和Job扩展不变。不是物理磁盘硬配额或完整历史容量验收。

## 工作台接线与操作

沿用 [原工作台控制](CimiLoop-原Skill工作台控制与恢复-v0.1.md) 和 [原终态核对](CimiLoop-原Skill终态与历史资格核对-v0.1.md) 的代码工厂、Human会话、Origin／Host／CSRF及当前technical_owner权限。skillRuntimeForInvocation 返回同原 LocalSkillInvocationStartCustody；skillReconciliationForInvocation 返回同原collector与release，collector安装原账户、输入和历史资格核验端口。HTTP不能上传scope、root、pid、账户批准、账单、证据或终态。

1. 从任务的固定Skill调用取得原id、父Run和当前首次命令修订号。原Host／账户凭可信配置打开，不在新电脑重建丢失原Host。
2. 用 POST /api/skill-invocations/:id/stop 提交原父 CancelRun。已有原取消时用 /cancel 或 /recover 只封闭或恢复同一原身份；不恢复SDK执行。
3. /collect 或GET原id核对 dispatch_closed；这还不是领域NotStarted。已有正常派发时沿原Native路径处理，不尝试制造未启动证据。
4. 原封闭、零效果、零费用与固定历史资格可核验后，用 POST /api/skill-invocations/:id/reconcile-original 和原 ReconcileSkillInvocation 格式提交；无工厂／原件时保留Unknown及预算。
5. 响应丢失、释放失败或重启后沿同command_id、requested_at、expected_revision和invocation_ref重放；已提交原回执不需collector工厂，无重复效果。不要根据409／403猜测是否已提交。
6. 确认子NotStarted、费用0及无output，再单独核对父Run、父子完整费用和Task。不能把子NotStarted当父预算释放或需求交付。

本地复验先确认当前Shell的Node满足 >=24.15 <25、pnpm为12.4.2，依锁文件安装，再执行以下固定测试命令；Windows文件被跳过不计通过。新建的测试原件保留原报告与目录，不重开旧失败Run，不使用历史绝对路径或假定缓存存在。

~~~powershell
pnpm install --frozen-lockfile
pnpm check
pnpm exec vitest run packages/runtime-adapter/test/agent-skill-dispatch-closure.test.ts packages/runtime-adapter/test/agent-skill-zero-effects.test.ts packages/runtime-adapter/test/agent-skill-account.test.ts packages/local-app/test/skill-invocation-not-started.test.ts
pnpm exec vitest run tests/scenarios/skill-invocation-not-started-native-runtime.test.ts tests/scenarios/skill-invocation-native-runtime.test.ts tests/scenarios/skill-invocation-cancellation-native-runtime.test.ts tests/scenarios/agent-dedicated-account-custody.test.ts
~~~

上述场景会在新的自有夹具中产生构造资格和受控模型回复，不能对实际用户项目宣称资格通过。不得为了运行它们配置真实密钥、放宽账户或Native准入；默认正式Agent仍不可用。

## 验证与证据边界

最终受影响29文件350项通过；实际Windows12文件35项通过，均0跳过、单轮完整范围通过。719源码完整验证前后无变化，pnpm check、CLI帮助、242Schema／库10／Host1通过。最终完整范围／失败／复验／源码摘要见 [D-279研究记录](../research/CimiLoop-original-skill-not-started-2026-10-12.json)。先前工程诊断、类型错误及失败夹具保留，完整通过才计本批验收；不是全仓库或完整S1。

新Windows场景使用实际受保护Host／账户和真实Git包／方法准备、实际Kernel／HTTP／SQLite，证明原父取消→未派发封闭→零费用→子NotStarted、丢响应／工作台重启同命令恢复，以及原Host／账户复开。方法资格／账户批准／模型metadata及核验端口仍构造；实际Native／SDK／模型／凭据读取均为0。这个场景不声称执行过模型或Skill。已有实际AppContainer／SDK成功、失败、运行中取消和原资源控制另跑完整兼容范围。

首次新Windows夹具把受保护Host放进仓库目录，原生保护返回拒绝；原件保留。相同原生helper对本批新建仓库目录保护仍拒绝，对新建Temp目录保护／验证通过。实际夹具改用新Temp根承载受保护Host／账户，与既有原生测试约定一致；没有改生产权限检查、清理或恢复失败原操作。D277历史Job控制器失败根因仍未证明，本批通过不能覆盖其失败。

完整五组继续：V1-09完整父子终态与最终费用结清、正式生产Runtime准入、物理硬配额／历史容量／完整异常；V1-21真实Skill与Plan／Task前Human／Matt；V1-22Matt独立完整评审、当前源码Superpowers和真实行为对照；V1-10正式Agent工作台执行与原操作接续；V1-11真实普通Change至ReadyForDelivery、真实技能、中断恢复及S1验收。用户只确认智谱提供方，具体模型、套餐、现金币种／上限及积分上限未确认，继续零付费实施。
