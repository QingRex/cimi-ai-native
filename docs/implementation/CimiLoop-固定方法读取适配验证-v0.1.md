# CimiLoop 固定方法读取适配验证 v0.1

> 2026-10-07，D-212，V1-21 续批。承接 [D-211 技能证据、评测与 Runtime 绑定](CimiLoop-技能证据评测与Runtime绑定-v0.1.md)。本批验证隔离内的方法定义读取，真实方法调用、正式 Context / Run 和 V1-22 行为试点仍待完成。

## 兼容依据

锁定 OpenCode 1.18.34 的内置 Skill 工具调用 ripgrep 子进程，在当前单进程 Windows Job 内失败；D-211 保留了三个固定上游包的失败证明。该版本的 `--pure` 还会跳过外部插件，见 [锁定版插件加载源码](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/plugin/index.ts)。不能把声明插件或已发现技能目录算作加载成功。

本批以实际原生 `read` 工具验证固定定义读取路径。仅由内部公共演练函数 `runOpenCodeFixedMethodReadProbe` 构造，没有新增生产 CLI、真实凭据、插件安装或执行准入。保持只读、禁止网络能力、单进程 Job，以及所有其他工具禁止；内置 Skill 工具在该分支也禁止。合成 TLS / IPC 回复依次提出读取声明定义的请求，每份工具结果须包含完整固定正文，后续最终回复仍是合成数据。

## 名称、路径与结果

宿主的 `methodReadPaths` 必须与固定 profile 中全部名称一一对应，只接受 `skill-source/<声明名称>/SKILL.md`。构造时复制并冻结名称与路径，错误映射在创建任何桥接制品前拒绝；每次响应的工具参数重新核对原操作驱动器映射与精确路径。默认公共读取分支仍只允许 `public.txt`，内置 Skill 失败演练分支保留原限制。

观测核对真实 SDK `read` 完成事件、文件路径、正文、独立关联的工具结果、结束证明、输入文件保持、IPC / 宿主演练账本及私有状态清理。只去除锁定原生读取工具的行号显示前缀，不改变来源正文或使用模糊关键词匹配。

成功结果明确为 `rehearsal_kind=synthetic_fixed_method_read`、`method_read_verified=true`、`skill_loader_verified=false`、`formal_execution_enabled=false`。读取固定方法定义是可行性依据，不满足 D-211 现有的内置 Skill 工具证据规则，也不证明模型执行了上游方法。该分支不能直接批准 Skill Provider、满足任务或推进 Gate。

## 实际验证

构建 / 类型检查通过，受影响两个测试文件 13 项通过，覆盖旧公共工具桥接、内置 Skill 加载反证、未声明路径拒绝和实际两模块读取。三个 D-210 固定上游包也使用锁定 OpenCode、原 AppContainer 边界完成定义读取；Matt 澄清包括 `grill-me` 与 `grilling`，Matt 评审和 Superpowers 验证分别读取对应定义。真实凭据读取、外部模型请求均为零，未进行行为评测或默认 Provider 选择。

验证及原始引用摘要见 [D-212 验证记录](../research/CimiLoop-固定方法读取适配验证-2026-10-07.json)。未修改 Protocol、旧记录或数据库格式 9，未升级用户库；D-211 的历史失败和原生资格规则保持。

## 后续实现

把明确的命名方法调用映射、加载策略及适配器来源固定为版本化契约，保留原方法请求与实际读取效果各自的身份和证据；不能把 `read` 事件改名为内置 Skill 成功。补齐依赖与引用读取、权限交集及失败 / 中断核对，再接真实澄清的 Human 分轮回答、固定 diff / issue 数据与独立评审会话。

正式 Context / Run 的 Binding、调用和结果记录、真实技能评测与 Matt / Superpowers 对照继续属于 S1 必需工作。V1-09 的正式 Agent、真实工作区效果、费用准入、整体恢复和物理硬配额，以及 V1-11 普通修改至 ReadyForDelivery 仍须完成，见 [V1 实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)。

2026-10-07 D-213已实现本页所列的版本化命名请求 / 效果映射、完整声明资源与原调用重放，见[后续实现](CimiLoop-命名方法调用与效果映射-v0.1.md)。仍仅为公共合成宿主；正式Context / Run和真实方法行为待完成。
