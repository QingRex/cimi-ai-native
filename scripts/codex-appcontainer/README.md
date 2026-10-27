# Codex AppContainer 兼容客户端构建

这是开发构建入口，不会修改本机已有 Codex、读取已有登录、发送模型请求或授予生产资格。生成程序必须标为本地兼容版本，不能称作原官方二进制。完整 S1 的账户、账单、配额、异常恢复、真实 Skill 和业务交付仍须另行完成。

## 固定来源

- 上游：`https://github.com/openai/codex.git`
- tag：`rust-v0.162.0`
- commit：`c1382380de69521303b416720a52f42d51af6248`
- 本地版本：`0.162.0+cimiloop-lowbox.1`
- 工具链：Rust `1.95.0`，Windows x64 MSVC，Node `>=24.15 <25`。

`prepare-source.mjs` 只接受该提交，拒绝脏的初始源码和链接目录。它调整六个文件：本地 workspace／lock 版本、Windows 路径兼容函数，以及 absolute-path、home-dir、config 的三个调用位置。上游 lock 中161个本地包仍为 `0.0.0`，所以显式同步这些本地版本；不重新解析或升级外部依赖。`--verify` 逐份核对固定补丁，任何额外源码变更均拒绝。

低盒中的 Rust canonicalize 只有在实际 AppContainer token 且原错误为 error5 时才进入兼容函数。函数打开实际目标、查询真实 NT 路径，并核对监督器继承的原卷根元数据句柄。句柄 access 为0，不授予枚举、读内容、写入或更改 ACL 的能力。缺少原映射、跨卷、不完整查询或对象变化时返回原错误，不用未经核对的 absolute 字符串代替 canonicalize。

## 准备私有目录

选择仓库外、足够短、空间充足的新目录，以下称 `<build-root>`；不要复用用户 Codex／Cargo／Rustup 目录，不删除历史 Unknown。源码及产物全部留在这个私有目录。先在主仓库按锁文件安装并执行 `pnpm check`，使构建监督器的 `dist` 可用。

在 `<build-root>/source` 克隆上游并 detached checkout 上述完整 commit。此时源码应干净。使用主仓库中脚本：

```powershell
node scripts/codex-appcontainer/prepare-source.mjs <build-root>/source
node scripts/codex-appcontainer/prepare-source.mjs <build-root>/source --verify
```

在私有目录中准备 Rust 1.95.0 minimal 工具链：`CARGO_HOME=<build-root>/cargo`、`RUSTUP_HOME=<build-root>/rustup`，用官方 rustup 安装器的 `--no-modify-path --profile minimal --default-toolchain 1.95.0` 选项。不要改现有用户目录或全局 PATH。另需 Visual Studio Build Tools（C++ x64、Windows SDK、CMake／Ninja）、Git、Python；将实际安装位置写入下面文件。若所选上游依赖需要额外工具，依据实际构建错误安装到本批私有目录，不能跳过该依赖后称完整构建成功。

创建 `<build-root>/build-tools.json`，字段为实际绝对路径，不包含凭据。以下路径仅为形状示例，必须替换；`msvc_environment` 必须位于同一私有构建根：

```json
{
  "format": "cimiloop/private-codex-build-tools/1.0.0",
  "git": "C:/tools/Git/cmd/git.exe",
  "python": "C:/tools/Python/python.exe",
  "visual_studio": "C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools",
  "msvc_environment": "C:/private-codex-build/stages/msvc-01/stdout.log"
}
```

## 执行各阶段

从主仓库运行。每次阶段名必须全新；已有阶段拒绝覆盖。首次 `fetch` 访问固定 Cargo 依赖来源，后续测试及构建使用 `--locked --offline`：

```powershell
node scripts/codex-appcontainer/run-build-stage.mjs <build-root> msvc-01 msvc-env
node scripts/codex-appcontainer/run-build-stage.mjs <build-root> rust-01 rust-version
node scripts/codex-appcontainer/run-build-stage.mjs <build-root> fetch-01 fetch
node scripts/codex-appcontainer/run-build-stage.mjs <build-root> paths-01 test-paths
node scripts/codex-appcontainer/run-build-stage.mjs <build-root> build-01 build
```

运行器清空继承环境，设置私有 HOME／AppData／TEMP／Cargo／Rustup；只从私有 `msvc_environment` 接纳 PATH、INCLUDE、LIB 等明确的构建变量。它不会沿用当前 Codex、Python 或 Git 配置。开发构建由 launch2 原 Job 持有整个子树，父宿主退出后回收；这不是模型 AppContainer，也不作为模型隔离证据。私有卷空闲空间低于2 GiB时通过原取消文件停止原 Job，不删除目录来腾空间。

每阶段保留 `stages/<stage>/stdout.log`、`stderr.log`、原 Job 记录和 `result.json`；源码阶段另有前后来源核对。`result.json` 的 code0、未触发空间停止、原资源 disposed 及源码后验均须成立，才算该阶段完成。观察超时后继续查询同一实际进程句柄；仅当原阶段已终止且资源证明成立，才用新阶段名重试。崩溃、取消、缺工具和原件保留，不覆盖失败记录。

构建使用 release、opt-level1、无 LTO、无 debug、无 incremental、两个 Cargo jobs，保留上游 static CRT 设置。两个预期产物在：

```text
<build-root>/target/x86_64-pc-windows-msvc/release/codex.exe
<build-root>/target/x86_64-pc-windows-msvc/release/codex-code-mode-host.exe
```

## 离线启动与接入边界

完整构建成功后，显式选择本地兼容程序进行空登录目录验证：

```powershell
$env:CIMILOOP_OFFICIAL_CODEX_BINARY='<build-root>/target/x86_64-pc-windows-msvc/release/codex.exe'
pnpm exec vitest run packages/runtime-adapter/test/codex-official-startup.test.ts --maxWorkers=1
```

环境变量名称为旧接口，所选程序身份仍以实际原字节为准。该文件分别验证版本和 `app-server --stdio` 初始化；不会发 account/read、thread/start 或模型请求。只有初始化成功才证明这一步兼容，不能以版本输出替代。应同时记录本地来源收据、两个程序摘要和原 Job 处置。跳过不算通过。

此步骤不会自动安装默认 Provider、复制现有登录或放行生产宿主。继续接入时必须使用正式安装及原来源验证路径；模型／账户批准、完整资金账单、全部写路径的物理配额和完整恢复来源仍须真实具备。构建说明不是 S1 接入验收指南，也不替代真实普通 Change 到 ReadyForDelivery。
