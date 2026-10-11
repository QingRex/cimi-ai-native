# CimiLoop Skill 原应用执行与结果采集 v0.1

2026-10-11 D-271：原 Skill 结果采集已接同一 child 原调用/hold/认证最终账单与父币种，分别核现金和积分；Kernel 可记录已核定子费用，仍保持 Unknown、原预约和 Task 待核对，不能以账单代替成功或父费用结清。旧未知费用证明保持兼容，正式 Agent 关闭、零付费、242 Schema/库10及完整五组active不变，详见 [D-271实施记录](CimiLoop-Skill原账单用量与领域观察-v0.1.md)。

2026-10-11，D-270。本批把原 Skill 子操作的共享应用服务、Windows Native 组合、独立原件采集和 Kernel 观察接成可执行路径。正式 Agent 默认入口仍关闭，242 Schema 和用户数据库格式 10 不变；本批不是完整 S1 验收。

## 可执行能力与接入位置

共享执行服务从 Kernel 中已有的父 Run、子 SkillInvocation 和原启动登记读取身份。请求丢失、启动回执丢失和重复 start 都沿用原 invocation、operation、dispatch ticket，不重新保留预算、不重新启动 Native、不重发模型请求。当前已完成的原 Native 可以在原父 Run 为 Unknown 后继续只读查询和采集。

新增 LocalSkillInvocationResultCollection，是可信代码安装的共享采集器及 Kernel readResult 核验端口。其输入为原执行上下文、原启动 custody 和原方法材料服务；不从工作台请求接受任意执行工厂、资格断言或模型端点。生产组合可把实例的 readResult 方法绑定给已有 Skill 证据核验端口，调用 capture(originalInvocationId) 后，使用原 invocation、Agent、命令身份和 revision 提交既有 RecordSkillInvocationObservation。Kernel 继续是唯一业务权威。

采集器独立读取原方法、材料、Native 结果、模型请求响应、IPC 请求响应和专用账户调用账本。只有原件均为完整 Observed、模型与专用账户 call_id 序列一致、原预算和要求固定、原派发材料 digest 一致时才保存候选结果。保存每份原字节为不可变内容引用，并在保存前后重新核对原件；Kernel 核验时重新读取原物理文件、不可变副本和完整关联事实。修改候选输出、自洽替换原件副本、伪造成功或已知零费用均拒绝。

readResult 在 Kernel 写事务内使用现有只读 Reader，保持完整原身份核验，避免嵌套 readSnapshot 开启第二个事务。观察产生的领域变化仍由 Kernel 自己提交；证据缺失不产生领域事件。

派发证据只绑定不可变 ticket 和材料摘要。原启动回执由 Unknown 补为 returned 是对同一派发的新观察，不能使先前采集的原件失效；补登记不重新执行 Native 或模型。新的采集器实例可重新核验历史引用；同一采集器的重复 capture 使用同一观察时间并返回相同引用。

## 成功、预算与账单边界

本端口当前只输出 unknown、cost_known=false、direct_observation 和空 resolves_observation_refs；独立采集到的合法方法输出仍是候选。资格、模型账户 custody、真实行为对照和账单均未因此获得批准。Kernel 中原 Run 保持 Unknown，Task 保持 pending_reconciliation，原预算保持占用；采集不完成 Task、不结算现金或积分，也不授权再次产生效果。

这是已经可运行的原执行与结果入库路径，同时保留尚未证明的条件。正式 success 需要接入独立资格、账户和费用证据及对应领域核验，不能把本端口的固定 false 字段改成 true 来放行。

## Windows 原生组合修复

实际共享 Skill 工厂此前分别遇到长物理 SQLite 文件名、C# 编译器输出限制、CLR helper 加载限制和 IPC helper 文件名过长。修复均保持原操作身份与原物理登记，不把旧路径不存在解释成已处置。

- SQLite 仅在 DatabaseSync 驱动入参使用 Windows 扩展文件名；账本内原路径、内部格式和 Schema 不变。
- C# 编译使用单次新建的短临时目录。冻结原编译器、原源字节、原输出路径与编译参数，记录 prepared/completed/disposed 或 failed；逐次检查源与编译器摘要，使用排他复制把真实输出放回原输出位置。成功只清理本次创建且内容精确匹配的临时目录；失败保留本次原登记，拒绝隐式重建。
- Runtime 在创建模型或开始编译前检查原 Runtime、身份 helper 和 IPC helper 的 CLR 可执行路径，计入 .config 后须短于 260 字符。实际公共诊断中 exe 路径 252 字符可以进入 Main，253 字符及以上在 Main 前退出；不以路径别名或复制后运行替代原操作证明。
- 新 IPC 缓存使用内部 layout 2：完整源码摘要目录下的短 ipc.exe 文件名。读取旧完整缓存保持兼容；已存在的旧或新缓存缺失文件、标记或摘要不符时拒绝重编译、拒绝自动回落。此变更不升级用户库。
- 原生场景在当前仓库下创建有界的新隔离仓库，使用真实 .git/cimiloop 数据目录；新增精确 /_??????/ 忽略规则。测试保留该批原件，不批量删除旧 Temp、Profile、映射或 Unknown 资源。

## 捕获容量与不变式

从现有上游完整边界计算最多 1,649 份原件：32 份材料、128 次方法调用、64 次模型调用、128 次 IPC 交换及每模型调用 10 份专用账本原件。聚合原字节上限约 248 MiB；证明元数据最多 8 MiB，使用 UTF-8 严格解码和唯一 JSON 序列化，最多 100,000 节点、深度 64。重复键、非规范编码及超限证明拒绝。容量测试覆盖大于 1 MiB 的合法完整元数据；这些是逻辑读取上限，尚不是磁盘物理配额或历史容量验收。

## 验证及证据边界

最终冻结源码复验：受影响 22 文件 299 项、Windows 原生 5 文件 30 项全部通过，失败/跳过均为 0；pnpm check、CLI 帮助和 242 Schema 无漂移通过，693 份源码冻结前后摘要一致。此范围不等于全仓库或完整 S1 验收。

最终验证范围、报告摘要、源码冻结摘要和保留原件见 [D-270 研究记录](../research/CimiLoop-skill-application-result-2026-10-11.json)。执行计划见 [D-270 计划](../plans/2026-10-11-cimiloop-skill-application-result.md)。受影响回归包含实际 Windows 长路径和 C# 编译测试；另行执行五个 Windows Native/AppContainer 场景文件，跳过不计通过。类型检查、CLI 帮助、242 Schema 对比、源码冻结一致性和本批 Markdown 链接检查均使用独立 D-270 报告。

新完整场景实际经过共享工厂、Native、AppContainer、OS IPC、SDK 命名工具、原专用账本、不可变采集与 Kernel 观察；包含丢失启动回执、迟到原回执、重复请求、采集器重建和伪造结果拒绝。场景使用本地 TLS、公开虚构凭据、构造模型响应和受控资格/准入绑定；八步模型交互、七次真实 SDK 工具调用不构成真实智谱模型、真实 Skill 资格、Matt/Superpowers、真实账户账单或 S1 证据。实际原生检查和候选方法结果应按各自证据范围解释。

开发过程中长路径、编译输出、CLR helper、IPC、Kernel 嵌套事务、完整容量和迟到回执的失败均保留独立记录。无原件的探针和先前修复阶段通过不能替代最终范围的报告。

证据缺口：本批初期误用了旧 D-269 检查脚本，覆盖了被 Git 忽略的 d269-check-final.log 及其元数据；覆盖内容另存为 D-270 误用记录。Git 中 D-269 研究记录、其回归报告、CLI/Schema 和源码冻结资料未因此更改。D-269 原类型检查日志及元数据已无法据本地文件重新核对，本批 D-270 新检查不能修复这段历史证据。

## 本批接入回归命令

先在本机选择 Node >=24.15 <25 和 pnpm 12.4.2，再在仓库根目录执行以下固定检查；普通 PowerShell 当前 Node 24.14 不符合要求。本批使用已核对的本机 Node 24.19，不能从旧电脑绝对路径推断新电脑工具可用。

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check
node apps/cli/dist/bin.js --help
pnpm exec vitest run tests/scenarios/skill-invocation-native-runtime.test.ts tests/scenarios/agent-workspace-ipc-runtime.test.ts tests/scenarios/agent-named-method-runtime.test.ts tests/scenarios/workspace-tool-runtime.test.ts packages/runtime-adapter/test/native-control-runtime.test.ts --maxWorkers 1 --testTimeout 240000 --hookTimeout 120000
```

这些原生场景必须在符合交接要求的 Windows x64/AppContainer、真实本机 OpenCode 与 .NET 编译环境执行；runIf 跳过、假模型能输出 JSON、单项候选为 Observed 均不代表完整范围通过。Skill 场景不读取真实凭据、不联网付费，会保留本次原件及有界隔离仓库。上述命令用于本批受控接入回归，正式账户接入与真实普通 Change 验收仍须完成剩余 S1 条件。

## 仍需完成的完整 S1

V1-09 的正式 Runtime 组合、独立领域成功核验、完整账户/工具/模型关系、实际费用预算账单、物理配额、历史容量与异常恢复；V1-21 的真实 Skill 和创建 Plan/Task 前 Human/Matt 澄清；V1-22 的 Matt 独立完整评审、Superpowers 对当前源码的新鲜验证及真实行为对照；V1-10 的工作台正式 Agent 执行、查询、停止及原操作恢复；V1-11 的真实普通 Change 到 ReadyForDelivery、真实技能、中断恢复、S1 验收和接入测试指南，仍全部属于活动目标。

用户目前只确认智谱提供方，具体模型、套餐、现金上限及币种、积分上限仍待确认。未读取真实 API Key，未执行真实付费请求，凭据保持仓库与实际数据目录外；本批只本地提交，不推送。
