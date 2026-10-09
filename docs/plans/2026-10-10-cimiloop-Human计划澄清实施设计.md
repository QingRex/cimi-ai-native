# D-251 Human 计划澄清实施设计

完整五组 S1 目标保持 active；本批接当前正式约定下、Plan / Task 尚不存在时的 Human 问答和计划候选，不替代 Matt 或全面 Kernel 前置证据规则。

复用现有共享澄清服务及 HTTP / CLI / 原请求恢复；新增显式 begin.target=plan 与 plan_candidate 动作。仅扩展生命周期检查而把旧会话重新解释为计划会改变历史含义；另建平行服务会重复恢复与身份规则。采用原服务中的显式新记录格式2，旧格式1精确读取、原字节不修改。独立 SQLite DDL / user_version1、项目库10和242 Schema不变，不执行用户库迁移。

新会话固定当前 Change 和真实正式 Contract；问题回答必须完成后以原 Command ID 调用 Kernel SubmitPlanProposal，含现有 PlanBody 任务定义。候选不确认计划、不初始化 Task、不写真实 Skill 资格或费用。Human 负责人入口规则保持，实际提交仍检查 technical_owner，不从对话自动授予角色。

原候选先登记后提交，响应丢失沿原身份复用 Kernel 收据。已存在候选 / Plan / Task 不补记前置澄清；依据变化拒绝新轮次，但原已提交或 pending 请求允许核对，不创建替代候选。阶段错配与外来 Contract 在预约前拒绝。工作台在正式约定后显示计划问答和完整 PlanBody 候选入口，CLI沿原 begin / advance --file 输入复用。

验证先红后绿，包含实际SQLite / Kernel / HTTP / CLI、原字节兼容、角色和阶段错配、正式约定变化、响应丢失以及无重复候选 / Task。保留旧全部相关工作台回归。普通独立工程复核不算真实 Matt / Superpowers。最后更新实现 / 交接 / 研究并本地提交，不 push。
