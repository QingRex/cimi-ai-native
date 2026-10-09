# CimiLoop 专用模型原请求衔接 v0.1

2026-10-10 D-256：[专用模型原件共同核验](CimiLoop-专用模型原件共同核验-v0.1.md)已接原提供方请求 / 响应与预算占用的独立读取、共同采集及 Kernel / Task 结果再核验。新专用 Host 身份绑定原 Runtime 输入与独立操作键，预算缺原件保持未知；不重发、不释放或结清占用。共享应用服务供 CLI / 工作台复用，真实受批准持久账户及原账单仍未接通，正式默认 Agent 关闭。242 Schema / 用户库10保持，完整五组 S1 继续；本批验证见新研究记录，以下旧批结果保持原范围。

D-255，2026-10-10。完整五组 S1 继续；本批提供能与原 Runtime 组合使用的专用模型代码工厂，真实账户服务和默认 Agent 入口仍未安装。

## 实际可用能力

runtime-adapter 的 createDedicatedAgentRuntimeModel 返回既有 AgentRuntimeModelPort；LocalAgentRuntimeComposition.openDedicated 从 Kernel 原 Run 导出固定 Scope，供受信应用组合调用。HTTP / CLI / Workbench 的 JSON 不能安装账户服务、选择凭据、替换 Runtime 或直接发送上游请求。已有共享 start / query / cancel / collect / 原操作恢复仍走同一 Kernel。

工厂接受显式专用连接和代码安装的 DedicatedAgentAccountPort。该服务 check 须独立核对具体模型、账户套餐、Human 审批、现金及积分上限、当前完整资格 / 物理配额 / 恢复保管；reserve 对原提供方请求字节在同一持久账户库占用预算，verifyHold 核对原占用。缺任一方法或固定摘要、连接型号不符立即拒绝。公开价格观察、构造审批、余额截图或 usage 不能替代该服务。当前仓库尚无真实受批准账户服务，故本入口不会默认联网。

每一新原调用先核权，登记原请求，再占用预算；读取凭据之前、DNS之前、TLS之后实际HTTP发送前再次检查当前账户和原占用。DPAPI 按既有仓库外专用连接读取，Runtime 不拿到 Key。创建工厂及实际读取前均核对凭据物理位置：Windows 拒绝 namespace / UNC 输入，按现有祖先 realpath 固定物理路径，禁止落入仓库或原资料目录，现有凭据须为普通文件且无硬链接；不读取内容来检查位置。标准 / Coding Plan 只对应 open.bigmodel.cn 两条固定路径；复用全 DNS 公网地址、原 TTL、官方证书与 TLS 对端、同一原 socket、HTTP 头 / 字节 / 超时核验，无代理、重定向、重试或另一个拨号路径。账户服务异常不透传原错误，失败保留占用，不能自动退款。

## 原 SDK 与提供方关系

实际 SDK 的 system 字符串、user 文本部件、assistant 函数调用及 tool 结果转换为提供方消息；固定 cimi_read / cimi_replace / cimi_check 函数定义、原ID和参数按同一目录校验。不支持的 file / image / reasoning 或额外消息字段直接拒绝，不丢弃上下文再请求。

当前 SDK 模型回执只包含可见文本和工具调用。智谱思考原文保存在对应原提供方响应中，下一轮逐一匹配 SDK assistant 的文本、函数名、原 ID 和完整参数后恢复原 reasoning_content，按原顺序保留原思考文本值发送；SDK 自带未证明思考片段不能替代。配置仅由受信账户方案传入，没有默认具体型号；已公开的强制思考型号不能用 disabled。

提供方 JSON 必须有当前固定型号、原 request_id、唯一 choices、合法原工具调用与 usage；拒绝重复键、非法 UTF-8、超界用量、未知输出、length截断、重用工具ID、凭据回显及原件损坏。总 output usage 要在原上限内，但该用量核验仍不是账单或审批证明。

## 原身份、异常与恢复

外层原模型 starts / originals 请求必须已经登记并完全相同，专用工厂不能独自绕过 Host 发新请求。外层首次 model claim 登记专用 header 摘要，每个原 claim 追加只写一次 send-intent；专用 starts / originals 的预算收据、原请求字节、dispatch、原响应及映射回执对应这些独立登记。响应先在外层原 claim 固定原字节及完整映射摘要，再保存专用原件；历史重读还与已有 SDK 回执核对，不能同时替换专用响应和其摘要来冒充原答复。双宿主不能重用发送登记；专用 call / Run 两份目录缺失、半记录或回复丢失均拒绝重发。已有完整回执可历史重读；原 Task / Run 不重开。

模型成功响应不结清账户预算，不释放 Kernel 未决费用、不满足 Task。当前 collect 仍采集通用原模型请求 / 回复；专用提供方原件留在其原目录，独立账户保管、专用原件进入共同采集 / Kernel 账单核对是后续工作，不能据本批宣称已接通。242 Schema、用户数据库10、原启动账本1保持；旧模型账本不改写，两个新目录与外层可选登记仅供新调用。

## 接入与验证边界

实际接入顺序：确认具体模型、套餐、现金及积分上限；在仓库外配置现有 DPAPI 专用连接；实现并安装单一持久账户服务，验证完整配额、资格、费用上界与原账单来源；由受信应用工厂调用 openDedicated，并通过已有 Human 核权和共享 Runtime 入口。任何步骤未满足均保持不可用，不能填写一份 JSON 来冒充批准。

本批测试使用公开本机 TLS 证书、回环拨号和构造公网对端 / 账户 / 凭据，协议路径为真实 HTTPS，但无真实智谱请求或真实 Key。Windows / AppContainer / 实际SDK / Node检查 / 工作台的验证单列于研究记录，不能算真实模型、Skill、Matt、Superpowers或S1。受影响验证范围和失败保留以研究记录为准。

## 本批实际验证

最终受影响按分阶段原范围统计为 11 文件 268 项、267 通过 / 1 失败 / 0 跳过；组合阶段267通过1旧启动15秒超时，独立完整启动文件9通过1不同用例超时，均保留、原因未证明，未放宽期限。实际Windows最终完整生产组合 1 文件 3 项、2 通过 / 1 失败 / 0 跳过；首轮新增本机HTTPS组合1项通过、另2项过滤，属于更早源码阶段。最终完整原生组合失败为原Node留存摘要目录缺失，观察提交409 / EVIDENCE_MISSING；同一原Command恢复仍拒绝、事件序号25未变。后续采集发现先前通过的另一个夹具也丢失同一Node原件，现有声明保留、原因未查明；不回填、不重开原Run、不降低核验。独立新夹具仅选择专用HTTPS组合 1 通过 / 0 失败 / 2 过滤，不替代完整原生回归或证明原件留存稳定。最终源码623文件各阶段前后零漂移。类型检查和CLI帮助通过。

[分阶段研究记录](../research/CimiLoop-专用模型原请求衔接-2026-10-10.json)包含全部失败、原Native / SDK / IPC / HTTPS / 检查 / Kernel原件摘要和源代码清单。真实模型请求和真实凭据读取为0；普通工程评审修复原件缺损重复发送、Windows物理凭据路径与原响应替换缺口，不计真实Matt / Superpowers。既有Bun崩溃和历史Unknown保持原记录，当前成功不证明其原因或稳定性已解决。

参考：[实际SDK原字节账本](CimiLoop-SDK调用与IPC原字节账本-v0.1.md)、[原Native输入关闭](CimiLoop-原Native输入关闭与执行中断-v0.1.md)、[实施设计](../plans/2026-10-10-cimiloop-专用模型原请求衔接实施设计.md)、[智谱思考模式](https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode)、[官方模型调用示例](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7)。后两项仅为线协议观察，不批准示例型号或价格。
