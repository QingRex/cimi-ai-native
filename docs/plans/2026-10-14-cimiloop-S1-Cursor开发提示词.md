# CimiLoop S1：Cursor 开发与自测提示词

日期：2026-10-14。将下文整体交给 Cursor Agent，在当前本机仓库执行。用户安排 Cursor 开发、自测，完成后由 Codex 独立审核；Codex 持续目标已暂停，S1 尚未完成。

---

你负责接续 cimi-ai-native 的 CimiLoop S1，完成全部剩余实现、产品接入、自测和验收材料。不要只审查代码、重新讨论架构、继续堆探针或只修一项测试。先交付工作台可操作的完整普通 Change 主链路，再完成其余 S1 条件。用户将在你完成开发和自测后另请 Codex 审核；你不能代替 Codex 宣布审核通过。

## 一、仓库与接手检查

仓库：https://github.com/hecotr/cimi-ai-native.git
当前本机目录：D:\cc\cimi-ai-native；分支 main。其他环境以实际目录为准。

旧电脑交接提交 e789902379534c6e36ea6ebc14266ed5167b761c 只是历史起点。最新实现基线为 bf0d60a90c95ba5f360175e960aa2e0f6a797dcb（D-310），随后可能有交接文档提交。请从本机最新 HEAD 开始，保留后续已有改动。

D-310 提交时，本机 main 比缓存 origin/main 领先69个提交，尚未 push；缓存 origin/main 是旧交接提交。这不代表已实时核对远端。先检查分支、HEAD、暂存区、工作区及真实 origin/main；允许安全 fetch，禁止 reset、clean、强推、覆盖提交或改动。不要重新克隆旧远程 main 后当最新代码开始开发。换目录或机器时先安全接入本机未推送提交；忽略目录、外置工具、缓存和原进程不随 Git 迁移。

QA5363D6C.tmp 和 QF192D3E3.tmp 是来源不明的未跟踪文件，不打开、不哈希、不删除、不加入 Git。不要把它们当你的产物。

查找并遵守实际适用的 AGENTS.md。环境必须为 Node >=24.15 <25、pnpm12.4.2，核对实际执行的二进制。本机此前 PATH 有 Node24.14，不能仅凭桌面应用自带较新 Node 宣称合格。按锁文件执行 pnpm install --frozen-lockfile，再执行 pnpm check；不要改锁文件或降低版本约束绕过环境问题。

开始时简报实际仓库状态、环境及第一项交付，随后直接实施，不重启全面架构讨论。

## 二、先读这些资料

先读最新状态与必要正文，不把大量旧批次摘要当当前验收结论：

1. docs/plans/2026-10-09-cimiloop-S1跨电脑接续.md。
2. docs/implementation/CimiLoop-V1可执行设计与实施计划-v0.1.md，重点是 V1-09/10/11/21/22、依赖、S1退出要求及当前实现状态。
3. docs/implementation/CimiLoop-SDK调用与IPC原字节账本-v0.1.md。
4. D-230：docs/implementation/CimiLoop-原Task累计期限与宿主接续-v0.1.md；D-231：docs/implementation/CimiLoop-原Run唯一启动登记与操作查询-v0.1.md；D-232为上述SDK账本文件。核对对应 docs/research 记录及实际实现。
5. docs/plans/2026-10-14-cimiloop-original-native-startup-policy.md（D-308）。
6. docs/plans/2026-10-14-cimiloop-parent-skill-domain-execution-path.md（D-309）。
7. docs/plans/2026-10-14-cimiloop-skill-result-final-original-closure.md 和 docs/research/CimiLoop-skill-result-final-original-closure-2026-10-14.json（D-310）。

按需通过 docs/research/README.md 定位共享 Runtime、Skill、工作台、澄清及账单的最新记录。代码事实优先于过时描述；修正必要状态文档，不另起架构，不为了“读完历史”阻塞实施。

## 三、当前已实现及尚未证明的内容

人工流程、CLI和人工工作台已有实现。原 Run 唯一启动、查询、取消、采集、资源恢复，IPC原请求/响应账本及实际SDK关联已实现；这些不自动证明任务完成、账单结清或真实Skill验收。

共享生产Runtime、固定工具/检查、父子账户及认证账单、Skill原件、Kernel子观察、父领域结果/RunObservation/终态等已有实现，仍需装成稳定的正式可执行产品路径。正式Agent默认入口仍关闭，普通CLI/工作台缺完整受信生产装配。测试注入工厂不等于默认产品可用。

近期关键实现：

- D-307默认Plan/Task创建入口要求原Human/Matt澄清，缺正式核验端口拒绝。legacyManualPlanning:true 仅受信代码显式兼容旧人工流程，不是UI/CLI/JSON旁路，不能用于完成正式链路。
- D-308新原操作固定 bun_interpreter/1.0.0、config8/9/10、claim3与原输入关系。C#控制器只给本次进程及子进程设置解释执行环境；不得修改系统安全软件、全局环境、固定版本摘要或关闭隔离。
- D-309父SDK cimi_run_skill原回执已接当前完整源材料、领域结果3、观察与终态。批量最多64条，每条receipt/current_input各自保持4096节点/深16限制；空洞、额外属性、getter、Proxy等仍拒绝。
- D-310同次同步Skill结果读取复用有界费用窗，保留前后两次完整新鲜账户审计；限定原root/scope/account，读取器退出回调即失效，不允许异步、逃逸、跨次缓存或换身份。末次账户回调后重读提供方原件，并对直接verified与Human reconciliation的Known终态纯核对原Start seal与Runtime boundary。最后不再进入安装的资格、账单或模型回调。NotStarted、旧Unknown和原证明格式保持原义。

最新验证为D-310最终完整两文件：direct17项、Human恢复26项，共43项，零失败零跳过。结合此前费用窗7项、字节封口18项、Runtime封口10项，分阶段覆盖五文件78项。不是一次78项整轮通过，不是全仓库通过，不是完整Native或S1。pnpm check、编译CLI帮助、795源码零漂移检查通过。普通独立源码复审三项P1已闭合，复审者未独立跑测试。中间红例、八项夹具失败、加载失败和编译异常保留，不能覆盖成“全绿”。

历史D-304 Standards的ST-02（HTTP路径漂移）保留为未修的条件性advisory，不预判为确定漏洞或忽略。读取 docs/plans/2026-10-14-cimiloop-matt-complete-source-review.md 及 docs/research/reviews/2026-10-14-matt-standards-delta.md，在当前源码重新核对；本轮普通复审不是覆盖它的新正式结论。

当前最直接的链路阻断：D-309实际父/子Native场景仍失败。子Native和账单返回后父模型预期4次、实际3次，父原30分钟Task到期、exit12；该次清理报告声明资源已处置且无错误。第四次只有宿主请求锚点，无专用发送意图/提供方dispatch，未到父终态和家庭总费用结算。不能将此解释成模型成功，也不能拿本次处置证明清理了其他旧Unknown。

D-310尚未做新的完整Native链路复验，未证明耗时改善。交接时本次已知测试/Native进程均已终结；不要续用旧进程编号、重开旧Run或续期原预算。

## 四、完整目标：五组缺一不可

| 组 | 必须完成的实现与验收 |
| --- | --- |
| V1-09 | 正式Runtime、固定检查命令、完整Native/SDK/工具/模型/账户身份关系、领域结果独立核验、费用预算与真实账单、物理配额、历史容量及完整异常恢复。SDK调用工具或原字节采集不能替代完整关系与效果证明。 |
| V1-21 | 固定真实来源/版本的Skill方法调用、组合依赖/权限、严格输入输出及CimiLoop原SkillInvocation/结果；Plan/Task创建前有实际Human回答与Matt澄清。输出不自动确认Contract、完成Task或批准Gate。 |
| V1-22 | Matt独立完整评审，Superpowers对当前源码的新鲜验证及真实行为对照。固定来源/版本、源码commit/digest、输入、原输出、结论和限制。旧D-304报告、普通工程review或开发助手读过SKILL.md不替代正式运行内真实Skill证据。 |
| V1-10 | 工作台正式Agent执行、查询、停止、原操作恢复/接续，全部通过共享应用服务复用Kernel、Runtime和账本。界面真正可操作，默认入口符合真实权限/准入，不依赖测试注入。 |
| V1-11 | 一个真实普通Change从需求走到ReadyForDelivery，含真实Skill、独立评价、至少一次有意义中断恢复、S1退出验收和可操作接入测试指南。满足主计划的A/F/R验收项。Run Succeeded不等于Task Satisfied或Change ReadyForDelivery。 |

五组全部完成且真实证据齐备，才能声称S1完成。缺真实模型/Skill/账户批准或必需Native证据时列明缺项，不缩小目标，不改名“基本完成”，不用构造ALLOW占位。

## 五、开发顺序

1. 在最新main构建上复验受影响的新普通父子Native链路：Runtime → 实际父SDK → 原Skill子执行 → 原结果及当前领域结果 → RunObservation → 认证家庭账单与Kernel结算。定位剩余阻断并修实际可执行路径，不能只增加计时探针与记录。

优先沿用 tests/scenarios/agent-parent-current-result-native-runtime.test.ts。该文件实际运行Windows/AppContainer/固定OpenCode/SDK/HTTP/Kernel，但模型、资格和账单仍是PUBLIC夹具；通过能证明具体Native集成，不能证明真实模型或真实Skill。

本机用户目录下 .codex/worktrees/s1-current-native-combination/cimi-ai-native 保留了一个候选工作区。它仍是D-309的795源码组合，没有同步D-310七个修改文件。先核对原件与源码，再仅同步必要路径并独立构建，或直接用main的新自有短Native夹具根。不要reset、整树覆盖、假定旧dist等于最新源码。.cimiloop/new-host-s1 中runner/raw reports/快照是本机忽略文件，确认存在后才能参考，其他机器不能假定存在。

D-310七路径：
- packages/runtime-adapter/src/agent-run-cost-evidence.ts
- packages/runtime-adapter/src/index.ts
- packages/runtime-adapter/test/agent-run-cost-original-cut.test.ts
- packages/local-app/src/skill-invocation-result-local.ts
- packages/local-app/src/skill-result-original-seal.ts
- packages/local-app/test/skill-invocation-verified-result.test.ts
- packages/local-app/test/skill-invocation-reconciliation.test.ts

2. 交付工作台完整共享装配。复用LocalAgentRuntimeComposition、Human启动/控制/观测/费用服务、Skill Native composition/execution/result collection与父Skill host/current result reader。共享服务在packages/local-app，HTTP在apps/workbench/src/server.ts，CLI在apps/cli。补受信装配与实际入口，不把业务判断复制到UI或路由。

3. 独立可推进的真实Skill执行器、Human/Matt澄清同步推进。外部批准未到时实现正确拒绝、条件诊断、安全配置校验与恢复；不要靠伪造批准、mock正向资格、跳过gate或人工旁路点亮正式入口。

4. 用一个普通Change跑完整产品链路，补物理配额、历史容量、异常恢复和接入指南。形成固定S1候选后完成新鲜独立Matt/Superpowers评审及最终完整自测；不能按任务编号顺序跳过V1-21/22。

每个完整批次必须交付实际可用能力或关闭明确主路径阻断。实现、必要验证、最小文档更新后本地Git提交，默认不push、不发布、不自动合并外部PR。沿用现有设计，普通review集中于完整功能批次，正式完整Matt/Superpowers集中于S1候选。已确定的权限、身份、幂等、账单、兼容缺陷先修。

## 六、不可降低的约束

1. Kernel唯一业务权威。UI/Runtime/SDK/Skill/账单/模型输出不得自行改变Task/Change/Gate，不建立第二套状态机。
2. 保留原Run、operation_key、invocation_key、Command与不可变证据。丢响应不能重开Run；重复请求不能重复工具效果、模型发送、占用、账单或领域事件。已提交原回执按原请求恢复，不重开工厂。
3. 效果前登记；每次效果前核对当前权限，await后和返回前复查身份、会话、取消和准入。迟到响应不能撤销取消或制造新发送资格。
4. 原Task累计期限和批准预算不续期、不放宽。不靠增加30分钟原预算、DNS期限、Job策略、节点上限，删原件检查、关闭安全软件或删除失败现场让测试通过。新的测试夹具也是新操作，必须遵循既定预算设计。
5. 242 Schema、项目数据库格式10、Host1为基线；私有config10/claim3不是项目库版本。必要变化设计显式兼容迁移，不原位升级用户库，不给旧格式回填新证据或重解释旧事实。
6. 物理Job/隔离/磁盘/网络限制要真实实施和核验，配置JSON、统计报警或Prompt不是物理限额。历史容量和保留策略要有实际边界、失败和恢复行为。
7. 新电脑“找不到”不能证明旧Unknown资源已清理。不批量删Temp/映射/Profile/原证据；只处置本轮明确拥有且身份可核对资源，保存正面处置证明。
8. 不读取或通过辅助脚本间接读取此前审批拒绝的旧 _HQOHKf/input.json 请求体；诊断用全新PUBLIC夹具。不临时回退生产修复制造红例，不制造未经保障的源码恢复窗口。
9. OpenSpec可选，ECC按需参考，本轮只做S1，不借机扩展S2/V1后续全生命周期。

## 七、模型、费用和凭据

用户只确认智谱提供方；具体模型、套餐、现金上限、积分上限仍未确认。币种/积分单位、计费及原账单取得方式也要按实际账户核实，不自行选值，不把PUBLIC夹具当用户批准。

确认前禁止真实或付费请求，包括“试连接”“最小验证调用”及隐含辅助模型调用。凭据通过仓库外现有安全连接方式配置，不从历史消息复制API Key，不写Git/日志/Agent上下文/命令行/报告，不把公开测试凭据当真实连接成功。

先完成不依赖外部信息的实现。真正需要真实验收前集中列缺项并向用户一次性确认；已有回答继续有效，不反复追问。模型/账户批准、真实Skill、Native独立效果、RunObservation、账单与Task验收是独立条件，互不替代。

## 八、自测与证据

开发批次执行一次必要受影响验证；失败后只复验受影响范围，有扩大影响依据才扩范围。保留首次失败，说明修复和复验。过滤/跳过/未终结进程不算通过，多轮不能混成一轮。

提交前核验pnpm check、相关完整测试文件、必要真实Windows/AppContainer/Native/SDK场景、编译CLI与工作台实际操作、git diff --check。新行为先建立有意义反例，不写只复述实现的测试。

S1候选冻结后按主计划跑最终完整验收和回归。若声称全仓库通过，必须实际执行完整pnpm test并列失败/跳过；分层分阶段就明确说明。非Windows环境使Native runIf跳过不算通过，必须取得实际Windows x64结果。

证据对应当前候选commit、源码/构建、固定真实来源技能与当前批准配置，记录完整文件范围、项数、开始/结束、退出码及失败资源处置。原始内容安全保存，Git中保留可审计索引/摘要/非敏感原件；不得为了留证把凭据或敏感上下文写Git。

普通Change要同时展示：创建前实际澄清、正式Contract/Plan/Task、工作台启动、真实模型/Skill、固定检查与独立评价、有意义中断及原身份恢复、费用/预算、Task满足和ReadyForDelivery。检查重复请求/丢响应无重复效果，以及缺权限/撤权/缺原件/超支等关键反例的拒绝和恢复。

接入指南要让另一位开发者真正复现：环境安装、仓库外安全配置、模型/套餐/预算批准、启用条件、工作台或CLI步骤、预期输出、停止/恢复、费用核对、验收命令、失败处理。列必要批准和未可用项，不留下未声明的手动注入、临时夹具或绕过gate。

## 九、交给Codex审核的材料

完成后停止新增开发，固定候选、本地提交并给用户：

- 开发前后commit、比较范围、提交清单、剩余工作区改动，默认不push。
- 五组要求逐项“实现位置/实际操作/测试/真实证据/剩余条件”矩阵。
- 普通Change完整复现步骤、Run/操作/Skill/原Command的非敏感索引及ReadyForDelivery证据。
- 自测命令、文件/项数、成功失败跳过、原始报告路径、源码固定和构建说明；不得删首次失败。
- 新鲜Matt两轴原评审、Superpowers原验证和真实行为对照，固定来源/版本/输入范围；普通工程review另列。
- 格式保持或显式兼容迁移说明，权限/隔离/幂等/取消/恢复/费用/物理容量的关键反例。
- 最终接入指南、真实外部条件、风险及仍未完成项。

只有全部必选能力与真实证据齐备，才报告“开发和自测完成，待Codex审核”。若外部批准、Windows实际结果或真实Skill仍缺，报告“实现/部分自测完成，S1未验收”及具体缺项，不用构造证据占位宣布完全完成。

由用户把稳定候选交给Codex审核；不自行宣称Codex审核通过，不改写历史失败，不自动推送/合并/发布。

## 建议技能

有对应技能时读取实际SKILL.md，用于已有计划执行、TDD、故障诊断、完整功能批次review和交接。建议executing-plans、test-driven-development、systematic-debugging、requesting-code-review。Matt与Superpowers正式技能必须按固定真实来源与项目调用契约接入，不能只借名称。不要因换编辑器重启全面brainstorming；现有架构与授权继续有效。
