# CimiLoop 专用模型原件共同核验 v0.1

D-256，2026-10-10。承接[专用模型原请求衔接](CimiLoop-专用模型原请求衔接-v0.1.md)。完整五组 S1 继续，正式默认 Agent 入口关闭。

## 原 Run 的实际可用路径

共享 Runtime 执行实际 SDK 工具轮次后，collect 现在读取专用提供方原消息、请求字节、原预算占用、原响应和映射回执，保存内容寻址字节引用及可选 dedicated_model 摘要。工作台 / CLI 原有采集和原观察调用通过同一共享应用服务复用该能力。Kernel 读取结果时重新核对现存原件、独立 operation key、完整摘要和每份内容引用；Task 原结构化产物核验也调用同一核验器。不能删除摘要、替换自洽 JSON 或仅保留旧 blob 来绕过核验。

readDedicatedAgentModelOriginals 和 verifyCollectedDedicatedAgentModelOriginals 为只读 API，不接受模型 / 账户 / Key / 网络端口，不启动进程、不占新预算、不拨号、不重发。读取失败保持原 Run 及费用未决，不生成成功或 Task 验收依据。

每轮逐一比较原 SDK 双请求、专用双 header / 请求、原提供方消息编码与思考恢复、原 request_id / 固定型号 / 原函数ID及参数、输入字节摘要、预算绑定、dispatch、响应锚点和 SDK 原回执。完整响应只证明线协议与 SDK 原调用对应，构造账户仍不能证明真实批准或费用结清。

## 独立预算和必需原件身份

新专用模型 Host 使用私有 header2，固定 dedicated_zhipu 类型和专用 header 摘要。共享应用组合精确校验并复制这份原身份，原 Runtime input 进一步固定 Host header 摘要和必需原件身份，由独立原 Run / operation key 登记保护。即使全部新目录和可选锚点丢失，或双 Host header 自洽改成旧格式，都不能降为旧调用路径。独立 reader 对 Runtime input 和 claim 的自洽修改也重新核对原 key。

原预算占用回执先在外层原调用 claim 以 wx + fsync 固定完整摘要，再保存专用原件。只改单一占用字段，或同时更改专用预算回执和 dispatch 摘要，均被拒绝。汇总现金和积分仅在每项原占用均有独立锚点时有确定数字；占用返回丢失、回执缺失或旧记录未固定独立摘要时，金额为 null，不当成0。不释放、自动退款或结清任何原占用。

共同采集的原件最多每轮10项，加两份 header 与首次登记3项，最多64轮643项；共享观察资料容量纳入这个实际上界。独立核验逐份重读原字节，并核对期间未变；这仍不是物理容量或历史保管资格证明。

## 明确兼容边界

242 Schema、用户库10、原启动账本1保持。header2仅用于新专用 Host；旧非专用 header1保持原形。旧专用原件可只读核验线协议，但缺少新预算锚点的金额未知、原必需身份未固定，不能作为完整正式账户 / 预算资格。NotRegistered只表示未声明新的必需登记，不能证明历史没有提供方请求。

旧原件不追加字段、不改写、不自动升级；已提交 Kernel 原 Command 仍精确重放原收据。新正式组合不能将旧 Host 重绑成 header2或重开旧 Run。D-255 的 Node 原件丢失和启动超时保留为未解决记录，新的运行通过也不证明旧资源已经清理或保管稳定。

## 仍需完成

真实账户服务、具体型号 / 套餐 / 现金及积分上限批准、持久单一账户预算与提供方原账单核对仍未完成；usage不算账单，所有 model_account_custody_proven / costs_reconciled / formal_agent_execution_enabled 保持false。此次将原件共同采集和 Kernel 结果重验接成可执行路径，不宣布费用已结清或Task验收通过。

下一批继续持久账户服务和原费用核对、正式领域结果验收、物理配额 / 历史容量和异常恢复；真实 Skill与Plan / Task前Human / Matt、完整Matt及当前源码新鲜Superpowers / 行为对照、正式工作台原操作恢复、真实普通Change到ReadyForDelivery及S1接入指南五组全部保留。具体付费条件未批准前，不读真实Key或发送付费请求。

分阶段验证：类型修正前冻结生产源码的受影响10文件136项，136通过 / 0失败 / 0跳过；仅修正测试context类型后，完整LocalApp原观测文件14项，14通过 / 0失败 / 0跳过。最终完整Windows / AppContainer生产执行期限组合1文件3项，3通过 / 0失败 / 0跳过。各对应623源码文件验证前后零漂移，不合并成全仓库或完整S1验收。类型检查和CLI帮助通过；先红8项及两组2项篡改反例、早期夹具和类型失败全部保留在[研究记录](../research/CimiLoop-专用模型原件共同核验-2026-10-10.json)。公开本机TLS / 账户 / 凭据仍为构造夹具，不能计真实模型、Skill、Matt、Superpowers或S1。

实际专用组合共同保存33份提供方原件，独立摘要为3轮Observed、原必需身份与预算身份固定、构造现金上界90 / 积分上界0，未结清；同一Kernel观察保存这份原集合。两个正场景采集为Native Verified；最后Human在最终核权等待时撤权，原SDK不恢复，采集仍Unknown、模型调用0、原Unknown观察1，不把三项断言通过写成三次执行成功。本次采集时原二进制均能复核，不证明长期保管稳定或修复D-255原件丢失。

参考：[实施设计](../plans/2026-10-10-cimiloop-专用模型原件共同核验实施设计.md)、[原SDK与IPC账本](CimiLoop-SDK调用与IPC原字节账本-v0.1.md)、[原产物领域核验](CimiLoop-原执行产物领域依据与Kernel核验-v0.1.md)。
