# Codex 登录连接到原 Agent SDK 模型步骤

基线 `caeb36f`。本批继续 V1-09／V1-10 的生产路径，复用 `AgentRuntimeModelHost`、Native OpenCode SDK、文件／检查 IPC 和 Kernel。已有 Matt 安装不是 Agent Run 批准，也不代替费用或额度保管。

## 采用的组合

不转换 ChatGPT 令牌为 API Key，不把凭据交给 Native SDK，也不新增 HTTP 代理。新增 `createCodexAgentRuntimeModel`，消费现有 SDK 原模型请求。复用严格 SDK 消息／工具校验，核对所有之前 assistant 消息确实来自原模型回执；将完整消息及工具定义作为固定数据交给已有受限 Codex App Server。

该 App Server 回合不执行业务工具，只产生严格结构化的 text／tool-call 建议。建议中的工具名、入参、唯一调用 ID 和 finish 必须经过现有工具 schema 和 SDK 回执核验。实际工具仍由原 Native SDK 经过原 IPC、当前 Kernel 及独立效果回执执行。Codex 不能自报费用、使用量、工具成功或领域终态；SDK 使用量来自实际封口 stdio 的 tokenUsage。不能为了通过旧512输出限制裁掉 reasoning token 或使用合成计数；超限时保留原件并拒绝采信。

每个原 scope／SDK call_id 固定为唯一 Codex operation_key，固化安装身份、模型／账号、准入摘要、完整 SDK 请求、Codex 请求及原件引用。外层 Host 仍在发送之前登记唯一 SDK 调用；内层 Codex Runtime 同样先登记原操作。丢回复／未封口不能重发；如果内层已经封口而外层未保存，可由同一原输入独立读取和补采，不重新调用模型。

账户准入采用必需的可信代码端口：异步校验当前原 scope 及额度／预算，且每次实际效果前必须同步核对当前 Human／Kernel／持有资源。缺端口不生成可执行模型工厂；测试端口只能标 PUBLIC。默认生产入口在完整账户、固定检查及原件核验组合安装之前保持拒绝。历史 OpenCode 专用账户和原件不迁移、不改写。

## 执行批次

1. 测试先行：完整 SDK 输入、结构化工具建议、真实 token 用量、消息历史防替换、跨 scope／账号拒绝、撤销、取消、同请求封口恢复、Unknown 不重发。
2. 实现 Codex SDK 模型端口及独立原件读取，不接受模型自报回执或账户信息。使用新后端标识，不能冒充 dedicated_zhipu 原件。
3. 将新增后端原件接到原 Runtime 采集和独立结果核验；新私有格式显式区分，旧格式保留按原版本验证。Schema242／项目库10／Host1不变。
4. 按用户许可用 Luna 验证实际模型交换；继续实际 Native／SDK／Kernel 组合。受控账户／资格不计为真实完整生产批准。更新验证范围、接入指南及剩余五组条件，提交本地 Git，不 push。

完整 S1 仍要求五组全部完成及最终源码真实验收；本批不以模型交换或局部回归代替这些条件。

## 已实现的接力与只读核验

新增后端 `codex_login/1.0.0`。普通 Host 原件使用私有格式5，父 Skill Host 使用格式6；旧 Host 格式1—4保留各自的严格语义。独立结果与终态消费者共用 `assertAgentRuntimeModelOriginalMode`，按后端、工具模式及版本精确核对，避免合法的父 Codex 格式6在执行后被旧3／4白名单拒绝。这里支持的是父模型端口及格式，不代表真实 Skill 已获资格或已验收。

采集增加私有 `cimiloop/agent-runtime-originals/2.0.0`，只有含 `codex_model` 的新采集使用它；旧采集继续格式1。共享观测服务和独立结果核验检查同一后端摘要、逐件名称／数量／固定 blob 地址及字节；冻结 Native 原输入还须包含相同模型 Host header／后端 binding。Dedicated 与 Codex 原件混入不能互相抵消成未登记。无论有没有实际 tokenUsage，都保持 `model_account_custody_proven:false`、`costs_reconciled:false`；不能因此认定 Run 成功、释放费用预算或接受 Task。

Codex 模型适配的私有 header 格式3—5使用现有受限客户端工具 `cimiloop_sdk_reply` 提交下一步 SDK 响应；它只登记建议，没有文件、检查或领域效果。封口原件必须含恰好一条真实提交、相同入参摘要和明确的 `sdk_effect_executed:false` 回执；最终 ACK 不能代替这条原调用。SDK 回执从原提交入参及完整 tokenUsage 独立投影，再经过原工具 schema 和历史响应核对。实际工具仍由原 Native SDK／IPC／Kernel 执行。

格式4为新 SDK 步骤明确选择 `reasoning_effort:low`。显式推理参数进入新的 Codex 传输原启动格式4、原请求摘要和实际 `turn/start`，只读核验逐项比对；篡改实际参数并重封公开夹具校验值也拒绝。历史传输1—3仍不含新字段，保持 medium；后端 header1—3继续按各自原策略、原输出通道读取和重开。工厂不得升级既有 Run 的策略，账号、模型、运行时、测试／真实来源或工具集变化均拒绝，不补写缺失镜像。SDK512上限和包含 reasoning 的完整真实计量保持。Schema242、项目库10、Host1没有变化。

格式5保留低推理，新增提交回执格式2：明确响应已经记录、业务效果尚未执行，下一步只返回最终 ACK。Native 工具在外层模型回合结束后才会执行，不能让模型等待尚未发生的工具结果而重复提交。历史格式3／4仍按原回执格式1逐字核验；重复提交继续拒绝，不接受第二份建议覆盖第一份。

## 真实执行与失败边界

环境 Node24.19.0、pnpm12.4.2；普通 PATH 中24.14.0不满足仓库要求，执行时明确选择符合要求的现有运行时。未读出令牌，未复制登录文件，未使用 API Key。真实测试使用用户批准的 `gpt-6-luna`，正式模型选择仍是 `gpt-6.1-sol`。

1. 原 SDK 模型交换已实际完成两轮：`%LOCALAPPDATA%/CimiS1/codex-sdk-9909610a-a79c-46d2-a83c-5ebe5896188c`，2026-10-22T22:59:46.207Z至23:00:29.196Z。原 scope 为 `01a165d7-8762-779e-918d-93d8538eeaac`，第一轮建议读取、宿主夹具实际读取自有固定源码，第二轮返回最终文本；重复读取无新增模型回合。这不包含 Native／Kernel 业务效果，资格和预算仍为 PUBLIC。
2. 首个实际 Native 组合保留在 `%LOCALAPPDATA%/CimiS1/codex-native-OcryA3`，Run `01a165e3-fca4-7780-80bc-0b59f998b0f0`，2026-10-22T23:12:52.151Z至23:18:39.370Z。实际完成两轮 Luna 和一次原 Native `cimi_read`。初版用例1项通过但断言过弱：独立领域结果补验返回 null，模型没有运行固定检查，不能称完整链路。原件、第一次回归和补验失败全部保留；没有重开这个 Run。格式2指令及增强用例针对另一个新测试操作继续验证，旧原件只读兼容已复验。
3. 更早的三个新测试夹具分别在目录托管、夹具根目录多出未授权元数据处停止，未进入模型回合。`C:/CimiS1/codex-native-7TXrZE`、`%LOCALAPPDATA%/CimiS1/codex-native-fI3PQQ`、`codex-native-LfiWyQ` 均保留。新测试数据改放项目私有 `.git/cimiloop`；不修复或覆盖失败原登记，不放宽 ACL 或授权范围。
4. 格式2的新操作 `%LOCALAPPDATA%/CimiS1/codex-native-kVDqNe` 实际只调用一次 Luna，没有业务工具结果，增强用例失败。保留原 Run 和全部封口／Native 原件，不重发旧操作。此后才增加格式3的受限响应提交通道；未将“模型回复或 Native 正常退出”当作检查或领域成功。
5. 格式3的新操作 `%LOCALAPPDATA%/CimiS1/codex-native-vI4hor` 实际完成三轮 Luna、两次 Native 读取与固定 `query_test` 检查，生成了引用真实 SDK 回执的最终领域候选。但最后一轮 outputTokens为534，包含 reasoningOutputTokens155，超过原512上限，原回执未被 SDK 采信，领域结果不成立。三份模型 stdio均封口，Unknown 原 Run 保留；不能裁掉155或把534改写成512。格式4在另一个新测试操作上验证较低的请求推理强度，不改旧 Run 或 Task 时钟。
6. 格式4的新操作 `%LOCALAPPDATA%/CimiS1/codex-native-vLqDOS` 的实际低推理参数已被接受，但同一外层模型回合提交了两份不同建议。第二次提交被拒绝，SDK 原请求保持 Unknown，没有执行 Native 业务工具。随后才引入格式5的明确交接回执；不放松唯一提交限制，也不重开原 Run。
7. 格式5的新操作 `%LOCALAPPDATA%/CimiS1/codex-native-a5ReHI`，Run `01a166de-ad85-7138-bb14-598ae3b13685`，三轮真实 Luna 都恰好提交一次并正常封口；实际输出计量分别194、80、688，reasoning均为0。前两轮已进入原 SDK，完成两次读取和一次固定检查；最后一轮688仍超过原512，因此严格拒绝，增强 Native 用例1项失败、0跳过。该次明确交接问题已解决，但输出容量仍不足，不能记为完整子链路通过。后续需要为新操作设计显式、冻结的输出容量策略，不修改该 Run、旧策略或原计量。

实际 SDK 交换与 Native 原模型 stdio、原文件读取、检查、清理、IPC、领域结果和费用分别判断。不会把1个弱断言通过或受控准入换算成 S1。

## 本批最终验证范围

- `pnpm check`通过。四个核心测试文件106项通过；最终格式5交接改动后的模型整文件19项通过，其中19项已包含在106项统计中。其余三个核心文件没有因交接改动改变实现。
- 五个消费者整文件85项通过、0失败、0跳过：普通结果19、父结果31、父终态5、父模型11、共享观测19。先前与真实 Native 并发时超时的历史容量用例，在独立单工作者整文件重跑中通过，没有增加其超时限制。两组共9文件191项，不重复累加模型19项。
- 格式5真实 Luna／Windows/AppContainer／SDK增强验收1项失败、0跳过，失败原因及原件见上。没有全仓 `pnpm test` 通过声明；没有完整正式默认 Agent 启动、真实 Skill、提供方账单或 S1 验收通过声明。

当前实际能力是原 SDK 模型接力、真实 Native 读取／检查、独立后端原件采集、父工具格式兼容及共享结果核验。生产默认组合仍缺可信 Codex 账户／额度与费用保管；新操作输出容量、完整物理配额／历史与异常恢复也须继续。V1-21还需完整真实 Skill 与澄清资格，V1-22还需针对最终源码的完整 Matt／Superpowers，V1-10还需默认正式启动与原操作恢复，V1-11还需真实普通 Change 到 ReadyForDelivery及完整指南验收。五组和持续目标均未完成。

## 下一批：冻结新操作的输出容量

真实格式5已经排除了重复提交和 reasoning 占用，仍然因完整领域结果与原作用域／证据 ID 的结构化输出超过512而拒绝。下一批采用可信安装端口显式选择的有界输出策略，先支持2048；从原 Host header、Native 原配置、实际 SDK 请求到独立读取均固定同一策略。旧原件继续512，不能给旧 Run 补策略或提升上限；新请求格式也不能被旧 Host 接受。账户准入、预算和完整真实 usage 必须包含相同上限，不能仅修改提示词或在响应投影时放宽限制。

先写旧 Host 拒绝新请求、超出各自上限、原件策略篡改和跨版本恢复反例，再连接 Native 原生配置与固定 provider 的实际输出上限。通过非模型回归后，只在新验收项目上执行 Luna。最终领域结果、共享观测原请求重放、费用 Unknown 和预算持有需同时验证。该策略不修改Schema242、项目库10、Host1，也不使默认生产账户获得批准。
