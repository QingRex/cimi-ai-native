# CimiLoop 原 Skill 账单用量接入计划

2026-10-11，D-271。接续 D-270 d38de7fe72fcd98a6b46ec3a139f7154faefc786，完整五组 S1 持续目标保持活动。242 Schema、用户库格式 10、默认正式 Agent 关闭和不 push 均保持。

1. 用真实共享 Native/SDK 场景先证明原 Skill 捕获尚无账单用量接入；测试使用明确标注的本地 TLS、虚构凭据、构造资格与账单认证，不能用于真实 S1 资格。
2. 复用 readOriginalDedicatedAgentRunCosts，限定原 child scope/modelRoot、同一专用账户、原调用 request/hold 和认证最终账单；必须匹配父 RunRecord 币种，现金与积分不能混为一种预算。
3. 通过可信代码安装原账户，新增 captureCosts；保存独立 billed-candidate 格式，保持 Unknown、资格与账户成功证明 false、Kernel 费用结清 false。旧 unbilled-candidate 不自动升级且仍可只读。
4. readResult 在 Kernel 当前 Writer/Reader 上重核原身份，并逐次重读认证账单与所有费用关联，拒绝部分或缺失原账单、错误账户、金额/币种/积分篡改和缺认证端口。
5. 用原 RecordSkillInvocationObservation 录入已核定现金用量，证明原命令重放、原预算保留、历史证据复验以及 Native/模型/凭据读取计数不增加。既有 Unknown 不因账单齐全消失；父费用后续须按完整家庭原范围核对，不能再次叠加已含子费用的总额。
6. 完成受影响回归、实际 Windows 原生范围、类型检查、CLI、Schema、源码冻结、文档检查及工程复核，更新实施/研究记录后本地提交。

具体模型、套餐、现金及积分上限仍未确认，不读取真实凭据、不执行付费请求。独立真实 Skill/Matt/Superpowers、工作台接入及真实 Change 到 ReadyForDelivery 均继续属于完整目标。
