# CimiLoop 宿主模型与正式 Runtime 执行组合 v0.1

2026-10-10 D-253：[工作台原Agent启动衔接](CimiLoop-工作台原Agent启动衔接-v0.1.md)已接Human请求核权、共享原组合、唯一启动与HTTP / 页面；Native实际放行前重新核权，丢响应只核对原Run。受信工厂默认未安装、真实模型账户未批准；完整五组S1继续，以下各批仍保留各自历史验证范围。

2026-10-10 D-252：[原执行产物领域依据与Kernel核验](CimiLoop-原执行产物领域依据与Kernel核验-v0.1.md)已接Kernel、共享观测与Runtime；原固定约定 / 计划 / 任务定义独立全文和结构核验，同ID改正文或外来引用拒绝产物证明。原收据重放、未知费用、242 Schema / 用户库10保持，正式Agent与完整五组S1继续。

2026-10-10 D-250已接[原监督回读与新鲜工具准入](CimiLoop-原监督回读与新鲜工具准入-v0.1.md)：共享组合复用两个修复后的工具宿主，逐次新鲜评估前让出I/O；原模型 / 账户检查和Run唯一身份保持，真实批准、账单与S1继续。

2026-10-09 D-249已接[原恢复控制器与配方](CimiLoop-原恢复控制器保留与编译配方-v0.1.md)，生产Runtime唯一claim冻结launcher2原件并复用原资源恢复；工具 / 模型 / 账户与费用证据仍各自核验，不因控制器保留升级成功或启用默认正式Agent。

2026-10-09 D-242 后续：新生产执行期限采用原Task剩余时间与固定一小时上限，准备阶段纳入原Task监督，新Native私有配置为4；旧配置3及本页D-240的180秒Task失败保留原义。详见[生产执行期限与原Task组合](CimiLoop-生产执行期限与原Task组合-v0.1.md)。真实模型账户 / 费用及正式终态仍未证明，默认入口保持关闭。

D-240，2026-10-09。范围为 V1-09 / V1-10 的可执行组合续批；完整五组 S1 持续目标保持进行中。

## 已接通的路径

`LocalAgentRuntimeComposition` 实现原 `AgentRuntimeStartPort`，复用 `LocalAgentRuntimeStart` 的当前 Kernel 检查、独立原宿主票据、不可逆首次 claim、本地材料 / dispatch 和唯一启动。准备、启动、查询、采集与取消仍对应同一个 Run / operation_key；发送或响应失败不重开 Run。

组合在启动前固定 Task、WorkItem、定义、正式 Contract / Plan、Context 和检查目录，安装原准入中的 Node 检查，并接入原 Task 的 Windows 累计时钟。固定任务包通过只读 `task-packet.txt` 附件交给 OpenCode，Native 在创建进程前逐字核对原包；任务包为分行JSON，最多32KiB、1000行、每行1800字节，转义后的包装也先核对容量；每次模型发送前核对SDK附件中全部编号行及原末尾行数，缺尾或替换不发送。原模块 / 检查 / 任务包摘要在退出后复核。CLI 不直接携带整份任务 JSON，也不提供任意命令、模型地址或 Credential 参数。

`runOpenCodeWorkspaceRuntime` 选择固定 `opencode-host-gateway-provider.mjs`。实际 OpenCode / AI SDK 的每个模型步骤经同一原 OS 身份认证管道交给宿主；返回的文本或工具调用再经 SDK 调用原文件 / 固定检查工具。生产组合不选择 `workspace-fixture`，并显式关闭标题、摘要和压缩辅助Agent，避免隐含模型请求。既有演练入口成为同一 Native 引擎的显式构造回复适配器，保留原演练格式及限制。

沙箱仍使用原 AppContainer、无网络 capability、单子进程 Job 和原 Task 绝对期限。每个 Native 准备阶段、恢复运行前及每次新模型发送前重新检查同一完整宿主准入。运行上限为 180 秒与原 Task 剩余时间的较小值；没有增加 Task 预算，也没有绕过 Kernel 的累计用量或当前授权。Windows时钟首次独立采样WMI开机身份及当前宿主的OS创建时间；同一可信工厂的后续读取先原生核对该宿主仍为原进程，再重用开机pin并采样实时UTC / GetTickCount64 / 机器身份。宿主重启后必须重新独立采样，不把持久Task锚点当作跨启动许可。

## 原模型请求与证据

`AgentRuntimeModelHost` 只接收可信代码安装的完整模型 / 账户 / 套餐 / 预算端口。完整原任务包摘要同时固定在模型header并与SDK实际附件投影核对；其准入摘要贯穿原启动输入、Native 配置、IPC 端点、模型帧和独立原模型账本。Human HTTP / CLI 请求不能安装端口或选择二进制、调用者、检查配方。

模型账本是独立私有格式1的只追加文件结构，不是项目数据库迁移：

- `agent-runtime-model-starts/<project>/<run>/` 保存不可重建的原开始及连续发送登记。
- `agent-runtime-model-originals/<project>/<run>/` 保存原请求、原响应和内容摘要。
- 新步骤必须按 `model_0001` 至 `model_0064` 连续登记。原请求先持久化再调用宿主；同请求重放已持久化的原响应。
- 原响应缺失、发送中断、原 call 目录缺失或原账本损坏保持 Unknown；未决步骤阻止以新 ID 继续发送。SDK 对同一输入的重试复用原 ID。
- 新开始只允许在独立原 Run 启动尚未被 claim 的准备阶段；普通重开 API 只读既有原件，不能补建丢失的原账本。文件摘要和双目录对应不等于跨机器密码学认证或真实账户批准。

输入、输出、工具名、步数和字节数均有上限。原 JSON 用严格解析及 fatal UTF-8 读取，拒绝重复属性、非法 UTF-8、摘要不符和跨准入替换。取消中断同一宿主等待，可能已经发送的请求保留 Unknown 与预算；迟到响应不触发自动重发或结清。

原操作采集现在连接模型原件、原 Native 配置 / 启动输入、IPC 请求 / 响应，以及独立文件 / 检查回执。模型步骤与工具步骤分开对应，模型请求不会被误算为 Native 文件效果；工具仍核对实际 SDK 身份、入参及输出。模型原件 `Observed` 仅表示原响应已记录，IPC 送达、真实账户保管链、账单结算和领域完成各有自己的证明要求。

当前模型宿主和引擎无法独立证明真实凭据读取 / 外部请求次数，因此 host_gateway 成功及异常记录均写未知 `null`，不沿用演练的零值。token 用量不生成现金 / 积分账单。

## 正式准入与领域结果仍待完成

当前专用真实提供方工厂仍拒绝真实调用，默认 CLI / 工作台正式 Agent 启动没有启用。仅确认智谱提供方，具体模型、套餐和现金 / 积分上限未确认；本批不读取 API Key、不进行真实或付费模型请求。可信接口不等于账户已经批准。

真实模型及原始账单端口、完整物理配额 / 历史容量 / 异常恢复、正式终态结果核验仍需继续。共享 Human 原观测能够持久化该路径的原件并通过 Kernel 记录 Unknown / 费用待核对；停止、SDK 最终文本、检查通过及模型原响应均不自动满足 Task 或产生 ReadyForDelivery。

V1-21 真实技能与统一 Plan / Task 前 Human / Matt 澄清、V1-22 独立 Matt / 当前源码 Superpowers / 真实行为对照、V1-10 正式工作台执行及 V1-11 真实普通 Change 全链路仍未完成。242 Schema、用户项目库格式10保持；没有自动升级用户库或清理旧电脑 Unknown 资源。

## 接入与验证

获准的宿主应通过可信应用装配安装 `LocalAgentStartCustody`、`LocalAgentCheckAdmission`、原二进制和 `AgentRuntimeModelPort`，再调用组合的 `start(originalRunId)`。`model.check(scope)` 必须核验完整真实关系及当前预算；`execute` 必须使用原调用身份完成受控账单 / 网络发送。不能用空检查、构造 ALLOW 或公开测试 Key 接入正式产品。当前缺少真实端口时保持拒绝，页面不能以 JSON 参数代替它。

可操作的本机无付费组合回归：先使用 Node >=24.15 <25、pnpm12.4.2 执行 `pnpm check`，再运行 `pnpm exec vitest run tests/scenarios/agent-host-model-runtime.test.ts`。它必须在 Windows x64 实际运行，不能把跳过当通过。该文件验证实际 AppContainer / OpenCode / SDK / 原模型 IPC / 固定 Node 检查 / 原启动及预算组合，模型回复与完整账户资格明确为构造，不能作为真实 Skill、模型或 S1 验收证据。新测试保留全部原夹具资料；Native 只处置本次所属资源，失败或 Unknown 不批量删除 Temp / Profile / 映射。

固定352个源码 / 测试 / Native / 配置后，首次受影响回归实际匹配11文件 / 71项：69通过、2失败、0跳过、退出1；包括实际Windows累计期限4项、SDK固定检查3项和文件工具4项通过。新共享模型场景的原Bun1.3.14崩溃退出3，原运行文件宿主准备另发生workspace_broker_build_failed，后者原编译错误原因未确定。首次失败不由后续复验覆盖；正确IPC文件漏选；同源复验3文件 / 19项为18通过、1失败、0跳过，原运行5项和IPC11项通过，新模型正向仍在整体180秒测试期限中断。随后仅将新测试整体期限校准为360秒以覆盖夹具准备、原180秒执行及采集 / HTTP观测，Task预算 / Native上限 / 业务断言和实现不变；前后源码清单分别保留。校准后新增Windows Native文件实际3项：2通过、1失败、0跳过、退出1；正向原模型响应仅2步，原Runtime记录workspace_rehearsal_deadline，Native原清理记录agent_sandbox_task_deadline、resources_disposed true，原进程退出12。它没有到第三模型响应及完整正向采集 / HTTP观测断言，因此不是完整组合通过；真实执行期限与准备开销仍需继续处理。pnpm check、编译CLI帮助、242 Schema / 项目库10核对及19文档UTF-8 / 围栏 / 本地链接通过；这些是受影响范围，不是全仓库或完整S1。

最终逐阶段验证、失败与固定源码范围见[本批研究记录](../research/CimiLoop-宿主模型与正式Runtime执行组合-2026-10-09.json)。附件选项依据本机固定版本的[OpenCode v1.18.34 CLI 源码](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/cli/cmd/run.ts)，实际生效仍以本机 Native 回归为准。