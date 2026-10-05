# CimiLoop Runtime IPC 传输 v0.1

2026-10-04，V1-09续批，决策D-198。固定OpenCode 1.18.34已经在无网络Capability的Windows AppContainer内，通过命名管道收到宿主生成的合成响应。该结果完成网关传输可行性验证；HTTPS转发、费用预留 / 计费、正式Task绑定和Agent Run仍未实现。本批外部模型请求及实际凭据读取为0，协议2.0.0、数据库格式8保持，没有升级用户库。

## 1. 已实现路径

```mermaid
flowchart LR
    O[OpenCode AppContainer\n无网络Capability] --> M[固定内容摘要的本地Provider模块]
    M --> P[Windows命名管道\n仅当前AppContainer SID]
    P --> I[宿主核对真实PID\n创建时间与程序路径]
    I --> V[严格请求校验\n帧限额与请求ID去重]
    V --> S[合成响应 CIMILOOP_IPC_OK]
```

OpenCode固定版本支持`file://` Provider模块与AI SDK LanguageModelV3接口。本批模块仅实现合成`probe`模型，通过`node:net`发送长度前缀帧；没有HTTP客户端、任意URL参数、外部模型或凭据。Provider配置与模块在该操作的输入摘要中固定，启动前只接受内置模块的实际路径和SHA256。监督进程再次核对复制内容，结束后核对模块内容未变；历史操作查询 / 恢复按原快照，不要求其模块摘要等于新版源码，同键不重启。

管道形如`\\.\pipe\CimiLoop.<nonce>`，由可信原生控制端在子进程Resume之前创建，使用FIRST_PIPE_INSTANCE且拒绝远程客户端。DACL仅允许SYSTEM、当前宿主用户及该操作准确AppContainer SID，没有授予ALL APPLICATION PACKAGES或全局Loopback豁免。宿主用户的另一个进程即使连接成功，也会在读取请求前因进程身份不符被拒绝。请求中的操作键和模型名不能替代授权。

每次连接经GetNamedPipeClientProcessId读取内核报告的客户端PID，并核对原Runtime的PID、创建时间和完整程序路径仍为活跃身份。Job仍限制单个活跃Runtime进程；模块加载不会给Runtime直接出站能力，也不放宽仓库、人类凭据或治理入口的ACL。

## 2. 帧、文件权限与生命周期

| 边界 | 当前实现 |
|---|---|
| 请求大小 | 4字节小端长度，正文1–262144字节；宿主在分配正文前检查长度，严格UTF-8 / 有界JSON解析 |
| 请求内容 | 仅format、request_id、operation_key、model_id、kind、payload六个字段；固定协议标记 / 操作键 / probe模型，kind只允许stream或generate |
| 请求去重 | 管道生命周期内最多8个唯一请求，最多32条尝试记录；相同ID且字节摘要相同复用合成回复，不增加接受数；相同ID但摘要改变拒绝 |
| 客户端等待 | 10秒内可等待尚未连接的管道实例；发送请求后出现中断直接失败，不自动重新提交已发送请求；AbortSignal停止连接和重试 |
| 响应验证 | 有界缓冲；核对准确字段、请求ID、请求字节摘要、合成标记及固定文本；不将任意回复当作成功 |
| 响应排空 | 宿主等待客户端读取回复后再断开，避免Windows Disconnect丢弃尚未读取的数据 |
| 模块权限 | 内容可读 / 执行；允许WriteAttributes以兼容内嵌Bun导入，拒绝源文件内容写入及目录新增。实际写入canary与前后内容摘要核对通过 |
| 取消与正常结束 | 终止Job，取消管道待处理I/O并关闭句柄 / 工作线程，移除该操作准确ACL、映射和Profile |
| 原生控制端崩溃 | 命名管道句柄随进程结束关闭，Job关闭终止Runtime；恢复核对原进程身份并清理该nonce资源，不重新创建管道或改写原结束证明 |

Bun在只读内容导入时实际要求文件属性写权限；普通读取可成功，但仅ReadAndExecute的动态导入返回EPERM。增加WriteAttributes后，真实二进制导入通过；内容写入和目录新增仍被操作系统拒绝。该兼容选择没有授予Modify或WriteData。Bun转译缓存关闭，崩溃上报关闭，运行状态仍在专用隔离目录内。

当前请求去重是进程内传输验证，尚未实现外部模型请求的持久幂等或费用事务。未来涉及模型副作用时，必须在请求发出前持久预留和登记；不能把这里的内存表当作崩溃后的防重复付费机制。

宿主在沙箱外记录`ipc-transport-proof.json`，只保存请求摘要 / 字节数及内核身份验证结果，不保存payload正文。严格RuntimeIpcTransportObservation Schema核对接受数量、首次请求 / 重放关系及PID；query交叉核对操作键、原生PID、管道阶段和失败字段。证明缺失、篡改或内容不一致保持Unknown。合成Provider完成还须实际OpenCode会话结束事件和固定响应文本一致。

## 3. CLI与机器结果

```powershell
node apps/cli/dist/bin.js --json runtime transport-probe `
  --binary '<固定OpenCode原生文件>' --output-dir '<合成IPC探针目录>'
```

可选`--max-elapsed-ms`为1000–180000毫秒，默认20000。命令不接受连接文件、Key、主机或联网策略覆盖，始终无网络Capability。它固定二进制副本、验证真实版本，再创建新的只读合成操作；结果及原始字节保存于指定目录，默认`.cimiloop/transport-probe/`。同一目录可以保留多次操作，但每次CLI验证生成新操作键。

顶层RuntimeTransportProbeResult的scope固定为`synthetic_transport_probe`，明确`external_model_requests=0`、`actual_credentials_read=0`及`formal_execution_enabled=false`。进程观测沿用RuntimeOperationResult，usage仍为`cost_known=false`。模块报告的零Token / 零费用仅属合成协议数据，不是实际Provider账单事实。该结果不能作为既有真实模型契约探针导入Provider准入，也不会创建Task、Run、Gate或ALLOW。

探针通过退出0，实际验证失败退出1，无效参数退出2。操作可以使用已有`runtime show / collect / cancel / recover`按操作键查询、采集、取消和恢复；取消请求不等于已停止，真实停止以原生证明为准。缺少完成采集或原生结束证明时继续Unknown。

## 4. 验证与当前缺口

专项3个测试文件30项通过，覆盖分片响应、摘要错配、超长 / 不完整回复、Abort、启动前拒绝错误配置，以及真实Windows身份、不同AppContainer拒绝、错误操作键、畸形 / 超大帧、重复 / 冲突请求、模块写入拒绝、取消、原生崩溃、准确资源恢复和证明篡改。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全量34个测试文件328项通过，新增21项IPC / CLI回归；最后加强进程句柄核对及类型隔离后的专项另行复验通过。首次全量有1项旧资源测试在等待期内尚未取得resource-proof.json，14项恢复测试单独复验和第二次全量均通过；记录保留在实测快照，不将未完成观测算作成功。

实际CLI使用固定OpenCode 1.18.34 / SHA256 `5283c2cd5b4285855daa97e6f7d17bf48146227cdf2a940e79e0f2b7869fd06e`，返回合成文本并留下宿主接受记录；双模式OS权限与网络默认值沿用已通过的回归。另保存真实合成异常 / 身份 / 恢复探针，原始引用逐项核对摘要。早期LOCAL命名、只读导入和回复排空失败尝试保留在`.cimiloop/ipc-transport-debug/`，没有用于验收；旧格式临时IPC证明不补写为新版成功。验收快照见[Runtime IPC实测](../research/CimiLoop-RuntimeIPC传输-2026-10-04.json)。

后续D-199实现宿主核心，D-200已接通[IPC宿主网关桥接](CimiLoop-IPC宿主网关桥接-v0.1.md)：无网络OpenCode实际收到合成HTTPS回复、持久预算及取消 / 原生或宿主丢失恢复已验证。实际模型请求及Key读取0，TEST上限不作为真实计价；正式Task及Agent Run仍关闭。下一步建立真实Provider可核验的计价上界及公网DNS / 固定地址 / 重绑定防护，再做真实网关契约验收；补齐文件系统硬配额与完整恢复后接正式Task及Agent Run。 Matt / Superpowers仍按V1-21/22推进，OpenSpec可选，ECC按需参考。

依据固定[OpenCode 1.18.34 Provider源码](https://github.com/anomalyco/opencode/blob/v1.18.34/packages/opencode/src/provider/provider.ts)、[Bun Windows IPC接口](https://bun.com/reference/node/net/createConnection)、[微软命名管道安全说明](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights)及[内核客户端PID接口](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getnamedpipeclientprocessid)。这些接口说明只作为设计依据，兼容和隔离结论来自本批实际二进制测试。
