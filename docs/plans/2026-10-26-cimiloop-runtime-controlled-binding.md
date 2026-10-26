# 受控 Runtime 证据与正式绑定批准路径

接续 `ef7ac0db6e0ee0422bf542f56b23d8d6c586be64`。完整 S1 五组继续，当前主链仍需默认生产宿主、真实四项受控证据及真实交付场景。本批实现 Kernel 的受控证据消费和正式 Runtime 绑定批准路径；没有将 PUBLIC 宿主回调当作真实生产资格。

## 业务行为

此前 Runtime 的网络、费用、磁盘及恢复四项评估固定为 inconclusive，注册绑定又无条件拒绝 Task 执行范围；即使以后已有完整原件，也无法通过正常命令批准。现增加可信宿主的 `RuntimeControlEvidencePort`，由宿主独立读取这四项原始依据。普通命令、导入报告和客户端 JSON 均不能安装该端口，历史报告里的成功标签或清空的 gaps 也不能替代它。

宿主结果必须绑定同一 Project、固定 Descriptor 摘要和有序 ProviderEvidence 全集摘要。四项名称必须完整且唯一，supports／refutes 必须携带完整原始依据的 basis_digest；inconclusive 允许保留已读的部分依据，但不能当作通过。返回的 Promise／thenable、错误身份、未知字段、缺少摘要及核验回调被替换均拒绝。Kernel 将控制依据与既有来源、Schema、边界、实际编辑及独立评审结果一起纳入 input_digest，并在本次入库前再次完整读取比较，不能只比较 ALLOW 或四项结果字符串。

`RegisterProviderBinding` 复核原评估及当前完整依据后，允许 Runtime 的 controlled_execution 评估对应 `runtime.execute` 能力进入 task_execution 范围。仍须当前 Human Project Owner 指派、精确的声明权限、无未装配依赖和匹配的固定能力／Schema；技术评估不能提升范围，Skill 的正式绑定仍未开放。命令重放只返回原回执，不重复写业务事件。每次 Task 的权限交集、Context 前完整宿主准入、实际启动／模型／工具守卫保持独立要求，不由这条绑定批准替代。

## 格式兼容

先尝试新增公开评估版本时，真实 SQLite 拒绝了入库：格式10的 kind 触发器仅接受既有公开 rule_version。已确认这是真实格式约束，不是重建产物即可解决的问题。本批最终未改变该触发器或用户库格式。

采用现有 assessment 的开放 key 结构，以 `runtime-control-evidence/1.0.0` 作为明确的扩展版本标记；扩展格式、四项依据及标记均进入新评估摘要。公开 `provider-assessment/1.0.0`、Schema242、项目库10及 Host1保持。没有数据库迁移、自动升级、旧记录更新或新的公共 Schema；Schema重新导出后与Git基线相同。

历史评估未保存该扩展标记，继续使用原算法及原摘要重算，即使后来安装了新的宿主端口，也不会把历史 inconclusive 自动改成通过。新的扩展评估失去原端口时拒绝复核，不能降级成旧算法。旧客户端可读取原有协议字段，但其原算法和 Task 范围拒绝逻辑不能批准这条新路径；新证据就绪时必须执行新的 EvaluateProvider 及 Human 批准命令。

## 验证与限制

新增反例先于实现运行。首次12项中9失败／3通过，其中一项测试尝试撤销最后一名 Owner，被既有交接约束拒绝；修正为先设立继任 Owner后，12项为8失败／4通过。首次整合检查还修正一处 TypeScript 对严格对象的属性收窄错误；随后两次测试各8通过／4失败，最终定位到上述版本触发器。原失败报告均保留，不把它们改判通过。

保持格式兼容的实现后，首个完整文件12项通过。随后补充反证、拒绝的异步结果、端口移除不可降级和历史评估不可自动提升用例。首轮六个完整文件69通过／1失败，失败在旧 Provider目录测试：它以人工请求格式提交Agent，实际先命中INPUT_CHANGED，未执行其预期的Binding核对。现改为完整Agent请求并固定一个不存在的Binding，明确核对PROVIDER_BINDING_NOT_FOUND_OR_STALE，同时保留真实Task预算、事件与Run均不变化的断言；未修改产品判断或成功条件。

修正后完整目录文件7项通过。末次静态复查发现新端口初版使用String转换检查result，会接受字符串包装对象；新增该反例先失败（其余16项未运行，不计整文件通过），现严格要求原始字符串，并完整重跑调用新扩展的批准文件17项。

最终分阶段选取六个完整文件71项通过、0失败0跳过：受控批准17项、原Runtime评估12项、Provider目录7项、Skill评估20项、格式10迁移9项、Schema检查6项。仅选各文件最终完整报告，不重复累计首次失败文件和12／16项早期回归。Node24.22.1／pnpm12.4.2，最终pnpm check通过。验证使用实际 Kernel／SQLite、PUBLIC 探针字节和宿主观察替身，不运行模型，不创建正式生产批准或交付场景；未运行全仓测试或新的Windows／AppContainer场景。

当前默认 `LocalProviderVerifier` 尚未安装这四项具体读取器，真实生产评估继续证据不足。端口返回值必须由后续真实网络／模型／账户／账单、完整可写路径与物理配额、历史容量、完整中断恢复的独立来源生成；只验证项目目录在固定卷上不能宣布 disk_limit 通过。PUBLIC 控制回调、模拟账单或已有局部 Native 原件不能成为正式批准证据。

关联：[默认 Codex 入口](2026-10-26-cimiloop-codex-production-entry.md)、[真实方法原件接入](2026-10-26-cimiloop-native-method-qualification.md)、[本机接续](2026-10-09-cimiloop-S1跨电脑接续.md)。后续继续完成具体生产来源、完整准入及默认装载、真实 Skill／Human 澄清、普通 Change 到 ReadyForDelivery及最终 Matt／Superpowers／S1；本批只本地提交，默认不 push。
