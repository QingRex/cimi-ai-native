# CimiLoop 原 Run 费用共享入口 v0.1

2026-10-10 D-260：原模型请求、账户占用和认证账单已逐笔接入共享Human费用观测、Kernel独立再核验、同一编译CLI及工作台原命令恢复。实际Kernel现金记入12、剩余88继续冻结；Run仍Unknown，不满足Task或ReconcileRun结清。真实Windows原账单保管漂移拒绝新观测，已提交回执仍按原命令重放。测试模型／批准／账单认证为公开构造，非真实智谱或SDK完整终态、Skill／Matt／Superpowers／S1证据；专用Native/Bun故障和四项账户确认继续。默认正式Agent关闭，项目库10／242 Schema保持，完整五组持续。 [实施记录](CimiLoop-原账单费用Kernel接通-v0.1.md)。

2026-10-10 D-259：原Run费用查询已接共享Human服务、受信代码安装的同一编译CLI命令、回环HTTP及工作台按钮。工厂与释放等待后复核原资料，错误只返固定公开码；页面拒绝旧查询／旧页面迟到结果。实际Windows原账户／账单保管→共享服务→HTTP查询与权限漂移Unknown通过，不启动模型、不产生领域结果或Kernel结算。普通CLI／工作台仍需真实原账户工厂，默认正式Agent关闭。上批专用Native／Bun段错误仍未解决；构造账单认证不是实际智谱／Skill／方法／S1证据。项目库10／242 Schema保持，完整五组持续。

## 实际可用能力

LocalHumanAgentAccountBilling.query 先核对Human入口、原项目和Kernel原Run对象，再调用代码安装的HumanAgentAccountFactory。原Scope／record／context在账户工厂及release异步等待后重新读取核对。每次得到lease后，无论读取成功或失败均释放；释放失败不能返已知费用。账户工厂自行负责未返回lease前的部分打开资源。服务复用D-258 LocalAgentAccountBilling与原三方账单核验，不发送模型、写账单、补库、启动Run或追加领域事件。

工厂不是HTTP／CLI权限：它必须由受信应用代码选择原已登记账户，返回真实DedicatedAgentAccountLedger与release。调用参数仅原run-id，不能安装JSON账户、模块、根、凭据或核验器。Kernel getObject是业务对象查询，本服务另核对Human入口；这里不声称只读getObject具有角色授权检查。异步期间原Human变成Agent、固定原资料改变、会话过期或工作台关闭均抑制数据。

GET /api/agent-runs/:run/costs使用既有回环Host、Origin及会话边界；等待后再次核对会话与closing。查询参数、GET写体、POST与账户／凭据／端口覆盖被拒绝。未知Run先查询原Kernel对象，不调用工厂。取消后的原Run可继续读取。工厂未安装返回CAPABILITY_UNAVAILABLE；已安装工厂打不开原账户、缺原账单库／原核验器或保管失败则outcome:unknown且不带costs。工厂／底层读取的任意RuntimeAdapterError.reason不返回；服务只产生agent_account_original_unavailable或agent_account_release_unproven固定公开码。

同一编译命令createAgentCostsCommand由普通bin和受信代码启动器复用。普通pnpm cimiloop run costs <run-id> --json --project-dir <repo>没有默认原账户安装，返回能力缺项、退出1；未知原Run退出3；非法参数退出2。受信代码安装原账户lease后，同一编译命令实际读取原SQLite账单；outcome:unknown退出1。命令不接受--account-root／--credential-file／--verifier-module，也不通过环境变量或动态模块选择核验器。真实安全连接和提供方认证尚未安装，不能将测试启动器当生产默认。

工作台当前Agent Run卡片增加“查询原运行费用”，独立显示核定现金、积分微单位、占用和未决数。没有原账单不显示0费用；已有部分账单只显示已核定部分；账户账单齐全不代表Kernel Task结果或预算结清。读响应丢失可重读同一Run，没有领域幂等写槽；失败清除旧已知展示。每卡片generation与isConnected共同拒绝并发旧查询和导航／刷新后的迟到成功或错误，不污染新页面提示。默认账户入口未安装时费用按钮禁用，查询／停止原运行继续可用。当前页面只显示active_run_ref；其他历史Run可由CLI／HTTP按原id查询，尚无历史费用列表UI。

## 接入与复验

使用Node >=24.15 <25及pnpm12.4.2，按锁文件安装；本批实际使用Node 24.19.0。普通PowerShell的其他Node不能据此视为符合版本。先pnpm check再执行以下受影响与Windows用例，Windows x64要求实际执行且零跳过；公开构造模型、批准、资费与账单认证不发付费请求、不读取真实Key。

```powershell
pnpm check
pnpm cimiloop run costs --help
pnpm exec vitest run packages/local-app/test/agent-account-billing-entry.test.ts apps/cli/test/agent-account-costs.test.ts apps/workbench/test/agent-account-billing.test.ts apps/workbench/test/agent-account-billing-frontend.test.ts --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000
pnpm exec vitest run tests/scenarios/agent-account-billing-entry-runtime.test.ts tests/scenarios/agent-account-bills-custody.test.ts tests/scenarios/agent-dedicated-account-custody.test.ts tests/scenarios/agent-start-custody-runtime.test.ts --maxWorkers=1 --testTimeout=120000 --hookTimeout=120000
```

应用端接入：构造HumanAgentAccountFactory（导出于@cimiloop/local-app），按原Run与原账户锚点打开EXISTING受保护账户，返回{account, release}；将工厂传给startWorkbench({projectDir, agentAccountForRun:factory})或createAgentCostsCommand(factory)。账户可独占打开后release关闭，也可借用共享句柄并在release归还池；共享服务不擅自关闭他人账户。编译CLI测试给出同一命令的受信代码启动器、原账户打开／关闭与两次实际查询；Windows场景给出实际当前SID保管、原账单与HTTP完整示例。两者的认证、政策、模型均公开构造，不能复制测试认证用于真实账户。

浏览器由现有bootstrap会话进入，费用按钮只发GET；会话或权限异常重新按现有工作台登录。费用未核定继续保留预算，不能从HTTP／CLI提交手工JSON结清；account costs_reconciled与固定kernel_costs_reconciled:false分别表示原账户账单齐全和Kernel尚未结算。原账单或保管丢失保留Unknown与原文件，不重开Run、不复制修补历史、不因新电脑找不到而删除旧资源。

## 验证范围与失败保留

- d259-affected-final.json：18文件128通过，0失败、0跳过。
- d259-windows-final.json：4文件13通过，0失败、0跳过。

pnpm check、总CLI与run costs帮助、Schema242语义无漂移通过；647源码前后摘要一致。普通工程子代理评审发现任意错误码泄露、并发旧成功覆盖新失败，以及导航后旧错误污染新提示，均先补真实反例再修复；最终只读评审无must-fix。该工程评审不是Matt独立资格或Superpowers正式新鲜验证。受影响回归含共享服务、实际编译CLI、HTTP及浏览器；Windows回归含主库／WAL／SHM保管、独立子进程重复账单和当前原Run费用HTTP，不启动AppContainer模型执行。

保留初期失败：根测试fixture无法解析包别名；账户放在仓库内被正确拒绝；首入口红例缺服务／路由及测试自身GET／POST的CSRF差异、打开库后Windows rename EBUSY；CLI初红例误用runs而实际组名为run，此部分不算有效功能红例。修正命令组后，独立Command未继承exitOverride与LocalProjectError被误当完整DomainError造成实际失败，均修复。浏览器初无按钮红例有效；后续Task初始cost_known:false断言错误，改为核对查询前后usage不变。类型检查中fixture工厂类型及Response.json未知类型收窄曾失败，最后check真实退出0；没有用后续测试退出码代替check。普通评审反例15项13过2败、页面生命周期7项6过1败均保留，修复后重新完整回归。

上批D-258完整Native三轮各2通过1失败、零跳过仍保持失败：末两轮相同Bun1.3.14二进制段错误exit3，提供方fixture零请求，一个原占用、零账单。CcLHShield64.dll栈出现不证明故障根因，本批未重复相同Native试跑、换二进制、关闭安全软件或延长原Task期限；原失败与Unknown保留。此批Windows账户／HTTP通过不能替代完整Native模型／SDK／账单组合。未执行全仓库或完整S1验收。

## 保留完整目标

- V1-09：真实提供方账单认证与SDK原请求身份独立映射、模型／套餐／现金积分批准、Kernel正式费用结算、物理硬配额／完整历史容量与异常恢复、专用Native故障及正式领域结果全链路继续。
- V1-21：真实Skill调用和Plan／Task前Human／Matt澄清继续；已有Human入口不证明真实Matt资格。
- V1-22：Matt独立完整评审、Superpowers当前源码正式验证与真实行为对照继续。
- V1-10：原费用Human应用服务／CLI／工作台查询本批接通，正式受批准Agent组合默认安装、执行／查询／停止／原恢复完整验收继续。
- V1-11：真实普通Change到ReadyForDelivery、真实技能、中断恢复、完整S1验收与可操作真实接入指南继续。

项目库10／242 Schema／原启动账本1保持；D-258新账户body2／私有SQLite2与旧账户body1／SQLite1无原位升级，本批无Schema或数据库迁移。只确认智谱提供方，具体模型、套餐、现金／积分上限待用户确认；付费请求0、真实Key读取0，凭据只按现有仓库外安全连接配置。正式Agent默认关闭，五组持续目标active；本批本地提交、不push，不动已有两个tmp或旧电脑Unknown／Temp／映射／Profile。

证据：[研究记录](../research/CimiLoop-原Run费用共享入口-2026-10-10.json)；[实施设计](../plans/2026-10-10-cimiloop-原Run费用入口实施设计.md)；[原账户账单](CimiLoop-原账户账单与余额核验-v0.1.md)；[跨电脑接续](../plans/2026-10-09-cimiloop-S1跨电脑接续.md)。
