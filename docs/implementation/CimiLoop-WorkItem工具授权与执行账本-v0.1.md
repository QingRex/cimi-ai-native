# CimiLoop WorkItem 工具授权与执行账本 v0.1

> 2026-10-07 D-219 续批已实现独立真实工作区文件宿主、原文件 / 子进程身份及父 Run 结清核验，见[工具宿主与恢复](CimiLoop-真实工作区工具宿主与运行恢复-v0.1.md)。下文保留 D-208 公开夹具阶段；两种账本与范围不混用。Agent / IPC / OpenCode 及完整 S1 仍待完成。

2026-10-05，V1-09续批，决策D-208。新增原生Human Run的实时工具权限查询，以及独立公开文件夹具的持久执行账本。真实Kernel / SQLite / Git形成WorkItem、ContextManifest、RunRecord及Run后，受信宿主可以验证权限并读取 / 替换公开夹具；四种实际宿主退出与双宿主争用验证恢复和禁止重复写入。

本批验证授权与副作用之间的协调，未将Human Run改成Agent Run。D-207的OpenCode只读往返保持原实现，新工具账本尚未接入该消费模块。公开夹具的逻辑资源`src/query.ts`由宿主固定映射到临时公开`public.txt`，不修改原生Run实际Git工作区，不证明正式工作区的文件系统隔离。实际Key读取、外部模型请求和真实计费均为0。

## 1. 原生实时权限查询

`CimiLoopKernel.assessRunTool`接收独立v2 `ToolAuthorityRequest`，包含project_id、run_id、原operation_key、执行Actor、固定Context摘要、read_files / edit_files / run_checks动作及单一资源。返回严格`ToolAuthorityAssessment`，标明`human_run_tool_assessment`、ALLOW / DENY、查询时间和一致快照的事件序号；ALLOW有权威事实身份及basis_digest，DENY没有authority。formal_agent_execution_enabled始终false。

一次Store快照核对：

- 受信入口必须是与实际Human Actor一致的local_operator；自报Actor不能替代Caller。
- 当前Project、Task、WorkItem、Run、RunRecord、Context必须相互关联；原操作、执行者、固定约定 / 计划 / 定义、源码 / 工作区引用、权限及Context内容摘要必须一致。
- Task处于InProgress，WorkItem处于Active，Run是该Task唯一未结清的活动Reserved / Running运行，未取消、未释放预约且用量已知；Change仍Active / Executing，依赖和当前基线仍有效。
- 复用原生授权判断：具体授权授予者的责任指派仍有效，常规授权是当前Active版本、处于有效期内，完整覆盖执行者、动作、资源、用途、风险及预算。
- 请求资源必须是具体的有界路径；拒绝通配符请求、越界资源和未授权动作，独立只读Context只允许read_files。查询不证明对应宿主工具已验收，run_checks没有可用执行端口。
- 首次计时和累计预算沿用Task。当前已预约的最后一次机会仍可使用工具；本Run自己的pending_reconciliation不是另一项未知动作。经过时间耗尽、累计次数越界、未知费用、币种不符或已消费现金到达上限均拒绝。

查询不修改Run状态、Task用量、事件或成功命令Receipt。basis_digest固定请求、原RunRecord、Context及WorkItem授权内容，不能独立证明后续权限；每次执行和重放都必须重新查询。文件夹具不产生模型请求或额外计费，本判断不批准模型现金 / 积分支出。

## 2. 独立工具执行账本

新私有SQLite格式1，application_id=0x43494d54，scope=public_tool_rehearsal；不复用模型回复缓存，也不打开原生领域库写入工具状态。策略绑定Project、固定夹具映射摘要、最多32个调用及最多8MiB的逻辑缓存预留。文件 / 替换UTF-8内容最多16384字节，单条输入与回执各最多114688字节，调用先占用229376字节逻辑槽位。

Runtime提议必须通过独立`cimiloop/public-tool-invocation/1.0.0`约束，只支持read_file和replace_file；包括原Project / Run / 操作 / Actor / Context、call_id、逻辑路径、预期原文件摘要及替换文本。同一Run内call_id唯一，任何输入或授权basis变化均冲突。额外shell字段、任意工具、getter / toJSON、非法JSON对象、错身份、越界路径和过长内容均拒绝。

宿主顺序为实时授权→原子reserved→再次授权→原子executing→再次授权→一次受信文件效果→原子completed及回执→结果返回。不可复制的WeakMap凭据属于创建它的Journal实例；其他实例或JSON复制品不能dispatch或complete。未执行前取消 / 拒绝保存not_started，进入executing后的异常保留unknown，已经提交的completed不因响应丢失或关闭回退。

read回执保存原文本及摘要；replace回执只保存前 / 后摘要，输入中的替换文本用于核对。回执绑定原输入与授权摘要，字段与状态一起提交。打开库、调用、转换状态及读取快照时，核验精确SQLite格式、结构、策略、完整性检查、每行输入 / 宿主身份 / 回执摘要、结果一致性及容量。坏库拒绝使用，不补造结果。

每次重放先重新核对当前权限，再返回原完成回执，不再读取或写入文件。重放表达历史完成事实，不声称文件当前仍具有该内容。撤销后拒绝再次发布缓存读结果，但保留原完成事实。在该账本内，同一Run或同一夹具资源的reserved / executing / unknown会阻止新的调用；unknown无法通过新call_id绕过。正式执行还需要固定受保护的工具账本归属，不能由Runtime或新会话另选空库绕过待核对动作。

## 3. 原宿主退出与Unknown

每项调用保存原宿主nonce及实际PID / 创建时间 / 程序路径。恢复调用受信Windows原生身份观察器；只有准确确认原宿主已不存在后才能转换未完成状态，active / unknown保持原状态。仅PID存在与否、过期时间或新会话不能替代身份核验。

| 退出位置 | 持久事实 | 恢复结果 | 再次相同调用 |
|---|---|---|---|
| reserved已提交，尚未dispatch | 未执行的预约 | not_started | 返回未开始，不自动重试 |
| 已发生文件效果，尚未提交完成 | executing | unknown | 拒绝重复效果 |
| 完成UPDATE前在SQLite事务内退出 | executing，事务回滚 | unknown | 拒绝重复效果 |
| completed与回执已提交，尚未交付 | completed | 原回执保留 | 实时授权后重放，不再执行 |

即使Unknown调用的文件后摘要恰好等于预期，也不证明由该调用完成；本批不提供通过布尔确认或文件摘要将Unknown补写为成功的接口。生产接续仍须设计与原生运行核对结合的独立工具证据。宿主关闭先取消未执行步骤、等待已经进入的操作、保留完成事实，再关闭Journal。

## 4. 公开文件效果与边界

固定夹具只存在于专门创建的临时目录，模型逻辑路径只能匹配src/query.ts；模型不能提供任意宿主路径。效果在同一个已打开的公开文件句柄上核对文件类型、单一硬链接、大小、严格UTF-8及原摘要。替换使用指定偏移写入、截断和fsync；空替换与UTF-8 BOM保持确切字节语义，失败不能发布完成回执。

普通路径 / 符号链接检查和同一文件句柄只用于公开测试，不声称抵抗有权宿主在检查与打开之间换目录、重解析点或跨卷攻击。逻辑缓存预留也不限制SQLite / WAL / 元数据的物理磁盘增长。正式文件系统效果、命令能力清单、操作系统硬配额、整体IPC / Runtime拥有者恢复、独立Agent Context及原生Tool / Run核对尚未验收。新Host、Journal与效果端口为内部实现，没有包入口或CLI开关，也不能通过Runtime JSON传入授权查询器或效果端口。

## 5. 验证与接续

新增54项专项验证通过：工具宿主36项、严格协议2项、原生权限与Windows独立宿主16项。包括最后一次预约、只读查询不写入、身份 / Context / 动作 / 路径错配、撤销 / 取消 / 暂停 / 指派结束 / 超时 / 常规授权过期、已结清Run拒绝、真实WorkItem绑定公开写入、缓存发布拒绝、原拥有者核验、四处实际退出、双宿主一槽位争用、损坏拒绝及UTF-8 / BOM / 空写入。

受影响回归发现旧IPC崩溃测试把控制器退出后固定等待200ms当成资源可恢复的充分时间；Windows的Job / Profile清理可能稍后结束。改为最多8秒重复调用完整身份与资源归属检查，并对最终结果断言；不更改生产恢复实现，也不把active / unknown转为可强制清理。

受影响回归27个文件565项通过，类型检查、构建及Schema同步通过，详细结果见[验证记录](../research/CimiLoop-WorkItem工具授权与执行账本-2026-10-05.json)。领域库格式8、TEST1、积分1 / 文本缓存2 / 工具模型回复缓存3、旧v1及所有已有v2 Schema保持，未升级用户库；新增两个独立v2查询Schema。

下一步先建立正式工作区的宿主文件 / 命令能力约束和可验证效果身份，再将授权查询与工具账本接入IPC / OpenCode消费，并把工具Unknown纳入原生Run接续核对。继续完成整体受控恢复与物理硬配额；真实套餐 / 工具资格、服务端输入及思考输出上界、批准的现金 / 积分预算、受保护的唯一账户Ledger和账单核对仍阻止真实计费及正式Agent准入。
