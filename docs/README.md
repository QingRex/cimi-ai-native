# CimiLoop 文档导航

本页是 AI Native 研发流程、CimiLoop 架构、协议和实施规划的统一入口。第一次了解时，先理解流程，再讨论工具如何承载；准备参与设计或实现时，再按“正式架构”阅读。

## 快速理解

V1-09续批新增[Provider候选登记与接入检查](implementation/CimiLoop-Provider候选登记与接入检查-v0.1.md)：候选治理及元数据检查已接通；后续原生评测和受限绑定见D-195，Task绑定及Agent运行仍未启用。

V1-09续批D-195已接通[Provider证据、评测与受限绑定](implementation/CimiLoop-Provider证据评测与受限绑定-v0.1.md)：智谱真实证据进入Project原生事实，技术契约ALLOW，仅批准合成探针范围；受控执行缺口继续阻止Task绑定。格式8提供显式1–7迁移，未升级用户库，Agent Run仍未启用。

D-196实现[Runtime恢复与资源限额](implementation/CimiLoop-Runtime恢复与资源限额-v0.1.md)：新合成操作按nonce保存资源归属，核对PID / 创建时间 / 程序路径后清理；实际超限与CLI恢复通过，同键不重启、未完成观测仍Unknown。日志限长与沙箱采样阈值已落实，完整硬配额及正式Task执行仍未验收。

最新D-202已实现独立持久积分演练账本、共享账户 / 任务累计上限、一次发送凭据、历史回执及原宿主身份核验后的恢复。实际三个独立宿主验证共享上限CAS与发送状态提交后的进程退出；15项CLI检查通过。HTTP、真实Key及模型请求0，真实计费准入与正式Task / Agent仍未启用。 专项5个文件89项通过，补充异常完成数据回归后最终全量40个文件436项通过，本批新增25项回归。 见[持久积分预算与宿主恢复](implementation/CimiLoop-持久积分预算与宿主恢复-v0.1.md)。下一步确认套餐版本与网关工具资格，证明服务端输入及思考输出上界，固定实际账户唯一账本、配额 / 账单核对及Task现金 / 积分预算关系，再实现真实HTTPS请求契约；文件系统硬配额和完整受控恢复仍待完成。

1. [AI Native 软件研发新范式：七段入门文章](articles/01-AI-Native软件研发新范式.md)：沿 SkillsHub 版本需求讲流程，不先引入 CimiLoop。
2. [AI Native 软件研发流程基线](architecture/AI-Native软件研发流程-v0.1.md)：查看 N1–N5 主线、责任、验证交接、release 条件与环境管理、交付收尾及复盘细则；七段是讲解顺序，不是新生命周期。
3. [执行记录与演练](practices/AI-Native研发流程执行记录与演练-v0.1.md)：团队约定、轻量记录、已填写的虚构示例，以及三个待执行的真实演练场景。
4. [CimiLoop 业务对象与协作闭环设计](architecture/CimiLoop业务对象与协作闭环设计-v0.1.md)：业务设计来源与三个场景推演；具体 V1 选择已由[可执行设计与实施计划](implementation/CimiLoop-V1可执行设计与实施计划-v0.1.md)收敛。
5. [分享讲稿入口](articles/03-从AI-Native新范式到CimiLoop-分享讲稿-v0.1.md)：先讲流程；CimiLoop 后半场待继续讨论，旧讲稿及图仅作历史参考。
6. [CimiLoop 整体架构通俗解读](architecture/CimiLoop整体架构通俗解读-v0.1.md)：顶部解释当前设计，后续正文保存历史来源，不等于代码全部实现。

先讨论流程，再讨论 CimiLoop。SkillsHub 示例中的具体产品规则和方案尚未获批，不能当作功能开发规格。

2026-09-30 阶段修订：N3 现为共同集成与发布准备，N4 为发布验证与生产交付；风险授权贯穿 N1–N5，不再占用第三阶段。原 `02` 规范及旧讲稿中的“N3 风险授权”是历史表述。

2026-10-02 流程细则与评审修订：现行规则已归入独立流程基线，决策账本 D-149–D-172 保存来源及替代关系。本轮补齐生产基线紧急修复、环境恢复与长观察窗口释放、独立评价、跨会话接续、贯穿式验收责任、开工容量与授权、试运行度量。下一步覆盖普通低风险修改、依赖需求延期、下一批验证期间紧急生产修复三个场景；配套示例均为虚构，真实演练尚未执行，演练本身不授权功能开发。

2026-10-02–04 CimiLoop设计与实施：业务设计收敛为V1实施基线，11份架构顶部承载当前规则。技能包装与试点已补入S1，OpenSpec作为可选任务；23项任务与32个场景分别标明必选 / 可选。V1-01–05本阶段实现及联调已完成；V1-06本阶段人工路径已接通固定源码、证据 / 独立评价、任务满足、批准条件核验、证据失效处置及普通 / 高风险安全集成。迁移与恢复见[操作文档](implementation/CimiLoop-M0数据库迁移与恢复-v0.1.md)，角色与CLI见[责任治理与身份入口](implementation/CimiLoop责任治理与身份入口-v0.1.md)，规划见[项目设置、规划与容量](implementation/CimiLoop项目设置规划与容量-v0.1.md)，确认见[约定、计划确认与开工](implementation/CimiLoop约定计划确认与开工-v0.1.md)，Task / WorkItem见[任务、授权与预算](implementation/CimiLoop任务授权与预算-v0.1.md)，本批验证见[证据、评价与安全集成](implementation/CimiLoop证据评价与安全集成-v0.1.md)。仅升级临时测试样本，真实Provider继续按计划实施；最新测试结果见实施基线。 V1-07已接通Human运行预约、原始观测、累计预算、工作区交接、接续及暂停需求恢复，操作见[运行预约与交接恢复](implementation/CimiLoop运行预约与交接恢复-v0.1.md)；当前格式8，支持显式1–7升级。V1-08 CLI共享查询、对象详情、冲突及缺项输出已完成，操作见[CLI动作、查询与诊断](implementation/CimiLoop-CLI动作查询与诊断-v0.1.md)；V1-09实施中，独立探针Adapter与Windows隔离已实现，OpenCode更新1.18.34；专用智谱GLM-5.3已完成真实合成修改及独立只读评价，Key仓库外DPAPI加密；前批Zen403保留。原生Provider评测和探针范围绑定已接通；受控执行缺口仍阻止Task绑定，D-196已接通合成操作恢复与资源阈值控制；Agent Run、费用 / 网络主机 / 文件系统硬上限和完整恢复验收仍待完成。操作与实测证据见[Runtime探针与隔离](implementation/CimiLoop-Runtime探针与隔离-v0.1.md)。

## 当前适用状态（2026-10-04 校准）

| 材料 | 当前用途 | 不应据此推断 |
|---|---|---|
| 独立研发流程基线 | 已确认主线、关键责任、集成发布和异常处置细则；真实需求演练的流程依据 | 所有项目细节、系统状态或能力已经完成设计 / 实现 |
| 七段入门文章 | 整体流程和 N1–N5 映射的通俗讲解；最新细则以独立流程基线为准 | 讲解文章包含本轮所有细则或构成功能开发规格 |
| 执行记录与演练 | 可填写的记录、团队约定与虚构填写示例，指导实际演练及度量 | 示例结果等于真实测试证据，或真实演练已经完成 |
| 流程决策账本 | 解释规则来源及替代关系 | 需要拼接新旧决策才能执行当前流程 |
| CimiLoop 业务对象与协作闭环设计 | 业务边界与场景推演的来源；当前选择由实施基线收敛 | 提案所有替代选项同时生效，或场景推演等于真实验证 |
| V1 可执行设计与实施计划 | 当前开发入口：字段、状态、命令、兼容及23项任务、32个场景；第10节记录实际进度 | 一个任务完成等于完整V1、迁移器或Runtime/部署能力已经完成 |
| 原 `02` 流程规范 | 保留输入、活动、分工、输出、检查、异常、退出等细化结构供参考 | 旧 N3 阶段命名或正文仍是现行上位规范 |
| CimiLoop 专项架构 | 顶部为当前职责及约束，后面的旧讨论正文用于追溯 | 历史状态和聚合边界仍可覆盖当前实施基线 |
| 统一模型决策、旧 V1 范围、总执行计划、M1–M5、原型方案及提示词 | 历史设计与任务来源；顶部链接当前开发入口 | 可以按旧任务顺序直接交给开发 Agent 连续执行 |
| M0 实施记录、背景研究、旧讲稿和配图 | 已有实现记录或历史参考，按各自声明阅读 | 历史材料会随新流程自动变成现行规格 |

真实流程演练与 S1 实施可分别推进。流程规则统一以[独立流程基线](architecture/AI-Native软件研发流程-v0.1.md)为准，CimiLoop 当前开发规则以[实施基线](implementation/CimiLoop-V1可执行设计与实施计划-v0.1.md)为准，[决策账本](plans/2026-09-18-cimiloop-capability-architecture-discussion-plan.md)记录原因和替代关系。变更时同次同步受影响材料；旧计划指令不生效，迁移仅在临时样本验证，未升级实际项目库。

## 正式架构

建议按以下顺序阅读：

先读 [独立研发流程基线](architecture/AI-Native软件研发流程-v0.1.md)，再读[业务对象与协作闭环设计](architecture/CimiLoop业务对象与协作闭环设计-v0.1.md)与[可执行设计](implementation/CimiLoop-V1可执行设计与实施计划-v0.1.md)。下列专项顶部已同步当前职责与约束，后面的原讨论正文标为历史；流程与工具分层，不要求业务用户先掌握内部协议词汇。

1. [整体能力架构](architecture/CimiLoop整体能力架构-v0.1.md)
2. [Cimi Change Protocol 核心领域模型](architecture/CimiChangeProtocol核心领域模型-v0.1.md)
3. [Change 端到端状态机](architecture/CimiLoopChange端到端状态机-v0.1.md)
4. [验证与证据模型](architecture/CimiLoop验证与证据模型-v0.1.md)
5. [上下文与知识模型](architecture/CimiLoop上下文与知识模型-v0.1.md)
6. [角色与权限模型](architecture/CimiLoop角色与权限模型-v0.1.md)
7. [工作台与变更空间交互模型](architecture/CimiLoop工作台与变更空间交互模型-v0.1.md)
8. [能力装配模型](architecture/CimiLoop能力装配模型-v0.1.md)
9. [工程交付与 DevOps 模型](architecture/CimiLoop工程交付与DevOps模型-v0.1.md)
10. [存储与 Solo–Team 演进模型](architecture/CimiLoop存储与Solo-Team演进模型-v0.1.md)

## 产品范围与计划

当前范围与任务见 [V1 可执行设计与实施计划](implementation/CimiLoop-V1可执行设计与实施计划-v0.1.md)，按 S1–S4 执行。以下 V1 范围、总执行计划、M1–M5 和原型材料保留历史，不作为当前开发指令。选型矩阵的权威 / 适配原则继续参考，实际 Provider 版本与能力由当前探针验证。

- [CimiLoop 交互式演示原型需求与实施计划](plans/2026-09-21-cimiloop-interactive-demo-prototype.md)
- [CimiLoop 交互式演示原型开发 Agent 提示词](plans/2026-09-21-cimiloop-interactive-demo-agent-prompt.md)
- [V1 产品范围与实施里程碑](plans/2026-09-19-cimiloop-v1产品范围与实施里程碑-v0.1.md)
- [V1 完整执行计划（旧开发 Agent 入口，暂不直接执行）](plans/2026-09-20-cimiloop-v1-complete-execution-plan.md)
- [M1：Intent、Plan 与 Human Decision 实施计划](plans/2026-09-20-cimiloop-m1-intent-plan-decision-implementation-plan.md)
- [M2：Execution、Context 与 Immutable Artifact 实施计划](plans/2026-09-20-cimiloop-m2-execution-context-artifact-implementation-plan.md)
- [M3：Claim–Evidence 与 Independent Evaluation 实施计划](plans/2026-09-20-cimiloop-m3-evidence-evaluation-implementation-plan.md)
- [M4：Test、Production 与 Recovery 实施计划](plans/2026-09-20-cimiloop-m4-delivery-recovery-implementation-plan.md)
- [M5：Product Closure、Portability 与 Release Hardening 实施计划](plans/2026-09-20-cimiloop-m5-product-portability-release-implementation-plan.md)
- [Build / Adopt / Adapt 选型矩阵](plans/2026-09-19-cimiloop-build-adopt-adapt选型矩阵-v0.1.md)
- [能力架构讨论计划与决策账本](plans/2026-09-18-cimiloop-capability-architecture-discussion-plan.md)
- [需求 / 缺陷统一模型与共享发布决策](plans/2026-09-28-cimiloop-requirement-bug-unified-model-design.md)

## 背景研究

以下材料形成于正式架构之前，保留作为行业背景、方案来源和历史依据：

- [早期研发操作模型](plans/2026-09-17-cimiloop-ai-native研发操作模型-v0.1.md)：旧讨论记录，现行流程以独立流程基线为准。
- [原 CimiLoop 流程规范](articles/02-CimiLoop-AI-Native软件研发流程规范-v0.1.md)：保留细化结构作参考；旧 N3 阶段命名、正文及图片不作为现行上位规范，现行规则见独立流程基线。
- [背景研究导航](research/README.md)
- [AI-Native Harness 开源项目深度调研与选型建议](research/AI-Native-Harness开源项目深度调研与选型建议-2026.md)
- [AI-Native 软件研发新范式行业深度调研](research/AI-Native软件研发新范式行业深度调研-2026.md)
- [AI-Native 软件研发新范式行业调研精炼版](research/AI-Native软件研发新范式行业调研-精炼版-2026.md)
- [AI-Native 产研全流程 v1.7 行业对标与 v2.0 优化建议](research/AI-Native产研全流程v1.7-行业对标与v2.0优化建议.md)

## 实施设计

- [V1 可执行设计与实施计划（当前开发入口）](implementation/CimiLoop-V1可执行设计与实施计划-v0.1.md)
- [实施设计导航与已确认技术决策](implementation/README.md)
- [M0 实施架构](implementation/2026-09-19-cimiloop-m0实施架构-v0.1.md)

## 文档职责

| 类型 | 主要职责 | 更新时机 |
|---|---|---|
| `architecture/` | 稳定的领域语义、协议和架构边界 | 架构决策改变时 |
| `plans/` | 讨论过程、决策账本、范围和实施计划 | 决策确认或计划变化后立即更新 |
| `practices/` | 流程执行记录、填写示例及演练方法 | 流程规则变化或试运行发现问题后；示例与实测证据明确区分 |
| `articles/` | 面向非架构参与者的解释和传播 | 正式架构发生重要变化后 |
| `research/` | 保存背景研究、历史输入及其图片 | 原则上只修正事实，不持续承载正式设计 |
| `implementation/` | 技术选型、模块布局、接口契约和可执行里程碑 | 实施决策确认后立即更新 |

`implementation/` 不替代 `architecture/` 中稳定的领域语义；实现如果发现结构冲突，应先回到架构决策账本确认，再修改代码边界。
