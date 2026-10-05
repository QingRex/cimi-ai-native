# CimiLoop Provider候选登记与接入检查 v0.1

2026-10-04，V1-09续批，决策D-193。本文记录候选登记、固定描述查询、Binding契约及Agent身份匹配。后续D-195已实现原生Provider评测与探针范围批准，见[证据、评测与受限绑定](CimiLoop-Provider证据评测与受限绑定-v0.1.md)；正式Task绑定、可信Agent入口和Agent Run仍未实现，目录execution_enabled固定false。

## 1. 候选登记的权威边界

`RegisterProvider`由已认证的Human Project Owner发起，目标为当前Project，核对其`expected_revision`。命令仅接受[ProviderRegistration Schema](../../packages/protocol/schemas/v2/ProviderRegistration.schema.json)定义的来源、版本、能力、依赖、所需权限和输入 / 输出Schema引用；不接受ID、producer、创建时间、trust_status或evaluation_ref。

Kernel生成不可变ProviderDescriptor并固定`trust_status: candidate`。同一事务增加Project Revision、追加ProviderRegistered事件、成功回执和Outbox；任一写入失败全部回滚。同command_id同内容原样重放，改变内容返回COMMAND_ID_REUSED。身份核对先于重放；历史回执不是新的运行授权。

同项目、同provider_kind、同name及同version只能登记一次；再次登记返回PROVIDER_VERSION_CONFLICT。修改来源或契约须使用新版本，保留原记录。依赖必须引用当前项目已有Descriptor并提供其完整记录的实际规范化SHA256摘要；不存在、摘要错配或同一引用声明多个摘要均拒绝。允许登记依赖尚未评测的候选，但查询明确报告DEPENDENCY_NOT_EVALUATED，不能据此调用。

来源摘要、权限和Schema引用在此阶段仍是待核验声明。登记不读取来源文件、不运行程序、不验证外部模型连接，也不授予文件、网络、预算或Human职责。不能把登记成功解释为来源真实性或Provider已评测。

## 2. 查询与Binding检查

`CimiLoopKernel.getProviderCatalog()`在同一Store读取快照返回严格[ProviderCatalogResult](../../packages/protocol/schemas/v2/ProviderCatalogResult.schema.json)：

| 字段 | 当前含义 |
|---|---|
| descriptors / bindings | 当前项目的完整不可变元数据；已有Binding不因可查询而获得执行资格 |
| admission | 每项Descriptor的实际记录摘要、关闭的执行资格及候选 / 依赖 / 评测 / Runtime实现缺口 |
| binding_checks | Binding实际记录摘要，以及Descriptor摘要、声明能力、输入输出Schema、固定依赖、Runtime引用等已实现检查 |
| agent_bindings | 每位Agent的原生Binding引用是否存在、身份元数据是否精确匹配及入口 / 运行缺口 |
| as_of_event_sequence | 本次一致快照对应的事件序号；查询不追加领域事实 |

D-193当批尚未接通Provider原生证据 / 评测；后续D-195已核验固定来源、Schema及原始字节，并增加catalog assessment_checks，见[证据、评测与受限绑定](CimiLoop-Provider证据评测与受限绑定-v0.1.md)。已有evaluated声明不能自动获得执行资格，Task的Evidence / ALLOW也不能评测Runtime。技术契约ALLOW仅支持合成探针绑定，受控执行与实际权限落实仍有缺口。

`inspect provider_descriptor <id>`和`inspect provider_binding <id>`使用已有严格ObjectShowResult返回完整记录。对象不存在返回OBJECT_NOT_FOUND；嵌套字段和对象类型仍按实际Schema校验。

## 3. Agent身份与运行拒绝

未来可信入口使用的原生Binding身份约定为：

```json
{
  "provider": "cimiloop",
  "resource_type": "provider_binding",
  "locator": "原生ProviderBinding的UUID",
  "digest": { "algorithm": "sha256", "value": "完整Binding记录的64位规范化摘要" }
}
```

`providerBindingIdentity(binding)`生成该引用。精确匹配只表示Actor登记的身份元数据与原生Binding一致，不证明请求来自该Agent。既有Actor登记仍是Human管理的元数据；真实Caller必须由可信入口注入，不能从命令、会话ID或上述JSON直接授予。

Agent发起PrepareRunContext / ReserveRun等执行准入时仍返回CAPABILITY_UNAVAILABLE，并提供Binding不存在、摘要 / 类型不符、Provider评测或入口 / Run未实现等具体blockers。请求不创建Context / Run，不扣减Task预算，也不能借Human入口和职责代行执行。Human运行控制保留已有行为。

## 4. CLI操作与错误

准备符合ProviderRegistration的候选JSON文件，再运行：

```powershell
node apps/cli/dist/bin.js --json --project-dir '<项目路径>' provider register --file '<候选.json>'
node apps/cli/dist/bin.js --json --project-dir '<项目路径>' provider list
node apps/cli/dist/bin.js --json --project-dir '<项目路径>' inspect provider_descriptor '<id>'
node apps/cli/dist/bin.js --json --project-dir '<项目路径>' inspect provider_binding '<id>'
```

register支持`--command-id`和`--expected-revision`，后者指向Project。JSON与文本走同一Kernel写入 / 读取服务。坏文件或协议字段退出2，缺少对象退出3，角色、依赖、版本及CAS冲突退出1；重复同command_id的已成功命令返回原回执。文本输出明确显示candidate和未启用原因。

D-193当批复用既有immutable_records表，数据库保持格式7、协议2.0.0，未新增迁移。D-195当前格式8增加独立Provider评测表，旧格式1–7须显式迁移，操作见[数据库迁移与恢复](CimiLoop-M0数据库迁移与恢复-v0.1.md)。未升级用户项目库，冻结v1保持。

## 5. 验证与后续

本批新增7项测试，验证候选 / Project / 事件 / Receipt / Outbox原子性、事件写入故障回滚、重放、同版本冲突、严格信任 / 来源字段、旧Revision、固定依赖、身份先于重放、Binding契约差异和Agent运行拒绝；实际CLI验证登记、重放、重启后查询及原生详情。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及27个测试文件257项通过，含全部此前回归。只读检查和拒绝不改变Task、预算或运行事实。实施基线第10节及D-193同步记录；测试中的Binding / evaluated记录是明确标注的元数据夹具，不是正式Runtime验收。

后续D-194已通过智谱GLM-5.3完成真实合成修改及独立只读评价，D-195已实现[原生Provider证据、评测与受限绑定](CimiLoop-Provider证据评测与受限绑定-v0.1.md)。下一步落实可验证网络主机、费用、磁盘和崩溃恢复，完善受控执行评测及Task绑定，再由可信入口固定Agent身份、Task / WorkItem / Context及预约，接实际Runtime启动和观测。合成验收及探针批准不替代任务ALLOW或完整A9。Matt / Superpowers按V1-21/22进入S1，OpenSpec可选，ECC按需参考。
