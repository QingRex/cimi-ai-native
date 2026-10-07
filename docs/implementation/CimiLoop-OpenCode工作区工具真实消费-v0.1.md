# CimiLoop OpenCode 工作区工具真实消费 v0.1

起始日期：2026-10-07；最终验证：2026-10-08，D-224，V1-09 续批。承接 [D-223 原进程 IPC](CimiLoop-Agent工作区原进程IPC-v0.1.md)。本批连接实际 OpenCode 1.18.34 / Windows AppContainer 的自定义文件工具；模型回复及正式 Agent 资格仍使用构造测试输入，没有启用生产 Task 执行。

## 固定版本的接入方式

锁定版的 [ToolRegistry 源码](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/tool/registry.ts)支持配置目录下的 JavaScript 工具及普通 JSON Schema 参数，执行时把原 `toolCtx` 传给工具，包括实际 `callID`。采用两个不依赖外部 npm 包的固定工具 `cimi_read` / `cimi_replace`，其唯一效果出口是 D-223 文件客户端。其他工具均禁止；没有 shell、任意插件、可选模型 URL 或凭据入口。

工具参数只包含路径、原内容 SHA-256 和可选完整 UTF-8 替换。工具调用 ID 来自原 SDK 的 session / message / call 身份组合摘要，模型不能提供；缺少实际 callID 时拒绝，不能用随机 ID 补齐。参数及原取消信号在等待 SDK 权限前复制，等待期间修改对象不能替换已检查输入。宿主继续安装并核对原 Run / Context / 执行者 / Binding，重放和实际效果都经过原授权与文件账本；输出仅是工具投影，不是 Run 完成、费用或评价事实。

`--pure` 的插件限制保持，未把插件声明当作加载成功。配置目录仍有依赖等待，见锁定版 [Config](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/config/config.ts)及 [Npm](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/core/src/npm.ts)。本批将全局配置和工具配置同时置于受保护目录，明确离线依赖策略，避免启动等待在线安装；没有安装上游插件或伪造已安装依赖。

## 原进程先安装、后放行

独立 `AgentWorkspaceSandbox` 入口复用固定 Windows 隔离原语；公共 `AppContainer.Main` 参数与持久格式不变，三个公共 Transport 源文件不变。本批另修正公共进程退出观测的次序，新编译控制器的源码与二进制摘要随之变化；不替换历史操作固定的二进制或重写其记录。启动时建立无网络 Capability、单进程及内存限制的 Job，原子创建并暂停 Runtime。原 Node 宿主身份由 OS 查询核对，Runtime PID / 创建时间 / 映像及 AppContainer SID 由实际原进程取得；固定文件 IPC 的 SID 还由独立控制器再次读取原 token，双方必须一致。

宿主在启动前固定随机管道 nonce 和 Scope 摘要。暂停期间由可信组合器安装 D-223 原通道，核对原监督者、Runtime、SID、Scope 和实际管道后，才通过私有 stdin 发送一次原 nonce 的放行消息。Runtime stdin 是独立 NUL 句柄，无法读取监督者控制输入。原通道安装失败不会恢复 Runtime 主线程；EOF、原拥有者退出、期限或异常会终止拥有的 Job。

Runtime 只读访问固定工具 / Provider 模块及临时空工作区，不能直接访问实际 Git 仓库。Bun 所需目录属性权限不授予源码或目录内容写入。配置、工具模块及 Runtime 二进制在结束后核对原字节；原启动及清理证明位于沙箱外，实际 Runtime 不能写入。正常退出先核对原进程结束，再释放原 ACL、映射和 Profile。

这是独立的有限演练组合器 `runOpenCodeWorkspaceToolRehearsal`，只接受固定构造 Provider；没有生产 CLI / 工作台执行入口，不签发正式宿主准入或技能资格。新的私有启动 / 放行 / 演练格式均为 1.0.0，不是 Protocol 或 Native 数据库格式升级。

## 实际验证及限制

验证包括实际 SDK 工具调用、真实文件读取 / 替换、原效果账本、当前撤销 / 路径权限、受保护目录写入及子进程反证；不同实际 AppContainer SID 被 OS 拒绝访问原管道。通道安装失败保留 Runtime 暂停并清理原资源。SDK 的错误或最终回复不推进 Native Run / Task / 预算，普通 Run 仍为 Reserved。

初轮启动超时保留为失败；全局依赖等待修复后实际读写接通。子进程反证还修复了 Bun 对 `spawnSync` 失败返回 `undefined` 状态、而非 Node 的 `null` 的兼容判断；接受的是实际 error、无退出状态的启动失败，不将普通非零退出当作禁止创建成功。

首次完整受影响回归有 11 个原进程退出 / 恢复失败，记录保留。实际诊断发现，已退出但被保留的进程对象可以返回原创建时间、句柄也已结束，映像查询却返回 Windows 错误 31。原判断先查询映像，因而误判 Unknown。现在先核对原创建时间，再观测同一进程句柄；已结束才认定原进程 absent，仍活动的进程继续核对映像，查询失败或无法观测保持 Unknown。新增测试实际保留一个已退出 Node 的内核句柄，并验证活动、活动映像不匹配、退出映像不可查三种状态；未延长超时或降低恢复证明要求。

最终受影响回归覆盖 17 个测试文件、154 项测试，全部通过；构建与类型检查通过。此次不是全仓测试或 S1 验收。源码固定摘要及兼容核对见 [D-224 验证记录](../research/CimiLoop-OpenCode工作区工具真实消费-2026-10-07.json)。真实凭据读取与外部模型请求均为 0，没有升级用户库。

## 剩余五组任务

1. Runtime：固定检查命令、正式 SDK / 工具 / 账户保管链、实际模型 / 套餐及服务端输入 / 思考 / 输出限制、批准费用预算及账单核对、物理配额和完整异常恢复。当前真实工具消费是演练，尚未通过生产准入。
2. V1-21：真实方法宿主、固定输入输出投影，以及创建 Plan / Task 前的 Human / Matt 分轮澄清。
3. V1-22：独立完整 diff / issue / harness 评审与 Superpowers 新鲜验证，实际行为对照和资格结论。
4. V1-10：正式 Agent 的工作台执行、状态、停止及原操作恢复。
5. V1-11：真实普通 Change 的 AI 实施、自检、独立评价、中断接续至 ReadyForDelivery，及完整 S1 验收。

以上仍是 [S1 实施计划](CimiLoop-V1可执行设计与实施计划-v0.1.md)的必做工作；本批不标记 V1-09、S1 或持续目标完成，OpenSpec 仍可选。
