# CimiLoop 证据、评价与安全集成 v0.1

> 日期：2026-10-04。V1-06 本阶段人工路径已实现：固定 Git 源码、人工原始证据、自检 / 独立人工评价、任务满足、批准条件逐项核验、证据失效处置及普通 / 高风险安全集成。V1-07已接通Human预算预约和交接恢复，见[运行操作说明](CimiLoop运行预约与交接恢复-v0.1.md)；真实 Agent Run / 会话隔离仍在 V1-09。

当前字段、命令与实施顺序见 [V1 实施基线](CimiLoop-V1可执行设计与实施计划-v0.1.md)。既有授权见 [任务、授权与预算](CimiLoop任务授权与预算-v0.1.md)，数据库操作见 [迁移与恢复](CimiLoop-M0数据库迁移与恢复-v0.1.md)。

## 已实现的校验链

1. 技术责任人固定当前项目真实 Git commit。宿主读取 commit、全部 tree / blob，校验 Git 对象身份，再计算完整源码的 SHA-256；可变分支名、目录内容声明及虚构摘要不能替代快照。
2. 获得有效 Ready WorkItem 的绑定 Human 执行者提交具名人工报告。CLI 将原始字节保存到 `objects/<sha256>`；Kernel 经可信宿主端口读取、严格解析并核对生产者、源码摘要、观察时间和断言。报告不能录入未来观察，也不能重复断言 key。
3. Kernel 根据当前固定 TaskDefinition、Contract、Plan 和 `verification/1.0.0` 生成 PolicySnapshot / RequirementSetRecord。必需项包括任务目标、输出、约定约束、任务证据要求、所覆盖的验收场景及验收证据要求。独立验证增加 `safe_integration`；Bugfix 另外要求原始复现条件及当前源码回归结论。
4. `EvaluateTask` 读取全部适用原始证据并计算结果，调用方不能直接提交 ALLOW。新增证据、适用专业处置、定义、授权或基准变化使旧输入摘要失效。必需结论缺失或未知返回 NEED_MORE_EVIDENCE；反证返回 DENY；同一必需结论正反冲突返回 REQUIRE_HUMAN。后来补充的支持不能覆盖反证或未知。
5. 技术责任人的 `SatisfyTask` 再次核对实际 ALLOW、原始文件和当前输入；原子追加满足事实、更新 Task、关闭 WorkItem、清除活动关联，并写事件、Outbox 和回执。依赖任务必须有匹配的原生评价及满足记录，单独修改 Satisfied 标签不能解锁后继任务。
6. `EvaluateIntegration` 生成需求的安全集成评价。当前计划的实施 / 验证任务必须对同一源码满足，存在独立 safe_integration 结论，必要反证 / 未知及未关闭授权 / 在途未知均阻塞。高风险在这些检查通过后，还须独立 Human 质量责任人的精确专业批准。记录成功仅表示评价已保存。
7. 技术责任人的 `MarkReadyForIntegration` 消费真实 ALLOW 和精确摘要，重新求值，并核对当前 HEAD 与快照一致、工作区无受 Git 跟踪的修改或未忽略的新文件。全部满足后，追加 IntegrationReadinessRecord 与生命周期事实，Executing→ReadyForDelivery。它不执行 Git merge、不发布，也不完成需求；待交付仍占 WIP。

人工报告是具名人工观察，不是机器自动测试或 Agent 运行证明。报告中每项 `observation` 必须说明实际检查及依据；不能按需求集模板批量填写支持来冒充真实验证。当前校验器验证记录、字节摘要与适用性，不自动判断自然语言陈述是否属实。自动检查要求仍需要真实原始输出及后续受控运行路径，文档示例和测试夹具不替代业务证据。

## 独立人工评价的边界

独立任务只能获得只读资源授权，执行者须是当前项目登记、由可信 Caller 绑定的另一位 Human，且未获得同需求实施任务授权。`PrepareTaskEvaluation` 生成不可变 EvaluationContext，仅记录固定源码、约定 / 计划 / 定义引用、需求集、评价者、只读范围与输入摘要，不装入实施会话完整推理或自检结论正文。

该记录描述本批人工评价的最小交接边界。当前没有真实 Agent 会话启动或隔离，登记另一 Agent、改变 Actor ID 或填写 context_ref 都不能获得独立运行证明；Agent 提交这条人工路径会被拒绝。Solo CLI 绑定 `instance.json` 的本地操作者，没有切换 Human 登录的产品入口；测试中另一个 Human 由测试宿主分别绑定 Caller，不能将该夹具当作已实现多人登录。

## 固定策略与四种结果

| 结果 | 本批含义 | 状态推进 |
|---|---|---|
| ALLOW | 当前必需证据与适用性全部满足 | 仍须由有权 Human 执行 SatisfyTask / MarkReadyForIntegration 并重新核对 |
| NEED_MORE_EVIDENCE | 缺少支持、必要结论未知、任务未满足或仍有未关闭授权 / 未知用量 | 不推进 |
| REQUIRE_HUMAN | 任务正反证据冲突，或其他集成检查通过后仍缺少有效的 high 风险专业批准 | 先补适用处置 / 专业决定，再重新求值；不能直接覆盖为通过 |
| DENY | 必需反证，或延期安排违反当前计划及硬约束 | 不推进 |

本批实现 Feature / Bugfix 固定规则，未实现 Incident Profile、通用规则编程器、降低风险决定或例外豁免。Contract / Plan 的条件通过下述专业复核路径逐项核验。Incident、策略装配及例外由后续专门任务接通；普通报告不替代真正的自动测试输出。

## 专业决定、条件核验与证据处置

复用不可变 `DecisionRequest / Decision` 及既有 `RequestDecision / RecordDecision`，固定策略为 `professional-review/1.0.0`。`target_ref / proposal_ref` 始终是精确 Contract 或 Plan 候选，另以 `professional_subject_ref` 固定被复核的评价、原批准或证据。请求和决定只追加事实，Change Revision 不增加；请求默认有效 15 分钟，最长 24 小时。实际决定者由可信 Caller 绑定，不能通过 Actor 字段冒名。

| action | professional_subject_ref | 决定者与依据 | 应用方式 |
|---|---|---|---|
| `verify_decision_conditions` | 原批准 `decision` | 原批准人及原请求所需的当前有效职责；原候选 / 确认请求仍有效 | 每项条件序号、原文与实际观察匹配，覆盖全部条件且没有否定或未知结论；Confirm 重新读取原始报告，正式版本保存 `condition_verification_refs`，后续准入核对历史事实 |
| `invalidate_evidence` | 原始 `evidence` | 独立 Human `quality_owner`；不得是原证据或纠正证据的生产者，也不得获得过同需求实施授权 | 指出具体失效断言和方法 / 观察 / 适用性缺陷，附同任务、同定义、同约定 / 计划、同源码快照的实际支持性纠正证据；只排除批准处置的断言，重新生成 Task / Gate 评价 |
| `confirm_integration` | 原生 `safe_integration` 评价 | 独立 Human `quality_owner`；不得是该评价生产者或获得过同需求实施授权的人 | 仅受理本需求当前输入下、全部必要检查通过且仅待 high 风险决定的 REQUIRE_HUMAN；专业报告须支持安全集成，重新 EvaluateIntegration 后再 MarkReadyForIntegration |

专业批准必须附内容寻址的 `manual_review` 原始报告，核对固定请求摘要、实际生产者、报告类型、UTC 观察时间与报告字节；观察时间须在本请求创建后、记录决定之前。拒绝或要求修改可以只记录意见，不能隐式授权动作；专业决定不接受新增批准条件，有条件意见须使用 `request_changes`。

条件报告可逐项补齐；每个请求只能作一次决定。原批准存在否定或未知的条件报告时，后来支持报告不能覆盖它，应修正候选并重新取得批准。专业集成存在同输入的否定意见时，旧批准不能放行；证据失效处置被后续专业意见否定时，原断言恢复适用，旧 ALLOW 失效。源码、任务 / 授权、证据库存及处置变化均重新核对；集成决定过期、质量指派结束或原报告缺失会阻止应用。

原证据、报告和决定均保留，不删除反证，不对正反证据多数表决，不把“接受风险”当作失效理由。Task 评价保存 `disposition_refs`，高风险集成评价保存 `professional_decision_ref`，输入摘要包含实际消费的专业依据。专业处置不能代替缺失支持、未知用量、独立验证、safe_integration 或延期安排的硬检查。修复真实源码问题仍需新的源码与实际证据；在途修复 / 接续由 V1-07 衔接。

这是具名人工判断的受控记录。系统验证身份、依据、字节与适用性，不自动判断自然语言是否真实，也没有提供第二位 Human 登录的产品入口。条件复核核对确认前的批准条件，不提供通用机器条件表达式或持续监控。

## 待验证交接

集成评价中的 `deferred_checks` 必须与已确认 Plan 的延期检查一一对应，不能临时扩大延期范围。每项记录验收 key、相同的原因 / 完成阶段、真实项目 Human 责任人、test / production 环境、未来 UTC 检查时点及检查方法。推进时再次核对期限，并把安排固定到 IntegrationReadinessRecord。

这类交接承接后续环境中的补充检查，不替代当前必需的实施结果、独立评价及 safe_integration。不能把必要失败、关键未知或安全合入检查写成延期来放行。共享测试 / 生产实际检查、交接完成与关闭义务由后续交付任务实现。

## CLI

全部命令经同一 Kernel 校验，支持 `--json`、`--command-id`、`--expected-revision`。普通入口不会切换绑定身份；声明 `--acting-role` 也不会获得不存在的资格。

| 命令 | target | payload 文件 | 默认容量 |
|---|---|---|---|
| `verification capture-source` | Change ID / key | `commit_id`，完整固定 Git ID | technical_owner |
| `verification record-evidence` | Task ID | `source_snapshot_ref, raw_result_ref`；使用 `--raw-file` 时 CLI 导入并补入 raw_result_ref | executor |
| `verification prepare-task` | Task ID | `source_snapshot_ref` | executor |
| `verification evaluate-task` | Task ID | `requirement_set_ref, context_ref?（独立评价必需）, input_digest` | executor |
| `verification satisfy-task` | Task ID | `evaluation_ref` | technical_owner |
| `verification evaluate-integration` | Change ID / key | `source_snapshot_ref, deferred_checks[]` | technical_owner |
| `verification mark-ready` | Change ID / key | `evaluation_ref, input_digest, reason` | technical_owner |
| `verification show` | Change ID / key | 无 | 只读 |

示意调用：

```powershell
pnpm cimiloop --json verification capture-source CHG-0001 --file source.json
pnpm cimiloop --json verification prepare-task <Task-ID> --file task-source.json
pnpm cimiloop --json verification record-evidence <Task-ID> --file task-source.json --raw-file actual-manual-report.json
# 新证据改变摘要，记录后重新准备，再消费新的需求集及摘要。
pnpm cimiloop --json verification prepare-task <Task-ID> --file task-source.json
pnpm cimiloop --json verification evaluate-task <Task-ID> --file current-evaluation-input.json
pnpm cimiloop --json verification satisfy-task <Task-ID> --file applicable-allow-evaluation.json
pnpm cimiloop --json verification evaluate-integration CHG-0001 --file integration-input.json
pnpm cimiloop --json verification mark-ready CHG-0001 --file current-allow-gate.json
pnpm cimiloop --json verification show CHG-0001
```

原始人工报告的严格结构：

```json
{
  "format": "cimiloop/manual-evidence/1.0.0",
  "producer_actor_id": "实际绑定Human的UUID",
  "observed_at": "实际观察UTC时间",
  "source_digest": { "algorithm": "sha256", "value": "实际SourceSnapshot的64位摘要" },
  "method": "实际检查方法与所读内容",
  "claims": [{
    "key": "需求集实际key",
    "description": "需求集对应description",
    "result": "inconclusive",
    "observation": "说明实际发现、缺口及原始依据；核对后才据事实改变结果"
  }]
}
```

专业复核示意调用：

```powershell
pnpm cimiloop --json decision request CHG-0001 --action verify_decision_conditions --proposal-kind contract_proposal --proposal-id <候选ID> --proposal-revision <修订> --subject-kind decision --subject-id <原批准ID>
pnpm cimiloop --json decision record CHG-0001 --request-id <复核请求ID> --input-digest <请求SHA256> --choice approve --reason "实际核验依据" --raw-file actual-condition-review.json
# Plan 条件使用 --proposal-kind plan_proposal；集成 / 证据处置分别使用 evaluation / evidence。
pnpm cimiloop --json decision request CHG-0001 --action confirm_integration --proposal-id <当前Contract候选ID> --proposal-revision <修订> --subject-kind evaluation --subject-id <高风险待决定评价ID>
```

原始专业报告固定格式为 `cimiloop/manual-review/1.0.0`，包含 `producer_actor_id, observed_at, request_input_digest, method, finding`。`finding.kind` 分别为 `condition_verification`（`results[{condition_index,condition,result,observation}]`）、`evidence_invalidation`（`claim_keys, defect, analysis, correction_evidence_refs`）和 `integration_review`（`result, observation`）；严格结构见导出的 RawProfessionalReview Schema。`defect` 仅允许 `wrong_method / wrong_observation / inapplicable_assertion`。导入报告不代表专业批准，且不能借 `--acting-role` 取得未授予的职责。

上例占位内容不能直接通过 Schema；每个断言依据事实选择 supports / refutes / inconclusive。文件上限 8 MiB；内容寻址存储拒绝摘要不符、路径逃逸及文件 / objects 目录符号链接。失败命令可能留下已导入的原始内容文件，但不会部分提交领域事实。

## 存储、可靠性与后续

V1-06当时数据库格式 6 增加不可变 `verification_records`；当前V1-07格式7新增运行表，保留协议 2.0.0。本批专业路径扩展既有决定记录与可选评价 / 版本依据引用，不增加审批表、不自动升级数据库；旧普通路径没有专业依据时保留原输入摘要的计算结构。格式 1 / 2 / 3 / 4 / 5 必须显式迁移；格式 5 除既有预检查外，核对任务 / 定义、常规授权前驱、WorkItem 创建 / 撤销、实际当前状态与不可变事件 / 回执一致性。升级只安装缺少的表，不补造源码、证据、评价或满足结论；未升级用户现有库。

Kernel 不依赖文件系统或 Git；`EvidenceVerifierPort` 只由可信宿主注入，命令不能自带核验器。CLI 的 LocalEvidenceVerifier 在读证据 / 求值 / 状态推进时重复核对外部内容。跨文件 / Git 与数据库没有分布式事务：操作者应让验证源码及原始内容保持静止，当前没有工作区租约；V1-07已接通Human运行控制、工作区保存及恢复，真实Runtime权限隔离仍在V1-09。Git 子模块需要另外固定来源，当前拒绝；普通目录项目尚无源码快照 Adapter；Git 忽略内容、运行依赖及外部环境不由源码 commit 完整覆盖，后续 Context / Run 仍须固定这些输入。

测试覆盖真实临时 Git / 原始报告、独立 Human、缺失 / 摘要不符 / 身份 / 时间拒绝、反证 / 未知 / 冲突、摘要失效、脏工作区 / HEAD 变化、延期到期、故障回滚、实际双进程 Task CAS、CLI 原回执重放、格式 5 历史保留与四处迁移回滚；另覆盖 Contract / Plan 条件逐项补齐、否定 / 未知及原报告篡改、高风险独立职责 / 过期 / 撤销、专业否定意见、纠正依据和处置失效、专业决定事务回滚以及真实条件复核 CLI。它们验证工程协议和控制路径，不代表团队真实需求演练、真实 Agent 修改、技能调用或生产验证已经执行。

V1-06 本阶段人工路径及V1-07 Human运行控制 / 交接恢复已完成，下一步完善V1-08 CLI，再接V1-09真实Runtime及隔离。Matt / Superpowers 包装及试点仍在 S1，不等待全部 CimiLoop 完成；OpenSpec 可选，ECC 按需参考。

V1-07后续规则：确定结束且结清用量的Human Run将原活动WorkItem返回Ready，Task仍为InProgress。最后允许尝试已完成时，可继续证据评价及满足核验；这不增加预约额度。Run报告本身不代替人工证据或ALLOW，未知 / 冲突仍阻止评价与集成。暂停期间可固定源码用于接续核对，任务证据 / 评价仍要求Active Executing。
