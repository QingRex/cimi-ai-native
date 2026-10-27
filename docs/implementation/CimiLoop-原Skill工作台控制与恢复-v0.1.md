# CimiLoop 原 Skill 工作台控制与恢复 v0.1

2026-10-27 完整父子停止续接：从所选 Skill 提交的 `CancelRun` 现在复用父 Run 的完整原集合控制，同时处理父操作与全部原子 Skill，不再只向所选子调用重送。保留所选原响应，附 `parent_operation` 与 `family`；子取消应答不能覆盖父原件 Unknown 或释放预算。请求在新增模块等待前固定，等待后的身份变化拒绝；会话／权限失败保持。实现与实际验证范围见[本批记录](../plans/2026-10-27-cimiloop-selected-skill-family-stop.md)。这不启用正式执行或完成 S1。

2026-10-11，D-277。接续 [D-276 原 Skill 方法失败](CimiLoop-原Skill方法输出失败与费用核对-v0.1.md)，完整 V1-09/21/22/10/11 范围保持，尚未完成。正式默认 Agent 关闭；242 Schema、用户库格式10保持，无真实凭据读取、无付费请求、无 push。

已有原 Skill 子调用现在可从共享 Human 应用服务、工作台 HTTP 和页面查询、采集、请求停止、重试原取消及回收原资源。请求停止先由共享父子服务提交或重放 Kernel 原父 Run 的 CancelRun，再对父原操作及其全部原子调用传递原取消。Native 缺失、响应丢失或释放失败保留 Kernel 原取消回执；查询和恢复没有执行、模型或账户工厂，不能重开 Run。资源 Stopped/已回收不等于 Skill Cancelled/NotStarted、账单结清、父预算释放或 Task 验收。

## 身份、权限与原件

Agent 执行入口仍校验真实 Agent caller。新增只读 Skill metadata reader只共用原 invocation、父 RunRecord/Context、runtime/skill Binding、Host准入、执行者、输入摘要、原包/契约固定关系；它不授予执行权限，也不生成 Agent caller。Human 服务另核本地 instance、当前项目、Human 身份与 Kernel 可见原 Run。

取消传递和资源回收还须满足原父 Run 的 cancel_requested，以及 Kernel authorizeAgentRunControl 对当前 Human technical_owner 的项目或该 Change有效指派。该只读权限核验和启动请求核验共用身份/指派规则，各自不授予 Agent 执行权。角色结束、过期、会话失效或工作台关闭，在等待原租约后再次拒绝物理效果。Kernel 是唯一业务权威，宿主、UI、回调不能提交自己的状态结论。

受信代码只安装可释放的 LocalSkillInvocationStartCustody 租约。每次触及 Native 前读取原出生 ticket、固定 preparation、独立 admission anchor 的物理文件身份，再要求 dispatch 文件和 Host 独占登记两份完整一致。单份缺失、无 material_digest、旧电脑丢失的原件或 unclaimed 都返回 Unknown，不修复登记、不判 NeverStarted、不批量清理历史资源。

原 root固定为 local.location.dataDirectory 下的 skill-runtime-originals/project_id/invocation_key；scope使用原父 run_id，原 child invocation_key 和 child input_digest，原执行者/Binding/Host准入不变。不得由HTTP字段指定 root、scope、pid、账户、证据或终态。工厂等待后、Native等待后和释放后重读原资料、固定 location/instance及当前控制权限；同步 guard返回Promise拒绝且消费其拒绝。取消端口即使异步也须等待，完成前不释放/误报 Observed；私有回调错误只报告固定 Unknown，释放一次。

## 工作台接入与复验

宿主原登记不随 Git 迁移。新电脑必须从原可信 Host custody 取得原 ledger路径及原 Host identity；打不开原件就保留Unknown，不能用本机缺文件证明旧电脑已结束。只在原准备时创建出生/准入，控制工厂不补新ticket、不复制旧绝对路径、不初始化新ledger替代原ledger。凭据、套餐和模型审批也不由这项租约建立。

工作台代码配置增加 skillRuntimeForInvocation。函数接原 invocation id及当前Human LocalProject，返回原 custody及 release。接线核心使用 AgentStartLedger.open(hostDirectory, trustedHostIdentity)，随后 new LocalSkillInvocationStartCustody(local.location.repositoryPath, local.location.dataDirectory, ledger)，release关闭该句柄。hostDirectory和trustedHostIdentity必须来自已核定的原Host配置；此例的变量不能改为新初始化、HTTP参数或自称ALLOW。普通默认工作台未安装该原工厂时，查询为Unknown；授权的Kernel停止仍可登记，后续通过原工厂重试。

| 入口 | 请求 | 实际行为 |
| --- | --- | --- |
| GET /api/skill-invocations/:id | 无 body | 只读原 Skill 子调用的物理状态；不打开执行入口 |
| POST /api/skill-invocations/:id/collect | 空对象 | 采集原Native及原取消资料；不写领域观测 |
| POST /api/skill-invocations/:id/stop | 原 CancelRun 命令 | Kernel先提交／重放原父Run取消，再控制父及全部原子调用；保留所选子响应 |
| POST /api/skill-invocations/:id/cancel | 空对象 | 已有Kernel取消时重试同一原marker |
| POST /api/skill-invocations/:id/recover | 空对象 | 已有Kernel取消时调用原资源恢复；不恢复SDK执行 |

全部入口沿用本机回环、Host/Origin、Human cookie；写入口加CSRF。GET拒绝body，cancel/recover/collect拒绝额外字段。stop准确包含 command_id、requested_at、acting_role、command_type、target、expected_revision、payload 七个顶层字段；command_type为CancelRun，target须是该Skill实际父Run，acting_role由Kernel按当前technical_owner核验，payload为reason。沿用已有原Command ID，不为重试生成新命令。完整命令格式见 [V1实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)。

复验步骤：从任务详情的固定技能调用取得原id和父Run；查询或采集原资料；在该卡片填写原因并请求停止；在项目记录确认父Run取消，再查询/重试原取消/回收原资源。无工厂/原件时保留Unknown及原预算，不期待完成。若HTTP/浏览器响应丢失，重新打开同会话的工作台并选“按原请求核对”；同Command ID及child endpoint从sessionStorage恢复，先重放原Kernel回执。取消提交后发生撤权也保留原请求，须恢复当前Human权限再继续，不根据403猜测取消未提交。浏览器只把路由标识保存在本地，发送时剥离 skill_runtime_control，不把它当Kernel字段。

页面提供查询、采集、停止，以及父Run取消后的重试取消/回收按钮。成功/失败的迟到查询均检查卡片仍连接页面及最新请求序号；当前查询失败移除旧详情，导航后旧错误不覆盖新页面提示。页面不展示“真实技能完成”或“预算已释放”来替代独立核验。

## 验证与证据边界

2026-10-12收尾：最终受影响14文件128项通过；实际Windows按最新完整文件汇总6文件14项通过，0跳过。Windows首次全范围13通过1失败，失败Job文件同源码新夹具完整复验4项通过；首次控制器失败根因未证明，不称已修复或单轮全绿，不是全仓库回归或完整S1验收。710源码在完整验证前后无变化；同源码r13 check、CLI帮助及242 Schema通过，用户库保持10。上一轮r13完整回归中断，没有最终报告，原日志和资源保留，不计通过；r14及失败Job文件复验用新夹具，未重开旧原操作。进度查询时目标为blocked，用户随后恢复原目标，当前工具确认active，完整五组范围不变。

行为红测及完整最终范围见 [D-277研究记录](../research/CimiLoop-original-skill-control-2026-10-11.json)。共享控制使用真实Kernel/SQLite与原Host独占登记，单元Native端口明确构造。实际Windows测试以新命名方法cfg6 原 child 进程保持挂起，真实固定SDK二进制未恢复执行；经Human HTTP提交Kernel取消、原marker、Native退出130和独立OS资源核验，再关闭/重开Host与工作台，用同原命令查询/采集/恢复。该路径没有SDK/模型发送、费用认证或真实Skill资格，不能计真实模型、真实技能、Matt/Superpowers或S1验收。

实际旧原成功/失败SDK组合兼容验证使用新原操作，资格/模型/批准/账单仍公开构造，区别于生产模型或最终S1证据。本批没有重开D-276或更早原Run，失败/Unknown和本次原日志保留；未把“新电脑找不到”用作清理证明。普通工程复审不替代Matt独立完整评审或Superpowers当前源码新鲜验证。

五组继续：V1-09完整真实Runtime/独立领域结果、账户批准/最终账单、磁盘硬配额、历史容量与全部异常；V1-21真实Skill及Plan/Task前Human/Matt；V1-22真实Matt/Superpowers及行为对照；V1-10正式Agent入口准入及完整工作台接续；V1-11真实普通Change至ReadyForDelivery和S1验收。下一步独立补原Skill Cancelled/NotStarted的完整终态/费用证明与父子结清，不以本批资源停止替代。
