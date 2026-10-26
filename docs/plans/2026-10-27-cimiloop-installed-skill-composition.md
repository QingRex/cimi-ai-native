# 已安装 Codex 账户与默认评审 Skill 组合

接续 `6aa05bd`。这批补的是生产组合中的实际缺口：已有 `LocalAgentRuntimeSkills` 可以执行原子调用，但完整 Runtime 宿主仍须手写方法证据选择、当前域权限回调和父目录回调。现在提供具体的账户原件适配，并在完整准入租约接收到既有 Codex 账户时自动装入。

## 实际接线

`createCodexAgentRuntimeSkillInstallation(local, account)` 使用既有账户和安装租约，不开登录、不创建账户、不改容量，不发送模型请求。其原件读取器是现有 `LocalCodexNamedMethodOriginals`；不会把其尚未证明的权限、费用、恢复或方法行为改成 passed。

父目录由当前原 Run 的 TaskDefinition、Contract、Plan、Skill Binding 及实际导入包生成。只接受原 Context 已固定的 review 技能。方法名来自固定包入口；SDK 只看到 `review_1` 等别名和 `current` 输入别名。目标来自批准的 Task，规格包含关联 Contract 的目标、范围、非目标、该 Task 的验收项及允许修改，标准来自 Contract 约束和 Task 的验证方法及证据要求；固定检查使用安装目录。不接受模型提供的路径、配方、Binding 或证据引用。

输入不因超过固定方法的 4000 字符容量而截断。超限明确拒绝，必须显式调整 Task。其他用途的技能不被悄悄当成 review，Plan/Task 创建前的 Human/Matt 澄清仍走其独立应用服务。

方法证据只从该 Binding 固定的 Provider evidence 引用读取，核对原项目、Descriptor 摘要、Runtime pin、方法、用途和观察时间。缺失、非命名方法证据、相互冲突的原件均拒绝。得到一个引用之后，仍由现有资格评估器逐次独立重读 Native/SDK/模型/账户原件；不是读取 ALLOW 标签就准入。

当前 Task、WorkItem、Provider 指派、权限和费用预约交集复用 Kernel 的 `currentAgentSkillMethodProblems`。这个函数只返回当前域问题，不授予执行或方法资格；能够在当前 Writer 的同步读取范围内使用，不另开嵌套事务。父 Run 有未结清子调用时，只允许那个精确原 key、方法、用途和 Binding；另一身份、已结清或 Unknown 调用均不能借此获准。原执行和模型效果仍保留各自的 Kernel/Native/账户门禁。

`LocalAgentRuntimeAdmission.open` 的受信任宿主参数现在可传 `codexAccount`，自动选择这套具体适配，复用现有准备、子 Native、结果收集和历史读取服务；不再需要手写 `methods` 和 `catalog` 回调。既有显式受信任适配接口保持兼容。租约借用账户，检查原 guard、安装、预算来源和 Host；释放 Runtime 租约不关闭该账户或重置预算。执行阶段另开账户时必须仍属于同一安装、同一容量政策和原账户根。

这不是 HTTP/CLI 可导入的授权 JSON。默认 CLI/工作台完整生产宿主的自动装载仍须继续实现；`full` 的四项真实控制来源仍为必要条件。只安装 Codex 或提供 `codexAccount` 都不能替代它们。本批尚不能让普通用户在缺少这些条件时执行正式 Run。

## 验证

新增两个目录/原身份用例和三个 Kernel 当前权限用例先运行失败，均已收集，失败原因是所需具体入口尚不存在，非模块加载错误。实现后的类型检查与受影响整文件结果见下方最终记录；首次修正了版本引用应使用 `domain_version` 和测试闭包的类型收窄。另增加默认自动装配拒绝构造资格的整合用例。

实际执行使用 Node24.22.1、pnpm12.4.2，并仅为子进程设置 D 盘 TEMP/TMP。最新 `pnpm check` 通过。首轮两个完整文件为23通过、3失败、0跳过；三项失败来自新测试传入初始化时的旧Project，现改用当前SQLite Project。检查测试时另发现取消用例原先没有必填reason，已补齐并先断言取消命令确实成功，避免因其他拒绝条件而误通过。

第二轮只复验新增六项，为5通过、1失败、20跳过，其中Kernel新文件完整3项通过。剩余失败是实际实现缺陷：严格JSON原件的对象原型使相同摘要的深比较误拒绝；现将已严格校验的原件structuredClone后核对完整字段，不改变身份、资格或费用判据。

最后应用服务三个定向用例全部通过、0失败、20跳过。正例实际从Binding固定的Provider引用读到同一命名证据；整合反例额外观察真实Codex原件核验器已被调用，并确认在没有实际Native/模型原件时拒绝，零模型预约、零子调用、零业务事件。它不是单纯在更早的缺项处报错。没有在最终源码上重跑全部23项；不能把20项跳过称为该文件最终整文件通过，也不把分阶段用例拼成一次26项全绿。报告在忽略目录`.cimiloop/codex-2026-10-27-default-skill-*.json`及`codex-2026-10-27-method-current-red.json`，保留原失败。

测试的 Provider 批准、模型/物理卷/登录目录和完整宿主为明确 PUBLIC 夹具；实际 Git 包、当前 SQLite、Kernel 域规则及安装组合按用例范围执行。没有真实模型或完整 Windows/AppContainer 调用，不是受控方法资格、费用结清或 S1 验收。

## 未完成条件

完整 Runtime 控制来源及默认宿主装载、首次隔离资格执行、真实 Skill/Human/Matt、安装及共享账户的兼容同卷放置/迁移、完整 Native/恢复/历史容量、真实账单、普通 Change 到 ReadyForDelivery、接入指南实际执行及最终 Matt/Superpowers 仍属于同一个未完成 S1 目标。原 Human 问题继续等真实回答，不代答。

Schema242、项目库10、Host1未变。原六个未跟踪文件保留，未读、未散列、未暂存或删除；不 push。

后续已补首次固定 Skill 的隔离启动、原请求控制、原件采集及 CLI/工作台入口，见[固定Skill隔离调用接入指南](../implementation/CimiLoop-固定Skill隔离调用接入指南-v0.1.md)。它补调用原件来源，不代替完整生产宿主、受控方法资格或真实S1验收。
