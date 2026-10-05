# CimiLoop 约定、计划确认与开工 v0.1

> 2026-10-04：V1-04 已实现。原生 Contract / Plan 候选、风险判断、精确决定、正式版本及 StartChange 正向准入已接通 Protocol、Store、Kernel 与 CLI。V1-05 已实现 Task、WorkItem、授权与预算准入，详见[操作说明](CimiLoop任务授权与预算-v0.1.md)；V1-06 本阶段人工证据、专业复核与条件核验已实现，V1-07已接通Human运行控制及交接恢复，下一步完善V1-08 CLI，再接V1-09真实Runtime；开工不表示 Runtime 已启动。

当前开发依据为 [V1 可执行设计与实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)。身份与指派见 [责任治理](CimiLoop责任治理与身份入口-v0.1.md)，设置和容量见 [项目设置、规划与容量](CimiLoop项目设置规划与容量-v0.1.md)，格式升级见 [迁移操作说明](CimiLoop-M0数据库迁移与恢复-v0.1.md)。

## 候选、决定与正式版本

候选可以修改，但每次提交都追加新的不可变记录。`proposal_id` 是候选链 ID，`id` 是本次修订的记录 ID，`proposal_revision` 是链内修订号；决定固定的是记录 ID、修订号和内容摘要。新链从修订 1 开始；修订旧链须给出当前链 ID 和 `expected_proposal_revision`，不覆盖旧内容。只允许当前最新候选进入确认。

每次提交还固定当前正式 `base_version_ref`，首次为 null。Plan Body 必须引用本条 Change 的真实当前 Contract。提交候选会增加 Change Revision，使旧请求失效；规划、责任或正式基准变化同样要求重新请求决定。

`RequestDecision` 保存精确候选、Change Revision、当前 Contract / Plan、需求负责人、风险引用、确认规则版本及输入摘要。默认期限 15 分钟，可显式指定未来 UTC 时间，最长 24 小时。`RecordDecision` 只能记录 approve / request_changes / reject，不能推进位置或切换版本；拒绝不取消需求。每个请求只能作一次决定，调整意见须新建请求。

`ConfirmContract` / `ConfirmPlan` 再次核验当前输入、期限、实际决定者及有效指派。成功后追加正式版本、切换当前指针、增加 Change Revision，并将事件、Outbox 和成功 Receipt 一起提交。风险判断、请求和决定只追加事实，不增加 Change Revision；它们仍固定提交时的 Revision。

首次确认 Contract 将 Draft 推进到 IntentReady，追加生命周期事实；Plan 确认不改变位置。新 Contract 会清除当前 Plan 指针，旧计划及全部历史仍保留，须重新确认符合新约定的计划。有条件批准保存原条件；V1-06 已接通原批准人的逐项具名核验，未覆盖全部条件、仍有否定 / 未知或原始报告无法核实时返回 EVIDENCE_MISSING。确认时重新核对原报告，并在正式版本中保存 condition_verification_refs；操作见[证据、评价与安全集成](CimiLoop证据评价与安全集成-v0.1.md)。

请求过期或指派在正式确认后结束，不抹去已经确认的版本。期限限制尚未应用的批准，开工仍核对固定确认事实及当前准入条件。既有业务回执重放不重新生成批准或续期。

## 责任与风险

| 动作 | 当前要求 |
|---|---|
| 提交 Contract、请求 Contract 决定 | 当前 Human Change Owner，精确 Change 指派 |
| 风险判断 | 当前 Human Technical Owner，当前项目或本条 Change 指派；判断绑定精确 Contract 候选 |
| 决定及确认 Contract | 当前 Human Requirement Owner，指针与本条指派一致 |
| 提交 Plan、请求 Plan 决定 | 当前 Human Technical Owner |
| 决定及确认 Plan | 当前 Human Technical Owner |
| StartChange | 设置指定的当前 Human Flow Owner，项目指派有效 |

同人可兼任普通风险的不同责任，但须分别记录角色和指派。权限、重要数据、关键兼容影响自动要求 high；不能用候选的 ordinary 声明降低这个下限。已有 high 判断也不能自行降级，专业降低风险决定留待后续实现。

high Contract 的决定者须与风险判断者为不同的实际 Human；high Plan 的决定者须与计划候选提交者为不同的实际 Human。Kernel 在记录决定和正式确认时均检查独立性。登记另一位 Human 或建立其指派不构成本人批准。当前 Solo CLI 绑定初始化操作者，不能选择另一位 Human 代签；缺少第二位受信入口绑定的实际调用时保持阻塞。自动化测试通过分别绑定两个真实登记 Actor 的测试入口验证这条路径，未提供多人登录产品入口。

确认规则当前固定为 `intent-confirmation/1.0.0`，并进入输入摘要。V1-06 另以固定 professional-review/1.0.0 核验条件和专业决定；完整策略版本、通用条件表达式及例外机制由后续任务实现；项目设置的任意 policy_ref 仍不能作为已批准策略。

## Body 与计划检查

Contract Body 包含 goal、scope、non_goals、constraints、acceptance_criteria、delivery_endpoint、knowledge_impact、risk、unresolved_questions。验收项有唯一稳定 key、场景、预期和至少一项证据要求；知识影响有唯一 key、说明和必需完成时点。候选可保留问题，正式确认前必须解决；交付终点固定为 production_verified。

Plan Body 包含真实 contract_ref、approach、task_definitions、dependencies 和 verification_strategy。TaskDefinition 固定 task_id / version、Change scope、工作目的、输入输出、任务依赖、允许修改边界、验证方法及模式、验收覆盖、证据要求、知识 key、关闭时点和影响目标。

确认前检查：任务 ID 唯一、作用域一致、依赖指向同计划任务、DAG 无环；至少有有界实施任务及独立验证安排；每项验收均须由独立验证任务覆盖，不能引用未知 key，也不能以自检加一个无验收项的独立任务凑齐条件。每项知识影响须有 knowledge / synchronization 任务和匹配的关闭时点；延期检查须说明验收项、原因、安排和有效完成时点。同一 task_id / version 在不同正式计划中内容不可改变，修改定义须增加任务定义版本。

跨需求依赖固定同项目另一条 Change 的真实当前 Contract 和 required_state（ready_for_delivery / completed），依赖图不得有环。确认 Plan 可以先保留尚未满足的依赖；StartChange 再核对真实当前条件，不能用文件存在或旧引用代替依赖已交付。

当前 TaskDefinition 嵌入不可变 Plan Body，尚无运行 Task 或 WorkItem。独立验证安排也不表示独立验证结果已产生，知识义务尚未完成；运行和阶段关闭时的实际求值在后续任务接通。

## 开工与修订边界

StartChange 在同一 SQLite 写事务内核对可信身份、指定协调人、Change CAS、Active IntentReady、真实当前 Contract / Plan、完整确认链、内容摘要、风险、计划结构及实际依赖，然后检查并消耗在制容量。成功进入 Executing，追加生命周期记录、ChangeStarted、Outbox 和 Receipt；任一步失败不写部分事实。

需要先配置有效项目设置。容量计数沿用 Active Executing / ReadyForDelivery，等待评审、测试或发布仍计在制；暂停不计。两个真实进程对两个已确认需求争抢最后一个名额，只允许一个成功开工。

候选与正式确认当前只接受 Active Draft / IntentReady。在途 Contract / Plan 调整、执行中恢复须先接入 Task / WorkItem 与在途动作处置，当前拒绝；紧急超额开工也须等待真实例外决定及恢复安排。StartChange 不创建 WorkItem、不预约执行预算，也不发起 Agent 或部署动作。

## CLI 操作

先构建。以下省略统一前缀 `pnpm cimiloop`，可添加 `--project-dir <path>`、`--json`、`--command-id <id>` 和修改命令的 `--expected-revision <revision>`。从初始化和命令输出取得实际 ID；JSON 输出均经 Schema 校验。

```text
role assign --actor <bound-actor-id> --role flow_owner --scope project
role assign --actor <bound-actor-id> --role technical_owner --scope project
settings update --wip-limit 2
change create --title "改进查询" --requirement-owner <bound-actor-id>
contract submit CHG-0001 --file contract.json
risk assess CHG-0001 --proposal-id <contract-record-id> --proposal-revision 1 --level ordinary --reason "核对实际影响"
decision request CHG-0001 --action confirm_contract --proposal-id <contract-record-id> --proposal-revision 1 --risk-id <risk-id>
decision record CHG-0001 --request-id <request-id> --input-digest <request-sha256> --choice approve --reason "核对约定后批准"
contract confirm CHG-0001 --proposal-id <contract-record-id> --proposal-revision 1 --request-id <request-id> --decision-id <decision-id> --input-digest <request-sha256>
plan submit CHG-0001 --file plan.json
decision request CHG-0001 --action confirm_plan --proposal-id <plan-record-id> --proposal-revision 1
decision record CHG-0001 --request-id <plan-request-id> --input-digest <plan-request-sha256> --choice approve --reason "核对技术计划"
plan confirm CHG-0001 --proposal-id <plan-record-id> --proposal-revision 1 --request-id <plan-request-id> --decision-id <plan-decision-id> --input-digest <plan-request-sha256>
change start CHG-0001 --plan-id <formal-plan-id> --plan-version 1 --reason "确认、依赖与容量满足"
contract show CHG-0001
plan show CHG-0001
decision list CHG-0001
```

submit 的 `--proposal-id` 表示修订的候选链 ID，必须同时提供 `--expected-proposal-revision`；风险、请求和 confirm 的同名参数表示精确候选记录 ID。提交输出会分别展示记录、链和修订。`--base-id` / `--base-version` 须成对提供，省略时固定提交时的当前正式基准；首次为 null。请求支持 `--expires-at`，决定支持 `--condition`，条件仍需实际核验。

contract.json 只包含 Body，不包含 ID、版本、角色或批准字段。例如：

```json
{
  "goal": "返回可核对结果",
  "scope": "改进本地查询",
  "non_goals": ["修改用户权限"],
  "constraints": ["兼容原接口"],
  "acceptance_criteria": [{
    "key": "A1", "scenario": "查询有效需求", "expected": "返回同一快照与序号",
    "evidence_requirements": ["可复查自动测试"]
  }],
  "delivery_endpoint": "production_verified",
  "knowledge_impact": [],
  "risk": {"level": "ordinary", "impact_categories": ["other"], "rationale": "仅本地查询"},
  "unresolved_questions": []
}
```

plan.json 须使用实际 Change ID、正式 Contract ID / domain_version，以及每个任务的 UUIDv7 ID。完整可执行 Body 构造示例见 [intent-project.ts](../../tests/fixtures/intent-project.ts)，字段约束见 [PlanBody.schema.json](../../packages/protocol/schemas/v2/PlanBody.schema.json) 和 [TaskDefinition.schema.json](../../packages/protocol/schemas/v2/TaskDefinition.schema.json)。示例仅说明输入结构，实际验证和交付证据由后续执行产生。

三类查询 JSON 都返回完整 IntentShowResult：当前 Change、所有候选 / 正式版本 / 风险 / 决定、生命周期事实、派生请求状态与同一快照的事件序号。pending、stale、approve、request_changes、reject、applied 是查询派生状态，不能直接写入。重复原成功命令 ID 和原参数支持在后续写入后重放；输入改变则拒绝。

## 存储与验证

领域协议仍为 2.0.0，本阶段引入 SQLite 格式 4；当前格式 5 另增加任务 / 授权。新增不可变 intent_records，按项目、Change 和类型索引；候选链修订、正式版本号及每请求决定具有唯一约束。记录、当前指针、生命周期、事件、Outbox 与 Receipt 在同一事务追加，失败全部回滚。

当前格式 1 / 2 / 3 / 4 须显式升级至 5。格式 3 预检查同时核对设置链、当前设置指针、目标版本、规划历史及不可变回执；格式1 / 2 / 3升级时创建缺失的空确认及任务 / 授权表，格式4保留已有真实确认 / 开工历史并增加空任务 / 授权表；追加迁移事实，不生成任何批准。旧历史 JSON 和回执保留原形状。

自动化覆盖真实确认与开工、候选 CAS、输入和期限变化、拒绝 / 条件 / 指派撤销、普通及高风险独立路径、Plan DAG / 验收 / 知识 / 固定任务版本 / 跨需求依赖、正式基准更新、故障整体回滚、真实双进程容量竞争、CLI 全流程及原命令重放、格式 1 / 2 / 3 迁移与拒绝 / 回滚。全量结果见实施基线第 10 节；仅升级临时样本，未升级用户项目库。
