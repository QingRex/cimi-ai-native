# Codex 原账户容量预约与 Runtime 组合

基线`59a6bd6`。本批执行既有V1-09／V1-10账户组合工作，不缩小完整S1五组。

当前普通额度许可不能原子预留额度。采用现有受保护Host1的同一SQLite写事务，对固定账户政策下全部原预约求和后插入；不是先查询余额再单独写入。政策与预约均用新增私有不可变票据，保持公共Schema242、项目库10和Host库1；不原位迁移旧账户。

1. 先验证容量耗尽、并发进程竞争、原请求重放、参数冲突、重启保留及未知请求不返还。固定政策限制模型调用次数和每次请求的最大输出token预约；实际tokenUsage仍不是账单，不能宣称输入／推理／现金／积分或服务端配额已经全部受控。
2. 为同一Codex账号／额度账号设置仓库外共享原账户，不以项目各自的安装绕开账号总预约。政策必须显式安装，不能在查询或启动时自动初始化。预算耗尽、丢件、物理替换和政策变化都应拒绝，不自动滚动账户或重开原Run。
3. 将原预约接实际Codex Agent模型端口及共享Runtime组合。原请求先占用，模型未知保留；已封口重放不能重复预约或发送。每次效果仍检查原安装、当前Kernel资格、账户许可和原Task时钟。没有完整资格及账单时，默认正式入口继续明确拒绝。
4. 暴露显式CLI预算安装／只读查询，完成受影响整文件和实际Windows Host回归、类型检查、独立复查、文档与本地提交。除非需要新证据，不重复已成功真实Luna操作；不读取认证文件。

完整生产资格、磁盘硬配额、历史容量、全部异常恢复、真实方法行为资格、Matt／Superpowers和真实普通Change到ReadyForDelivery继续，不能用本批容量预约替代验收。

## 已实现

Host1新增`reserveCapacity`／`readCapacity`，固定多维非负整数容量，完整原票据核对、求和与插入位于同一`BEGIN IMMEDIATE`。不同进程同请求返回同一原预约，竞争最后一个名额只有一个成功；更改原请求或预约维度拒绝。原预约不可变，没有超时释放或自动滚动政策。

`CodexAgentUsageBudget`把同一账号／额度账号固定为有限政策；模型调用每次预约1次及该请求max_output_tokens，最高2048。`createBudgetedCodexAgentRuntimeModel`把政策摘要固定进原模型准入，模型发送前先持久预约。Host已封口重放沿原回执返回，不再预约；只有预约而没有可闭合原发送的请求保持Unknown，拒绝再次选举发送。预算检查进入底层authority的异步check前后及同步beforeEffect前后，保留原独立Kernel权威检查。

共享`LocalAgentRuntimeComposition.openCodex`已接原Codex传输、账户预算、完整Task包、检查、原Task时钟及可选父Skill宿主。账户原件守卫贯穿prepare／launch，关闭或丢件时拒绝Native效果。该工厂要求可信代码显式安装独立的当前Kernel／模型资格核验器，不提供自动ALLOW；默认`productionAgentRuntime`完整Codex资格／Context组合仍待继续。

固定检查另经`assertInstalledConfiguration`把完整模板和Node路径与已安装的检查服务精确对应，并复核原物理安装；Runtime每次守卫同时检查该关系。空／错目录先行失败反例，不能只证明“两个检查目录分别存在”。可选父Skill只接续已有原宿主；子Skill的完整Codex账户／真实业务执行工厂仍须继续，不把父目录透传当作真实子执行资格。

账户容量库位于仓库外`%LOCALAPPDATA%/CimiLoop/codex-usage-accounts/<账号组合摘要>`，跨项目共享；另外的受保护`codex-usage-registry`记录账号原目录、Host和政策。每个项目安装保留同一registry／账户的挂接锚。只读发现不初始化或修复任何账本。登记存在而容量库丢失，即使由另一个项目首次挂接也拒绝；安装中断且原物理材料缺失不按空账户重试。

CLI新增`runtime install-codex-budget --max-model-calls <1—512> --max-output-tokens <总预约上限> --yes`及`runtime codex-budget`。前者是显式不可变容量政策安装，不读取登录文件、不调用模型或批准Provider；后者只读返回limits／held／remaining。模型账户不同于HTTP专用现金／积分账户，不把tokenUsage换算或冒充账单。

## 复查与失败保留

初始容量三个反例和账户／发送端口六个选中反例均先失败。独立复查另发现：只在项目安装保存intent，可能由其他项目重建丢失的共享账户；以及原预约后的异步Kernel检查没有再核预算。跨项目丢件反例已证实旧行为会成功重建，现以独立账号registry修复；最终发送检查已补到原底层权威边界。首版物理丢件测试试图在Windows上移动仍打开的SQLite目录，rename未完成，不能把其失败当作有效原件丢失证据；测试改为先关闭该自有账户句柄，再移动原目录，完整原预约保留。独立静态复查确认两项关闭，不计完整Matt／Superpowers验收。

Windows安装回归首轮27通过1失败，其中只读用例误把其他账户已经创建的父目录视作本次查询创建；已改为核对查询前后账户目录集合不变，没有修改产品查询语义，随后Windows安装整文件17项通过、0跳过。中间失败报告保留，不能计为整轮全绿。

当前Windows账户、共享Runtime组合、模型响应、账号身份及资格测试材料均为PUBLIC；实际SQLite事务、独立进程竞争及Windows受保护Host为真实执行。没有读取认证文件、发送新增真实模型请求或生成提供方账单。之前真实Luna／Native成功原件只作历史兼容只读核验，不冒充本批预算真实模型执行。

## 最终验证

最终检查Node为`v24.22.1`，pnpm为`12.4.2`，`pnpm check`通过。分阶段七个整文件89项通过、0失败、0跳过：

| 范围 | 文件／项 | 报告 |
| --- | --- | --- |
| 原子容量、共享账号政策、实际stdio模型发送／拒绝／重放 | 3／48 | `codex-usage-core-final.json` |
| 原Host账本兼容 | 1／13 | `codex-usage-legacy-host-final.json` |
| 实际Windows受保护安装与跨项目账户 | 1／17 | `codex-usage-local-final.json` |
| 共享普通／父Skill Runtime组合与固定检查 | 1／8 | `codex-usage-composition-final.json` |
| 编译CLI安装入口兼容 | 1／3 | `codex-usage-cli-final.json` |

此前未全绿的`codex-usage-local-cli-final.json`不计为整轮通过；仅从其中取未再修改的CLI验证也已由最终CLI整文件重跑替换。选中用例的跳过不累计。检查模板额外约束加入后，相关组合整文件重新验证，不能复用加入前的正向结果。

CLI新预算安装帮助及原真实安装项目的只读缺政策返回已实际执行，不初始化真实额度账户。四份文档UTF-8／代码围栏／25个相对链接与`git diff --check`通过。没有运行全仓`pnpm test`、完整Windows/AppContainer业务验收、真实预算模型／账单、完整Matt／Superpowers或普通Change交付验收；完整五组仍未完成。
