# 原命名方法独立结果采集 v0.1

D-269 将 D-268 命名方法组合接入原操作的独立结果采集，并修复专用模型入口仍只接受普通工具的阻断。Kernel 继续独占业务状态；默认正式 Agent 仍关闭，242 Schema、用户数据库格式10不变。

## 当前可执行能力

`readAgentNamedMethodOriginals` 是只读入口。它使用冻结的 profile/files 和原 `method_original_binding`，核对原材料的字节及物理出生身份、独立锚、原请求/回复和有界完整目录。撤销执行权限后仍可读历史证据，缺失、替换或部分写入不能初始化、补写或重发。

`readAgentRuntimeNamedMethodResult` 独立读取原 claim/input/key、固定 Node 和控制器、config6、原资源账本及 suspended 证明；要求同一 Runtime、空网络能力、单进程上限、原进程正常退出且原资源处置完成，并对照宿主结果里的 suspended 副本和 stdout。原材料及原方法账本、完整模型账本、原 IPC 和真实 SDK 输出必须一起匹配。模型步按原 IPC ordinal 排序，每个方法效果必须处于对应模型步之后、下一模型步之前；全部固定资源均需确实加载，末步必须 stop，严格输出 Schema、purpose、review basis 对照冻结请求。

原模型头须匹配原 input 的 `model_original_binding`。采集关键原件后再次核对摘要和原身份，避免把一次读取中不同版本的原件拼成证明。`collectAgentRuntimeOperation` 的第四个可选参数接冻结方法资料；配置6显式产生 `named_method`，没有资料或证据不全时保持 Unknown。普通旧配置的返回形状不增加命名方法字段。

可信安装器可以在已有原子操作上调用：

```ts
const plan = actualMethodInputs.readInvocation(project, descriptor, invocation);
const collection = await collectAgentRuntimeOperation(
  originalChildRuntimeRoot,
  originalChildScope,
  undefined,
  { profile: plan.profile, files: plan.files },
);
```

这里的 root/scope 必须来自已有原子调用 custody，不能制造替代父 Run 或新 invocation_key。`named_method.status === 'Observed'` 表示当前原件支持固定方法结果的独立核验，仍明确保留 `model_account_custody_proven: false`、`costs_reconciled: false`、`domain_observation_produced: false` 和默认关闭标记。不得据此自行构造 Kernel 成功报告或把 Native 零费用字段当账单。

## 专用模型工具模式

`LocalSkillInvocationDedicatedAccount.createModel` 固定安装 `methodTools: 'fixed_named_method/1.0.0'`，仅允许完整的 `cimi_invoke_skill` / `cimi_read_method_resource` 对。生产专用请求 parser、重放、原 Host 头、编码器和历史读取共同检查此模式。普通工具和命名工具不能混用或后换。

新命名模式的内部专用模型原件使用格式2并固定 `method_tools`。旧格式1保持原字段形状与普通工具能力；新模式不能重写或自动升级旧原件。此格式属于 Runtime 内部原件，不改变用户数据库格式10或协议 Schema。

受控本地 TLS 回归证明真实专用生产工厂能达到发送边界、只占用一次原预算、重放不重复发送、历史读取可回收原响应。账户批准、地址、凭据和模型回复均为构造数据；没有真实智谱连接、真实费用或技能资格。

## 验证与保留的失败

最终固定范围：17文件269项；实际 Windows/AppContainer 2文件11项；均零失败、零跳过，进程退出0且日志无未处理错误。`pnpm check`、CLI 帮助、242 Schema 无漂移通过；688 源文件在最终验证前后及提交后无漂移。完整索引和摘要见 [D-269研究记录](../research/CimiLoop-named-method-independent-result-2026-10-11.json)。这是受影响范围，未做全仓库或完整 S1 验收。

先取得材料只读缺失 API 红灯和输出纯校验缺失 API 红灯。首轮 Native 在新拥有夹具 `cimiloop-named-runtime-NdmynQ` 的 Bun 1.3.14 启动阶段发生 Segmentation fault，未到结果断言，不算目标红灯；原件保留。第二轮 `cimiloop-named-runtime-yddr9K` 完成六次构造模型步及五次真实命名 SDK 工具后，结果 API 缺失才形成有效红灯。后续成功不解释第一次崩溃根因，不证明所有历史 Unknown 已处置。

实际 SDK stdout 包含原 suspended 事件，且当前 step_finish 的 part 没有 sessionID，必须以顶层 sessionID 和当前 messageID 对应；只允许这个明确格式差异。修补了初版 reader 因这些实际形状误拒绝正向证据的问题，不能拿手工构造事件替代真实输出。

工程评审要求补全原 IPC 因果窗、资源 Runtime/结束状态、模型头固定、关键 Native 原件终检。还有效复现了成对改写 suspended 证明及 stdout 的单进程上限后，初版 reader 错误返回 Observed；现补严格策略与 result.sandbox 对照，正式 Native 回归同时覆盖网络能力、上限、结果副本、资源身份、调用重排和追加输出的破坏并恢复当前新夹具。此前类型错误、无效测试形状和中间回归均保留，不混入最终通过范围。提交前检查另发现两个新增文件末尾空行；只修正格式后重新取得完整受影响及实际 Native 通过报告，修正前报告另行保留。

普通 Windows 沙箱进程启动助手出现访问冲突时，改用授权的本仓库命令完成检查；不把助手失败解释成 CimiLoop Native 已通过，也不批量清理 Temp、映射或 Profile。两个交接前临时文件保持原状。

## 剩余条件与下一批

当前仍未完成 `LocalSkillInvocationExecution.start → LocalSkillInvocationNativeComposition` 正常路径的完整正向证据，也没有从这些原件到 Kernel `SkillInvocationObservation` 的完整共享采集/核验服务。普通父 Run 的 SDK 完成核验对 step_finish.part.sessionID 的既有假设还需实际复验。生产材料读取和合法结构输出不等于方法行为合格。

V1-09 的完整账户批准、费用预算与真实账单、物理配额/历史容量/全异常恢复与领域验收，V1-21 的真实 Skill及全面 Plan/Task 前 Human/Matt 澄清，V1-22 的真实独立完整 Matt、新鲜 Superpowers和真实行为对照，V1-10 的正式工作台执行/查询/停止/原接续，V1-11 的真实普通 Change 到 ReadyForDelivery、中断恢复、S1验收和操作指南全部保留，持续目标 active。

只确认智谱提供方；具体模型、套餐、现金上限/币种和积分上限仍待确认，确认前不发付费请求。凭据仅在仓库及实际数据根之外按安全连接配置，不读取历史消息或写入日志/Git/Agent上下文。下一批优先正常原子启动和独立方法结果到 Kernel 观察；默认不 push。
