# Codex 低盒路径兼容与固定源码构建

接续 `928285e`。本批解决正式 Codex 客户端在 AppContainer 中解析实际授权路径时遇到的具体兼容问题，并把固定源码的构建方法留在仓库。完整五组 S1 仍 active；生产宿主继续缺费用、完整物理配额和完整恢复三个来源，未安装执行适配器。

## 执行路径

本机真实观察为：目标目录的 READ_ATTRIBUTES 和 NT 路径查询成功，DOS／GUID 路径转换 error5；Rust canonicalize 因此失败。仅改为重新打开卷根的第一版 Rust 兼容函数仍失败，因为同一 AppContainer 对卷根 access0 的自行打开也被拒绝。失败原件均保留，不能从后续成功反推此前失败已成功处置。

新策略 `original_volume_handles/1.0.0` 由原监督器从实际模型程序、cwd、helper、授权写根和 SystemRoot 导出最多8个本地卷根，打开 access0 的元数据句柄，并核对实际物理身份与 NT 卷名。标准输入输出及这些句柄通过精确 handle list 继承给代理及实际模型；不继承监督器 Job 句柄。保留变量 `CIMILOOP_CANONICAL_ROOT_HANDLES` 由监督器覆盖，旧路径明确清除。Job 清空后再次核验原句柄和当前盘符对应关系，关闭句柄后记录 `volume_handles_closed:true`。

模型内的 Rust 兼容函数只在原 canonicalize 返回 error5 且真实 token 为 AppContainer 时进入。目标必须成功打开 READ_ATTRIBUTES，实际 NT 路径必须落在对应原卷内；重新读取持有对象后才还原 DOS 路径。映射缺失、非法、跨卷或查询不完整时保留原 error5，不用 absolute 字符串冒充 canonicalize。不扩大文件 ACL、token、网络权限或全局 DOS 映射。

普通 Agent、Skill 子执行、具名方法探测和 Runtime 技术契约四处默认组合均选择该策略。它要求同时具备原程序能力、受控出口、bounded Job 和原固定卷能力；不接受导入 JSON 作为能力。方法 start16、模型 header35–37、Native launch8／start7／end7记录新策略和实际句柄原件；原件读取器保留旧版本原义，不给旧操作补写新证据。Native 构建配方4包含第六份源码 `CodexPathRoots.cs`。Schema242、项目库10、Host1不变。

## 本地兼容客户端

官方 npm 0.162.0 二进制不消费这组元数据句柄，因此需要从明确固定的官方源码构建本地兼容版本。上游 commit 为 `c1382380de69521303b416720a52f42d51af6248`，对应 tag `rust-v0.162.0`；本地身份为 `0.162.0+cimiloop-lowbox.1`。不修改现有 Codex 安装，不称其为原官方二进制，不复制现有登录。

仓库中的[源码准备和构建指南](../../scripts/codex-appcontainer/README.md)给出独立目录、工具链、固定来源、构建、离线初始化步骤。`prepare-source.mjs` 只接受固定提交，初始脏源码拒绝，verify逐份核对固定补丁和额外变更。六个上游文件变化明确可查：workspace及161个本地 lock 版本、兼容函数、absolute-path包装、home-dir及config调用。外部依赖的版本、source和checksum不变，不重新生成整个lock。

可移植构建运行器清空继承环境，只设置私有用户／Cargo／Rustup目录，从私有 MSVC 准备原件白名单读取构建变量。每阶段由原开发 Job 持有完整子树，空间低于2 GiB时取消原 Job；阶段名不可覆盖，日志、源码前后核对及原资源处置保留。这是开发构建 Job，不作为模型隔离、费用或生产资格证据。

## 实际验证

- 真实 Windows 元数据用例：1通过，无跳过。原实现先失败，新实现核到实际 NT 卷名、目录枚举 error5、外来变量被覆盖及句柄关闭。
- Rust 兼容五场景：directory、junction、missing、outside、invalid，完整文件5通过、0失败、0跳过。实际 AppContainer／Job；outside独立核读内容被拒绝，不把能查询元数据当作能读取文件。
- 上游 absolute-path／home-dir 两个完整 Rust lib 测试：22＋4＝26通过、0失败、0忽略；使用当前兼容函数和原继承句柄策略。
- 可移植入口已实际执行 MSVC 环境准备及 Rust 1.95.0 版本查询；两阶段 code0、原 Job disposed，无模型请求和凭据读取。
- 默认父组合、默认 Skill 子组合与五种新旧 confinement 组合三个完整文件集中执行17项全部通过、无跳过（9／3／5）；包含 start16／header35–37、原控制读取、旧版本兼容及原请求重放不再启动进程。上层固定卷及模型响应为明确 PUBLIC 投影，不能当作真实 VHD／账户／模型证据。
- 合并上述最新完整文件，五个相关 TypeScript 测试文件共23项分轮通过、0失败、0跳过；不是一次五文件整轮。最终 `pnpm check`、两个脚本语法检查、`git diff --check` 通过。Node24.22.1／pnpm12.4.2。另26项上游 Rust 测试、两个可移植工具阶段分别计，不重复累计。
- 完整客户端首轮构建失败：`regex` 编译的 rustc 退出 `0xc0000005`，原 Job disposed。相同来源及参数的新阶段已越过该依赖并继续；未稳定复现，不宣布编译器崩溃已修复。
- 完整客户端的最终构建和空登录初始化尚待结果，不能用独立 Rust 函数成功替代。

本机原件保留在仓库外本批私有构建根；`.cimiloop` 的结构化报告为 `codex-2026-10-27-path-roots-native.json`、`codex-2026-10-27-canonical-compatibility-native.json` 和 `codex-2026-10-27-path-composition.json`，按命令记录实际范围，不作为可移植生产材料。完整客户端仍无成功构建／初始化结果，先前官方客户端初始化失败不被本批局部通过覆盖。没有全仓测试、真实模型或 Skill、费用账单、真实普通 Change 到 ReadyForDelivery、最终 Matt／Superpowers 或完整 S1 验收。旧六个未跟踪文件未读取、暂存或删除，历史 Unknown 未处理；默认不 push。

## 后续主链

先完成兼容客户端实际初始化，再用正式来源接账户、物理配额、原操作恢复及真实技能路径。完整费用和账单来源、全部 OS 写路径／历史容量、启动／崩溃／恢复矩阵仍须实装并真实验证。不得因为本批路径兼容或局部测试通过，改写三项为 supports 或放行默认正式宿主。
