# 专用固定卷实际准备与原身份恢复

接续 `79afdee`。用户扩容后本机 C／D 空间已足够；本批完成专用 R: 固定卷的实际准备与独立 OS 核对，不代表全部 Runtime 可写根、账户、登录或 S1 已通过。

## 实际失败与修复

首次经管理员执行已有准备脚本，保存了原意图、命令和 DiskPart 输出；终态失败，没有镜像或 R:。实际根为 `C:/ProgramData/CimiLoopPhysicalQuota/6ebc38ed-f481-4a21-808b-cf7336045020`。原命令文件为 UTF-16 LE BOM；本机 DiskPart 返回0但只有启动信息，未解释命令。该失败目录及全部原件保持。

对同一 `list vdisk`／`exit` 只读脚本作实际管理员对照：UTF-16 返回0、输出113字节，仅启动信息；ANSI 返回0、输出172字节，实际报告虚拟磁盘列表并退出。没有创建／挂载／格式化命令。原始诊断位于本机构建根 `C:/CimiBuild/cx-5d37e2/fixed-volume-encoding-diagnostic-20261028-01-*`。两次脚本间隔16秒，遵循 [Microsoft 的 DiskPart 脚本说明](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/diskpart-scripts-and-examples)；编码故障结论来自本机实际对照。

准备脚本改为取得系统实际 ACP，严格编码无 BOM 的命令字节；路径无法表示时在磁盘操作及新目录创建前拒绝，不以问号替换路径。独立复核另发现 UTF-8 原意图和 ANSI 原命令的中文读取问题，分别用反例复现后修复；旧 UTF-16 BOM 原命令仍能精确核对。

新增显式 `-ResumeRoot`，仅恢复镜像尚未创建的同一原准备：核对管理员保护的原目录、原用户、原盘符、原容量、完整意图字段及命令。镜像、完成回执或既有恢复登记任一存在时拒绝；不恢复部分创建的磁盘、不重新格式化既有卷、不自动重试。原意图、原命令及原输出均保留，恢复另存三份原字节摘要、命令、输出及退出结果。该入口不是对其他历史 Unknown 的清理证明。

## 实际恢复与独立读取

按原目录显式恢复，管理员进程17080已结束，退出0。原路径的固定镜像成功创建、连接、分区、NTFS格式化并分配R:；独立磁盘／分区／卷对应关系核对成功后，脚本才通过稳定卷 GUID 设置 ACL。`prepared.json`、`resume-before-image-intent.json`、`resume-diskpart.txt`、`resume-diskpart-output.txt`、`resume-diskpart-result.json` 均保存在同一原根。原首次失败文件没有覆盖。

当前实际镜像最大容量4,294,967,296字节，NTFS卷容量4,292,866,048字节。再由产品的独立只读 Windows 读取器核对镜像物理身份、VHD标识、固定类型2、物理分配、卷标识／序列号和对应磁盘分区范围，连续两次一致；收据为本机构建根 `fixed-volume-observation-20261028-01.json`，读取器原件在 `fixed-volume-observer-20261028-01`。没有向读取器加入创建／挂载／格式化能力。

这只证明本次专用固定卷准备及独立观察，不证明仓库、数据、程序、工具、登录及全部历史写根已经绑定该卷。`runtime_scope_proven` 仍为false；后续经现有正式同卷安装入口取得原能力，不能把本记录复制成运行授权。

## 验证与下一步

- 实际只读 DiskPart 对照及上述真实管理员恢复均完成；所有原材料保留，不创建第二个镜像，不删除历史资源。
- `fixed-volume-prepare.test.ts` 完整11项通过、0失败、0跳过；覆盖严格编码、ASCII／中文原意图、旧UTF-16／新ANSI命令、原用户／命令变化、镜像／恢复已存在及额外字段拒绝。初版缺功能失败、第一次修复7通过1测试构造失败、中文意图及ANSI命令两条反例分别失败，均保留报告；最终以 `codex-2026-10-28-fixed-volume-prepare-reviewed.json` 为准，不累加成一次结果。
- 本批类型检查与差异检查通过；定向独立复核指出的两个编码P2已修复并复核关闭。它不是最终Matt／Superpowers评审或完整S1。

用户已选择真实普通需求“工作台原运行列表按状态筛选”，后续在同卷独立Git工作区实施。该选择不是正式前置澄清、约定或计划批准。本批未调用模型、不读或复制登录令牌、不创建业务Plan／Task／Run、不释放费用或Unknown、不迁移Schema242／库10／Host1、不push；六份既有未知文件保持。费用控制和认证账单、完整恢复来源、真实方法资格、真实Human／Matt澄清、最终业务交付及全部五组验收继续。
