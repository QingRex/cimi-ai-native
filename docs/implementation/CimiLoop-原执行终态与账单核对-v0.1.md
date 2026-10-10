# CimiLoop 原执行终态与账单核对 v0.1

2026-10-10 D-262：原取消控制帧与独立Native取消证明已接入原采集、共享Human／CLI／HTTP／工作台ReconcileRun。Kernel原cancel_requested、完整调用账本与原认证费用同时成立时结清Cancelled原Run，启动次数不返还、Task不自动满足、原命令不重开账户或Run。实际Windows准备／挂起取消、普通EOF及错误取消帧通过；运行中SDK取消与费用结清仍是受控组合，真实模型／Skill／Matt／Superpowers及完整S1未通过。默认正式Agent关闭，库10／242 Schema、零付费及完整五组持续目标保持。 [实施记录](CimiLoop-原取消证明与终态核对-v0.1.md)。

2026-10-10 D-261：原Native终态、独立SDK／领域结果、原IPC／模型调用和认证账单已接入共享Human ReconcileRun、同一编译CLI与工作台原请求恢复。受控组合验证原Run成功／失败、现金12及剩余预算结清，保留启动次数且不自动满足Task；真实Windows已知账单但缺Native原件时拒绝结清，88继续冻结。受控Native／SDK及公开批准／账单不是实际智谱、真实Skill／Matt／Superpowers或S1证据，完整Native故障与四项账户确认仍未解决。默认正式Agent关闭，库10／242 Schema及完整五组目标保持。

## 本批可以执行的路径

D-260只把原账单现金写进Kernel，执行仍Unknown。本批增加完整领域写路径：保存原Human核对命令 → 采集原操作 → 独立核对Native终态／原SDK产物和领域固定版本 → 独立原IPC／模型调用对应 → 原账户逐笔认证账单 → Kernel再读同一原件 → 原ReconcileRun。成功和失败都使用同一个原Run，Kernel覆盖全部原未知／冲突观测、按原累计现金差额记账并结清剩余成本预约。Task验收和交付仍走独立Kernel流程，不重开Run或返还启动次数。

组合测试的SQLite／Kernel、本机TLS原模型请求、占用和原账单映射是实际程序行为；Native／SDK终态读取端口是明确受控构造，账单认证／批准／提供方响应也是公开夹具。测试得到原Run Succeeded或Failed、cash12、cost_reserved0、pending_reconciliation:false、attempts_consumed1／released0、Task未Satisfied。这证明组合契约，不能证明真实Native成功执行、真实智谱账户批准或S1验收。实际Windows测试拥有真实当前主体受保护原账户／SQLite账单，但没有Native终态，必须拒绝ReconcileRun，原cash12、reservation88、Unknown保持。

## 原件独立核验

readOriginalAgentTerminal先调用保留二进制的readOriginalAgentWorkspaceOperation：正式终态要求config5和launcher2，并独立核对当前宿主的保留Runtime与控制器文件身份／摘要；原启动输入中的二进制、控制器、prompt、agent_task期限与配置相同。采集结果须Stopped、resources_disposed:true、cancellation_requested:false，原模型和IPC无未决，禁止合成模型。资源phase须ended或recovered，单纯旧格式／处置标志不能推导终态，更不能凭新电脑“进程不存在”清理旧电脑Unknown。

它从实际原operation重读配置、launcher、resources、suspended Native、cleanup、stdout／stderr和result或incomplete，与采集的原字节摘要一一相同。Native suspended的supervisor／peer绑定原launcher和resources；cleanup须原nonce、ended、处置完成、无清理错误。成功还须正常exited／exit0，并使用既有verifyOriginalTaskExecutionResult从Kernel原TaskDefinition／Contract／Plan固定版本独立验证完整SDK结果、固定检查和Native效果。模型文字、孤立结果JSON、完成标志或费用齐全都不能替代这些条件。

失败使用既有classifyOriginalAgentExecutionFailure绑定原Native退出、原期限和incomplete。同样重读全部独立文件／检查账本与IPC。每个已完成原模型请求／响应与原IPC逐调用双向唯一对应，所有Native调用与独立Native账本对应，不能漏记一个Native效果或挂起调用。若原失败没有Native工具调用，完整IPC必须确实只有已完成模型调用，独立文件／检查原账本调用数均为0；此时Native效果reader仍Unknown，不把它称Verified。失败终态依据原控制器负面证明，不以零调用推导成功／未启动。取消终态仍未接入本批核对，取消原件不符合要求时保留Unknown。

原check-catalog若存在，除原不可变采集摘要外还对照sandbox/config当前原文件。Native／IPC／模型／文件／检查账本及当前原终态文件再读第二次，两个快照不同就拒绝；不执行任何工具、模型、停止、恢复或新启动。本批没有绕过实际Native核验的序列化入口。

费用仍使用D-260 readOriginalDedicatedAgentRunCosts，要求真实DedicatedAgentAccountLedger实例、同原scope／connection／admission／profile、每个原请求对应原占用及认证账单、完整已知现金和积分微单位、未决0。现金币种须等于原AgentRunRecord；积分不换算现金，零调用或无账单不能推导零费用。账户costs_reconciled只说明其账单覆盖，Kernel仍独立决定父Run能否结清，包括原技能／工具未决事实。

## Kernel唯一权威与恢复

新增私有agent-billed-reconciliation request／proof／prepared均为1.0.0，不改变公共RawAgentRunObservation格式。原意图固定Human、原Run／scope／operation、完整Command、原record／context摘要；proof保存原终态字节绑定、原费用、全部待核对run_observation引用，raw_result_ref不可变。新的proof表示执行终态已证明，不表示Task验收、当前工作区适用性或真实模型资格。

Kernel的LocalAgentRunResultVerifier通过代码安装的原账户reader再核对所有原件；存储proof或HTTP／CLI JSON无法自行取得权威。ReconcileRun必须来自Human technical_owner，payload只由共享服务填入原raw_result_ref，Kernel核验角色、Revision、全部未知／冲突引用、费用币种及父工具／技能事实。原预算100、累计cash12的受控终态组合由Kernel释放剩余88成本预约，保留12消费、attempts_consumed1和attempts_released0。Run.reservation_released仍false，因为该字段指未启动次数返还，不能把它当成本预约是否释放。

LocalHumanAgentRunCostObservation.reconcile与既有record共用安全账户lease和同一Kernel。工厂等待、采集、释放等待后检查固定Human实例和原资料；只开放原账户读，错误只返回固定公开文本。已prepared未提交时，原Native或账单失效返回EVIDENCE_MISSING，不写事件／释放预算；恢复原件后同Command可继续。已提交后同原Command直接取原Kernel回执，不重采集／开账户／调用模型，即便后来原Native被篡改、账单保管漂移或新服务无账户工厂。找不到prepared不能猜测重建，换Command身份或输入不能算原请求恢复。

旧Unknown、失败观测和recordCosts保持原格式与语义，已知费用记录仍Unknown且冻结剩余预约。旧Native格式可继续历史查询／原资源恢复，但不能静默升级为新的正式终态证明。公共Schema242、项目库10、原启动账本1、新账单账户2及旧账户1保持；没有自动迁移或用户库升级。

## 工作台和CLI接入

工作台active原Run新增“核对原执行与费用”，POST /api/agent-runs/:id/reconcile-original。它复用共享服务和Kernel，原账单账户工厂通过startWorkbench({projectDir,agentAccountForRun:factory})由受信代码安装。回环／Host／Origin／会话／CSRF先检查；读取body后与异步账户核验后再次检查，target须等于路由Run。HTTP不能填写终态、现金、账单、账户根、连接或验证模块。

页面在发送前保存原ReconcileRun请求及内部agent_result_reconciliation标记到sessionStorage；发送时剥离内部标记。响应丢失或提交后释放错误保留原请求，重建页面按同一路径及body核对，不生成新command_id。受控失败终态测试实际经过浏览器→HTTP→Kernel提交，模拟仅丢已提交响应，再用未装账户工厂的新HTTP服务重建页面重放，得到相同回执且事件只增加1、模型请求只有原1次。普通工程评审不是Matt或Superpowers正式资格。

CLI新增run reconcile-original <run-id> --request-file <json>，导出createAgentReconcileOriginalCommand(factory)供安全编译启动器复用同一命令。新命令的编译语法／默认缺账户拒绝／非法调用者终态输入回归通过；尚没有实际Native正例通过编译CLI的终态核对，不能宣称这项真实集成验收已过。默认CLI无真实账户工厂返回CAPABILITY_UNAVAILABLE，默认正式Agent仍关闭；安装账户reader也不会授权新Run或发付费请求。

原请求文件仅七项，须取当前原Run的Revision替换示例中的1，先保存后重试复用同一文件：

```json
{
  "command_id": "原UUIDv7",
  "requested_at": "原UTC时间",
  "acting_role": "technical_owner",
  "command_type": "ReconcileRun",
  "target": {"object_type": "run", "id": "原Run UUIDv7"},
  "expected_revision": 1,
  "payload": {}
}
```

```powershell
$env:CIMILOOP_ORIGINAL_RUN_ID='替换为原Run UUIDv7'
$env:CIMILOOP_ORIGINAL_RUN_REVISION='替换为当前原Run Revision'
node --input-type=module -e "import {writeFileSync} from 'node:fs';import {createInternalId} from './packages/protocol/dist/v2/index.js';writeFileSync('original-reconcile-command.json',JSON.stringify({command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:'technical_owner',command_type:'ReconcileRun',target:{object_type:'run',id:process.env.CIMILOOP_ORIGINAL_RUN_ID},expected_revision:Number(process.env.CIMILOOP_ORIGINAL_RUN_REVISION),payload:{}},null,2));"
pnpm cimiloop run reconcile-original $env:CIMILOOP_ORIGINAL_RUN_ID --request-file original-reconcile-command.json --json
# 若响应丢失，只重复pnpm行；不要重跑node行生成command_id、时间、Revision或另开Run。
```

接入者应使用仓库外现有安全连接和原受保护账户锚点打开已有账单账户，安装真实账单认证和原Run绑定，返回{account,release}；不能复制公开测试认证映射为真实资格。当前只确认智谱提供方，具体模型、套餐、现金及积分上限尚缺，真实账单认证亦未接入，不读取真实Key或发付费调用。缺原Native终态、账单或独立领域结果时保留原请求和Unknown，不能手工填写status／cost解除预算。

## 验证范围及剩余条件

本批显式工具PATH为Node 24.19.0和pnpm12.4.2，锁文件不变；普通PowerShell默认Node24.14.0仍不符合>=24.15 <25，须先选择正确环境。既有跨电脑按锁安装、D-232复验保持历史证据，不把本批当作从头重做或全仓库测试。

- d261-affected-final.json：26文件220通过、0失败、0跳过。
- d261-windows-final.json：5文件14通过、0失败、0跳过。

pnpm check、总CLI／costs／record-costs／reconcile-original帮助均通过；658源码前后无漂移，242 Schema语义无漂移。实际Windows范围为原主体／ACL／账单主库及WAL／SHM、独立进程原账单、原账户入口和启动保管，以及缺Native终态拒绝结清，零跳过。首次夹具读端混用造成3跳过，只算配置失败；其诊断来自本次已捕获工具输出，本地red文件已被随后有效红测覆盖，不冒充完整原报告仍在。有效红测3失败及修补阶段1通过2失败的原报告、初期类型错误诊断继续保留，最终通过不能抹掉这些阶段。

专用完整Native/Bun仍是D-258三轮各2通过1失败0跳过，后两轮同Bun1.3.14原二进制段错误exit3，提供方请求0。CcLHShield64.dll栈名不是根因证明，本批未重复相同完整试跑、未禁用EDR／替换原执行二进制／延长原Task期限。当前真实Windows缺证拒绝不是完整Native成功验收。

- V1-09：本批完整原终态／账单／Kernel结清代码路径及受控契约完成；实际Native正例、真实模型账户批准与认证、物理硬配额、历史容量及全部异常恢复继续。
- V1-21：真实Skill及Plan／Task创建前Human／Matt澄清继续，已有Human／受控资格不替代真实Matt。
- V1-22：Matt独立完整评审、Superpowers当前源码正式新鲜验证、真实行为对照继续。
- V1-10：共享reconcile入口、工作台原请求恢复和CLI语法可执行；正式批准Agent执行／查询／停止／原操作恢复与真实验收继续。
- V1-11：真实普通Change→ReadyForDelivery、真实技能／中断恢复、S1验收和完整真实接入指南继续。本文件只指导本批原核对入口。

付费请求0、真实Key读取0。完整五组持续目标active，S1未完成；本批只本地提交、不push，保留已有两个tmp与旧Unknown／Temp／映射／Profile。

证据：[本批研究](../research/CimiLoop-原执行终态与账单核对-2026-10-10.json)；[实施设计](../plans/2026-10-10-cimiloop-原执行终态与账单核对实施设计.md)；[原现金Kernel接通](CimiLoop-原账单费用Kernel接通-v0.1.md)；[SDK原账本](CimiLoop-SDK调用与IPC原字节账本-v0.1.md)；[跨电脑接续](../plans/2026-10-09-cimiloop-S1跨电脑接续.md)。
