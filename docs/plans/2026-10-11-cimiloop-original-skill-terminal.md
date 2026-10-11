# CimiLoop 原 Skill 终态与历史资格核对

2026-10-11，D-275，接续 D-274。完整 V1-09/21/22/10/11 目标保持 active，默认 Agent 关闭、零付费、242 Schema / 用户库10不变。不读取真实凭据，不改旧 Unknown 或失败原件，不 push。

当前原 Skill 结果采集只生成 Unknown，即使原 Native/SDK 正常完成且原账单已认证，仍不能通过现有 Human ReconcileSkillInvocation 结清。结果中的资格引用必须按原固定来源、方法、Runtime及完整评测重新核对，不能只读 ALLOW 标签或在核对时补建资格。

本批实现路径：

1. 用既有 NamedSkillMethodAssessment 历史评测器复读预约时固定的资格原件；只接受 controlled_execution 的精确原评测，完整原件复验必须相同。不调用当前执行准入，不产生新模型或方法效果。
2. 原结果采集增加显式 reconciliation 格式，要求原命名方法成功、完整 Native/SDK/IPC/Job 原件、原账户最终现金/积分账单、历史资格同时成立。生成完整未知/冲突观察引用与原输出；旧候选格式和 Unknown 语义保持。
3. 接入共享 Human 应用服务与工作台原命令恢复，由 Kernel 独立再验并提交 ReconcileSkillInvocation。响应丢失按原 command_id 恢复，不重开 Run/Skill，不重新计费；父 Run 与 Task 验收继续独立。
4. 行为红测后实施，运行受影响回归、pnpm check、CLI帮助及当前源码实际 Windows/AppContainer 完整文件；构造资格/模型/账单清晰标注，不能算真实 Skill/Matt/Superpowers/S1。

真实模型、套餐和预算仍缺确认；完整失败/取消子终态、真实方法资格来源、前置 Human/Matt 澄清、物理磁盘配额及完整 S1 继续推进。仅正常退出的原子方法成功可使用本批成功核对路径，不能由没有文件推导 not_started 或零费用。

本批完整验证：最终受影响4文件36项、实际Windows4文件8项通过0跳过，五组active。见 [实施记录](../implementation/CimiLoop-原Skill终态与历史资格核对-v0.1.md) 与 [研究记录](../research/CimiLoop-original-skill-terminal-2026-10-11.json)。
