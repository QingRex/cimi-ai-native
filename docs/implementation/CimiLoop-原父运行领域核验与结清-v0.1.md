# CimiLoop 原父运行领域核验与结清 v0.1

2026-10-11，D-273，接续 [D-272](CimiLoop-原父子运行费用聚合-v0.1.md)。242 Schema、用户库10不变；正式默认 Agent 关闭，未执行付费请求。

## 原 Native 与领域边界

普通父 Task 的原结果核验现在要求唯一完整 suspended 原件，八个确切字段、空 network_capability_sids、active_process_limit=1；原 nonce、supervisor、peer、AppContainer SID 必须与 launcher/resources 及独立 IPC endpoint 配对。result.operation 必须是原 operation，result.sandbox 必须是原 suspended。stdout 要求 suspension 在全部 SDK 步骤前、匹配的唯一 cleanup 在末步后，未知、重复、错配和乱序事件拒绝。领域定义、原 SDK/模型/工具回执、固定检查及输出依据仍独立核验。

终态读取也核对同一完整隔离策略及独立 IPC 身份；同字节集合内的一致篡改不能使成功、失败或取消结清。隔离策略不是物理磁盘/历史容量配额证书；执行结果不是 Task 正式验收，不能自动成为 Satisfied 或 ReadyForDelivery。旧 Unknown 与缺原件保持，不回填或重开 Run。

## 原 Host 读取成本

实际基线发现普通 Dedicated 每次模型准入重复完整同步 Windows Host 校验。新增 code-installed readOriginalScope，只在同一同步 SQLite BEGIN 中读取票据、basis、原 claim，前后各做完整实时目录 ACL、物理身份、DDL、所有行及摘要核验。无 caller callback，无效果、无跨 await 缓存，不升级 Host/用户库。LocalAgentStartCustody 在独立 full.verifyLaunch/verifyModel 前后分别取新 cut，原 admission 内容与完整 cut 必须一致。原实时 Kernel 权限和每个 await/费用效果边界上的 guard 继续生效。独立回调参数深复制，回调后固定回读原 scope；回调 claim 原范围后改传入 request 不能藏住原 claim 的变化。账户 check 同阶段的预算、父子资格和 relation 合为一次完整 cut，异步准入前后各取一次，失去物理 custody 仍拒绝且不新建 hold。

## 原 hold 与发送前有效期

第四轮实际完整文件1通过/2失败/0跳过：普通父执行Bun1.3.14段错误退出3，专用账户在read/replace/check后第四轮前报gateway_address_pin_expired并退出1，Human撤权通过。两个新失败的原cleanup均显示resources_disposed=true，原件保留，Bun根因未证明。

定位专用账户TLS后的重复准入：旧check加verifyHold重复做完整核验；verifyHold本身分四个账户cut，可能耗尽原30秒DNS pin。现在私有checkOriginal只在同一个同步cut中核预算、原关系及原hold，异步准入前后分别取完整新cut；Local verifyHold仍在等待前后核Kernel权限、原模型范围和账户。TLS后保留这一次完整bound-hold核验，移除另一次重复check。旧port的verifyHold必须核hold所绑定的确切connection、批准、物理保管、资格和两种预算，不接受只核hold JSON的实现。网络策略摘要、TLS/peer证书、30秒单调时钟有效期、过期拒绝、原dispatch与不重发均不变。

新增两文件54项红测为52通过/2失败；修补后首轮53通过/1失败，因测试初始化后替换已绑定回调，撤销注入未生效。改为初始化前安装mutable闭包后54通过/0失败/0跳过；独立过期反例仍拒绝且无HTTP请求、不增加第二份hold。所有过程结果保留，当前完整原生结果另列，不把fake时钟当真实Native验收。

首次最终36文件496通过/1失败：旧账单测试覆盖公开check，优化后的verifyHold使用内部完整checkOriginal，超额账单注入未执行。修正为初始化前安装实际准入回调中的可变闭包，并断言注入一次；verify与reserve replay均在等待后拒绝超额且保留原两笔hold。首次单文件复验17通过/1失败是另一SQLite争用测试超过诊断命令默认15000ms；按整批原有240000ms测试时限复验完整18项通过。生产代码、Task业务期限与已通过Native场景均未改变；原失败结果保留，随后重跑整个36文件范围。

## 共享工作台接入

新增实际普通父组合场景安装原账户 factory，复用既有共享 Human 应用和 Kernel。按原 /observe、/cost-observation、/reconcile-original 身份准备证据；账单 Known 后仍需独立领域/终态核验才可结清。HTTP JSON 不安装账户、凭据、Runtime 或认证器；丢响应沿原 command_id 重放。

该场景使用本机 Windows/AppContainer、原 SDK、实际文件读写和固定检查、持久专用账户及本地 TLS；模型/资格/公开虚构凭据/账单认证仍为构造。第五轮最新源码完整父执行文件实际3通过/0失败/0跳过；Dedicated四轮模型及原账单、五类Native反例、同Run结清和跨工作台重启原回执重放全部通过。完整文件用时978.87秒，其中Dedicated场景732.856秒包含账户初始化、Native和后续核对，原Task业务预算仍600000ms，场景外层780000ms不变。过程失败和其原件不由新通过覆盖。最终完整受影响/其他原生范围以研究记录为准。

## 诊断阶段与验证

原普通父基线实际3项均失败：首例未进入 SDK、suspended EOF125；第二例执行实际读写/固定检查后三轮模型耗尽原600000ms预算；第三例当前 Human撤权返回403 ROLE_NOT_ASSIGNED，旧断言仍期待200。原件保留，新验证不修复这些原 Run。第三例按当前权限语义修正断言。第二轮实际2通过/1预算失败；可复用外部账户在后续新场景中先初始化，再预约新 Task，原600000ms预算不变，不延长或修复任何旧 Run。 第三轮实际2通过/1失败，Dedicated四轮模型与Native结果已形成，共享费用观察正确拒绝CNY构造账单与原USD预算不匹配。后续只在新夹具采用匹配USD账单，不更改已有Run、账单或生产币种检查。

策略红测6失败/旧12通过，修补后18通过；原 Host cut红测2失败/旧6通过，新鲜前后审计修补后8通过。共享终态7项通过，费用与成功/失败/取消分开；回调藏 scope 的诊断红测1失败/11按筛选跳过，修补后1通过/11按筛选跳过；账户准入 cut 计数红测1失败/10通过、修补后11通过。筛选诊断不是最终完整回归。这些单元/受控原件不能代表真实模型或 S1。

最终冻结源码复验：受影响 36 文件 497 项通过；实际 Windows/AppContainer 原生含完整父执行 6 文件 33 项通过、0项失败、0跳过。首轮完整36文件496通过/1失败已保留；修正测试超额账单注入后重新全量复验。Native通过后仅账单测试注入改动，生产及Native场景摘要一致。最终没有未处理错误。pnpm check、CLI帮助与242 Schema无漂移通过，697份源码前后一致；不是全仓库或完整S1验收。 本轮完整父执行3项通过，前四次诊断的失败原件全部保留，不据新通过证明旧Unknown已清理。

实际原父执行经共享工作台先报告Unknown，再记录公开构造USD48微现金账单，Run仍Unknown、Task保留102预约；原领域/Native/终态核对后同Run Succeeded、消费48、预约0、尝试1不返还，Task未Satisfied。五类Native反例拒绝且无Kernel效果；原结清command_id跨工作台重启无需账户/Runtime工厂即可重放，不再模型/扣费/执行。本次r4完整文件3通过/0失败/0跳过；Dedicated完整结清与Human撤权均通过。

最终冻结范围、执行命令、实际 Windows 结果及剩余接入条件见 [D-273研究记录](../research/CimiLoop-original-parent-domain-2026-10-11.json)，与 [计划](../plans/2026-10-11-cimiloop-original-parent-domain.md) 一起本地提交，不 push。

## 本轮接入复验

在当前 checkout 选用 Node >=24.15 <25、pnpm12.4.2，按锁文件安装依赖后执行 `pnpm check`。实际 Windows x64/AppContainer 与原生控制器要求沿用 [接续文档](../plans/2026-10-09-cimiloop-S1跨电脑接续.md)；本机 OpenCode 二进制、C# 编译能力及 Windows 受保护 Host/账户均须存在。不要沿用另一台电脑的缓存、原进程或绝对路径。

执行 `pnpm exec vitest run tests/scenarios/agent-production-lifetime-runtime.test.ts --maxWorkers 1` 复验本轮三个完整场景；测试自带780000ms测试外层时限，新 Task 的业务预算仍600000ms。需要三项通过且零跳过；非Windows跳过不算通过。这些测试只使用公开构造模型/凭据/账单和本机TLS，不能用于验证真实提供方费用。场景保留本次原件，失败后按原记录检查，不重开旧Run、不续期预约、不批量清理。

真实接入另需受信代码安装 Runtime、原账户与真实技能/评审器，不能由HTTP请求体安装。先确认具体智谱模型、套餐、现金上限及币种和积分上限，再按既有安全连接配置仓库及整个数据目录外的凭据；此前禁止付费。费用币种必须与原Task预算一致；现金与积分分别按原单位核对，不能换算后追改原预约。本轮新夹具为公开构造USD 48微现金，不是已批准真实费用上限。成功执行仍应依次查询原操作、采集原SDK/Native/领域结果、核原最终账单、沿原command_id进行Kernel费用观察与ReconcileRun。响应丢失先查询同一原回执；不能重新start新的Run。Task验收和Change到ReadyForDelivery还需真实Skill、Human/Matt、Superpowers及完整S1证据。

## 五组目标保持活动

V1-09 的完整正式 Runtime、Native/SDK/工具/模型/账户、领域结果、费用预算/账单、物理配额、历史容量和全部异常恢复；V1-21 真实 Skill 与 Plan/Task 前 Human/Matt；V1-22 独立完整 Matt、当前源码新鲜 Superpowers 与真实行为对照；V1-10 正式工作台共享应用服务的执行/查询/停止/原操作接续；V1-11 真实普通 Change 到 ReadyForDelivery、真实技能/中断恢复/S1验收与可操作指南，全部未宣告完成。

仅智谱提供方已确认。具体模型、套餐、现金上限及币种、积分上限待确认；真实 Key 通过既有安全方式置于仓库及整个数据目录外，禁止读历史 Key、写 Git/日志/Agent上下文或未批准付费。旧 Unknown/Temp/Profile/映射和既有两份临时文件不清理；历史 D-269 本地 check 日志误覆盖缺口保持。
