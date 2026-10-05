# CimiLoop Provider证据、评测与受限绑定 v0.1

2026-10-04，V1-09续批，决策D-195。本批接通Project作用域的原生Evidence / Evaluation和Human批准的合成探针Binding。真实智谱探针已完成实际CLI导入、两类评测与受限批准；Task执行绑定仍被拒绝，Agent Run及完整A9未完成。当前数据库格式8、协议2.0.0；只升级临时测试样本，没有升级用户库。

后续D-198已完成无网络Capability下的OpenCode 1.18.34合成IPC传输：准确AppContainer SID / 实际PID与创建身份核对、帧限额及重放校验、内容只读模块兼容、取消 / 原生崩溃与归属恢复验证均接通。外部模型请求和实际Key读取0，HTTPS主机 / 路径 / 模型强制限制与持久预算预留 / 可靠计费仍待实现，controlled_execution、正式Task绑定及Agent Run不提升。 见[Runtime IPC传输](CimiLoop-RuntimeIPC传输-v0.1.md)；合成transport-probe结果不能替代原RuntimeProbeResult或真实模型契约证据。

## 1. 两种评测及批准范围

| profile | 确定性核验 | 当前可产生的结果 / 批准范围 |
|---|---|---|
| technical_contract | 固定OpenCode来源 / 版本和Schema字节、写入及只读边界的原始canary、实际修改文件、独立会话 / AppContainer及最终验收文本 | 成功为ALLOW，只允许isolated_provider_probe绑定 |
| controlled_execution | 上述契约，加网络主机限制、可靠费用计量 / 上限、磁盘限制及崩溃恢复 | 当前规则尚未核验这四项完整受控执行证据，保持inconclusive，不能批准task_execution |

评测规则为`provider-assessment/1.0.0`。明确反证产生DENY；未开始、未知或未完成模型观测产生NEED_MORE_EVIDENCE，不猜测完成。清空探针gaps、填写contract_probe_passed或提交任务ALLOW都不能补齐执行边界。探针范围的ALLOW不表示Task满足、Gate通过、预算授权或完整A9验收。

本批IO入口仅支持固定来源的本机OpenCode Runtime，不支持Skill / DevOps等Provider评测或依赖装配。Descriptor登记仍是不可变candidate历史，资格由原生评测及精确输入派生；不会原地改写trust_status。已有evaluated声明和无批准的Binding仍只是元数据。

## 2. 原生事实与字节核对

`RecordProviderEvidence`、`EvaluateProvider`、`RegisterProviderBinding`都由已认证Human Project Owner发起，核对Project CAS。在同一事务内增加Project Revision，追加不可变记录、事件、成功Receipt及Outbox；故障全部回滚。同命令键原样重放，身份核对先于重放，重放不重新批准或调用模型。

Provider Evidence使用原生`evidence`对象类型，明确`purpose: provider_probe`、`origin: local_probe_observation`、descriptor_ref / descriptor_digest及原始快照摘要。Provider Evaluation使用原生`evaluation`对象类型，明确`purpose: provider_assessment`，固定profile、规则、证据引用、评测输入摘要及逐项结论。两者存于格式8的`provider_assessment_records`，与Change作用域的`verification_records`分开。公共Schema和inspect支持两种严格分支；任务读写服务不读取Provider事实，Provider服务也不接受任务证据 / 评价ID。

CLI从显式选定的artifact_root读取探针引用，拒绝越界、链接、过大文件和摘要错配，再将快照及原始字节固定到项目objects目录。快照中引用被改为local_content内容地址；原始字节本身不改写。导入失败可能留下可回收的未引用附件，不产生领域事实。Kernel经可信宿主Port核对实际可执行文件与发布Schema摘要，逐项读取附件并核对SHA256；评测及绑定批准时重新核对，文件后来变化会阻止新操作。

契约结论由原始版本输出、canary字段、结束证明、模型事件、会话ID、不同Profile及实际文件字节计算。不能把工具输出中的PROBE_ACCEPT或快照中的成功布尔值当成验收。此处信任边界是已认证本机操作者及控制端，不是远程签名证明，也不声称JSON或摘要能证明全部OS权限落实。

## 3. Binding及查询

新批准的Binding强制保存`approval{assignment_ref,evaluation_ref,input_digest,binding_scope}`，引用精确Descriptor、能力、Schema、证据及权限。Kernel重新计算评测输入和结论，核对当前Human指派、声明能力及完整权限；本批探针权限必须精确等于声明，不能扩大权限或声称已完成Task / Policy交集。任务执行绑定在可信执行边界落实之前拒绝。

`provider list`返回一致快照中的assessment_checks，列出两种profile及各自结论 / 缺口。binding_checks报告PROVIDER_BINDING_SCOPE_PROBE_ONLY及运行边界缺口；所有execution_enabled仍为false。目录检查只核对保存的元数据关联，不读取外部字节或承诺下一次运行可用；后续实际准入必须重读原始事实和最新授权。

`inspect evidence <id>`、`inspect evaluation <id>`及`inspect provider_binding <id>`返回完整严格原生对象。Agent登记可以引用该Binding的精确身份元数据，但真实Agent入口和Run仍未启用，不能借人类指派运行。

## 4. CLI操作

准备符合Schema的JSON输入；descriptor_digest是完整Descriptor记录的规范化摘要，不是可执行文件摘要。技术快照导入示例：

```powershell
node apps/cli/dist/bin.js --json --project-dir '<项目>' provider record-evidence `
  --file '<含descriptor_ref和descriptor_digest的输入.json>' `
  --probe-file '<实际探针快照.json>' --artifact-root '<允许读取原始引用的根目录>'

node apps/cli/dist/bin.js --json --project-dir '<项目>' provider evaluate --file '<评测输入.json>'
node apps/cli/dist/bin.js --json --project-dir '<项目>' provider bind --file '<批准输入.json>'
node apps/cli/dist/bin.js --json --project-dir '<项目>' provider list
```

评测输入包含descriptor_ref、descriptor_digest、profile及evidence_refs。批准输入包含descriptor_ref、descriptor_digest、evaluation_ref、该评测input_digest、binding_scope、capability及effective_permissions。三类命令支持全局command-id及Project expected-revision；接口Schema见[RecordProviderEvidence](../../packages/protocol/schemas/v2/RecordProviderEvidenceCommand.schema.json)、[EvaluateProvider](../../packages/protocol/schemas/v2/EvaluateProviderCommand.schema.json)和[RegisterProviderBinding](../../packages/protocol/schemas/v2/RegisterProviderBindingCommand.schema.json)。凭据不进入这些输入。

## 5. 实际核验及后续

使用已保存的智谱GLM-5.3真实探针，在仓库外临时Project中通过实际CLI登记固定OpenCode 1.18.34、导入原始字节、评测technical_contract为ALLOW、评测controlled_execution为NEED_MORE_EVIDENCE，批准isolated_provider_probe Binding；随后尝试task_execution并得到PROVIDER_NOT_EVALUATED。全部执行资格仍为false，本批新增模型请求为0。核验快照见[Provider准入实测](../research/CimiLoop-OpenCode-Provider准入核验-2026-10-04.json)，原始CLI结果保存在本机`.cimiloop/provider-admission-zhipu-v1-09/`；临时库与内容对象在仓库外，本机目录记录仅用于定位。真实模型原始证据仍见[Runtime探针与隔离](CimiLoop-Runtime探针与隔离-v0.1.md)。

新增治理测试覆盖原生作用域、重放、批准范围、来源 / 原始字节 / Schema变化、反证与未知、Human身份、权限 / 能力及三类事务故障；实际CLI验证导入、评测、批准和重启后查询。格式8迁移测试包含真实格式7运行 / 累计用量 / 取消未知 / 交接接续历史、四处故障回滚及Schema有效的运行事实篡改拒绝；格式1–6迁移回归保留。另修复Windows结束证明被独占时查询抛出EBUSY的竞争，实际独占锁测试确认Unknown、同键不重启及解除锁后恢复原观测。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全量30个测试文件283项通过，新增12项Provider治理、8项格式8迁移及1项真实文件锁回归。结果同步[实施基线第10节](CimiLoop-V1可执行设计与实施计划-v0.1.md)及D-195为准。

后续D-196已实现[新合成操作恢复与资源阈值控制](CimiLoop-Runtime恢复与资源限额-v0.1.md)，实际Windows超限及CLI恢复通过；采样阈值不代表文件系统硬配额，部分恢复不代表完整A9。Provider受控执行评测仍保持四项缺口，不提升为Task准入。下一步落实出站主机限制和可靠费用控制，补齐文件系统硬上限与完整恢复验收，再接正式Task绑定及可信Agent入口 / Run。 Matt / Superpowers技能包装与试点仍按V1-21/22进入S1，OpenSpec可选，ECC按需参考。

后续D-197已实现[Runtime网络与费用策略](CimiLoop-Runtime网络与费用策略-v0.1.md)：默认无网络Capability，未实现的主机白名单和费用硬上限在启动前拒绝，原受控执行四项缺口仍保留。下一步先验证可信模型网关的沙箱传输，再实现主机限制、持久预算预留和可靠计费；补齐文件系统硬上限与完整恢复验收后，接正式Task绑定及可信Agent入口 / Run。

后续D-199已实现宿主HTTPS网关核心和独立SQLite持久预算：固定合成主机 / 路径 / 模型 / 输出上限，TLS验证、响应限额、请求前预留、跨进程竞争及Unknown预留保留通过验证。CLI合成探针12项全部通过，实际Key读取与外部模型请求0。AppContainer IPC与网关尚未桥接，真实Provider计价及受控执行未验收，正式Task绑定与Agent Run继续关闭。 见[宿主模型网关与持久预算](CimiLoop-宿主模型网关与持久预算-v0.1.md)。下一步接通准确身份核验的AppContainer IPC与宿主网关，先验证OpenCode经IPC收到合成HTTPS回复，再实现可靠真实计价 / Provider验收；补齐文件系统硬配额与完整恢复后接正式Task及Agent Run。 本批结果不替代真实模型契约或实际账单，既有Runtime host_allowlist / required_cap仍拒绝，Provider受控执行不提升。

2026-10-05后续D-200已接通无网络AppContainer中的OpenCode IPC与宿主HTTPS网关：固定模块、准确进程身份、私有目录及策略摘要贯穿请求和回复，发送前持久预留，取消 / 崩溃保留Unknown预算。实际OpenCode 1.18.34完成2次合成HTTPS请求，9组桥接异常 / 恢复实测通过；实际Key读取与外部模型请求0。真实Provider计价及受控执行仍未验收，正式Task绑定与Agent Run继续关闭。 规则见[IPC宿主网关桥接](CimiLoop-IPC宿主网关桥接-v0.1.md)。下一步建立真实Provider可核验的计价上界及公网DNS / 固定地址 / 重绑定防护，再做真实网关契约验收；补齐文件系统硬配额与完整恢复后接正式Task及Agent Run。 既有host_allowlist / required_cap仍拒绝真实Runtime启动，本批不提升Provider受控执行。

2026-10-05后续D-201已实现固定智谱Coding Plan公网DNS / 一次性地址固定及TLS对端核验，实际两条A / 两条AAAA与所选IP的TLS1.3验证通过；新增有期限的GLM-5.3积分估算及计费缺项查询。公网连接探针的模型端点HTTP、真实Key读取和外部模型请求0，未启动Runtime。积分估算不作为实际费用或准入证明，真实网关计费与正式Task / Agent执行仍未验收。 见[公网网关边界与积分估算](CimiLoop-公网网关边界与积分估算-v0.1.md)。下一步确认专用连接的套餐版本及网关适用环境，建立包含思考Token的输入 / 输出上界、积分与现金预算的明确关系及持久预留，再验收真实HTTPS / Runtime契约；文件系统硬配额与完整受控恢复仍待完成。 本批仅验证连接层，既有真实Runtime host_allowlist / required_cap保持拒绝，Provider受控执行不提升。

2026-10-05后续D-202已实现独立持久积分演练账本、共享账户 / 任务累计上限、一次发送凭据、历史回执及原宿主身份核验后的恢复。实际三个独立宿主验证共享上限CAS与发送状态提交后的进程退出；15项CLI检查通过。HTTP、真实Key及模型请求0，真实计费准入与正式Task / Agent仍未启用。 见[持久积分预算与宿主恢复](CimiLoop-持久积分预算与宿主恢复-v0.1.md)。下一步确认套餐版本与网关工具资格，证明服务端输入及思考输出上界，固定实际账户唯一账本、配额 / 账单核对及Task现金 / 积分预算关系，再实现真实HTTPS请求契约；文件系统硬配额和完整受控恢复仍待完成。
