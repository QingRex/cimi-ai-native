# 原模型 Job 资源核对与共享 CLI 控制

接续 `d88f39a`，完整五组S1继续。本批补齐原 Native 查询／恢复漏掉 Codex 进程 Job 的缺口，并把查询、采集、取消重试、恢复正式接到 CLI 的同一应用服务。没有把这一项恢复能力当作四项生产控制或完整S1已完成。

## 实际行为

此前 `queryAgentRuntimeOperation` 的资源布尔值只核 Native 沙箱，Codex 模型进程另有 owner Job；沙箱清理成功后仍可能有未核定的原模型调用。现原 Codex 绑定的查询、采集和恢复同时读取模型 Job，明确 `resource_scope: native_and_current_codex_run`。Native 已停但模型资源待核对时整体 Unknown，整体资源已处置须两者均成立。旧非Codex路径明确标为 `native_only`，不改变其既有含义。

新内部 launch2 固定原取消文件、nonce、配置摘要。Host1 的 prepared／started 票据依次固定准备材料及实际进程身份，首次模型 RPC 前必须完成启动登记。原 C# 监督进程支持取消，终止并等待整个Job活动数归零，关闭Job，再写结束原件。宿主进程突然退出同样触发原监督进程清理。客户端先让监督进程收尾，超时仍可停止自己持有的原子进程，但缺证明保持 Unknown，不能因强制停止推断已完整清理。

资源只读入口校验原 protected Host1、请求／配置／启动身份、原程序摘要、结束摘要链及当前OS进程身份。PID必须同时匹配创建时间和程序；不存在与不可核对分别处理。结束文件缺失不修复，即使进程已不在也不自动报告 disposed。新启动票据丢失不回填。已有独立完成票据仍按原规则读取，旧 Unknown 不从新电脑或新位置的“未找到”推断清理完成。

资源证明与模型成功封口、任务结果及账单分开：`completion_proven:false`、`costs_reconciled:false`、`family_resources_disposed:false`。SDK 响应丢失时可以证明原 Job 已结束，但模型结果仍待核对；相同请求继续拒绝第二次派发。它不自动清理原子技能或整个任务的全部资源。

CLI 新增 `run query-original/collect-original/cancel-original/recover-original`，复用 `LocalAgentRuntimeControl`，不打开执行工厂、不接收来源安装JSON。取消重试和恢复须先有 Kernel 原取消记录及当前 Human 控制权限，重复操作不重复产生 Kernel 效果。工作台相同查询在 Native 清理已完成而模型未知时显示明确提示。[操作指南](../implementation/CimiLoop-原Agent模型进程资源核对-v0.1.md)。

格式仍为 Schema242、项目库10、Host1。仅新增内部launch2和Host1票据约定；launch1、原方法start10、原模型header1—19读取不重解释，不升级或迁移用户库。

## 原真实 Run 的只读复查

本机原Luna Run `01a179d8-f1f1-7004-986b-fbb14fed8b81` 使用新查询复查，报告 `.cimiloop/codex-2026-10-27-model-process-recovery-historical-audit.json`。Native原件和当前身份支持沙箱已清理；前四个原Codex调用有独立结束票据；第5调用缺少完整资源观察依据，仍Unknown。整体 `resources_disposed:false`，status Unknown，不产生完成或结费证明。本批未重开原Run，新增真实模型请求0，没有处理旧Unknown资源。

## 实际验证与失败

Node24.22.1／pnpm12.4.2。测试中的模型／账户／资格仍为PUBLIC；实际Windows Job、进程树、Host1、SDK／IPC和文件效果不能扩大为真实模型、账单或S1验收。

- 新资源API反例先1失败，API缺失；报告 `model-process-recovery-red.json`。
- 首轮实际进程文件1通过7失败，C#新条件表达式的int／uint编译错误已修正；随后定向用例1失败7过滤，定位为进程退出后先读映像而失去查询能力，现先核已退出状态，再核创建时间和映像。最后定向1通过7过滤不算整文件通过，所有报告保留。
- 核心三文件首次36通过1失败：旧“stall”夹具在宿主输入管道关闭后可自然退出，结果为worker_exited，不能证明本用例要求的owner_exited路径。夹具改为持续活动，要求真实Job终止。产品没有放宽结束条件。
- 最终进程与模型两个完整文件69通过、0失败0跳过（`model-process-recovery-final.json`）：含取消实际常驻进程／后代、宿主突然退出、缺结束原件仍Unknown、启动字节篡改拒绝、模型封口丢失不重派，以及SDK响应丢失但独立Job已结束。
- 实际Native／SDK双阶段和当时完整模型文件合计61项通过（`model-process-recovery-sdk.json`）；模型文件后来新增SDK丢响应用例，以前述最终61项完整模型结果为准，不重复累计。Native双阶段1项实际执行新Job组合与两阶段资源查询。
- 原操作13项、共享Human控制16项在核心报告中完整通过；工作台HTTP9项／DOM2项完整通过（`model-process-recovery-workbench.json`）。
- CLI帮助反例1失败1过滤，实际缺 `query-original`（`model-process-cli-red.json`）。新增CLI测试类型收窄与未公开claim导入错误已修正。CLI完整文件最终2项通过、0失败0跳过（`model-process-cli-first.json`）：真实编译CLI／Kernel／SQLite查询及采集、Kernel取消前恢复拒绝、原取消标记重放、原Run及预算仍Unknown，模型与Native进程启动0。按各完整文件最新结果，本批8个文件共112项通过，分轮运行，不重复累计早期结果。
- 最终 `pnpm check`、编译CLI `run --help`、工作台JavaScript语法、文档UTF-8／围栏／相对链接及 `git diff --check` 均通过。未运行全仓测试或真实模型／账户／账单／S1验收。

报告统一前缀 `.cimiloop/codex-2026-10-27-`。失败记录未改判，验证分轮完成，不称全仓或完整S1。旧六个未跟踪文件不读取、不散列、不暂存、不删除。

## 完整目标剩余

默认正式Agent仍缺网络／可靠费用与上限／全部物理配额／全部恢复的完整生产控制来源组合；本批只解决当前原Run模型Job这一部分恢复。固定卷、同卷登录目录、真实账单与原Human回答等缺项保持明确。真实Skill／Matt、普通Change到ReadyForDelivery、接入指南实走及最终Matt／Superpowers评审继续实施。本批不发送真实模型请求、不释放Unknown预算、不push。
