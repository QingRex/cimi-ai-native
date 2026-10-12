# Original Skill not-started closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 Kernel 原父取消后封闭未派发 Skill，独立证明零效果/零费用，经共享 Human/工作台与 Kernel 登记原子 NotStarted，跨重启同命令恢复且永远不能重开。

**Architecture:** 封闭与正常启动竞争同一个 dispatch.json 独占文件和格式1 Host skill_invocation_dispatch登记。原出生/独立准入和封闭文件物理身份须两侧完整一致；账户只读完整审计零 holds，实际模型权限/预约在等待后拒绝已封闭子 scope。原采集器再核准备资料与无 Native/SDK/IPC/调用记录，Kernel唯一提交领域状态；无新账户、模型批准、账单、Run或用户库迁移。

**Tech Stack:** Node24.19/pnpm12.4.2、TypeScript、SQLite、Vitest、真实Windows受保护Host，既有Kernel/HTTP服务。

---

2026-10-12 D-279实施前制定计划，本批已实现、完整验证及更新文档，按要求仅本地提交；基线370b332c9d7bf27251655121208a176d01a5abfc、main。完整V1-09/21/22/10/11目标active；用户授权自主实施、本地提交、不push，沿用现有checkout。242 Schema/用户库10/Host格式1保持。两个用户TMP不读取/修改/暂存；旧失败及Unknown原资源不清理。不读真实凭据、不付费，具体模型/套餐/现金币种与上限/积分上限仍待确认。

## Task 1: 原派发永久封闭与独立原读者

Files: 新增packages/runtime-adapter/src/agent-skill-dispatch-closure.ts及对应Runtime测试；修改packages/runtime-adapter/src/index.ts、packages/local-app/src/skill-invocation-start-custody-local.ts；新增packages/local-app/test/skill-invocation-not-started.test.ts。

1. 先写行为红测：真实Kernel预约和原Host出生，取消前不能封闭；原取消后两侧永久封闭，在新句柄/重启后同原读取，不调用prepare/launch。正常派发/封闭两者最多一个成功；已有派发、单侧丢失、物理替换、Host/原出生变化不得变NotStarted。
2. 独立closure reader精确核原namespace/id/birth ticket/scope、reason、封闭marker字节、路径及物理身份、Host不可变ticket，前后复读；其结论只为dispatch_closed，不单独称零费用/领域NotStarted。
3. custody增加封闭原未派发入口；只有受信同步Kernel取消及当前Human控制授权guard成功后才写wx文件再Host一次登记。部分写失败保留Unknown，不补单侧原件；正常旧dispatch原件和格式不变。旧消费者不能把新封闭原件当作可再次启动。

## Task 2: 账户封闭拒绝与零请求费用审计

Files: 修改packages/runtime-adapter/src/agent-start-ledger.ts、agent-skill-account-scope.ts、agent-dedicated-account.ts；测试agent-skill-account.test.ts、agent-dedicated-account.test.ts及新closure测试。

1. 红测新登记/已登记子scope、模型check/预约/await后核验看到原封闭时拒绝；原已发生hold或冲突请求不能认定零费用，不发任何请求。
2. 原Host切面加入dispatch登记；所有执行准入、登记和hold writer的最终fresh切面检查永久封闭。读历史账单/账户本身仍可，不改旧costs_reconciled规则或补账户登记。
3. 原hold Host插入与封闭检查使用同一个Host写事务：seal胜则禁止占用，hold先胜则全量原Host占用必可见。不能在Host锁中等待账户写锁；仍按封闭文件→Host提交→账户writer审计→封闭复读。
4. 增加只读原子零费用审计：独立原账户/Host完整审计、同原出生关系、双侧封闭、目标零holds/零账单及原币种/积分单位；不得从空目录/余额/usage/缺模型账本得出零结论。没有原账户或原封闭保持Unknown；不创建/结清新账单。同原Host所有相关账户scope/intent/hold原件须审计，按scope值及出生关系比较，不能仅按所选accountDigest/scope_digest；账户A占用或部分原意图时，空账户B不能证明零。检查已登记原账户根中相关未提交scope/intent文件，外部关联/丢失/未决均Unknown。

## Task 3: 原准备资料零效果核验、Human及Kernel完整组合

Files: 新增packages/runtime-adapter/src/agent-skill-zero-effects.ts及对应测试；修改packages/local-app/src/skill-invocation-control-local.ts、skill-invocation-result-local.ts；必要时修改reconciliation-local.ts以强化提交前guards，不改公开请求。

1. 红测原Native/SDK/IPC/模型/方法调用或未决记录均拒绝NotStarted；仅未派发+完整账户零请求+原封闭才接受。覆盖未准备和准备中断/完整准备但未launch，不因缺文件或自称标签放行。
2. /stop先Kernel CancelRun，/cancel或/recover仅在未派发时封闭原身份；query/collect只回读封闭，不启动Native，不独自产生领域观测/账单。缺原厂/原件时Unknown。
3. collector保留成功/失败/运行中取消接口；新增私有not-started proof，经原历史资格、独立封闭/零效果/零费用读者，保存原字节副本。Kernel readResult同步两次独立再验，不信序列化终态。无output，cost0来自正面封闭及账户证明。
4. 共享Human原ReconcileSkillInvocation、HTTP/工作台核对入口复用，当前角色/会话、location/identity/原关系前后核验。响应丢失/释放失败/重启后同Command回执无工厂重放；父Unknown/预算和Task继续保留，父子最终结清下一批完整接通。

## Task 4: 原进程竞争与实际Windows/HTTP验收

Files: 新增tests/scenarios/skill-invocation-not-started-native-runtime.test.ts；参考已有control/native/cancellation场景。

1. 真实SQLite/独占文件，跨独立Host句柄及真实子进程竞争dispatch/closure，保留胜者原件；丢响应不产生第二次效果。原已启动绝不重开或变未启动。
2. 实际Windows受保护Host与原Kernel/HTTP/重启，取消未派发子→封闭→零费用→Kernel NotStarted；原执行器/SDK/模型/凭据端口均不调用。准备已存在但零请求仍核原资料，未知/原件丢失反例拒绝。
3. 模型/资格/账户批准仍构造；不是实际模型/Skill/Matt/Superpowers或S1证据。完整实际Native兼容范围仍跑、不跳过，D277历史Job失败根因未证明。

## Task 5: 完整验证、文档和本地提交

在源码冻结后跑所有受影响完整文件、实际Windows完整范围；pnpm check、CLI帮助、242 Schema/库10、原日志/摘要、文档本地链接/UTF8/围栏及git diff --check。保留首次失败与原资源，复验用新原操作。新增D279实施/研究记录并更新五个索引和接续记录，精确stage本批后本地commit，不push。

完整五组继续：完整父子终态/最终费用结清、正式生产准入、硬磁盘配额/历史容量/所有异常、真实模型/账户批准/账单、真实Skill与Human/Matt前置澄清、Matt完整独立评审/当前源码Superpowers/行为、正式工作台与真实普通Change至ReadyForDelivery/S1。

## 本批收尾

受影响29文件350项通过；实际Windows12文件35项通过，均0跳过、单轮完整范围通过；719源码零漂移、check/CLI/242Schema/库10/Host1通过。跨账户空账假零和Host锁顺序按工程复审补强；EACCES/EPERM/ENOTDIR红测后改明确ENOENT判断。原NotStarted已接原资格、跨账户零费用、准备资料及共享Human/HTTP/Kernel原命令恢复；实际受保护Host/account原件复开通过，无Native/SDK/模型/凭据执行。首次仓库目录保护失败保留，同helper在新Temp保护/验证通过，未改生产权限。见 [D-279实施记录](../implementation/CimiLoop-原Skill未启动封闭与零效果核对-v0.1.md)。完整五组目标active，不push。
