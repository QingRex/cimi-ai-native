# CimiLoop 原 Job 内存策略核验与结清 v0.1

2026-10-11，D-274，接续 [D-273](CimiLoop-原父运行领域核验与结清-v0.1.md)。本批接通当前正式 Runtime 的原 Job 策略读者；242 Schema、用户库10保持，正式默认 Agent 关闭，零付费、未读取真实 Key。完整五组持续目标 active。

## 可执行边界

原 Native 控制器已有 kill-on-close、单进程、Job committed memory 2 GiB 策略。新 Runtime 输入冻结精确策略及独立 JobObserver 的物理二进制原件；它只对既有原命名 Job 做 QUERY，不创建、设置或终止 Job。Runtime 暂停并绑定独立 IPC peer 后，核验器持有 owner、supervisor、peer 原进程句柄，核对创建时间及镜像、peer 的 Job 归属、确切 limit_flags=8712、active_process_limit=1、Job memory=2147483648、process memory=0，再核仍存活及原期限。出现额外宽松 flags、外来进程、放宽上限或期限失效则拒绝。

放行前原 OS 观察持久保存并 fsync，随后重新核当前模型/账户/Kernel 权限与期限才 resume；失败保留原操作与 Unknown，不重开 Run。独立观察器镜像与保留原件、角色 PID 不同受核验，但没有另行外部钉住观察器自身创建时间。Job 原件是受保管的 host-private 观察，并非数字签名。

完整采集增加原 Job marker。领域完成读者、原成功/失败/取消结清读者、原命名 Skill 方法结果读者均核对同一原策略、保留核验器和原 Job JSON。结清的新输入缺 marker、核验器缺失、原身份或内存策略不符均失败；单纯 SDK 输出成功不能越过此门。共享工作台复用原应用服务及 Kernel，保留原 Run/operation/command_id，丢响应只重放已提交回执。

## 显式兼容

新输入同时包含 job_resource_policy 与 job_observer_original，私有启动登记使用 Claim 2。旧读者只认 Claim 1，因而不能静默漏验新证据；新独立读者核对登记版本与输入成对绑定，Claim 1 携新字段、Claim 2 缺字段、部分或放宽策略拒绝。旧输入继续 Claim 1 原义，不回填 OS 观察或升级用户库。

取消请求仍基于原 claim/input/key，不要求观察器文件此刻存在；这仅登记停止意图，不能证明 stopped、资源释放或费用结清。新完整结果仍要求其物理原件。

Runtime 采集数量上限只为新 Claim 2 增一份。Skill 采集只在独立方法结果已核验 Job marker 后增加一份 artifact 与65536字节；旧证明保持原数量与总字节上界，完整 proof 的8 MiB限制不扩。严格 JSON 解析继续拒绝重复/危险 key、错误 UTF-8；解析后正规化对象，避免与历史原身份比较时误拒绝。

## 证据范围

冻结702份当前源码，受影响37文件518项通过；实际Windows/AppContainer按最新完整文件汇总7文件37项通过、0失败0跳过，未处理错误0。pnpm check、CLI帮助、242 Schema无漂移通过。不是全仓库或完整S1验收。

实际生产父Run核对原Job2 GiB策略与保留观察器；共享工作台在Job内存策略被改为4 GiB时拒绝结清，预约仍102、Kernel无新事件、模型请求仍4。恢复原字节后同一Run结清：构造账单48微现金、预约0、尝试1不返还，Task仍未验收；跨工作台重启原回执重放无Runtime/账户工厂或重复效果。

新增兼容/原件/capacity首轮32项中4失败28通过，修补后4文件51项通过；此前严格历史JSON比较及新策略可降级均已复现并修复。早期Job红测、fixture转义错误1项失败及所有原报告保留；普通只读工程复审的两个必修已闭合，不能代替Matt/Superpowers。

实际生产首轮在恢复SDK前以agent_job_observation_unproven拒绝；同值的strict Native basis身份因null-prototype比较被误拒绝。新增完整17项回归首轮1失败16通过，比较前正规化basis后17通过；所有原策略/身份/期限检查保留。失败原件保留，不重开这些Run。该首轮整批过程不计为最终源码验证，修补后重新冻结并完整复跑。首轮实际7文件31通过6失败0跳过；5项受live basis问题影响，另1项旧IPC丢响应测试在效果完成前即关闭socket的竞态。本轮仅修正测试协调：原host execute完成后，由独立进程消息确认指定socket销毁，再返回工具回执；生产IPC不变，新host仍须证明invocations=1、文件/Kernel事实不变。普通工程复审未发现此修补必修项。

OS QUERY 核对的是生产配置2 GiB内存策略。独立小容量 fixture 用32 MiB Job 拒绝64 MiB committed allocation，只证明 Windows 内存机制；测试 fixture 不是生产 AppContainer、真实模型、真实 Skill 或S1。实际生产 AppContainer、SDK、固定检查及 HTTP 结清另列，模型/资格/虚构凭据/账单仍构造。

内存不是磁盘配额。普通当前令牌无 SeManageVolumePrivilege，不能直接挂载专属VHD；不修改系统卷或施加覆盖现有用户文件的NTFS配额，不删除历史Temp/Profile/映射。目录扫描、逻辑文件容量及保留二进制登记上限均不能替代物理磁盘硬配额。Windows 官方说明见 [Job limits](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information)、[read-only Job query](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-queryinformationjobobject)、[VHD attachment privilege](https://learn.microsoft.com/en-us/windows/win32/api/virtdisk/nf-virtdisk-attachvirtualdisk)。

此前Bun段错误、DNS pin过期、旧Unknown、D-269日志缺口及所有失败原件保持；本批通过不证明其已解决/清理。仅智谱提供方已确认，具体模型/套餐/现金上限与币种/积分上限仍缺，禁止付费。真实Skill、Plan/Task前Human/Matt澄清、Matt独立完整评审、当前源码新鲜Superpowers、真实普通Change到ReadyForDelivery及完整S1仍继续。

当前第二次完整受影响37文件518项通过、0失败0跳过。此前 r3 整批中的父文件2通过1失败：普通SDK及Human撤权通过，Dedicated已正常退出、原Job2 GiB/清理和构造账单原件齐全，后续反例/结清核对超过原780000ms测试外层时限。保留该失败及原件，不扩600000ms业务预算；其他Native完成后单独完整复跑父文件，不能以两项成功代完整通过。完整7文件报告35通过2失败0跳过：另外命名方法最后原资源恢复报native_control_unavailable。随后无源码改动单独完整命名文件1通过0失败0跳过，原执行、反例及原资源恢复均通过；旧Native控制失败根因未证明，保留原件。随后无源码改动单独完整父文件3项通过、0失败0跳过，最终结清与跨重启回执断言均完成；仍不推断旧超时根因已解决。最新范围据此按五个r3完整绿文件与两个r4完整文件汇总，未将旧整批改称通过。

## 接入复验

按 [跨电脑接续](../plans/2026-10-09-cimiloop-S1跨电脑接续.md) 配置当前 checkout 的 Node >=24.15 <25、pnpm12.4.2，依锁安装，执行 pnpm check。不能沿用旧电脑路径、缓存或原进程。运行完整 packages/runtime-adapter/test/agent-job-native-runtime.test.ts 与 tests/scenarios/agent-production-lifetime-runtime.test.ts，再完整命名方法及 Skill Native 场景；非Windows跳过不算通过。生产父Task业务期限600000ms、外层780000ms不变；使用新构造夹具，不补造旧证据。固定检查必须明确启用，仅代码安装 Runtime/账户认证器，HTTP JSON不能安装。

受影响回归与最新原生范围的源码差异只包含普通Node peer测试夹具及其IPC丢响应场景；37文件产品/测试代码一致。最新7文件Native覆盖这两个改动，702份源码后续无漂移；若发生新产品修补须重新冻结。

最终命令、冻结源码、过程失败及实际原件摘要见 [D-274研究记录](../research/CimiLoop-original-job-policy-2026-10-11.json)。完成批次后本地提交，不 push。
