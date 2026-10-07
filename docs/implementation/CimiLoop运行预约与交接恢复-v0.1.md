# CimiLoop 运行预约与交接恢复 v0.1

> 日期：2026-10-04。V1-07 的 Human 运行控制路径已接通 Protocol、Store、Kernel 和 CLI。实施入口为 [V1 可执行设计与实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)。真实 Agent / Tool Runtime、执行权限隔离及 start/query/cancel/collect 在 V1-09；本阶段不会启动或停止外部进程。

2026-10-07 D-214新增独立Agent Context / Run / 结果固定关系及可信宿主接口，格式10显式迁移保持本页Human严格分支与历史。生产Agent宿主尚未接通，记录预约不启动Provider；新分支和实际验收缺项见[Agent上下文与运行固定关系](CimiLoop-Agent上下文与运行固定关系-v0.1.md)。

## 事实与运行边界

`PrepareRunContext` 固定当前 Task、WorkItem、Contract、Plan、TaskDefinition、SourceSnapshot 与实际 WorkspaceSnapshot。最小 ContextManifest 包含五类原生输入引用、绑定执行者、允许动作和资源、边界及输入摘要；它不包含执行者完整推理。独立验证仍要求不同 Human 和只读授权。Provider 绑定、附加外部材料装配及自动上下文裁剪留给后续上下文 / Runtime / 技能能力。

`ReserveRun` 以 Task Revision 为 CAS，原子创建不可变 RunRecord 和可变 Run，递增 Task Revision / 累计尝试次数，固定首次预约时间，关联 active_run_ref，并将 WorkItem 置为 Active。事件、Outbox 和成功回执在同一事务保存。Run 的 Reserved 表示预算和授权已预约；它不证明实际执行已经开始。operation_key 由 Kernel 生成，后续报告须绑定同一键。

本阶段仅接受绑定 Human executor；已经登记、获得 WorkItem 的 Agent 也不能经该路径运行。人工运行的允许动作是操作约定，工作区核验器检查保存内容和边界；它不限制操作者在系统外的文件访问或执行权限。V1-09 必须提供可验证的执行隔离及外部运行契约。

## 预算、未知与取消

预算沿用 [任务、授权与预算](CimiLoop任务授权与预算-v0.1.md)。累计用量属于持久 Task，换会话、换执行者、重建 WorkItem 或重启不能清零。

- `attempts_consumed` 记录累计预约次数，attempt_no 严格递增。剩余额度为 max_attempts − attempts_consumed + attempts_released − attempt_releases_reversed。
- `first_started_at` 在首次预约时固定，作为经过时间预算的起点；Reserved 不代表 Provider 已启动。等待、暂停和重启期间时间仍流逝。
- 有 max_cost 时，预约须明确 `reserved_cost_micros`，金额不能超过同币种剩余额度。Task 同时记录实际累计费用和未结清的预约费用。
- 原始报告中的费用是该 Run 的累计费用。实际超支仍如实保存，后续预约被阻止；迟到报告提供更高实际费用时只追加差额，不重复计费或减少已知费用。
- Reserved / Running / Unknown 或费用未知都阻止新预约。核对事实与重新执行分别记录，核对命令不新增尝试。

`CancelRun` 只保存取消请求并置为 Unknown。`RevokeWorkItem` 使授权失效；这两个动作都不证明实际运行停止，也不返还次数。原执行者或有效 Human 技术责任仍可记录结果；未知或冲突须由技术责任执行 `ReconcileRun`。

只有 reconciliation 原始报告明确证明 not_started、费用已知为零，且没有历史实际运行 / 费用事实时，才返还一次额度。返还通过独立计数保存，原预约次数及首次计时不变。同一 Run 重复核对不会重复返还；之后若出现实际执行或费用事实，撤销该次返还额度并转入冲突核对。

## 原始观测与任务证据

报告格式为 `cimiloop/manual-run/1.0.0`。CLI 将真实 JSON 字节保存到 `objects/<sha256>`，引用类型为 manual_run。Kernel 经可信宿主端口校验原始内容、生产者、时间、run_id、operation_key、输入摘要、币种和核对依据；命令中不能直接声称这些核验已完成。

观测追加不可变 RunObservation，同时保存接收时的真实工作区，分类为 current / stale / late / conflicting。报告可能为 running / succeeded / failed / cancelled / unknown / not_started。未知不能被普通后续支持报告自动覆盖；核对报告须覆盖全部未知、费用未知或冲突观测，并给出最新确定结果与用量。较早观测保留为 late，不回退已结清状态。旧 Run 的迟到结果不会替换后来 Run 的活动关联或正式 Contract / Plan；其实际费用和冲突仍纳入同一 Task。

确定结束并结清用量后，原活动 WorkItem 回到 Ready；已撤销授权保持 Revoked，Task 保持 InProgress。Run 成功不构成任务 ALLOW 或 Satisfied。仍须走 [证据、评价与安全集成](CimiLoop证据评价与安全集成-v0.1.md) 的真实报告、评价及应用链。最后一次允许尝试已完成时，可以继续评价其结果；这不放行新的运行预约。未启动返还记录不能替代任务证据。

## 工作区与交接

宿主保存真实 HEAD 及完整 Git 源码摘要、独立的暂存区差异、相对 HEAD 的工作区差异，以及允许范围内文件的原始字节或删除事实。未跟踪文件也保存内容；显式允许目录内的忽略文件会进入快照。Manifest、差异和文件都内容寻址，读取时重新校验字节摘要。快照采集前后重复核对，变化时拒绝。符号链接、控制目录、越界路径、授权范围外的 Git 差异和未忽略未跟踪文件均拒绝。

每个内容对象最多 8 MiB；工作区文件总量最多 64 MiB，目录采集最多 10,000 个文件。这是当前本地代码工作区边界；不提供完整系统、权限位、子模块或部署环境备份。保存失败不产生半条领域事实；数据库事务失败时可能保留未引用的内容对象。

`SaveHandoff` 以 WorkItem Revision 核验当前目标，只追加记录，不增加该 Revision。保存完成内容、未决问题、下一步、任务证据引用、接续 Human、源码 / 工作区、可选原运行，以及当时累计用量和剩余预算。运行未知或需求暂停时也可以保存交接；保存不意味着允许继续运行。

`CheckResumption` 固定新的 ContextManifest，核对当前正式基准、有效授权、执行者、全部旧运行的已结清状态、实际工作区与交接快照的内容一致及原始资料可读取，并保存 ResumptionRecord。新的运行预约须提交最新交接对应的 resumption_ref，且用量摘要、Context 与输入摘要仍匹配；预约时再检查实际工作区和剩余时间。

系统保存和核验工作区，不自动覆盖文件或重置 Git。工作区被其他会话修改时返回 INPUT_CHANGED，操作者先检查真实差异，再通过新的受控交接确认接续依据。交给不同执行者时，旧 WorkItem 的 executor 不变；须先结清旧运行、撤销旧授权，再由 Human 技术责任创建新授权并确认累计用量，接续者才能生成自己的 Context / Resumption。新授权不重置预算历史。

## 暂停与恢复需求

已确认正式Plan的 IntentReady 可在 Active / Paused 期间固定源码；Paused Executing 期间允许 CaptureSourceSnapshot、PrepareRunContext、SaveHandoff、CheckResumption 及实际运行观测 / 核对；仍拒绝 ReserveRun、任务证据评价和任务满足。

`ResumeChange` 由有效 change_owner 发起，重新检查正式 Contract / Plan 确认及依赖、当前 WIP 容量、全部在途结果与用量。每份未关闭授权须提交当前 ResumptionRecord；恢复时再次核对累计用量、授权期限、最新交接、原始快照和实际工作区。没有未关闭授权时，须提供当前 SourceSnapshot 并核对 HEAD 与干净工作区。核验、容量占用、Change 状态、Transition、Event / Receipt / Outbox 在同一事务处理；接续依据保存于 ChangeResumed 事件。

本阶段支持已确认正式Plan的 IntentReady / Executing 的受控恢复；ReadyForDelivery 的交付阶段恢复仍等待后续交付能力。恢复需求本身不启动运行，新预约仍走 ReserveRun。

## CLI 操作顺序

使用 Node.js 24.15.0、pnpm 12.4.2，先构建。各 `--file` 是严格命令 payload JSON；机器输出经过同一 Protocol 校验，未知字段被拒绝。目标对象类型如下：

| 命令 | 目标 | 必要 payload |
|---|---|---|
| `run prepare-context` | WorkItem ID | source_snapshot_ref |
| `run reserve` | Task ID | work_item_ref、context_ref、input_digest；有费用额度时另填 reserved_cost_micros；交接后另填 resumption_ref |
| `run observe` | Run ID | raw_result_ref；可用 `--raw-file` 导入真实报告 |
| `run reconcile` | Run ID | raw_result_ref；默认 technical_owner，可用 `--raw-file` 导入核对报告 |
| `run cancel` | Run ID | reason |
| `run handoff` | WorkItem ID | source_snapshot_ref、next_actor_ref、completed、unresolved、next_action、evidence_refs；run_ref 可选 |
| `run check-resumption` | WorkItem ID | handoff_ref、context_ref、input_digest |
| `run show` | Change ID / key | 无文件；输出全部运行、上下文、快照、观测、交接及接续事实 |

例如固定源码并完成 Task / WorkItem 授权后：

```powershell
pnpm cimiloop --project-dir "D:/path/to/project" --json run prepare-context <work-item-id> --file context.json
pnpm cimiloop --project-dir "D:/path/to/project" --json run reserve <task-id> --file reserve.json
# 操作者按实际授权完成工作，再记录实际观察；上述命令不会执行工作。
pnpm cimiloop --project-dir "D:/path/to/project" --json run observe <run-id> --file observation.json --raw-file actual-run.json
pnpm cimiloop --project-dir "D:/path/to/project" --json run handoff <work-item-id> --file handoff.json
pnpm cimiloop --project-dir "D:/path/to/project" --json run prepare-context <work-item-id> --file context.json
pnpm cimiloop --project-dir "D:/path/to/project" --json run check-resumption <work-item-id> --file resumption.json
pnpm cimiloop --project-dir "D:/path/to/project" --json run show CHG-0001
```

恢复文件示例：

```json
{ "reconciliation_refs": [{ "object_type": "resumption_record", "id": "<实际记录UUIDv7>" }] }
```

```powershell
pnpm cimiloop --project-dir "D:/path/to/project" --json change resume CHG-0001 --reconciliation-file resume-change.json
```

`--acting-role technical_owner` 用于技术责任取消 / 交接 / 观测，不能代替绑定 executor 发起预约。`--expected-revision` 可明确并发条件；`--command-id` 重放成功命令的原回执，报告字节和语义内容须一致。

## 存储、验证与后续

当前数据库格式为 7，协议仍为 2.0.0。新建 run_objects 可变运行表及严格不可变 run_records；分别保存 Run 与六类运行记录。格式 1–6 必须显式升级，格式 6 预检查核对实际证据、Task 满足、专业决定及集成准入与不可变事件 / Receipt 的一致性，逐项保留全部旧业务数据，不补造运行或接续。详见 [数据库迁移与恢复](CimiLoop-M0数据库迁移与恢复-v0.1.md)。本批只升级工程临时样本。

验证覆盖实际 Git / 工作区 / 原始字节、双进程预约 CAS、原命令重放、事务故障、预算 / 费用超支 / 返还撤销、取消与未知核对、迟到 / 冲突结果、换执行者、暂停后有差异接续、CLI 及格式 6 专业历史迁移和四处回滚。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及23个测试文件232项通过；78份Markdown的本地链接检查无失效，diff检查通过。验证记录见实施基线和决策账本D-190。

下一步 V1-08 完善 CLI 查询和冲突 / 缺项输出，再进入 V1-09 真实 Runtime 探针、Adapter 和隔离；V1-21 / 22 技能包装及 Matt / Superpowers 试点仍在 S1。OpenSpec 为可选，ECC 按需参考。
