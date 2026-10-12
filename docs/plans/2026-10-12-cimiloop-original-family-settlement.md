# Complete original family settlement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将原父 Native/SDK 终态、全部已执行子调用的最终账单和独立永久封闭的零效果子调用接入共享 Human/HTTP/Kernel 原 Run 结清；保持原操作身份和原命令恢复。

**Architecture:** 新版本内部 family/2.0.0 按完整 Kernel 子集合分类为原已执行有最终账单或原正面封闭零效果；旧 family/1.0.0 和旧账户 snapshot/costs_reconciled 含义不变。账户 writer 原切面核全量登记、意图和占用，闭合零请求不补登记；共享原结果读者独立复核每个子报告和原准备/封闭，父仍需原 Native/SDK/IPC/领域或取消终态才允许 Kernel 结清。生产父 SDK 到子 Skill 的预约/执行/采集及受证继续仍必须后续接通，不能用本场景代替普通真实链路。

**Tech Stack:** Node24.19/pnpm12.4.2、TypeScript、SQLite、Vitest、实际 Windows Native/SDK/原账户与 HTTP/Kernel。

---

D-280 接续 D-279，基线 main 67e5ff8e8fd49fcf8ed08a1838c9f71e313a2567；D-279完整回归与本地提交已完成。当前五组目标 active、不 push、无付费/真实凭据；242 Schema、用户库10、Host1保持。保留两个用户 TMP 及所有失败/Unknown原资源。

## Task 1: 原账户完整 family writer 核验

Files: packages/runtime-adapter/src/agent-dedicated-account.ts、packages/runtime-adapter/test/agent-run-family-costs.test.ts，必要的独立 fixture。

1. 行为红测：父及已执行子有完整认证账单，加一个 Kernel 原出生且永久封闭、零调用/零hold子，旧 reader拒绝而新明确版本返回精确总现金/积分；无子账户登记也能核对，不能补登记。
2. 独立反例：遗漏/重复/替换任一child、未封闭、单侧/物理换件、child已hold/发送/未结账、外国账户登记或文件-only意图/hold、父缺hold/账单均拒绝。冻结零效果不等于父终态或任务成功。
3. 新账户入口保持一个账户 writer 切面，不嵌套 BEGIN；复用私有零费用审计但不改变旧入口语义。完整注册集合须双向等于已执行子和已有登记的封闭子；每个目标scope全部原Host账户/意图/占用必须归于选定账户或明确零效果。
4. 所有聚合以安全整数/BigInt核上下界，保留币种、积分单位、最终原账单身份及父/每子证据；核验不写原账单、不返还次数、不调用模型。

## Task 2: 明确版本原 family 证据与 Kernel 全子集合

Files: packages/runtime-adapter/src/agent-run-cost-evidence.ts、packages/runtime-adapter/src/index.ts、packages/local-app/src/agent-run-family-costs-local.ts、packages/local-app/src/agent-runtime-observation-local.ts、packages/local-app/test/agent-family-cost-proof-capacity.test.ts。

1. 红测 mixed family 费用读者、old v1兼容、scope/root替换、零准备不完整、额外Native/SDK/IPC/model/method效果及读权限错误拒绝；单独缺目录不能证明0。
2. 新 family/2.0.0 只接受代码供给的准确 kind/relation/root/original-inputs；runtime独立再核封闭/零effects/零费用，与已执行成员的所有原call/hold/最终bill合并，前后复读。
3. local以 Kernel writer 当前快照枚举所有原invocation与observations，独立原结果端口再核每个准确报告；NotStarted须原取消、无output、cost0和正确原资格。拒绝未结清/未知/冲突/省略结果；与account注册/出生/原scope精确双向比对。
4. 扩展规范proof parser只明确接受新私有版本并维持原bytes/node/depth和危险key/重复key约束，不迁移旧proof/用户库。

## Task 3: 共享应用服务和原 Run 结清

Files: packages/local-app/src/runs-local.ts、packages/local-app/src/project.ts、packages/local-app/src/agent-run-cost-observation-local.ts、packages/local-app/src/agent-account-billing-entry-local.ts、必要的工作台server/type接线及完整单元测试。

1. 原账户lease可由可信代码提供历史子结果读者；HTTP/CLI不能上传reader/root/scope/终态/批准。普通账单安装不自动授予执行权限。
2. 将同一个原子结果核验端口传到capture和Kernel独立readRunResult，当前身份/location/原父子资料及权限在await前后复查；丢响应或释放失败后同command回执无需再次factory。
3. 父仍须 readOriginalAgentTerminal 的原Native/SDK/IPC以及领域结果或原Kernel取消；只子NotStarted或费用读者不得释放父预算。Kernel 全子settled门保持；Task验收独立，真实模型/账户未批准不启用默认入口。

## Task 4: 实际 Windows 父 SDK + mixed children + HTTP/restart

Files: 新tests/scenarios/agent-run-family-settlement-native-runtime.test.ts，复用既有实际普通父Runtime/Skill及原账单fixture构造方法，避免伪造父Native/SDK原件。

1. 使用实际Windows受保护Host/account及真正运行普通父SDK的受控TLS模型，保留原模型/IPC/Native/账单；子包含原完整执行有账单及永久封闭零效果，所有模型/资格/批准仍明确构造。
2. 验证缺一子、缺父终态、漏账单或原件变化都保持Unknown/预算；完整后实际Human HTTP ReconcileRun结清精确现金/积分，Task仍未Satisfied，不返还真实执行次数。
3. 故障注入响应丢失/释放失败、重启同command无factory重放，原件句柄复开、不再发模型/Native效果。所有首次失败和原目录保留；Windows跳过不计通过。
4. 此测试不替代父SDK自行预约Skill/实际真实Skill/真实模型/Matt/Superpowers/S1；明确记录剩余缺项，继续完整五组。

## Task 5: 完整验证及本地提交

先每个新增能力红到绿，再冻结当前所有源码，pnpm check、CLI帮助/242Schema/库10、受影响完整文件和实际Windows完整范围。独立工程复审（不冒充Matt/Superpowers）；新实施/研究记录、五索引和交接，校对原日志/摘要、UTF8/链接/围栏、git diff --check。精确stage仅本批，本地commit不push；保留旧失败根因未证明的说明。

## 实施诊断记录及完整批次结果

受影响44文件489项通过；实际Windows完整14文件40项通过，新增mixed Native完整1文件1项另轮通过，均0跳过；取消前缀修补后全部完整范围及check使用同一727源码冻结，前后零漂移，不复用修补前r35报告作为当前验收；check/CLI/242Schema/库10/Host1通过。原family/2完整集合、逐子费用等式、历史版本读者和异步后session守卫均已接共享服务；实际父3/子7请求、六项固定方法工具及闭合零子通过，HTTP原命令丢响应/重启不重开工厂。首次路径失败、r33不完整方法拒绝、r35实际Windows失败和全部诊断原件保留；完整报告与范围见 [D-280实施记录](../implementation/CimiLoop-原父子完整费用与终态结清-v0.1.md)。实现、完整验证和文档核对后仅本地提交，不push；五组继续，非S1。

r70 Windows完整14/40为39通过1失败，原Host并发open首次PRAGMA在busy策略安装前遇SQLite锁。新owned锁持有夹具r71完整Host13项12绿1红，同样有限30000ms策略移到连接创建后r72 Host13+account16共29绿；不重试业务效果、不改变库格式、Task或配额。原三组并发Host都等待全部原子进程settle再传播失败，未处置的新保护目录保留。C盘曾耗尽，仅迁移本任务pnpm工具目录到D盘；未移动旧Host/Profile/Unknown原资源。r76因TEMP正反斜杠表示不一致触发严格测试安全清理守卫，两文件已完成46项失败后有意停止；无完整JSON，r77/78未开始，后续PID不存在不等于资源已处置。规范Windows TMP后r79完整受影响44/489通过。r80实际Native1在新Host protect阶段失败，无starts.sqlite或父子效果；旧报告和原ACL目录保留。新owned同生产二进制一次调用exit2，独立.NET4阶段夹具证明owner+DACL设置返回UnauthorizedAccessException/0x80070005；另一全新目录仅预置本用户私有DACL后同一未修改生产helper通过。后续仅为新测试另建本用户私有FullControl临时父目录，旧失败根不修复，不放宽保护要求；新复验来源、父目录环境差异与原源码不变分别保留。不据新复现倒推缺少原exit事实的旧r80每一内部细节；物理硬配额和历史容量仍未证明。

r83 Windows完整14文件40项为37通过3失败，三项production lifetime均在原Host protect阶段被拒绝；原报告保留，不从新场景通过推断其内部原因。为后续全新测试另建短本用户私有Native父目录并保留原生产helper预检，未修复旧根、重开旧Run或放宽路径/ACL守卫；最终完整Windows范围来自新r84，并与原受影响r79及完整新Native r82共享727源码冻结。

r38原报告只收齐13/14文件：33项通过、2项失败，另有worker启动崩溃0xC0000005，取消Native完整文件缺失，后续新增Native未启动，不能算完整范围通过。专用场景原Native/SDK退出0且构造认证费用48已观测，但执行结束后的历史复读/结清超过测试观察期限；仅该case观察期限由780000调到1800000ms，真实Task600000ms及原180000<elapsed<=600000断言保持。Job启动错误现立即传播原exit/error并仅清理本次持有的新child；实际不支持模式红测4绿1红到完整五项全绿。旧wide就绪超时及worker崩溃根因仍未证明，后续通过不改写旧失败。

r42完整新family1已通过，但随后r43 Windows完整14文件40项为38通过/2失败：失败输出场景在首次模型调用前发生内嵌Bun1.3.14分段错误，Native退出3；不能冒充实际方法失败输出。取消场景原OS/Native取消、IPC回复和全部方法效果完整，宿主最终stop回复已持久化但SDK下一step未出现，旧等数量门拒绝。新核验仅接受恰好一条末尾纯文本stop回复、前一完整tool-calls步及IPC最后一项，所有原模型/IPC/SDK/Native严格关联保持；不声称送达、输出或成功。r44原24项23绿1红到r45完整24绿，r46check通过；保留r43实际原件当前生产读者只读独立复核取消成立，不改写旧报告、原账本或重开操作。Bun启动崩溃具体原因未证明；上游同版本Windows报告仅作相关线索，不据此更换固定SDK。
