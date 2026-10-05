# CimiLoop 项目设置、规划与容量 v0.1

> 2026-10-04：V1-03 的设置、规划与容量基础，以及 V1-04 的真实确认和 StartChange 正向准入已实现。执行中恢复仍等待 Task / WorkItem 与在途动作核对，完整 V1 尚未完成。

开发规则以 [V1 可执行设计与实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)为准。身份与角色见 [责任治理与身份入口](CimiLoop责任治理与身份入口-v0.1.md)，升级操作见 [数据库迁移与恢复](CimiLoop-M0数据库迁移与恢复-v0.1.md)。

## 项目设置

Project 保存当前 `settings_ref`，每次更新追加不可变 `ProjectSettingsVersion`，包含版本号、前驱引用、生产者和创建时间。旧设置不原地修改；当前引用、Project Revision、事件、Outbox 与成功 Receipt 同事务提交。

| settings 字段 | 当前含义 |
|---|---|
| wip_limit | 正整数，在制需求上限，不是 Agent 或运行进程数量 |
| flow_owner_actor_id | 设置指定的 Human 交付协调人，须有独立、持续有效的项目范围 flow_owner 指派 |
| priority_arbiter_actor_id | Human 排序争议裁决人，须有持续有效的项目范围 project_owner 指派 |
| priority_order | higher_first / lower_first，显式说明数值排序方向；同优先级按 CHG 编号稳定排序 |
| check_interval_ms | 正整数，检查间隔约定；当前保存并展示配置，尚无周期调度器 |
| policy_ref? | 预留正式策略引用；当前传入会返回 CAPABILITY_UNAVAILABLE，不把任意 ID 当成已批准策略 |

UpdateProjectSettings 需要调用者的 Project Owner 与 Flow Owner 两项独立指派；已有设置时还须为当前指定协调人。命令声明 `acting_role=project_owner`，额外核验 Flow Owner 责任。同人可以兼任，登记另一位 Human 不代表对方批准或登录。

命令同时固定 Project `expected_revision` 与 `base_settings_ref`；首次基准必须是 null，后续必须精确匹配当前设置 ID 与版本。并发修改或旧基准拒绝，不自动覆盖。上限不得低于当前在制数量。当前设置使用的协调 / 裁决指派不能直接结束，须先完成新指派并更新设置。

新项目及迁移项目不会自动配置容量。未配置时查询返回 `settings_version=null`、容量上限和可用量为 null；这表示未知，开工保持阻塞。

## 目标版本与规划

TargetVersion 是项目内规划对象，名称唯一，只有 open / closed 两种状态。可选 `planned_window` 固定有效 UTC 起止时间且开始早于结束；关闭需要原因，同时核验 Project 与目标版本 Revision。

目标版本由设置指定的 Flow Owner 创建 / 关闭。关闭只结束规划，不完成需求、取消需求、产生发布批次或改变已关联 Change 的归属。新纳入必须指向当前项目的开放版本；关闭后仍可取消既有归属或移至另一开放版本。

ChangePlanning 至少提供优先级或目标版本之一，带原因及 Change Revision。`target_version_id=null` 明确取消归属，省略则保持原归属；无变化返回 PLANNING_UNCHANGED。普通规划需要当前指定 Flow Owner；显式 `arbitration=true` 由指定裁决人以 Project Owner 身份处理，裁决只调整优先级，不能同时调整目标版本。已完成 / 已终止需求拒绝新规划。

不可变 ChangePlanningUpdated 保存调整前后、原因、是否裁决，以及事件中的实际身份和角色。调整规划不隐式确认 Contract / Plan，也不改变执行授权。

## 在制、暂停与开工边界

在制计数为当前项目中 `operating_status=Active` 且位置为 Executing / ReadyForDelivery 的 Change。等待评审、测试和发布仍计入；Draft / IntentReady、Paused、Completed / Terminated 不计入。查询同时返回排序结果、在制集合、暂停集合、设置、目标版本和同一读快照的 `as_of_event_sequence`。

暂停非终结的原生 v2 Change 保留原位置、引用和原因，暂停后不计在制。这里的业务暂停不证明外部 Runtime 已停止或资源已回收；取消执行、未知副作用与资源恢复在后续任务实现。Draft 可恢复；执行中 / 待交付恢复会先检查容量，再因实际执行核对未接通而阻塞。冻结的 v1 兼容命令仍只处理 Draft。

StartChange 当前核对可信调用者、指定协调人、Change Revision、Active IntentReady、真实当前 Contract / Plan 及其精确确认、风险、DAG / 验收 / 知识 / 依赖和事务内容量；满足后进入 Executing，追加生命周期、ChangeStarted、Outbox 和成功 Receipt。缺依据返回 EVIDENCE_MISSING，容量满返回 WIP_LIMIT_EXCEEDED，依赖未满足返回 DEPENDENCY_UNSATISFIED。紧急超额引用仍因真实例外与恢复核验未接通而拒绝。拒绝不推进状态、不产生成功事实；开工不启动 Runtime。确认操作见 [约定、计划确认与开工](CimiLoop约定计划确认与开工-v0.1.md)。

容量检查与消耗容量的写入位于同一 Store 事务。V1-03 的低层夹具只验证容量竞争，不构成批准依据；V1-04 已通过真实候选、风险、人工决定和正式确认生成两个可开工需求，再由两个实际进程争抢最后一个名额。仅一方得到 StartChange 成功事件及回执，另一方返回 WIP_LIMIT_EXCEEDED，正向准入与容量联调已验收。

## CLI 使用

先构建仓库。下面省略统一前缀 `node apps/cli/dist/bin.js`；可加 `--project-dir <path>`、`--json` 和 `--command-id <id>`。从初始化结果或 `actor list` 获取绑定操作者 ID，不能选择另一位 Human 冒充其本人。

```text
role assign --actor <bound-actor-id> --role flow_owner --scope project
settings update --wip-limit 2 --priority-order higher_first --check-interval-ms 60000
settings show
target-version create --name "v0.2" --starts-at 2026-11-01T00:00:00.000Z --ends-at 2026-12-01T00:00:00.000Z
target-version list
change create --title "改进查询" --target-version <target-version-id>
change planning CHG-0001 --priority 10 --reason "先处理阻塞"
change planning CHG-0001 --priority 20 --arbitration --reason "确认排序争议"
change planning CHG-0001 --clear-target-version --reason "延期重新规划"
change priority
change wip
target-version close <target-version-id> --reason "规划窗口结束"
```

设置更新默认保留未提供的协调人、裁决人、排序方向和检查间隔；首次默认绑定操作者、higher_first 和 60000ms，仍必须有对应独立指派。可用 `--flow-owner`、`--priority-arbiter` 明确设置，`--base-settings-id` 与 `--base-settings-version` 须成对提供。目标版本关闭可用 `--expected-target-revision`，规划及项目修改可用 `--expected-revision`。

`change start <change> --plan-id <id> --plan-version <version> --reason <reason>` 在真实正式确认、依赖与容量满足时开工，任意 Plan ID 会拒绝。上述四类查询的 JSON 均为完整 FlowStatusResult，文本分别展示所选内容；查询本身不创建事件。相同成功命令 ID 和原参数支持在后续写入后重放，改变内容仍拒绝。

## 存储与验证

SQLite 当前格式为 7，领域协议仍为 2.0.0；V1-05当时格式5的验证记录保留。设置版本表与带 CAS 的目标版本表由格式 3 引入，格式 4 新增不可变确认记录表，格式 5 新增任务 / 授权表；格式 1 / 2 / 3 / 4 必须显式升级。旧格式迁移核对结构、索引、版本、角色来源、历史回执与当前状态、计数器、迁移来源、Transition 和租约；格式 3 另核对设置链、目标版本与规划历史，格式 4 另核对真实确认 / 开工 / 生命周期和精确回执。已有设置和规划原样保留，缺失表只初始化为空，不生成批准或默认容量。

验证覆盖配置权限 / CAS / 不可变版本、裁决边界、关闭版本及规划历史、等待阶段与暂停计数、降低容量拒绝、引用冒充批准拒绝、故障事务回滚、一致读快照、真实双进程容量竞争、格式 2 只读检查与四处回滚、含 M0 原回执的历史升级，以及新 CLI 全流程及旧回执重放。全量构建、类型、Schema 同步与测试结果见实施基线第 10 节。仅升级临时测试库，未迁移用户项目。

V1-07已接通已确认正式Plan的IntentReady / Executing受控恢复：重新检查基准 / 依赖、实际在途结果、用量和接续依据，并在同一写事务检查当前WIP容量。暂停期间的核对不预约运行、不占用开工容量；ResumeChange才恢复在制占用。操作见[运行预约与交接恢复](CimiLoop运行预约与交接恢复-v0.1.md)，当前格式7，真实Runtime仍在V1-09。
