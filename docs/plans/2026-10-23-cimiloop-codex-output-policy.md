# 新 Agent 操作的固定输出容量

基线 `5537d95`。真实 Luna 格式5操作已经正常提交、封口并完成 Native 读取／固定检查，但最终领域候选实际输出688，超过该原请求的512，不能通过独立结果核验。本批实现前一批计划中的显式输出策略，不修改失败 Run 或裁减真实 usage。

## 可执行组合

可信代码端口可显式选择 `bounded_2048/1.0.0`。策略进入 Host 原件、Codex 原件、Native 原配置中的固定 provider options、实际 SDK 请求及独立结果／终态读取。Native 实际 SDK 模型配置与受限 provider 同为2048；SDK 如果实际请求更小上限，仍取更小值。完整模型用量超过原请求上限即拒绝，不折扣 reasoning、不截断回执。

这是原SDK请求与结果采信的上限，不是Codex后端强制截断生成或账户预算已经保管的证明。原App Server回合仍可能实际超限并产生用量，此时保持Unknown，由原账户核对；不能因此认定额度或费用已结清。

| 原件／请求 | 无标记的历史版本 | 显式新策略 |
| --- | --- | --- |
| Codex 模型后端 header | 1—5，原策略不变 | 6，必需固定输出标记 |
| 普通／父模型 Host header | 1—6，各自原后端与工具语义 | 7／8，仅 Codex 后端 |
| 普通／父 SDK 请求 | 1／2，最大512 | 3／4，最大2048 |
| 普通／父 Native 配置 | 8／10，以及更早历史策略 | 11／12，必需固定标记并保持解释器启动策略 |

原 Host 不能接受新请求，新 Host 不能把旧请求解释成新策略。既有原件不能通过重新构造工厂升级／降级；未知、丢失、跨后端或 Native／Host 不同策略均拒绝。命名方法模式本批保留原策略，不借新普通／父模式开启它。共享应用服务捕获策略后才能组装 Runtime，不能擦掉标记。Schema242、项目库10及Windows Host1保持。

## 验证与交付

1. 先行反例：Host忽略未知策略、缺固定标记，Codex工厂忽略策略／可向旧操作追加策略，以及Native／IPC不支持新配置；分别记录失败再实现。
2. 原 Host、Codex stdio夹具、实际IPC流、实际编译C#配置／输出生成方法及父模式回归。夹具不证明真实模型、Skill或生产账户。
3. 类型检查后，在全新项目上用当前登录和用户选择的Luna执行真实Windows/AppContainer／SDK／读取／检查／独立结果与默认工作台观测。失败保留原操作；不重开旧Unknown、不延长旧Task时钟。
4. 完成相关消费者回归、文档与本地提交，不push。生产账户、费用、方法资格、完整默认启动和全部S1条件继续单独验收。

## 真实执行结果

真实增强验收1项通过、0失败、0跳过。原项目为 `%LOCALAPPDATA%/CimiS1/codex-native-CsNxRQ`，Run为 `01a166fc-18bf-7759-8e08-c074bb41a8cc`；时间 `2026-10-23T04:18:58.919Z` 至 `04:26:16.509Z`。用户批准的当前Codex登录／Luna实际完成3轮，完整输出计量分别198、81、655，reasoning均为0；没有修改前一批688超限的原Run。

同一原Native SDK经Kernel执行读取`src/query.ts`、读取固定检查源码、成功执行`query_test`。独立Native读取为Verified，匹配3次效果、0未匹配、0未解决；原IPC共6次交换，3个SDK工具调用均与原请求／响应关联。最终领域候选的作用域、任务定义版本、输出和检查回执经独立源码消费者核验，原SDK最终模型调用为`model_0003`，不能只凭模型返回JSON判定成功。

默认 `startWorkbench({projectDir})` 的认证HTTP观测执行后，Kernel事件序号25变26；同一原观测请求重放仍为26，模型仍为原3轮。观测费用保持Unknown，Task的100微美元夹具预算仍持有。测试项目业务准备、提供方资格和账户准入仍为PUBLIC，`productionQualification:false`、`costs_reconciled:false`、`task_acceptance_proven:false`。这不是正式默认Agent启动、真实Skill、生产账户或完整S1验收。

原始summary及观测请求保留在该项目的`.git/cimiloop`，模型原字节保留在独立Codex原件目录；失败原件均保留。忽略目录报告为`agent-output-native-2048.json`。之后的提交复验只读原件及重放已有观测Command ID，不创建新模型操作。

## 回归与兼容边界

核心7文件分阶段84项通过、0跳过，包含原Host15、Codex端口21、输出策略4、实际IPC流6、父模型11、父Runtime预检6、实际编译C#配置21。最初核心整轮83通过、1失败，之后一次独立C#整文件20通过、1失败；两次失败出现在不同用例的反射子进程退出、未到业务断言，报告保留。增加只输出自有夹具进程状态的失败诊断后，该C#整文件21项通过，未延长时限、加自动重试或跳过断言。根因尚未复现，不能宣称已定位为超时或环境问题。

消费者整轮5文件122项通过、0失败、0跳过：共享观测19、专用模型48、普通领域结果19、父领域结果31、父终态5。两组合计12文件206项，是分阶段覆盖，不是一次全仓回归。原生真实Luna用例另计1项通过；实际编译C#配置测试不等于AppContainer真实运行。

旧512路径的Windows/x64原生整文件3项通过、0失败、0跳过：真实AppContainer／SDK读取与检查、原模型等待取消且不重发、缺模型／账户端口时在启动前拒绝。模型回复与账户资格为PUBLIC夹具，没有真实模型请求。原项目`cimiloop-host-model-runtime-WKy5dW`、`-mbV5Cw`、`-nrjB14`均保留在`%LOCALAPPDATA%/CimiS1`，报告`agent-output-legacy-native-final.json`。与上面合计14文件210项分阶段覆盖，其中真实Luna场景仅1项，不把夹具原生回归计成真实模型或Skill验收。

最终`pnpm check`、编译CLI帮助、UTF-8／Markdown引用／代码围栏及`git diff --check`通过。没有运行全仓`pnpm test`，没有宣布完整S1验收通过。

旧真实后端原件已独立只读补验：`codex-native-OcryA3`仍是两轮Observed，`codex-native-a5ReHI`仍是三轮Unknown，输出194／80／688原样保留。这些读取没有模型请求，没有升级旧512策略。静态独立复查未发现必须修复项，未另跑测试或模型，不能代替完整Matt／Superpowers验收。

费用Unknown、预算持有、`task_acceptance_proven:false`不会因增大容量而改变；这不批准默认生产Agent或完成S1。正式Codex账户／额度与账单、完整方法资格、默认生产启动、物理配额／全部异常恢复和真实普通Change到ReadyForDelivery仍需继续。
