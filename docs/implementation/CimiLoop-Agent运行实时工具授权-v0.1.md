# CimiLoop Agent 运行实时工具授权 v0.1

日期：2026-10-07。D-221 延续 [Agent Context / Run 固定关系](CimiLoop-Agent上下文与运行固定关系-v0.1.md)及[真实工作区工具宿主](CimiLoop-真实工作区工具宿主与运行恢复-v0.1.md)，实现独立的 Agent 当前权限查询。生产宿主、工作区工具的 Agent 消费及完整 S1 仍待完成。

## 独立入口与原运行身份

`CimiLoopKernel.assessAgentRunTool()` 在一致的只读快照中核对原生事实，返回独立 `AgentToolAuthorityAssessment`。请求固定 Project、原 Run / operation_key、执行者、Context 摘要、单个动作 / 资源、原 Runtime / Skill Binding 摘要及原 host_admission_ref。字段严格校验，不能携带 `verified`、权限对象或自行声明的正式执行标志。

可信 Caller 必须为 Agent，并匹配原生 Agent Actor 与 Runtime 身份。查询重新读取 Run、AgentRunRecord、AgentContextManifest、Task、WorkItem、源码和工作区快照；项目、需求、任务、执行者、版本基线、动作 / 资源、原操作和所有固定引用必须一致。原 Run 仅在 Reserved / Running、未取消、未释放且费用已知时可继续；它必须是 Task 的当前 Run，不能存在同一任务的另一未结清运行。

当前 Change / Task / WorkItem 状态、约定 / 计划 / 定义、任务依赖、原授权与责任指派、时间及累计预算都重新核验。每个 Runtime / Skill Binding 仍须具有当前有效的 task_execution 批准、受控资格及准确原生证据关系。原预约须具有正数、同币种费用上限。仅有过去的 Context 准入引用不能替代这些检查。

## 工作区资源权限

Runtime 的 `effective_permissions.resources` 是外部引用，不能直接当成 WorkItem 的路径字符串。新增 `WorkspaceToolResourceGrant` 明确定义权限命名空间：

```json
{
  "provider": "cimiloop_workspace",
  "resource_type": "repository_path",
  "locator": "src/**",
  "version": "1.0.0"
}
```

项目归属来自包含它的不可变 ProviderBinding。该引用表达路径授权范围，不证明文件内容，因此不接受内容 digest 或额外字段。未知命名空间 / 版本不授予工作区权限。请求资源须同时被 WorkItem 和 Runtime 覆盖；动作也须同时被两者允许。单次资源不能是通配符、绝对路径或逃逸路径，任何路径层级的 `.git` / `.cimiloop` 均拒绝。独立只读 Agent Context 只允许 read_files。查询不实现检查命令的执行器。

本入口只处理父 Run 工具身份。存在未结清原生 SkillInvocation 时返回 `SKILL_TOOL_CONTEXT_UNAVAILABLE`，避免子方法绕过其较窄权限使用父 Runtime 授权。后续技能工具传输必须独立固定原 invocation、方法及权限交集；本批没有接受一个可由 Runtime 任意填写的技能引用。

## 当前可信宿主证明

`AgentRunVerifierPort.checkToolAuthority(project, input)` 是受信组合器安装的同步、无效果核验接口。它取得独立副本的完整原 Run / Context、当前 Task / WorkItem、源码 / 工作区、Binding 和当前请求。正式实现必须重新读取原宿主准入、资格实际字节与当前约束，核验原 Run / 工具 / SDK / 账户归属；不能仅回显 Runtime 提供的摘要。返回严格 SHA-256 Digest，用于固定本次实际宿主核验依据。

默认共享应用服务没有安装该接口。缺少接口为 `AGENT_TOOL_HOST_UNAVAILABLE`；核验抛错或返回非协议摘要为 `AGENT_TOOL_HOST_PROOF_UNPROVEN`。有接口也必须先通过全部当前原生检查；已经撤销的权限不会交给宿主处理。ALLOW 固定原记录、Context、宿主准入及本次 host_validation_digest / basis_digest。

查询不启动模型或工具，不预约 / 结清运行，不修改领域事件、用量或原记录。ALLOW 是本次查询结论，不能缓存为永久能力；未来受信工具宿主须在效果准备、dispatch / 执行及回执重放处再次读取当前授权。执行器还须验证固定资源、真实文件身份、原调用账本及过程归属。IPC 请求或导入结果不能安装宿主核验器。

旧 `assessRunTool()` 和 Human 请求 / 结果契约保持。Agent 请求不能进入 Human 入口，Human 身份不能取得 Agent ALLOW。D-219 / D-220 的本地文件宿主仍仅连接 Human；本批未把其回执转换为 Agent 证明。

## 验证与剩余实现

原始报告、实际检查数量及固定源码摘要见 [D-221 验证记录](../research/CimiLoop-Agent运行实时工具授权-2026-10-07.json)。新测试在真实临时 Git / SQLite 项目中使用**构造受控 ALLOW 与构造宿主**，验证当前查询、取消 / 撤销 / 暂停 / 超时 / 结清 / 批准者失效、身份与引用置换、资源交集和未结清技能阻断。核验器只能修改传入副本；重复查询不新增事件 / 用量 / 记录，宿主核验依据改变后结果摘要改变。

最终构建及类型检查通过，固定源码下受影响的 13 个文件、130 项测试全部通过，没有跳过。首轮新测试为 17/18 项通过；失败来自撤销批准者时测试使用了旧命令名与字段，已改为当前 EndAssignment 并先完成必需的责任移交，定点及完整回归均通过，原报告保留。

这些领域测试不证明真实模型、隔离、费用或工具宿主已获资格。现有正式 Provider 批准规则继续拒绝不充分的 task_execution 证据。旧 Human、Agent、技能记录及实际工作区工具回归保持在本批验证范围内，不据此声明整仓一次测试通过。

新增三个独立 Schema：AgentToolAuthorityRequest、AgentToolAuthorityAssessment、WorkspaceToolResourceGrant；原 239 个 Schema 正文保持，共 242 个。原生数据库仍为格式 10，工具账本 / Human 回执格式保持；未升级用户库，未读取真实凭据，未发送外部模型请求。

下一步将原 Agent 身份和当前查询接入工作区效果 / 账本，再接认证 IPC / OpenCode，补齐固定检查命令。生产 Runtime / Task 资格、费用 / 物理配额与原资源恢复、Plan / Task 前 Human / Matt 澄清、独立固定 diff / issue 评审和完整 harness、Superpowers 检查、真实方法行为及候选 / 证据投影、工作台正式执行 / 接续、普通真实 Change 到 ReadyForDelivery 的 S1 验收继续实施。
