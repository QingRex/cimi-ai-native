# CimiLoop 原父子完整费用与终态结清 v0.1

2026-10-12，D-280，接续 [D-279 原未启动封闭](CimiLoop-原Skill未启动封闭与零效果核对-v0.1.md)。本批已实现、完整冻结回归及文档核对，按要求仅本地提交；以下描述本批实际能力及其验收边界，不能作为 S1 通过结论。五组持续目标保持 active，正式默认 Agent 未启用、无付费请求、未读取真实凭据、不 push。

## 当前可执行组合

新 readReconciledRunFamilyCosts 与内部 agent-run-family-cost-evidence/2.0.0 同时核原父请求、全部已执行子请求的最终现金/积分账单，以及正面永久封闭的原零请求子。零调用子可没有账户 scope 登记，但必须已有 Kernel 原出生与永久双侧 dispatch 封闭、完整跨账户零hold/零bill核验和原准备资料零效果，不能补原账户登记或从目录不存在推导零。

完整 Kernel 子集合与原 Host birth、全部账户 scope/intent/holds 双向核验。原账户 writer 在同一切面核原登记、占用与认证原账单；跨账户的同一子、文件-only登记意图、缺根/损坏 marker、Host或物理身份不一致均保持 Unknown。外国原scope文件须核 marker格式、原account ticket、出生关系、规范scope及文件名中的原摘要；不能因relation缺失/被替换而当无关联跳过。两次复读仍不能授予执行权。

LocalAgentRunFamilyVerification 由可信代码安装 readResult/readPreparation，HTTP/CLI不能上传它。local reader 以当前 Kernel 快照列出全部原invocation与观察，独立重读每子已核报告、原资格/出生/preparation及scope，要求 Kernel状态已结清、原报告币种一致。每子累计确定费用、已核报告现金和 family 对应唯一scope账单现金必须严格相等；父子总额下限不能代替此等式。NotStarted须原父取消、无output和0；其他子须完整原请求、最终账单及自己的实际终态。

这些费用事实不证明父 Native/SDK 结束或任务成功。ReconcileRun继续独立要求原父Native资源终态、完整原SDK模型/IPC及Native效果，成功须冻结领域结果与固定检查；取消须Kernel原取消及原Native取消证据。Kernel全子settled门不放宽，所有未知/冲突观测必须覆盖，Task验收仍独立。只费用观测入账时继续Unknown/保留剩余预算。

## 共享服务与历史兼容

AgentAccountBillingLease 可由可信工厂提供原account及只读 familySkills。LocalHumanAgentRunCostObservation把同一冻结方法端口传入capture与Kernel readRunResult，两边独立再核。跨await及release检查原Human/location/父scope与记录；费用HTTP入口在await原账户后、原采集完成紧邻Kernel提交和回执重放前，再执行同步session/CSRF/closing守卫。异步守卫拒绝，失败仍释放原lease且不提交费用；原command提交后，响应丢失/释放失败/重启仍沿同id、requested_at、revision重放，回执路径不重开账户、不产生新模型/Native效果。

原费用proof的版本决定历史再验读者，不能由当前端口安装情况重解释。旧单scope/1及family/1按旧meaning再验；安装新family读者后仍可直接读取原rawref。family/2缺新端口拒绝。新规范parser明确接受family/2，保留8MiB/524288节点/64层、危险key和canonical字节约束；这不是物理磁盘硬配额或历史容量验收。

公开242 Schema、用户库格式10和Host格式1保持，不自动迁移或覆盖历史原件。旧 readRunCosts/readRunFamilyCosts/snapshot 的 zero-call及 costs_reconciled规则保持，只有新明确证据分支能把正面封闭零效果成员加入完整核验。

## 操作与接入

1. 可信代码打开原Host和原account，安装collector的 readResult及readFamilyPreparation到lease.familySkills；读者只回读原件，不安装Agent执行权。
2. 逐子用既有原 reconcile-original 核对成功/失败/取消/NotStarted；缺原Native/资格/费用保持Unknown。闭合零调用先Kernel父取消与同原dispatch封闭，不重开Run。
3. Human在原父Run使用 POST /api/agent-runs/:id/cost-observation 仅记录已核总现金，或在父终态与全部子结果/费用完整后使用 /reconcile-original 与原 ReconcileRun。
4. 丢响应或释放失败时重放同 command_id/requested_at/expected_revision；不能重生成命令推断效果。重启没有工厂也应由Kernel回原已提交回执。
5. 分别确认父Run终态、预算未决/剩余、每子结果和Task验收；父子费用结清不自动把Task置Satisfied或需求置ReadyForDelivery。

当前普通父SDK仍只有读写和检查，实际子调用预约/执行由可信外部编排；本批场景也不会证明父SDK自己invoke Skill。后续必须接parentSDK→原IPC→Kernel唯一预约→原child执行/采集及受证继续权限，版本化SDK/IPC/子ticket/父产物关联，不宽放旧Unknown。

## 完整验证及剩余条件

最终受影响44文件489项通过；实际Windows完整14文件40项通过，新增mixed Native完整1文件1项另轮通过，均0跳过；取消前缀修补后全部完整范围及check使用同一727源码冻结，前后零漂移，不复用修补前r35报告作为当前验收。Windows完整14文件和新增完整1文件是分别运行，不宣称单轮15文件；check/CLI/242Schema/库10/Host1通过，不是全仓库测试或完整S1验收。实际parent/child AppContainer、SDK、原模型/IPC/Native及HTTP/Kernel组合通过，子六项固定方法资料实际读取后才结束，构造现金120/积分40；原命令丢响应/重启无工厂重放，不重复效果，Task仍待验收。

首次r27子根165字符触发native_executable_path_unsupported，父三请求完成、子账户登记/派发未产生；事后预算耗尽不解释早先路径拒绝。新短根r33父三请求和子两请求结束0且资源处置完整，但只读入口，遗漏五项原必需资料；独立核验正确拒绝，未补写旧效果或重开旧调用。修正后的新场景按原plan完整逐项执行；新受控30分钟Task在创建时固定，生产物理路径和旧Run/期限均未变更。r35完整Windows范围有失败，其中专用HTTPS场景达到原十分钟Task期限、Native退出12且资源处置完整，没有业务观察或认证账单摘要。全部完整报告和失败原件保留；后续新夹具通过本身不证明这些旧失败均已修复。D277旧native_control_unavailable根因仍未证明。

r70 Windows完整14/40为39通过1失败，原Host并发open首次PRAGMA在busy策略安装前遇SQLite锁。新owned锁持有夹具r71完整Host13项12绿1红，同样有限30000ms策略移到连接创建后r72 Host13+account16共29绿；不重试业务效果、不改变库格式、Task或配额。原三组并发Host都等待全部原子进程settle再传播失败，未处置的新保护目录保留。C盘曾耗尽，仅迁移本任务pnpm工具目录到D盘；未移动旧Host/Profile/Unknown原资源。r76因TEMP正反斜杠表示不一致触发严格测试安全清理守卫，两文件已完成46项失败后有意停止；无完整JSON，r77/78未开始，后续PID不存在不等于资源已处置。规范Windows TMP后r79完整受影响44/489通过。r80实际Native1在新Host protect阶段失败，无starts.sqlite或父子效果；旧报告和原ACL目录保留。新owned同生产二进制一次调用exit2，独立.NET4阶段夹具证明owner+DACL设置返回UnauthorizedAccessException/0x80070005；另一全新目录仅预置本用户私有DACL后同一未修改生产helper通过。后续仅为新测试另建本用户私有FullControl临时父目录，旧失败根不修复，不放宽保护要求；新复验来源、父目录环境差异与原源码不变分别保留。不据新复现倒推缺少原exit事实的旧r80每一内部细节；物理硬配额和历史容量仍未证明。

r83 Windows完整14文件40项为37通过3失败，三项production lifetime均在原Host protect阶段被拒绝；原报告保留，不从新场景通过推断其内部原因。为后续全新测试另建短本用户私有Native父目录并保留原生产helper预检，未修复旧根、重开旧Run或放宽路径/ACL守卫；最终完整Windows范围来自新r84，并与原受影响r79及完整新Native r82共享727源码冻结。

r38原报告只收齐13/14文件：33项通过、2项失败，另有worker启动崩溃0xC0000005，取消Native完整文件缺失，后续新增Native未启动，不能算完整范围通过。专用场景原Native/SDK退出0且构造认证费用48已观测，但执行结束后的历史复读/结清超过测试观察期限；仅该case观察期限由780000调到1800000ms，真实Task600000ms及原180000<elapsed<=600000断言保持。Job启动错误现立即传播原exit/error并仅清理本次持有的新child；实际不支持模式红测4绿1红到完整五项全绿。旧wide就绪超时及worker崩溃根因仍未证明，后续通过不改写旧失败。

r42完整新family1已通过，但随后r43 Windows完整14文件40项为38通过/2失败：失败输出场景在首次模型调用前发生内嵌Bun1.3.14分段错误，Native退出3；不能冒充实际方法失败输出。取消场景原OS/Native取消、IPC回复和全部方法效果完整，宿主最终stop回复已持久化但SDK下一step未出现，旧等数量门拒绝。新核验仅接受恰好一条末尾纯文本stop回复、前一完整tool-calls步及IPC最后一项，所有原模型/IPC/SDK/Native严格关联保持；不声称送达、输出或成功。r44原24项23绿1红到r45完整24绿，r46check通过；保留r43实际原件当前生产读者只读独立复核取消成立，不改写旧报告、原账本或重开操作。Bun启动崩溃具体原因未证明；上游同版本Windows报告仅作相关线索，不据此更换固定SDK。

r53新完整Native1在原时钟helper关闭处报native_control_unavailable，后续r54未启动，旧报告保持失败。只读探针对比受限环境WMI返回0x80041003访问拒绝、获准原生环境读取成功，说明必要执行环境有差异，但不证明r53或任何历史失败的具体根因。后续新原生范围在获准Windows环境执行，不重开旧Run、不改配额或预算，旧失败及环境诊断随研究记录保留。

完整范围、独立核验、全部失败及原件摘要见 [D-280研究记录](../research/CimiLoop-original-family-settlement-2026-10-12.json)。普通工程评审不替代Matt或Superpowers。模型/资格/账户批准/认证账单仍PUBLIC构造，没有真实模型、真实Skill或S1验收证据。V1-09生产准入/物理硬配额/历史容量/全部恢复，V1-21真实Skill及Plan/Task前Human/Matt，V1-22Matt完整独立评审/当前源码Superpowers/真实行为对照，V1-10正式工作台接续，V1-11真实普通Change到ReadyForDelivery继续；用户只批准智谱，具体模型/套餐/现金币种及上限/积分上限尚未确认。
