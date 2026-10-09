# CimiLoop 原执行二进制保留与历史容量 v0.1

> 决策：D-248；范围：V1-09 原件保留及可执行 Runtime / 固定检查组合。本批不构成完整 S1 验收。

## 可用行为

Runtime 的 OpenCode 和固定检查的 Node 不再作为可自动重建的编译缓存。新执行原件放在宿主数据根的 `runtime-binary-originals/<sha256>/runtime.exe`。重复使用先核对摘要、字节数及物理文件身份，缺失、同字节替换或登记无法核验时拒绝；不从当前安装文件补回原件。

`runtime-binary-original-registry.json` 与 `runtime-binary-original-claims/<sha256>/reserved.json`、`retained.json` 位于二进制目录之外。登记固定数据库、目录身份及私有格式；每份资产以独占创建和文件 fsync 保留容量及物理身份。SQLite 同一写事务核对全部登记行、精确 DDL / 触发器与库外记录。删除行后恢复触发器仍会被识别，不会释放容量或再次复制。

新私有登记格式1上限为128种摘要、4 GiB已登记 / 保留字节，单资产512 MiB；容量检查先于复制。未完成登记、孤立库外记录及不一致状态保留 Unknown，没有自动继续复制、清空或删除资产的入口。该上限不计算所有磁盘开销，不是操作系统强制的物理硬配额；`physical_quota_enforced` 始终 false。

## 原操作与兼容

新 Runtime 把原件证明写入唯一 Run claim 的冻结输入，并产生私有 config5；发送 Native 启动资料前再次核验，查询 / 采集核对原证明。config1–4保持原读取语义；config5显式区分正式 Task 的 prompt / lifetime policy 与只读演练的两个 null。异常结果识别支持5并匹配原输入证明，仍仅证明负向执行事实，不确认成功或账单。

新固定检查 request3 使用 input2，原件证明和输入版本参与 `input_digest`，与 dispatch、capture、receipt 关联；外层证明必须相同。request3改成旧request1/2并移除证明不能绕过验证。原request1/2仅接受原精确输入结构；同call重放按原版本核对原摘要并返回旧回执，保持历史读取 / 原资源核对，不改写请求或补写新的保管证明。新调用只写request3/input2。

存在且匹配的旧 `tools/<sha256>/runtime.exe` 仅在原路径采纳，明确 `prior_custody_proven:false`；拒绝硬链接。旧路径或登记缺失不能证明旧操作未发生，也不允许恢复旧原件。D-244 已丢失的 KBbh4g 现场未恢复、未清理。本批未把 C# 控制器编译缓存和运输模块全部纳入保留，因此仍可能存在独立的控制器原件缺失恢复条件。

取消登记不要求原执行文件仍存在，也不在100ms监督周期重复做大文件摘要。原资源恢复以原控制器、配置与OS身份为准，不重新启动；缺执行二进制阻断结果证明，但不单独阻断原OS资源清理。控制器本身缺失、旧电脑 / 不同登录 / 未知OS资源依旧 Unknown，本批不证明已清理。

## 验证与边界

受影响契约8文件89项通过、0跳过，类型检查、CLI帮助和27文档检查通过。实际Windows首轮6文件22项19通过3失败，第二轮受影响3文件7项4通过3失败，均0跳过。两个旧config4断言已更新；原取消场景和生产场景另记录退出码3 / Bun segmentation fault，读改查记录native_control_unavailable，原因未证明，不能宣布Native稳定。最后隔离SDK2文件2项通过、0跳过，当前609文件前后零漂移；读取 / 读改查均进入一个Kernel原Unknown观测，产物证明、原件和原SDK对应保持。此前Runtime启动 / 控制失败仍保留，整批Native未全部通过。各阶段及隔离复验写入[分阶段研究记录](../research/CimiLoop-原执行二进制保留与历史容量-2026-10-09.json)。契约使用实际文件 / SQLite及构造Native资料，不是实际模型或技能资格；Windows场景独立执行当前源码的 AppContainer、SDK、Node检查和工作台原观测，模型回复与账户资格仍构造。工程评审只作工程核对，不计 Matt / Superpowers。

上游[Bun Windows异常处理修复](https://github.com/oven-sh/bun/pull/35083)仅作排查参考；原崩溃报告包含LHShield64.dll栈帧，但本机根因尚未证明。未更换固定OpenCode、关闭防护、放宽期限或重开失败原Run。

Node24.19.0、pnpm12.4.2。242 Schema、用户数据库格式10与原启动账本1保持；新登记仅为宿主私有存储，不迁移用户库。两个既有root tmp、历史Unknown资产和旧进程状态不动，不读取真实凭据、不发付费请求。本批默认不push，正式Agent默认入口继续关闭。

完整五组目标继续：正式模型 / 账户与批准预算 / 原账单、正式领域结果 / 验收、物理硬配额和全恢复；真实Skill及Plan / Task前Human / Matt；Matt独立完整评审、Superpowers新鲜源码验证及行为对照；共享Kernel工作台正式执行 / 控制 / 接续；真实普通Change至ReadyForDelivery及完整S1接入指南。只有智谱提供方已确认，模型、套餐、现金 / 积分限额待批准；这些缺项不授权付费调用。
