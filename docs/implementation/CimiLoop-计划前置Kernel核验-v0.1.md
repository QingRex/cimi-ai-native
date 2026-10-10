# CimiLoop 计划前置 Kernel 核验 v0.1

2026-10-10 D-263：计划前Human原问答、原候选命令与Plan／Contract内容已接Kernel三个事务前置核验；受信代码可为共享应用服务及工作台安装严格路径，缺真实Matt拒绝，异步核验拒绝并消费异常，原回执不重复效果。现有人工模式兼容、普通CLI及默认入口未全面强制，真实Matt／Skill／Superpowers与完整S1未通过。正式Agent默认关闭，库10／242 Schema保持，零付费、完整五组目标继续。

## 可用行为

已有 Human 问答页允许创建计划候选，但直接命令原先可以绕过它。现在受信启动代码安装严格路径后，提交 Plan 候选、确认 Plan、生成 Task 都在 Kernel 事务内核验同一份前置澄清；CLI／HTTP／页面不是业务权威。先检查实际角色、修订和正式约定等原业务条件，再读取前置原件，失败不创建候选、Plan、Task或业务事件。

例如：Human 完成一个问题和回答，私有账本预约唯一 plan_candidate 请求。共享服务按该请求提交 Kernel；严格路径核对原 Command ID、requested_at、Change revision、Human 身份、完整 Plan 内容及原正式约定，再调用受信 Matt 历史核验器。真实 Matt 未安装返回 CAPABILITY_UNAVAILABLE，不能仅凭 Human 回答生成计划。受控核验器仅在测试中验证代码组合，不能作为真实方法、资格或 S1 证据。

核验器只读取已经执行的真实 Matt 原件，必须核对固定方法来源、完整 Human 上下文、真实 harness、无未决问题、精确 Plan／Contract及证据有效性。不得在 Kernel 事务中调用模型、发送网络请求或创建方法效果。方法执行宿主、批准模型／账户及完整真实证据仍未接入，本批不提供一个默认通过的 Matt 实现。

## 原请求与不可变原件

readOriginalHumanPlanClarification 只读现有私有格式2会话；不创建、修复或追认旧账本。提交候选必须找到已有原预约且问题已回答；确认与生成Task必须找到该原候选的成功 Kernel 结果，并与当前精确 PlanProposal 比较。绑定原 Human、需求负责人、项目、需求、正式约定和完整候选内容。旧 Plan／Task 在严格路径缺少这些原件时拒绝，不能补写一个合成问答追认。

Kernel 和本地核验器向外传递结构化副本，回调不能改变领域对象或原问答。Matt核验后再次独立复读 Human 原件，缺失、损坏或漂移时拒绝。返回JSON verdict、Promise或thenable也拒绝；Promise rejection被立即消费、不await、不向公开错误或stderr转发私有异常。

原命令成功回执先于再次核验，响应丢失后用同一Command ID及完全相同输入接续，只产生一个候选或Task效果。提交前拒绝没有Kernel回执，仍可按私有账本原请求继续；已提交后改变同一请求输入继续原有COMMAND_ID_REUSED语义。新命令则必须重新核验当前权限与原件。

## 受信接入

1. 先通过已有安全连接配置批准的真实方法／模型账户；本批没有读取真实Key，也不提供付费默认值。
2. 受信启动代码为 openLocalProject 或 startWorkbench 传入 planningClarification:{matt:originalMattVerifier}。空对象表示严格路径已安装但Matt缺失，会拒绝；不传表示原人工兼容模式。这是代码依赖，不是JSON配置、命令行开关或HTTP字段。
3. 工作台原 /api/commands 和 /api/changes/:change/clarifications/:session 都复用同一Kernel；候选拒绝仍返回完整原会话及 command_result，HTTP状态沿用409，重试原请求返回同一结果。
4. 本批没有为普通编译CLI增加严格安装工厂，默认入口没有全面强制。必须继续完成正式启动组合与真实Matt宿主，不能把可安装的核验路径表述为所有用户入口已约束。
5. Node要求>=24.15 <25、pnpm12.4.2；本机验证为Node24.19.0。按锁安装后执行pnpm check，再运行计划、原人工兼容及实际Windows/AppContainer零跳过回归。跳过不算通过。

## 本批验证与限制

- 受影响6文件96项通过，失败0、跳过0、未处理异常0；问答文本与Matt核验器是公开测试构造，实际共享应用服务／Kernel／SQLite／HTTP效果、原人工兼容及三次前置核验／原回执恢复。
- 实际Windows3文件10项通过，失败0、跳过0；原取消／Native输入边界／账户保管回归。构造资格与公开账户夹具不是实际智谱、真实Skill、完整正式Runtime或S1证据。
- pnpm check、2项编译CLI帮助通过；242 Schema语义无漂移；665项源码快照验证前后无漂移；新测试自有项目库10。无用户库迁移。
- 保留全部失败：初轮4失败包含Confirm过期／Task非法payload，修正后4项真实行为红；首实现4通过；扩展13项中12通过1个回执语义断言错误；预回归5文件90通过；HTTP初轮1实际绕过失败与1错误路由404，正确路由2项行为红；异步17断言通过但2未处理错误、exit1；首次完整6文件95通过1状态断言失败。最终完整重新验证，不拼接局部通过结果。
- pnpm exec启动一次空日志访问冲突exit -1073741819、没有测试完成；同版本Node与Vitest直接启动正常。只读核对Node／内存／错误事件未证明根因，未改安全软件或批量终止进程。不能归因旧Bun段错误。
- 按[requesting-code-review](C:/Users/hector.he/.agents/skills/requesting-code-review/SKILL.md)进行了普通只读审查并修复两处问题；不是正式Matt／Superpowers评审。最终范围和原件摘要见[研究记录](../research/CimiLoop-计划前置Kernel核验-2026-10-10.json)。

## 继续完整五组

V1-09继续解决完整Native／SDK正向运行及原运行恢复、真实模型／账户／费用、物理配额、历史容量；准备阶段取消不能以零请求／零账单推导零费用结清。V1-21继续真实Skill、Matt前置方法及默认入口全面约束。V1-22继续独立完整Matt评审、Superpowers当前源码的新鲜验证和真实行为。V1-10继续完整生产工作台运行与原操作恢复。V1-11继续真实普通Change到ReadyForDelivery、真实技能／中断恢复／S1验收及接入指南。

具体智谱模型、套餐、现金／积分上限仍待用户确认，确认前零付费；真实凭据仍在仓库外安全配置。正式Agent默认关闭，持续目标active，仅本地提交、不push。保护两个tmp和旧Unknown资源；新电脑找不到不是旧资源清理证据。
