# Codex 原 Native Skill 调用

基线 `bf98704`。完整 S1 五组继续保持；本批接通现有固定 Skill 宿主与 Codex SDK 模型，不把 PUBLIC 业务资格、真实源码读取或单条 Native 调用算成 Skill 行为资格及完整 S1。

1. 先以失败反例证明：Codex 目前拒绝固定命名方法工具对，Native 也拒绝命名方法的已固定 2048 输出策略。保留旧格式原有权限，不向旧原件追加能力。
2. 新私有 Codex header9—13 专用于精确的 `cimi_invoke_skill`／`cimi_read_method_resource`，要求已有 2048 策略、普通额度许可和固定额度账号。原建议只由 SDK 执行，禁止混入工作区工具；重复及 Unknown 请求不重发。header9保留首次原策略，header10明确Skill定义只能通过invoke加载、非定义资源才用read，以及严格结果字段；header11提供精确两种客户端建议代理；header12／13提供完整结构化结果，13以局部引用保留同一Schema约束。当前新操作使用13，历史原件保持原语义。
3. 新私有 Native config13 明确对应原命名方法 config6 加现有解释器及输出策略。TypeScript 与实际 C# 独立校验一致，复用原 Skill 材料、Task 时钟、OS 身份和原 IPC 账本。Schema242、项目库10、Host1不变。
4. 使用已验证 Git 来源的真实 Matt Skill 包、真实 Luna、Windows AppContainer／Native／SDK，独立核对调用顺序、全部材料和最终固定结果。保留原件；重放不增加模型和效果。缺少源码、真实输出或 Native 证据时报告失败，不能降级成构造回复。
5. 完成受影响整文件回归、类型检查、独立复查、接入文档和本地提交，继续完整 Runtime 资格、账户费用／配额／恢复、真实 Skill 业务调用及普通 Change 验收。

本批不绕过仍缺失的生产资格和预算准入。已有 HTTP 专用账户的 Skill 组合保持原约束；Codex 默认生产组合尚需接原子预算及独立资格核验。

## 已实现与首次真实验证

固定工具对已接原Codex模型端口，实际Native新配置13对应原命名方法6、固定解释器及2048输出策略，旧1—12不追加策略。原Host沿用已定义的格式7，原传输仍用固定额度账号的格式6，无新增公共Schema或用户库迁移。

独立复查发现结果消费者未核对跨层输出策略。先以PUBLIC独立读口投影跑出2通过4失败：Native／Host／原input四种不匹配都会被旧代码错误接受。现已用原Host header分别核对Native和原input；无策略旧原件仍按旧模式。复查未运行模型，不计完整Matt或Superpowers验收。

第一次真实测试失败，报告`codex-named-real-sdk.json`保留。新建原操作在`%LOCALAPPDATA%/CimiS1/codex-skill-RyiT1Z`，开始`2026-10-23T09:37:09.993Z`。真实Matt Git提交为`6fd947921b935b7e1e69293a200400f0fdd5c15f`。四轮Luna输出215／207／203／190token，原Codex与SDK回复已封口；Native已结束且原资源记录显示disposed。固定入口／依赖／请求／输入四份资源都确有读取，但SDK另发两次不允许的定义路径重读，最终文本又带额外format字段。独立方法结果保持Unknown，不能算方法成功、恢复或S1通过。

原件还证明同一模型步骤的并行工具完成顺序可能不同于建议数组顺序。先以失败反例证明旧消费者误拒，再改为按原call ID匹配，仍核对唯一性、数量、参数、完成状态、IPC ordinal及步骤边界。模型指令修正采用前瞻header10／step5；首次header9／step4原字节不变。`codex-named-real-format9-failure.json`确认新代码仍可独立读取原四轮，额外模型回合0。没有重发该原操作或改旧截止时间。

第二次真实测试`codex-named-real-sdk-format10.json`也失败，原操作保留于`%LOCALAPPDATA%/CimiS1/codex-skill-wmdyRa`，开始`2026-10-23T09:52:05.277Z`。一轮真实Luna输出154token，直接声称宿主没有工具；原件证明没有实际方法调用，Native已结束且disposed，独立方法结果仍Unknown。`codex-named-real-format10-failure.json`已在新代码下重读确认，未发送额外模型请求。

header11／step6为此接入两个明确的Codex动态客户端建议代理，参数schema来自该次原SDK工具目录。代理**不执行Skill、文件或Kernel业务效果**，仅记录一份建议和明确标为未执行业务效果的提交回执。SDK建议ID同时绑定原scope、SDK模型call_id和Codex callID，独立重读重建同一映射。每个外层turn仍只允许一份代理或提交；只有原SDK后续真正调用固定宿主并留下IPC／Native证据，才算实际方法调用。header9／10的旧请求构造不变。新增代理失败反例先跑0通过2失败，再实现；类型检查通过。

第三次真实测试`codex-named-real-sdk-format11.json`失败原件位于`%LOCALAPPDATA%/CimiS1/codex-skill-G7lb1k`，开始`2026-10-23T10:08:45.639Z`。五轮Luna输出79／77／70／80／166token，前四轮实际客户端代理对应原SDK的入口、依赖、请求和输入四次方法调用，最终回合通过原提交工具返回文本。四份材料均确有读取；Native结束并disposed。但final candidate只是requirement片段，不满足完整ContractBody。独立核验正确给出Observed且method_failure_reverified=true，matched_calls=4，无成功output。`codex-named-real-format11-failure.json`在新代码下重读确认，新增模型回合0。

新操作因此使用结构化结果客户端工具cimiloop_skill_result，参数直接表达已有SkillMethodOutputSchema，包括完整可选ContractBody；回调仍用原公共Schema验证，再原样投影为原SDK最终text。不删除模型额外字段，不补造candidate或业务证据。header12／step7完整内联Schema超过原JSON深度16，在PUBLIC测试中拒绝且没有真实模型请求；保留该失败原格式。header13／step8以局部$defs／$ref表达同一完整Schema，保留原限制，不放宽通用解析器深度或改变公共Schema。header13不再安装或允许无结构的cimiloop_sdk_reply；正式结果的用途和证据引用仍由独立固定方法结果核验，客户端Schema校验不产生资格或Human批准。

只读补验模式不初始化可写Host、不调用execute／claim／采集，不创建模型、时钟或原调用槽位。它只核对固定Git源码、同一原安装／账号、Native／SDK／IPC／方法材料和预存原采集；只向测试输出写审计。普通执行场景另验证已封口回执重放，以及原唯一登记拒绝重复claim。独立复查指出可写重放API在丢件时可能重建槽位，现已改用纯reader，并增加本次已结束自有原操作的方法slot及SDK双slot受控丢件反例；保留相同物理原件并恢复，丢件期间必须零重建。

中间整文件运行的旧两步模型测试触及15秒测试框架时限。独立诊断在未改变生产超时／断言的情况下完成：夹具0.354秒、Host0.390秒、第一轮5.606秒、第二轮14.787秒、独立重读15.350秒。仅该测试框架时限设为45秒，原传输每轮10秒和生产Task时钟不变；诊断插桩已移除，原失败和诊断报告保留。选中测试的跳过不累计为整文件通过。

当前非管理员，未发现Mount-VHD命令；本批未更改系统配额或清理历史资源。物理磁盘配额、费用结清及完整异常恢复仍是V1-09实质缺项，不从安装／tokenUsage或资源消失推断已完成。

## 第四次真实执行与验证范围

第四次真实执行通过，报告为`codex-named-real-sdk-format13.json`。新原操作目录为`%LOCALAPPDATA%/CimiS1/codex-skill-1yqPJR`，时间为`2026-10-23T10:34:47.841Z`至`10:43:09.161Z`。使用当前已批准账号的`gpt-6-luna`，五轮实际输出46／46／45／46／133token；仍为固定Matt源码提交`6fd947921b935b7e1e69293a200400f0fdd5c15f`。

实际AppContainer／Native／SDK读取入口、依赖、请求和输入四份资源，IPC九次交换全部对应。独立原件核验得到`method_result_reverified=true`、matched_calls=4；最终结果是一条真实待回答问题，明确保留业务事实、Provider资格及委派能力缺项，没有伪造Human回答或ContractBody。已封口重放新增模型回合、方法调用及Kernel事件均为0；本次自有已结束原件的受控丢件检查拒绝且不重建槽位，原物理目录随后恢复。

分阶段受影响回归为十个整文件153项通过、0失败、0跳过：Codex模型与输出策略43项、结果及取消／中断消费者86项、实际编译C#配置及旧Windows/AppContainer兼容23项、本次真实Luna／Native Skill一项。只读补验另行重读同一原操作，不重复累计该文件或真实请求。没有运行全仓`pnpm test`，不是完整Windows原生验收、完整Matt行为评审、Superpowers验证或S1验收。

这些证据仅证明固定Skill子链路及原结果核验。PUBLIC业务资格、未结清费用、未完成的原子预算／Context前准入／默认生产组合仍保持缺项；不创建Kernel业务Run、Plan／Task或ReadyForDelivery。完整五组继续实施。

最终只读补验`codex-named-real-original-reconciliation.json`为1通过、0失败、0跳过，无新增模型请求。`pnpm check`通过，三份文档UTF-8／代码围栏／23个相对链接及`git diff --check`通过。中间一次check的编译器进程以Windows状态`-1073740940`退出、没有类型诊断；随后同一编译器直接build和未改配置的完整`pnpm check`成功，未据此修改生产代码或宣称崩溃根因已经确定。独立静态复查已关闭上述两项问题，未代替完整V1-22验收。
