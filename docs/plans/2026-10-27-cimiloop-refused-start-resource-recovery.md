# 原 Codex 启动拒绝后的资源核对

接续 `4744c82`。本批交付启动握手失败后的资源回收与只读核对；正式 Runtime、模型联网及全部五组 S1 仍未完成。

## 当前行为

原代理已创建，但模型尚未获得恢复执行许可、也未保存 `started.json` 时，握手失败不再只关闭 Job 句柄并留下无法核对的授权。原监督进程先终止原 Job、实际查询整个子树为空，停止原网络 broker，关闭原卷元数据句柄，核对原程序和写根，再移除本次 Profile 的原授权并删除该 Profile。每一步都成功后，另存 `start-failure-resources.json`；任何一步失败只保存固定字段的清理错误，不能生成成功回收证明。

监督器在代理仍挂起时捕获 PID、创建时间和程序身份，避免进程已退出后查询映像失败而丢失资源回执。原调用宿主观察到监督进程关闭后，将失败记录和资源回执的字节摘要、物理身份登记到原 Host1 的独立命名空间。查询核对原准备票据、配置、固定监督器、两个原进程身份、失败记录及完整回收回执；同字节物理替换仍拒绝。

共享原模型资源查询因此可以返回 `resources_disposed:true`，同时保持 `completion_proven:false` 和 `costs_reconciled:false`。不保存模型成功封口，不产生业务终态、不释放业务预算，也不重开原 Run。重复 execute 仍返回原 pending；查询本身不补建 Host 登记。如果宿主在失败回执登记前退出、原件缺失或任一步清理不成立，保持 Unknown，不能把本机找不到进程当作已回收。早于代理身份捕获的失败及已有历史 Unknown 不由本批补证。

模型原件采集同时保留失败、失败回收及清理错误这三类现有文件的原字节，使后续原操作采集不漏掉启动失败材料。采集材料本身不授予完成、费用或恢复资格。

没有升级 Schema242、项目数据库格式10或 Host1；增加的是新原件和现有 Host1 的独立登记。历史已完成执行继续使用自己的原 started/end 及原监督器，不更改其权限策略。

## 验证范围

本批提交从工作区中按明确变更暂存，未将尚未完成的 `explicit_package_access`／launch9 默认接线混入提交。使用暂存源码的独立验证副本执行实际 Windows／AppContainer 原代理、Job、原 Host1 和原资源读取器；依赖沿用本仓库锁定版本，未复制登录。验证副本仅用于复验本次提交，不能作为生产安装。

最初两个 Native 反例在缺少读取器时失败。初版修复又因退出后的代理映像查询失败而没有完整回执；调整为挂起时捕获身份后，两种工作区隔离模式的启动拒绝回收通过。上层反例最初错误地给程序包加入前缀参数，被既有程序包门禁拒绝；改用固定摘要的 PUBLIC 非可执行文件，让 Windows 实际拒绝模型创建，验证原 Runtime 的资源查询与重复派发保护。

提交源码的独立副本：三个完整文件按各文件最新结果共10项分轮通过，0失败0跳过，覆盖原出口拒绝、SNI拒绝、原取消、五种既有组合及新增启动拒绝回收。首次独立副本缺少包级依赖链接，只有两个文件4项通过，另一个文件加载失败；补上指向现有锁定依赖的链接后，该文件6项通过。随后仅修改失败查询返回字段与核对顺序，受影响的 prestart 用例再次通过，其余5项未重跑；不能称最终源码单轮10项全绿。独立副本类型检查通过，工作区 `pnpm check` 通过。

采集文件列表补齐后，另选 SDK 模型桥的两个历史登录／原 Job 用例复验：2项通过、62项未选择，不算该文件完整通过。最终暂存源码的 Runtime-adapter 源码及这四个测试文件整体类型检查通过。环境为 Node24.22.1／pnpm12.4.2。

原报告保存在本机忽略目录 `.cimiloop`：`codex-2026-10-27-prestart-recovery-red.json`、`prestart-recovery-native.json`、`prestart-recovery-cleanup-diagnostic.json`、`prestart-recovery-native-fixed.json`、`prestart-runtime.json`、`prestart-runtime-refused.json`、`prestart-runtime-custody.json`、`prestart-index-native.json`、`prestart-index-confinement.json`、`prestart-index-final-custody.json`（后九项同日前缀）。这些原件不随 Git 迁移；失败现场保留，不认领或清理历史 Unknown。

补充采集复验报告为 `codex-2026-10-27-prestart-index-model-collection.json`。

这是受控程序和 PUBLIC 卷观测下的恢复验证，没有真实模型、登录、账单或实际 VHD 准入；不是全仓测试或 S1 验收。本批没有发送模型请求或付费请求。默认不 push。

## 继续实施

工作区另保留新包权限策略的未完成实现与正向失败反例。本机新模式已能启动代理、读取原控制帧，但 TCP socket 构造返回10013，尚未启动模型；不是端口冲突或 bind/listen 已完成。未添加广泛网络能力、全局 ACL 或 loopback 豁免，不能把本批的失败回收成功当作联网修复。

继续完成模型传输及正式 Runtime 四类控制来源，补齐费用与完整恢复，再推进真实 Skill／Human、默认 CLI／工作台实际执行、真实普通 Change 到 ReadyForDelivery、接入指南实走及最终 Matt／Superpowers 评审。官方源码兼容客户端的本机构建故障、管理员固定卷准备、磁盘空间和真实账单仍是独立条件；本批不改变这些结论。
