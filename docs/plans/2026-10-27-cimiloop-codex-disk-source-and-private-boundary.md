# Runtime 磁盘来源接线与共享包权限边界

接续 `34f4678`。本批继续把真实物理配额来源接入 Provider 评测及正式宿主，并修补技术契约边界进程的实际写入范围；不宣布正式 Runtime、完整物理配额或 S1 验收通过。

## 已接通的执行路径

`LocalCodexRuntimeDiskOriginals` 借用现有代码拥有的账户、固定卷及原登录目录能力，通过 `assertCodexRuntimeWritableStorage` 重查安装、账户、共享注册账本、工具、项目／数据及登录目录。它再逐份核对技术契约的原 SDK 配置、每次模型 Job 的原 quota/runtime 票据、实际写根和包存储限制，并在同次读取末尾重新核对来源及原件。目录列表不能由请求 JSON 指定，未知或变化拒绝，不创建卷、不修复原件、不删除历史。

全部历史位于同一有硬容量上限的原固定卷内才可能受到该容量约束；历史空间不会通过删除证据回收。读取器按最多32条路径分组执行当前 OS／原票据核对，不跨请求缓存。旧模型 confinement 声明、旧 SDK 私有目录配置或读到了 token 用量，均不能独自证明完整磁盘约束。

Provider 命令默认打开已安装账户／卷／登录来源，并在每次 await 后复查当前 Human 和原项目；撤权后释放本次借用账户，不写评测事实。已有 Kernel 原回执先重放，不重开来源工厂。正式宿主直接复用已借用的相同能力。网络与磁盘读取函数已登记，费用和完整异常恢复函数仍未实现，因此正式执行适配器仍不安装。磁盘函数即使已登记，当前真实 SDK／模型原件尚不具备下述完整策略，结果仍为 inconclusive；函数存在不等于条件已满足。

## 必要的共享包权限修补

发现仅收紧当前 AppContainer Profile 的文件／注册表权限仍不够：Windows 的 `ALL APPLICATION PACKAGES` 组可以接受外部资源授予该组的写权限。技术契约的版本进程及读／写边界进程现在显式选择 `--private-storage`，创建时设置 `PROCESS_CREATION_ALL_APPLICATION_PACKAGES_OPT_OUT`，收紧当前 Profile，并把 ProgramData、包 TEMP 及用户目录放在原 state 内。未选择新策略的历史行为与原证据形状保持。

实际对照：只给 `S-1-15-2-1` 组授予写入的自有 PUBLIC 文件，普通 AppContainer 可写，新路径拒绝；授权 workspace 仍可读写，外部文件读写、子进程及本地端口访问仍被拒绝。所有授权仅针对本批新建文件／Profile，未改系统 ACL 或全局豁免。

本机 Windows19044 的 `TokenIsLessPrivilegedAppContainer` 查询返回参数错误；用组列表推断也不能可靠区分，两个失败尝试保留，最终没有把这些查询当作证明。启动属性实际设置成功及实际共享组写入对照分别核验。直接使用旧 .NET CLR 子程序在新 token 下退出，Node 也先因 Winsock 初始化10107失败；实际系统注册表 ACL 核到 Windows `registryRead` 能力只读入口，并用 `DeriveCapabilitySidsFromName("registryRead")` 核对 SID。新路径明确加入这一只读能力，不增加网络能力或写权限。

Node 脚本入口另因祖先目录 lstat 被拒绝，现直接执行仓库固定 PUBLIC canary 源码并保留来源字节及原 Node 摘要；不授祖先目录。只有完整功能用例正向、反向对照成立才算边界通过。技术契约实际选择新路径，原读取器同时检查版本、write/read三个原证明；旧证据不补写。

**尚未完成的接线：** SDK 执行进程仍是 `private_state_only/1.0.0`，模型代理的原 write-scope仍无共享包 opt-out证据。新磁盘读取器明确要求未来 `private_state_only/2.0.0` 和原模型 scope内的实际 opt-out字段；这两处没有因单独边界通过而自动升级。需要继续把同等策略接入实际 SDK／模型及其显式兼容原件，然后复验真实原操作。当前默认入口仍不能完成正式 Agent 业务执行。

## 构建外部条件

兼容 Codex 客户端第二次构建也已终止，`hybrid-array`处 rustc访问冲突；此前 `regex`已成功。Windows Application 1000／WER1001对两次退出都记录同一个实际加载模块 `C:\Windows\LVUAAgentInstBaseRoot\system32\MozartBreathCore.dll`、版本3.5.10820.500、偏移`0x1fdce6`。这定位到实际故障模块，但不证明该模块的具体兼容性根因、归属或已修复。两个原开发Job均实际 disposed。未禁用该组件、未改系统保护，也不循环重试构建来赌成功；已请求管理员处理或另一台Windows按固定构建指南产出。

本机当前非管理员，真实固定卷准备需要管理员执行已有精确脚本。现有历史 Unknown 不处理、不根据本机找不到推断已清理。构建产物、失败材料和验证原件保留在本批私有目录；磁盘空间已不足以继续完整构建，不能靠删除未知文件腾空间。

## 实际验证与边界

磁盘来源三个针对性反例旧实现0通过3失败、其余9跳过；这只证明旧实现没有执行新增核对，跳过不计通过。修复后来源完整文件12项通过；补充旧边界缺证据反例后13项通过。五完整文件集成30项通过、0失败0跳过，含原宿主不提前安装、Human await撤权及原回执重放；OS配额、SDK和模型原件在这些读取器测试中为明确PUBLIC投影，不是实际VHD或模型证据。

Native边界首版测试误用外部引用version查找sandbox_proof，两个失败均是测试错误；改为resource_type后旧实现1通过1失败，确认缺包存储原件。首版包保护四完整文件7项通过；补充共享组opt-out后新策略失败，以上具体系统查询／CLR／Winsock／lstat诊断全部保留。最终独立真实边界完整文件3项通过、0失败0跳过：含当前实际 OpenCode1.18.34 版本查询、write/read两种新策略边界，以及普通token与新token对照，无模型请求。单个早期通过不覆盖中间失败。

最终集中轮10个完整文件45项通过、0失败0跳过：private-probe-storage3、agent-private-profile-storage1、probe-authority4、runtime-contract-probe-authority1、codex-runtime-control-sources13、codex-runtime-control-open3、agent-production-host10、provider-command-sources3、codex-runtime-sdk-originals1、runtime-contract-local6。实际Windows边界和其余PUBLIC组合范围分别如上，不以总数冒充真实模型／VHD。新增完整OpenCode版本与两边界用例另在同源码完整文件3项通过；不重复累计。

最终类型检查、固定canary脚本语法及diff检查通过，Node24.22.1／pnpm12.4.2。结构化报告为 `.cimiloop/codex-2026-10-27-disk-control-final.json`、`private-storage-complete-probe`及各上述失败诊断（均同日前缀）；原失败没有覆盖。当前C盘剩约1.35 GiB、D盘约0.83 GiB，不启动新完整构建或大量复制夹具，不删除已有原件腾空间。

没有全仓测试、完整Native族、真实Codex初始化、现有登录读取、账单／模型／真实Skill／Human完整业务流程、ReadyForDelivery或最终Matt／Superpowers。Schema242／项目库10／Host1保持，默认不push，旧六个未跟踪文件不读、不暂存、不删除。五组S1目标active。

## 官方API依据

- [Microsoft：DeriveCapabilitySidsFromName](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-derivecapabilitysidsfromname)：固定能力名映射为实际SID。本机返回值及系统ACL已另作真实核对。
- [Microsoft：CheckTokenMembershipEx](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-checktokenmembershipex)：成员查询契约；本批没有用普通成员枚举代替实际共享组权限对照。

## 接续

下一步把共享包opt-out及必要registryRead能力接入实际SDK和Codex代理，保留旧原件语义。然后完成真实账单／预算来源及完整恢复来源，接正式Skill／Human、普通Change到ReadyForDelivery、接入指南实走和最终独立评审。管理员／构建条件缺失不扩大为独立代码工作的停止理由，也不能用PUBLIC资格绕过。
