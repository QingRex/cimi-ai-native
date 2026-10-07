# CimiLoop Agent 工作区原进程 IPC v0.1

日期：2026-10-07。D-223 延续 [Agent 文件宿主与原始恢复](CimiLoop-Agent工作区工具宿主与原始恢复-v0.1.md)，接通独立 Windows 原进程文件工具通道。实际文件效果、当前授权和回执仍由同一原工具账本负责；未默认启用生产 Agent / OpenCode，也不赋予模型、计费或方法资格。

## 固定原 Run 和原进程

可信 Agent 组合器调用 `LocalAgentWorkspaceToolService.openIpc(supervisor, originalSupervisor, originalPeer)`。服务先重新读取并核对原 Native Agent Run / Context / Caller，再安装一个不可替换的原通道。监督者由宿主拥有的 ChildProcess 提供，监督者及实际 Runtime 的 PID / 创建时间 / 映像须来自启动时保护的原进程记录，不能由 Runtime 工具帧提供。原 Scope 与进程记录在异步构建 / 启动前复制，调用方随后改变对象不能替换原固定身份。两者可以是不同进程，适用于原生监督者持有 Runtime 的组合；本批实际正向场景使用普通 Node 进程，尚未验证生产 OpenCode / AppContainer 组合。

独立 `AgentWorkspaceTransport.exe` 经源码摘要构建和二进制摘要核对。它与旧公开探针控制器分开，没有授予 Runtime 工作区效果代理、账本、模型凭据或任意命令。原生通道先对照原身份并持有原宿主、原监督者和原 Runtime 的进程句柄；重新使用的 PID 不会成为该句柄代表的原进程。监督者的 ChildProcess 退出和原生句柄观测到任一原拥有者退出都会关闭通道及所属文件宿主。

管道只允许当前用户、SYSTEM 和从原 Runtime Token 实际读取的 AppContainer SID；没有 Runtime 选择 SID 的字段。使用 FIRST_PIPE_INSTANCE、拒绝远端客户端及不可继承句柄，连接后先核对管道的实际客户端 PID，再检查持有的原进程是否活动，之后才能读取帧。Windows API 依据见 [客户端 PID](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid)、[管道标志](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createnamedpipea)与 [Token 信息类型](https://learn.microsoft.com/windows/win32/api/winnt/ne-winnt-token_information_class)。

SID 分支已实现，但本批 IPC 正向场景的实际 SID 为 null；旧公开 IPC 的沙箱回归不能替它证明生产原 Agent 通道。资格核验器仍须验证实际沙箱、唯一原操作、二进制 / 模块 / SDK、工具与账户保管链。通道本身不签发此类资格。

## 有限工具帧与原效果账本

新增独立请求 / 回复格式 `cimiloop/agent-workspace-tool-request/1.0.0` 和 `cimiloop/agent-workspace-tool-reply/1.0.0`，不是 Protocol 或旧探针格式的隐式升级。请求只含固定 Scope 摘要、稳定原 SDK call_id、read_file / replace_file、路径、原内容摘要及可选有限替换内容。Project、Run、执行者、operation_key、Context、Runtime / Skill Binding 和宿主准入由原服务安装，Runtime 不能覆盖。额外字段、不同 Scope、可执行对象、重复解码键、无效 UTF-8、超限帧及受保护路径均不获得效果。

原生进程通过仅由宿主持有的标准输入 / 输出转发原字节、摘要及固定原进程身份，不使用 Runtime 可写的文件邮箱。宿主再次核验字节与身份，从原 Scope 构造 `WorkspaceToolInvocation`，调用 D-222 文件宿主。当前授权在原预约、准备、dispatch 后执行前及回执重放时继续核对，缺少可信实时证明或已撤销时拒绝。原生转发及回复前也核对原进程活动。

请求 / 回复各至多 114688 字节，文件内容保持原 16384 字节上界；标准输入 / 输出行有限，单连接最多 20 秒，原通道最多 128 次连接。通道按顺序处理，不持有第二个完成缓存，不产生新的领域事件、预算结清或 Run 结果。Scope 摘要和原输入 / 授权依据 / 原文件代理证明分别由原服务和原账本固定。

固定客户端只消费原文件回执；核对请求与 Scope 摘要、原 call_id、回执 / 原生格式、输入摘要一致性和实际文件内容摘要。它不会在响应丢失后自动重试或生成新的 call_id。客户端投影不是 AgentRunObservation、模型账单、Skill 资格或 Gate 结论；后续生产宿主仍须独立读取原账本和 SDK 原记录。

## 退出、回复丢失和恢复

原进程退出或通道关闭先停止所属文件宿主并等待其原操作退出。准备后、尚未 dispatch 的调用保留 not_started；持久 dispatch 后无完成证明的调用继续 Unknown，不能因工作区看起来未改动而成功 / 取消结清。原 D-220 / D-222 暂存恢复边界保持。

效果和回执已持久提交后，客户端连接丢失不会清除原事实。通道 I/O 失败可以终止原通道；可信宿主显式重新读取原 Run 和原进程记录，打开新的宿主 / 通道，并使用同一原 call_id 和输入请求重放。原账本重新核对当前授权，只返回原回执，不重发文件修改。改变同一 call_id 的内容继续冲突；撤销后的重放继续拒绝。

## 验证与后续

固定源码摘要、最终构建和受影响回归见 [D-223 验证记录](../research/CimiLoop-Agent工作区原进程IPC-2026-10-07.json)。9 项实际 Windows / 临时 Git / SQLite 场景覆盖原进程读写及重放、其他真实进程与恶意帧拒绝、当前撤销、创建时间替换、异步启动前后的原对象变更、分别固定监督者和 Runtime、已完成效果的回复丢失与显式原回执重放，以及准备 / dispatch 两处原 Runtime 退出后的 not_started / Unknown。另有 10 项契约 / 客户端测试，其中回执正向数据明确为构造输入。

前期失败及修复保留在验证记录中：C# 旧编译器明确赋值；严格 JSON 的空原型对象按固定字段比较身份；本地包组合验证前重新构建；错误 Scope 的回复仍固定原 Scope，客户端应拒绝；Windows EPIPE 的原始攻击测试端按完整帧收取回复。首轮 112 项受影响回归中 111 项通过，旧公开模块回收测试的固定 200 毫秒等待不足，已改为有限时间内重新核对原拥有者 / 资源证明；生产恢复条件保持。最终验收不使用定向运行中跳过的项替代完整受影响回归。

初轮构建失败留下的两个自己创建的测试临时目录，递归清理被自动审批拒绝（blocked by policy），已保留并记录；没有改用其他机制绕过。它们不在仓库提交中，不代表已完成生产完整资源清理。

最终构建及类型检查通过，固定 10 个源码 / 测试文件下的 12 个受影响测试文件、113 项全部通过，没有跳过；不声明整仓一次通过。242 个 Protocol Schema、原生数据库格式 10、原工具账本 / 回执 1.0.0 及 Human CLI / 工作台入口保持。未升级用户库，真实凭据读取与外部模型请求均为 0。

下一步将实际 OpenCode 的固定工具注册、受保护原 SDK 调用和原进程监督记录接入本通道，并验证实际 AppContainer 的正向 / 跨容器边界；实现固定检查命令宿主。随后继续生产 Runtime / Task 准入、真实模型 / 套餐及费用、物理配额与完整恢复、Plan / Task 前 Human / Matt 澄清、真实方法行为 / harness 与工作台正式执行 / 接续，以及普通真实 Change 到 ReadyForDelivery 的 S1 验收。

2026-10-07 D-224 已接通实际 OpenCode / AppContainer 的固定文件工具消费，见[续批实现与边界](CimiLoop-OpenCode工作区工具真实消费-v0.1.md)。本页普通 Node 正向验证保留为历史，生产 SDK / 工具 / 账户保管链、固定检查及完整 S1 仍待完成。
