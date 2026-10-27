# 固定 Codex 客户端的私有管道源码与模块编译

接续 `d90a745` 的原模型私有 TLS 管道。已有管道监督器可接受 TLS，并不意味着原官方客户端会使用它。本批将实际 HTTP／WebSocket 连接入口接到同一管道，完成模块编译和共用 Rust 管道模块的真实软件 TLS 认证；尚未构建完整兼容 CLI，也没有发送真实模型请求。五组 S1 仍未完成。

## 可执行实现

上游固定 `openai/codex@c1382380de69521303b416720a52f42d51af6248`。已有 `.1` 路径兼容源码和私有构建配置保持原样；新增显式 `0.162.0+cimiloop-lowbox.2`，不能原位采用脏 checkout 或把旧产物标成新版本。

`prepare-source.mjs --private-pipe --reqwest-012 ... --reqwest-013 ...` 使用上游 lock 的摘要认证两个 reqwest 归档，拒绝链接、路径穿越及重复条目，在独立 vendor 目录生成补丁。两个 vendor 包从 workspace 自动成员中显式排除，通过各自版本的 Cargo patch 接入；除本地版本及这两个包的来源外不升级锁定依赖。来源收据格式2固定传输模块及依赖摘要，逐文件核字节和物理身份，历史格式1仍核原 `.1`。

HTTP `0.12.28`、`0.13.4` 与实际 `websocket-client` 共用 `pipe_windows.rs`。仅完整合法的原管道名／策略／服务器 PID 可以选择新路径；部分或非法配置拒绝，完整缺席才保留旧行为。打开时核实际 AppContainer，以精确 `0x0012019b`、非继承和 identification QoS 连接，随后核实际服务器 PID。HTTP 禁用系统代理发现和明文 HTTP，强制 Rustls、证书／主机名／SNI 验证并关闭详细连接日志；`.13` 同时关闭 TLS key log。WebSocket 在任何 TCP 分流前接管固定模型域名 WSS443，保持软件 TLS 验证。

`--cimiloop-transport-capabilities` 在正常 CLI dispatcher 前输出固定源码能力声明；它不读取登录，也不是生产资格、真实执行或完整构建证据。

构建运行器增加可选独立 `--tools <绝对路径>` 和配置格式2，旧配置不改。`check-pipe-modules` 只从固定 Git 对象／认证归档物化所需实际 HTTP／WebSocket 模块，离线单进程编译。夹具 Cargo.lock 可裁剪未使用依赖，但后验禁止增加任何新外部来源／版本／摘要，并逐份核169个原文件的内容及物理身份。此动作不修改完整 `.1` checkout。

`pipe-acceptance` 直接 rustc 编译与客户端补丁共用的管道模块，复用已有固定 Rustls 库；前后核源码／库摘要和物理身份。它是开发传输夹具，不是完整 Codex 客户端。两个有限动作的余量保护为512 MiB；原完整 fetch/test/build 的2 GiB门槛保持。

## 本批实际验证

- Node24.22.1、pnpm12.4.2；`pnpm check` 通过，包括新增 TypeScript Native 测试的类型检查。
- `node --test scripts/codex-appcontainer/pipe-source.test.mjs`：4通过、0失败、0跳过。使用实际固定来源及已认证归档，覆盖旧 `.1` 保持、双 HTTP／WebSocket 补丁、归档字节变化拒绝、模块源码篡改及新增外部依赖拒绝。这是来源／静态验证。
- 私有 `pipe-module-01`：首次直接 rustc 编译因未包含 host proc-macro 搜索目录失败，原失败保留；补齐实际 host 缓存路径后，`pipe-module-02` 终态0，原 Job disposed，源码／库前后原身份一致。
- `.cimiloop/codex-2026-10-27-rust-pipe-authentication.json`：真实 Windows/AppContainer 的 Rust 传输夹具3通过、0失败、0跳过。覆盖完整／非法元数据与容器外拒绝；原管道软件 TLS 完成证书和主机名认证；错误服务器 PID 拒绝；每次核原 Job 为空、授权移除及 Profile 删除。未发送应用请求。该结果补上早期 .NET SSPI 失败／仅收到 ServerHello 不具备的认证证据，仍不等于完整客户端执行。
- `pipe-http-ws-01`：第一次离线 Cargo check 因空间低于512 MiB停止，code125、stopped=true，原 Job 已正面核 disposed，169份源码后验通过；不计编译通过，不删除原件。进程结束释放临时占用后，C盘恢复约851 MiB，缓存中已完成的依赖可复用。
- `pipe-http-ws-02`：改为单 Cargo job、全新阶段、保持原空间门槛，离线 `cargo check --release --target x86_64-pc-windows-msvc -p cimiloop-private-pipe-module-check --lib` 终态0。实际双 reqwest、`codex-http-client` 和 `codex-websocket-client` 均编译；未触发空间停止，原 Job disposed，169份源码后验通过。锁定外部条目从1310裁剪到314，无新增版本／来源／摘要。不是完整 CLI 编译或运行。

本机所有阶段保存在仓库外私有构建根 `C:/CimiBuild/cx-5d37e2/stages/`，各有 stdout／stderr、原 Job、前后来源及 result.json。该路径仅是本机证据位置，换机器须按实际配置重新准备，不能当可迁移安装。来源测试临时目录保留。旧七文件 Native 回归仍因空间被停止而没有最终报告，不由本批结果改判。

## 下一步与接入条件

完整 `.2` Codex CLI 和 code-mode-host 还没有构建、安装或初始化。此前完整 rustc 构建曾出现访问冲突，Windows 事件指向已记录的注入模块；不能凭事件名称自行禁用系统组件，也不盲目重试。当前C约825 MiB、D约57 MiB，仍低于完整构建门槛，需要空间充足且构建环境可用的私有 Windows builder；使用[构建说明](../../scripts/codex-appcontainer/README.md)中的固定来源、新 checkout 与独立配置，不复制凭据。

构建后依次验证无登录版本／`app-server --stdio` 初始化、实际新管道 HTTP／WebSocket，再通过正式安装和原来源门禁执行已授权账号／Luna。有限模块编译不包含 CLI 参数补丁的完整编译，也不批准程序或账户。

全写路径物理配额、历史容量、真实费用和完整异常恢复来源、真实 Skill／Human、默认 CLI／工作台真实业务链、普通 Change 到 ReadyForDelivery、接入指南实走及当前源码的 Matt／Superpowers 最终评审仍需完成。Schema242、项目库10、Host1保持；本批未读登录、未发真实模型请求、不push、不处理未知六文件或历史Unknown。
