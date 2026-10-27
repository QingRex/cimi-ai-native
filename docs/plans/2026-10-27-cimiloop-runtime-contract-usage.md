# 原 Runtime 契约用量查询与分配容量核对

接续 `365d160`。完整客户端构建仍受磁盘空间和已记录构建故障限制；本批补齐独立可实施的操作路径：CLI 与工作台能够按原 Runtime 技术请求查看现有账户容量及编辑／评审阶段的原预约、用量和未决调用。费用与完整恢复控制来源仍未完成，不把查询成功当作生产资格。

## 实际入口与原身份

新增 `runtime contract usage <原请求ID>`、有会话的 `GET /api/runtime-contracts/<原请求ID>/usage` 及工作台原请求旁的“查询用量”，共同调用 `LocalHumanRuntimeContract.usage`。命令不要求新 request_id，不调用 execution 工厂，不创建业务 Run／领域事件，不初始化缺失账户，不读取登录令牌，不释放或重建原预约。

共享服务先通过当前 Kernel 项目负责人权限读取原请求，再打开现有原安装账户；await 后重新核 Human／项目／安装身份，固定预算对象及 guard，逐份读取原两阶段 scope。末次账户回调后重读全部原用量、原请求及容量切面；读取中新增预约等变化拒绝返回旧结果。所有出口关闭本次借用账户，关闭后及最外层原安装释放后仍核当前 Human 会话。

`capacity.scope: installed_account` 明确表示账户总体有限容量，不冒充本请求的消耗；不返回其他项目的调用身份。`phases` 是这个原请求的两阶段明细，包含原 operation_key、是否登记及独立原用量。缺失／不可核对的模型原件为 `usage:null`，不是零消费；孤立预约仍保留 Unknown 和 output-token 上限占用。即使用量完整，也固定 `cost_known:false`、现金／积分 null、`costs_reconciled:false`、`provider_qualification_proven:false`、`starts_model:false`。

HTTP 查询保持 GET，只读会话不要求 CSRF 写入；未登录返回401，POST usage拒绝。浏览器保留原ID，查询用量使用GET，不把查询动作变成新启动。界面分别说明账户容量、原请求分阶段用量和未结费，原停止／恢复入口仍按已有服务执行。

## 复现并修复的实际问题

同一账户向另一项目分配容量后，原 `readCodexAgentScopeUsage` 将该受保护的 allocation 凭据按模型预约解析，实际抛 `codex_usage_reservation_unproven`，导致已有 Run 用量不可读。新增真实 Host1／容量台账反例先复现失败；不是实际模型或账单测试。

`CodexAgentUsageBudget.modelSnapshot` 现在核完整原分配格式、账户、父政策／Host身份、子身份、上下文、原分配内容摘要ID及单位，只有成立才从模型预约明细中排除。账户总体 held／remaining 不改变，未释放 Unknown 或分配容量。只有 format 字符串、错身份或不完整凭据不能隐藏容量行。原 `snapshot` 和已有账本格式保持；原 Run／父子用量读取复用此模型视图。

## 验证记录与边界

新增查询反例首次为3失败、6未选择，原因是原服务没有 usage 方法；不称完整文件通过。接通后首轮四完整文件12通过、2失败：未登录预期误写403（现有接口实际401），替换权限方法时预期了回调内部文案（原身份守卫先返回统一能力拒绝）。两项断言已按原接口约定修正，原报告保留。分配容量反例修复前1失败、5未选择；修复中一次类型检查因类型缩窄失败，拆开原结构校验后通过。

最终 `pnpm check` 通过，Node24.22.1／pnpm12.4.2。最终同轮6完整文件28项通过、0失败0跳过，覆盖共享原请求、HTTP／会话／只读路由、页面GET、编译CLI入口、账户容量与跨项目分配的原用量读取；末次字段标注后重新完成同一6文件整轮。另模型原件文件仅选择5个受影响用量用例，5通过、59未选择，不称该文件完整通过。该轮实际stdio子进程和PUBLIC模型回复覆盖已完成父子原用量、外国项目不披露、孤立预约、未预约调用和错原操作拒绝。

本机忽略目录 `.cimiloop` 中同日前缀 `codex-2026-10-27-` 的 `runtime-contract-usage.json` 为首轮12通过2失败，`runtime-contract-usage-fixed.json` 为中间6文件28通过，`runtime-contract-usage-final.json` 为最终6文件28通过，`runtime-usage-model-focused.json` 为另轮5通过59未选择。失败及未选择不改判。

本批有限验证使用真实 SQLite／Host1容量、共享 Kernel、HTTP会话、编译 CLI 和页面DOM；模型／安装身份含PUBLIC受控夹具，没有读取真实登录或发真实模型请求。不是 Windows/AppContainer 原生整轮、真实账单、真实 Skill、完整客户端、全仓或S1验收。

## 剩余条件

此查询补的是可操作的容量／用量路径，没有装入可信财务来源或完整崩溃恢复矩阵。仍需完成费用预算与官方账单核对、全写根物理配额及历史容量、完整异常恢复来源、完整 `.2` 客户端构建／初始化／真实执行、真实 Skill／Human、CLI／工作台正式业务链、普通 Change 到 ReadyForDelivery、指南实际执行和当前最终源码 Matt／Superpowers评审。磁盘空间、Windows构建位置和官方财务来源的外部问题已经集中询问，不代答。

Schema242、项目库10、Host1保持；不改历史资格、不删除六个既有未知文件或历史Unknown，不push。操作步骤已更新[原SDK契约接入指南](../implementation/CimiLoop-Runtime原SDK契约接入指南-v0.1.md)。五组S1继续，目标未完成。
