# CimiLoop 固定连接 HTTPS 传输 v0.1

2026-10-05，V1-09续批，决策D-203。实现固定智谱Coding Plan端点的宿主HTTPS传输原语：复用D-201已核验的TLS连接、一次交接、不可复制的请求快照，以及请求时限、取消、响应边界和凭据回显拦截。实际本地TLS / HTTP测试已通过；同批重验公网DNS / TLS，仅握手，HTTP、模型请求和真实Key读取均0。没有以积分演练批准真实计费、启用正式Task / Agent或修改用户数据库。

## 1. 原连接的一次交接

`GatewayNetworkBoundary.connect`现在返回冻结连接对象及冻结观测，并以实例私有WeakMap保存原地址固定、单调时限、原Socket和已写字节数。既有公网观测格式、路由及策略摘要保持。

宿主HTTP层通过`consumeHttpConnection`领取原Socket。同一对象只能领取一次；JSON恢复、对象复制和另一Boundary均拒绝。交接前重新核验地址固定未到期、Socket仍可用、TLS授权、原对端、证书主机名及摘要、协议、没有提前写入或缓冲入站数据。已经变化的原连接会被销毁，不能重试交接；伪造对象不销毁其他所有者的连接。

HTTP层为一次操作建立专用Agent，其`createConnection`只返回这个原Socket。没有默认拨号分支、后续DNS、代理环境继承、连接池、TLS会话缓存、重定向或自动重试；若要求第二次连接则拒绝。端点固定`open.bigmodel.cn:443/api/coding/paas/v4/chat/completions`，模型固定`glm-5.3`。

依据固定版本[Node.js HTTP Agent接口](https://nodejs.org/download/release/v24.15.0/docs/api/http.html#agentcreateconnectionoptions-callback)复用Socket，并用[HTTPS请求接口](https://nodejs.org/download/release/v24.15.0/docs/api/https.html#httpsrequestoptions-callback)处理HTTP。是否实际只发生一次握手另由本地服务观测和测试计数核验。

## 2. 请求快照与文本契约

`GatewayHttpTransport.prepare`只接受请求UUID、1–32条纯文本system / user / assistant消息、条件输入Token边界及输出上限。拒绝工具、多模态、额外字段、不完整Unicode以及调用方的URL、Header、模型、代理、stream、thinking和approved覆盖。完整JSON请求含固定模型、请求ID、max_tokens、stream=false和n=1，最大65536字节。

准备时立即复制消息并序列化为私有字节；公开的冻结凭据仅含请求ID、原始发送字节摘要和Token边界。更改调用者消息不改变发送内容。发送只接受本Transport登记且未用过的凭据；复制或另一个实例不能发送。同一请求ID在全账户中的唯一性由上层持久账本负责，传输原语本身不建立全账户索引。

API Key只能来自未来获准的宿主调用代码，不能进入CLI或Runtime输入；严格拒绝Header注入。若Key出现在消息请求字节中，发送前拒绝。代码没有加载、解密或持久保存真实Key。结束后释放本原语对请求缓存及响应分块的引用；不宣称JavaScript / Node内部字符串或缓冲已被安全擦除。

这是初始纯文本契约。OpenCode的工具调用、工具结果、多轮思考及流式回复尚未经过这层；不能仅凭文本测试通过声称已接通完整编码会话。未来扩展必须独立限定输入、输出、预算和失败语义。

## 3. 完整响应、取消与失败

一个单调时限覆盖HTTP操作，允许25–30000ms；成功回调前再次检查时限及取消。取消、超时、失败及成功均关闭原Socket、请求、响应和专用Agent，没有第二次发送。

只接受200与单一application/json媒体类型，响应Header上限8192字节，响应字节上限262144。拒绝重定向、升级、信息响应、压缩、重复媒体类型、歧义长度、非chunked传输编码及Trailer。分块响应同样逐块限长。HTTP消息必须完整，声明长度与实际字节一致；截断不能进入完成状态。

正文使用严格UTF-8及限定字段契约。核验固定模型、单个assistant回复、stop或length终止原因、请求ID（若返回）、整数用量及总量相等。允许有日期 / ID元数据、思考文本和输入缓存Token明细；思考文本只参与边界与回显检查，不返回或保存，缓存明细不减少预留。不认识的用量扩展及工具回复保持失败。

在JSON解析前检查原始Key字节，解析后再检查完整解码数据，因此Unicode转义回显也被拒绝。Header、错误正文、思考内容、原始JSON及底层错误字符串不进入返回结果或错误信息。错误只返回固定原因。成功返回受限文本、响应摘要、观测用量与终止原因；length只是截断回复，不能当作任务成功或Gate通过。

观测输入 / 输出用量超过准备的条件边界时拒绝。`thinking_usage_verified`、`actual_cost_known`及`billing_admission_ready`始终false；max_tokens、reasoning_content和汇总用量不能证明GLM-5.3服务端思考计费的硬上界。当前[智谱对话补全文档](https://docs.bigmodel.cn/api-reference/模型-api/对话补全)用于限定字段；未验证实际套餐返回完全符合本契约，也未完成账单核对。

## 4. 持久状态与真实准入

传输类是内部宿主原语，不从package index导出，也没有新增CLI、JSON、连接文件或Runtime选择入口。它不读取Key、不创建账本、不批准Provider，也不自行把演练额度转为网络授权。未来受信宿主协调器必须先验证实际账户、计费与批准预算，提交绑定原发送字节及Token上界的durable dispatch，再解密Key并调用这层；失败要保留Unknown与全部预留，观测超界还须封锁账户。

本批测试夹具用公开假Key和D-202演练账本串联上述持久状态顺序：本地服务收到请求时已经是dispatching；完整回复完成回执，截断及超时转Unknown，三类结果都保留整份预留。历史完成只读回执；Unknown同键拒绝重发。这个协调器只在测试中存在，没有把它装入生产网关，也没有完成受限响应缓存和真实超界封锁协调。

`requireDedicatedGatewayBilling`继续在真实Key解密、实际预算库和DNS前拒绝。领域数据库格式8、旧TEST账本格式1及积分演练格式1保持，没有Schema、CLI权限、Provider评价或正式Task / Agent准入的升级。

## 5. 验证与后续

初验专项4个文件118项通过。最终相关回归覆盖全部Runtime Adapter测试、v2协议兼容及Runtime CLI，15个文件240项通过；最终类型检查通过。既有D-202全量40个文件436项结果保留为上一批记录，本批没有把专项结果报作新全量结果。旧RuntimeOperationResult、RuntimeProbeResult及D-201网络Schema字节摘要保持。

新增回归覆盖一次连接所有权、交接到期 / 连接变化 / 提前写入、请求复制与调用者修改、固定Header / 路径、非200 / 重定向 / 重复媒体类型 / 升级 / 信息响应、截断 / Header及正文超限 / 压缩 / Trailer / 非法UTF-8、模型 / 请求ID / 回复契约与用量错误、思考及转义Key回显、绝对时限 / 取消、未受信证书无HTTP，以及持久完成 / Unknown保留与真实计费门禁。

本地服务使用仓库内公开测试私钥及自签证书，SAN为固定生产主机名。测试通过受信代码替换DNS / 拨号为回环，并将对端观测替换成合成公网地址；真实TLS、证书主机名校验、HTTP、响应格式和关闭仍实际执行。生产代码没有这些证书或回环覆盖。本地结果不构成实际公网认证请求或生产证书信任证明。

同批已有公网探针实际通过DNS及TLS1.3核验并关闭连接，HTTP、真实Key读取和模型调用0，计费准入false。研究摘要及内容寻址源码 / 观测归档见[固定连接HTTPS传输验证](../research/CimiLoop-固定连接HTTPS传输-2026-10-05.json)。所有测试使用固定Node24.15.0 / pnpm12.4.2；未依靠当前费率授权模型调用。

下一步明确专用账户的套餐版本和自定义网关工具资格，落实可执行的服务端输入 / 思考输出约束、真实账户唯一受保护账本、配额窗口 / 账单核对及Task现金 / 积分关系。然后实现获准的宿主协调器、受限响应缓存，以及OpenCode所需工具 / 流式契约，再与D-200 IPC连接。文件系统硬配额和完整受控恢复仍须通过后才能开放正式Task / Agent执行。
