# 原 Skill 命名方法生产 Native 组合 v0.1

D-268 在原 SDK/IPC/Native 生产路径中增加固定命名方法模式，并提供 `LocalSkillInvocationNativeComposition` 共享应用服务。它不使用合成 conversation probe，不创建替代 Run，也没有启用正式 Agent 默认入口。当前证明范围是固定材料读取、原 SDK 身份对应及恢复合同，尚不能结算真实 Skill 或宣布 S1 完成。

## 可执行接入

可信安装器使用原 Skill 出生 custody、实际不可变资料读取器、已安装原专用账户和已批准连接：

```typescript
const port = LocalSkillInvocationNativeComposition.open({
  local: originalAgentContext,
  custody: originalSkillStartCustody,
  inputs: originalLocalSkillMethodInputs,
  account: installedOriginalAccountLedger,
  connection: approvedDedicatedConnection,
  binary: currentMachineQualifiedRuntimeBinary,
});
const service = new LocalSkillInvocationExecution(originalAgentContext, port);
// 只有完整当前资格和批准齐备后才执行；重复请求只读取原启动。
const original = await service.start(originalInvocationId);
```

这不是可经 HTTP/CLI 上传的工厂或资格声明。`inputs`、custody 和 account 必须是实际代码对象；伪造资料、资格标签或连接 JSON 不能批准执行。具体模型、套餐及现金/积分上限尚未确认，因此本批没有运行该例的真实付费请求。

`prepare` 重新从 Kernel/SQLite 读取原 SkillInvocation、真实父 Run、Provider 描述和方法包/输入/资料；逐次核对原 authority 与固定 plan，拒绝资料替换。子 scope 只改变原 invocation_key/input_digest，父 Run ID 不变。预算依据从当前父 Task/WorkItem 读取，使用整个实际 dataDirectory 下相同 project/task 时钟锚和原 first_started_at；不续期。所有等待之后及 Native、模型、工具效果之前都重读当前 Kernel 和原资料。异步授权回调不被当成同步批准。

子专用模型、原方法 Host、原 Native claim 与 SDK 模型请求均使用 `skill-runtime-originals/<project_id>/<原 invocation_key>`。子账户继续与父账户共享现金/积分总额及完整家庭费用边界。凭据物理路径必须同时处于仓库、子 Runtime 根以及整个实际 dataDirectory 之外，包括 linked-worktree 位于仓库外的共同 Git 数据根；初始化和实际读凭据之前都会重验。测试只使用公开占位路径，没有读取真实 Key。

## 方法、工具和原件

`AgentNamedMethodHost` 冻结实际 fixed-method profile 和所有文件，独立保留材料/header 的物理身份锚。只允许读取已固定的 entry/dependencies/request/input/reference/artifact；每份材料上限50 KiB，每次记录上限114688字节，原调用数量上限128。缺失或部分登记不补建；SDK call ID 对应同一 request/reply，参数冲突或原回复缺失保持不可证明。

SDK 只注册 `cimi_invoke_skill({name})` 和 `cimi_read_method_resource({path})`。这两个 custom tool 将命名方法映射为固定材料读取，不调用 OpenCode builtin Skill，不把加载文本称为真实技能行为。SDK session/message/call ID 独立派生原 call_id，IPC 记录请求/响应原字节，并比对实际 SDK 工具名、参数和输出。费用、领域结果及 Native 效果的独立核验仍是另外的证明，原字节对应不是这些证明。

实际 OS 命名管道只接受原 supervisor/peer。Host 在开放通道时要求模型许可为精确命名工具对；命名模式的 broker 独立拒绝普通文件读写/check，即使已认证 peer 发来旧格式帧也不进入旧 execute。Native 权限也只允许该工具对，禁止以普通仓库工具补足方法能力。

## 配置6和恢复

内部 Native 配置6只用于前瞻创建的命名运行，增加固定 `method_tools` 和原 `method_original_binding`。它绑定实际 profile/header/anchor、Node 原二进制、Task lifetime/deadline，以及原操作身份。旧内部配置1–5按原有规则读取；公共 Schema 242、用户库10及既有账户格式均不升级。

EOF、主动取消和负向执行事实读取器支持配置6，采集后再绑定原 input/operation、控制器及方法身份，拒绝混合或降级证据。资源恢复读取另分两条：结果读取严格要求 Node 与控制器原件；资源处置只跳过缺失 Node 的新鲜物理核验，仍要求原 claim/input/key、配置绑定和原控制器。恢复不重新启动 Run、模型或方法。

本批实际 Node 缺失反例仅针对新建且已结束的测试原操作：临时移动自己的 pinned copy，结果读取拒绝，原控制器幂等确认原资源已经 disposed，随后原样移回。它不是配置6孤儿活资源缺 Node 的完整验收，更不能证明旧电脑 Unknown 清理完成。普通父 Run 的领域终态结算仍只接受其原普通配置5和 file/check/domain 证据，不能把子方法配置6套作父 Run 成功。

## 证据范围和剩余条件

最终命令、计数、源码哈希、失败历史及现场路径见 [D-268研究记录](../research/CimiLoop-named-method-native-composition-2026-10-10.json)。实际 Windows 回归使用真实 Native/AppContainer、真实 SDK 与 OS peer，但方法包、模型回复、账户/资格均有明确构造边界。新 Local 工厂目前验证安装拒绝和替换 plan 拒绝；实际 Native 正向用例直接组合 runtime ports，尚未证明 `LocalSkillInvocationExecution.start → 新工厂` 的正常完整链路。

最初一次 Native 执行取得6个模型调用、5个方法工具调用，但测试用错采集 nonce 字段而失败。修正字段后一次二进制保留失败：保留 reservation 存在、目标副本不存在、SQL 未保留对应新行；只读记录没有证明底层 copy 失败原因。失败现场保持 Unknown，后续新夹具通过不能覆盖它。异步授权、broker 混用、配置6恢复及凭据数据根边界均先保留失败回归，再修补。

既有账户30秒同步写等待期间的完整 Task 时钟/取消资格仍未证明；本批直接构造模型的 Native 用例没有覆盖该条件。D-265 控制器访问违例、D-258 Bun崩溃及旧电脑 Unknown 也未据本批后跑通过宣称解决。

下一批应以实际不可变方法输入和原 Kernel 起点验证新 Local 工厂正常准备/启动，接通命名输出 Schema、原材料与实际效果的独立联合核验，随后原 Skill/RunObservation 与账单结算。必须补真实模型/账户批准、真实方法行为资格、Human/Matt 澄清、Matt 独立完整评审、Superpowers 新鲜验证、工作台正式操作，以及普通 Change 到 ReadyForDelivery 的中断恢复/S1证据与接入指南。完整五组目标继续 active；OpenSpec 可选、ECC按需参考。构造模型、自定义读工具或普通工程评审均不替代这些真实证据。
