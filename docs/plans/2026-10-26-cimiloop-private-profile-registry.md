# 新建 Agent Profile 的注册表写入边界

接续 `b9559513fbba94937a33966e4ba32fc44277845f`，完整 S1 五组保持。当前已实现的文件 Profile 保护没有覆盖 AppContainer 私有注册表。即使运行数据与登录目录放在固定卷内，子进程仍能将数据写入系统用户注册表，因此不能凭文件路径或目录容量宣称全部写入已受物理配额约束。

## 已确认的问题与实现

真实 Windows AppContainer token 反例确认：已有文件写入保护生效，但私有注册表的写值、新建子键、修改已有子键值、删除子键、修改 DACL 五种操作全部成功。原失败报告和新建 Profile 的原件保留；该证据仅针对本次自有 Profile，不处理历史 Unknown。

`AgentProfileStorage.ProtectRegistry` 从刚创建且仍挂起的子进程取得 token，先核对其 AppContainer SID 与本次新 Profile 一致，再临时模拟该 token，通过 Windows `GetAppContainerRegistryLocation` 获取实际私有根。恢复宿主身份后，对根及已有子键移除 Package／Capability 的可写授权，保留只读，并用 OWNER RIGHTS 只读规则阻止隐式 WRITE_DAC。最多处理 256 个键，逐键读取并在全部完成后复核。任何读取或权限配置失败都不能恢复子进程执行。

控制器先将新子进程物理身份写入原资源账本，再保护注册表，随后才公布 suspended 原证明与接受 resume；没有按 SID 拼接用户 hive 路径，没有给运行进程新增注册表代理或可继承的可写句柄。新原件继续固定 helper 源码、编译配方和二进制；历史原二进制、原调用、Run 和资源状态保持，不重编译丢失的旧 helper。

这落实新建 `private_state_only/1.0.0` Profile 的缺失部分，不修改公共 Schema242、项目库10或 Host1，不自动迁移用户库。旧配置／旧 helper 没有本批注册表效果证据，不能据同名策略升级为完整资格。

测试使用生产保护组件及真实 AppContainer token，先创建 PUBLIC 值和嵌套子键，再验证五种写操作均拒绝、原值可读、固定私有 state 可写。额外检查错误 SID 和普通宿主 token 均拒绝，并确认模拟后恢复宿主身份。测试中第一次修复后的运行遇到 .NET 对子键拒绝抛出 `SecurityException`，已将该明确的权限拒绝加入 canary 捕获；原失败报告保留，没有放宽产品 ACL 或成功条件。

随后新增宿主 token 反例发现：普通 token 没有 AppContainer SID，旧读取会以参数异常拒绝，缺少明确类型检查。现先验证 TokenIsAppContainer，再核对非空的原 SID；普通 token 在读取注册表前明确拒绝。首次八文件为104通过／12失败／0跳过，其中11项失败发生在原构建夹具的收尾路径比较：本次 TEMP 使用正斜线而 `dirname` 返回反斜线。只将子进程 TEMP／TMP 改为同一个实际目录的 Windows 规范写法，未修改既有测试判据或清理历史目录。修复后两个完整文件12项通过、0失败0跳过；其余结果另取最终冻结回归。

Windows API 依据：[GetAppContainerRegistryLocation](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-getappcontainerregistrylocation) 返回当前或所模拟身份的注册表存储。本文没有据该 API 推断完整宿主所有写路径均已验证。

## 本机复验与剩余条件

2026-10-26 已按锁文件安装依赖；Node24.22.1／pnpm12.4.2，`pnpm check` 通过。远程 `main` 实时只读查询仍为交接提交 `e789902379534c6e36ea6ebc14266ed5167b761c`，已有未跟踪文件保持，默认不 push。

改动前，`agent-host-model-runtime.test.ts` 完整4项通过、0失败0跳过：实际 SDK、读文件、固定 Node 检查、原 Run 重放和取消均按测试断言执行。该文件使用构造模型／资格，不能当作真实模型或 S1 证据；本次通过也不关闭历史 Bun／LHShield 启动故障。

第一次修改后的 SDK 整文件4项通过；期间补了普通 token 的明确类型核验，因此该轮不称为最终源码全部验证。冻结后八个受影响完整文件116项通过、0失败0跳过。

冻结后的 SDK 整文件为3通过／1失败／0跳过：`private storage=false` 的旧配置场景完成两轮模型步骤后触发原 Task 180秒累计期限，未达到原断言的三轮。独立读取原时钟锚、原进程创建时间及清理回执确认，创建 Native 前已消耗111671ms，最终在原单调期限后89ms停止，`resources_disposed:true`；没有延长期限、重开该 Run 或结清预算。新配置的完整执行、取消及缺准入拒绝均通过。并行负载是否导致这次耗时尚未证明；停止其他测试后以同一冻结源码、原期限和完整文件做一次串行对照，不能以对照通过抹去本次失败或宣称稳定性问题已关闭。

串行对照最终4项通过、0失败0跳过，原 Task／Native 时限及产品判据未变。最终分阶段取九个完整文件共120项通过、0失败0跳过；此前3通过／1失败的报告继续独立保留，期限与历史启动稳定性问题保持未关闭。未运行全仓测试。

`resume-oct26-validation-summary.json`独立核对前后三份源码摘要一致、最终 SDK 四个新夹具归属及时间范围、三个实际 Native 操作的清理回执，并逐一核对真实编译留存的两份生产 C# 源码与本次冻结源码完全相同。普通启动／新 Profile 启动／原等待取消的三次原资源均有`resources_disposed:true`、空清理错误；第四项在 Native 前拒绝。这不扩写为其他历史资源已清理。

最终`pnpm check`、编译 CLI 与工作台帮助、文档 UTF-8／围栏／链接及`git diff --check`通过。此次未读取或复制登录凭据、未发真实模型请求，也没有管理员固定卷／账单／真实 Skill验收。下一步仍需把正式完整资格、默认宿主与真实执行连成生产路径；本批不提供新的 Provider 批准开关。

剩余生产代码包括完整资格与默认装载、真实方法原件读取和费用核验；真实固定卷／登录／账单、Human 原回答、普通 Change 到 ReadyForDelivery、完整异常恢复及最终 Matt／Superpowers／S1 验收仍未完成。本批不能代替其中任何一组的正式验收。C盘空间已恢复，固定卷 prepared.json 尚未提供；不将系统盘有空闲视为物理配额验收。
