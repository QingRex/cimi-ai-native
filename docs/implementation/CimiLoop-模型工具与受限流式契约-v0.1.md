# CimiLoop 模型工具与受限流式契约 v0.1

2026-10-05，V1-09续批，决策D-205。新增内部工具对话契约，支持function声明、工具调用提议、关联结果消息和有界SSE回复。沿用D-203固定主机 / 路径 / 模型、原TLS连接、取消和HTTP限额。本批仅使用公开测试Key与本地TLS，不读取实际Key或发送实际模型请求；没有接通OpenCode实际工具执行、D-200 IPC或正式Task / Agent。

## 1. 独立契约与旧格式

`GatewayHttpTransport.prepareConversation / sendConversation`使用独立profile=`cimiloop/gateway-conversation/1.0.0`和独立的一次性请求凭据。旧`prepare / send`继续只接受D-203文本契约，两类发送方法不能混用；复制请求、其他Transport实例及已发送请求均拒绝，没有新的发送权。

新输入严格包含`request_id, messages, tools, response_mode, input_tokens, max_output_tokens`。`response_mode`仅`json / sse`；tools允许为空，此时可接收纯文本流。模型、主机、路径、n=1、工具选择auto由宿主固定，工具流随SSE启用`tool_stream=true`。没有任意URL、代理、额外Header、模型、thinking、approved或重试覆盖。

新回复包含profile、请求 / 输入 / 原响应摘要、公开文本、工具调用提议、结束原因和观测用量。`thinking_usage_verified / actual_cost_known / billing_admission_ready / tool_execution_authorized`始终false。正文及每项调用深冻结，不保留思考文本。工具调用提议没有执行授权，仍需未来受控Runtime根据WorkItem及实际能力交集核验权限、路径与执行边界。

D-204积分格式2只缓存旧文本回复，明确拒绝新profile；原宿主协调器也不接受新输入。积分格式1 / 2、TEST账本1及领域8保持，不自动转换用户库，不新增CLI、公共package导出或协议Schema。新增传输原语本身不持有预算账本，不能声称已完成工具回复的原子持久化或宿主恢复。

## 2. 工具声明、参数与历史关联

固定请求最多64条消息、32个function声明；工具名仅ASCII字母、数字、下划线、破折号，最长64，不能重名。描述最多4096字节，每个参数Schema最多16384字节，最多256节点、8层；全部发送JSON仍最多65536字节。

本阶段接受有界JSON Schema子集：object / array / string / number / integer / boolean / null，properties、required、additionalProperties、items、enum、const、anyOf以及字符串 / 数组长度和数值上下界。根参数必须为object。保留未声明additionalProperties时的JSON Schema默认含义，不偷偷变成false。`$ref`、pattern、组合扩展、其他未支持关键字及内置联网 / retrieval / MCP工具均拒绝，后续需按OpenCode实际工具清单逐项扩展，不能把拒绝忽略成允许。

调用参数必须为完整JSON object，最长16384字节，并符合原声明的Schema。JSON读取拒绝解码后重复键、危险属性名、不合法Unicode、非有限数值、超过16层或16384节点的输入。Schema验证证明数据形状，不能证明文件路径安全、工具内容可信或执行获得授权。

每项调用ID最多128个ASCII字母 / 数字 / 下划线 / 破折号，单次回复最多32项且ID唯一，工具名必须已声明。只有`finish_reason=tool_calls`可包含调用；文本结束仅stop / length。截断工具参数或工具与结束原因矛盾均拒绝。新回复不能复用历史已完成调用ID。

历史assistant调用与后续`role=tool`结果必须逐一对应。允许并行调用结果按任意顺序回传；所有待处理调用完成前，不能插入新的user / assistant / system消息。孤立结果、重复结果、未完成调用、复用ID及未知工具拒绝。请求只能以user或已关联tool结果结束，每次模型请求使用新的全局请求ID；这与一条工具调用ID分别表达不同身份。

准备时复制并核验消息、Schema及结果，摘要绑定实际发送字节，之后修改调用者对象不影响请求。拒绝undefined、函数、稀疏数组、访问器及toJSON等JS输入，避免序列化暗中删字段或执行调用者转换。

## 3. 有界SSE，完成后交付

依据智谱[流式消息](https://docs.bigmodel.cn/cn/guide/capabilities/streaming)和[工具流式输出](https://docs.bigmodel.cn/cn/guide/capabilities/stream-tool)，新流式请求固定stream=true，工具请求另设tool_stream=true。应用需要收到完整参数后校验并回传tool结果，Provider不会代替应用执行工具。

本阶段缓冲有界上游流，在完整HTTP结束后一次性解析；没有逐字预览或参数增量执行回调。原HTTP层最多262144字节、Header最多8192字节，并在接收中立即检查字节上限及取消 / 单调时限。JSON与SSE分别严格核验Content-Type，拒绝压缩、跳转、非200、响应截断、尾部Header及重连。

SSE最多512个事件，只接受data字段和LF / CRLF事件终止；支持同事件多行data。完整事件、唯一最后`[DONE]`、最终finish_reason和最终usage都必需，HTTP EOF本身不代表模型完成。本阶段不接受注释心跳、其他SSE字段或choices为空的独立usage事件；真实Provider若采用其他合法形式，须先取得契约证据再明确扩展。

全流id / model / created / object / request_id保持一致，只有choice index=0。工具分片按index拼接arguments，允许不同调用的后续分片交错；首次出现的index连续且包含完整调用ID、类型及工具名。后续片段不能替换这些身份，完整参数仍受JSON和Schema核验。完成事件之后不能追加模型片段；缺失用量、超界用量、未知结束原因或残缺参数不返回成功。

Key检测覆盖原响应、解码后的JSON、分片拼接后的公开文本 / 思考 / 参数及参数内部JSON解码，防止跨片或转义的Key回显。直到整份回复通过前，没有内容交付调用者；只返回静态错误原因。思考仍在上游受限响应内暂存并最终丢弃，不落盘，不声称内存安全擦除。历史reasoning_content及Preserved Thinking尚未支持，不以裁剪思考冒充完整透传。

所有HTTP结局销毁原Socket、请求、响应和专用Agent，释放暂存引用，没有自动重试。新传输尚未进入持久宿主协调，调用者不能把传输成功当成账本已完成；下一批需要在独立工具缓存格式及宿主装配中落实dispatch在网络前、模糊结果保留Unknown、取消与原子提交的顺序。

## 4. 验证与下一步

Node24.15.0 + pnpm12.4.2下初验4个文件161项通过；补充跨轮次调用ID复用拒绝及真实两次本地HTTPS工具结果回传后，最终相关回归18个文件364项通过，包含新增90项工具 / SSE回归、全部Runtime Adapter、v2协议及Runtime CLI，最终类型检查通过。旧RuntimeOperationResult、RuntimeProbeResult与D-201网络Schema摘要不变。

验证覆盖严格工具Schema及历史关联、调用者修改隔离、JSON重复键 / Unicode / 深度、参数类型及长度、并行分片、CRLF与中文UTF-8逐字节发送、身份变化、结束标记 / 用量缺失、用量超界、跨片 / 转义Key回显、单连接发送、取消 / 超时、旧文本方法和缓存拒绝。工具结果测试实际发送两次本地HTTPS，分别验证两个请求ID与两个原TLS连接；不执行任何实际业务工具。

本地TLS证书为公开测试证书，DNS / 拨号和公网对端观测沿用D-203的受信测试替换；这不验证实际Provider的生产证书、真实套餐、账单或OpenCode端消费。没有实际账户Key读取、模型请求、用户数据库升级或新增Runtime启动。

验证摘要及源码归档见[模型工具与受限流式契约验证](../research/CimiLoop-模型工具与受限流式契约-2026-10-05.json)。初验和最后回归分别记录，不把此前宿主退出测试计作本批新设计的工具恢复验证。

下一步新增明确版本的工具回复持久缓存与宿主协调，再扩展IPC帧 / OpenCode消费契约，验证实际OpenCode经隔离通道收取调用提议、回传工具结果与读取完成回复。实际账户套餐 / 工具资格、服务端输入及包含思考的输出上界、唯一受保护账本、批准预算和配额 / 账单核对仍需落实，生产工厂仍在任何副作用前拒绝准入。文件系统硬配额及完整受控恢复继续是正式Task / Agent启用前的验收项。

后续D-206已实现[工具回复持久缓存与宿主协调](CimiLoop-工具回复持久缓存与宿主协调-v0.1.md)：显式新建积分格式3，最小工具Schema契约、原子回执 / 回复及实际宿主恢复通过本地验证；旧文本格式2及本文历史范围保持。工具IPC、OpenCode实际消费与业务工具执行、真实计费及正式Task / Agent仍未启用。
