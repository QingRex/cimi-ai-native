# 原父 Run 当前候选 Skill 输入 Implementation Plan

> 最新本批：main原103文件948项为943通过5失败0跳过，报告保留。准备阶段/模型終检修补后，实际生产与父子家族整2文件4项、原Native配置整16项、模型終检整3文件64项通过；check及CLI帮助通过、774源码零漂移。分组并集不是一次103文件全绿，非全仓库/S1。正式Host当前结果及领域结果3继续，默认Agent关闭，无付费、不push。

> 2026-10-13 D-288：当前输入独立核验5文件72项及类型检查通过；隔离准备阶段修复3文件61项及类型检查通过。main原103文件仍运行且生产链路3项已失败；隔离实际Native整文件运行中。详见[当前批次状态](2026-10-13-cimiloop-current-input-pre-ipc.md)，不能将隔离合同当作main或S1完整通过。

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将原父 SDK 修改后的完整当前候选接入真实 Skill 子调用准备、Kernel 独立准入及最终结果适用性核验；保留原 Run 与原请求身份，不刷新重试输入。

**Architecture:** 目录1保留固定输入含义；私有目录2明确 input_recipe=original_run_candidate/1.0.0。共享应用服务在第一条原 SDK 请求内，从原 Run 的独立 Native 文件链、完整原 workspace、原 HEAD/index 及实际固定检查解析并保存候选、资料和原输入，然后持久化预约 intent2。Kernel 的专用只读原候选核验端口独立复读原候选，证明原父仍适用；不改变全局 sourceIsCurrent、不重做新基线 admitContext，不接受模型或 JSON 安装端口。

**Tech Stack:** TypeScript、Node24.19.0（满足>=24.15<25）、pnpm12.4.2、Vitest、SQLite现有格式10、私有原字节对象与实际 Windows/AppContainer Native账本。Protocol仍242Schema，Hostledger1。

本计划属于原完整五组目标；不是额外探针目标，也不是S1退出定义。D281已提交，D282主组合和D283/D284组合回归仍在原进程执行。新工作树逐文件复制被冻结的762源码；被复制内容尚不能冒充完整当前组合通过。缺具体智谱模型/套餐/现金币种和上限/积分上限时不付费、不读取真实凭据。原Unknown现场不删除、不据找不到宣称清理。

### Task 1: 保存当前候选调用而不刷新原重试

Files: packages/local-app/src/agent-parent-skill-calls-local.ts；packages/local-app/test/agent-parent-skill-current-candidate.test.ts。

1. 写行为反例：目录2第一请求调用候选解析一次，以生成的 input_ref 预约一个真实 Kernel 子；目录1固定输入不变。
2. 运行指定文件，确认在目录2拒绝处失败，记录原报告。
3. 实现明确目录2 recipe 校验，捕获同步可信 candidates.resolveOriginal/readOriginal 端口；SDK仍只发原alias，不发路径、actor、输入或Command ID。
4. 原command_id沿用原Run创建毫秒和call_id的派生UUIDv7。第一解析发生在独占原call目录内，保存候选、intent2和anchor后才Kernel预约；没有intent的残留目录拒绝。
5. 丢响应、调用服务重建、原Run revision变化均读取同一input_candidate和Command，不再次解析；原文件或候选丢失拒绝，不补建。即使原文件都丢失，Kernel原command receipt存在时也不得再解析或生成输入。
6. 抗换alias/recipe/digest/command_id、异步端口及目录漂移反例；旧目录1和现有父Host回归通过。

### Task 2: Kernel 独立核验原父当前候选

Files: packages/kernel/src/runs.ts；packages/kernel/src/skill-invocations.ts；packages/local-app/test/agent-parent-skill-current-candidate.test.ts；packages/store-sqlite/test/skill-invocations.test.ts。

1. 在实际Git改动的原父运行写反例：没有独立端口、错误原Run/Command/input、撤权、异步返回均不得预约。捕获式verified布尔不是接口。
2. 增加 code-only verifyParentCandidate 原事实端口，读取当前Kernel只读writer视图，验证原record/context/source/workspace/input和原host_admission_ref。只读视图回调后失效，不授予transaction/写操作。
3. 无候选的旧路径沿用干净源码/sourceIsCurrent及原admitContext；原候选路径独立证明既有原admission/同Run当前效果，不重录入新基线。首次Run和其他恢复/决定的干净源码门禁不变。
4. 命名方法prepare/资格回调之后再次核验原候选，固定前后原证明摘要一致，避免回调改写后仍提交。原回执重放不再调用端口或产生效果。
5. 核对全部旧Skill/Agent预约、Schema242及用户库10。

### Task 3: 真实 Native 当前候选解析与只读证明

Files: new packages/local-app/src/agent-parent-skill-candidate-local.ts；packages/local-app/src/runs-local.ts（复用modelWorkspace）；packages/local-app/src/agent-check-admission-local.ts（复用原forRun/validateTool）；packages/local-app/src/index.ts；new packages/local-app/test/agent-parent-skill-candidate-native.test.ts；actual Windows scenario。

1. 用真实Git和实际原文件/固定检查宿主写反例：外部手改、未决/foreign Native、HEAD/index变化、未经授权新文件、旧检查或修改后检查失败、原件丢失必须拒绝。
2. 原scope及原record/context/workspace固定。使用readWorkspaceFileRunOriginals的独立Native效果、modelWorkspace的全授权资源投影与原HEAD/index；不得只取检查脚本涉及的文件。
3. 从原IPC请求和SDK身份绑定当前run_skill请求，之前文件/检查调用必须完成且回执独立对应。当前尚待返回的run_skill不能伪装为此前已结清，不能假定所有IPC都为Observed。
4. 原forRun核对原检查catalog、node/policy与完整实际原admission。每个必需固定检查应在最后edit之后，receipt/sources与当前投影对应。不得执行新检查来补造旧检查证明。
5. 保存完整候选diff及授权workspace实际内容为不可变Skill artifact，保存独立原候选proof并绑定scope/原Command/recipe/input。超完整输入/SDK实际上界拒绝，不截断成局部评审。
6. Kernel端口自己重新读原件与当前完整源码，原证明存在不等于当前仍适用；所有回调之后最终复读原HEAD/index、物理文件和原bytes。

### Task 4: 把当前候选接至父 SDK 子执行及原结果

Files: packages/local-app/src/agent-parent-skill-host-local.ts；packages/local-app/src/agent-parent-skill-results-local.ts；packages/local-app/src/skill-invocation-native-composition-local.ts；packages/runtime-adapter/src/agent-runtime-completion.ts；explicit current candidate result tests。

1. 共享Host使用实际原候选input，执行已有Native方法服务和独立子结果核验，保持原子invocation/account/budget。
2. 历史读者返回目录2的原候选证明，查已提交原Kernel预约/观察回执，不重新解析候选或启动子。
3. 领域核验仅在显式当前候选证明、实际独立子输出与当前完整源码仍对应时接受run_skill为输出证据；目录1继续只能证明历史输出。
4. 父修改→检查→run_skill→子实际Native材料/调用→原子Known/最终账单→父继续→独立领域与家庭结清必须走同一共享应用链。构造模型/资格/账单只能验证组合，真实Skill/model/S1另有明确门禁。

### Task 5: 冻结完整受影响验证、文档与本地提交

1. 使用绝对选定Node运行 pnpm check；固定pnpm锁安装不能变更锁文件。
2. 新旧父calls/Host/SDK/IPC/current-candidate/Native/domain/shared service/费用及Kernel/Store回归；含实际Windows/AppContainer，跳过不算通过。
3. 冻结本批完整源码，原进程原报告前后摘要一致，失败和Unknown资料全部保留。当前D282和D284已有运行不重启、不改源，不把观察超时当作终结。
4. 普通独立工程复审、UTF8/link/fence/git diff --check；明确实际可用能力、范围、构造与真实证据及剩余五组条件。
5. 按验证过的精确增量顺序集成main，保留主独有修补和无关TMP；主当前组合再验后更新交接/V1实施/SDK账本索引与研究记录，精确路径本地Git提交；默认不push。

Implementation commands由任务专属runner执行选定Node+pnpm，maxWorkers1，私有新临时/Native根，报告保存在主工作区已忽略.cimiloop/new-host-s1。正常测试观察与实际Task/Run执行预算分开；不提高实际执行预算以让测试通过。

### Task4补充：父模型的原IPC因果窗口

普通独立方案复审确认LocalAgentModelAdmission现只允许未决末尾model_step，Native前缀核验也未传父历史子结果读者。Task4必须由可信IPC门提供精确当前call_id/ordinal/request_digest，只允许这个唯一在途尾run_skill，不把它当完成效果；完成的历史Skill须独立核对原Kernel子回执与证明后再准入下一模型步。禁止泛化过滤所有run_skill或清零未决数量。候选预约及父模型准入复用同一因果窗，新增真实IPC pre/post gates行为反例。Kernel作用域Reader至少补ProviderBinding/Descriptor；复用完整authority时依赖的审批与Assignment也须来自同一Writer，不另开连接。该复审未运行测试、未替代完整Matt/Superpowers/S1。


## Task1/2 当前实现检查点：独立出生与预约前完整原件（2026-10-13）

D282已在main本地提交1de1562，未push；本工作树D285仍未集成或提交。当前目录2解析与Kernel专用独立核验端口已实现，实际Native候选解析端口尚未安装。解析前在调用记录目录之外以wx持久化固定scope/catalog/frame/原command的出生标记；原CallRoot丢失但birth保留时拒绝再解析。候选回读及最后守卫后，在Kernel预约前完整复读header/intent/anchor/birth和原身份，之间无外部回调；历史及回复前后再验，旧目录1保持固定输入含义。

有效r15两文件15项：11通过、4项行为失败；四项分别证明guard/资格拒绝后目录丢失会再次解析，以及候选回读/最后守卫改动原件会在Kernel已有预约后才被发现。原报告保留；r8两项初始化Project快照错误及r10/r11 Writer回执API夹具错误不算新的业务反例。修补后r16 pnpm check通过，764源码零漂移；r17完整七文件新旧预约/Kernel/Writer/Store范围正在原进程运行，不预判通过，不把已过单项当完整组合。普通工程复审确认两项must-fix已闭合，非完整Matt/Superpowers。

本地出生标记不证明整个Host数据丢失后的恢复。Task3必须接入实际原Native/Host票据、完整当前workspace与原HEAD/index、修改后的实际固定检查、完整不可变Skill资料，以及当前原SDK请求因果窗口。Task4还要接父模型准入的精确IPC窗口、实际子执行/账单/父接续及显式当前候选领域结果；Task5完整Native复验、main顺序集成与本地提交未完成。模型/资格/账单PUBLIC夹具不构成真实Skill/model/S1；五组目标active、默认正式Agent关闭、无真实凭据读取、无付费，不push。


## Task1/2 完整新旧合同验证结果（2026-10-13）

r17原进程完整七文件58项全部通过、0失败/0跳过，764源码前后逐文件摘要一致；r16 pnpm check通过。包含新候选、独立Kernel候选准入、旧目录1、Writer只读与生命周期、Store Skill/Agent原回执合同。四项有效恢复反例均已修补；普通复审无剩余必修。Task3实际Native候选解析及Host票据、完整workspace/check/input，Task4父IPC精确因果窗、实际子/账单/父接续及显式当前候选结果，以及完整五组S1仍待完成。本工作树未main集成/提交；不把58项合同当真实Skill/model/S1。r8/r10/r11的夹具错误和r13/r15行为失败均保留。


## Task3 接续：完整候选资料保存与无写入回读（2026-10-13）

D285 原 r17 已完整通过七文件 58 项、零跳过、764 源文件零漂移，替代上面仍在运行的检查点状态；旧报告保留。复用该已终结的任务专属工作树，先核对每个原冻结摘要，再引入 D286 当前 770 源文件及短路径 Native 夹具；没有复制缓存、原进程或凭据，不改仍在执行的 D284/D286 源。

LocalRunVerifier 新增 captureOriginalCandidate/readOriginalCandidate，复用完整 modelWorkspace 的独立原 Native 链投影，保存全部授权资源的原文及当前文、原 HEAD/index 和完整 worktree diff 的不可变引用。回读只复读现存原件，不存储、不创建替代资料，不 dispatch、不开始新的事务；保存与回读结束前再次读取完整当前源与原 diff/index，Kernel 业务记录不改变。构造 Native 链只用于算法合同，不能冒充实际 OS/SDK/Skill/S1 证据。

r1 实际 Git/内容存储九项中四个能力缺失反例已失败且保留，另五项拒绝断言在 API 缺失时不足以证明真实拒绝。实现后 r3 pnpm check 通过、771 源文件零漂移；r2 九项合同仍由原进程执行，终结前不预判。当前单 artifact 50KiB 上限是待替换的中间实现，应把完整资料连续分段且全部固定引用，在每个真实 SDK 资源上施加上限，不能把单资源上限误当整个候选输入上限。

尚未安装完整 Native 当前候选解析及 Kernel 验证服务；实际固定检查必须在最后修改之后，当前原 IPC/Host 票据/SDK 身份、完整不可变输入、子 Native 执行/账单、父继续及显式领域结果仍要接成同一共享路径。D284 r41 92 文件原进程和 D286 r26 25 文件原进程仍执行，后者已出现一项失败，不能称完整通过，待原终结错误定位。五组范围 active，默认正式 Agent 关闭、Schema242/用户库10/Host1不变，无付费、不push；未完成批次不提前本地提交。


## 完整资料分段、原件终检及 BOM 原文（2026-10-13）

r2 已完整通过资料九项、零跳过；替代上面的仍在运行检查点。r4 有效复现整体资料被单资源 50KiB 上限误拒。独立普通工程复审又发现：最后保存 artifact 或最后复核完整物理源码时，先前新存对象丢失却仍可返回失效引用。r5 完整十二项为九通过、三项有效行为失败，原报告保留。

已改为全部 UTF-8 原资料的连续分段；每段保持 SDK 的 50KiB/2000行/2000字符上限，parts 绑定固定引用、连续起止字节、头部长度，artifact_refs 包含全部段，整体字节数与摘要证明无漏失、不截断。64 段仅来自现有完整输入 artifact_refs 上界；后续实际 named method 的完整资源数/Context 仍须经已有 SkillMethodInputs 和 validateFixedMethodContext 核验。保存与回读均在最后完整源码/diff/index 复核后再逐项复读固定对象原字节，缺失即拒绝、不補建。

r6 新资料十二项及旧完整 workspace 八项，共两文件二十项通过、零跳过、771 源文件零漂移；r7 同源码 pnpm check 通过。复审发现源文 TextDecoder 默认吞掉开头 UTF-8 BOM，r8 新增原/current BOM 重构合同有效失败，十三项中十二通过、一失败。该唯一源文 decoder 已加 ignoreBOM:true，保留全部原文字符；当前 r9 完整两文件二十一项及 r10 pnpm check 正由原进程复验，终结前不预判完整当前通过。

真实 Native 当前候选解析及 Kernel 证明端口仍未安装，实际检查的修改后适用性、原 IPC/Host/SDK 因果身份、完整不可变输入→实际 Skill→子账单→父接续→领域结果仍待接齐。当前处于完整批次之内，未提前集成/main提交；五组与完整 S1 退出条件保持，默认正式 Agent 关闭，不付费、不push，Schema242/用户库10/Host1不变。


### BOM 修补后原完整进程已终结

r9 已完整通过当前两个文件二十一项、零跳过；r10 pnpm check 通过。二者为完全相同 771 源文件摘要，前后零漂移；替代上面 r9/r10 仍运行的状态。完整连续资料、全授权源码、原 HEAD/index/diff、原件丢失拒绝、最终原字节终检、UTF-8/BOM 和 Windows 原路径大小写投影均已核对。该范围仍只证明资料层与投影；其中一项 Native 链是明示控制合同，不构成实际 Native、真实 Skill/model 或 S1 验收。

main 的 runs-local 原摘要与本隔离种子的初始原摘要不同，接续集成时须先识别 D283/D284 依赖增量，禁止整文件覆盖主独有修补或以隔离通过冒充 main 当前组合通过。接着安装 Native 当前候选解析、修改后固定检查与 Kernel 独立证明端口，再接实际子执行/父接续和领域结果；完整批次验证、文档、main 本地提交尚待完成。


## D284 r41 原完整终结与候选服务评审（2026-10-13）

D284 短路径实际 Windows 回归 r41 已由原进程终结：92 文件 840 项，839 通过、一项失败、零跳过，763 源文件前后零漂移。唯一失败为生产 HTTPS/SDK/Native/Workbench 链路只观测 3 次、预期 4 次请求；原资源记录有 agent_sandbox_task_deadline 和 Task 600000ms 原时限。超过时限的具体原因尚未证明，不归咎于并发/CPU，不放宽预算，不重开原 Run，也不把当前父资源 disposed 外推为全部或旧电脑资源已清理。原 r38 失败及 r40 四实际 Native 文件五项通过均保留，不能将 r40 或单文件复验改写成 r41 全绿。

新生产候选服务已接原 IPC/current ticket、历史 Native 前缀、完整候选资料、原固定检查和 Kernel 独立预约读者；当前明示控制 Native/model/qualification 的合同 r19 两文件十四项通过、零跳过，774 源零漂移，尚非实际 Native 候选执行证据。r20 类型检查失败保留；修补夹具联合类型及 nominal src/dist 收窄后新增 r21 原配置/末次回调/容量合同十三项：七通过、六项有效缺陷失败。原配置缺少 identity.input 绑定、最终 Native 回调可移走资料，以及整份证明误用单 IPC4096节点上界均已复现。修补后的 r22 四文件原进程仍冻结运行，不预判完整结果；r23 类型检查指出 parser 顶层 guard 放入 literals 分支及 header nonce 类型错误，修补待原进程终结后进行。

普通工程复审还指出材料终检之后独立 Native 文件/检查原账本，以及 Kernel 内 live 回调后原 intent/header/anchor/birth 的末次无回调封口需要补齐。准备合法原删除 null 回读、私有 JSON 超容量/重复/危险键反例及实际 Kernel 零预约反例后修补，完整复验再作正式组合。普通评审不是 Matt/Superpowers/S1；实际 Native 当前候选、真实 Skill/model/account、正式默认入口、完整领域输出/家庭结清、main 顺序集成及本地提交仍未完成。五组持续目标保持 active，无付费、不push，Schema242/用户库10/Host1不变。


### D287 r22/r25 已终结，后续末次封口反例运行中

r22 原四文件 44 项已全部通过、零跳过，774 源文件前后零漂移；替代上一检查点中 r22 仍在运行的状态。它未覆盖原删除 null 引用：r23 类型检查暴露私有 parser 误把顶层形状判断放进 literals 分支，以及误读 header nonce 类型。原 r22/r23 报告保留；原 r22 终结后已将 literals 恢复返回 JSON 值、顶层完整解析后再核验六字段，固定 config nonce 作为纯终检身份。新增合法原删除 roundtrip、私有 JSON 超容量/重复/危险键/额外字段反例后 r25 pnpm check 通过、774 源零漂移，不能据此声称新测试已全绿。

新增 Kernel 最后完整材料读取期间独立 Native 账本变化，以及最后 live 回调移走 intent/header/anchor/birth、撤销当前 IPC 票据的反例。r24 原完整文件正执行、源码冻结，终结前不得改源或预判新反例；修补 helper 已准备，将通过纯 Native 原读者快照和全部原请求字节终检封口，不再调用 child/check/model 回调。之后运行新的完整受影响回归及 pnpm check，再推进实际 Native/SDK 候选与显式当前领域结果。该未完成批次尚未 main 集成/本地提交，普通工程复审及控制读者不是 Matt/Superpowers/真实 Skill/model/S1。完整五组目标仍 active，默认正式 Agent 关闭、Schema242/用户库10/Host1不变，无付费、不push。


### D284 r42 同原源码完整失败文件已复验

r42 已由原进程完整通过原失败文件全部三项、零跳过，763 源文件前后零漂移且与 r41 完全相同；实际 Task 和测试观察时限均未提高，使用新的任务专属夹具，不重开 r41 原 Run、不删除其 Unknown 原件。覆盖实际 SDK、Native/固定检查、专用本地 HTTPS 原账户组合、Workbench 原回执及末次 await 后 Human 撤权。模型、资格、凭据和账单仍为明示 PUBLIC 控制夹具，不能当真实 Skill/model/account/S1。原 r41 全 92 文件仍为 839/840、一失败；原时限失败具体原因仍未证明，覆盖并集不等于一次完整 92 文件全绿，也不证明旧电脑 Unknown 清理。

D287 原 r24 六项有效缺陷已确认。r26 当前四文件 52 项为 51 通过、一项合法原删除误拒，原报告保留；r27 check 通过。修补原 manifest 已登记且 mW=000000 的删除行、材料末读后独立 Native/IPC pure 比较及真实 sandbox/config 目录后，r29 check 已通过、774 源零漂移；r28 四文件包含直接端口 Native 原件丢失及票据末读的新合同正在原进程冻结执行，不预判通过。普通复审无新增 must-fix，不是 Matt/Superpowers/S1；main 精确增量集成仍待原完整验证终结，未提前提交。
