# CimiLoop 原 Skill 取消终态与费用核对 v0.1

2026-10-12，D-278，基线655ee7cfb18f99a6f776f0684d005f62992c7eb5。接续 [D-277 工作台原操作控制](CimiLoop-原Skill工作台控制与恢复-v0.1.md)，本批把已执行且全部模型请求闭合的原 Skill 取消接到独立核验、历史资格、最终账单、共享 Human、工作台 HTTP 和 Kernel。五组持续目标保持 active，尚未完成；正式默认 Agent 入口仍关闭。

## 实际能力

原父 Run 已由 Kernel 登记取消、同一原子调用确有 Native 取消130和可信 OS 停止/处置、实际 SDK 与原 IPC/模型请求全部闭合，并且预约固定历史资格与最终现金/积分账单均可独立复验时，Human 可提交原 ReconcileSkillInvocation。Kernel 只对同一原 Skill 子调用登记 Cancelled，不产生 Skill 输出，不重开 Run，不重复发送模型。父 Run、其余子调用、父子完整账单和任务验收仍须分别核对；子 Cancelled 不自动释放父预算，也不接受 Task。

无调用、挂起阶段取消、未决模型发送、截断或冲突 SDK 记录、缺历史资格、缺最终账单及原件丢失均不能走本批正向路径。目录缺失、unclaimed 或新电脑找不到旧进程不能证明 NotStarted 或零费用；这些保持 Unknown。物理停止不替代原取消、领域状态、费用结清或 S1 验收。

## 独立核验与兼容

新只读入口 readAgentRuntimeNamedMethodCancellation 使用同一原 scope、出生和派发 ticket、cfg6、原二进制及启动器、固定模型/工具/账户关系、材料清单、原 owner、marker、nonce、phase、130 与清理原件。collectAgentRuntimeOperation 的物理查询须来自受信代码，HTTP 不能上传一个自称 Stopped 的 collection。每个采集原件的 provider、resource、版本、摘要与 blob 定位均核对，随后由原 Native 取消读者独立再验。

原模型、方法及认证 IPC 的请求/响应必须逐项匹配且完全闭合，实际 SDK 工具身份、输入、输出与原调用相符。取消允许未访问完材料、没有方法输出及最后一个 SDK 步骤尚未结束；禁止先 stop 再出现后续步骤。之前步骤必须以 tool-calls 结束，不能把取消日志补成方法成功。复读原件、scope 和摘要后才返回 Observed；入口本身不产生领域观测、账单或准入。

LocalSkillInvocationResultCollection 保留原同步成功/失败接口，新增 captureHumanReconciliation 选择入口及异步 captureCancellationReconciliation。取消前必须有 Kernel 原父 Run cancel_requested，采集后再核身份、location、原关系和取消；资格只用预约固定的历史资格，账单只用安装的原 DedicatedAgentAccountLedger 和独立原账单认证。token usage、余额和模型自报不作为账单。

内部新增 cimiloop/original-named-cancellation/1.0.0 与 cimiloop/original-skill-cancelled-reconciliation/1.0.0。取消 proof 固定 completion_proven=false，没有 output；readResult 在 Kernel 读者内对同一原 collection 两次重核事实，逐字比较保存副本及原件，重验全部调用、原资格、账单、当前取消及原未知观测集合。序列化布尔值不能替代这些核验。

取消核验额外容纳 marker、取消证明及 incomplete 三份各至多64KiB记录；stderr使用原结果大记录额度。原 Job 额外额度单独保留，成功/失败的旧容量不变。proof仍最多8MiB、100000节点、64层且须规范JSON。242公开 Schema、用户数据库格式10及旧原件/旧命令语义不变，不自动迁移用户库。物理磁盘硬配额和完整历史容量尚未验收。

## 工作台接入与操作

共享入口仍为 POST /api/skill-invocations/:id/reconcile-original。它复用已有 Human 会话、Origin/Host/CSRF 和当前 technical_owner 权限；不得上传 raw_result_ref、root、scope、pid、账户、账单、资格或终态。请求字段如下，同一重试沿用原 command_id、requested_at 和 expected_revision：

~~~json
{
  "command_id": "原请求的内部ID",
  "requested_at": "原请求时间",
  "acting_role": "technical_owner",
  "command_type": "ReconcileSkillInvocation",
  "target": {"object_type": "run", "id": "原父Run内部ID"},
  "expected_revision": 3,
  "payload": {"invocation_ref": {"object_type": "skill_invocation", "id": "原Skill内部ID"}}
}
~~~

示例ID只是字段说明，须用项目原记录中的有效内部ID和当前首次提交时固定的Run修订号。代码接线使用 skillReconciliationForInvocation 返回原 LocalSkillInvocationResultCollection 与 release；collector使用同一可信 local、LocalSkillInvocationStartCustody、LocalSkillMethodInputs、原账户句柄和历史资格核验端口。取消采集工厂不创建模型/账户批准、不记录新账单、不补历史原件；缺工厂或条件不足时拒绝核对并保留 Unknown 和预算。可结合 [原成功终态接线](CimiLoop-原Skill终态与历史资格核对-v0.1.md) 及 [工作台控制接线](CimiLoop-原Skill工作台控制与恢复-v0.1.md)。

1. 从项目任务的固定 Skill 调用获取原 id、父 Run 和请求身份；确认可信 Host 原登记、原账户与资格核验端口可打开。
2. 通过原 Skill /stop 提交原父 Run CancelRun，再查询/采集或重试 /cancel；需要时 /recover 只回收同一原资源，不恢复 SDK 或模型执行。
3. 在原请求全部闭合且最终账单到达后，用原 Human 核对入口登记子 Cancelled；无账单或有未决发送时保留原请求和预算。
4. 响应丢失、释放失败或重启后重放同一核对命令。已提交回执无需 collector 工厂即可重放；未提交 prepared 仍须原证据完整再验，不能另开 Run。不得根据409/403猜测是否已提交。
5. 检查子 Cancelled、无 output、原费用和 Kernel 事件，再单独查看父 Run/预算/任务，不能把子状态当作父结清或任务完成。

共享服务在 guard、租约工厂、异步采集、准备/提交及 release 后检查完整 location/instance/原调用关系。异步采集期间发生位置漂移必须在 prepared 保存前拒绝；提交后释放失败或漂移只拒绝响应，已提交的原 Kernel 回执保持，恢复可信上下文后同命令可重放。私有错误不泄露，租约释放一次。

## 实际 Windows 与证据范围

新取消场景使用实际 Windows AppContainer/Job、固定 SDK named tools、认证原 IPC、真实 Kernel/SQLite、共享工作台 HTTP 与重启后同命令重放。受控 TLS 夹具先完成原入口调用，再持久保存最后文本 stop 回复，Kernel 请求原父取消并向同一原 child 写取消。两次原 child 模型请求已闭合，Native退出130、OS停止/处置及 SDK 原历史独立通过；缺最终账单先拒绝，补到认证构造账单后子 Cancelled。构造费用24现金微单位、8积分微单位；父 Unknown、预约未释放，Task仍待核对，没有新 Run 或新发送。

模型回复、公开夹具密钥、模型/账户批准、资格材料/核验器和账单认证均为构造。实际OS/SDK/IPC/HTTP/Kernel行为与构造模型/资格/账单明确分开；不是实际智谱模型、真实Skill、Matt独立完整评审、Superpowers新鲜验证或S1证据。本批普通工程独立复审无剩余必修项，复审者未运行Native测试。

最终受影响16文件187项通过；实际Windows7文件15项通过，均0跳过、单轮完整范围通过，713源码完整验证前后无变化，r24 pnpm check和CLI帮助通过，242 Schema/库10保持。不是全仓库回归或完整S1验收。最终范围、日志摘要、失败、复验及源码冻结记录见 [D-278研究记录](../research/CimiLoop-original-skill-cancellation-2026-10-12.json)。先前D-277首次Job控制器失败根因仍未证明，本批通过不能改写其历史失败或声称已修复。所有新场景用新原操作；旧失败原件、日志、Unknown资源及两个用户TMP保留，未重开或批量清理。

## 后续完整目标

V1-09继续无调用/NotStarted的独占零效果证明、完整父子终态与最终结清、正式Runtime准入、完整历史容量、磁盘硬配额及所有异常恢复。V1-21仍需真实Skill和Plan/Task创建前Human/Matt；V1-22仍需Matt独立完整评审、当前源码的新鲜Superpowers及真实行为对照。V1-10继续正式Agent执行/查询/停止/原操作恢复，V1-11继续真实普通Change至ReadyForDelivery、真实技能、中断恢复、S1验收和接入指南。具体模型、套餐、现金币种/上限及积分上限尚待用户确认；确认前不读真实凭据、不发付费请求。默认不push。
