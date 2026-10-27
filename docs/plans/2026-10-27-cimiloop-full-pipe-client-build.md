# 私有管道客户端完整构建续接

接续 `3fdaca3`。完整客户端是正式 Native／模型执行的前置条件；模块与传输夹具通过不代表完整客户端已能运行。本批先解决自有构建空间与 `.1`／`.2` checkout 选择，再按固定上游、锁文件、原 Job 与源码后验尝试完整 `.2` 构建，不放宽生产门禁或依靠历史程序版本。

## 本机空间与原缓存

只读核对确认本机只有 C、D 可用文件卷，初始空闲约 C396MiB／D54MiB；没有其他构建卷。已确认本批私有构建根 `C:/CimiBuild/cx-5d37e2` 的既有模块阶段均已终止且资源 disposed。三个自有编译缓存共约4.3GB、此前未压缩：target、Cargo registry/src 与私有 Rust1.95工具链；source、stages、原执行资料、登录和 Temp 不在本次选择内。

单个62MB starlark缓存试验以 NTFS普通压缩保存到约25MB，释放约37MB；SHA256、设备／文件ID、出生时间、修改时间、长度与单链接数均保持，未增加reparse属性。随后只对本批三个固定缓存目录内的普通单链接文件压缩，别名／链接跳过；对target目录设置新文件压缩继承。最终69,539个文件的完整字节摘要、原文件身份与mtime逐份一致，跳过356个别名／链接条目，删除文件0。新工作树及来源测试同时占用空间后，C盘净空闲仍由约451MB增加到约2.272GB（2.116GiB），净增加约1.82GB。原before清单、compact日志和最终结果保留在私有构建根，前缀 `cache-compression-20261027-`。没有挪动现场或清理旧 Unknown。

## 完整源码目录选择

实际启动反例 `pipe-client-source-red-02` 在任何编译Job启动前拒绝：格式2运行器仍把 `.1` 的 `source` 当作完整 `.2`，报固定源码不符。不是实际SDK／模型失败，也没有重开原操作。此前一次路径拼写不符发生于配置读取前，不算该反例。

运行器现按已验证工具配置选择固定目录：格式1的完整阶段仍用 `source`；格式2的完整阶段改用 `source-pipe`，前后校验与Cargo工作目录使用同一个选择。模块夹具维持从原固定Git对象构造新阶段的流程。原 `.1` checkout、配置及阶段保持，不原位升级。

`.2` 新工作树固定上游 `c1382380de69521303b416720a52f42d51af6248`，两份 reqwest 原归档认证后实际准备和核对107份修改／新增来源材料。旧 `.1` 的6份材料在新工作树准备前后相同，原收据和原checkout保留。这里107份为完整工作树补丁材料，和上一批模块夹具169份编译材料范围不同，不混算。

完整构建仍要求2GiB实际空闲保护，离线／锁文件、原Job子树及源码后验均保持；空间停止、编译失败或资源不明不算成功，不自动重复启动。

## 验证与剩余条件

Node24.22.1／pnpm12.4.2 的 `pnpm check` 通过；`node --check scripts/codex-appcontainer/run-build-stage.mjs` 与diff检查通过。指定实际固定上游及两份认证归档后，`node --test scripts/codex-appcontainer/pipe-source.test.mjs` 为4通过、0失败、0跳过，覆盖旧 `.1`、双HTTP／WebSocket来源、归档字节变化拒绝、模块源码／依赖漂移拒绝；仅为来源验证，不是完整程序或模型验收。

`pipe-client-full-01` 已从独立 `.2` 源码进入实际完整 Cargo 编译，保持 `--release --locked --offline`、原两个目标 `codex-cli/codex` 和 `codex-code-mode-host`。日志显示路径兼容、reqwest、HTTP、网络与协议等编译已启动；不能据“Compiling”逐行算包成功。空闲再次跌破2GiB时原取消触发，阶段终态code125、stopped=true；原Job资源读取为disposed／resources_disposed=true、active_processes=0，原结束登记为cancel_requested。107份来源材料前后版本均 `.2` 且完全相同，没有源码后验错误。没有把阶段当成成功，也没有因观察超时新开同一Job。

本机完整记录在 `C:/CimiBuild/cx-5d37e2/stages/pipe-client-full-01/`（result、stdout／stderr、原Job与前后源码）；源码准备对照在 `source-pipe-receipt-01/`。本次故障直接依据为空间保护，不用它关闭此前rustc访问冲突，也没有禁用系统组件。空间保护后不重复启动；新的空间条件或另一台Windows builder落实后再使用新阶段，并保留本次原件。

完整CLI和code-mode-host尚未构建成功，版本／空登录stdio初始化未运行，不能采用target中旧产物或把跳过当通过。本批不读取既有登录、不发送模型请求、不安装默认Provider。继续完整构建建议先提供至少10GB可用空间；2GiB是停止缓冲线，不是保证完整编译的容量估计。另一台builder按构建指南新建实际私有根，不能复制当前绝对路径当安装配置。

完整S1五组仍需实际账户／账单、全写根物理配额与历史容量、完整异常矩阵、真实Skill／Human／Matt、默认工作台业务链、普通Change到ReadyForDelivery、接入指南实走及最终独立评审。Schema242／项目库10／Host1保持，不push、不处理六个既有未知文件及旧Unknown。
