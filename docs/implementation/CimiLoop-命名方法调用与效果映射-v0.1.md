# CimiLoop 命名方法调用与效果映射 v0.1

> 2026-10-07，D-213，V1-21 续批。承接 [D-212 固定方法读取](CimiLoop-固定方法读取适配验证-v0.1.md)，实现版本化命名请求、固定资源与实际读取效果的映射。当前仅接入公共隔离演练宿主，正式 Skill 调用与 S1 尚未完成。

## 请求与固定资源

`NamedSkillMethodRequest` 使用 `cimiloop/named-skill-method/1.0.0`，包含原 `invocation_key`、入口 `method_name`、包 `source_digest` 和严格 `SkillMethodInput`。编译入口重新验证完整 Git 包证明，校验入口和声明能力；调用者修改过的 inspection 不构成来源依据。

`FixedMethodProfile` 使用 `cimiloop/fixed-method-adapter/1.0.0`，固定请求摘要、入口、依赖名称及全部资源路径 / 摘要 / 类型。`skill-request.json` 保存原命名请求，`skill-input.json` 保存方法输入，来源定义、references、review 制品及索引完整列入资源清单。scripts 和 agent 配置仍只在来源包中保存。Review 输入、索引、制品文件及 finding 引用必须逐项相符。

适配器在创建效果前拒绝缺项、重复路径、未声明或循环依赖、错误来源、Windows 设备路径、额外制品、非只读模式和双重加载 profile。锁定 OpenCode 1.18.34 的读取工具有 2000 行、单行 2000 字符及 50 KiB 的显示上限，见[锁定版读取源码](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/tool/read.ts)。当前适配拒绝超限文件，不把截断内容视为完整加载；大制品分段策略尚未实现。

## 命名调用与实际效果

演练宿主向上游显式提供 `invoke_skill({name})` 与 `read_method_resource({path})`。前者仅选择固定入口或声明依赖，后者仅选择清单中的输入、请求、引用及制品。入口须先完成读取，依赖须有已经完成的声明调用者；本版本每份资源允许一次效果，重复原调用可核对，换 ID 再读同一资源被拒绝。

适配器将每个命名调用转换为实际 SDK `read({filePath})`，保留原 `call_id`。命名函数、参数、上游请求摘要、SDK 请求摘要、精确原生路径和资源摘要在发布效果前落到宿主证明。下一轮重新核对实际读取结果的路径、连续行号、完整内容和 EOF；未完成、截断、篡改、伪造调用、历史重置或偏移参数不会算作已读取。

原始 SDK 事件仍是 `read`，不改名为内置 Skill。最终验证按同一 call ID、精确路径和输出摘要核对 SDK 事件，再核对原生进程结束、隔离策略、IPC、演练账本、输入文件保持及资源清理。全部固定资源已观察后，才接受严格方法结果；结果只能提出问题、候选内容或 findings，不能声明 Decision、Task 状态或 Gate。

## IPC、回执与恢复身份

命名投影改变了上游请求与 SDK 请求的摘要。新增 `cimiloop/fixed-method-projection/1.0.0` 同时固定来源 / 请求 / profile、两侧输入、映射后的 SDK 回复和原上游回复摘要。SDK 使用明确配置的 `cimiloop/fixed-method-transport/1.0.0` 核对，原生控制器使用显式 `--ipc-conversation-method` 固定 profile 摘要；旧入口保持原回复字段与校验，不接受命名投影。

上游账本回执保存原请求摘要和实际演练预留，不改写成 SDK 请求的回执。消费方分别验证 SDK 回复身份、投影来源及上游回执关系。缺少投影、摘要冲突、多余字段或移用旧回执都会拒绝。

`FixedMethodObservation` 使用 `cimiloop/fixed-method-observation/1.0.0`，保留 issued / observed 调用、完成请求和输出摘要。其 Succeeded 只表示适配层的资源及结果核对成立；外层原生演练必须另外通过，且两者都不构成真实方法行为资格。

调用目录按原 `invocation_key` 原子预约。同键重放只返回原有结果，并复核保存的原始证据；原记录未完成、缺失、内容冲突或篡改时拒绝重新启动。未完成调用保留 Unknown，终态结果不能被不同回复覆盖。普通 `IsolatedProbeAdapter` 及其 supervisor 明确拒绝此 profile，避免把合成宿主的命名契约直接送进持有凭据的旧驱动器。

## 验证与范围

三个 D-210 固定上游包均使用锁定 OpenCode、无网络 AppContainer、单进程 Job、公共 TLS / IPC 和合成回复完成命名映射。Matt 澄清为 4 次实际读取 / 5 次演练上游请求，包含 `grill-me` 与 `grilling`；Matt 评审与 Superpowers 验证分别为 5 次读取 / 6 次请求，包含固定 review 输入、制品与索引。同键重放核对通过，真实凭据读取和外部模型请求均为零。

首次联调暴露旧回复与回执不能承载双重摘要，保留了实际 Unknown / IPC 拒绝观测；实现显式投影后通过，不能据此描述为一次全部成功。构建、受影响回归、原始证明及来源摘要见 [D-213 验证记录](../research/CimiLoop-命名方法调用与效果映射-2026-10-07.json)。

新增 4 个独立 Protocol Schema；原运行、治理、证据与 Provider 评测规则保持，数据库格式仍为 9，没有升级用户库。本批没有新的领域事实表、正式调用记录、生产 CLI、资格批准或默认 Skill 选择。现有 `skill-provider-assessment/1.0.0` 仍要求内置 Skill 工具证据；本批不能代替该规则，D-211 的加载失败证明继续保留。

## 下一步与完整退出条件

下一步定义明确的原生 Skill Binding / 方法策略与版本化资格规则，将固定 Binding、输入、调用和结果接入正式 Context / Run；如改变领域存储，先完成显式迁移及旧记录核对。随后接真实澄清的 Human 分轮回答、固定 diff / issue 与独立评审会话，补齐声明的委派、命令、验证等宿主能力，开展 Matt / Superpowers 方法行为及对照评测。

完整目标还包括正式 Agent Runtime、原生授权 / 工具账本与 IPC 的连接、真实工作区效果及 Unknown 核对、费用准入与账单、物理硬配额和整体恢复。最小工作台的 Human 阶段已经实现，正式执行、状态与恢复需要接上上述事实。最终须用普通真实 Change 验证批准、Agent 执行、独立评价、真实 Skill 记录、接续及 ReadyForDelivery。全部仍按 [V1 实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md) 验收；本批不是目标完成或受阻结论。
