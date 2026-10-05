# CimiLoop

CimiLoop 是一个面向 AI-Native 软件研发的 Runtime-neutral Harness（运行时中立研发控制框架）。它围绕一个 Change（变更）组织意图、计划、执行、证据、决策与知识更新，让 Claude Code、OpenCode 等 Agent Runtime 在统一协议和治理边界下完成可恢复、可审计、可闭环的研发流程。

## 当前状态

当前开发入口是[CimiLoop V1可执行设计与实施计划](docs/implementation/CimiLoop-V1可执行设计与实施计划-v0.1.md)。S1–S4共23项任务，OpenSpec试点可选，技能Provider及Matt / Superpowers试点进入S1。V1-01–05、V1-06本阶段人工验证与安全集成、V1-07 Human运行控制及V1-08 CLI已完成本阶段实现及联调。格式8支持显式1–7升级并保留历史、任务、授权、运行和回执；没有升级用户现有数据库。

V1-09实施中：独立探针Adapter与Windows AppContainer / Job隔离已实现，OpenCode已更新1.18.34并固定摘要。专用智谱`zhipuai-coding-plan/glm-5.3`已完成真实合成文件修改及新只读会话独立验收，双模式权限探针通过；Key以Windows DPAPI加密保存在仓库外。前批Zen免费接口403保留为历史事实。原生Provider评测及探针范围Binding已接通；新合成操作的资源归属、恢复清理及磁盘 / 日志超限停止已由D-196实现；Task绑定、Agent Run及网络 / 费用 / 文件系统硬配额和完整恢复验收仍待完成。操作与实测证据见[Runtime探针与隔离](docs/implementation/CimiLoop-Runtime探针与隔离-v0.1.md)。合成探针不修改Task、原生Run或Gate，正式Agent执行尚未启用。

V1-09续批已接通`provider register / list`、原生Provider元数据详情及Binding / Agent身份缺口检查；登记固定candidate，不批准正式绑定，不授权运行。规则与操作见[Provider候选登记与接入检查](docs/implementation/CimiLoop-Provider候选登记与接入检查-v0.1.md)。

最新续批已接通原生Provider证据、两类确定性评测及Human批准的探针范围Binding，见[Provider证据、评测与受限绑定](docs/implementation/CimiLoop-Provider证据评测与受限绑定-v0.1.md)。智谱实际证据经CLI导入后，技术契约ALLOW；受控执行因费用 / 网络 / 磁盘 / 恢复证据未完备保持NEED_MORE_EVIDENCE，Task执行绑定被拒绝。

D-196已接通[Runtime恢复与资源限额](docs/implementation/CimiLoop-Runtime恢复与资源限额-v0.1.md)：实际Windows中断 / 超限与CLI恢复已验证，原运行Unknown不因资源清理而变成成功，同键不重启。日志在写入前限长，沙箱总量采用采样后停止，完整硬配额尚未验收。

D-208已实现原生Human Run实时工具权限查询及独立公开文件执行账本：固定WorkItem / Context / 原操作身份，执行和缓存重放前重新核对授权；公开读取 / 替换保存完成回执，确认原宿主退出后将未dispatch预约归为not_started、已dispatch未完成保留Unknown。四处实际Windows宿主退出和双宿主一槽位争用通过，工具事实不推进原生Task / Run。正式工作区效果、IPC / OpenCode接入该账本及Agent运行仍待验收。 见[WorkItem工具授权与执行账本](docs/implementation/CimiLoop-WorkItem工具授权与执行账本-v0.1.md)。下一步建立正式工作区的宿主文件 / 命令能力约束和可验证效果身份，将实时授权与工具账本接入IPC / OpenCode消费，并把工具Unknown纳入原生Run接续核对；继续完成整体受控恢复和物理硬配额。实际套餐 / 工具资格、服务端输入及思考输出上界、受保护的唯一账户Ledger、批准的现金 / 积分预算和账单核对仍待落实。

已实现操作见[任务、授权与预算](docs/implementation/CimiLoop任务授权与预算-v0.1.md)、[证据、评价与安全集成](docs/implementation/CimiLoop证据评价与安全集成-v0.1.md)、[运行预约与交接恢复](docs/implementation/CimiLoop运行预约与交接恢复-v0.1.md)及[CLI动作、查询与诊断](docs/implementation/CimiLoop-CLI动作查询与诊断-v0.1.md)。

既有设计与实现记录：

- 已确认六个一级能力域，以及 Kernel（内核）作为 Change 生命周期唯一状态权威。
- 已完成核心领域模型、聚合边界、身份与版本关系设计。
- 已完成 Cimi Change Protocol（Cimi 变更协议）、状态机、事件模型和命令语义设计。
- 已完成 V1 Embedded Solo Mode（嵌入式单人模式）的范围、里程碑与验收口径。
- 已补充 Knowledge Closure（知识闭环），把受影响文档更新纳入 Change 的任务、证据和关闭条件。
- V1 首批 Agent Runtime 目标为 OpenCode 和 Claude Code；cimicode 是企业内部基于 OpenCode 二次开发的 Runtime，后续通过同一适配边界接入。

项目已经进入正式实现阶段。M0 首个可恢复纵向切片已经可以运行：初始化 Project、创建 Draft Change、查询、暂停、恢复、幂等重放、Revision 冲突检查、Event/Outbox 原子提交及重启恢复。Contract、Plan、Gate 和 Agent Runtime Adapter 从后续里程碑逐步加入。

2026-09-29 文档校准记录：当时字段、状态及迁移待设计；2026-10-03 已由当前实施基线收敛。现行流程采用 N1–N5，七段文章只是讲解顺序。旧范围及 M1–M5 / 原型计划保留历史参考，当前不直接执行，不能据文档更新声称代码已迁移。详见 [文档适用状态](docs/README.md)。

2026-09-30 阶段修订：N3 改为共同集成与发布准备，N4 聚焦发布验证与生产交付；风险授权贯穿 N1–N5，不单列为第三阶段。旧规范、讲稿和配图中的“N3 风险授权”仅作历史参考，现行映射以 [研发流程基线](docs/architecture/AI-Native软件研发流程-v0.1.md) 为准。

2026-10-02 流程评审修订：当前有效规则统一归入流程基线，补齐紧急修复、环境恢复、独立评价、接续执行、验收责任和开工容量；新增[执行记录与演练](docs/practices/AI-Native研发流程执行记录与演练-v0.1.md)。填写示例为虚构，三个真实演练场景尚未执行；本轮仅更新流程文档。

2026-10-02–03 产品与实施设计：已产出 [业务对象与协作闭环设计](docs/architecture/CimiLoop业务对象与协作闭环设计-v0.1.md)及可执行设计，明确需求、批次、候选、环境、授权与执行边界，包含三个场景推演、具体开发任务和故障验收。专项规则与领域语言已同步；协议基础已实现，其余功能、真实工作台、Provider集成和流程演练按任务推进。

## 建议阅读顺序

1. [AI Native 软件研发新范式](docs/articles/01-AI-Native软件研发新范式.md)：先沿 SkillsHub 版本需求理解七段流程，不先讲 CimiLoop。
2. [AI Native 软件研发流程基线](docs/architecture/AI-Native软件研发流程-v0.1.md)：已确认流程、协作边界与共同发布规则。
3. [CimiLoop 业务对象与协作闭环设计](docs/architecture/CimiLoop业务对象与协作闭环设计-v0.1.md)：产品边界和三个场景推演，具体选择以实施基线为准。
4. [CimiLoop V1 可执行设计与实施计划](docs/implementation/CimiLoop-V1可执行设计与实施计划-v0.1.md)：当前开发入口，字段、命令、迁移、任务与验收统一在此。
5. [CimiLoop 整体架构通俗解读](docs/architecture/CimiLoop整体架构通俗解读-v0.1.md)：先读顶部当前设计，历史正文保留作来源。
6. [CimiLoop 整体能力架构](docs/architecture/CimiLoop整体能力架构-v0.1.md)：当前架构职责及历史记录。
7. [文档导航](docs/README.md)：查看完整架构、协议、角色与计划文档。

## 核心原则

- Change-centered（以变更为中心）：需求 / 缺陷在内部保持同一 Change 身份；项目级共同集成与发布关联实际纳入范围，不伪造额外需求承载部署。
- Kernel-authoritative（内核权威）：只有 Kernel 可以推进生命周期状态和记录 Gate（关卡）结论。
- Runtime-neutral（运行时中立）：Agent Runtime 可以替换，领域协议和治理语义保持稳定。
- Evidence-based（基于证据）：声明完成不等于完成，Gate 必须基于可验证 Evidence（证据）作出判断。
- Knowledge-closed（知识闭环）：代码、产品和业务事实变化后，相关知识必须同步或明确判定无需更新。
- Local-first（本地优先）：V1 先交付 Embedded Solo Mode，同时预留稳定 ID、Store Port、Event 和 Export/Import 边界。

## 仓库结构

```text
.
├─ apps/
│  ├─ cli/            # cimiloop 命令行入口与本地装配
│  └─ demo-web/       # 纯前端交互演示原型，不连接正式 Kernel
├─ packages/
│  ├─ protocol/       # Protocol Schema、ID、Command/Event 与校验
│  ├─ kernel/         # 聚合规则、状态转换和命令处理
│  ├─ store/          # Kernel 使用的逻辑 Store Port
│  ├─ store-sqlite/   # Embedded Solo Mode SQLite 实现
│  └─ runtime-adapter/# 独立Runtime探针、受限启动与原始结果采集；正式Agent Run待接通
├─ tests/
│  └─ scenarios/      # 跨模块和 CLI 端到端场景
├─ docs/
│  ├─ architecture/   # 正式架构、领域模型、协议与流程规范
│  ├─ plans/          # 讨论记录、决策账本、产品范围与实施计划
│  ├─ practices/      # 流程执行记录、虚构填写示例与演练方法
│  ├─ articles/       # 面向传播和理解的流程文章
│  ├─ research/       # 历史调研、选型输入及其图片
│  └─ implementation/ # 技术决策与 M0–M5 实施设计
├─ .agents/skills/    # 本地 Agent 辅助技能，不属于产品运行时
└─ .claude/skills/    # 本地 Claude Code 辅助技能，不属于产品运行时
```

## 本地开发

要求 Node.js 24.15+。项目精确使用 pnpm 12.4.2；尚未发布全局安装包，当前从源码运行：

```text
npx pnpm@12.4.2 install
npx pnpm@12.4.2 build
npx pnpm@12.4.2 test

node apps/cli/dist/bin.js --help
node apps/cli/dist/bin.js init
node apps/cli/dist/bin.js change create --title "第一个 Change"
node apps/cli/dist/bin.js change list
node apps/cli/dist/bin.js --json inspect change CHG-0001
```

本地操作者或受信脚本增加 `--json` 可获得经过 Protocol Schema 校验的稳定结构输出。CLI 绑定初始化的本地 Human 身份；Agent Runtime 须通过绑定 Agent 的入口，不能借人类 CLI 代行责任操作，该 Runtime 入口尚未接入。

角色登记、指派、结束与责任移交的命令及兼容边界见 [责任治理与身份入口](docs/implementation/CimiLoop责任治理与身份入口-v0.1.md)。

设置更新、目标版本、规划排序和WIP命令见 [项目设置、规划与容量](docs/implementation/CimiLoop项目设置规划与容量-v0.1.md)。未配置容量或缺少真实确认依据时，开工保持阻塞。

交互式演示原型（固定数据，可离线）：

```text
npx pnpm@12.4.2 --filter @cimiloop/demo-web dev
```

讲解入口、7 个场景和 Presenter 快捷键见 [apps/demo-web/README.md](apps/demo-web/README.md)。

原型仍采用旧业务词汇与演示路径，尚未同步 2026-09-28 确认流程；不能把固定数据演示当成现行流程或能力已经实现。

## V1 北极星流程

这是目标闭环，不代表下列能力已全部实现。先理解独立研发流程，再讨论 CimiLoop 如何承载。

```text
录入需求 / 缺陷，先澄清，必要时平级拆分
  → 确认目标、范围、验收与实施计划
  → 人与 AI 按授权任务协作实施、自检和独立评价
  → 多需求合入 feature，共同构建与早期测试
  → 切出 release，测试环境切换并暂停 feature 覆盖
  → 修复优先，必要时安全剔除延期并验证最终软件包
  → 批准整批发布，同一获批软件包晋升生产
  → 生产验证或获准恢复
  → 逐需求确认交付、完成必要知识更新，保留记录
  → 观察效果、整理反馈，进入下一轮
```

## 下一阶段

当前正在S1，V1-06人工复核、V1-07 Human运行控制 / 交接恢复及V1-08 CLI已完成本阶段实现。V1-09最新进展见[WorkItem工具授权与执行账本](docs/implementation/CimiLoop-WorkItem工具授权与执行账本-v0.1.md)及实施基线第10节。下一步建立正式工作区的宿主文件 / 命令能力约束和可验证效果身份，将实时授权与工具账本接入IPC / OpenCode消费，并把工具Unknown纳入原生Run接续核对；继续完成整体受控恢复和物理硬配额。实际套餐 / 工具资格、服务端输入及思考输出上界、受保护的唯一账户Ledger、批准的现金 / 积分预算和账单核对仍待落实。S1退出要求普通需求在真实Runtime和受控技能上走到可安全集成，并验证跨会话接续与可靠性；人工报告及另一Actor不能替代真实Agent独立上下文。完整业务闭环仍在实施。

已有M0项目的操作说明见 [数据库迁移与恢复](docs/implementation/CimiLoop-M0数据库迁移与恢复-v0.1.md)。正常入口只提示迁移，不自动升级实际项目。

M0 已补齐 CLI 机器输出 Schema、JSON Schema 制品同步与全量注册、共享 Store Port 契约，以及事务回滚、幂等重放、双客户端 Revision 竞争、响应丢失恢复、数据库重开与 Outbox Lease 恢复测试，并已在 Node.js 24.15.0 + pnpm 12.4.2 基线上完成复验。M0 现已冻结；原 M1 的约定、计划、风险、决定和知识影响进入 S1 当前任务。M0 实现边界见 [M0 实施架构](docs/implementation/2026-09-19-cimiloop-m0实施架构-v0.1.md)。
