# 正式启动入口统一采用已选择的 Codex 完整准入

接续 `6798856257e3bd01a1f0dd4a4d71bf32df1a5ea1`，完整 S1 五组继续进行。本批修复默认正式启动入口中的旧提供方回退与不完整证明组合，不将“拒绝未准入启动”称为完整生产 Runtime 已交付。

## 问题及实现

用户已选择现有 Codex 登录，正式模型 gpt-6.1-sol，真实测试优先 gpt-6-luna。原默认工厂仅在发现 Codex 安装时拒绝缺少完整准入的启动；未发现安装时仍读取旧 HTTP 连接，并可能按硬编码的 OpenCode Go／deepseek-v4.1-flash／五美元政策继续执行。这些历史连接与预算元数据不能代表当前用户授权。

原 `openInstalledProductionRuntime` 还保留另一套旧 HTTP 装配：用原件摘要充当启动／模型独立核验结果，并直接替换 verifier 回调。现移除此装配；该导出与默认 `productionAgentRuntime` 共用同一函数，只使用已有的 `LocalAgentRuntimeAdmission` 完整准入租约。没有租约时明确报告缺少 Codex 原安装或 Context 前完整准入，不读取旧 HTTP 连接、不打开旧账户、不改写 verifier、不启动 Runtime。

已有 Codex 正向装配保持原顺序：账户容量政策、固定卷运行范围、固定卷登录目录、每次异步边界后的守卫、原 Run 的 Runtime 组合。释放只归还本次打开的账户，不替调用方关闭共享准入租约或重开原 Native 操作。

旧 `productionModelFeeAuthorized` 兼容签名保留，拒绝从历史元数据推断新费用授权；旧 `productionAccountAdmission` 拒绝新 HTTP 模型调用。历史布局、检查目录和账户摘要读取继续保留，历史费用查询通过其既有只读账户服务访问，不依赖新启动许可。没有删除旧连接、账本、费用或 Unknown 原件。

Human 启动服务仍先核对当前 Kernel 权限和原操作：已有原登记时只读返回原身份，缺少当前 Codex 安装也不能迫使它重开 Run。Schema242、项目库10、Host1不变，没有用户库迁移。

## 验证范围

新增反例先在旧源码上完整运行，5项中4失败／1通过：未安装时错误回退、旧导出入口回退、历史五美元元数据被接受为费用授权，以及匹配旧连接／Host摘要的新账户 admission 实际被放行。最初4项运行的3失败／1通过报告也保留，不把因前一个断言失败而未执行的账户检查计作反例。

Node24.22.1／pnpm12.4.2，按锁文件安装和 `pnpm check` 通过。修复后单次受影响回归7个完整文件69项通过、0失败0跳过：提供方选择5项、历史费用授权1项、Human启动23项、共享Runtime准入20项、编译CLI启动8项、默认工作台4项、历史生产账户8项。覆盖原操作只读恢复、当前Human权限、异步边界守卫、共享租约释放、历史账户查询与新旧账户归属；受控装配不能冒充真实生产资格。

CLI／工作台帮助和本批文档检查通过。忽略证据目录 `.cimiloop/codex-2026-10-22/` 保留两份修复前失败报告、完整通过报告 `production-codex-choice-green.json` 及源文件摘要与最终汇总。本批保留首次失败，不以随后通过覆盖旧报告。没有运行全仓测试，没有新模型请求或新 AppContainer 执行；Windows历史账户读取通过不等于完整 Native、生产资格或 S1 验收通过。

## 后续主链

完整生产准入的具体证据读取器和默认装载仍须实现；仅有已安装 Codex、已有原件或构造资格不能开放正式 task_execution。固定配额及同卷安全登录目录、可关联原调用的真实账单／用量来源、Human 原澄清回答、完整中断恢复和幂等场景仍待完成。真实普通 Change 到 ReadyForDelivery、实际执行接入指南、最终源码上的 Matt 独立评审／Superpowers 验证及五组完整 S1 验收继续进行。

关联：[上一批方法原件接入](2026-10-26-cimiloop-native-method-qualification.md)、[本机接续与历史交接](2026-10-09-cimiloop-S1跨电脑接续.md)。本批只本地提交，默认不 push。
