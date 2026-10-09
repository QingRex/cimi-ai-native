# CimiLoop 实施设计

2026-10-09 D-238：原控制器恢复运行后异常退出会立即中断同一 SDK 等待，保留首中断原因、原 claim / raw 字节与预算；不重开 Run 或生成成功 / 费用结清。D-237 旧失败现场另发现 Bun 崩溃和退出码3，但原查询时点的全部 OS 检查值未留证，崩溃根因未定。见[原异常退出处理](CimiLoop-原Runtime异常退出与SDK等待中断-v0.1.md)；完整五组 S1、生产模型 / 账户及真实方法继续，默认正式入口关闭，242 Schema / 项目库10保持。

2026-10-09 D-237：独立原宿主首次启动账本已接 Context 与共享启动服务；票据绑定原机器、登录主体和原存储身份，首次 dispatch 前不可逆登记 Run / operation_key。缺原账本、新账本、复制账本、登记损坏或当前准入不可核验时拒绝重开；实际 Windows 权限与跨进程验证见[原宿主启动组合](CimiLoop-原宿主首次启动账本与Runtime组合-v0.1.md)。完整生产驱动、模型 / 账户 / 费用、配额 / 恢复及其余四组继续实施，默认正式入口仍关闭。242 Schema / 项目库10保持，独立宿主账本为私有格式1，未升级用户库。

2026-10-09 D-236：Kernel 当前启动检查与共享 Agent 启动资料组装已实现，本地持久 dispatch 先于唯一 launch；异步准备后重核原事实，丢响应只核对原登记。默认入口仍关闭，独立受保护原宿主账本、生产驱动及完整模型 / 账户 / 费用尚未接通；新电脑缺文件不能证明旧 Run 未启动。242 Schema / 格式10保持，完整五组 S1 继续实施，见[原启动授权与共享组合](CimiLoop-原Agent启动授权与共享组合-v0.1.md)。

2026-10-09 D-235：原Agent采集已接共享应用服务、工作台和Kernel Unknown RunObservation；固定原请求及rawref，响应丢失重放同一Kernel回执，不重开Run、不结清费用或释放预算。默认启动与工具权限仍关闭，完整正式终态 / 模型账户 / 配额 / 全恢复及五组S1继续实施，242 Schema / 格式10保持，见[原待核对观测](CimiLoop-原Agent待核对观测与Kernel接通-v0.1.md).

2026-10-09 D-234：共享应用服务与工作台已接 Human 对原 Agent Run 的查询、采集、Kernel 取消后原停止标记重送及原资源恢复；浏览器丢响应后保留同一 Command ID 和 Agent 控制入口。停止不产生领域结果或结清预算，恢复资源不重启 Run。正式启动 / 接续执行与完整 S1 继续实施，242 Schema / 格式10保持，见[原运行控制](CimiLoop-工作台原Agent运行控制-v0.1.md)。

2026-10-09 D-233：原操作采集与共享应用服务已接独立 Native 原回执核验，重读文件账本、固定检查 dispatch / 原归属 / 策略 / 二进制及原快照，并与完整 IPC 输入 / 回执对应。丢响应、损坏或未结资料保留 Unknown；历史回执一致不代表当前源码通过、模型账户批准或费用结清。正式 Agent / RunObservation 与完整 S1 仍待接通，242 Schema / 格式10保持，见[实现与边界](CimiLoop-Native原回执独立核验-v0.1.md)。

2026-10-08 D-219–D-232：原工具 / SDK检查、取消、原Task累计期限和原Run唯一启动保持；D-232新增受原OS身份约束的IPC请求 / 响应字节账本，接入原操作采集并核对实际SDK身份、入参和输出对应关系。响应记录不证明送达、Task成功或费用结清。私有模型回复和受控资格仍构造，没有安装默认正式Agent；完整生产准入 / Native与模型账户保管链 / 套餐费用、物理配额 / 全恢复、真实技能 / 评审、工作台正式执行及S1仍待完成。242 Schema / 格式10保持，见[SDK调用与IPC原字节账本](CimiLoop-SDK调用与IPC原字节账本-v0.1.md)。

2026-10-07 D-218：[命名方法原始会话账本](CimiLoop-命名方法原始会话账本-v0.1.md)与[验证记录](../research/CimiLoop-命名方法原始会话账本-2026-10-07.json)。独立格式 4 保存并复核公开 HTTP 原字节，真实模型 / 工具 / 账户证明和效果宿主仍待接通；原生格式 10 保持。

2026-10-07 D-217：[命名方法资格规则与原始效果重放](CimiLoop-命名方法资格规则与原始效果重放-v0.1.md)与[验证记录](../research/CimiLoop-命名方法资格规则与原始效果重放-2026-10-07.json)。方法读取契约与受控资格分别核验，生产原账本和效果驱动仍待接通，格式 10 保持。

2026-10-07 D-216：[技能真实输入与宿主准备](CimiLoop-技能真实输入与宿主准备-v0.1.md)与[验证记录](../research/CimiLoop-技能真实输入与宿主准备-2026-10-07.json)。实际固定资源与原输入再读已接通，缺少可信方法资格核验器时正式准备拒绝；没有启用生产执行。

2026-10-07 D-215：[SkillInvocation 原生记录与核对](CimiLoop-SkillInvocation原生记录与核对-v0.1.md)与[验证记录](../research/CimiLoop-SkillInvocation原生记录与核对-2026-10-07.json)。预约、原操作观测、Unknown / 费用 / 迟到核对及 CLI / 工作台事实展示已接通；生产宿主和创建 Plan / Task 前的澄清仍待完成。数据库布局保持格式 10。

本目录承接领域架构，记录工程决策、接口、兼容迁移和开发任务。当前开发入口是 [V1 可执行设计与实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)；M0–M5 保留为既有实现记录和历史设计。实施规则不能绕过 Kernel 权威及当前协议边界。

## 当前阶段

- 最新技能切片：[技能包固定来源与候选登记](CimiLoop-技能包固定来源与候选登记-v0.1.md)，D-210 / V1-21 第一阶段已实现固定来源、依赖 / 许可、严格方法 IO 和真实包原生登记；D-210来源包装保留；D-211新增原生评测及探针绑定，实际调用及V1-22行为对照仍待完成。
- 最新原待核对观测：[原Agent待核对观测与Kernel接通](CimiLoop-原Agent待核对观测与Kernel接通-v0.1.md)，D-235接原采集到Human Unknown领域观测和原请求恢复，正式终态与费用待完成。
- 原运行控制：[工作台原Agent运行控制](CimiLoop-工作台原Agent运行控制-v0.1.md)，D-234 已通过共享服务接原查询 / 采集 / 停止 / 资源恢复；正式启动及接续执行仍待完成。
- 人工工作台基线：[本地工作台与共享应用服务](CimiLoop-本地工作台与共享应用服务-v0.1.md)，D-209 / V1-10 人工操作阶段已接通真实 Kernel、身份、决定与交接；正式 Agent 与 S1 全链路仍待完成。
- 最新工具切片：[WorkItem工具授权与执行账本](CimiLoop-WorkItem工具授权与执行账本-v0.1.md)，D-208原生Human权限、独立公开工具事实与副作用恢复；OpenCode只读消费见[工具IPC与OpenCode消费契约](CimiLoop-工具IPC与OpenCode消费契约-v0.1.md)。

- 当前里程碑：M0 Kernel 最小闭环已完成并冻结。
- 当前状态：M0 工程骨架、首个可恢复纵向切片、Schema、Store Port 契约和可靠性场景均已实现，并已在 Node.js 24.15.0 + pnpm 12.4.2 基线上完成复验。
- 当前切片：S1需求与执行闭环；V1-01–05本阶段实现及联调已完成，V1-06本阶段人工证据 / 专业复核 / 安全集成已完成；V1-07 Human运行控制及V1-08 CLI已完成。V1-09实施中：独立探针Adapter / Windows隔离已实现，OpenCode已更新1.18.34；专用智谱GLM-5.3已完成真实合成修改 / 独立只读评价，正式Agent Run尚未接通。
- D-208阶段（历史；续批见顶部D-219）：D-208已实现原生Human Run实时工具权限查询及独立公开文件执行账本：固定WorkItem / Context / 原操作身份，执行和缓存重放前重新核对授权；公开读取 / 替换保存完成回执，确认原宿主退出后将未dispatch预约归为not_started、已dispatch未完成保留Unknown。四处实际Windows宿主退出和双宿主一槽位争用通过，工具事实不推进原生Task / Run。正式工作区效果、IPC / OpenCode接入该账本及Agent运行仍待验收。 见[WorkItem工具授权与执行账本](CimiLoop-WorkItem工具授权与执行账本-v0.1.md)。
- 当前实施基线：[V1 可执行设计与实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)，含字段、状态、命令、角色、错误、迁移及23项任务和32个验收场景。V1-21/22技能包装与试点进入S1，V1-23 OpenSpec可选。
- 既有实现记录：[CimiLoop M0 实施架构 v0.1](2026-09-19-cimiloop-m0实施架构-v0.1.md)。
- 当前操作说明：[M0 数据库迁移与恢复](CimiLoop-M0数据库迁移与恢复-v0.1.md)。
- 当前治理说明：[责任治理与身份入口](CimiLoop责任治理与身份入口-v0.1.md)，含调用绑定、权限、移交、CLI及旧项目补齐指派。
- 当前规划说明：[项目设置、规划与容量](CimiLoop项目设置规划与容量-v0.1.md)，含配置版本、目标版本、排序 / WIP、CLI及真实开工确认边界。
- 当前确认说明：[约定、计划确认与开工](CimiLoop约定计划确认与开工-v0.1.md)，含候选、风险、精确决定、正式版本、DAG / 依赖、开工及CLI。

- 当前执行授权说明：[任务、授权与预算](CimiLoop任务授权与预算-v0.1.md)，含固定定义、持久Task、具体 / 常规授权、撤销、用量核对、预算准入及CLI。
- 当前验证说明：[证据、评价与安全集成](CimiLoop证据评价与安全集成-v0.1.md)，含真实Git源码、人工原始报告、固定策略需求集、独立Human最小Context、四种结果、任务满足、条件逐项核验、证据失效处置及普通 / 高风险集成准入；真实Agent运行仍未接通。

- 当前运行说明：[运行预约与交接恢复](CimiLoop运行预约与交接恢复-v0.1.md)，含真实工作区、Human预约 / 原始观测、未知核对、累计预算、返还与撤销、交接、换执行者、接续及暂停需求恢复。当前格式9（显式1–8升级），Task中的真实Runtime执行仍在V1-09。

- 当前CLI说明：[CLI动作、查询与诊断](CimiLoop-CLI动作查询与诊断-v0.1.md)，汇总动作 / 查询、原生对象详情、稳定错误及退出码、当前事实 / 缺项、回执重放和输入文件边界。
- 当前Provider说明：[候选登记与接入检查](CimiLoop-Provider候选登记与接入检查-v0.1.md)及[证据、评测与受限绑定](CimiLoop-Provider证据评测与受限绑定-v0.1.md)，含固定来源 / 依赖、Human治理、原始字节复核、两类评测、精确批准范围和Agent接入缺口；Task绑定与Agent Run仍未启用。
- 当前Runtime说明：[Runtime探针与隔离](CimiLoop-Runtime探针与隔离-v0.1.md)，含实际版本 / 摘要、双模式OS边界、操作键重放、取消 / 未知、原始字节、DPAPI专用连接及智谱真实两会话验收；前批Zen403保留。合成探针不修改Task、Run或Gate，完整V1-09仍在实施。
- 当前Runtime恢复说明：[恢复与资源限额](CimiLoop-Runtime恢复与资源限额-v0.1.md)，含准确进程身份、持久归属、限定清理、默认限额固定、实际停止与Unknown保留；完整硬配额及Task执行仍未验收。
- 当前积分预算说明：[持久积分预算与宿主恢复](CimiLoop-持久积分预算与宿主恢复-v0.1.md)，含独立积分单位、跨任务累计上限、一次发送凭据、到期 / 取消 / 崩溃持有量及原OS宿主恢复；仍为未批准演练。
- 公网连接边界说明：[公网网关边界与积分估算](CimiLoop-公网网关边界与积分估算-v0.1.md)，含固定域名A / AAAA核验、一次性地址快照、单调时钟时限、TLS实际对端及只读公网探针；积分估算不提升计费准入。
- 当前宿主网关桥接说明：[IPC宿主网关桥接](CimiLoop-IPC宿主网关桥接-v0.1.md)，含无网络OpenCode实际响应、身份 / 策略摘要链、持久预算、取消 / 崩溃和保守恢复；TEST费用不作为真实账单。
- 当前Runtime策略说明：[网络与费用策略](CimiLoop-Runtime网络与费用策略-v0.1.md)，含默认无网络Capability、联网探针显式配置、限制未实现时拒绝、真实套接字 / 接收端观测及可信网关下一步。

### 2026-09-29 流程校准与实施边界

M0记录描述既有实现，不因文档更新就新增需求类型、目标版本、拆分或共享发布能力。V1-01已增加协议基础并复验M0；新业务流程还未进入Kernel，不回填为M0已实现事实。

2026-10-03已完成V1-01/02：沿[N1–N5流程基线](../architecture/AI-Native软件研发流程-v0.1.md)收敛任务，旧M1–M5由S1–S4替代，原型仍为历史演示。协议入口和制品并存，格式2 Store、显式迁移、基础Kernel / CLI的v2切换及旧回执兼容已实现；原M0消费者保留在各包v1入口。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全部9个测试文件57项通过，含两处真实进程退出恢复；未迁移用户实际项目库。

同日先完成V1-03责任治理：Kernel可信Caller、精确角色与期限、Actor登记、责任指派 / 结束、原子移交及CLI，当时全量10个测试文件70项通过。随后补齐设置、规划、WIP及事务容量检查，格式3增加规划表和显式格式2升级，当时12个测试文件93项通过。

2026-10-04完成V1-04：原生Contract / Plan候选、专业风险、精确Human决定、正式版本、生命周期、DAG / 验收 / 知识 / 依赖及StartChange正向联调。当时格式4支持显式1 / 2 / 3升级，保留设置、规划与旧回执。全量14个测试文件122项、构建、类型检查与Schema同步通过，含高风险第二Human、真实确认后双进程容量竞争、CLI确认开工及全部原成功命令重放、格式3四处升级回滚。该阶段下一步为V1-05；后续进度见下段，未迁移用户项目库。

2026-10-04完成V1-05本阶段：持久Task与固定定义、WorkItem具体 / 常规授权、撤销及累计预算准入接通Kernel与CLI。格式5显式升级1 / 2 / 3 / 4并保留真实确认 / 开工事实；全量16个测试文件164项、构建、类型检查与Schema同步通过。预算消耗 / 运行预约仍在V1-07，证据评价与安全集成下一步V1-06；未升级用户库。

同日完成V1-06第一批普通风险人工路径：固定Git源码、内容寻址原始报告、固定Feature / Bugfix需求集、自检 / 独立Human只读Context、四种结果、任务满足 / 依赖解锁及安全集成接通Kernel与CLI。格式6显式支持1 / 2 / 3 / 4 / 5并保留任务、授权与旧回执；Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及19个测试文件191项通过，含真实Git / 原始报告、适用性 / 反证 / 未知 / 冲突、双进程满足CAS、整体回滚、格式5四处升级回滚和CLI重放。V1-06专业决定 / 批准条件与冲突处置仍待接通，随后V1-07实际运行 / 恢复；未升级用户库。

## 已确认技术决策

| 编号 | 决策 | 状态 | 说明 |
|---|---|---|---|
| I-001 | TypeScript + Node.js | 已确认 | 作为 CimiLoop V1 的实现语言与运行平台；不改变 Protocol 和 Harness 的运行时中立性。 |
| I-002 | Node.js 24 LTS + pnpm Workspace | 已确认 | Node.js 使用 24 LTS 基线；pnpm 管理多包工作区并锁定准确版本，开发环境与 CI 显式安装，不依赖系统预装的 Corepack。 |
| I-003 | Monorepo 模块布局 | 已确认 | 使用 `apps/cli` 与 `packages/protocol`、`packages/kernel`、`packages/store`、`packages/store-sqlite`；包内放单元测试，根目录 `tests/scenarios` 放跨模块端到端场景。 |
| I-004 | Protocol Schema 工具链 | 已确认 | TypeBox 是 TypeScript 内的 Schema 定义源，导出 JSON Schema 2020-12 作为跨语言协议制品，Ajv strict mode 负责所有外部边界的运行时校验；不重复手写 Protocol interface。 |
| I-005 | M0 演示边界 | 已确认；后续任务已重排 | M0 实现 Project 初始化、Draft Change 创建与查询、暂停/恢复、非法操作解释、重启恢复、命令幂等及 Event/Current State 一致性；原留到 M1 的真实 `Draft → IntentReady` 进入当前 S1。 |
| I-006 | Repository 与 Project 默认映射 | 已确认 | Embedded Solo Mode 默认一个本地 Git Repository 对应一个 CimiLoop Project；`cimiloop init` 自动发现 Git 根目录，非 Git 目录允许显式初始化，多仓库 Project 只预留协议能力。 |
| I-007 | Project Store 与全局索引 | 已确认 | 每个 Git Repository 在 Git Common Directory 下保存独立权威 `project.db` 和项目内容；用户级 `registry.db` 只保存可重建的项目位置与最近使用信息，不能修改领域状态或成为 Kernel 权威。 |
| I-008 | CLI 名称与双输出模式 | 已确认 | 可执行命令统一命名为 `cimiloop`；人类默认使用友好文本，Agent 与自动化使用符合 Protocol Schema 的 `--json` 输出，二者调用同一 Kernel Command。 |
| I-009 | Solo 身份初始化 | 已确认 | `cimiloop init` 读取 Git `user.name`/`user.email` 作为建议，经用户确认后创建稳定 Human Actor 与 Project Owner Assignment；Git 邮箱不是内部主键，Agent 不得借用该身份批准 Gate。 |
| I-010 | M0 SQLite Driver | 已确认 | 使用 Node.js 24 自带的 `node:sqlite`，最低 24.15，并完全封装在 `store-sqlite`；不使用 ORM，兼容性不满足时只替换 Store Adapter。 |
| I-011 | M0 Kernel 执行模型 | 已确认 | Command Handler 使用纯领域函数和注入的 ID/Clock；Current State、不可变记录、Event、Outbox 与 Command Receipt 在同一 Unit of Work 原子提交。 |
| I-012 | M0 身份与展示键 | 已确认 | Internal ID 使用 UUIDv7；Change Display Key 使用项目内 `CHG-0001`，只用于交互，Typed Reference 和迁移始终使用 Internal ID。 |
| I-013 | M0 首个纵向切片 | 已实现 | `cimiloop init` 与 Change create/list/show/pause/resume/doctor 已接通；Protocol、Kernel、Store Port、SQLite 与 CLI 保持单向依赖，自动化测试覆盖幂等、冲突、回滚、重启和 Outbox Lease 恢复。 |

## 技术决策协作方式

TypeScript 与 Node.js 的常规工程选择由实现负责人按稳定性、可维护性和可测试性直接决策、记录并验证，不逐项请求产品负责人确认；说明时优先使用 Java/Python 类比。涉及产品语义、领域边界、协议兼容性、数据迁移或交付范围的决定仍需显式确认。

## 推荐的代码边界

代码使用以下模块职责，并保持依赖单向：

```text
apps/
├─ cli/                 # V1 命令行入口与本地编排
└─ workbench/           # 原生 Kernel 的本地 Human 页面与 HTTP 入口
packages/
├─ protocol/            # 稳定 ID、引用、Command/Event Envelope 与 Schema
├─ kernel/              # 聚合规则、状态机、Gate 与命令处理
├─ store/               # Kernel 使用的逻辑 Store Port
├─ store-sqlite/        # Embedded Solo Mode 的 SQLite 实现
└─ local-app/           # CLI / Workbench 共享项目、身份与本地核验器
tests/
└─ scenarios/           # 跨模块的 Change 端到端行为场景
```

依赖规则：`kernel` 依赖 `protocol` 与 `store`，`store` 只依赖 `protocol`，`store-sqlite` 依赖 `store` 与 `protocol`。V1 的 `local-app` 负责可信项目和身份装配，CLI / Workbench 复用它；M0 初始装配保留历史记录。Kernel 不得依赖 CLI、Workbench、SQLite 或具体 Agent Runtime。

Workbench、Team Server 和具体 Agent Runtime Adapter 不进入 M0 工程骨架；它们在核心闭环成立后按里程碑加入。

## M0 已实现的工程设计

1. Kernel API、Command Handler 和稳定错误模型；
2. Store Port、SQLite 事务、Outbox、Command Receipt 和幂等边界；
3. CLI 人类/机器双输出，以及所有 `--json` 输出的 Protocol Schema 校验；
4. 可复用 Store Port 契约，以及回滚、重开、响应丢失、Revision 竞争和 Outbox Lease 恢复验收。

## M0 纵向演示

```text
初始化 Project
→ 创建 Draft Change
→ 查询 Change
→ 暂停并恢复 Change
→ 非法操作返回稳定错误与解释
→ 重启进程后恢复权威状态
→ 重复 Command 不重复产生 Event 或 Outbox
```

M0 只证明 Kernel 权威、事务一致性、事件留痕、幂等与恢复机制成立。`Draft → IntentReady` 需要真实 Contract、Risk、Profile、Decision 与 Gate，当前属于 S1，不在 M0 使用临时审批逻辑模拟。

## CLI 入口

V1 使用与产品同名的 `cimiloop` 可执行命令。人类默认获得中文友好的文字或表格输出；Claude Code、OpenCode 和脚本使用 `--json` 获得稳定结构。修改类命令支持 `--command-id` 与 `--expected-revision`，所有调用都经过相同 Kernel，不提供 Agent 绕过接口。

`cimiloop init` 可以读取 Git 用户名和邮箱作为 Human Actor 建议，但必须由用户确认或通过显式参数提供。确认后初始化 Project Owner Assignment；Git 身份信息只作为来源属性，CimiLoop 使用独立稳定 Actor ID。

## 本地存储拓扑

- Git 项目的权威库位于 Git Common Directory 下的 `cimiloop/project.db`，因此同一 Repository 的多个 Worktree 共享一个 Project。
- 项目级 `objects/` 保存由 CimiLoop 管理的内容寻址附件；缓存、暂存与备份使用独立子目录并应用不同清理规则。
- 用户级 `registry.db` 只用于发现和展示本机项目，是可重建 Read Model（读模型），不保存 Change 权威状态。
- Git clone 不复制 Solo 状态；跨设备和 Solo→Team 迁移必须使用 Portable Export/Import。

2026-10-04续批完成V1-06本阶段人工复核：原批准人逐项核验Contract / Plan条件，独立Human质量责任人依据实际纠正报告处置失效断言，并批准仅剩高风险决定的精确集成输入；旧反证、专业否定意见和原报告仍保留。既有DecisionRequest / Decision承载专业路径，数据库保持格式6；普通路径没有专业依据时保持旧摘要结构。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及20个测试文件205项通过。下一步V1-07实际运行预约、预算累计及交接恢复；未升级用户库，未接通真实Agent运行或多人登录。

2026-10-04 V1-07已接通Human运行控制：原子Run预约、实际用量 / 原始观测 / 未知核对、取消请求、未启动返还及后来事实撤销、真实暂存 / 工作区 / 未跟踪内容、交接 / 接续、换执行者及暂停需求恢复。格式7显式升级1–6并保留格式6证据与专业历史；Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及23个测试文件232项通过。验证和当前边界见[运行预约与交接恢复](CimiLoop运行预约与交接恢复-v0.1.md)。下一步完善V1-08 CLI，再V1-09真实Runtime，未升级用户库。

2026-10-04 V1-08已完成CLI共享查询、严格原生对象详情、Task / WorkItem / Authorization便捷入口、交接 / 评价摘要及冲突当前事实 / 缺项。输入与目标错误使用稳定类别及退出码，JSON初始化避免提示污染；查询与失败不追加成功Receipt / 事件，原回执重放保持。数据库仍为格式7；Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及24个测试文件237项通过。详见[CLI动作、查询与诊断](CimiLoop-CLI动作查询与诊断-v0.1.md)，下一步V1-09真实Runtime探针 / Adapter / 隔离，未升级用户库。

2026-10-04 V1-09实施中：独立探针Adapter、Windows双模式权限隔离、持久操作键、取消 / 未知和原始字节采集已实现；OpenCode按用户要求由1.14.24更新1.18.34并固定版本 / 摘要。两版真实模型均返回403，正式Provider绑定、Agent Run及费用 / 网络 / 崩溃恢复边界尚未完成；完整A9未验收。数据库仍为格式7，未升级用户库。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及26个测试文件250项通过，详见[Runtime探针与隔离](CimiLoop-Runtime探针与隔离-v0.1.md)及决策D-192。

2026-10-04 V1-09专用连接续批D-194：OpenCode 1.18.34使用智谱Coding Plan GLM-5.3完成实际合成文件修改及新只读会话独立验收；两个会话ID不同，双模式OS边界通过。Key以CurrentUser DPAPI加密保存在仓库外，连接固定官方端点与加密文件摘要，启动前核对、输出精确遮盖及模型状态清理接通；原始 / 输出引用核对通过、明文Key匹配为0。构建、类型检查及全量28个测试文件262项通过，本批Schema与格式7保持。实际快照及操作见[Runtime探针与隔离](CimiLoop-Runtime探针与隔离-v0.1.md)，Zen403历史仍保留。正式Provider评测 / 绑定、Agent Run及完整A9预算 / 网络 / 恢复边界仍待实施。

2026-10-04 V1-09原生Provider续批D-195：Project作用域Evidence / Evaluation、技术契约及受控执行两类评测、精确Human批准与isolated_provider_probe Binding接通Kernel / Store / CLI。重用已保存的智谱实际字节，通过真实CLI核验技术契约ALLOW、受控执行NEED_MORE_EVIDENCE及Task绑定拒绝，本批模型请求为0。数据库格式8新增独立不可变Provider评测表，显式1–7迁移保留历史运行 / 用量 / 未知取消 / 交接接续；没有升级用户库。修复Windows原子替换结束证明时EBUSY竞争，Unknown及只读重试保持同操作键不重启。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全量30个测试文件283项通过；详见[Provider证据、评测与受限绑定](CimiLoop-Provider证据评测与受限绑定-v0.1.md)。下一步落实网络主机、费用、磁盘及崩溃恢复，再接可信Agent入口与Task执行。

2026-10-04 V1-09续批D-196：新合成操作固定生效限额与控制摘要，原生资源副作用前保存归属，Runtime在CreateProcess时原子绑定Job。runtime recover核对原进程的创建时间 / 程序路径，仅清理该nonce准确ACL / 映射 / Profile及专用状态；采集丢失的专用连接工作区整体丢弃，原证明保持、结果仍Unknown、同键不重启。沙箱逻辑总量 / 单文件 / 条目100ms采样超限停止，stdout / stderr合计在写入前限长，修复重复写取消文件竞争。实际Windows资源 / 中断及CLI核验已保存，新模型请求及实际凭据读取为0；Schema新增三种严格v2机器结果，既有探针及冻结v1保持，数据库仍8、未升级用户库。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全量31个测试文件298项通过，新增14项恢复 / 资源测试及1项CLI参数回归。验证见实施基线和D-196，规则见[恢复与资源限额](CimiLoop-Runtime恢复与资源限额-v0.1.md)。下一步落实出站主机限制和可靠费用控制，补齐文件系统硬上限与完整恢复验收，再接正式Task绑定及可信Agent入口 / Run。

2026-10-04 V1-09续批D-197：D-197进一步实现默认无网络Capability、生效网络 / 费用策略快照及未实现限制的启动前拒绝；实际公网TCP / 回环TCP与UDP观测、显式宽权限证明和CLI拒绝通过，主机白名单及费用硬上限仍未实现。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全量32个测试文件307项通过，新增5项策略 / Windows测试及4项CLI回归；原机器探针 / 冻结v1保持，格式仍8，实际模型请求及凭据读取0。下一步先验证可信模型网关的沙箱传输，再实现主机限制、持久预算预留和可靠计费；补齐文件系统硬上限与完整恢复验收后，接正式Task绑定及可信Agent入口 / Run。

2026-10-04 V1-09续批D-198：D-198已完成无网络Capability下的OpenCode 1.18.34合成IPC传输：准确AppContainer SID / 实际PID与创建身份核对、帧限额及重放校验、内容只读模块兼容、取消 / 原生崩溃与归属恢复验证均接通。外部模型请求和实际Key读取0，HTTPS主机 / 路径 / 模型强制限制与持久预算预留 / 可靠计费仍待实现，controlled_execution、正式Task绑定及Agent Run不提升。 Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全量34个测试文件328项通过，新增21项IPC / CLI回归；专项3个测试文件30项另行通过。规则与实际证据见[Runtime IPC传输](CimiLoop-RuntimeIPC传输-v0.1.md)。下一步基于已验证IPC实现宿主HTTPS主机 / 路径 / 模型限制、持久预算预留和可靠计费；补齐文件系统硬上限与完整恢复验收后，接正式Task绑定及可信Agent入口 / Run。

2026-10-04 V1-09续批D-199：D-199已实现宿主HTTPS网关核心和独立SQLite持久预算：固定合成主机 / 路径 / 模型 / 输出上限，TLS验证、响应限额、请求前预留、跨进程竞争及Unknown预留保留通过验证。CLI合成探针12项全部通过，实际Key读取与外部模型请求0。AppContainer IPC与网关尚未桥接，真实Provider计价及受控执行未验收，正式Task绑定与Agent Run继续关闭。 Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全量35个测试文件358项通过，新增30项网关 / 预算 / CLI回归；专项3个测试文件61项通过。 规则、CLI及待接通桥接见[宿主模型网关与持久预算](CimiLoop-宿主模型网关与持久预算-v0.1.md)。下一步接通准确身份核验的AppContainer IPC与宿主网关，先验证OpenCode经IPC收到合成HTTPS回复，再实现可靠真实计价 / Provider验收；补齐文件系统硬配额与完整恢复后接正式Task及Agent Run。

2026-10-05 V1-09续批D-200：D-200已接通无网络AppContainer中的OpenCode IPC与宿主HTTPS网关：固定模块、准确进程身份、私有目录及策略摘要贯穿请求和回复，发送前持久预留，取消 / 崩溃保留Unknown预算。实际OpenCode 1.18.34完成2次合成HTTPS请求，9组桥接异常 / 恢复实测通过；实际Key读取与外部模型请求0。真实Provider计价及受控执行仍未验收，正式Task绑定与Agent Run继续关闭。 Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全量37个测试文件383项通过，新增25项桥接 / 模块 / CLI回归；专项4个测试文件50项通过。 修复HTTPS取消与Runtime正常退出的最终状态竞态，新增确定性回归；Windows原拥有者仍关闭时仅有界重复观察，不强制清理。实际22个保留操作已准确回收；同键不重启，丢失完成证明不补写成功。规则及CLI见[IPC宿主网关桥接](CimiLoop-IPC宿主网关桥接-v0.1.md)。下一步建立真实Provider可核验的计价上界及公网DNS / 固定地址 / 重绑定防护，再做真实网关契约验收；补齐文件系统硬配额与完整恢复后接正式Task及Agent Run。

2026-10-05 V1-09续批D-201：D-201已实现固定智谱Coding Plan公网DNS / 一次性地址固定及TLS对端核验，实际两条A / 两条AAAA与所选IP的TLS1.3验证通过；新增有期限的GLM-5.3积分估算及计费缺项查询。公网连接探针的模型端点HTTP、真实Key读取和外部模型请求0，未启动Runtime。积分估算不作为实际费用或准入证明，真实网关计费与正式Task / Agent执行仍未验收。 地址集合严格核验、最低TTL / 30秒限制、单调时钟过期、准确对端与SNI / 信任链绑定通过；无任意URL、代理、回环旁路或重试。GLM-5.3公开积分系数按较高输入费率、不使用折扣、整数向上取整，只保存有日期的观察，账号版本 / Token上界 / 真实账单仍未知。取消修复后全量39个文件410项通过；随后短TTL修复的最终专项5个文件84项通过。本批新增28项回归，另8次独立取消实测通过，14组原资源归属均确认释放。 规则及CLI见[公网网关边界与积分估算](CimiLoop-公网网关边界与积分估算-v0.1.md)。下一步确认专用连接的套餐版本及网关适用环境，建立包含思考Token的输入 / 输出上界、积分与现金预算的明确关系及持久预留，再验收真实HTTPS / Runtime契约；文件系统硬配额与完整受控恢复仍待完成。

2026-10-05 V1-09续批D-202：D-202已实现独立持久积分演练账本、共享账户 / 任务累计上限、一次发送凭据、历史回执及原宿主身份核验后的恢复。实际三个独立宿主验证共享上限CAS与发送状态提交后的进程退出；15项CLI检查通过。HTTP、真实Key及模型请求0，真实计费准入与正式Task / Agent仍未启用。 独立SQLite积分账本格式1、整积分预留、全账户唯一请求ID、不可复制凭据、到期前再核对dispatch、完成保留全量、超界封锁、原宿主active / unknown拒绝恢复均已接上。专项5个文件89项通过，补充异常完成数据回归后最终全量40个文件436项通过，本批新增25项回归。 领域8及旧TEST账本1保持，未升级用户库。见[持久积分预算与宿主恢复](CimiLoop-持久积分预算与宿主恢复-v0.1.md)。下一步确认套餐版本与网关工具资格，证明服务端输入及思考输出上界，固定实际账户唯一账本、配额 / 账单核对及Task现金 / 积分预算关系，再实现真实HTTPS请求契约；文件系统硬配额和完整受控恢复仍待完成。

2026-10-07 D-212验证固定方法读取适配：三个上游包的全部声明定义经实际OpenCode只读效果核对通过，保持无网络与单进程隔离；仍为合成读取演练，不是内置Skill成功或完整方法调用。见[适配验证](CimiLoop-固定方法读取适配验证-v0.1.md)。

2026-10-07 D-213实现版本化命名方法请求、完整固定资源、显式IPC投影及原调用重放；三个固定上游包经实际OpenCode读取核对通过，保持无网络和单进程隔离。合成回复尚不证明真实方法行为，未批准技能资格或正式Task执行。见[命名调用与效果映射](CimiLoop-命名方法调用与效果映射-v0.1.md)。下一步接正式Context / Run的固定Binding、调用与结果，并完成真实宿主 / 行为评测及Runtime的权限、效果、费用与恢复准入。

2026-10-07 D-214：[Agent上下文与运行固定关系](CimiLoop-Agent上下文与运行固定关系-v0.1.md)与[验证记录](../research/CimiLoop-Agent上下文与运行固定关系-2026-10-07.json)。格式10支持显式1–9迁移；旧Human严格分支保持，生产Agent宿主、实际资格、SkillInvocation及S1仍待完成。
