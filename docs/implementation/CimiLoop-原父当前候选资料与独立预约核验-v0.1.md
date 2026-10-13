# 原父当前候选资料与独立预约核验

> 最新本批：main原103文件948项为943通过5失败0跳过，报告保留。准备阶段/模型終检修补后，实际生产与父子家族整2文件4项、原Native配置整16项、模型終检整3文件64项通过；check及CLI帮助通过、774源码零漂移。分组并集不是一次103文件全绿，非全仓库/S1。正式Host当前结果及领域结果3继续，默认Agent关闭，无付费、不push。

2026-10-13，D-287，承接 V1-09 / V1-21。五组 S1 目标保持不变，正式 Agent 默认入口仍关闭；具体智谱模型、套餐、现金币种和总上限、积分总上限待确认，没有付费请求或真实凭据读取。

## 当前实现

原父修改源码后，第二版固定 Skill 目录使用 original_run_candidate/1.0.0 配方指定目的、规格、标准及必需检查；SDK 仅提供固定别名。首次原请求解析一次完整候选、保存不可变输入与证明，并以原 Run 创建时刻和 call ID 派生的唯一 Command 预约子调用。第一版目录保持固定历史输入含义。响应丢失、服务重建和重复请求复读同一输入及 Kernel 原回执；birth 或原件残缺时拒绝再次解析。

LocalAgentParentSkillCandidate 固定原 Project、Run、Context、WorkItem、SourceSnapshot、WorkspaceSnapshot 和检查准入。首次解析要求可信 IPC 当前票据与原账本唯一在途尾请求对应，核对 nonce、Scope、ordinal、原请求摘要、call ID 及工具。明确因果窗口只容许本次 run_skill 或 model_step；完成的历史 Skill 仍由独立 Kernel 子回执及结果端口核验。其他 Unknown 保留，当前未返回请求不算完成效果。

候选服务核对原 Runtime 登记、config7 的原启动 input，以及实际 sandbox/config/parent-skill-catalog.json 的 binding、prompt、Task deadline、binary original 和目录字节，沿用 Native 16KiB 目录上限。独立 Native 文件 / 检查原账本证明请求前的历史前缀。每个必需固定检查须完成、通过，位于最后原文件替换之后，源码、Node、策略和配方与原回执一致，不执行新检查补造旧证据。

完整资料包含全部原授权工作区文件、当前文件、原 HEAD、固定 index 和完整 worktree diff，不局限于检查脚本涉及的文件。UTF-8/BOM 原文按连续字节保存全部分段，每段遵守实际 SDK 的 50KiB / 2000行 / 行字符上限；整体摘要和每段偏移证明没有截断。后续命名方法准备仍受完整资源数及 Context 上限约束。私有整份 proof 的字节 / 节点上界由原 manifest 文件数、路径和64个引用上界派生，拒绝重复、危险和额外键；单条 IPC4096节点上限不变。

当前回读核对完整物理源码、HEAD/index、固定资料及原 Native 链。历史回读保留原输入 / 原 Native 前缀，不授予当前适用性、执行或模型账户权限。原预约前已登记的 deleted 行可保持缺失；新删除、复活、HEAD/index变化、现存模式变化、授权外文件及未记录编辑仍拒绝。

Kernel 在同一 SQLite Writer 上提供冻结只读视图，方法准备 / 资格回调前后两次独立核验候选，回调结束后视图失效。模型准入使用同一 Writer 的 Binding / Descriptor，不嵌套事务。全部 child/check/model 回调结束后才完整核对材料；随后以纯读取复核 Native 原账本、当前 IPC 票据、原 Runtime 身份、config/catalog、输入和 proof。最后 live 回调后再比较 intent/header/anchor/birth 原字节；缺失或替换不得提交预约。

## 验证范围

- D287原r28：四完整文件56项全部通过、0跳过、774源零漂移；同源码r29 pnpm check通过。Git、内容存储、Kernel预约和重放实际执行；Native/model/资格读者是明确控制合同，非真实Skill/model/S1。
- 普通独立工程复审无剩余必修项；不替代 Matt 完整评审和 Superpowers 新鲜验证。
- D284原r41：92文件840项，839通过1失败0跳过，763源零漂移；实际Task期限失败的具体耗时原因尚未证明。同源码原时限r42对整个失败文件3项全部通过。实际Windows/SDK/Native检查、专用本地HTTPS原账户、Workbench原回执及Human撤权已执行，模型/资格/账单为PUBLIC控制夹具。原全范围失败保留，覆盖并集不算一次92文件全绿，不重开旧Run、不提高实际时限。
- main 精确集成52个逻辑路径，保留已有修补、换行和两个无关TMP；176个仅换行差异路径未覆盖。main pnpm check及CLI帮助已通过、774源零漂移。103完整受影响文件的主组合回归仍在原进程执行，含实际Windows/AppContainer，尚未判定通过或提交。

原r21/r24有效失败、r23类型失败、r26原删除误拒及目录整理工具错误均保留。详情见[研究记录](../research/CimiLoop-原父当前候选资料与独立预约核验-2026-10-13.json)与[实施计划](../plans/2026-10-13-cimiloop-current-parent-candidate.md)。

## 后续完整路径

下一步将当前候选安装到共享父SDK生产组合，连接实际原子Native方法、原资格与账单、已知子结果及父继续。领域结果须显式版本化的当前候选证明，才能使用run_skill输出；既有第二版父领域结果只证明历史调用，仍拒绝作为当前源码输出证据。真实SDK身份及完整行为须通过实际链路验证，不能用控制票据或单项合同替代。

V1-09 正式Runtime/模型账户/预算账单/物理配额/历史容量/完整恢复，V1-21真实Skill和Plan/Task前Human/Matt，V1-22独立完整评审/新鲜验证/真实行为，V1-10正式工作台执行和原操作接续，V1-11真实普通需求至ReadyForDelivery及接入指南均继续。Schema242、用户库10、Host1保持；没有升级用户库或因新电脑找不到资源推断旧电脑Unknown已清理，默认不push。
