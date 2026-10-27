# 原 Codex Job 的受控 TLS 出口

接续 `41a250c`。目标仍为完整 S1 五组；本批将模型联网接入同一原模型进程、Job、默认组合和只读证据链。没有读取登录文件或调用真实模型，正式 Agent 的完整生产准入保持。

## 实际执行路径

普通 Run、Skill 子调用、Skill 隔离调用、Runtime 技术契约四处默认组合现在选择 `codex_chatgpt_tunnel/1.0.0`。`CodexOriginalMethodRuntime` 必须持有上一批真实固定卷能力才能安装该策略；复制配置、未知策略或缺少能力在创建模型目录及进程登记前拒绝。内部 start13／模型 header26–28 固定策略，延续原工作区、父 Skill、具名方法协议和原项目身份，不能升级旧 pending 或将旧网络记录解释为新策略。

新 launch5 在原 Job 内创建同一 AppContainer 的代理和实际模型进程。两者 token 均独立核对 AppContainer SID、零网络 capabilities 和原 Job 归属；实际模型在挂起时核对原程序字节和身份，保存原 start 后才恢复。模型 stdio 原样交给既有 SDK 原字节传输，不混入代理控制帧。代理通过另一条原 nonce 命名管道访问宿主控制器，管道拒绝远程访问，DACL 只选当前用户、SYSTEM 和本次包 SID，包侧不授予新建服务实例权限。服务端还核对实际管道客户端进程属于本次 Job 和同一零网络 token；代理端核对控制管道的实际服务进程是原父进程。

AppContainer 继续禁止直连外网和容器外宿主 loopback。模型只获得同容器代理的 HTTP／HTTPS／WebSocket 代理环境；原代理环境被覆盖，NO_PROXY 清空。没有增加整机 loopback 豁免、防火墙规则或公共网络 capability。本机 Windows build19044.7663 上实际验证了同容器内部 loopback 和容器外 loopback 的区别，原 PUBLIC 结果在 `.cimiloop/codex-2026-10-27-internal-proxy-feasibility.json`。不以新版 Windows ProcessContainer 文档假定本机支持另一套 API。

宿主出口只接受 `chatgpt.com:443` 和 `auth.openai.com:443` 的 CONNECT，Host 必须一致；其他方法、端口、IP 字面量、域名后缀及携带请求体的 CONNECT 均不能外连。建立公网连接前先核对原 TLS ClientHello 的 SNI 与目标一致，拒绝 ECH；每次新连接独立解析 DNS，全部地址必须是公共地址，再直接连接所选原地址，实际对端必须相同，不跟随代理环境或重新解析地址。

CONNECT 与 SNI 仅作路由检查；不终止 TLS，不设置自签根证书，不解密或保存登录认证头和业务请求／响应。官方客户端继续负责远端 TLS 证书验证。出口的两个域名是本轮选定的最小策略，不是对官方所有登录／组织配置所需域名的完备声明；后续真实接入遇到额外目的地时必须先核对需求，不自动扩展。

每个原调用最多32条代理连接、32MiB隧道传输预约；原模型超时也在 Native 监督器执行。HTTP头、TLS握手和并发任务均有上限。原 cancel、宿主退出、网络期限或边界失败终止同一个 Job；先核活动进程为0，再关闭宿主端全部套接字／管道及工作任务（含处理任务派生的反向 I/O 子任务，逐轮收齐并复核完成），移除本次写根授权和删除本次 Profile，最后保存 end4。原查询同时核对监督进程、实际模型及代理三者；资源处置仍不等于输出成功、费用结清或业务完成。旧 launch1–4／start／end 原件按原义读取；新 build3 冻结五个源码文件及编译器，不改变 Schema242、项目库10或 Host1。

## 实际失败与修复

1. 新离线代理测试先失败：旧 Job 没有强制代理；网络策略缺能力和未知策略两个反例也先失败。原始报告分别为 `contained-proxy-red`、`contained-proxy-admission-red`。
2. 首次接线使用 `LOCAL` 命名空间，Win32 返回2／1150，未建立外部请求。当前使用仓库既有未打包 AppContainer 的原管道形式，仍有精确 SID、原父进程、原 Job、FIRST_PIPE_INSTANCE 和拒绝远程约束；未添加豁免或放宽 ACL。
3. 子模型已创建后，宿主无法再复制该后代 token 来重新设置注册表。现在通过原代理 token 在模型创建前保护同一 Profile hive，随后单独核对实际子模型 SID、零网络能力和 Job 归属，不需要重复改同一 hive。
4. 单次拒绝路径曾通过，但后续并发检查和公共 TLS 握手失败。真正的双向 I/O 缺口是客户端管道仍以同步句柄打开，读操作可能阻住取得响应所需的写操作；仅改独立任务不足以解决。当前服务端和客户端均使用 overlapped 句柄，并以有上限的独立任务处理各方向。修复后两个完整文件2项通过、0失败0跳过，包含实际公共 TLS；该轮尚未包含后来补充的等待 TLS 原取消和错误 SNI 两项。

失败原件、目录和本次未完整回收的 Profile／授权均保留，不因进程缺失宣布它们已清理。失败诊断只含固定阶段及数值，不含 argv、请求内容、认证头、密钥或异常正文。测试 C# worker 自身的未处理 PUBLIC 异常仅属于测试报告，不能替换产品对真实 Codex stderr 的有界内存处理。

上层首轮三项2通过1失败，失败是新策略缺能力的错误码断言仍期待上一批写根错误码，已经按实际门禁调整。随后核心三文件20通过1失败，唯一失败为上述双向同步管道问题；没有把早期单次通过当稳定结果。最后集中结果见下节。

六文件集中通过后，补齐宿主 I/O 子任务登记和结束前全量等待；受影响两个完整网络文件复验3通过1失败，失败的公共 TLS 连接选到 `172.64.155.209`，仅发送 ClientHello、没有收到响应。此前 `104.18.32.47` 两次握手完成。该观测不足以证明远端或本机根因；现按已有网关的确定性顺序优先 IPv4，再按地址排序，每次只拨选定地址，不新增重试或域名／证书豁免。最终公共 TLS 完整文件1项通过，原失败保留。

## 验证范围

公开 TLS 验证只执行 `chatgpt.com` 的证书验证握手，不发送 HTTP／应用请求、不登录、不调用模型，费用账单和账户状态不作任何推断。该测试需要显式设置 `CIMILOOP_PUBLIC_TLS_ACCEPTANCE=1`；跳过不能算网络验收通过。

六个完整文件曾同轮36项通过、0失败0跳过（`.cimiloop/codex-2026-10-27-contained-proxy-acceptance.json`），之后补充的结束核对和地址排序按受影响范围复验：离线网络完整文件3项通过（`contained-proxy-cleanup-final`），公共 TLS 完整文件1项通过（`contained-proxy-dns-final`）。按各完整文件最新结果共6文件36项分轮通过，不称最终源码一次六文件验收。包含原取消时等待 ClientHello 的管道／代理／模型整个 Job 回收、CONNECT 与 SNI 不一致时公网连接和传输字节均为0、真实公共 TLS 握手、上层两种原网络模式及六个模型头的读取／防降级、原请求重放及应用组合转交策略。模型头验证中的只读派发拒绝不计真实模型执行；应用 staging 投影继续明确禁止模型派发，不冒充同卷 OS 验收。原二进制及真实账户兼容仍未跑。

最终 `pnpm check` 通过，Node24.22.1／pnpm12.4.2，文档和差异检查另在提交前核对。没有全仓 `pnpm test`、完整 Native 族回归、真实模型／Skill、费用结清或完整 S1 验收。已刷新 origin/main，无远程新增；旧六个未跟踪文件不读取、不暂存，默认不推送。

在按交接记录准备了本机新的短 NTFS 测试目录和合规 Node／pnpm 的终端，可复验本批范围：

```powershell
$env:CIMILOOP_PUBLIC_TLS_ACCEPTANCE='1'
pnpm exec vitest run packages/runtime-adapter/test/codex-contained-proxy.test.ts packages/runtime-adapter/test/codex-contained-proxy-network.test.ts packages/runtime-adapter/test/codex-fixed-volume-confinement.test.ts packages/runtime-adapter/test/codex-process-job.test.ts packages/local-app/test/agent-parent-skill-composition.test.ts packages/local-app/test/skill-invocation-codex-composition.test.ts
pnpm check
```

该命令只复验本批六个文件，不是完整 S1 接入命令。没有互联网、DNS或正常证书信任时应如实记录 PUBLIC TLS 失败，不跳过后宣称通过；不要关闭证书校验或扩大域名范围。

上层应用和模型测试仍使用 PUBLIC 账户／模型回复及部分卷 OS 观测投影。真实 Windows Job／AppContainer／命名管道、只读原票据、代理进程与套接字回收是真实执行；它们不等于真实模型、真实固定卷、费用或完整 S1 验收。四处默认组合选择新策略已经接线，尚未据此启用正式 Agent。

## 剩余完整目标

仍需将完整网络／成本／物理配额／恢复来源装入 Provider 生产核验，覆盖全部共享可写对象与历史容量、启动中断及全部异常恢复，完成正式 Codex 二进制及随附程序在该边界下的真实兼容验证。当前编译和上层验证中的模型是 PUBLIC C# stdio，不是已证明真实 Codex 可完成任务。

固定卷准备证明、同卷官方登录目录、原 Human 问题的真实回答和真实账单仍待接入；真实 Skill、普通 Change 到 ReadyForDelivery、接入指南实际走通和最终 Matt／Superpowers评审未完成。用户已授权的现有登录／测试 Luna 选择不变，不重复索要授权，不提取或复制凭据，不默认 push。

## 参考依据

- [Microsoft：双向管道的同步与 overlapped I/O](https://learn.microsoft.com/en-us/windows/win32/ipc/synchronous-and-overlapped-input-and-output)。
- [Microsoft：进程间通信与 AppContainer／打包应用约束](https://learn.microsoft.com/en-us/windows/apps/develop/communication/interprocess-communication)。本机未打包实际行为另由 PUBLIC Native 执行核验，不直接等同文档中的 MSIX 配置。
- [OpenAI：认证由官方客户端管理](https://learn.chatgpt.com/docs/auth)及[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)。这些页面不单独证明本项目出口覆盖完整真实接入需求。
