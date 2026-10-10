# CimiLoop 原账单费用 Kernel 接通 v0.1

2026-10-10 D-262：原取消控制帧与独立Native取消证明已接入原采集、共享Human／CLI／HTTP／工作台ReconcileRun。Kernel原cancel_requested、完整调用账本与原认证费用同时成立时结清Cancelled原Run，启动次数不返还、Task不自动满足、原命令不重开账户或Run。实际Windows准备／挂起取消、普通EOF及错误取消帧通过；运行中SDK取消与费用结清仍是受控组合，真实模型／Skill／Matt／Superpowers及完整S1未通过。默认正式Agent关闭，库10／242 Schema、零付费及完整五组持续目标保持。 [实施记录](CimiLoop-原取消证明与终态核对-v0.1.md)。

2026-10-10 D-261：原Native终态、独立SDK／领域结果、原IPC／模型调用和认证账单已接入共享Human ReconcileRun、同一编译CLI与工作台原请求恢复。受控组合验证原Run成功／失败、现金12及剩余预算结清，保留启动次数且不自动满足Task；真实Windows已知账单但缺Native原件时拒绝结清，88继续冻结。受控Native／SDK及公开批准／账单不是实际智谱、真实Skill／Matt／Superpowers或S1证据，完整Native故障与四项账户确认仍未解决。默认正式Agent关闭，库10／242 Schema及完整五组目标保持。 [实施记录](CimiLoop-原执行终态与账单核对-v0.1.md)。

2026-10-10 D-260：原模型请求、账户占用和认证账单已逐笔接入共享Human费用观测、Kernel独立再核验、同一编译CLI及工作台原命令恢复。实际Kernel现金记入12、剩余88继续冻结；Run仍Unknown，不满足Task或ReconcileRun结清。真实Windows原账单保管漂移拒绝新观测，已提交回执仍按原命令重放。测试模型／批准／账单认证为公开构造，非真实智谱或SDK完整终态、Skill／Matt／Superpowers／S1证据；专用Native/Bun故障和四项账户确认继续。默认正式Agent关闭，项目库10／242 Schema保持，完整五组持续。

## 可执行能力与证据边界

D-259只有账户费用查询。本批增加实际领域写路径：已保存的原模型请求／响应、原账户占用和认证账单 → 共享Human应用服务 → Kernel独立再读原件 → RecordRunObservation → 原Task现金预算用量。测试中的现金12微单位确实写入SQLite的cost_consumed_micros，原100预算剩余88继续保留，pending_reconciliation为true、attempts_released为0。重复同命令只取原Kernel回执，不再打开账户、调用模型或写入另一个费用事实。原生产入口仍须安装真实安全账户工厂，不是已有配置即自动放行正式Agent。

这条费用路径不证明Native终态：新费用报告固定status:unknown，不调用ReconcileRun，不满足Task、不把积分换算为现金、不返还未启动次数或释放剩余预算。账户costs_reconciled:true表示该原Run占用已被认证账单覆盖；不等于Kernel已完成执行与费用的全部核对。Kernel中的cost_charged_micros是累计原账单现金，新增观测按差额计入，第二条不同Command观测同累计12也不重复消费。

## 原件与唯一权威

Runtime的readOriginalDedicatedAgentRunCosts按原scope独立读取专用模型spine、模型逐调用原件、原提供方请求／响应摘要、账户readOriginalHold和readRunCosts。admission、connection、profile、完整hold、request_id／digest、所有调用及占用数量必须一致；每调用须reply_recorded且有提供方response id，存在原账单并覆盖全部占用，未决为0。它再读模型与账户快照防止拼接两个时点，零调用／零账单不能推导0费用；外来账户、模型原件缺失、原账单认证失效或权限漂移拒绝。部分账单仍可查询，但本批不把它生成已知总费用观测。

新私有agent-billed-observation-request／proof／prepared各为1.0.0，显式区分旧Unknown／失败格式，保持旧格式原义。原意图固定Human、Run／operation、原record／context、完整Command输入；原raw_result_ref与proof_ref不可变。账单proof记录原账户／模型对应关系与现金、积分微单位。openLocalProject的agentRunCostAccount仅能由受信代码安装，Kernel读取端再核对原件与账单保管；外部JSON或已保存的proof不能替代它。币种必须等于原AgentRunRecord.cost_currency，CNY不能写入原USD预算。242公共Schema、用户库格式10、原启动账本1保持，没有自动迁移。D-258新账单账户2与旧账户1仍不做原位升级。

LocalHumanAgentRunCostObservation先检查Human项目入口、原Run对象和固定scope；Kernel负责业务角色、Revision、原命令与预算权威。getObject本身不是调用者／角色授权。账户工厂仅返回原账户lease，不给予新Run、模型发送或账单写入权。工厂等待、原件采集以及lease释放等待后重新核对原资料，共享入口同时固定Human instance；工厂／释放错误转换固定公开文本，不透传Key或账户错误。释放后变化抑制响应但保留已提交Kernel事实和原回执。

原prepared已存在但Kernel尚未提交时仍重新核验原账单认证和模型原件；核验器未安装、原件损坏或认证失效返回EVIDENCE_MISSING，不产生费用事件。恢复原原件后同Command可继续；Kernel已提交后同请求可取原回执，即便后来模型原件损坏、账单ACL漂移或账户工厂未安装。找不到原prepared不能猜测重建或重开Run，同ID换请求不能接续。

## CLI、HTTP与浏览器操作

新增普通命令run record-costs <run-id> --request-file <json>。文件必须事先保存原command_id、requested_at、acting_role:technical_owner、command_type:RecordRunObservation、target:{object_type:run,id}、原expected_revision、payload:{}；只接受这七项，不接受金额、调用者、账单、根、credential或verifier模块。target必须等于CLI原Run参数。默认账户工厂未安装返回CAPABILITY_UNAVAILABLE退出1；参数或请求非法退出2、缺目标退出3。实际编译CLI测试使用createAgentCostObservationCommand(factory)复用同一命令代码打开EXISTING原账户并关闭句柄，没有通过argv／env／动态模块安装权威。

工作台新增POST /api/agent-runs/:id/cost-observation，与GET costs区分。回环、Host／Origin、会话与CSRF先核验；读完body再核验，账户等待后响应前再核验会话／closing，target必须对应路由。服务复用Kernel，不在HTTP另写业务状态。当前active Run卡片的“记录原账单费用”与查询按钮共用agentAccountForRun安装状态，但写动作另行保存原Command。页面先写sessionStorage再发送，将内部agent_cost_observation标记剥离后发原RecordRunObservation；丢响应或提交后释放失败保留该Command。重建页面从原槽重放同HTTP路径和原body，即使新服务未安装账户工厂也能核对原回执。普通查询／停止在费用入口缺失时仍可用；历史Run可用CLI／HTTP原id，尚无历史费用列表UI。

真实接入者应先按现有仓库外安全连接安装HumanAgentAccountFactory：根据原Run和受保护账户锚点打开已有原账单账户，使用真实提供方认证verifyOriginal，返回{account,release}。传入startWorkbench({projectDir,agentAccountForRun:factory})，或导出的createAgentCostObservationCommand(factory)。共享服务不会通过HTTP安装或替换该端口。不能复制测试的公开账单映射或假批准用于真实账户；当前尚缺具体模型、套餐、现金和积分上限确认及真实认证安装，不进行付费请求。

准备CLI原请求的可操作示例（先替换原Run和Revision，保存后重试必须复用同文件）：

```powershell
$env:CIMILOOP_ORIGINAL_RUN_ID='替换为原Run的UUIDv7'
$env:CIMILOOP_ORIGINAL_RUN_REVISION='替换为当前原Run Revision'
node --input-type=module -e "import {writeFileSync} from 'node:fs';import {createInternalId} from './packages/protocol/dist/v2/index.js';writeFileSync('original-cost-command.json',JSON.stringify({command_id:createInternalId(),requested_at:new Date().toISOString(),acting_role:'technical_owner',command_type:'RecordRunObservation',target:{object_type:'run',id:process.env.CIMILOOP_ORIGINAL_RUN_ID},expected_revision:Number(process.env.CIMILOOP_ORIGINAL_RUN_REVISION),payload:{}},null,2));"
pnpm cimiloop run record-costs $env:CIMILOOP_ORIGINAL_RUN_ID --request-file original-cost-command.json --json
# 原响应丢失时重复上行；不得重新执行生成新command_id的node行。
```

普通CLI没有真实账户安装时应拒绝；这也是接入前负例，不把拒绝算作Agent正式可用。原请求文件只含身份／修订，不放凭据。RecordRunObservation返回原领域CommandResult；观察run.status仍Unknown、cost_charged_micros、reservation_released:false以及Task usage。模型原件／账单缺失要保留原请求、Unknown预算和原文件，不能手工填费用或删除旧电脑Unknown资源证明完成。

## 复验与实际范围

Node >=24.15 <25、pnpm12.4.2；本批使用Node 24.19.0，普通系统PATH仍可能指向不符合要求的24.14.0，不将本批显式工具PATH冒充用户PowerShell已修复。先按锁安装并check，测试夹具只执行本机TLS公开模型响应、公开批准和账单认证，不读真实Key或发付费请求。

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm cimiloop run record-costs --help
pnpm exec vitest run packages/local-app/test/agent-run-cost-observation.test.ts apps/cli/test/agent-run-cost-observation.test.ts apps/workbench/test/agent-run-cost-observation.test.ts apps/workbench/test/agent-run-cost-observation-frontend.test.ts --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000
pnpm exec vitest run tests/scenarios/agent-run-cost-observation-custody.test.ts tests/scenarios/agent-account-billing-entry-runtime.test.ts tests/scenarios/agent-account-bills-custody.test.ts tests/scenarios/agent-dedicated-account-custody.test.ts tests/scenarios/agent-start-custody-runtime.test.ts --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000
```

- d260-affected-final.json：25文件213通过，0失败、0跳过。
- d260-windows-final.json：5文件14通过，0失败、0跳过。

pnpm check、总CLI／run costs／run record-costs帮助通过；656源码前后摘要一致，Schema242语义无漂移。最终受影响范围在研究记录逐文件逐断言列出，包含旧Unknown／失败／产物观测、原账户账单、共享Human入口、CLI、HTTP、浏览器以及Runtime完成证明。实际Windows范围含主库／WAL／SHM、账单保管、独立进程重复账单与原Run费用HTTP，以及新原账单费用Kernel写入；零跳过通过。新Windows模型请求来自本机TLS宿主夹具，没有实际OpenCode／AppContainer SDK执行，因此不能当作完整Native组合通过。

初期红例及测试配置失败完整保留：源／dist边界类身份不一致导致fixture拒绝（4跳过，不算通过）；缺实现红例；工厂LocalProjectError泄露与释放后身份变化红例；缺CLI／UI红例；类型检查初期错误。最终普通工程子代理复核修补后无must-fix，实际HTTP补验确认提交后release失败仍保留原Command。该工程复核不是Matt独立资格或Superpowers正式新鲜验证。旧D-258完整Native三轮各2通过1失败0跳过，末两轮相同Bun1.3.14二进制段错误exit3、提供方0请求；CcLHShield64.dll栈出现不是根因证明。本批不重复同样崩溃、不替换原二进制或放宽原固定Task期限，不禁用EDR。

## 五组目标仍未完成

- V1-09：本批核定现金已实际接Kernel；真实模型／账户批准、真实账单认证与请求身份独立映射、Native终态／独立效果再验、正式ReconcileRun、物理硬配额／完整历史容量与完整恢复继续。
- V1-21：真实Skill调用与Plan／Task前Human／Matt澄清继续；已有Human入口和资格夹具不证明真实Matt。
- V1-22：Matt独立完整评审、Superpowers当前源码正式验证与真实行为对照继续。
- V1-10：共享费用观测／CLI／HTTP／页面及原命令恢复本批可执行；正式受批准Agent默认组合、执行／查询／停止／原操作恢复完整验收继续。
- V1-11：真实普通Change到ReadyForDelivery、真实技能和中断恢复、S1验收及真实接入指南继续。上面的费用接入指南只覆盖本批路径。

付费请求0、真实Key读取0，真实Skill／Matt／Superpowers资格均未证明；具体模型／套餐／现金积分上限待确认。五组持续目标active，S1不宣布完成；本批本地提交、不push。保留两个已有tmp、旧Unknown／Temp／映射／Profile，不自动升级用户库。

证据：[研究记录](../research/CimiLoop-原账单费用Kernel接通-2026-10-10.json)；[本批设计](../plans/2026-10-10-cimiloop-原账单费用Kernel接通实施设计.md)；[原费用查询](CimiLoop-原Run费用共享入口-v0.1.md)；[原SDK账本](CimiLoop-SDK调用与IPC原字节账本-v0.1.md)；[跨电脑接续](../plans/2026-10-09-cimiloop-S1跨电脑接续.md)。
