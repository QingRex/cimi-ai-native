# CimiLoop 技能包固定来源与候选登记 v0.1

> 2026-10-07，D-210，V1-21 第一阶段。已实现来源包装、离线核验、严格方法输入输出和原生候选登记；技能准入、绑定、正式调用与 V1-22 行为评测仍待实现，本批不代表 S1 退出。

`packages/skill-adapter` 从固定 Git 对象读取完整模块目录和许可证，生成内容寻址技能包。`packages/local-app` 保存和复核包，CLI 通过原有 `RegisterProvider` 登记 `skill` 候选。任务、决定、权限及 Gate 继续由 Kernel 管理。

> 后续进度：D-211已接通[技能证据、评测与Runtime绑定](CimiLoop-技能证据评测与Runtime绑定-v0.1.md)及格式9显式迁移，保留三个上游包实际加载失败。本文D-210验证和当时格式8保持为历史依据；真实方法调用尚未完成。

## 固定来源与完整模块

严格 `SkillImportSpec` 指定 HTTPS 仓库地址、完整 commit、入口路径、模块依赖图、许可证、包装版本、能力、外部 Provider 依赖、权限需求、宿主需求及依赖审查说明。拒绝带账号、密码、查询或片段的地址；导入仅接受已经取得指定 commit 的本地 Git 仓库，不自动下载。

包内包含 commit 原始对象、所选路径涉及的 tree 对象、完整模块目录内的文件，以及指定许可证。离线核验重新计算 Git 对象 ID，沿 commit → tree → blob 检查路径、模式和内容，同时检查每个文件及整个包的 SHA-256。复制文本后仅计算 SHA-256 不足以证明它属于指定 commit。工作区脏文件或后来移动的 HEAD 不影响已固定来源。

这证明文件属于该 Git commit，不证明作者身份、远端仓库归属或内容可信。仓库 URL 是来源声明；本批另行从上游仓库取得实际 commit，保留获取来源和核验记录。来源固定与行为准入是两项不同的检查。

模块图必须有唯一入口、依赖可解析、无环、无重叠，且全部模块均可从入口到达。每个模块必须有 `SKILL.md`；导入整个目录以保留脚本、引用和配置。内部模块作为一个组合 Provider 的固定内容；`provider_dependencies` 则引用原生外部 Descriptor 和精确摘要，不将两者混为一种依赖。

当前识别 Matt 包装器使用的 `Skill tool with "name"` 调用形式，要求显式依赖被包含。其他自然语言、脚本、宿主工具或项目约定仍须人工语义审查并记入 `dependency_review` / `harness_requirements`；不能声称已自动发现所有语义依赖。

路径采用可移植 ASCII 相对路径；拒绝绝对路径、点目录、尾点、Windows 保留名、符号链接和子模块。最多 32 个模块、256 个文件；单文件和 commit 各限 256 KiB，原始文件内容总量 2 MiB，commit / tree 证明总量 512 KiB，包总量 6 MiB。tree 单对象限 128 KiB，目录深度限 32。实际 Superpowers commit 对象为 103555 字节，因此 commit 限长与文件限长相同；仍在读取前检查大小，超限拒绝。

## SKILL.md 与权限边界

YAML 元数据限 16 KiB，使用固定 `yaml@2.9.1` 解析。拒绝重复键、别名、不支持的标签、危险键和非预期复杂值；要求名称匹配模块目录、有效描述和非空正文。Agent Skills 的名称、描述、许可、兼容性及字符串 metadata 按本批支持范围检查；额外字符串、布尔或字符串数组字段仅保留为数据。参考 [Agent Skills 规范](https://agentskills.io/specification) 与 [YAML 解析 API](https://eemeli.org/yaml/#parsing-documents)。

`allowed-tools`、`disable-model-invocation`、正文指令及 `agents/openai.yaml` 都不构成原生授权。导入不执行脚本、Hooks、bootstrap、Skill 工具或子 Agent，也不写入任何 Runtime 的全局技能目录。包装文件可以包含这些内容，但执行宿主能力必须另行实现、评测和授权。第三方技能提及的安装或委派步骤不改变 CimiLoop 的调用入口及角色要求。

`required_permissions` 固定包装者声明的需求；它不是已经生效的权限。未来调用须核对 ProviderBinding、WorkItem / Context、实际宿主限制及当前授权的交集。缺少权限、宿主能力或独立上下文时阻断调用，不能依靠 Prompt 声称已经满足。

## 当前三个候选

| 包装名称 | 上游固定 commit / 模块 | 当前选择与宿主缺项 |
|---|---|---|
| `matt-clarification@1.0.0` | Matt `6fd947921b935b7e1e69293a200400f0fdd5c15f`；`skills/productivity/grill-me` → `skills/productivity/grilling` | 包含真实 Skill 工具依赖；保留明确调用、人类分轮回答、环境事实委派需求。尚未实现对应调用宿主 |
| `matt-review@1.0.0` | 同一 Matt commit；`skills/engineering/code-review` | 包含完整目录和 `agents/openai.yaml`；保留固定 Git diff、项目 issue tracker、两个独立评审上下文及委派需求，未安装上游 setup 技能 |
| `superpowers-verification@1.0.0` | Superpowers `8ca22dba9a94f28898bbce59f2537ff4d87c747d`；`skills/verification-before-completion` | 作为验证方法对照候选，需新鲜检查输出及独立上下文。未引入全局 `using-superpowers` 或 Hooks，尚无行为增益结论 |

可提交配置见 [`packages/skill-adapter/candidates`](../../packages/skill-adapter/candidates)。固定来源见 [Matt commit](https://github.com/mattpocock/skills/tree/6fd947921b935b7e1e69293a200400f0fdd5c15f) 与 [Superpowers commit](https://github.com/obra/superpowers/tree/8ca22dba9a94f28898bbce59f2537ff4d87c747d)。两包上游均有 MIT 许可，导入保留各自实际 LICENSE 字节；文件摘要见验证记录。此处没有把候选设为默认 Provider。

## CLI 和原生登记

先按 [CLI 操作说明](CimiLoop-CLI动作查询与诊断-v0.1.md) 准备本地项目和实际 Project Owner。取得上游源码后，显式使用仓库内的固定配置导入：

```text
pnpm cimiloop --project-dir <已初始化项目> --json --command-id <一次生成并保存的UUID> skill import --file packages/skill-adapter/candidates/matt-clarification.json --repository <Matt本地Git仓库>
pnpm cimiloop --project-dir <已初始化项目> --json skill inspect <返回的descriptor-id>
pnpm cimiloop --project-dir <已初始化项目> --json provider list
```

同样的入口支持另外两份候选配置。`--acting-role` 只声明角色，Kernel 核对实际指派；可用 `--expected-revision` 固定 Project CAS。成功返回原生 `RegisterProvider` 回执，Descriptor 的信任状态为 `candidate`，来源版本为完整 commit，来源摘要为实际技能包摘要，输入输出引用固定当前 Schema 文件摘要。

包首先保存到既有内容库，随后由 Kernel 登记候选。登记被权限或版本冲突拒绝时，未引用的不可变内容对象可能保留；不会因此新增 Descriptor、Binding 或业务事件。相同命令身份和内容的重试复用原回执；须保留原命令 ID 和固定输入，不用新 ID 重做响应未知的登记。已登记名称 / 版本不能改写内容，升级使用新包装版本和新候选，再走后续评测及绑定。

`skill inspect` 从原生 Descriptor 读取实际包，重新核对 Git 证明、元数据、能力、依赖、权限及当前 IO Schema 摘要，返回严格 `SkillPackageInspectionResult`。程序库的 `inspect` 也执行元数据和 Schema 核验。查询不增加业务事件；内容或引用不一致返回 `PROVIDER_OUTPUT_INVALID`。目录查询继续显示 `execution_enabled: false`。

## 方法输入输出

`SkillMethodInput` / `SkillMethodOutput` 各有严格的澄清与评审分支：

- 澄清输入为需求、背景和约束；输出为问题、未决事项和可选的约定内容候选。
- 评审输入为目标、Spec、Standards 和固定制品引用；输出为逐项发现、依据引用及限制，区分 Spec、Standards、Verification。

额外字段、错误用途、无依据引用的发现均被拒绝。方法适配入口同时限制完整输入 384 KiB、完整输出 1 MiB，覆盖继承的约定内容及引用字段；调用端仍须在读取原始传输字节时限长。输出没有 Decision、Task 状态或 Gate 字段；返回候选不等于批准、正式应用或任务满足。Schema 校验不能证明引用真实或评审正确，后续须核对原始结果、实际制品、调用身份及独立性。

## 验证和下一阶段

构建 / 类型检查及 Schema 同步通过；受影响回归 9 个文件 98 项通过，其中新增技能测试 2 个文件 29 项。既有 193 个 Schema 制品保持，新增 6 个。验证结果及原始记录摘要见 [D-210 验证记录](../research/CimiLoop-技能包固定来源与候选登记-2026-10-07.json)。本批在临时原生项目经实际 CLI 导入三个上游固定包，重新读取和离线核验；登记回执原键重放、查询不写入、零 Binding 和全部执行关闭分别核对。没有把文件包装算作真实技能调用或行为评测。

下一阶段完成 Skill 专用证据、评测与批准范围，复用原生 `RegisterProviderBinding`；显式设计 Context / Run 中的固定 Binding 及 Skill 调用记录，不放宽旧 Human 记录。接通真实澄清和独立评审宿主、严格结果入库、权限及失败 / 中断核验，再做 V1-22 对照与默认选择。正式 Runtime 的工具效果、Agent 绑定、整体恢复和资源 / 费用准入继续在 V1-09；以上完成后才执行 V1-11 普通修改全链路到 `ReadyForDelivery`。

领域数据库仍为格式 8，Protocol 2.0 与冻结 v1 保持；六个 Schema 仅作新增导出，并通过 `.gitattributes` 固定 LF，避免跨平台检出改变固定 IO 引用摘要。既有 Provider 技术探针及绑定路径仍限 Runtime 和 `isolated_provider_probe`；本批没有用 Runtime 探针冒充 Skill 评测，没有升级用户库，真实模型凭据读取、模型请求和上游脚本执行均为零。
