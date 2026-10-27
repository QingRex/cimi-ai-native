# Codex AppContainer 兼容客户端构建

这是开发构建入口，不会修改本机已有 Codex、读取已有登录、发送模型请求或授予生产资格。生成程序必须标为本地兼容版本，不能称作原官方二进制。完整 S1 的账户、账单、配额、异常恢复、真实 Skill 和业务交付仍须另行完成。

脚本保留原路径兼容版本 `.1`，并提供独立的私有管道源码版本 `.2`。`.2` 将两个 HTTP 依赖及 WebSocket 实际连接入口接到原管道，不能以源码准备、模块编译或传输夹具代替完整客户端构建及真实执行。[原生入口及验证边界](../../docs/plans/2026-10-27-cimiloop-codex-private-pipe-transport.md)。

## 固定来源

- 上游：`https://github.com/openai/codex.git`
- tag：`rust-v0.162.0`
- commit：`c1382380de69521303b416720a52f42d51af6248`
- 本地版本：`0.162.0+cimiloop-lowbox.1`（仅路径兼容）或 `0.162.0+cimiloop-lowbox.2`（显式私有管道源码）。
- 工具链：Rust `1.95.0`，Windows x64 MSVC，Node `>=24.15 <25`。

`prepare-source.mjs` 只接受该提交，拒绝脏的初始源码和链接目录。它调整六个文件：本地 workspace／lock 版本、Windows 路径兼容函数，以及 absolute-path、home-dir、config 的三个调用位置。上游 lock 中161个本地包仍为 `0.0.0`，所以显式同步这些本地版本；不重新解析或升级外部依赖。`--verify` 逐份核对固定补丁，任何额外源码变更均拒绝。

低盒中的 Rust canonicalize 只有在实际 AppContainer token 且原错误为 error5 时才进入兼容函数。函数打开实际目标、查询真实 NT 路径，并核对监督器继承的原卷根元数据句柄。句柄 access 为0，不授予枚举、读内容、写入或更改 ACL 的能力。缺少原映射、跨卷、不完整查询或对象变化时返回原错误，不用未经核对的 absolute 字符串代替 canonicalize。

`.2` 另外核对上游 Cargo.lock 中 reqwest `0.12.28` 和 `0.13.4` 的 `.crate` 归档摘要，在内存中拒绝链接、路径穿越及重复条目后生成独立 vendor 源码，不信任已解包缓存。HTTP 与 WebSocket 共用 `pipe_windows.rs`：三项原管道环境必须同时有效，只在实际 AppContainer 内以精确 `0x0012019b` 权限打开，核实际服务器 PID 和非继承句柄；不回退 TCP。HTTP 强制软件 TLS、证书/主机名/SNI 校验和 HTTPS，禁用系统代理与详细连接日志；WebSocket 只接受固定模型域名的 WSS443。完整环境缺席时保持原客户端行为，部分或非法环境拒绝。

## 准备私有目录

选择仓库外、足够短、空间充足的新目录，以下称 `<build-root>`；不要复用用户 Codex／Cargo／Rustup 目录，不删除历史 Unknown。源码及产物全部留在这个私有目录。先在主仓库按锁文件安装并执行 `pnpm check`，使构建监督器的 `dist` 可用。

在 `<build-root>/source` 克隆上游并 detached checkout 上述完整 commit。此时源码应干净。使用主仓库中脚本：

```powershell
node scripts/codex-appcontainer/prepare-source.mjs <build-root>/source
node scripts/codex-appcontainer/prepare-source.mjs <build-root>/source --verify
```

选择 `.2` 时在 `<build-root>/source-pipe` 准备另一个全新、干净的固定提交 checkout；不要在已有 `.1` 上原位升级，不覆盖旧源码或收据。已有 `<build-root>/source` 的固定上游 Git 对象时，可以执行 `git -C <build-root>/source worktree add --detach <build-root>/source-pipe c1382380de69521303b416720a52f42d51af6248`；原 `.1` 工作区的改动保持。两个 archive 参数均为实际绝对路径：

```powershell
node scripts/codex-appcontainer/prepare-source.mjs <build-root>/source-pipe --private-pipe --reqwest-012 <reqwest-0.12.28.crate> --reqwest-013 <reqwest-0.13.4.crate>
node scripts/codex-appcontainer/prepare-source.mjs <build-root>/source-pipe --private-pipe --reqwest-012 <reqwest-0.12.28.crate> --reqwest-013 <reqwest-0.13.4.crate> --verify
```

`.2` 收据格式2另存传输模块和依赖摘要；版本标识与固定 `--cimiloop-transport-capabilities` 输出都不是资格证据。完整 fetch／test-paths／build 按配置选择固定目录：格式1用 `source`，格式2用 `source-pipe`；两个 checkout 共用本批私有工具链与 Cargo target 缓存。有限模块夹具仍从原 `source` 的固定 Git 对象构造新阶段，不用旧 `.1` 作为完整 `.2` 构建输入。最终程序必须对应本次阶段源码后验及摘要；target 中其他版本的旧文件不能当成本阶段成功产物。

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

`.2` 使用独立的 `<build-root>/build-tools-pipe.json`，保留上述工具字段，修改 `format` 并添加以下字段；两份归档都必须在同一个私有构建根内：

```json
{
  "format": "cimiloop/private-codex-build-tools/2.0.0",
  "source_policy": "original_named_pipe_tls/1.0.0",
  "reqwest_archives": {
    "0.12.28": "C:/private-codex-build/cargo/reqwest-0.12.28.crate",
    "0.13.4": "C:/private-codex-build/cargo/reqwest-0.13.4.crate"
  }
}
```

此片段须与实际工具字段合并，不是完整配置。各阶段追加 `--tools <build-root>/build-tools-pipe.json` 来显式选择；不修改旧配置。

### 将编译输出放在另一个盘

源码／工具链所在盘余量不足、其他盘有容量时，可另外保存格式3工具配置。保留格式2的全部实际字段与原归档，改为以下格式并增加目标目录：

```json
{
  "format": "cimiloop/private-codex-build-tools/3.0.0",
  "target_directory": "D:/private-codex-target"
}
```

这仍是需与原工具字段合并的片段。目标目录必须显式预先创建，不能是盘根、文件、符号链接或带链接父目录；它与原构建根、开发工具仓库均不能相互包含。`source-pipe`、归档、工具链、原 Job 及阶段记录仍在原构建根；只有 Cargo target 改用该目录。读取旧格式配置不改变旧 target。

需要复用旧缓存时，先核对原构建已终止且资源 disposed，再将明确属于本批的旧 target **复制**到新目标；保留旧缓存和失败记录，不在原阶段仍运行时复制或移动。新空目标也可直接构建。Cargo 的实际离线构建仍须成功；复制缓存不作成功证据。

源盘和目标盘均受各自空间停止线约束，完整构建仍为2GiB，有限阶段仍为512MiB；目标盘有空间不允许耗尽源盘。新阶段结果增加 `target_directory`，产物位置对应 `<target-directory>/x86_64-pc-windows-msvc/release`，后续模块夹具也从同一目标读取。显式选择新配置和全新阶段名运行，不覆盖旧工具配置或收据。

### 保留 V8 sandbox 的源码构建

固定 `v8-150.4.0` 的官方 release 缺少 Windows `ptrcomp_sandbox` 预编译库时，不能替换为普通库或关闭源码中的 `v8_enable_sandbox`。可在另存的格式1／2／3配置中显式增加：

```json
{
  "v8_source_build": {
    "format": "cimiloop/locked-v8-sandbox-source/1.0.0",
    "clang_root": "D:/private-llvm/clang+llvm-20.1.8-x86_64-pc-windows-msvc"
  }
}
```

此片段须与实际工具字段合并。先从 [LLVM 官方发行版](https://github.com/llvm/llvm-project/releases/tag/llvmorg-20.1.8)取得 Windows 工具归档，核对官方摘要并解包到本批私有普通目录，不安装到全局。目录须包含实际 `bin/clang.exe`、`clang-cl.exe`、`libclang.dll`、`lld-link.exe`；最后一项由固定 V8 工具链用于链接及 `/lib` 静态归档。版本和依赖需在本机实际核验。运行器封存这四份文件的摘要与物理身份，并在阶段结束复读；不声称封存整个 LLVM 发行版及全部依赖。

该选项设置 `V8_FROM_SOURCE=1`、单 Cargo job、`CLANG_BASE_PATH` 和 `LIBCLANG_PATH`；除下述成对工具路径外，拒绝其他字段及任意 GN 参数。固定 Cargo 锁和 sandbox feature 保持。上游源码构建脚本可能下载其固定 GN／Ninja／Chromium Rust 工具；Cargo 的 `--offline` 只约束 Cargo 依赖解析，不能解释为整个构建零网络。仍在不继承登录／用户配置的开发 Job 内运行，保留空间停止线、失败原件与源码后验。新结果额外记录 `v8_source_originals`，实际源码构建失败不能由配置通过代替。

GN分发端点不可用时，可在上述 `v8_source_build` 内成对指定 `gn_binary` 与 `ninja_binary`，分别为实际工具的绝对路径。两项必须同时存在，均核对普通文件、无链接父目录、MZ、摘要和物理身份，加入阶段前后材料；缺省仍用原上游发现／下载方式。这两个字段只映射GN／NINJA，不开放GN参数、源码版本或安全开关。自行构建GN须使用固定V8 `v8/DEPS` 的 `gn_version` 提交，核对完整Git对象和源码；镜像只能传输同一固定Git对象。Ninja须是实际已核验的本机工具。不能以下载失败为由使用来源未知程序。

完整V8源码构建将所选 `visual_studio` 显式传给上游发现脚本，年份来自同一次读取的原MSVC环境文件中的唯一 `VisualStudioVersion`：15／16／17／18分别对应2017／2019／2022／2026。缺失、未知版本、同名或大小写不同的重复原行均拒绝；不先合并环境再丢失重复信息。该派生环境另记入阶段结果，非build动作保持原行为。所选Windows SDK还须包含 [Debugging Tools for Windows](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/debugger-download-tools)；缺 `Debuggers/x64/dbghelp.dll` 等原组件时按实际失败准备官方组件，不用系统DLL冒充SDK组件，不关闭固定V8检查。

如果固定V8要求的Clang版本库与用于绑定生成的libclang发行版不同，可在 `v8_source_build` 中显式增加 `binding_clang_root`。`clang_root` 仍选择真实编译器、链接器及对应版本的内置库；新字段只选择另一普通目录中的 `bin/libclang.dll` 和 `LIBCLANG_PATH`，默认仍使用同一个根。四项／六项封存顺序和前后复查保持，不能把旧版库改名成要求的新版本。Windows Chromium精简编译包只有 `clang-cl.exe` 时，上游版本探测还要求 `bin/clang.exe`；可复制同一原驱动字节作为该入口，记录原字节摘要及来源。编译器归档须与固定DEPS原摘要匹配，绑定DLL须满足上游最低版本；配置通过不证明两者实际兼容，仍以完整构建结果为准。

### 补齐发布包未携带的构建输入

固定 `v8-150.4.0` 的 crates.io 包没有携带完整源码构建输入。实际构建需要的 `third_party/icu/common/icudtl.dat`／`icudtb.dat` 被 Cargo 包显式排除，`third_party/rust/chromium_crates_io/vendor` 也须另行准备。先从本机固定包的 `v8/DEPS` 读取对应 Git 提交；本批分别为 ICU `ee5f27adc28bd3f15b2c293f726d14d2e336cbd5` 和 Rust 依赖树 `26e8ff47f18a8d28d6187a04b6a16cb7332356f8`。只从对应不可变官方对象补齐缺件，不覆盖包内已有文件或改 Cargo 元数据，不以当前最新版替代。

可从 [ICU 固定对象](https://chromium.googlesource.com/chromium/deps/icu.git/+/ee5f27adc28bd3f15b2c293f726d14d2e336cbd5)和 [Rust 固定对象](https://chromium.googlesource.com/chromium/src/third_party/rust/+/26e8ff47f18a8d28d6187a04b6a16cb7332356f8)取得材料。保存原提交／目录元数据，重建 Git tree 与 blob 身份校验后再复制缺件；归档解包拒绝绝对路径、越界、链接及重复文件，保留2GiB线。Rust 只需本次实际 GN 图要求的完整 crate 子树，不能仅拿同版本 crates.io 包代替 Chromium 已修补原树。中途复制失败时，先逐份复核既有文件与同一原树相同，再仅补缺件；不删除失败材料或覆盖不符文件。

生成 GN 图后用所选 `ninja -C <实际gn_out> -t inputs rusty_v8` 检查缺失外部输入；这只证明所列输入存在，不代替实际构建。路径需同时核对实际 Win32 调用：文件的规范绝对路径存在，不代表带多层 `..` 的相对路径在同一工作目录可读。

### Windows 相对路径长度兼容

本机已复现：原 Ninja1.12.1 和官方1.13.2对同一 GN 图报告不存在的文件，实际原件存在；Win32 对拼接前超长相对路径返回路径不存在。同一原 Ninja 从该目录的系统8.3短路径运行时，完整构建图预演通过。

遇到同一问题，可显式构建本仓库的 [Ninja 短工作目录补丁](ninja-short-cwd.patch)。固定上游为 Ninja1.13.2／提交 `3441b633c2fe2c494e958780ba0f4227b1327634`；核对 Git 对象后，在单独私有源码目录执行 `git apply --check <补丁绝对路径>`、`git apply <补丁绝对路径>`，再以实际 MSVC 环境及已固定 Python 执行 `python configure.py --bootstrap --with-python=<实际Python绝对路径>`。构建过程也应由原开发 Job 持有并保留空间保护、源码和工具前后核对。

版本须实际返回 `1.13.2+cimiloop-short-cwd.1`。补丁只在 Windows 的 `-C`／`chdir` 前读取系统已有短目录名；失败时继续原路径。不会创建短名、链接或映射，不修改全局设置或 GN／sandbox 参数。在原长路径上重新执行 `-n rusty_v8` 成功后，才将这个明确的本地兼容程序设为 `v8_source_build.ninja_binary`；封存实际程序及补丁来源，不称它为官方未修改 Ninja。没有可用短目录名时，该方法不保证解决长度问题。预演成功仍须完整构建及原 Job 处置通过。

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

## 有限模块验证

在已有固定源码和缓存库的私有构建根，可先执行小范围验证；不需要原位准备 `.2` checkout：

```powershell
node scripts/codex-appcontainer/run-build-stage.mjs <build-root> pipe-modules-01 check-pipe-modules --tools <build-root>/build-tools-pipe.json
node scripts/codex-appcontainer/run-build-stage.mjs <build-root> pipe-rust-01 pipe-acceptance
```

`check-pipe-modules` 从固定 Git 对象和已认证归档生成全新阶段源码，只编译两个 reqwest 版本及实际 HTTP/WebSocket 库；离线、单 Cargo job。夹具 lock 可裁剪未用依赖，后验拒绝任何新增外部来源/版本/摘要，并逐文件核原物理身份和内容。它不是完整 CLI 构建，也不安装 Provider。

`pipe-acceptance` 用直接 rustc 和已有原库编译共用管道模块的传输夹具，核源码/库的前后身份和摘要。可通过 `CIMILOOP_PRIVATE_PIPE_RUST_BINARY=<阶段>/bin/cimiloop_pipe_acceptance.exe`、`CIMILOOP_PUBLIC_TLS_ACCEPTANCE=1` 运行 `packages/runtime-adapter/test/codex-rust-pipe.test.ts`，覆盖真实 AppContainer 管道、软件 TLS 证书/主机名认证、错误服务器身份及原资源处置；不发送应用请求。

这两个有限阶段的磁盘余量保护为512 MiB；完整 fetch/test/build 仍为2 GiB。有限阶段失败或空间停止不算通过，夹具及模块通过也不能证明完整 Codex、登录、模型、Skill、费用、物理配额或 S1。

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
