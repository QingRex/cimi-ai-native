# CimiLoop 技能真实输入与宿主准备 v0.1

> 2026-10-07，D-216，V1-21 续批。接通实际包 / Schema / 输入 / 资料字节读取、固定方法资源准备和原预约输入复核。准备不执行方法；命名方法的资格核验器、效果驱动器及账本仍须接通，完整目标保持 [V1 实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)。

## 实际字节准备

`LocalSkillMethodInputs.read` 读取内容寻址的 `skill_method_input`，校验原摘要、384 KiB 上限、严格 UTF-8 和 `SkillMethodInput`。重新读取实际 Git 包，证明完整 commit / tree / blob 与模块闭包，核对 Descriptor、输入 / 输出 Schema 原字节和实际入口名。输入中的来源、包或能力不能覆盖这些依据。

评审资料只读取本项目内容目录中的固定 `workspace_file`、`workspace_diff` 或 `provider_probe_artifact`；资料必须有 SHA-256，locator 必须等于摘要，最多 256 KiB。它不会把外部路径、网络 URL 或人工报告自动当作已授权评审输入。真实 issue / diff 的范围与当前权限仍由生产宿主核验。材料字节、输入 / 请求、全部定义及 references 形成固定资源清单，scripts / agent 配置保留为包数据，不装入方法工作区或执行。

准备会调用实际适配器的资源 / 依赖 / 索引核验及锁定 SDK 读取上限核验；2000 行、单行 2000 字符、50 KiB 超限会在效果前拒绝，不能把截断资料当作完成加载。返回完整 `harness_requirements`，不能因未执行脚本或只完成读取而宣称委派、Human 分轮、issue tracker 或验证命令能力已落实。

## 接入原生调用准备

`invocationPreparer` 返回与 `SkillInvocationVerifierPort.prepare` 相同的函数签名。可信应用组合时提供原生 Descriptor 查询和实际方法资格核验器，不能由命令、CLI payload 或浏览器输入安装核验器。查询不到原 Descriptor，或核验过程中查询到不同记录，均拒绝。

`prepare` 严格核对原 Agent Run / Context、工作项、任务 / Contract / Plan 版本、源码 / 工作区关联、上下文摘要、Runtime / Skill Binding 和原宿主准入凭据；当前 Binding 必须固定在 Context 中、使用实际 Descriptor / Schema、匹配方法用途及 `task_execution` 范围。独立只读 Context 不接受 clarification。Kernel 的现有实时 WorkItem / Provider / 预算核验继续必要，准备器不能单独授予执行权。

`LocalSkillMethodQualificationPort.verify` 是必须由可信生产宿主落实的只读核验边界。它必须重新核验真实命名方法资格、当前 WorkItem / Provider / 预算、完整声明的 harness 与权限交集。准备器向它传入完整固定资料的独立副本，读取并核验返回的内容寻址资格引用，随后再次读取包 / Schema / 输入 / 资料，拒绝核验期间发生的变化。调用者修改核验副本不会改变原预约资料。

本批**没有实现实际资格判断器**，资格内容引用的可读取性只证明保存的原字节存在。任意导入的 ALLOW、合成回复或自报资格文件不能代替可信核验器。默认没有核验器时拒绝正式准备；当前本地 Human 应用仍没有生产 Agent / Skill 宿主，不因新组件而开启执行。

生产 Skill 宿主可把这个准备函数与实际原效果账本的 `readResult` 组合。`readInvocation` 严格解析原 `SkillInvocation`、重算整条原预约摘要，并重新生成实际固定资源，逐项匹配原请求 / 包 / Schema。它不启动新操作、不核对实际模型 / 工具费用，也不能仅凭固定输入读回成功结果。实际 dispatch、缓存效果重放及模型发起前仍须重新核验当前授权，按已经提交的原调用键持久认领；不完整效果保持 Unknown。

## 验证与剩余工作

新增测试使用真实本地 Git / SQLite 候选登记及内容字节；正向 Native 准备中的 Runtime / Task Binding、Agent Context / Run、资格核验器仍是构造夹具。核对范围包括包 / 输入 / Schema 篡改、错误 UTF-8、评审依据与截断、父上下文 / Binding 固定关系、探针范围拒绝、资格副本隔离、核验后再读、原预约摘要以及原生查询身份。原验证报告、源码摘要及范围见 [D-216 验证记录](../research/CimiLoop-技能真实输入与宿主准备-2026-10-07.json)。

Node 24.15.0 / pnpm 12.4.2 下构建与类型检查通过。受影响回归覆盖 8 个文件、101 项；首次有 1 项因夹具使用普通方法键而被原生记录的内部 ID 校验拒绝，仅修正夹具后，直接受影响的 7 项全部通过。最终按各文件最新验证合计 101 项通过，原失败报告保留；没有重跑整个仓库测试。234 个既有 Schema 内容保持，本批没有更改 Protocol 来源或重新导出 Schema。

三个 D-210 固定上游包已通过本组件的实际重新读取与完整资源准备：Matt 澄清 4 份资源、Matt 评审和 Superpowers 验证各 5 份。来源和声明能力来自实际包，评审资料是固定公共验证制品；没有发起 SDK / 模型，没有真实行为或资格批准，也没有默认 Provider 结论。

现有 `skill-provider-assessment/1.0.0` 继续要求内置 Skill 工具证据，D-211 失败证据保留。命名方法资格需要明确的版本化规则和原始实际效果 / 模型 / 账单证明，不能用本批纯准备结果消除资格缺项。还须落实 Matt 声明的 Human 分轮 / 委派 / issue tracker，Superpowers 的新鲜验证输出，真实行为对照与默认选择。

原生 [调用记录与核对](CimiLoop-SkillInvocation原生记录与核对-v0.1.md) 已实现；生产 Agent / Skill 资格与宿主、Plan / Task 前的受控澄清、真实工作区效果与工具 / IPC 账本、原操作恢复、实际费用 / 硬配额、正式工作台操作以及普通真实 Change 到 ReadyForDelivery 的 S1 验收仍未完成。本批 Protocol Schema 与数据库格式 / 布局保持原样，没有升级用户库。
