# CimiLoop 计划前 Human 澄清与原请求接续

2026-10-10 D-251：本页以下为D-239原约定候选路径与格式1历史。当前服务另支持显式target=plan、新记录2的计划候选；不重新解释旧会话。新入口、大小上限和原候选恢复见[Human计划澄清与原候选恢复](CimiLoop-Human计划澄清与原候选恢复-v0.1.md)。真实Matt与全面前置证据约束继续。

2026-10-09，D-239，V1-21 / V1-10 续批。实际接通 Human 问答 → Kernel 约定候选的共享应用服务、CLI 与工作台页面。完整五组 S1 继续；本批没有实现真实 Matt 方法宿主，没有把普通旧入口改成全面强制澄清，也没有启用正式 Agent 执行。

## 实际行为

当前 Human 需求负责人可以在尚未产生任何 Plan 候选、正式 Plan 或 Task 的活动 Draft / IntentReady 需求上开始会话。记录原需求、业务背景和约束，再逐轮记录问题与回答。只允许回答当前会话的未解决问题；至少存在一项问题，且所有问题和候选约定的未决问题均已解决，才允许提交候选。

提交仍调用原 Kernel 的 SubmitContractProposal。该动作只生成约定候选；不确认约定、不创建 Plan / Task、不通过 Gate、不修改 Run 或结清费用。后续风险判断、Human 决定、确认约定和计划仍走原业务命令。已有计划 / 任务的需求只能核对原澄清历史，不能补记前置澄清。当前需求依据变化时拒绝新轮次；重新澄清须由 Human 明确创建新会话，不把旧回答搬成新证据。

共享服务位于 packages/local-app/src/clarification-local.ts。HTTP、CLI 和页面均复用该服务与同一 Kernel。调用者、Project 和数据目录来自已核验的本地 instance；请求不能指定 Actor、Role、数据库或运行凭据。

## 原件与恢复

对话原件单独保存在当前项目数据目录的 pre-plan-clarifications/originals.sqlite，私有格式1。项目业务库保持格式10，公共 Schema 仍为242；本批没有迁移用户项目库或创建新的业务权威。

会话保存创建时完整 Change 依据；每个动作保存固定 request_id、expected_head 和原输入。独立 SQLite 使用 FULL 同步、事务与追加记录，UPDATE / DELETE 触发器禁止应用修改原件，读取检查格式、结构、摘要与历史轮次。损坏或部分初始化记录保留并拒绝澄清操作；工作台需求详情仍显示Kernel领域事实，并明确标记澄清原记录待核对，不用坏会话遮住业务事实。这些检查不是机器 / 登录主体或账户费用保管链证明。

Human 问答在一个持久事务内完成，原身份查询和占位也在锁内；不同进程提交相同请求均读取同一原结果。不同内容复用身份拒绝。历史重放返回当时的轮次，而不是后来追加后的会话状态。

候选先登记完整原请求，再调用 Kernel，最后追加应用结果。若 Kernel 已提交而应用结果尚未保存，查询会显示原候选 pending；使用同一个 request_id、时间和正文接续，Kernel 原 Command ID 收据保证不会创建第二份候选。storage / internal / retryable 响应继续保留 pending，不能缓存为已处理结果。明确不可重试的 Kernel 拒绝保存原结果；工作台显示原错误并释放该已知拒绝的待核对请求。

缺失当前机器之外的原件不证明旧操作已清理。不要修改、删除、复制重建原账本来重试，更不能替换 request_id 规避待核对。若私有账本损坏，本批没有自动修复功能。

每会话最多64个动作，每需求最多32会话，全库最多512会话；输入正文和约束另有大小上限。列表返回有界摘要与最近完整会话，需求详情只附最近会话；历史完整原件通过独立 show 查询，保留原内容，不因列表大小裁剪或删除历史。这些局部容量限制不等于 V1-09 的完整物理配额 / 历史容量验收。

## 可以照着执行的接入步骤

先使用现有 CLI 初始化本地项目并录入普通需求；当前 instance 必须绑定该需求的 Human 负责人。使用尚未创建 Plan / Task 的 Change 内部 ID。以下 UUID 和时间为输入格式示意，实际操作请生成新内部 ID 和实际原时间；发送后保存原文件，重试时不要重新生成。

工作台启动：
~~~powershell
pnpm check
node apps/workbench/dist/bin.js --project-dir <项目目录>
~~~
从终端输出的本地引导地址建立会话，进入需求详情的“计划前 Human 澄清”。填写需求和背景，开始澄清，记录问题与回答，然后展开“从澄清提交约定候选”。候选出现后继续原人工确认流程。原候选或问答响应丢失时，页面会保留原请求；重新建立工作台会话后使用“按原请求核对”，不能另按一次“开始澄清”替代该未知请求。浏览器不能保存待核对请求时不会发送动作。

CLI 使用同一服务，可接续页面中的会话。开始请求文件：
~~~json
{
  "request_id": "019a1234-5678-7000-8000-000000000001",
  "requirement": "查询重试返回一致的业务结果",
  "background": "目前用户无法判断请求是否已提交",
  "constraints": ["兼容现有字段"]
}
~~~
~~~powershell
node apps/cli/dist/bin.js --json --project-dir <项目目录> clarification begin <change-id> --file <开始请求.json>
node apps/cli/dist/bin.js --json --project-dir <项目目录> clarification list <change-id>
node apps/cli/dist/bin.js --json --project-dir <项目目录> clarification show <change-id> <session-id>
~~~
问题与回答分别保存为原文件：
~~~json
{
  "request_id": "019a1234-5678-7000-8000-000000000002",
  "expected_head": 0,
  "kind": "question",
  "text": "哪些字段必须保留，怎样验收一致性？"
}
~~~
~~~json
{
  "request_id": "019a1234-5678-7000-8000-000000000003",
  "expected_head": 1,
  "kind": "answer",
  "question_id": "019a1234-5678-7000-8000-000000000002",
  "text": "保留原字段；同一请求的候选和事件只能出现一次。"
}
~~~
~~~powershell
node apps/cli/dist/bin.js --json --project-dir <项目目录> clarification advance <change-id> <session-id> --file <问题.json>
node apps/cli/dist/bin.js --json --project-dir <项目目录> clarification advance <change-id> <session-id> --file <回答.json>
~~~
候选请求使用 kind=candidate、当前 expected_head、固定 requested_at、原 request_id 以及完整现有 ContractBody 的 body 字段。可以使用工作台普通候选简表；复杂验收、知识影响或其他风险类别使用完整 JSON。它不会接受未解决问题，也不会自动批准正式约定。

HTTP 接口为 GET /api/changes/:change/clarifications、GET /api/changes/:change/clarifications/:session、POST 前述开始 / 动作路径。沿用本地工作台 session、Origin 和 CSRF 校验，不能绕过身份或从请求安装方法宿主。

## 验证与未完成条件

本批首次扩大回归为10文件 / 89项断言通过，但有1个未处理的浏览器夹具异步回调错误，进程退出1，不能计为完整通过。修正新增测试等待页面刷新完成后，最终受影响工作台5文件 / 42项全部通过、0跳过、退出0、0未处理错误；包含共享服务与编译CLI互操作、两个独立进程的开始 / 问答重放、原Kernel提交后丢响应 / 临时存储恢复、损坏原账本及合法大历史容量。

另单独复验受影响的实际 Windows/AppContainer/OpenCode SDK 原运行工作台控制场景：1项通过、退出0；同文件另4项被名称过滤，不计为通过或本批验收。模型和完整Agent资格仍为构造夹具，不计为真实模型 / 技能证据。346个最终源码 / 测试 / Native C# / 配置摘要在最终5文件复验和所选Native场景间零变化；首次回归与最终修补的源码差异和过程失败分开保存。pnpm check、编译CLI及clarification帮助、242 Schema / 项目库10核对通过；18文档UTF-8 / 围栏 / 本地文件链接及diff检查通过。这不是全仓库或完整S1验收。

本机实际 Git / SQLite / HTTP / 浏览器 DOM / CLI 路径验证，以及故障注入边界分别见[研究记录](../research/CimiLoop-计划前Human澄清与原请求接续-2026-10-09.json)。丢响应、临时存储结果与已占用原 ID 属受控故障注入；实际 Kernel 收据、独立进程、SQLite 事务、HTTP 和页面代码是真实执行。它们不是模型 / 技能 / 账户验收。

本批真实 Matt 方法宿主尚未安装。kind=matt 在任何调度或会话占位前返回 CAPABILITY_UNAVAILABLE，real_method_invocations 保持0；不会用当前需要 Task / Run 的 SkillInvocation 伪造“Plan 前”调用。后续必须接通真实固定方法、受信 Runtime / 模型 / 账户、独立原会话保管链和预算核对，并让 Kernel 的 Plan / Task 准入引用相应受控证据；涉及公共格式时先设计显式兼容迁移。

V1-22 的独立完整 Matt 评审、当前源码新鲜 Superpowers 验证与真实行为对照仍未执行。本批独立工程代码复核不计为这些方法证据。V1-09 / V1-10 正式 Runtime 和工作台 Agent 启动、领域结果 / 费用 / 配额 / 完整恢复，以及 V1-11 普通 Change 到 ReadyForDelivery 和 S1 验收继续实施。仅智谱提供方已确认；具体模型、套餐、现金 / 积分上限和本机仓库外安全连接仍为正式调用条件。没有付费请求或凭据读取。

[完整实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md) · [共享工作台](CimiLoop-本地工作台与共享应用服务-v0.1.md) · [真实方法的当前边界](CimiLoop-命名方法原始会话账本-v0.1.md)