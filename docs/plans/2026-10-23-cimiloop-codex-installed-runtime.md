# Codex 账户与默认 Runtime 组合

基线`a0ca588`。继续完整S1的V1-09／V1-21／V1-22／V1-10／V1-11，不重新讨论既定架构，不把本批安装或夹具当作整体验收。Schema242、项目库10、Host1保持；新私有原件格式显式前瞻兼容，旧原件不补字段。

## 设计与实施顺序

1. 将安装时实际额度账号摘要固定到新原模型请求，并在实际发送前和独立stdio重建核对。已有策略只证明每轮前后相同，不证明与安装时相同。采用新Codex后端header8及原传输6，保留header1—7／传输1—5；账号或策略改变不能重开旧操作。
2. 建立项目／原Human绑定的受保护安装，复用Windows Host1，固定Codex主程序及工具宿主、Native Runtime、Node和检查模板的字节与物理身份。只读默认发现不创建批准、检查文件或账本；明确安装动作才读取CLI非秘密登录／额度元数据，不读取认证文件或转换令牌。现有Matt安装独立保留。
3. 将账户许可、原预算预约与原模型请求关联，保持提供方账单未知及未决预约；明确普通许可不是原子账户预留、账单或物理配额证明。账户、运行时、检查和模型的固定身份必须同时核对，不用“有安装文件”代替完整准入。
4. 在共享应用服务中同时组合创建Context前的准入、后续Run启动、模型／工具实时Kernel核验及资源释放。CLI和工作台默认发现同一安装；原操作查询／取消／采集／恢复继续复用现有服务。缺项或损坏时保留只读与原件，不转用旧HTTP连接或测试模型，不绕过完整资格、预算和隔离门禁。
5. 用真实Windows安装／编译CLI／认证工作台验证默认组合；批准的真实模型测试仅用`gpt-6-luna`，正式默认选择仍为`gpt-6.1-sol`。模型发送前重新核对普通许可；中断／响应丢失只用原操作身份读取，不重发。测试中的PUBLIC资格与预算不能冒充生产批准。
6. 完成相关回归、类型检查、文档和本地提交后继续真实Skill、Matt／Superpowers、新鲜Native／异常恢复／费用证据及真实普通Change到ReadyForDelivery。只有五组全部具备真实证据才完成持续目标。

## 验证要求

先写账号绑定及默认安装缺失的失败反例，再实现。独立原件读取应拒绝新旧格式混用、账号／策略替换、同字节物理替换、跨项目／Human安装和缺少原登记。默认入口不得从仓库JSON自行批准，不得以Unknown消失为清理证据。每阶段记录实际通过范围，不将选中用例、跳过、静态复核或零模型检查算作完整S1。

## 当前实现

第1项已实现：新后端`cimiloop/codex-agent-model/8.0.0`和原传输`cimiloop/codex-method-start/6.0.0`固定`quota_account_digest`，要求明确普通许可、非空且匹配安装的额度账号，完成后再次核对。旧版本继续原请求、推理、输出及额度语义，不向历史原件追加绑定；同原请求重放不发送模型。

第2项已实现：`installCodexAgentRuntime`在仓库外`%LOCALAPPDATA%/CimiLoop/runtime-codex/<project>/<human>`复用Windows Host1，固定项目／Human／仓库与数据目录、Codex主程序及工具宿主、OpenCode、Node、检查目录和模型原件目录。新私有安装请求与激活记录均为1.0.0，不迁移用户库、Host库或旧HTTP账户。安装中断后按原请求与原物理材料完成，缺失原目录或同字节物理替换均拒绝，不在查询时修复。暴露给可信组合的lease及嵌套检查／MCP数组已冻结，关闭后守卫拒绝效果。

CLI已有`runtime install-codex`与`runtime codex-installation`。前者显式要求`--yes`，正式默认模型仍为`gpt-6.1-sol`，测试必须显式选择`gpt-6-luna`；检查文件为WorkspaceCheckTemplate的JSON数组。缺少确认时不打开项目或读取登录。安装不调用模型、不建立Plan／Task／Run、不批准Provider或认定账单已结清。

默认`startWorkbench({projectDir})`的认证`/api/context`与CLI查询复用同一原安装。await后重新核对会话及关闭状态；缺失／损坏仅返回missing／unavailable。页面显示安装所选模型，且明确正式执行资格待核对；不因安装存在就把`agent_start_available`设为true。

第3／4项的完整预算、资格、Context前准入与默认实际执行组合继续实施。现有`productionAgentRuntime`仍走旧HTTP专用账户，不把本批默认发现冒充默认执行已完成。Kernel的`controlled_execution`评估目前仍对network_host_limits、cost_accounting_and_cap、disk_limit、crash_recovery固定返回inconclusive；后续必须接真实受信原件与独立核验，不能靠安装状态、手写ALLOW或PUBLIC夹具绕过。

## 实际验证

Node24.19.0／pnpm12.4.2。核心五个整文件85项通过、0失败0跳过：原额度20、原Codex传输26、Agent模型23、受保护安装13、编译CLI3。安装测试包含真实Windows Host1和SQLite，程序／账号／资格为PUBLIC，不能算真实模型、Native或S1证据。三条账号绑定、11条初始安装、冻结lease、CLI和工作台发现反例均已先行失败；中间测试字面量与可空值的类型错误已修正。报告`codex-installed-core-cli-workbench-final.json`。

显式真实测试整文件1项通过、0失败0跳过：项目保留于`%LOCALAPPDATA%/CimiS1/codex-installed-hvdQ4C`，时间`2026-10-23T08:58:07.022Z`至`08:59:55.279Z`。实际编译CLI完成安装与查询、默认认证HTTP发现同一安装，随后一轮真实Luna／原SDK交换固定该安装账号，输出58token。原请求重放新增模型回合0、Kernel事件0。原请求、scope及摘要在该目录保留；受保护程序与模型stdio在对应CimiLoop/runtime-codex根。该项目业务／SDK scope为PUBLIC，没有Kernel Agent Run、业务工具、Native执行、Provider资格或账单认证，`productionQualification:false`、`nativeExecuted:false`、`costsReconciled:false`。报告`codex-installed-real-sdk.json`。

消费者分阶段五个整文件48项通过：工作台原启动5、会话await13、前端原请求恢复4、HTTP服务15、既有Matt安装11。最初组合45通过3失败：一条旧HTTP协议文案断言已改为对授权／预算门禁的检查，前端整文件4项复验通过；HTTP交接15秒超时后出现另一条事件数差异，独立文件复验14通过1超时。分段诊断记录Context准备到7.012秒、预约到12.478秒、交接成功到18.318秒，证明整个多步骤场景超出测试框架15秒时限；仅该测试改为有界60秒，生产Task预算／原操作截止时间、重试及断言未放宽。最终HTTP整文件15项通过，交接17.917秒。原失败、诊断和最终报告均保留在忽略目录，不将诊断选择运行的14条跳过计成通过。

核心、消费者和真实SDK合计为分阶段11文件134项通过，不是一次全仓回归。静态独立复查未发现必须修复项，不计完整Matt／Superpowers评审。没有新增真实AppContainer运行或运行全仓`pnpm test`，完整S1仍未通过。
