# 原模型 Job 资源核对与共享 CLI 控制

接续 `d88f39a`，完整五组S1继续。本批补齐原 Native 查询／恢复漏掉 Codex 进程 Job 的缺口，并把查询、采集、取消重试、恢复正式接到 CLI 的同一应用服务。没有把这一项恢复能力当作四项生产控制或完整S1已完成。

## 实际行为

此前 `queryAgentRuntimeOperation` 的资源布尔值只核 Native 沙箱，Codex 模型进程另有 owner Job；沙箱清理成功后仍可能有未核定的原模型调用。现原 Codex 绑定的查询、采集和恢复同时读取模型 Job，明确 `resource_scope: native_and_current_codex_run`。Native 已停但模型资源待核对时整体 Unknown，整体资源已处置须两者均成立。旧非Codex路径明确标为 `native_only`，不改变其既有含义。

新内部 launch2 固定原取消文件、nonce、配置摘要。Host1 的 prepared／started 票据依次固定准备材料及实际进程身份，首次模型 RPC 前必须完成启动登记。原 C# 监督进程支持取消，终止并等待整个Job活动数归零，关闭Job，再写结束原件。宿主进程突然退出同样触发原监督进程清理。客户端先让监督进程收尾，超时仍可停止自己持有的原子进程，但缺证明保持 Unknown，不能因强制停止推断已完整清理。

资源只读入口校验原 protected Host1、请求／配置／启动身份、原程序摘要、结束摘要链及当前OS进程身份。PID必须同时匹配创建时间和程序；不存在与不可核对分别处理。结束文件缺失不修复，即使进程已不在也不自动报告 disposed。新启动票据丢失不回填。已有独立完成票据仍按原规则读取，旧 Unknown 不从新电脑或新位置的“未找到”推断清理完成。

资源证明与模型成功封口、任务结果及账单分开：`completion_proven:false`、`costs_reconciled:false`、`family_resources_disposed:false`。SDK 响应丢失时可以证明原 Job 已结束，但模型结果仍待核对；相同请求继续拒绝第二次派发。它不自动清理原子技能或整个任务的全部资源。

CLI 新增 `run query-original/collect-original/cancel-original/recover-original`，复用 `LocalAgentRuntimeControl`，不打开执行工厂、不接收来源安装JSON。取消重试和恢复须先有 Kernel 原取消记录及当前 Human 控制权限，重复操作不重复产生 Kernel 效果。工作台相同查询在 Native 清理已完成而模型未知时显示明确提示。[操作指南](../implementation/CimiLoop-原Agent模型进程资源核对-v0.1.md)。

格式仍为 Schema242、项目库10、Host1。仅新增内部launch2和Host1票据约定；launch1、原方法start10、原模型header1—19读取不重解释，不升级或迁移用户库。

## 原真实 Run 的只读复查

本机原Luna Run `01a179d8-f1f1-7004-986b-fbb14fed8b81` 使用新查询复查，报告 `.cimiloop/codex-2026-10-27-model-process-recovery-historical-audit.json`。Native原件和当前身份支持沙箱已清理；前四个原Codex调用有独立结束票据；第5调用缺少完整资源观察依据，仍Unknown。整体 `resources_disposed:false`，status Unknown，不产生完成或结费证明。本批未重开原Run，新增真实模型请求0，没有处理旧Unknown资源。

## 实际验证与失败

Node24.22.1／pnpm12.4.2。测试中的模型／账户／资格仍为PUBLIC；实际Windows Job、进程树、Host1、SDK／IPC和文件效果不能扩大为真实模型、账单或S1验收。

- 新资源API反例先1失败，API缺失；报告 `model-process-recovery-red.json`。
- 首轮实际进程文件1通过7失败，C#新条件表达式的int／uint编译错误已修正；随后定向用例1失败7过滤，定位为进程退出后先读映像而失去查询能力，现先核已退出状态，再核创建时间和映像。最后定向1通过7过滤不算整文件通过，所有报告保留。
- 核心三文件首次36通过1失败：旧“stall”夹具在宿主输入管道关闭后可自然退出，结果为worker_exited，不能证明本用例要求的owner_exited路径。夹具改为持续活动，要求真实Job终止。产品没有放宽结束条件。
- 最终进程与模型两个完整文件69通过、0失败0跳过（`model-process-recovery-final.json`）：含取消实际常驻进程／后代、宿主突然退出、缺结束原件仍Unknown、启动字节篡改拒绝、模型封口丢失不重派，以及SDK响应丢失但独立Job已结束。
- 实际Native／SDK双阶段和当时完整模型文件合计61项通过（`model-process-recovery-sdk.json`）；模型文件后来新增SDK丢响应用例，以前述最终61项完整模型结果为准，不重复累计。Native双阶段1项实际执行新Job组合与两阶段资源查询。
- 原操作13项、共享Human控制16项在核心报告中完整通过；工作台HTTP9项／DOM2项完整通过（`model-process-recovery-workbench.json`）。
- CLI帮助反例1失败1过滤，实际缺 `query-original`（`model-process-cli-red.json`）。新增CLI测试类型收窄与未公开claim导入错误已修正。CLI完整文件最终2项通过、0失败0跳过（`model-process-cli-first.json`）：真实编译CLI／Kernel／SQLite查询及采集、Kernel取消前恢复拒绝、原取消标记重放、原Run及预算仍Unknown，模型与Native进程启动0。按各完整文件最新结果，本批8个文件共112项通过，分轮运行，不重复累计早期结果。
- 最终 `pnpm check`、编译CLI `run --help`、工作台JavaScript语法、文档UTF-8／围栏／相对链接及 `git diff --check` 均通过。未运行全仓测试或真实模型／账户／账单／S1验收。

报告统一前缀 `.cimiloop/codex-2026-10-27-`。失败记录未改判，验证分轮完成，不称全仓或完整S1。旧六个未跟踪文件不读取、不散列、不暂存、不删除。

## 完整目标剩余

默认正式Agent仍缺网络／可靠费用与上限／全部物理配额／全部恢复的完整生产控制来源组合；本批只解决当前原Run模型Job这一部分恢复。固定卷、同卷登录目录、真实账单与原Human回答等缺项保持明确。真实Skill／Matt、普通Change到ReadyForDelivery、接入指南实走及最终Matt／Superpowers评审继续实施。本批不发送真实模型请求、不释放Unknown预算、不push。

## 停止命令在首次检查前固定

后续检查确认父Run及全部原子Skill的查询／采集／取消／恢复已由共享 `LocalHumanAgentRunFamilyControl` 组合，CLI和工作台复用该服务，不重做已有恢复实现。实际发现另一项原身份问题：单Run及完整调用族的 `stop` 仍持有调用方可变命令对象；安装的同步guard改写command_id或reason后，Kernel保存的是被改写请求，原ID没有回执，丢响应后无法按原ID重放。

两个入口现在进入时即复制完整命令，后续验证、Kernel取消和物理控制都沿该快照。子Skill停止入口此前已有快照，本批不改变其语义。Kernel仍是唯一取消业务权威，不新增Run、领域结果、账单或预算释放；工作台和受信调用方无需增加操作步骤。

真实Kernel／SQLite反例先得到0通过、2失败、38项过滤未运行，报告 `.cimiloop/codex-2026-10-27-original-human-stop-command-red.json`；两项都失败于原command_id缺回执。修补后复验核对原ID存在回执、回调改写的ID没有回执、用原命令重放同一结果、只有一个取消事件和一个Run，预算保持待核对。

首轮三个完整文件57通过、5失败、0跳过，报告 `original-human-stop-command-final.json`（沿用既有文件名前缀，文件名不作通过证明）。单Run完整19项、子Skill完整22项已通过；完整调用族16项通过，另5项为旧用例15秒测试超时，新增请求快照反例已通过。失败用例均在测试体内创建完整新项目，整项实际17.4—28.4秒；该文件使用共享beforeAll夹具的控制用例多数不足1秒，原beforeAll准备本已有120秒预算。

仅将6个在测试体内创建新Kernel／SQLite／Host1项目的用例预算设为60秒，与单Run既有beforeEach准备预算一致；保留全部原断言及真实原件路径，没有修改生产Runtime期限、配额或空间停止线。随后只重跑受影响调用族整文件，21项通过、0失败0跳过、exit0，报告 `original-human-stop-command-family-final.json`。按各完整文件最新结果，本批3文件62项分轮通过，不将首轮16项再次累计，也不称单轮整仓验证。两份后续报告同样位于 `.cimiloop/codex-2026-10-27-` 前缀下，旧失败保留。

Node24.22.1／pnpm12.4.2，产品修补与测试准备预算修补后的 `pnpm check` 分别通过。独立定向源码复核未发现快照修补问题，并确认测试预算修正保留业务断言及生产限制。实际范围为共享应用服务、真实Kernel／SQLite及Host1，Native端口、模型和资格仍为PUBLIC；不证明真实模型、费用结清、全Native或S1。未运行全仓 `pnpm test`，没有真实模型请求或凭据读取。

原完整客户端构建13在本批期间持续推进，仍以其原Job、日志和最终result为准，不能由本批控制服务测试推定成功。完整五组S1范围、Schema242／项目库10／Host1、六个既有未知文件及历史Unknown保持；只本地提交，不push。

## 历史模型结果损坏后仍停止可核对的原 Job

接续 `f75dcd2` 的独立工程复核发现：资源查询与取消在逐调用控制前先读取全部成功模型结果。历史调用的 seal／receipt／SDK reply 损坏，或该项 dispatch 丢失时，会连带阻断同一 Run 后续身份完整的活动模型 Job；外层 Native 停止及 SDK 取消标记不能代替模型取消投递。

现新增内部请求专用读取，沿用原 SDK header／request 校验，但不读取 reply；完整结果读取仍按原规则校验。资源路径逐项核对 SDK 原请求、Codex 双份请求、dispatch 摘要和物理身份，保留 Run／operation-key 与原模型绑定；实际进程控制仍由原 Host1 对完整请求、配置和原 Job 身份独立复核。资源路径不重建需要历史成功结果的模型 prompt，也不凭本地请求 JSON 取得进程权限。单项缺件或原 Job 资料损坏只让该项 Unknown，继续处理其余可核对原调用；结束再次核对完整请求集合及文件身份。完整结果、财务和生产准入不使用这一部分视图。

四项新增反例分别保留丢失的 seal、receipt、dispatch 原文件，或损坏 SDK reply；都先执行一个已记录调用，再令同 Run 第二个原 Job 实际活动，经正式 SDK 原取消入口验证后者结束。撤权拒绝、相同取消标记重放、两个原请求的有限账户占用不变、没有第三次发送、损坏结果仍拒绝核验同时成立。账户与模型为 PUBLIC 夹具，实际使用 Windows Job、进程和 Host1；不读取用户登录，不发送真实模型请求，不形成费用结清或 S1 证据。

实际验证记录均在 `.cimiloop/codex-2026-10-27-`：

- `historical-model-resource-red.json` 首次4失败源于新增夹具沿用了包装前 admission，不作产品反例；修正为实际 port admission 后，`historical-model-resource-red-02.json` 为0通过、4失败、64过滤未运行，四项均实际失败于原资源读取依赖历史结果／dispatch。
- 首轮修补后的 `historical-model-resource-green.json` 为3通过、1失败、64过滤未运行；第4项在实际辅助程序编译阶段报 `agent_sandbox_build_failed`，尚未到达新增控制断言。失败原材料保持；未找到对应时间窗的Windows Application错误事件，不猜测具体原因。同批原C#源通过既有编译封装在全新私有目录独立诊断退出0，原失败缓存未修复或覆盖；原件在 `C:/CimiBuild/cp-20261027/compiler-diag-YJLzLT`，该本机路径不是跨机器配置。
- 最终 `historical-model-resource-final.json`：4个完整文件113通过、0失败、0跳过、exit0。模型原件68、原进程Job21、通用模型16、SDK取消8。新增四项全部实际通过；原Job文件还覆盖宿主突然退出、原资源取消和响应丢失。只运行受影响范围，未运行全仓 `pnpm test` 或完整 AppContainer／真实模型／费用／S1验收。

Node24.22.1／pnpm12.4.2。初次类型检查暴露未知JSON字段的TypeScript类型错误，修正后最终 `pnpm check` 通过；diff检查通过。两次独立定向源码复核未发现新增确定问题，范围限本修补，不作最终 V1-22 评审。操作指南同步说明历史结果损坏时的原控制行为和完整调用族入口。Schema242／项目库10／Host1保持，不迁移用户库、不释放Unknown预算、不处理六个未知文件、不push。

完整客户端13仍沿原会话70718编译V8，尚无result终态；本批113项不证明该构建成功，也不代替随后须执行的新产物双场景 AppContainer 离线启动。持续目标保持active；用户确认只有现有Codex登录，不再要求其提供其他API或凭据。现金／积分硬控制与逐请求官方账单缺项保持，不以技术进程处置冒充结清。
