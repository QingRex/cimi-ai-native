# CimiLoop S1 真实接入与验收操作指南 v0.1

本指南把新电脑准备、Runtime／Skill 资格、Human／Matt 澄清、正式 Agent、原身份恢复及普通 Change 到 ReadyForDelivery 串为一条执行顺序。**当前尚未完整实走，不是 S1 通过报告。** 当前源码仍缺完整客户端成功构建、实际费用与恢复依据、完整方法行为等条件；遇到下表停点即保留现场，不能把后面的操作示例视为已可执行。

当前基线为 Schema242／项目数据库10／Host1。S1 范围包括 V1-09、V1-21、V1-22、V1-10、V1-11；本指南不要求提前实施 S2–S4，OpenSpec 可选，ECC 按需参考。

## 1. 执行位置和第一道检查

区分三个位置：开发工具仓库提供 CLI／工作台，业务项目承载真实普通修改，证据目录保留本次命令输入与原始结果。下面 `R:` 仅表示**已准备并独立核对的专用固定卷**，不是当前电脑已有盘符或任意普通目录；全部路径须替换为实际位置。

```powershell
$s1ToolRepo = 'D:\cc\cimi-ai-native'
$s1ProjectDir = 'R:\projects\s1-example'
$s1EvidenceDir = 'R:\evidence\s1-example'
Set-Location $s1ToolRepo
node --version
pnpm --version
git status --short
git log -1 --oneline
pnpm install --frozen-lockfile
pnpm check
pnpm cimiloop --project-dir $s1ProjectDir --json doctor
```

Node 必须 `>=24.15 <25`，pnpm 必须12.4.2。记录实际本地分支、HEAD、工作区及远程状态，保留已有改动，不 reset／clean／强推。数据库格式不匹配时停止，单独按显式兼容迁移处理，不执行自动升级。

业务项目须为真实 Git 仓库，不能用受控资格夹具冒充。`PROJECT_NOT_INITIALIZED` 表示该目录尚未初始化，不是 SDK 故障；只有确认是本次**新项目**后，才用 `pnpm cimiloop init --project-dir <实际目录> --name <实际名称> --owner-name <本人名称> --yes`。已有项目缺原 instance／库时保留现场，不用 init 重建。操作者及角色须为实际 Human 入口，见[身份与责任](CimiLoop责任治理与身份入口-v0.1.md)。

2026-10-27 本机核对：工具仓库本身的 doctor 返回 `PROJECT_NOT_INITIALIZED`；它不能因此被当成已运行 S1 的业务项目。当前进程非管理员，卷枚举没有符合本方案的已挂载专用 VHDX。另行准备业务目录、卷与当前用户的连接，不把测试目录或旧电脑绝对路径当作安装。

## 2. 必须逐项通过的接入停点

| 停点 | 通过依据 | 未通过时的动作 |
|---|---|---|
| G1 兼容程序 | 本次完整 `.2` 的 CLI 和 code-mode-host 构建成功，源码后验及原 Job 处置成立；空登录版本／stdio 初始化实际通过 | 提供充足空间或另一 Windows builder，按原阶段记录接续开发构建；不采用旧 target 产物 |
| G2 账户与全部写根 | 同一已授权 Codex 账户、有限容量、固定 VHDX、仓库外官方登录目录及全部写根的实际原绑定 | 按同卷指南准备；缺管理员或卷准备条件时交给实际管理员处理，不回退普通目录 |
| G3 正式 Runtime | 当前 Native／SDK／模型／账户链及网络、真实费用上限、完整磁盘／历史容量、完整恢复来源均经独立读取与 Kernel 评估 | 保留具体缺项；技术契约或安装成功不能升级为 task_execution |
| G4 正式 Skill／Matt | 固定来源及全部依赖、至少两份独立真实方法样本、权限／费用／恢复／行为／全部 harness 依据 | 保留 NEED_MORE_EVIDENCE；读到 SKILL.md、结构化输出或 PUBLIC 样本不能批准 |
| G5 业务开工 | 真实 Human／Matt 前置澄清、当前正式约定／计划、实际职责、独立验证安排及预算 | 等待真实回答和决定；不得代答、回填历史澄清或注入完整资格对象 |

当前实现状态与本机失败见[交接记录](../plans/2026-10-09-cimiloop-S1跨电脑接续.md)。G3 的 `LocalCodexRuntimeControlOriginals` 尚无完整费用／恢复读取来源；G4 的具体方法读取器还将权限交集、费用、恢复、行为及未安装 harness 保持未证明。**安装、技术资格和正式执行是分开的实际停点，不能跳过。**

## 3. 完整客户端、同卷账户和登录

按[兼容客户端构建](../../scripts/codex-appcontainer/README.md)准备固定上游与原归档，旧 `.1/source` 保留，完整 `.2` 使用独立 `source-pipe`。开发构建使用自己的原 Job 和新阶段名；观察超时继续查同一句柄，原阶段终止和处置成立后才可发起另一个开发阶段。它不创建业务 Run。

最新完整 `pipe-client-full-01` 因2GiB保护停止，code125，原 Job 已处置，源码前后一致，**没有构建成功**。2GiB是停止缓冲线；继续建议至少10GB可用空间。先使两个目标均实际成功，再按 README 执行 `codex-official-startup.test.ts` 的无登录版本／初始化；没有新程序时不运行或跳过均不能记通过。

随后逐步执行[同卷安装与有限额度分配](CimiLoop-Codex同卷安装与有限额度分配-v0.1.md)。固定检查 JSON 须写真实命令、程序、适用工作范围与摘要，不能用恒返回0的检查替身。官方登录由用户按安全连接方式在仓库外完成；不复制历史 API Key、登录令牌或 auth.json，不写入 Git、日志或 Agent 上下文。

```powershell
pnpm cimiloop runtime codex-installation --project-dir $s1ProjectDir --json
pnpm cimiloop runtime codex-budget --project-dir $s1ProjectDir --json
pnpm cimiloop runtime codex-storage --project-dir $s1ProjectDir --json
pnpm cimiloop runtime codex-home --project-dir $s1ProjectDir --json
pnpm cimiloop provider list --project-dir $s1ProjectDir --json
```

使用已授权账户，真实测试优先 `gpt-6-luna`；不新增付费服务。已有账户从原剩余额度分配，不因换项目另建更大总额。容量、模型 token 和普通额度不是现金／积分账单；官方财务来源、原请求对应及结清口径缺失时保留未知，不能推断订阅内调用自动为零费用。

## 4. 先取得 Runtime 与 Skill 的真实资格

按[Runtime 原 SDK 契约指南](CimiLoop-Runtime原SDK契约接入指南-v0.1.md)登记固定候选。生成并在证据目录**保存**原请求 ID，再调用；不在重试时重新运行 ID 生成器。

```powershell
pnpm cimiloop runtime contract start <runtime-descriptor-id> --request-id <已保存UUIDv7> --max-elapsed-ms <已批准期限> --project-dir $s1ProjectDir --json
pnpm cimiloop runtime contract query <原请求ID> --project-dir $s1ProjectDir --json
pnpm cimiloop runtime contract usage <原请求ID> --project-dir $s1ProjectDir --json
pnpm cimiloop runtime contract capture <原请求ID> --project-dir $s1ProjectDir --json
```

预期原编辑确实把 `before` 改为 `after`，独立原评审重新读取实际输出，Native／SDK／IPC／模型身份可复核。capture 返回引用后，按指南使用 `provider record-evidence`、`provider evaluate`、真实 Human `provider bind`；保存每一步原命令 ID、输入文件和回执。技术 ALLOW 只允许 isolated_provider_probe；正式 Runtime 仍须 G3 四项实际控制与 controlled_execution 当前资格。

按[固定 Skill 隔离调用指南](CimiLoop-固定Skill隔离调用接入指南-v0.1.md)导入真实固定 Git 包。候选文件现有：`packages/skill-adapter/candidates/matt-clarification.json`、`matt-review.json`、`superpowers-verification.json`；先核各自实际 commit、完整依赖与许可，不能猜测本机同名 Skill 缓存等于这个包。

```powershell
pnpm cimiloop skill import --file <实际SkillImportSpec.json> --repository <固定来源Git目录> --project-dir $s1ProjectDir --json
pnpm cimiloop skill inspect <skill-descriptor-id> --project-dir $s1ProjectDir --json
pnpm cimiloop skill probe --help
```

对同一候选、用途及 Runtime pin 做至少两份**独立真实**固定方法调用，按原 ID query／collect，最后 capture。第二份是明确新样本，不能用来替代第一份 Unknown 的恢复。具体 start 参数和输入格式沿隔离指南；输出不完整、依赖未调用、权限越界、缺账单或 harness 未安装时停在 G4。不能用注入工厂、手改 ALLOW 或改标 origin 放行。

## 5. 选择真实普通修改并完成前置澄清

由 Human 选择真实业务修改，例如对业务查询增加一项有明确输入／输出的过滤能力；这只是选题示例，尚不是用户决定。约定必须写真实验收、兼容边界、允许改动、非目标及预算。涉及权限、重要数据或关键兼容时按真实风险处理，不能为了单人验收改称 ordinary。

先查询该 Change 的原澄清会话。已有等待 Human 的问题时，接续并回答原问题，不新开会话覆盖它。Matt 宿主按 `clarification install-codex --help` 和固定包安装；安装不等于真实方法资格。实际调用必须读固定入口及依赖，不能由 Agent 自称完成 Matt 方法。

```powershell
pnpm cimiloop change create --title <真实需求标题> --project-dir $s1ProjectDir --json
pnpm cimiloop clarification list <change-id> --project-dir $s1ProjectDir --json
pnpm cimiloop clarification show <change-id> <原session-id> --project-dir $s1ProjectDir --json
pnpm cimiloop clarification begin <change-id> --file <已保存开始请求.json> --project-dir $s1ProjectDir --json
pnpm cimiloop clarification advance <change-id> <session-id> --file <已保存动作.json> --project-dir $s1ProjectDir --json
```

开始／动作文件格式见[Human 澄清](CimiLoop-计划前Human澄清与原请求接续-v0.1.md)及[计划候选接续](CimiLoop-Human计划澄清与原候选恢复-v0.1.md)。计划会话明确 `target: plan`，固定当前正式 Contract；Human 对真实问题逐项回答。Matt 缺失、不可调用或业务答案缺失时记录未解决项，Plan／Task 不得提前创建。

约定经真实风险判断、请求决定、本人决定及正式确认；计划从已核验前置澄清提交候选，再经真实确认。步骤与严格 body 见[约定、计划和开工](CimiLoop约定计划确认与开工-v0.1.md)。独立验证任务覆盖各项真实验收，不用实施者再自查冒充。计划确认后 `change start`、`task initialize` 和 `work-item create` 仍分别核对当前准入，详见[任务授权与预算](CimiLoop任务授权与预算-v0.1.md)。

## 6. 默认 CLI／工作台执行同一原 Run

业务执行只能使用已批准 task_execution 的 Runtime／Skill 与完整默认宿主。当前正式组合缺项时返回 CAPABILITY_UNAVAILABLE 是停点，不安装测试对象绕过。WorkItem 的动作、资源、期限和预算取真实批准结果；PrepareRunContext／ReserveRun 成功也不能视为 SDK 已启动。

```powershell
pnpm cimiloop run prepare-context <work-item-id> --file <准备payload.json> --command-id <原准备命令ID> --project-dir $s1ProjectDir --json
pnpm cimiloop run reserve <task-id> --file <预约payload.json> --command-id <原预约命令ID> --project-dir $s1ProjectDir --json
pnpm cimiloop run start-original <run-id> --project-dir $s1ProjectDir --json
pnpm cimiloop run query-original <run-id> --project-dir $s1ProjectDir --json
pnpm cimiloop run collect-original <run-id> --project-dir $s1ProjectDir --json
pnpm cimiloop run show <change-id> --project-dir $s1ProjectDir --json
```

原始 payload、Context／Run／operation_key 取实际输出，不从历史夹具复制。启动响应丢失后先 query 同一 Run；不得再 reserve 一个 Run。真实原 SkillInvocation 须包含实际包调用、依赖、方法输入／输出及同一原身份的 Native／SDK／模型对应关系。读取文件、外层 response_submitted 或方法提案不是调用完成。

用 `pnpm workbench --project-dir <实际业务目录>` 打开返回的本地会话，查询同一 Change／Task／Run；页面和 CLI 的 ID、状态、原件及 Kernel 回执必须一致。页面的“按原请求核对”使用原保存请求。浏览器存储不可用时不发送新的不可恢复请求；不通过改路由、换端口或换 ID 重派。

## 7. 中断、停止和原身份恢复

至少覆盖启动前、SDK／模型进行中、响应丢失、宿主异常退出及应用重启。故障只针对本次可证明归属的原操作，保留注入时点、原请求与结果；不能通过批量终止进程或删除 Temp／映射／Profile 制造清理结果。

`run cancel` 是 Kernel 业务取消；其后 `cancel-original` 传递原物理取消，`recover-original` 核对和处置原资源。工作台父或子 Skill 的“请求停止”复用完整父子服务：Kernel 只记一次取消，再逐原操作处理父及全部子调用。

```powershell
pnpm cimiloop run cancel <run-id> --file <含reason的原payload.json> --acting-role technical_owner --command-id <原取消命令ID> --project-dir $s1ProjectDir --json
pnpm cimiloop run cancel-original <run-id> --project-dir $s1ProjectDir --json
pnpm cimiloop run query-original <run-id> --project-dir $s1ProjectDir --json
pnpm cimiloop run recover-original <run-id> --project-dir $s1ProjectDir --json
pnpm cimiloop skill query-original <invocation-id> --project-dir $s1ProjectDir --json
```

核对完整 `family.children`。`run collect-original` 及工作台父运行采集会采集父和全部已登记子调用；单项缺原件保留 Unknown，并继续其余原调用。默认子采集从固定包及原 SkillInvocation 重建方法输入，在采集前后复查，再交给独立方法结果读取器；缺少原包或输入变化时不返回已核验方法结果。无子调用保留原响应。采集不是领域观察或费用结清，重复采集不重开 Run。

父已停、子缺原件或旧 Native-only 结果均不能证明全族已处置；requested／observed 也不能证明已停。资源处置、任务完成和费用结清分别需要原件。`recover-original` 只恢复原资源，不继续 SDK 执行；技术契约 continue 也只允许尚未登记的阶段。对已登记 Unknown 不提供重派捷径，保留原占用。

当前安装的程序／检查材料丢失时，默认子 Skill 原控制借用原受保护保管账本，继续核对并投递原资源操作；原账本／目录身份／子登记仍须可证。不要为恢复资源重新安装或重开 Run。到达原控制器不等于已处置，仍按实际原 Native／模型结果判断；新启动和结果核验各自的完整材料要求保持。

同 ID 原命令重放须只有一份领域回执／效果；重复原模型请求不得多一份真实模型效果／费用。记录新旧事件序列、原 Run／子调用集合、启动登记、OS 资源及原账户预约集合，不能只比终端显示。迁移机器后看不到旧资源不能证明旧电脑资源已清理。

## 8. 结果、费用、独立验证与 ReadyForDelivery

原采集后，按实际原 Skill／Native 结果记录／核对领域观察；账单须由批准的官方来源对应完整原请求集合与账户。现有 `run costs`、`record-costs`、`reconcile-original` 是原账单服务入口，不表示 Codex 费用源已安装。

```powershell
pnpm cimiloop run costs <run-id> --project-dir $s1ProjectDir --json
pnpm cimiloop run record-costs <run-id> --help
pnpm cimiloop run reconcile-original <run-id> --help
```

`usage_complete:true`、token 已知或资源已停止不能替代费用结清。缺 SDK、模型、子调用、官方金额／币种／积分或原保管时保持 Unknown，不把零、估算或合成账单写入正式观察。

对实际交付源码做固定检查、独立验证、Matt 独立完整评审、Superpowers 新鲜验证及真实行为对照。保存各自真实固定包、原调用、独立上下文、读到的规范／源码和输出；使用最终实际源码，不沿用旧 e33／其他 SHA 的报告。修复评审问题后，对受影响范围复验并更新最终依据。

按[证据评价与安全集成](CimiLoop证据评价与安全集成-v0.1.md)准备真实严格 payload，顺序是：

| 命令 | 目标与必须消费的实际依据 |
|---|---|
| `verification capture-source` | Change；完整交付 commit |
| `verification record-evidence` | Task；同 SourceSnapshot 的原结果，不伪造人工报告 |
| `verification prepare-task` | Task；当前 SourceSnapshot 及需求集 |
| `verification evaluate-task` | Task；当前需求集／摘要及独立评价 Context |
| `verification satisfy-task` | Task；实际当前 ALLOW 评价 |
| `verification evaluate-integration` | Change；当前源码、所有必要任务及真实延期安排 |
| `verification mark-ready` | Change；当前 ALLOW 集成评价及精确 input_digest |

每个写命令使用保存的 `--file`、`--command-id` 和真实角色；新证据改变依据后重新准备评价，不复用旧摘要。最终 `change show <change-id>` 应由 Kernel 事实显示 ReadyForDelivery。它不是生产部署或 Completed；不得直接更新数据库状态或把必要失败改为延期。

## 9. 同一最终版本的 S1 验收

按[V1实施计划§9](CimiLoop-V1可执行设计与实施计划-v0.1.md#9-验收矩阵与验证方法)逐项执行，不能只跑下表一部分后宣布 S1 完成。

| 编号 | 本轮必须核对的真实结果 |
|---|---|
| A1／B4的S1部分 | title-only Draft／无目标版本可录入；规划变化不复制需求或改变约定事实 |
| A2 | 暂停、他人修改、另会话接续能识别差异并保留已有成果 |
| A3／F3 | 自检不升级独立结论；真实 Matt／Superpowers 和隔离评价可复查 |
| A4 | 依据改变后的旧决定拒绝，原历史保留 |
| A5 | 两客户端争WIP及重复运行，容量、预算和尝试数只有有效份数 |
| A9 | Agent 伪造Human、调用人类入口、改权威库，由实际权限拒绝 |
| F1／F2 | 版本／依赖／权限漂移阻止新调用；非法输出不写正式结果或Gate |
| R1／R3 | 事务中断无半提交，同Revision并发不覆盖 |
| R2／R4的S1部分 | 丢响应／重启沿原身份接续，原效果不重复，未知先查询 |
| R5／R6 | 显式迁移失败回滚、未知格式拒写；旧成功回执／事件读取不重执行 |

集中执行 `pnpm check`、适当的完整 `pnpm test` 及计划要求的实际 Windows/AppContainer 场景。环境开关导致未运行的 Native 场景、过滤用例、构造模型／资格／账单不计真实通过；按实际矩阵补足。新鲜验证绑定最终源码及实际配置，旧提交的绿测不能替代。

在证据目录形成一份实际执行记录：工具仓库交付 SHA、业务项目交付 SHA、安装与包来源、原请求／Context／Run／子调用／评价／账单 ID、命令及退出状态、原件路径与摘要、故障时点、失败和跳过、当前 Unknown 与占用、Human 决定、最终 ReadyForDelivery 查询。凭据和令牌不进入记录。未执行项明确写“未执行”，不预填通过。

只有五组全通过、本指南从头实走成功、同一真实普通 Change 达到 ReadyForDelivery、最终评审阻断项全部关闭，才可结束 S1 目标。

## 10. 本指南当前核对范围

2026-10-27 已读取当前源码、编译 CLI 帮助及相关操作指南，确认命令层级、Run／Task／WorkItem／Change 的目标区别和现有停点。只读 doctor 证明开发工具仓库尚不是初始化业务项目；卷／管理员状态和客户端空间失败均按实际状态记录。没有初始化用户库、创建业务 Change／Plan／Task／Run、调用模型或执行整条验收；本指南不得作为已完成接入或五组 S1 证据。
