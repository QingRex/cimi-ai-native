# CimiLoop 命名方法资格规则与原始效果重放 v0.1

> 2026-10-07，D-217，V1-21 续批。新增独立的命名方法评测规则、原始对话与 SDK 效果重放、本地资格准备组合器。真实模型 / 账户 / harness 原账本核验宿主尚未接通，生产执行保持关闭；完整目标继续按 [V1 实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)推进。

## 独立规则及其范围

`named-skill-method-assessment/1.0.0` 使用单独的严格证据和评测 Schema；证据固定项目、原 Descriptor / 摘要、Runtime Binding / 摘要、方法名、用途和原调用键。它作为内容寻址记录保存，没有添加原生 Provider Evidence / Evaluation 分支，不改变格式 10 或既有 Binding 批准条件。

旧 `skill-provider-assessment/1.0.0` 继续要求内置 `skill` 工具成功加载，D-211 的实际失败证据保留。命名方法保留 `invoke_skill` / `read_method_resource` 与实际 SDK `read` 的分别归属；新规则的 `builtin_skill_qualified` 始终为 false。

| 评测 Profile | ALLOW 的含义 | 仍不能由此获得的权限 |
|---|---|---|
| `method_contract` | 固定包 / Schema / 请求 / 提示词与全部资源一致；对话映射、SDK 读取、原 Native 结束及输出契约能完整重放 | 不证明外部模型来源、原账户用量、方法行为、harness 或正式 Task 准入 |
| `controlled_execution` | 上述检查通过，至少两个不同原会话和 Native 上下文；可信宿主重新核验全部原始效果及受控条件 | 不批准 Runtime / Task Binding，不授予 WorkItem 权限，不推进 Task / Gate |

任一检查明确失败得到 DENY；缺少证明得到 NEED_MORE_EVIDENCE。评测的 `formal_execution_enabled` 始终为 false。导入的评测、ALLOW 标签、Native 日志和模型自报不能单独成为授权。

## 从原始请求重放

公开命名演练桥现在在发布 IPC 回复前保存 `fixed-method-transcript.json`：每次原 SDK 输入、上游已解析回复以及实际映射回复。文件最多 33 个交换；本地核验还限制字节、JSON 深度与节点、请求 / 回复和 SDK 日志范围。历史旧演练没有这个文件时，不能凭旧的成功快照补造完整证明。

`replayFixedMethodTranscript` 从首个原请求建立空适配器，重新核对来源 / 请求 / Profile 摘要、每个请求 ID、完整历史、固定工具及额度参数、入口与依赖次序、原调用 ID、所有资源的完整 EOF 读取、映射回复和最终严格输出。请求重用、历史改写、截断、额外工具、遗漏资源或完成后追加交换均拒绝。

本地评测同时核对准备器实际生成的固定提示词。实际锁定 Windows 启动链会把 CLI 提示词保留为 JSON 编码字符串；只接受原文或这一完全一致的编码形式。锁定 SDK 会把无可见内容的 SSE assistant 空字符串记录为 null；只容许有工具调用的 assistant 消息中这一个确定的空值转换。任何可见文本、工具参数或历史变动仍拒绝。

`verifyFixedMethodSdkEffects` 另读原 SDK stdout 与 Native 结束证明，核对进程 / AppContainer 标识、正常退出、唯一原会话、工具数量与顺序、原 `callID`、只读路径、每份完整输出摘要以及最后正常结束的 JSON 内容。对话中声称读过资源不足以通过，SDK 中缺失、重复或不同的实际效果也会拒绝。

上游回复保留的是原桥已解析的结构，`response_digest` 指向原响应字节。重放本身不能重新证明响应来自真实服务端；受控资格必须由宿主回到受保护的原 IPC / 模型 / 账户账本核对原请求、原响应字节、身份及费用，不能把这个摘要或可导入文件当作服务端证明。

## 本地准备与实时准入

`LocalNamedSkillMethodAssessment.evaluate` 重新读取实际 Git 包、Schema、输入、资料、完整对话、SDK 日志和 Native 证明；用途、来源、原调用、会话和上下文必须一致。可信核验之后再次读取全部固定输入和证据，拒绝期间变化。

受控评测逐个原样本要求真实模型来源、运行归属、独立上下文、Provider 依赖、权限交集、费用 / 上界、原调用恢复及方法行为证明，并检查实际包声明的每个 `harness_requirements`。任一声明未落实都保持缺项；Matt 的 Human 分轮 / 委派 / issue tracker 和 Superpowers 的新鲜验证输出不能因资源读取成功而省略。

`qualificationVerifier` 实现 [实际输入准备器](CimiLoop-技能真实输入与宿主准备-v0.1.md)要求的接口。可信应用提供原证据定位、`NamedSkillMethodOriginalsPort` 和当前执行准入核验；组合器计算受控结论并核对当前方法 / 用途 / Runtime Pin，调用实时准入，再重新计算结论、复核原证据定位，并在返回前第二次检查当前授权。仅完整且稳定的受控资格能保存为 `skill_method_qualification` 引用。默认本地 Human 应用没有安装这些原账本 / 执行宿主，不能凭导入报告启用正式准备。

实时准入仍须落实当前 WorkItem / Provider / 源码 / 预算 / 套餐资格、证据时效、资源范围及权限交集。上述准备不是 dispatch；实际发起模型或工具、效果缓存重放时，还须重新核验并按原调用键持久认领。Unknown 不启动新操作。

## 验证与下一项

最终验证及实际上游记录见 [D-217 验证记录](../research/CimiLoop-命名方法资格规则与原始效果重放-2026-10-07.json)。单元 / 场景正向受控 ALLOW 使用构造的模型 / 费用 / harness 核验回调；没有真实账户或方法行为批准。实际 OpenCode 验证使用公共合成服务，不读取凭据、不发起外部模型请求。

Matt 澄清 / 评审和 Superpowers 验证三个固定上游包的最终实际读取 / 原对话 / SDK 重放均通过，分别覆盖 4 / 5 / 5 份完整资源。三者的读取契约得到 ALLOW，无原账本宿主时得到 NEED_MORE_EVIDENCE，核定公共合成来源时得到 DENY；没有批准任何生产资格。

Node 24.15.0 / pnpm 12.4.2 下构建与类型检查通过。受影响的 9 文件回归首次通过 124 / 125 项；一项夹具预期了较晚的读取摘要错误，实际在更早的 Native 完成身份检查被拒绝。仅修正该断言并补充重复会话 / 上下文反例后，该文件全部 13 项重跑通过。按各文件最新验证合计 125 项通过；保留初次失败报告，没有宣称重新跑完全部 9 文件或整个仓库。

本批只增加 5 个独立 Schema，234 个既有 Schema 语义与原 checkout 字节保持；数据库格式 / 布局维持 10，没有升级用户库。

下一项是实现原模型 / 工具 / 账户账本读取和生产 Agent / Skill 宿主，再接正式 Runtime / Task 资格与效果驱动。Plan / Task 创建前的受控 Human 澄清、真实评审 / 验证与行为对照、实际工作区 / IPC 工具账本、原效果恢复、物理硬配额与正式费用准入、工作台执行 / 接续，以及普通真实 Change 到 ReadyForDelivery 的 S1 验收继续保留在完整目标中。
