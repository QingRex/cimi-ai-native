# 实际 SDK 的显式包权限策略

接续 `53ff385`。本批把上轮已实际验证的共享包 opt-out接入实际SDK执行进程，不只留在技术边界验证中。完整五组S1保持active，模型代理、费用及完整恢复仍待接续。

## 执行与兼容

新执行选择 `private_state_only/2.0.0`，实际创建进程时设置 `PROCESS_CREATION_ALL_APPLICATION_PACKAGES_OPT_OUT`，并仅增加固定 `registryRead`只读能力以支持本机Winsock／安装信息读取。当前Profile文件／注册表保护、原Job／SID／标准句柄／原Task期限、Bun解释执行及固定SDK权限保持。ProgramData、包TEMP和用户目录均准备在原state内；不修改全局ACL或增加网络能力。

已有profile1仍保留其历史含义；新profile2通过原config／input字段显式绑定，字段不一致、未知值或旧格式混入均拒绝。内部config14–18分别保持既有工作区／父Skill／具名方法权限含义，profile2不是将旧profile1重解释。为隔离旧读取器，新操作登记claim4，旧claim1–3按保存的原输入和原字节读取，原登记不改写。查询、模型原件核对、采集容量及恢复读取器均接入claim4；响应丢失仍查询同一原Run，不重开操作。

本批不会给未安装的原Codex登录／账户或PUBLIC模型头补造真实资格。磁盘来源读取器已经要求SDK profile2，本批接通这一实际路径；模型代理的write-scope尚无同等opt-out原件，所以磁盘完整覆盖仍不成立。费用、完整异常恢复来源缺失，正式执行适配器继续不安装。

## 实际验证

两个新反例在旧实现均失败，27项未选择，不能当完整测试通过。修复后四个完整文件83项通过、0失败0跳过：输出／启动策略10、原Job契约19、真实编译的Native配置校验28、历史父原操作恢复26。Native配置测试仅反射调用生产校验代码，不冒充已运行SDK或真实模型。

随后增加claim4实际原登记／config／input恢复反例，完整恢复文件27项通过；同一claim4在Native登记缺失时维持Unknown，不产生进程，profile2改为profile1会拒绝，原claim字节不变。最终按完整文件最新结果为四文件84项分轮通过，不重复累计被替代的26项结果。

实际SDK场景选择 `private storage=true` 的完整用例：1通过、0失败、另3项未选择；不能称该文件全过。真实Windows／AppContainer／OpenCode SDK／IPC／文件读取／固定Node检查及当前Kernel／HTTP均实际执行，原宿主模型回合3次、工具交换5次，原模型／Native／IPC闭合，原Run再次start不重复派发。新claim4／profile2核对成功，结束原件phase ended、reason exited、exit0、resources_disposed true、cleanup_errors为空。HTTP对PUBLIC Codex资格依旧拒绝，两次请求保留原Run与预算；不把PUBLIC模型头当作真实模型原件。

类型检查通过，Node24.22.1／pnpm12.4.2。真实Codex／具名方法场景的预期已同步到新profile2，但本批不因改了断言就声称运行了这些真实模型用例。原报告为 `.cimiloop/codex-2026-10-27-sdk-explicit-package-red.json`、`sdk-explicit-package-contracts`、`sdk-profile-two-recovery`和`sdk-explicit-package-native`（均同日前缀、json后缀）；失败及未选择项保留，不覆盖旧失败，不更新用户数据库，Schema242／项目库10／Host1保持。

本机剩余磁盘较低，不做完整Rust构建或重复大批复制；旧未知文件／Unknown资源和旧六个未跟踪文件保持。默认不push。客户端构建故障模块及管理员条件见上轮[实际失败记录](2026-10-27-cimiloop-codex-disk-source-and-private-boundary.md)，仍需处理。

## 后续

继续把同等策略接入Codex代理及模型后代，并为新原件保留显式历史兼容；用原模型Job的实际限制和完整当前写根核对接通磁盘来源。完成账单／预算和恢复来源后，继续真实Skill、Human澄清、默认工作台／CLI实际执行、普通Change到ReadyForDelivery、接入指南实走与最终Matt／Superpowers评审，不能缩小为本批SDK兼容完成。
