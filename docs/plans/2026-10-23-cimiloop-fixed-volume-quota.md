# 原固定容量卷与独立物理配额核验

基线`12ba99a`。完整S1五组保持。核对Context前准入时确认：Kernel完整资格仍缺network_host_limits、cost_accounting_and_cap、disk_limit、crash_recovery四项；不能用上一批容量预约或修改ALLOW字段填补。本批先提供实际磁盘硬边界及可操作管理员安装步骤，再继续完整准入组合。

采用专属固定VHDX和独立NTFS卷。安装只创建新的镜像与新卷，不格式化已有磁盘、迁移用户库、清理历史资源或自动重挂Unknown卷。运行时读取Native API：镜像固定类型与虚拟容量、镜像物理身份、虚拟盘GUID、卷GUID／序号、NTFS容量和卷物理盘extent，核对该卷实际来自该镜像而非同名普通目录。重新挂载后的物理盘编号可变，原盘／卷身份及容量不能改变。

1. 先以失败反例验证：普通目录、非VHD文件、错误盘根、无界容量及JSON标志不能成为物理配额证明。
2. 实现只读Windows原生查询及Host1不可变政策登记／重开／路径核验。保留缺失、替换及权限错误，不自动修复或覆盖政策。
3. 准备显式管理员安装脚本，仅针对新镜像分配未占用盘符；持久安装意图和完整原输出，不提供删除、detach或clean命令。普通权限执行在任何磁盘效果前失败。
4. 验证C#实际编译／原生负向、解析／原政策反例、类型、脚本语法及文档，完成独立复查和本地提交。实际正向安装、满盘拒绝及Native业务路径须在管理员准备后执行；缺失不能算通过。

卷边界本身不代表Runtime所有可写路径都已接入，也不产生Provider批准、费用账单、Skill方法资格或S1完成。项目库10、公共Schema242、Host1保持。

## 实际实现与验证

`FixedVolumeQuota.cs`只导入读取API。查询器通过现有原构建保管固定编译器、源码和产物，不信任手写的build.json；执行前后重核原二进制并拒绝旁置CLR配置。原镜像句柄不共享删除；返回前重开路径核对文件身份，并重核虚拟盘、当前挂载卷和extent。政策通过Host1原不可变独占票登记，重开不能把R盘政策指向S盘，也不能用无关Host票或外部JSON reader充当政策。

管理员脚本默认为无效果预览。显式`-Execute`先检查管理员令牌、Storage命令、未使用盘符及ProgramData直接子目录保护；镜像保留于管理员拥有的目录，普通Runtime用户只读。仅新建固定镜像、分区和NTFS卷；设置卷权限前由OS重新核对image→disk→partition，并通过卷GUID路径设置ACL。失败保留原意图和输出，不重试、卸载、清理或覆盖。脚本尚未实际管理员执行，其正向可用性不能由语法或预览证明。

本机Node v24.22.1、pnpm12.4.2。分阶段五个整文件共42项通过、0失败、0跳过：原构建保管11项、原启动账本13项、卷政策13项、实际Windows只读原生查询3项、实际Windows PowerShell权限掩码／无效果预览2项。政策OS观察为PUBLIC投影；原生3项验证实际编译及拒绝普通文件、错误参数和旁置CLR配置，均非正向卷验收。`pnpm check`通过。普通令牌显式执行脚本在任何目录／磁盘效果前拒绝，保护父目录前后均不存在。

新增`tests/scenarios/fixed-volume-quota.test.ts`要求显式提供已准备卷的`prepared.json`，核对真实固定VHD/NTFS后，只在新建独占目录写自有filler，要求实际ENOSPC；finally通过原文件句柄截断自身filler，不按路径删除任何文件，不调整VHD容量。证据保留到新的仓库外目录。当前未配置专用卷，该文件1项跳过、0项通过；实际创建、满盘拒绝和恢复仍待执行，不计入42项。

初始失败原件均保留：新增API缺失、C#局部变量未初始化、R政策错绑S卷分别先失败后修复；静态复查发现的镜像替换窗口和ACL复合Modify误拒绝合法只读权限已关闭。PowerShell子进程测试起初继承大小写重复的PSModulePath而无法载入系统模块，测试现只传唯一系统模块路径，未修改机器环境。独立复查最终无新增必须修复项，范围仅静态审查，不是Matt/Superpowers行为验收。

接续先按[接入指南](2026-10-16-cimiloop-S1-接入指南.md)由管理员准备新的64MiB专用测试卷，再以普通用户执行显式正向场景；随后把全部Runtime写路径、Context前准入和完整资格接到同一真实边界。当前`runtime_scope_proven:false`保持，不修改旧原件或把容量预约等同于费用结清。本批无模型请求。

依据：[固定／动态VHD类型和容量](https://learn.microsoft.com/en-us/windows/win32/api/virtdisk/ns-virtdisk-get_virtual_disk_info)、[原虚拟盘物理路径](https://learn.microsoft.com/en-us/windows/win32/api/virtdisk/nf-virtdisk-getvirtualdiskphysicalpath)、[只读查询参数](https://learn.microsoft.com/en-us/windows/win32/api/virtdisk/ns-virtdisk-open_virtual_disk_parameters)、[卷extent](https://learn.microsoft.com/en-us/windows/win32/api/winioctl/ns-winioctl-volume_disk_extents)、[DiskPart指定新卷盘符](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/assign)。
