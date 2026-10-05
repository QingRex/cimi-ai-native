# CimiLoop 工具 IPC 与 OpenCode 消费契约 v0.1

2026-10-05，V1-09续批，决策D-207。D-206格式3工具宿主已通过新的Windows命名管道协议接入固定OpenCode1.18.34。公开夹具完成两次请求：接收read提议、实际读取只读public.txt、回传原调用ID关联结果，再取得最终SSE回复。没有读取实际Key、请求实际模型或启用正式Task / Agent。

## 1. 独立协议与隔离身份

旧文本`cimiloop/model-gateway/1.0.0`及其16KiB请求 / 32KiB回复约束保持。新请求是`cimiloop/model-conversation-request/1.0.0`，包含格式、请求ID、operation_key、固定model_id、策略摘要、消息、工具声明、json / sse模式及输入 / 输出边界，恰好10个字段。新回复是`cimiloop/model-conversation-reply/1.0.0`，恰好12个字段，绑定同一请求ID、原IPC字节摘要、操作和策略，并携带限定回复、积分回执、completed / denied、静态原因及始终false的正式执行字段。

新IPC请求最多65536字节，回复最多294912字节，长度前缀不计入内容限额；宿主mailbox请求最多98304字节，回传文件最多393216字节。上游HTTP、最小契约和回复缓存继续使用D-205/206各自限额。不同边界分别检查，缓存完成不保证任意格式序列化都能交付；交付失败不能撤销已有完成或重发模型请求。

原生控制器显式`--ipc-conversation`只接受受管理、read模式且deny_all的操作。新partial源码参与固定launcher构建摘要，旧已保存launcher不被覆盖。管道仍由FIRST_PIPE_INSTANCE、精确AppContainer ACL、拒绝远程客户端及不继承句柄创建；每个连接先通过内核客户端PID与原PID / 创建时间 / image验证。宿主另核对原生拥有者、nonce、root、binary、只读模式、网络策略、运行时image和原帧摘要，再访问Ledger。

Runtime只取得管道名及固定消费模块，不得到URL、Key、宿主mailbox或Ledger路径。新私有mailbox位于sandbox之外，原生夹具实测不能读取 / 写入宿主canary，也不能向mailbox目录伪造文件。策略摘要绑定固定模块与OpenCode摘要、public.txt、read、请求次数和边界；摘要用于一致性检查，不代替私有目录ACL或防有权宿主改写的认证。

## 2. SDK转换与发布顺序

固定模块实现LanguageModel v3的doGenerate / doStream。SDK function/inputSchema转成D-205 function/parameters；assistant的tool-call对象转成完整JSON参数字符串，工具结果支持text / json / error-text / error-json，并同时核对toolCallId和toolName。原调用必须恰好得到一次结果，重复ID、无关联结果、providerExecuted调用、审批消息、reasoning及多模态均拒绝。

SDK envelope中显式undefined的可选元数据可规范化；业务参数、结果及Schema仍要求普通JSON，不调用getter / toJSON，不静默删除业务undefined。仅从Schema根移除已识别的draft-07 / 2020-12 `$schema`方言注解，校验断言保持；D-205严格Schema子集仍由宿主核验，未知断言不会被转换器删去。仅支持auto选择，required / 指定工具、结构化输出和原始流块在发送前拒绝。OpenCode注入的SDK name / fetch等宿主参数不参与连接配置。

回复经过UTF-8、重复解码键、结构、请求 / 策略摘要、实际HTTP字节摘要、工具名 / 调用ID / JSON参数、用量及原积分回执绑定核验后才发布。输入摘要覆盖全部实际消息、工具及流模式；回执摘要另绑定固定public_probe预算键及Token边界，不能混用IPC摘要、HTTP摘要和回执摘要。始终false的实际费用、计费准入、思考用量核验和工具执行字段不能被改成true。

消费端等待完整长度帧和终止事件，避免后续分片中的尾随字节在工具已经发布后才被发现。Windows DisconnectNamedPipe在固定OpenCode/Bun中可报告EPIPE；完整帧的终止EPIPE / ECONNRESET按EOF处理，其他错误或不完整帧拒绝。只在连接成功前等待管道就绪，已发送后任何失败均不重试。取消销毁原Socket并移除计时器及监听器。

doStream在宿主已完整核验HTTP / SSE并原子提交回复后，输出stream-start、工具输入start / delta / end、完整tool-call及finish；文本同样在此时发布。这是有界缓冲后适配SDK事件，没有实现实时增量交付。SDK用量保留观察到的总Token，未验证的text / reasoning / cache拆分保持undefined，不能宣称思考或缓存用量为零。

SDK类型参考[官方v3 prompt定义](https://github.com/vercel/ai/blob/main/packages/provider/src/language-model/v3/language-model-v3-prompt.ts)、[tool-call定义](https://github.com/vercel/ai/blob/main/packages/provider/src/language-model/v3/language-model-v3-tool-call.ts)及[stream事件定义](https://github.com/vercel/ai/blob/main/packages/provider/src/language-model/v3/language-model-v3-stream-part.ts)。官方主分支作为结构参考；固定1.18.34二进制的实际运行结果决定本批兼容范围，不把主分支描述当作固定版本证明。

## 3. 公开只读演练的权限和预算

内部runOpenCodeConversationProbe只接受固定OpenCode1.18.34摘要，使用受信代码中固定的公开Key、本地TLS夹具和公开CA。DNS / 拨号替换及合成公网对端观测只用于演练，未验证实际Provider证书、工具资格或账单。模块、原生控制器和OpenCode都校验摘要；读取public.txt前后内容不变，原生资源释放及无网络Capability证据进入结果。title / summary / compaction辅助Agent关闭，避免额外模型轮次混入两次工具往返。

配置默认拒绝全部工具，仅允许read；宿主只接受read声明，并在交付前把提议参数限定为原操作映射目录下的public.txt。Schema验证不授权文件路径。OpenCode实际执行一次公开只读夹具，是受限探针配置的权限；模型回复中的tool_execution_authorized仍false，不能据此批准正式WorkItem工具副作用。

格式3沿用先持久预留、dispatching后发送及回复 / 回执原子完成。每次演练请求固定输入边界65536、输出最多128，按D-202公开费率观测预留46个演练积分；最多8次的账户与public_probe预算各368个。两次正常往返持有92个，不退款。该数值是合成预算约束，没有消费实际账户积分，也不是已验证的输入 / 思考Token上界。演练时钟固定在公开费率观测有效日期，实际新预留仍必须遵守真实时间与费率有效期。

原生相同ID / 字节直接读取原宿主回传文件，不产生新HTTP或积分持有；同ID不同字节拒绝。回传中的replay保留原宿主首次观测，原生重复连接另记录replay=true，两种观测不能混为一次新的Ledger重放。跨宿主完成缓存与Unknown恢复仍沿用D-206。工具提议缓存没有保存工具执行事实，不提供工具副作用去重。

这个探针由当前宿主直接管理原生控制器，使用独立的probe-owner / result格式；没有新增CLI、正式OperationResult字段、Package导出或Task绑定。正常关闭会取消 / 等待桥接、关闭Ledger与准确TLS连接，并核对原生资源释放、删除OpenCode私有state；故障不能证明子进程关闭时保留资源证据，不通过数值PID终止或把Unknown改成成功。整个探针进程突发退出、工具副作用恢复及通用CLI恢复仍需独立验收。

## 4. 验证与后续

新增45项回归：消费端37项、实际Windows原生 / OpenCode集成8项。先完成2个文件41项专项，补充发送期间调用者变更及三类非JSON数组边界后，最终相关回归22个文件457项通过，覆盖全部Runtime Adapter、v2协议及Runtime CLI；类型检查通过。独立运行固定OpenCode公开read往返也通过，两个completed及92个演练积分持有，无Unknown。

覆盖碎片帧、64KiB回复、尾随字节、重复解码键、无效UTF-8、摘要 / 回执 / 用量 / 执行字段篡改、取消、发送后不重试、SDK工具历史及不支持的内容拒绝、业务getter / sparse数组拒绝、请求快照、json / stream工具事件与关联结果、原生重复 / 冲突 / 超限 / 策略拒绝、私有目录ACL、资源释放及实际OpenCode读文件 / 最终回复。旧文本消费模块、Gateway原生源码及三项旧Runtime / 网络Schema保持。

实现和窄证据见[工具IPC与OpenCode消费验证](../research/CimiLoop-工具IPC与OpenCode消费-2026-10-05.json)。归档源码、验证日志及不含提示词 / 结果正文的证明摘要；不归档实际Key、运行SQLite、完整上游请求、思考文本或完整OpenCode原始输出。公开read工具调用及public.txt内容可以从固定测试源码复现。

下一步建立WorkItem / Run绑定的工具能力清单、路径与命令约束、调用 / 执行 / 结果身份，以及工具已执行但结果未交付时的恢复与禁止重复副作用。继续补充独立宿主退出时IPC / Runtime整体恢复和文件系统硬配额。实际套餐 / 工具资格、服务端输入与思考输出上界、受保护的唯一账户Ledger、批准预算及配额 / 账单核对仍待落实，生产工厂和正式Task / Agent准入保持关闭。
