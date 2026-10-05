# CimiLoop Runtime 探针与隔离 v0.1

> 日期：2026-10-04。
> 状态：V1-09实施中。独立探针、Windows隔离、候选登记、真实智谱合成修改 / 独立评价及原生Provider评测 / 受限绑定已接通。D-196新增受管理合成操作的资源归属、恢复清理与超限停止。D-197进一步实现默认无网络Capability、生效网络 / 费用策略快照及未实现限制的启动前拒绝；实际公网TCP / 回环TCP与UDP观测、显式宽权限证明和CLI拒绝通过，主机白名单及费用硬上限仍未实现。Task绑定、Agent Run、网络 / 费用 / 文件系统硬上限与完整恢复验收仍待完成。数据库格式8，未升级用户库。
> 上位入口：[V1可执行设计与实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md) §6.1、V1-09及A9。

后续D-198已完成无网络Capability下的OpenCode 1.18.34合成IPC传输：准确AppContainer SID / 实际PID与创建身份核对、帧限额及重放校验、内容只读模块兼容、取消 / 原生崩溃与归属恢复验证均接通。外部模型请求和实际Key读取0，HTTPS主机 / 路径 / 模型强制限制与持久预算预留 / 可靠计费仍待实现，controlled_execution、正式Task绑定及Agent Run不提升。 见[Runtime IPC传输](CimiLoop-RuntimeIPC传输-v0.1.md)；合成transport-probe结果不能替代原RuntimeProbeResult或真实模型契约证据。

## 1. 实际结果与版本

本机OpenCode由1.14.24更新到npm发布的1.18.34，版本命令与隔离内版本探针均确认1.18.34。本批固定原生可执行文件副本，SHA256为`5283c2cd5b4285855daa97e6f7d17bf48146227cdf2a940e79e0f2b7869fd06e`。更新授权来自用户明确请求；仓库Node24.15.0 / pnpm12.4.2基线保持。

实际探针快照见[2026-10-04 OpenCode探针结果](../research/CimiLoop-OpenCode-Runtime探针-2026-10-04.json)。快照将本机绝对路径改为仓库相对引用，原始字节摘要保持。运行日志、隔离证明和文件输出位于本机`.cimiloop/runtime-probe-v1-09/blobs/`，不提交可执行文件、临时数据库或凭据；其他机器应重新执行探针，不能将这份主机事实当作自身隔离证明。

| 实测项目 | 结果 | 含义 |
|---|---|---|
| 1.18.34版本及`run --pure --format json --model --agent`接口 | 实际命令可用 | 后续绑定须固定探测版本和文件摘要 |
| 写入模式：允许读取 / 写入合成工作区 | 通过 | 不指向用户原工作区 |
| 只读模式：允许读取，拒绝写入合成工作区 | 通过 | 独立评价工作区另建 |
| 读取 / 写入隔离区外的受保护文件 | 两种模式均拒绝 | 使用合成保护文件，没有读取真实人类凭据 |
| 创建`cmd.exe`子进程 | 两种模式均拒绝 | 本批不支持Shell检查或任意工具启动 |
| 连接实际可达的`127.0.0.1`人类入口替身 | 两种模式均拒绝 | 先由可信控制端确认监听器可达，避免把服务不存在误当隔离 |
| 真实`opencode/big-pickle`请求 | 1.14.24及1.18.34均收到403 | 原响应为`FreeTierError`，不能归一化为成功 |
| Zen首批真实修改及独立评价会话 | 未完成（历史） | 第一模型请求失败，未伪造第二会话 |
| 专用智谱`zhipuai-coding-plan/glm-5.3` | 真实两会话通过 | 修改实际文件后，新状态 / 新AppContainer / 只读会话独立验收；不产生任务ALLOW |
| 原生Task / WorkItem / Run授权集成 | 待实施 | 探针不修改任务、需求、预算或Gate |

403原文为“OpenCode's free tier can only be used from within OpenCode”。已保存新版原始响应及实际会话ID，`Failed/provider_error`进入探针结果。服务拒绝的根因尚未确认；它不能证明所有OpenCode模型或付费专用配置均不可用。未添加伪装请求头或借用人类登录。Claude Code备选仅确认本机版本2.1.278；尚未完成其隔离 / 模型契约探针，没有切换正式Provider。

OpenCode的配置会合并，权限默认值不能替代本项目授权；因此探针使用新配置目录、独立状态和默认拒绝的工具权限。接口资料见[官方配置](https://opencode.ai/docs/config/)、[官方权限](https://opencode.ai/docs/permissions/)和[官方CLI](https://opencode.ai/docs/cli/)。免费模型说明见[官方Zen文档](https://opencode.ai/docs/zen/)，实际是否可用仍以本次请求为准。

### 1.1 专用智谱连接与本机实测

用户明确提供智谱API Key用于CimiLoop，本批使用官方Coding Plan端点`https://open.bigmodel.cn/api/coding/paas/v4`，模型`zhipuai-coding-plan/glm-5.3`。该端点及OpenCode的Provider选择见[智谱官方OpenCode说明](https://docs.bigmodel.cn/cn/coding-plan/tool/opencode)；模型编码另与实际Provider注册表核对。普通API使用另一个固定官方端点`https://open.bigmodel.cn/api/paas/v4`，本批没有自动切换或额外测试按量接口。

本机Key以DPAPI CurrentUser加密保存在`%LOCALAPPDATA%\CimiLoop\credentials\opencode-zhipu-cimiloop.dpapi.json`，目录ACL限定本机操作者及SYSTEM。连接文件`opencode-zhipu-cimiloop.json`只含`format: cimiloop/dedicated-model/1.0.0`、固定provider / model、credential_file及加密文件的credential_digest；不含明文Key。控制端先核对加密文件摘要，再解密并仅向该次受限进程注入专用环境变量。固定官方端点、不接受任意配置 / Key字段，不读取或修改人类OpenCode登录。

OpenCode通过`{env:CIMILOOP_RUNTIME_API_KEY}`读取专用Key，model和small_model固定为同一模型，其他Provider关闭。操作键和输入摘要固定该连接及加密文件摘要；凭据变化在实际启动前记NotStarted，旧操作不重启。运行期间精确匹配Key的跨块stdout / stderr输出会被遮盖并记Unknown；含Key的合成工作区输出丢弃。观测完成后删除专用Runtime状态，不收集配置或会话数据库；正常日志保持原字节。若遮盖或清理失败，不能把该观测当成功原始证据。控制进程崩溃后的恢复器仍待实现。

本次实际修改会话为`ses_ef9ebd854ffe1safn1pIzQwdCb`，将input.txt从before换成after加换行；其后另建只读状态和AppContainer，评价会话`ses_ef9eb8018ffe4KNk6xB6kFaq0o`读取实际输出，最终回复PROBE_ACCEPT。两个进程均确认正常结束，隔离写入 / 只读边界通过，contract_probe_passed为true，formal_execution_enabled仍为false，用量仍cost_known=false。17项原始 / 输出引用逐项SHA256核对，仓库及本次探针文件明文Key匹配为0，两个模型操作的专用状态均已清理。

成功快照见[2026-10-04智谱实际探针](../research/CimiLoop-OpenCode-智谱Runtime探针-2026-10-04.json)，原始字节在本机`.cimiloop/runtime-probe-zhipu-v1-09/blobs/`，不提交凭据、程序或状态数据库。前批Zen的403快照保留；本次换用可用专用模型，不声称修复了Zen免费接口或完成了正式Provider准入。

## 2. 已实现适配边界

新增`packages/runtime-adapter`，只接受`scope: isolated_provider_probe`。它是V1-09先行验证入口，不接受用户仓库、Actor、人类角色、Task或WorkItem作为执行授权。新`RuntimeProbeResult` / `RuntimeOperationResult` / `RuntimeBoundaryProbe`使用协议2.0.0的严格Schema；没有新增可持久领域对象或数据库迁移。

`IsolatedProbeAdapter`提供`start/query/cancel/collect`：

- `start`先独占操作目录并同步保存操作键、输入摘要和运行器摘要，再启动独立可信监督进程。同键同输入查询既有操作；换输入拒绝。不完整占位或启动回执丢失保持未知，不能重新启动。
- `query`读取可信控制端的隔离证明、原始事件和监督心跳。进程仍活跃、明确终止和观测丢失分别表达；不通过PID猜测或杀掉可能已复用的进程。
- `cancel`仅写控制端取消请求。原生启动器真正终止Job并确认进程结束后，才产生取消事实。未知操作可请求取消，仍不能自行宣告已停止。
- `collect`保存内容寻址的原始stdout / stderr、隔离证明和普通文件输出，重新核对摘要。链接、过大文件或采集失败进入未知；原日志后续变化不改写已采集原始字节。

模型事件有错误时，即使CLI退出0也归一化为失败。缺少结束事件、错误JSON、冲突会话或未证明结束保持未知。Provider成功只表达合成探针完成，不产生Task满足或ALLOW；用量固定为`cost_known: false`，不能从“免费”名称推断正式累计成本。

独立评价仅在实际文件已符合合成验收条件后启动：新AppContainer、新状态目录、新会话、只读工作区，只传验收条件和实际文件。验收结论读取最终文本事件，不能把工具输出或提示词中的接受字样当成结论。首批Zen请求403，未执行该分支；续批智谱专用模型已实际完成该分支，仍只是合成探针。

## 3. Windows隔离实现与限制

受信任C#控制器在本机编译，通过AppContainer受限身份启动实际原生程序。权限仅授予专用工作区、专用运行状态和固定可执行文件副本；不修改已安装全局可执行文件或祖先目录ACL。Child只继承标准输入 / 输出 / 错误句柄，环境使用白名单；不继承主机环境中的API密钥、人类Gateway令牌、代理或任意Node选项。专用连接仅由可信控制端向本次Child显式注入经摘要核对的专用Key。控制器创建Profile所需的主机目录变量在启动Child前重定向到隔离状态。

启动前先把挂起进程加入Job，再恢复执行。Job限制一个进程、2 GiB内存，关闭Job句柄会结束运行；取消和实际运行时限由控制器落实。系统实现资料见[AppContainer Profile](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-createappcontainerprofile)、[进程创建标志](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)及[Job对象限制](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)。

OpenCode底层Bun会读取盘符根目录元数据，普通绝对路径触发`lstat C:\\`隔离拒绝。本批映射专用盘符，使根目录只对应当前合成沙箱；不放宽真实磁盘根目录权限。正常结束清理本Profile的ACL、Profile及精确盘符映射；清理失败进入未知，不能作为契约成功。控制器被强制结束或机器崩溃时可能残留映射 / Profile，需要后续恢复器核对所有权再清理，不能无条件删除其他盘符或Profile。

当前后端要求Windows x64及系统自带.NET Framework编译器。其他平台返回能力缺口，不退回普通人类权限进程。本机没有可用Docker后端，尚未实现Linux / macOS沙箱。

当前验证涵盖普通外部保护文件、子进程和IPv4回环替身，尚未覆盖正式Gateway及所有网络入口。InternetClient能力不是网络主机白名单；还需可验证的出站主机限制、可靠费用上限 / 计量、磁盘限制及崩溃清理。工具迭代上限不能代替费用上限。因此`formal_execution_enabled`始终为false，完整A9验收仍未完成。

## 4. CLI操作

新模型命令须先按[网络与费用策略](CimiLoop-Runtime网络与费用策略-v0.1.md)准备probe-policy.json，显式选择探针范围联网及未计费模式；省略策略默认禁止网络。技术探针不要求初始化Project。输出目录保存技术事实，不修改权威数据库。PowerShell示例：

```powershell
node apps/cli/dist/bin.js --json runtime probe `
  --binary 'C:\Users\chaol\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe' `
  --output-dir '.cimiloop/runtime-probe-v1-09'

# 显式验证真实模型，只使用合成文件；默认每个操作最多90秒
node apps/cli/dist/bin.js --json runtime probe `
  --binary 'C:\Users\chaol\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe' `
  --output-dir '.cimiloop/runtime-probe-v1-09' --model-probe --max-elapsed-ms 60000 --execution-policy-file 'probe-policy.json'

node apps/cli/dist/bin.js --json runtime show <operation-key> --output-dir '.cimiloop/runtime-probe-v1-09'
node apps/cli/dist/bin.js --json runtime cancel <operation-key> --output-dir '.cimiloop/runtime-probe-v1-09'
node apps/cli/dist/bin.js --json runtime collect <operation-key> --output-dir '.cimiloop/runtime-probe-v1-09'

# 使用已保存的专用智谱连接；密钥不进入命令行或仓库
node apps/cli/dist/bin.js --json runtime probe `
  --binary 'C:\Users\chaol\AppData\Roaming\npm\node_modules\opencode-ai\bin\opencode.exe' `
  --output-dir '.cimiloop/runtime-probe-zhipu-v1-09' --model-probe --max-elapsed-ms 90000 --execution-policy-file 'probe-policy.json' `
  --connection-file "$env:LOCALAPPDATA\CimiLoop\credentials\opencode-zhipu-cimiloop.json"
```

省略`--model-probe`只验证版本与OS边界，`contract_probe_passed`仍为false。启用模型探针后失败退出1，保留完整严格结果。坏参数退出2，缺少探针操作退出3，能力不可用退出1；JSON输出保持现有CLI错误结构。目录与操作键需分别指定，不通过CLI传入任意运行命令或人类身份。

## 5. 本批验证及下一批

首批D-192适配层测试包括真实Windows双模式隔离、活跃进程取消、同键重放、不同输入冲突、实际超时、原始字节固定、丢失启动回执不重新启动；错误归一化、输入路径 / Windows设备名、环境及严格结果也覆盖。CLI验证严格参数 / 缺项 / 目标错误和失败不创建Project。当批Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及26个测试文件250项通过，包含10项适配层及3项CLI测试、此前全部迁移 / 专业复核 / 运行回归；决策账本D-192记录该历史证据，不用测试通过数替代真实模型验收。

续批D-194新增5项测试：专用连接严格字段 / 官方端点、跨块输出精确遮盖及UTF-8字节保留、合成凭据DPAPI真实加解密 / 摘要变化拒绝、摘要变化在原生启动前记NotStarted且同键不重启、CLI拒绝明文Key字段且不回显输入。D-194当批构建、类型检查及全量28个测试文件262项通过；当批未改变Protocol Schema或格式7。真实智谱合成修改及独立评价由§1.1的实际会话 / 原始字节另行证明，实施基线第10节与D-194同步记录。

后续D-195已完成[Provider证据、评测与受限绑定](CimiLoop-Provider证据评测与受限绑定-v0.1.md)：真实智谱字节导入后技术契约ALLOW，仅批准合成探针范围；受控执行缺口阻止Task绑定。下一步落实网络主机 / 费用 / 磁盘 / 崩溃恢复，核对当前授权 / Context，再接Agent预约 / Gateway身份及原始结果归属。不能用合成操作、探针ALLOW或任务ALLOW替代这些条件。技能Provider及Matt / Superpowers仍按V1-21/22进入S1。

D-195另修复Windows结束证明在原子替换或独占读取时的EBUSY竞争：query / collect对暂时不可读事实返回Unknown，等待器只在原时限内重读；同操作键不会重复外部启动。真实Windows独占锁测试验证锁解除后恢复原始证明及原观测。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全量30个测试文件283项通过，当前格式8；首批Adapter自身不写领域库，格式演进由原生Provider治理承担。

D-196已补充[Runtime恢复与资源限额](CimiLoop-Runtime恢复与资源限额-v0.1.md)：资源副作用前保存归属，Runtime原子加入Job，核对精确进程身份后限定清理；采集 / 结束证明丢失仍Unknown，同键不重启。原生沙箱逻辑总量 / 条目 / 单文件100ms采样停止，日志合计在写入前限长，控制摘要固定实际限额。实际Windows资源超限及CLI恢复已验证，初次日志未完成观测保留，修复后另用新键核验；模型请求和实际凭据读取为0。既有探针Schema、冻结v1及数据库格式8保持；完整硬配额和正式Task执行仍未验收。

D-197已补充[Runtime网络与费用策略](CimiLoop-Runtime网络与费用策略-v0.1.md)：默认无网络Capability、执行策略固定及未实现限制启动前拒绝；真实Windows网络观测、OpenCode无模型版本 / 双模式边界和CLI核验通过。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全量32个测试文件307项通过。下一步先验证可信模型网关的沙箱传输，再实现主机限制、持久预算预留和可靠计费；补齐文件系统硬上限与完整恢复验收后，接正式Task绑定及可信Agent入口 / Run。

后续D-199已实现宿主HTTPS网关核心和独立SQLite持久预算：固定合成主机 / 路径 / 模型 / 输出上限，TLS验证、响应限额、请求前预留、跨进程竞争及Unknown预留保留通过验证。CLI合成探针12项全部通过，实际Key读取与外部模型请求0。AppContainer IPC与网关尚未桥接，真实Provider计价及受控执行未验收，正式Task绑定与Agent Run继续关闭。 见[宿主模型网关与持久预算](CimiLoop-宿主模型网关与持久预算-v0.1.md)。下一步接通准确身份核验的AppContainer IPC与宿主网关，先验证OpenCode经IPC收到合成HTTPS回复，再实现可靠真实计价 / Provider验收；补齐文件系统硬配额与完整恢复后接正式Task及Agent Run。 本批结果不替代真实模型契约或实际账单，既有Runtime host_allowlist / required_cap仍拒绝，Provider受控执行不提升。

2026-10-05后续D-200已接通无网络AppContainer中的OpenCode IPC与宿主HTTPS网关：固定模块、准确进程身份、私有目录及策略摘要贯穿请求和回复，发送前持久预留，取消 / 崩溃保留Unknown预算。实际OpenCode 1.18.34完成2次合成HTTPS请求，9组桥接异常 / 恢复实测通过；实际Key读取与外部模型请求0。真实Provider计价及受控执行仍未验收，正式Task绑定与Agent Run继续关闭。 规则见[IPC宿主网关桥接](CimiLoop-IPC宿主网关桥接-v0.1.md)。下一步建立真实Provider可核验的计价上界及公网DNS / 固定地址 / 重绑定防护，再做真实网关契约验收；补齐文件系统硬配额与完整恢复后接正式Task及Agent Run。 既有host_allowlist / required_cap仍拒绝真实Runtime启动，本批不提升Provider受控执行。

2026-10-05后续D-201已实现固定智谱Coding Plan公网DNS / 一次性地址固定及TLS对端核验，实际两条A / 两条AAAA与所选IP的TLS1.3验证通过；新增有期限的GLM-5.3积分估算及计费缺项查询。公网连接探针的模型端点HTTP、真实Key读取和外部模型请求0，未启动Runtime。积分估算不作为实际费用或准入证明，真实网关计费与正式Task / Agent执行仍未验收。 见[公网网关边界与积分估算](CimiLoop-公网网关边界与积分估算-v0.1.md)。下一步确认专用连接的套餐版本及网关适用环境，建立包含思考Token的输入 / 输出上界、积分与现金预算的明确关系及持久预留，再验收真实HTTPS / Runtime契约；文件系统硬配额与完整受控恢复仍待完成。 本批仅验证连接层，既有真实Runtime host_allowlist / required_cap保持拒绝，Provider受控执行不提升。
