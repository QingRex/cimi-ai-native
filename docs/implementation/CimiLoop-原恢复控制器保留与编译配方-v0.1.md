# CimiLoop 原恢复控制器保留与编译配方 v0.1

> 决策：D-249；范围：V1-09 / V1-10 原控制器保留、原操作查询和恢复。完整五组 S1 持续目标仍 active。

## 可执行路径

共享 Runtime 启动工厂现在将 AgentWorkspaceSandbox 控制器作为原件保存。源码配方固定五份 C# 源码摘要、Windows x64、编译入口 / 选项以及本机编译器路径和摘要；新编译使用配方的源码副本。执行前先登记配方，编译完成后将控制器接入既有二进制原件库，冻结摘要、物理身份及原件证明。编译超时、取消和迟到零码不能完成登记，也不重编译原配方。

新原件位于 `runtime-binary-originals/<sha256>/runtime.exe`。tools 丢失后，同配方返回相同物理控制器原件，不运行编译器、不复制新的控制器。控制器原件缺失、同字节替换、原件或配方登记缺失时拒绝；当前源码和当前安装不能补回旧原件。

Runtime 唯一 Run claim 的输入新增 sandbox_original，launcher2 保存相同证明。Native 创建前与发送原 config5 前再次核验；原操作查询、采集和结果身份核对新鲜原件，共享工作台沿原应用服务复用 Kernel。恢复运行原控制器的 --recover，只处置原 OS 资源，不运行 Runtime / 工具 / 模型、不重开 Run、不形成领域成功或结清费用。

取消仍可在原件缺失时登记请求；100ms 监督只核对冻结元数据，不重复摘要大文件。取消请求不是停止或清理证明。缺少原执行 OpenCode 二进制时，原控制器仍可核对原 OS 资源；控制器本身缺失或登录身份无法证明时，恢复不能补建或推断资源已清理。

## 私有登记和兼容

配方登记格式1使用 agent-sandbox-build-originals/index.sqlite、库外 agent-sandbox-build-registry.json 与 agent-sandbox-build-claims/<recipe_digest>。库外记录固定目录 / SQLite 物理身份；精确 DDL / 不可删除和单次完成触发器、全部行、独占创建 / fsync 的 reservation 和完成 receipt 双向核对。登记先于编译持久化；崩溃留下 reserved 或孤立证据，后续调用拒绝自动接续、重编译、删除或释放容量。

128 配方为逻辑容量保留。控制器原件同时占既有二进制库的 128 摘要 / 4 GiB 容量；源码副本、编译候选、元数据和磁盘开销没有物理硬配额保证，physical_quota_enforced 保持 false。128 配方不是并发容量、物理容量或完整历史能力认证。

launcher1 保持原精确字段、tools/agent-workspace-sandbox-<source_digest>/AgentWorkspaceSandbox.exe 路径和 build.json 摘要核验，不补写历史保管证明。launcher2 仅接受新增原件证明，冻结输入拒绝降级成 launcher1。已有且完整的旧编译缓存可前瞻保存到新原件库；旧原操作仍读旧 launcher1 和旧路径。残缺旧缓存拒绝自动重编译。原路径已经丢失的旧操作仍 Unknown，没有从新源码修复旧历史。

config1–5、用户数据库格式10、原启动账本1、242 Schema 保持。新增配方登记仅为宿主私有格式；没有用户库升级。公共 Native 探针控制器、文件 broker / IPC transport、独立 OS 观察助手等仍有各自编译缓存条件，本批不宣布全部 Native 二进制已保留或所有异常已恢复。

## 验证和接续

最终受影响6文件69项全部通过、0跳过。实际Windows组合4文件16项15通过1失败、0跳过；原操作控制5项、原资源恢复9项均通过，包含原tools缓存丢失恢复。生产读取检查形成一个Kernel原Unknown观测；读改查在clock_continuous15秒硬期限中断，实际3次构造模型回复，原Native部分回执未与SDK完整对应、无原Kernel观测，保留原件。独立新夹具读改查复验1文件1项1通过0失败、0跳过，不能覆盖组合失败或证明Native稳定。类型检查、CLI帮助和28文档检查通过，阶段源码均612文件摘要核对；组合后只追加一个unit文件的两项契约，最终契约和隔离SDK前后零漂移。

各阶段实际结果、完整源码摘要和失败范围见[研究记录](../research/CimiLoop-原恢复控制器保留与编译配方-2026-10-09.json)。新增真实 Windows 编译器回归验证缓存丢失仍用同一物理控制器，以及缺失 / 同字节替换 / 登记损坏拒绝重编译。AppContainer 原资源恢复验证只移除自有夹具的 tools 缓存，核对原映射 / Profile / ACL 处置以及 Run、Kernel 事件和用量没有重新执行。

契约中的构造编译回调、身份、账户、模型和技能不能作为真实资格；实际 SDK / Native 场景也不代替真实模型账户批准、独立方法评审或 S1。普通工程审查修复迟到编译成功，不计 Matt / Superpowers 验收。D-248 及更早的崩溃、Unknown、旧原件缺失继续保留，不能被本批通过覆盖。

正式默认 Agent 入口继续关闭。下一步继续正式领域验收、模型 / 账户 / 原预算与账单、物理配额和完整异常恢复；真实 Skill 与 Plan / Task 前 Human / Matt、独立完整评审和新鲜验证、工作台正式执行及真实普通 Change 至 ReadyForDelivery 都在完整目标内。智谱仅提供方确认，具体模型、套餐、现金 / 积分限额待批准；确认前付费调用和真实凭据读取保持零。