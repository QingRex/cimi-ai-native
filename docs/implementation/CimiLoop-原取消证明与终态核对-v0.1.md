# CimiLoop 原取消证明与终态核对 v0.1

2026-10-10 D-262：原取消控制帧与独立Native取消证明已接入原采集、共享Human／CLI／HTTP／工作台ReconcileRun。Kernel原cancel_requested、完整调用账本与原认证费用同时成立时结清Cancelled原Run，启动次数不返还、Task不自动满足、原命令不重开账户或Run。实际Windows准备／挂起取消、普通EOF及错误取消帧通过；运行中SDK取消与费用结清仍是受控组合，真实模型／Skill／Matt／Superpowers及完整S1未通过。默认正式Agent关闭，库10／242 Schema、零付费及完整五组持续目标保持。

## 可用路径与业务效果

D-261已经接通原成功／失败终态与账单，但普通管道EOF只能证明父输入结束。本批把Human原停止 → 原marker → 同一Native控制管道上的显式取消帧 → 独立取消证明／原Job处置 → 原采集／完整调用账本 → 原账单 → Kernel再次独立核对 → ReconcileRun接成现有共享执行路径。既有工作台“核对原执行与费用”、HTTP /api/agent-runs/:id/reconcile-original和同一编译CLI run reconcile-original均复用该应用服务与Kernel，不建立新的业务权威。

受控组合中，原Run先CancelRun，再记录原账单现金12：remaining88仍冻结、pending_reconciliation:true。只有新的取消终态核对成功，Kernel把同一Run结为Cancelled、cost_known:true，cost_reserved_micros:0、pending_reconciliation:false；原attempts_consumed:1、attempts_released:0、reservation_released:false，Task仍未Satisfied。费用不退款、启动次数不返还，也不从取消推导领域输出成功。原Command ID及完整请求重复时返回同一不可变回执，即使以后Native文件损坏也不重开账户、重新采集或执行Run。不同命令仍须重新独立核验。

## 独立证明与兼容边界

Runtime只在原lifetime首个中断原因是workspace_rehearsal_cancel_requested且实际原marker通过scope／operation核对时发送cimiloop/agent-workspace-cancel/1.0.0帧，包含原nonce、scope_digest、operation_id和原marker字节摘要。输出失败、已到期限、一般EOF、错误marker或其他首因继续旧语义；后来的取消不覆盖已发生的原因。管道已关闭时不另开通道或重启控制器。

Native检查原配置已登记、原资源nonce／scope、operation目录UUID及marker摘要形状；有效取消才保存CreateNew／Flush(true)不可变cimiloop/agent-workspace-cancellation/1.0.0，绑定config_digest、owner、supervisor、runtime、phase及是否已resume，并按原Job停止和处置、记录控制器exit130。Native不凭文件缺失证明未启动，也不负责Kernel取消授权或账单。实际marker摘要与Kernel授权由独立reader及Kernel重新检查。错误取消帧不产生取消证明，普通EOF继续原parent_ended／exit125语义，期限继续原deadline失败。旧保留控制器、旧数据库及旧证据不被替换或重解释。

verifyCollectedAgentRuntimeCancellation核对新Native证明、实际原marker与冻结blob、配置／launcher二进制绑定、owner／supervisor／runtime／phase、cleanup取消130且处置完成无错误，以及当前operation的配置、launcher、资源、取消、cleanup和必要suspended字节。严格JSON防重复或危险键，规范化后比较对象；blob摘要、当前字节和固定原输入都须相同。已存在的新Native取消原件不能因采集漏掉证明或元数据而降级旧缺省。真正旧格式缺少取消证明仍按旧语义读取。原采集只增加两个有上界的可选取消原件，不增加公共Schema或自动迁移。

Kernel在原事务里向可信结果reader提供其自身的原Run快照。取消terminal要求同一run／project／record且cancel_requested:true；仅有marker、Native取消JSON、HTTP report/status或费用齐全都不够。readOriginalAgentTerminal继续独立读取当前保留Runtime／控制器及原Host身份，核对config5／launcher2、原prompt／期限、Stopped／disposed、原stdout／stderr、Native suspended／cleanup以及incomplete130和原取消原因，完整原IPC／模型／文件／检查账本无未决且双向唯一对应。每项已核定模型请求与认证账户原账单重新核验，核对期间再次读取原字节防漂移。费用路径不发送模型请求。

取消使用私有agent-original-terminal/2.0.0及agent-billed-reconciliation-proof/2.0.0，terminal_proven:true而completion_proven:false。旧成功／失败仍terminal1／proof1，新旧终态与证明版本严格配对。新取消execution:null、failure:null，原SDK成功结果验证及Task验收不被取消证明替代。项目库10、242公共Schema、启动账本1、新账户2／旧账户1基线保持，无自动升级。

## 操作与复验

1. 保留原Run、原操作目录、原请求JSON、原Native及IPC／模型／工具账本和原账单。先由原技术责任Human检查现有取消入口；不得为响应丢失重新预约或启动Run。
2. 由受信代码安装现有原账户lease及账单读端；账号连接按现有方式在仓库外配置。不得从请求JSON传账户路径、模块、金额、报告状态或Key。未接入可信账户时普通入口返回CAPABILITY_UNAVAILABLE，不能解释为已结清。
3. 使用既有工作台“核对原执行与费用”，或pnpm cimiloop run reconcile-original <原RunID> --request-file <原ReconcileRun请求JSON>。JSON仍仅command_id、requested_at、acting_role、command_type、target、expected_revision、payload:{}；当前Human会话和Kernel核对权限保持。先通过帮助验证语法。
4. 响应丢失保留原请求。在工作台重建页面后使用“按原请求核对”，或用相同Command ID及完全相同JSON重试；不要改变requested_at或expected_revision。取消核对复用D-261同一端点及请求恢复机制。
5. Native取消证明缺失、普通EOF、混原件、原marker变化、Kernel未登记取消、调用未决、账单不全或当前证据变化时核对拒绝，原Run／预算继续待核对；保留证据排查。不得用旧电脑Unknown在新电脑查不到证明资源已处置。
6. Node要求>=24.15 <25、pnpm12.4.2。本机实际用Node24.19.0并按既有安全运行方式执行pnpm check；ordinary24.14.0不符合要求。按锁安装后执行pnpm check及pnpm cimiloop run reconcile-original --help。Windows/AppContainer原生回归须实际运行零跳过。

## 本批验证及证据限制

- d262-affected-final.json：19文件218通过、0失败、0跳过。
- d262-windows-final.json：3文件10通过、0失败、0跳过。

pnpm check及总CLI／costs／record-costs／reconcile-original帮助均exit0，661源码前后无漂移，242 Schema语义无漂移。受影响范围包括Kernel／SQLite的Human及Agent Run、原取消／EOF／期限／操作／结果／完成、控制器构建／停止、共享应用服务、CLI与工作台原入口。实际Windows范围包含本批准备／挂起取消、普通EOF／错误绑定帧、既有原输入EOF／截断／UTF8／错误帧，以及原受保护账户费用与缺Native终态拒绝结清。不是全仓库回归或完整S1验收。

实际新Native四项使用被固定的Node子进程但始终挂起、不resume，不启动SDK／模型；它们证明原Job、控制器、取消记录及处置。运行中phase running的取消及Kernel／账单结清用明确受控Native／SDK读取端口配合实际Kernel、SQLite、本机TLS请求及公开受控账单／资格，仅验证完整代码组合。不能把它们称真实运行中SDK取消、真实智谱／付费账单、真实Skill／Matt／Superpowers或S1证据。原格式reader与采集比较另有26项格式／绑定／当前字节验证；共享组合在一次测试中覆盖Kernel未取消及五类遗漏／篡改拒绝和原回执重放。

有效红测、初次组合1失败27通过及修复后的2文件32通过报告均保留。最终受影响范围汇总首次范围通过的17文件与两个SQLite测试文件的完整补验；补验重跑全部用例、不做名称过滤。初次范围的Human交接用例超过其30秒测试框架上限，单独调整为60秒并保留诊断；随后完整补验的晚到事实用例超过文件级45秒框架上限，Windows文件默认等待对齐现有回归命令120秒，并再次完整补验Human文件。Agent12项此前完整通过且源码摘要相同，不重复运行；业务Task期限与预算未改。初次范围期间只同步了Kernel域参数的测试预期，生产源码未变；最终源码基线、完整补验和Windows回归前后相同，组件与原报告摘要均保留。初期类型错误（测试basis及管道可空、采集digest可选）和严格JSON null原型比较错误均记录，不用最终绿测抹去阶段失败。普通requesting-code-review工程评审未发现可确认must-fix，评审者未运行测试，不构成正式Matt或Superpowers资格。

## 完整S1剩余条件

- V1-09：实际Native／SDK成功与运行中取消、模型／套餐／现金／积分批准、认证真实账单与余额、物理硬配额、历史容量及全部异常恢复继续。零模型／零账单不能从不存在推导零费用；本批不结清无完整调用／费用原证据的准备阶段取消。
- V1-21：真实Skill及创建Plan／Task之前Human／Matt澄清继续。
- V1-22：Matt独立完整评审、Superpowers对当前源码新鲜验证、真实行为对照继续。
- V1-10：原查询／停止／采集／恢复及共享核对代码已有路径；正式批准Agent执行及真实完整工作台验收继续。
- V1-11：真实普通Change→ReadyForDelivery、真实技能／中断恢复、完整S1验收和真实接入指南继续。

D-258完整Bun三轮各2通过1失败0跳过，后两轮同一固定Bun1.3.14段错误exit3、提供方请求0；CcLHShield64.dll栈名不证明根因。本批未重复相同完整试跑、未禁用EDR、未替换旧原二进制或延长固定Task期限。正式Agent默认关闭，付费请求0、真实Key读取0。持续目标active、S1未完成，本批本地提交、不push，保留两个tmp及旧Unknown／Temp／Profile／映射。

证据：[研究记录](../research/CimiLoop-原取消证明与终态核对-2026-10-10.json)；[实施设计](../plans/2026-10-10-cimiloop-原取消证明与终态核对实施设计.md)；[原成功／失败与账单核对](CimiLoop-原执行终态与账单核对-v0.1.md)；[跨电脑接续](../plans/2026-10-09-cimiloop-S1跨电脑接续.md)。
