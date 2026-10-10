# CimiLoop 持久账户原预算与共享组合 v0.1

2026-10-10 D-258：原账单字节经受信端口核验后追加到账户意图／Host／独立账单库，完整三方历史核对、现金积分实际费用与未决占用计算、超额冻结和同原件重放已实现。共享 Human 原 Run 费用查询复用 Kernel 读取权限，取消后可读，不产生正式结算。仅新账单账户使用私有账户格式2，旧账户格式1拒绝原位升级；项目库10／242 Schema／原启动账本1保持。实际 Windows账单保管／并发回归通过；完整Native三轮均2通过1失败，末两轮专用组合Bun段错误，尚未接通Native四轮→账单→Human查询，不能算组合通过。构造模型、账单认证及批准不是实际智谱／Skill／S1证据。正式默认Agent关闭，完整五组持续。 [实施记录](CimiLoop-原账户账单与余额核验-v0.1.md)。

D-257，2026-10-10。2026-10-10 D-257：持久账户原现金／积分占用、共享 Kernel 账户服务、独立持续模型核权和原 Native／IPC 工作区投影已接入；生产准备／恢复闸口与 IPC 等待接入同一原 Task 固定截止时间。真实 Windows 专用 HTTPS／SDK／Native 读→大小写路径修改→固定检查→模型继续链路通过，响应重放不重开 Run、不增加占用。模型、批准、套餐、费率仍公开构造夹具，真实模型请求与真实Key读取0，费用未结清。正式默认 Agent 仍关闭，完整五组 S1 持续，242 Schema／用户库10／原启动账本1保持。

实际可用入口是受信代码安装的 DedicatedAgentAccountLedger、Windows 工厂、LocalAgentDedicatedAccount、LocalAgentModelAdmission 和 LocalAgentRuntimeComposition.openDedicatedPersistent。共享应用服务复用 Kernel；Human HTTP／CLI／Agent JSON不能选择账户根、安装端口、选择调用者或批准模型策略。真实完整资格缺失时拒绝，默认无构造回复回退。

## 原账户与两维占用

原 Host writer transaction 固定账户摘要对应唯一仓库外根、目录／主库物理身份和固定策略。策略包含批准、套餐、费率、连接及 profile摘要、现金／积分总上限、每次保守占用和输入／输出界限；独立受信 admission.check 仍必须实时核对真实资格。测试 glm-fixture 和数值不得用于实际付费调用。

独立账户 SQLite 私有格式1、application_id=0x434d4131、WAL／FULL；不修改用户项目库10、242公开Schema或原启动账本1。旧 TEST 现金账本和 credit_budget_rehearsal 不迁移成真实账户。打开前先证明原目录／主库存在且物理身份一致；缺库不创建、复制或重建不补原件、另根／连接变更／Windows设备路径拒绝。

原Scope、call_id、request_id、提供方原字节和摘要固定。两维预算在同一账户 writer transaction 核对，同原请求返回唯一原占用；总额跨Run、连接及Windows进程共享。取消、usage、返回丢失和进程消失不退款、不结账、不授权重发模型。

每笔占用先提交独立 immutable Host ticket，再提交账户行，随后完整核验。全部账户行与全部该账户 Host 锚点双向一一对应；自洽删行并恢复SQL trigger仍拒绝。Host已提交而账户SQL失败保留独立原锚点，后续读／reserve／verify拒绝，不能自动补写、换根或释放。

Windows保护固定覆盖 starts.sqlite 与 account.sqlite 主库、WAL、SHM、journal，保留原starts ACL规则。原 Host 全体1024 tickets共享，账户登记与其他启动／Context票据也占容量；并不承诺4096预算记录。SQLite页数及逻辑记录上限不证明WAL／目录／宿主磁盘硬配额，physical_quota_enforced仍false。

## Kernel 与持续模型

新增内部只读 assessAgentRunModel，不增加公开Schema／数据库字段／HTTP装配权限。它复用原Run当前业务权限、绑定、Task预算和取消状态，必须另有受信 checkModelAuthority；缺端口默认拒绝。首次 assessAgentRunLaunch 保持严格原源码及工作区条件，工具权限不能代替模型／账户准入。

LocalAgentModelAdmission 首次独立验证原Workspace和检查装配，缓存仅固定内容元数据和已核验的原Git拓扑；两条缓存热路径每次重新核对Git根并批量读取原commit及全部tree／blob（包括授权范围外），核验类型、长度、OID、字节摘要及完整输出，再还原相同原来源摘要。原blob保留改名的红例和两条路径绿例均保留，不能缓存原件存在性。每次仍读取内容寻址原件、当前HEAD和原index字节、完整授权目录和范围外dirty、当前文件字节及原Runtime／Native／IPC。所有变化只允许来自同Run、同原operation／scope的已完成原Native唯一摘要链；分叉、循环、未知效果、缺回执、原IPC效果不匹配、额外／缺失文件、外部脏内容或HEAD／暂存区变化都拒绝。原固定检查入口不可编辑。Windows路径按保守大写键对应原规范路径，并用物理身份拒绝真正别名冲突；合法src/QUERY.ts替换原src/query.ts仍可继续模型。

原IPC前缀只允许最后一个正在执行的model_step尚无响应；任何未知工具效果、缺失独立Native记录或回执均拒绝。已完成工具请求与独立Native回执逐项匹配，不能单凭SDK返回重建效果。完整当前投影及原账本在独立 verifyModel 前后重新读取并比较；verifyModel 无默认实现，不复用首次启动批准替代持续资格。

共享账户在check／reserve／verify前后执行独立Kernel模型核权。reserve在最终writer audit后、Host不可逆占用提交前执行同步guard，期间不yield；异步admission中Human取消不生成新占用。占用后的撤权保留原件并拒绝后续模型发送，不退款。

## 原 Task 与 Native 控制等待

初次实测完整首次启动核权单次约10–18秒，旧生产Native准备／resume局部十秒期限导致零模型发送的原失败。当前生产控制等待只在固定原agent_task策略和非零uptime截止时间下使用同一原Task期限，owner消失、EOF和取消仍终止；Join后也检查同一截止时间，不为每个阶段续期。旧演练十秒保留。私有config5格式不变，新构建控制器有新原binary身份，旧原控制器／Run／缓存不改写。

实际正例另在原Runtime悬停后延迟12秒核权，证明合法持续等待越过旧十秒仍按原Task执行；Human撤权反例要求原suspended／runtime_resumed:false和独立退出／清理记录，不能用零模型发送替代未Resume证明。

私有 IPC config2 仅接受实际 AgentRunBudget：在异步构建前固定原 Scope 与 uptime 截止时间，构建后再核对；与 Runtime／sandbox 共享原预算，不能由 JSON 选择或每次请求续期。Native 使用同一原 GetTickCount64 截止时间，等待回复、读取阻塞以及请求转发／回复写回前都核对原期限与持有进程身份；到期或 EOF／owner／supervisor 消失关闭连接。旧 config1 的120秒连接／119秒回复演练期限保留，账本及公开Schema不变。

生产 SDK 从受保护 Native 环境捕获一次剩余等待上限，所有请求共用一个 performance 截止时间；它是客户端上限保护，权威仍为 Native 原 Task 时钟。该上限最多一小时，非法值拒绝，旧入口无该环境时125秒保持。connect 写入前及成功返回时独立核对撤权和原上限，即使 timer 回调迟到也不能发送或接受迟到响应；不自动重试。

第六轮真实 Native 报告2通过1失败：专用模型夹具已持久记录四轮响应、四笔占用并完成独立Native三项效果，旧 IPC 119秒／SDK125秒局部期限先于原Task截止导致最终SDK输出缺失。原失败、四笔占用与独立锚点保留，不能换Run、退款或补写旧结果。新的完整生产组合使用新原件复验。

## 验证范围与证据边界

- d257-budget-final.json：3文件17项通过，失败0、跳过0。
- d257-native-final.json：1文件3项通过，失败0、跳过0。
- d257-affected-final.json：16文件183项通过，失败0、跳过0。
- d257-start-custody-final.json：1文件2项通过，失败0、跳过0。
- d257-ipc-final.json：2文件22项通过，失败0、跳过0。

pnpm check、CLI帮助、UTF-8／本地链接／代码围栏及git diff --check通过；634源码前后摘要一致。实际Windows IPC新增2项验证原Task到期时原peer仍存活和启动前已到期拒绝，客户端20项覆盖迟到connect／有效reply、单一上限和旧连接协议；实际Windows账户5项包含主库／WAL／SHM ACL漂移和两个不同子进程竞争；实际Windows／AppContainer完整组合3项包含持续12秒等待、专用HTTPS四轮model与原大小写Native修改／检查、最终Human撤权未Resume。未运行全仓库／完整S1验收。

首轮受影响142项中9项受十五秒测试harness期限影响，原报告保留，最终使用120秒harness复验；这不延长生产Task或文件准备期限。缓存核验中途13项报告12通过1失败来自模型路径尚未补接完整原Git核验，该诊断报告保留；最终新鲜回归以固定源码批次报告为准。

所有中间红／失败报告及原Native夹具保留：原factory行为、完整历史删行、Windows ACL、共享服务、Kernel独立model端口缺失、JSON null-prototype比较、SQL冲突注入、十五秒测试期限、最初生产十秒准备失败和大小写兼容、两个缓存热路径的原Git非检查blob丢失。旧Temp原Node库丢失原因仍Unknown；仓库D盘保护及长C路径Native构建均曾在setup失败，不能记为Native已执行。短C路径实际保护预检通过后，首次完整运行仍在Native文件准备期限失败；随后复用已核验固定拓扑、逐次完整批量原件证明降低重复Git启动成本，文件准备15秒不变，全部旧失败及原件不删除。测试harness期限与生产原Task期限分开记账；局部失败不删除，也不被新的通过改成通过。

实际Native、SDK、固定Node检查、独立原效果、HTTPS原字节和持久账户原占用均已执行；上游模型回复、完整批准、套餐和费率仍构造。原领域产物由原SDK／Native组合采集，并接入Kernel Unknown观测，完整真实模型与账户资格、原账单结清、生产适用性、Task验收及S1均未证明。D-255丢失原二进制及旧超时／旧电脑Unknown不由本批清除，不删除原Temp／映射／Profile。

五组仍须继续：V1-09真实完整Runtime与持续资格、原结果、预算账单、物理配额和异常恢复；V1-21真实Skill及Plan／Task前Human／Matt；V1-22 Matt独立完整评审、Superpowers当前源码新鲜验证及真实行为对照；V1-10正式工作台原执行／查询／停止／恢复；V1-11真实普通Change到ReadyForDelivery、真实技能／恢复／S1验收与接入指南。用户只确认智谱，具体型号、套餐、现金／积分上限尚未确认，批准前禁止付费请求；凭据仅仓库外既有安全连接，不读取历史Key。

证据：[研究记录](../research/CimiLoop-持久账户原预算与共享组合-2026-10-10.json)；[实施设计](../plans/2026-10-10-cimiloop-持久账户原预算实施设计.md)；[跨电脑接续](../plans/2026-10-09-cimiloop-S1跨电脑接续.md)。本批本地提交，不push，持续目标保持active。
