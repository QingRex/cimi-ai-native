# CimiLoop 原 Task 结构化执行产物与 Kernel 观测 v0.1

2026-10-09，D-247。完整五组 S1 目标继续实施；正式 Agent 默认入口仍关闭。

## 已接入的执行路径

共享 Runtime 组合冻结 TaskPacket 2：绑定原 Run / operation_key / Context 摘要、TaskDefinition 版本、全部输出要求和固定检查。最后模型回复须是完整的 task-execution-result JSON，逐项覆盖 output_index，引用实际 cimi 工具输出里的原 SDK call_id。模型不能填写成功状态、账户资格或费用。旧 Packet 1 原件保持可查询和 Unknown，不补写或重跑。

共享原观察服务不再只能保存进程退出或原始文本。它调用同一结果核验器，将通过核验的执行产物保存为不可变内容引用 execution_result_ref，再形成原请求的 RunObservation。CLI / 工作台仍经共享应用服务和 Kernel；同 Command ID 重放同一原回执，不重复观测、重开 Run 或结清费用。读取原观测时重核结果，不能只信历史采集副本。

核验实际执行以下对应：冻结领域对象和输出要求；原 Native 配置、自然零退出、完整处置及原取消状态；独立 Native 文件与固定检查账本；SDK 会话、消息、工具身份、入参和输出投影；原模型启动 spine / 请求 / 回复字节；新鲜 model_step IPC；模型回复与 SDK 实际步骤 / 终答。每个模型步必须先于该步工具效果，工具效果先于下一模型步，只有最后一步可 stop。所有固定检查必须在全部修改之后通过，产物不得引用被后续修改覆盖的旧文件读取 / 写入；Windows 大小写别名按保守身份比较。

模型、IPC 原账本在组装后再次重读，拒绝混合读取；模型原件缺失、采集副本被替换、额外 / 重复 / 未决步骤、倒置时序或 SDK 与模型终答不一致时不能形成产物证明。该路径只读原件，不发送模型请求、不补建原账本或重启原 Run。

## 证明边界

执行产物证明的是原运行的输出与工具效果对应，不证明自然语言需求已满足。当前字段明确为 native_effect_reverified:true、model_account_custody_proven:false、costs_reconciled:false、task_acceptance_proven:false、current_workspace_applicability_proven:false。即便固定检查通过，也不能代替独立 Task 验收、当前源码的新鲜方法验证或正式交付。

构造资格和构造模型回复继续只用于程序契约与实际 Windows 路径测试，不成为真实模型、真实 Skill、Matt / Superpowers 或 S1 证据。没有原账户 / 套餐 / 单价 / 现金积分预算与账单证据时，报告仍为 Unknown，Kernel 保留费用冻结；不能据 token usage 报零费用或宣称 RunSucceeded。

新契约是显式私有 Packet 2，旧 Packet 1 仍按旧语义读取。原观测私有 proof 1 接受可选的不可变 execution_result_ref，同时兼容旧精确字段集。242 Schema、用户数据库格式 10、原启动账本格式 1 和锁文件保持；没有擅自迁移用户库。

## 验证与剩余条件

最终当前源码 607 文件前后零漂移。受影响契约 5 文件 46 项通过，包括 7 项结构化产物契约；最新实际 Windows / AppContainer / SDK 2 文件 2 项通过、0 跳过。读取 / 检查与读取 / 修改后检查两条路径分别有 3 / 4 份构造模型回复、2 / 3 项实际 Native 独立效果核验，以及一份共享工作台原 Unknown 观测和不可变执行产物证明；同原请求再次提交不增加 Kernel 观测，费用继续冻结。类型检查、CLI 帮助和 26 文档 UTF-8 / 链接 / 围栏检查通过；不是全仓库或 S1 验收。

首轮受影响契约 46 项中 42 通过、4 项测试外层 15 秒超时；复轮 45 通过、1 项超时，记录均保留。实际 Windows 组合 6 文件 12 项为 11 通过、1 次连续权限助手拒绝、0 跳过，其中控制 4 文件 10 项为 9 通过、1 失败；该控制文件在新独立自有夹具中串行隔离复验 2 项通过。没有重开任何原 Run，也未放宽生产 Task、控制器或时钟期限，最终串行契约仍使用原测试外层期限。该次助手底层退出码未捕获，原因未证明，不能套用 D-246 的历史 0xC0000005，也不能以隔离通过宣布 Native 启动稳定。

原始分阶段结果和实际夹具摘要见[研究记录](../research/CimiLoop-原Task结构化执行产物与Kernel观测-2026-10-09.json)。独立工程评审指出路径大小写、只信模型副本和缺少因果顺序三项问题，均已修复并补反例；普通工程评审不计正式 Matt / Superpowers 方法执行。

后续继续完整正式模型 / 账户与账单组合、原二进制保留 / 历史容量和异常恢复；真实 Skill、Plan / Task 前 Human / Matt、独立完整方法评审 / 新鲜验证、工作台正式执行及真实普通 Change 到 ReadyForDelivery 不缩减。仅智谱提供方已确认，具体模型、套餐与现金 / 积分上限未批准，本批不付费、不读取真实凭据。没有旧 Unknown 批量清理或 push；只有五组全部完成且真实证据齐备才完成 S1 和持续目标。
