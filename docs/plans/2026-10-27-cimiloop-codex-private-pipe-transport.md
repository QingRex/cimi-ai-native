# 原模型 Job 的显式包权限与私有 TLS 管道

后续[客户端源码适配及模块验证](2026-10-27-cimiloop-codex-private-pipe-client.md)已完成：独立 `.2` 源码的两个HTTP依赖及实际WebSocket库编译通过，共用Rust模块的真实AppContainer软件TLS认证3项通过。下文为本批历史边界；完整CLI构建／初始化／真实执行仍未完成，旧.NET失败和七文件空间停止不改判。

接续 `8aa69af`。本批将实际模型 Job 的共享包 opt-out 接入默认普通 Run、父 Skill、具名方法和 Runtime 技术契约四个组合，并提供同一原监督器下的私有 TLS 管道。正式 Codex 客户端尚未适配此管道，完整 S1 不成立。

## 执行路径与兼容

新执行选择 `explicit_package_access/1.0.0`。代理和模型创建时均设置共享包 opt-out，token 只带固定 registryRead 只读能力；继续禁止直接网络，保持原 Job 的2 GiB总提交内存、8进程限制、原程序包锁定、私有用户目录、Profile保护及access0原卷元数据句柄。不扩大全局 ACL，不增加 internetClient、loopback 豁免或系统写入权限。

方法 start17、模型头38–40、Native launch9、start8/end8和write-scope3显式固定新策略。旧 start16及更早、模型头35–37及更早、launch8及更早，仍按各自保存的原输入读取，不能获得新 opt-out 资格。新读取器拒绝将普通 TCP 监听证明冒充新私有管道证明；新 scope3 的 opt-out 字段被移除或改为 false 同样拒绝。Schema242、项目库10、Host1不变。

在本机新模式下，原代理能启动、接收控制帧，但 TCP socket 构造返回10013，还没有 bind/listen。原 TCP 代理不适用于这一 LPAC。新模式因此不创建本地 TCP 监听：实际模型直接连接原监督器持有、nonce固定的私有命名管道；原 broker核客户端的实际 PID、同一 Job、原 AppContainer SID及唯一只读能力。模型和代理仍处于同一原 Job，取消与宿主退出沿用原操作。

新网络启动原件为 `cimiloop/codex-model-network-start/2.0.0`，传输为 `original_named_pipe_tls/1.0.0`，保存原管道名，不带 loopback_port。新进程获得的环境包括原管道名、原监督器 PID及固定传输策略；HTTP_PROXY等TCP代理环境清空。兼容客户端须以精确 `0x0012019b` 管道访问权打开原端点，核对实际服务器 PID；不授予创建同名服务器实例的权限。

新管道直接传 TLS，不使用 HTTP CONNECT 前导。broker严格解析有界 ClientHello，只允许 `chatgpt.com`、`auth.openai.com`，核全部 DNS 结果均为公共地址并固定实际连接地址。模型内仍负责 TLS 及证书认证；broker不解密 HTTP、不读取或记录认证头和登录文件。旧模式继续使用自己的同容器 TCP／CONNECT路径，原件不重解释。

## 实际验证与失败

新包权限的正向反例此前先失败：原模型能够写仅授ALL APPLICATION PACKAGES的文件；启用 opt-out 后又在socket创建10013处失败。私有管道接通后，实际Windows／AppContainer／模型进程验证原授权state可写、共享包文件写入拒绝；旧模式对照仍可写。两者均有原Job清空、授权移除及Profile删除原件。篡改新opt-out、替换为旧TCP网络原件均拒绝。

最初私有管道实验用了CONNECT，随后核对客户端传输接口后改为直接TLS。本批之前的实验原件按其固定监督器及PUBLIC身份保留，不能作为最终直接TLS入口的验证。

早期 .NET“错误SNI”测试可能在SSPI初始化阶段就失败，不能用客户端先失败证明broker核验了SNI；该结果不再作为SNI拒绝证据。显式公共TLS认证测试也实际失败：本机LPAC中的.NET无法枚举所需SSPI安全包。没有增加额外能力让夹具通过，也没有放宽证书认证。

最终使用固定原始ClientHello实际验证非白名单域名、域名后缀伪装及畸形TLS被broker拒绝；原取消、Job及资源回收通过。另经原管道和固定公共出口实际收到ServerHello，但这只证明路由及初始TLS响应，不证明证书认证或完整握手，没有发送应用请求。完整.NET认证用例保留独立开关 `CIMILOOP_SCHANNEL_TLS_ACCEPTANCE=1`，当前缺项不计通过。

当前源码四个Native文件整轮11项通过、0失败、1项未运行：旧TCP代理3、显式包权限2、启动拒绝恢复2、私有管道4通过／完整认证1未运行。上层组合文件的7项完整通过发生在最终直接TLS分流补丁前；后续Native影响由上述四文件覆盖，不称五文件最终单轮全绿。该上层文件覆盖方法start17、三类模型头38–40、原操作重放和旧格式兼容，PUBLIC模型及固定卷投影不能作为真实模型、真实配额或账单。

本来启动了七文件整轮回归，但D盘可用空间降至约64 MB后，明确停止了本次测试命令及其Node子树；工具会话已终止，没有最终JSON报告，该轮不计通过。未删除Temp、映射、Profile或历史Unknown。中断夹具保留，不能由测试进程退出推断其全部原资源已处置。后续小范围Native验证改在C盘的新私有目录执行。

默认父Skill与具名Skill组合随后在C盘只复验三个受影响目标用例：3项通过、9项未选择，不称两个文件完整通过。四个默认组合已选新包权限策略；其中两个工厂的PUBLIC包装显式断言该策略后才使用夹具传输，不能把包装调用当作真实Codex客户端已支持私有管道。

最终工作区 `pnpm check` 通过，Node24.22.1／pnpm12.4.2。测试原件保留在本机忽略目录 `.cimiloop`：同日前缀 `codex-2026-10-27-` 的 `model-package-socket-stage.json`、`model-package-pipe.json`、`private-pipe-native.json`、`private-pipe-tls.json`、`private-pipe-direct-tls.json`、`private-pipe-direct-tls-fixed.json`、`model-package-runtime.json`、`model-package-final-native.json`。失败及未运行项保留，不从原件中挑选成功样本充当完整验收。本批没有读取登录或发送真实模型／付费请求。

工厂目标复验报告为同日前缀的 `model-package-composition-focused.json`。首次新测试使用了不符合当前Vitest类型签名的回调／超时参数，类型检查失败；修正后 `pnpm check` 通过，相关Native文件整轮复验通过上述11项、保留1项未运行。D盘当前仅约60 MB空闲，C盘约1 GiB；不继续大量复制夹具。

## 仍需接通

当前 `scripts/codex-appcontainer/prepare-source.mjs` 的本地兼容版本仍只包含原卷路径修复，不包含私有管道客户端。不能把它成功输出版本、普通TCP握手、ServerHello或PUBLIC进程作为真实Codex端到端执行证据。

下一批扩展固定来源的客户端：使用软件TLS经原管道发送ClientHello，保留精确管道权限、实际服务器身份、证书认证及全部HTTP／WebSocket路径的限制，不能因为某个库有同名接口就声称接通。源材料和兼容版本须显式固定；旧构建不原位冒充新构建。先做无登录启动和网络验证，再使用已授权账号及Luna进行真实验收。

本机兼容客户端构建仍有已记录的rustc故障模块条件；当前空间也低于构建脚本2 GiB的启动下限，不盲目重复构建、不删除原件腾空间。真实固定卷的管理员准备、真实费用／完整恢复来源、真实Skill／Human、默认CLI／工作台实际执行、普通Change到ReadyForDelivery、接入指南实走及最终Matt／Superpowers评审继续，五组S1保持active。默认不push。
