# CimiLoop Protocol

协议由 TypeBox 定义，使用 Ajv strict mode 校验，导出 JSON Schema 2020-12。

- `@cimiloop/protocol/v1`：冻结的 M0 协议。
- `@cimiloop/protocol/v2`：当前实施中的协议基础。
- 根入口保留 M0 导出，同时提供 `protocolV1`、`protocolV2` 和版本化校验函数。`SCHEMA_VERSION` 仍为 1.0.0，`CURRENT_SCHEMA_VERSION` 为 2.0.0；当前 Kernel、Store 和 CLI 显式使用 `/v2`，旧 M0 实现保存在各包 `/v1` 入口用于回归与迁移样本。

```ts
import { parseVersionedCommand, parseVersionedRecord } from "@cimiloop/protocol";
import { parseCommand, SCHEMA_VERSION } from "@cimiloop/protocol/v2";
```

`parseVersionedCommand` 按 schema_version 选择严格校验；`parseVersionedRecord(objectType, input)` 读取已登记的版本对象，不修改输入，不执行命令，也不转换历史记录。M0 无版本标记的命令结果仅由原 Schema 接受；v2 结果需要自身的 schema_version 和成功结果的 command_type。

v2 当前包含基础类型、Project/Actor/Role/Assignment/Change、设置 / 目标版本 / 规划、Contract / Plan Body及候选 / 正式版本、Plan内TaskDefinition、RiskAssessment、DecisionRequest / Decision、生命周期事实，对应严格命令 / 结果 / 事件和治理 / Flow / Intent查询，以及Outbox、迁移 / 健康报告、ProviderDescriptor / Binding。持久 Task、固定定义记录、WorkItem、常规授权 / 版本 / 撤销及具体授权、Execution查询已加入；V1-06另增加固定Git SourceSnapshot、人工RawEvidenceResult / Evidence、固定PolicySnapshot / RequirementSetRecord、独立Human EvaluationContext、Evaluation、TaskSatisfactionRecord、IntegrationReadinessRecord及对应严格命令 / 事件 / 结果 / 快照。Human Run及交接记录已在V1-07加入；实际Agent / Tool Runtime、隔离和发布对象仍在对应任务实现；读取未登记类型返回明确错误。

Schema校验验证数据格式。角色资格、指派期限、证据真实性、权限交集、源码Digest及状态准入由Kernel和受控Adapter实施，不凭输入声明获得授权。ProviderRegistration / RegisterProvider、candidate专用事件 / 回执、ProviderCatalogResult及元数据详情查询已实现；原生Provider作用域Evidence / Evaluation与探针范围绑定已由后续切片接通，Task绑定、技能和Agent Runtime仍未接通。Task的Evidence / Evaluation不能用于Provider准入，详情见[候选登记与接入检查](../../docs/implementation/CimiLoop-Provider候选登记与接入检查-v0.1.md)。

V1-03 已增加 Kernel 的可信 caller 注入契约，身份先于回执校验；caller 不属于命令协议。指派和移交由独立角色、明确作用域及当前期限约束，审计指派快照保存在不可变事件。说明见 [责任治理与身份入口](../../docs/implementation/CimiLoop责任治理与身份入口-v0.1.md)。严格校验器按 Schema 对象缓存并在首次使用时编译，减少 CLI 启动及重复命令的编译开销。

设置、目标版本、规划 / 排序、真实Contract / Plan确认、StartChange及Flow / Intent查询已增加严格Schema。运行时按command_type / event_type选择完整严格分支；成功结果先校验完整信封与data，再逐个严格校验事件，未知类型交给完整联合校验。导出的JSON Schema仍保留完整联合并由严格Ajv检查，事件载荷不能绕过校验。确认规则固定intent-confirmation/1.0.0并进入摘要，正式策略与超额例外尚未接通。说明见[设置、规划与容量](../../docs/implementation/CimiLoop项目设置规划与容量-v0.1.md)及[约定、计划确认与开工](../../docs/implementation/CimiLoop约定计划确认与开工-v0.1.md)。

运行根目录schema:export后，M0制品保留在schemas/，v2制品输出到schemas/v2/；ID分别使用.v1/.v2，支持加载到同一个严格Schema注册表。测试检查导出同步、跨版本拒绝及M0回归。

当前实施依据：[V1 可执行设计与实施计划](../../docs/implementation/CimiLoop-V1可执行设计与实施计划-v0.1.md)。

数据库当前格式8与领域协议2.0.0分别演进；格式1–7显式升级，历史Event / Transition / Receipt原样读取，已有设置、规划、任务和授权保留，迁移不默认生成配置、批准、证据或评价。操作说明见 [M0 数据库迁移与恢复](../../docs/implementation/CimiLoop-M0数据库迁移与恢复-v0.1.md)。

V1-05 实际规则及CLI见[任务、授权与预算](../../docs/implementation/CimiLoop任务授权与预算-v0.1.md)。acting_role另有executor，用于绑定执行者命中常规授权，不是Human责任角色；预算以Task累计，Human实际预约 / 消费已在V1-07接通。CommandSuccess / CommandResult通过本地$defs复用完整事件Schema，严格Ajv使用inlineRefs=false减少重复编译；版本化事件读取复用严格event_type分支，未知类型仍完整校验。TypeScript结果类型由分组Schema推导，未维护第二套领域interface。

V1-06本批实际范围见[证据、评价与安全集成](../../docs/implementation/CimiLoop证据评价与安全集成-v0.1.md)。EvaluateTask / EvaluateIntegration由Kernel核对原始内容并计算四种结果；SatisfyTask及MarkReadyForIntegration重新核对当前输入后才推进。固定 professional-review/1.0.0 通过既有 RequestDecision / RecordDecision 增加条件逐项核验、证据失效处置及高风险集成专业批准，附严格 RawProfessionalReview 与实际原始内容引用。正式版本保存 condition_verification_refs，Task / Gate 评价分别保存 disposition_refs / professional_decision_ref；V1-06本阶段人工路径已完成。人工报告与最小Context不代表真实自动测试或Agent会话隔离。

V1-07已增加严格Run、WorkspaceManifest / Snapshot、ContextManifest、RunRecord / Observation、Handoff / Resumption及七条运行命令。ResumeChange事件可保存实际接续依据，旧空payload仍合法；人工预约与外部开始分别记录。操作与当前边界见[运行预约与交接恢复](../../docs/implementation/CimiLoop运行预约与交接恢复-v0.1.md)。Agent / Tool运行仍拒绝，Provider绑定和权限隔离留给V1-09。

V1-09首批D-192先行探针新增严格`RuntimeProbeResult`、`RuntimeOperationResult`及`RuntimeBoundaryProbe`，限定`isolated_provider_probe`作用域，不接受Human身份或原生Task授权；正式执行标记固定false，费用保持未知。只增加v2查询 / 探针机器结果，未修改领域Run、Store格式7或冻结v1。实际版本、隔离证明、模型403及后续缺口见[Runtime探针与隔离](../../docs/implementation/CimiLoop-Runtime探针与隔离-v0.1.md)。

V1-08已增加InspectableObjectType / ObjectShowResult、复用TaskReadiness及严格CommandDiagnostic。`parseObjectShowResult` 按对象类型选择完整严格分支，导出的JSON Schema仍包含完整联合；当前S1原生对象可经Kernel查询，未来预留类型不自动加入查询注册表。DomainError的details仍可保存各命令专有信息，但存在diagnostic时必须通过完整诊断Schema。查询保留一致快照序号；失败诊断标明后续读取时刻，不替代原事务决定。操作见[CLI动作、查询与诊断](../../docs/implementation/CimiLoop-CLI动作查询与诊断-v0.1.md)。

V1-09续批D-195新增严格ProviderEvidence / ProviderEvaluation、RecordProviderEvidence / EvaluateProvider / RegisterProviderBinding命令、事件 / 结果和catalog assessment_checks。公共Evidence / Evaluation及inspect使用任务 / Provider两个严格分支，任务专用类型及读写服务仍独立；Provider事实存于格式8独立表。新批准结果使用ApprovedProviderBinding，必须保存精确指派、评测、输入摘要及scope；旧Binding仍可读取。技术ALLOW仅允许isolated_provider_probe，受控执行四项依据未完备，Task绑定与Agent Run仍拒绝；冻结v1保持。规则见[Provider证据、评测与受限绑定](../../docs/implementation/CimiLoop-Provider证据评测与受限绑定-v0.1.md)。

V1-09续批D-196新增RuntimeDiskLimits、RuntimeResourceObservation及RuntimeRecoveryResult三种严格v2机器Schema。ResourceObservation明确sampled_job_termination及100ms间隔，恢复区分active / recovered / unknown，资源清理不改变未证明完成的原运行。既有RuntimeOperationResult / RuntimeProbeResult及冻结v1制品保持；数据库仍格式8。操作及实测见[Runtime恢复与资源限额](../../docs/implementation/CimiLoop-Runtime恢复与资源限额-v0.1.md)，文件系统硬配额与正式Task准入仍未验收。

V1-09续批D-197新增RuntimeExecutionPolicy及RuntimeExecutionPolicyObservation两个严格v2机器Schema，区分默认deny_all、unrestricted_probe_only及尚未实现的host_allowlist / required_cap；观察结果准确记录实际Capability，不提升费用为已知。既有RuntimeProbeResult / RuntimeOperationResult与冻结v1保持，数据库仍8。操作与验证见[Runtime网络与费用策略](../../docs/implementation/CimiLoop-Runtime网络与费用策略-v0.1.md)。

V1-09续批D-198新增RuntimeIpcTransportObservation与RuntimeTransportProbeResult两个严格v2机器Schema；后者限定synthetic_transport_probe / 外部模型请求0 / 实际凭据读取0 / 正式执行false，不能替代真实Provider模型契约探针。原RuntimeOperationResult / RuntimeProbeResult及冻结v1字节保持，数据库仍8。见[Runtime IPC传输](../../docs/implementation/CimiLoop-RuntimeIPC传输-v0.1.md)。

V1-09续批D-199新增RuntimeGatewayProbeResult与RuntimeGatewayBudgetSnapshot两个独立严格v2机器Schema，固定synthetic_gateway_probe / TEST预算 / cost_known=false / ipc_runtime_connected=false / 正式执行false。既有RuntimeOperationResult / RuntimeProbeResult及冻结v1保持；宿主账本独立格式1，不改变领域数据库格式8。见[宿主模型网关与持久预算](../../docs/implementation/CimiLoop-宿主模型网关与持久预算-v0.1.md)。

V1-09续批D-200新增RuntimeGatewayTransportObservation、RuntimeGatewayBridgeObservation及RuntimeGatewayBridgeProbeResult三个独立严格v2 Schema。桥接探针固定synthetic_gateway_bridge_probe / ipc_runtime_connected=true / cost_known=false / 实际Key读取与模型请求0 / 正式执行false。原RuntimeOperationResult / RuntimeProbeResult、D-198 / D-199 Schema及冻结v1保持；领域数据库8、独立宿主账本1保持。见[IPC宿主网关桥接](../../docs/implementation/CimiLoop-IPC宿主网关桥接-v0.1.md)。

V1-09续批D-201新增独立严格v2 RuntimeGatewayNetworkProbeResult，scope为public_gateway_network_probe。记录公网DNS集合 / 时限 / 摘要、所选地址及TLS实际对端 / 证书；固定模型端点HTTP / 模型请求 / Key读取0、Runtime启动 / 正式执行false及计费准入 / cost_known=false。旧Runtime、D-198–200及冻结v1保持，领域格式8和宿主TEST账本1保持。见[公网网关边界与积分估算](../../docs/implementation/CimiLoop-公网网关边界与积分估算-v0.1.md)。


V1-09续批D-202新增独立严格v2 RuntimeGatewayCreditSnapshot / RuntimeGatewayCreditProbeResult，scope为credit_budget_rehearsal。固定积分单位、历史演练时间、共享累计上限、状态 / 持有量守恒、宿主核对及实际独立宿主计数；HTTP / 模型 / 真实Key0，计费准入与实际费用 / 正式执行false。既有Runtime及D-198–201格式保持，领域8与TEST账本1保持，新积分演练库独立格式1；不转换用户库。见[持久积分预算与宿主恢复](../../docs/implementation/CimiLoop-持久积分预算与宿主恢复-v0.1.md)。
