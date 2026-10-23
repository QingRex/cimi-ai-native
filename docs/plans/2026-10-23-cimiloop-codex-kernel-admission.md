# Codex 正式组合的 Kernel 权威与共享准入生命周期

基线`2bbc85c`，保持完整S1五组、Schema242／项目库10／Host1。当前共享openCodex已接真实安装和跨项目账户预算，但仍要求调用方传模型authority；默认生产工厂仍只选择旧HTTP。Context前准入仍缺真正完整的独立宿主组合，不能用原Host票的摘要或PUBLIC资格替代。

本轮按已有实施计划继续接线：先将Codex模型权限固定到原Agent Kernel的当前assessAgentRunModel，验证原项目、调用方、Kernel对象与方法身份，发送前重新查询。然后提供同一项目的共享Context／Run／工具／模型准入租约，组合原检查、原启动保管与必需的完整独立宿主端口；不允许HTTP载荷安装端口，不覆盖并发其他租约，不在释放时销毁原操作。默认工厂的Codex选择须复用该组合，未安装完整宿主时拒绝，不能退回另一模型账户。

先写原Kernel取消／身份替换、Context前门禁和租约释放反例，再实现并分阶段验证实际Kernel／SQLite组合。构造资格及完整宿主只验证接线，不是正式资格、真实模型、管理员物理配额、Matt/Superpowers或S1证据。管理员正向卷、全部Runtime写路径、完整资格及费用原件仍继续补齐。

## 已实现

`LocalAgentCodexModelAuthority`固定原Agent Kernel对象、assessAgentRunModel方法、store、caller、路径与原Run scope；每次模型检查和同步发送前都查询当前Kernel，拒绝取消、原模型独立proof缺失及身份替换。`LocalAgentRuntimeComposition.openCodex`直接创建该权威端口，不再接受外部authority参数；原安装、固定检查、账户预算及await前后守卫保持。

`LocalAgentRuntimeAdmission.open`在Context创建前安装共享原检查／启动保管及四个Kernel端口。调用方必须提供独立完整admit、verifyLaunch、verifyTool、verifyModel，检查和Host票本身不能充当它们。完整宿主reference从检查层正确解包后分别交给原完整端口。模型原件核验按Run隔离缓存，继续使用原候选／子Skill只读核验器。每个store仅一份租约，await期间拒绝重叠安装，项目／Kernel／完整方法身份／回调descriptor改变或借用Host丢失立即拒绝。

租约只借用Host，释放不关闭账户、不终止Native、不删除原件。回调安装先预检全部属性并逐槽登记；释放仅恢复descriptor仍精确属于自己的槽位。其他服务占用某槽时保留它并报告冲突，其他槽及所有权仍正常释放。静态复查指出的“第二槽不可写导致第一槽残留”已先重现失败后修复。

默认`productionAgentRuntime`现在优先使用同一项目的完整共享租约，打开原Codex预算账户，await后再次核对租约并生成原Agent Kernel／Runtime；它只释放自己打开的账户句柄。存在Codex安装但缺完整租约时，明确返回“Codex Context 前完整准入”，不会因缺项选用旧HTTP连接。缺原账户容量政策也拒绝，不初始化／重建账户。无Codex安装的既有HTTP路径保持原费用授权边界。

## 实际验证与剩余条件

Node v24.22.1、pnpm12.4.2。相关五个整文件分阶段共36项通过、0失败、0跳过：Kernel模型权威8项、父Skill／Codex共享组合8项、共享租约与默认工厂11项、旧HTTP费用授权1项、编译CLI原启动8项。`pnpm check`通过。测试覆盖真实Kernel／SQLite、检查安装、Host票、Context前门禁、原命令重放、取消、身份替换、完整证明异步拒绝、租约冲突／释放及账户await后重核；完整Provider／宿主与账户安装仍为PUBLIC夹具，Native启动未执行，无模型请求。

另在已有真实受保护安装项目`%LOCALAPPDATA%\CimiS1\codex-installed-hvdQ4C\project`调用编译后的默认工厂，实际返回“Codex Context 前完整准入”，没有改走HTTP，新增模型回合／Kernel事件均为0。该检查仅验证已有安装的默认分支选择，不是Run启动许可、原生执行或完整资格。类型检查初次发现测试删除可选端口写法不符合exactOptionalPropertyTypes，已改为delete后通过，初次失败输出保留。

**正式CLI／工作台尚未自动安装真实完整宿主租约。** 本批提供可执行共享应用组合和默认工厂接线，不以构造full端口启用生产。后续必须落实所有Runtime写路径的真实硬配额、完整资格／账户费用与异常恢复，生成独立完整宿主，接入Human授权的Context准备和默认CLI／工作台生命周期；然后执行真实普通Change到ReadyForDelivery、Matt/Superpowers和完整S1验收。五组仍未完成，Schema242／项目库10／Host1保持。管理员准备与正向卷步骤见[接入指南](2026-10-16-cimiloop-S1-接入指南.md)。
