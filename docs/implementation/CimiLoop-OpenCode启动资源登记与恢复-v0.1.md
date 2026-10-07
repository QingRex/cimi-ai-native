# CimiLoop OpenCode 启动资源登记与恢复 v0.1

日期：2026-10-08，D-226，V1-09 续批。承接 [D-225 检查宿主](CimiLoop-固定Node检查宿主与原始账本-v0.1.md)发现的旧 OpenCode 启动准备阶段资源遗留。实现启动前登记、逐阶段监督与原资源恢复；仍是可信组合器的私有演练入口，没有启用生产 Agent 或 S1 退出资格。

## 先登记再变更资源

控制器启动后先阻塞等待私有配置。可信宿主用原生身份查询取得实际 PID / 创建时间 / 镜像，持久化 `original-launcher.json` 的原身份和原二进制摘要，然后才发送原配置。原配置、完整 Scope 摘要、原 Node 拥有者及固定 OpenCode 二进制继续保持，不能由模型选择控制器或覆盖原身份。

原生控制器在创建 Profile 前保存 `agent-sandbox-resources.json`：原配置摘要、拥有者 / 控制器身份、用户 SID、Windows session ID、实际 token AuthenticationId、固定 Profile / Job 名称、变更意图和阶段。新记录不修改 Protocol 242 Schema、领域数据库格式 10、公开文件账本 / 回执 1 或四个公共控制器源文件。

准备顺序固定为 `registered → profile_intent → grants_intent → granted → mapped → process_create_intent → runtime_created → suspended`。每个检查点持久化并通知可信宿主，原拥有者仍活动且宿主明确继续后才进入下一步；帧只接受原 nonce 和当前阶段。准备输入仍是私有 stdin，实际 OpenCode 继续使用 NUL stdin。阶段确认有固定有限期限，宿主整体演练期限和输出上限保持。可信 `prepare` 钩子供组合器监督和实际故障注入，不是 SDK / 模型参数或任意脚本入口。

Profile 和 ACL 意图先于对应变更。创建前核对该 Profile 的当前用户注册映射不存在；创建失败不删除其他既有 Profile。映射仍用共享分配互斥锁，保存确切候选盘符后才创建。Job 使用原 nonce 固定的名称，拒绝已存在对象，保持原子 Job 分配、单进程、2 GiB 内存和最后句柄关闭时终止的限制。进程创建后的检查点故意先于完整 Runtime 身份读取，资源账本因此能覆盖创建 / 身份证明之间的间隙。

命名 Job 的创建、既有对象拒绝和最后句柄关闭语义依据 [CreateJobObjectW](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-createjobobjectw)；活动进程查询依据 [Job accounting](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_accounting_information)。查询只观察原 Job，不终止从恢复中发现的进程。

## 恢复只处理原资源

`recoverOpenCodeWorkspaceToolRehearsal` 固定原数据目录 / 操作目录 / Scope，严格复核原配置、启动器摘要 / 元数据、所有原身份和资源记录。它调用原字节固定的控制器，不能换执行文件、原操作、资源路径或原 Profile。活动的原拥有者、控制器或 Runtime 阻断恢复；身份未知也不推定退出。

即使 Runtime 身份尚未写入，恢复仍查询原命名 Job；活动进程不为零或查询无法证明原 Job 状态时不释放 ACL / Profile。当前没有原子创建中的非 Job Runtime，原 Job 不存在或已无活动进程、且原身份确认为退出后，才可能清理资源。恢复不从进程名或目录存在性猜测完成。

DOS device 属于原 logon 的命名空间，Local Job 属于原 Windows session。恢复核对实际用户、session 和 AuthenticationId，跨 logon / session 保持 Unknown，不能把另一命名空间内的“未找到”当成已清理。依据见 [DOS device 命名空间](https://learn.microsoft.com/en-us/windows/win32/fileio/defining-an-ms-dos-device-name)及 [TOKEN_STATISTICS](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-token_statistics)；跨登录 / 系统重启的正式资源监督仍待完整 Runtime 宿主接入。

清理前核对盘符仍指向原沙箱，目标属于其他操作时拒绝。只移除原 SID 的确切五项 ACL 和原 Profile，所有 API 成功后才保存 `resources_disposed: true`。恢复互斥锁支持两宿主争用及重复调用；已确认释放的旧盘符后来可以被别的操作使用，重复恢复不再访问它。恢复不会重跑 OpenCode、调用模型 / 文件工具或发布原 Run 完成事实；结果固定 `completion_proven: false`。

## 实际验证与边界

实际 Windows 进程故障注入覆盖登记、Profile 后、ACL 后、映射后、Job / 创建意图和真实悬挂 Runtime 创建后六个阶段。注入使用原控制器的持有 OS 句柄，核对创建时间 / 镜像后只结束自己的控制器，随后原宿主真实退出。测试同时核对实际注册映射、五处 ACL、DOS 目标和 Job 活动状态；原生资源恢复不是构造完成回执。

还覆盖当前拥有者活动时拒绝、准备取消后正常清理 / 原始诊断、双宿主恢复争用及重复、真实其他操作映射保留、Scope / 启动器损坏、logon 依据不符和缺失原登记。Git / SQLite / 原生 Run 保持原状态，不把资源回收转成 Task、预算结清或 Gate 批准。已有实际 OpenCode cimi_read / cimi_replace 场景继续验证正常启动和工具授权。

最终源码、受影响回归及审计见 [D-226 验证记录](../research/CimiLoop-OpenCode启动资源恢复-2026-10-08.json)。正向 Agent 资格和工具演练模型回复仍构造；本批凭据读取 / 外部模型请求为 0，没有升级用户库。

D-225 保存的历史失败没有原控制器登记和资源账本，不能事后补造原进程证明。该目录及此前确认的映射 / ACL / Profile 继续保留，恢复返回缺少原登记的 Unknown。本批修复新启动链，不把旧失败根因、历史资源或跨 logon 恢复宣称完成。

接续：接入 `cimi_check`、正式检查目录 / 准入、完整 SDK / 工具 / 账户保管链和正式 Runtime 生命周期；完善整体准备 / 嵌套调用期限、物理硬配额、容量 / 历史保留与全恢复。之后完成 Plan / Task 前 Human / Matt 澄清、真实技能方法、独立完整评审及 Superpowers 新鲜验证、工作台正式 Agent 操作和真实普通 Change 到 ReadyForDelivery 的 S1 验收。用户已确认智谱 Provider，具体型号 / 套餐及费用上限仍需明确；目标和 S1 继续保持未完成。

2026-10-08 D-227续批：[原SDK固定检查消费](CimiLoop-OpenCode固定检查工具消费-v0.1.md)已接Scope / Node / 策略固定目录和实际cimi_check / 原进程IPC。正式Context准入 / 实现后新源码验证目录、完整Runtime与保管链 / 费用 / 配额 / 恢复、真实方法 / 工作台及S1仍待完成。
