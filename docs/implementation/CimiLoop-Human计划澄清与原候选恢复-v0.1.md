# CimiLoop Human 计划澄清与原候选恢复 v0.1

> D-251；V1-21 / V1-10 续批。完整五组 S1 目标 active，正式默认 Agent 入口关闭。

## 实际执行路径

已有真实当前正式约定、且尚无 Plan 候选 / 版本或 Task 的需求，现在可以通过同一 LocalPrePlanClarification 开始显式 target=plan 会话。Human 负责人记录实施边界、问题与回答；至少一项问题且全部已回答后，以 plan_candidate 提交现有 PlanBody，包含任务定义。原 Kernel SubmitPlanProposal 生成唯一计划候选，仍须后续人工决定与 ConfirmPlan；本步不创建正式 Plan、Task、WorkItem 或 Run，不推进验收或结清费用。

CLI 和工作台既有 HTTP 路径复用该共享服务。调用者、Project、数据目录来自核验过的本地 instance。Human 负责人入口规则保持；实际计划提交仍由 Kernel 新鲜核对 technical_owner，问答不会授予角色。撤销技术负责人权限后的原请求记录 Kernel 明确拒绝，重放原拒绝而不生成计划。

会话冻结完整 Change 和当前 Contract 引用。新轮次重新核对同一依据、真实正式约定及 Plan / Task 尚不存在；阶段错配或外来 Contract 在预约前拒绝。正式约定变化、暂停、既有计划 / 任务不能补记前置澄清。历史开始 / 问答和已登记的 pending 候选允许按原身份核对，不能因 Kernel 已生成候选而禁止读取原结果。

## 原件、容量与兼容

原候选先按 request_id / expected_head / 原时间与完整输入持久登记，再调用 Kernel，最后追加应用结果。Kernel 提交后响应丢失时，原候选仍 pending；重新打开服务并提交同一原请求，复用同一 Kernel 收据，不生成第二个候选或事件。浏览器在发送前保存包含所有任务 ID 的完整原请求；丢响应后点击“按原请求核对”，不重新生成任务 ID / 候选 ID。

新计划会话 basis 使用 cimiloop/pre-plan-clarification/2.0.0，仅接受显式 target=plan；原约定会话仍精确读取格式1，不把原来无 target 的会话重新解释为计划，不重写任何旧行 / 字节 / 摘要。两个格式沿同一既有独立账本读取；SQLite DDL / user_version1、项目数据库格式10、242 Schema 保持。旧程序不认识新格式2时拒绝，不能降级或删除新会话。没有用户库迁移或自动升级。

原开始 / basis / 每个请求仍最多128KiB；新 plan_candidate 的完整结果单独最多1MiB，读取和写入使用相同上限并核对原种类、格式及 Contract，包括 pending。实际 Kernel 成功结果包含原 proposal.body 与 Change，不能把原请求和完整回执的重复正文压到旧128KiB结果上限。格式1结果规则保持；不宣称旧大结果历史已自动修复。

512会话、每需求32会话、每会话64动作与既有 SQLite 页面上限保持。新结果上限是有界序列化能力，不等于磁盘 / WAL / 临时数据硬配额或账户预算。资料损坏、容量 / 存储未知时保留原件和 pending，不改 ID、不重开 Run；完整物理配额与历史恢复继续。

## 可以照着执行

先沿既有人工流程确认当前约定。工作台进入需求详情，填写“计划前 Human 澄清”，点击“开始计划澄清”，记录问题及回答，然后展开“从澄清提交计划候选”。普通表单填写实施方案、实施 / 独立验证目标、产物、允许修改范围、验证方法及证据。生成一个实施任务定义和一个依赖它的独立验证定义，覆盖当前约定验收项；复杂依赖 / 知识影响使用现有 CLI 完整 PlanBody。输入只是候选计划，不构成已执行的 Matt / Superpowers 方法。

CLI 使用既有 clarification begin / advance --file。开始 JSON 保留 request_id、requirement、background、constraints，新增 target="plan"。问答仍为 question / answer。提交 JSON 使用 kind="plan_candidate"、原 request_id、当前 expected_head、原 requested_at 和完整现有 PlanBody 的 body，contract_ref 必须是该会话固定的正式约定。保存原文件，响应丢失时重复提交同一文件；不要重新生成 ID 或原时间。具体命令与旧问答示例见[原入口指南](CimiLoop-计划前Human澄清与原请求接续-v0.1.md)。

## 验证与未完成条件

最终受影响6文件51项全部通过、0跳过，新增9项；pnpm check、CLI澄清帮助通过，614源码文件前后零漂移。

新增路径先红后绿：旧服务6项失败，旧浏览器入口在服务6项通过后仍1项失败；容量反例在实际大中文计划提交后证明旧结果不能保存，修补后原请求恢复成功。测试实际执行 SQLite / Kernel / HTTP / 编译 CLI 与 jsdom 浏览器 DOM，Human 角色、需求文本与故障为明确构造输入，不作为用户实际验收、真实方法或模型证据。完整阶段与最终源码见[研究记录](../research/CimiLoop-Human计划澄清与原候选恢复-2026-10-10.json)。

真实 Matt 调用仍不可用，没有占位或伪造 SkillInvocation。其他直接 Kernel / CLI 入口的全面 Human / Matt 前置证据约束、真实 Skill、独立完整评审、新鲜 Superpowers 行为验证仍须完成。本批未运行或覆盖 D-250 的实际 Bun / CLR / clock 失败，也未清理历史 Unknown 原件；不把 Human 计划测试通过算成正式生产 Runtime 或 S1 验收。

V1-09 模型 / 账户 / 原预算账单、正式领域核验、物理配额与完整恢复，V1-10 正式 Agent 执行和原接续，V1-11 真实普通 Change 至 ReadyForDelivery 与完整接入指南继续。智谱仅提供方确认，具体模型、套餐、现金 / 积分上限待批准；付费调用和真实凭据读取0。
