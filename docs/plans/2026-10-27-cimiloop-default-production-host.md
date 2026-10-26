# 默认 Codex 宿主生命周期与原准备回执恢复

接续 `9d76ddd`。完整 S1 五组、Schema242／项目库10／Host1 不变。本批把默认宿主的打开、借用与释放接到现有 CLI／工作台应用入口，并实现原 Human 准备回执的独立只读恢复。默认真实四项 Runtime 控制来源仍未安装；自动装载路径不等于正式 Agent 已取得生产准入。

## 默认组合

`openInstalledCodexProductionHost` 从原安装打开已有账户、同卷储存和官方登录目录，再创建具体生产保管器及共享 `LocalAgentRuntimeAdmission`。不接收命令 JSON 的 full 回调、调用方、检查配方或模型工厂，不创建账户、批准 Provider 或发起模型请求。缺一项原始来源即拒绝，不回退旧 HTTP 账户。

每个原 store 只有一份正在打开／已打开的默认宿主；并发请求等待同一打开结果并各自持有引用。最后一个引用关闭时才恢复自己安装的核验端口，释放保管器和原账户句柄。已有显式受信任宿主仍归原调用者所有，默认服务不会关闭它。Host guard 复核 store、Kernel、Human 实例、路径、原 execute／授权方法及所有借用来源；await 后变化拒绝，打开失败只关闭本次实际取得的对象。

普通 Human 的 PrepareRunContext／ReserveRun 由新的共享异步应用入口处理。CLI 等待该入口；工作台现有 `executeLocalCommandAsync` 同样复用它，并传递原会话守卫。人工执行、其他命令和同步受信任入口保留原 Kernel 路径。工作台不在启动时强制占用宿主，缺生产条件仍可使用已有人工界面；需要 Agent 准备／启动时才尝试打开。

默认 `productionAgentRuntime` 复用该宿主中的原账户、储存、登录目录和准入，不要求用户手工构造内部对象。原启动服务仍先查原 Run 注册；原件已经存在的查询／接续不因新增默认工厂而重开 Run。新运行租约在原 start promise 完成后释放，不能因释放一个借用者提前关闭其他请求的原宿主。

## 独立生产保管器

具体保管器每次 Context、启动、工具和模型检查都从已安装的 Provider 核验器重新计算原资格。Kernel 新增内部只读 `readCurrentAgentProviderQualification`，核对当前 Binding／Descriptor／Evaluation／Evidence 关系，再完整执行已有原件评估算法；Runtime 必须保存显式四项控制扩展，旧 ALLOW、旧孤立技术证据和只改结果字符串不能放行。

保管器同时读原安装程序、账户政策／拨入证明、完整写根和原物理配额、登录目录。原固定 Runtime 程序必须匹配 Provider 来源字节，全部证据和原业务输入保存为内部不可变准入引用。复核重新生成完整依据并比较，不能只读某个通过标签。原技能读取器复用安装对应的 `LocalCodexNamedMethodOriginals`；外层 Kernel 始终负责当前业务权限和 Run 身份。

**当前默认 Provider 核验器没有网络／费用／全部物理配额／完整恢复的四项具体读取器，因此真实保管器明确拒绝。** 本批没有用账户有限次数、磁盘路径同卷、受控回调、构造 ALLOW 或历史模型结果替代它们；后续仍必须完成实际来源及其生产接线。

## 原响应恢复

已完成的 Human→Agent 准备命令先查原 SQLite 回执，再打开原受保护安装，核对 Host1 中原 `human_agent_preparation` 映射、原 Human 命令摘要、完整 Agent 转换结果和原回执摘要，最后再次核对当前来源及回执。此路径不执行 Kernel 命令，不打开模型账户、费用源或完整资格工厂，不创建另一 Context／Run，也不重写映射。

同 command_id 换业务输入明确拒绝。仅有回执而原映射丢失时保持不可核对，不能拿回执存在推测可再次提交。已打开的受信任宿主直接借用它保留的原 Host1；该只读守卫核对原宿主所有权和原身份，独立于现在是否仍可执行模型。宿主已关闭时才打开对应的原安装元数据。两者均不回退另一宿主，不把缺件当作可重建。新电脑找不到原件不证明已清理。会话关闭／过期或原身份变化，不论打开成功还是失败，均在 await 后复核并拒绝旧会话结果。

## 实际验证

公开异步入口反例先运行，1项失败、2项未运行，确认旧代码缺该函数而非模块加载错误，见 `.cimiloop/codex-2026-10-27-production-host-entry-red.json`。随后新增生命周期／恢复覆盖。

本批首次类型检查发现数组 includes 未收窄命令联合；改成明确的 PrepareRunContext／ReserveRun 判别。另两次检查发现新测试误用其他签名的 changeCommand，现改为完整原 PauseChange 命令。最终 `pnpm check` 通过。

首个应用整文件7项通过、0失败0跳过，报告 `production-host-first.json`：真实 Kernel／SQLite／检查安装与原 Host1，证明冷打开与引用计数、只读回执、映射丢失拒绝、await 后授权方法变化拒绝，以及缺独立来源时零 Context／零模型占用。正例 full／账号安装／物理储存是明确 PUBLIC 夹具，不是生产资格。

受控绑定完整文件19项通过、0失败0跳过，报告 `production-host-qualification.json`。其中新增两项实际重读构造的原探针字节，拒绝支持标签不变但控制依据改变，以及已批准程序字节改变。它们验证 Kernel 原件算法与本批内部读取入口，不是实际 OS／模型／费用验收。

首轮受影响五个完整文件为44通过、4失败、0跳过，报告 `production-host-affected-first.json`。工作台会话13项、默认入口4项及CLI准备3项完整通过；Provider选择3项与共享准入1项失败，均为旧默认缺项预期。现无安装仍保留原提示，已有安装改为实际尝试默认组合，缺原账户时明确拒绝；不会读取旧 HTTP 连接。旧测试已改为核对实际账户打开一次、零派发，而非要求默认宿主从不打开。

随后针对手工受信任宿主原回执增加反例，1失败、7项未运行，见 `production-host-borrowed-red.json`。旧读取器错误地要求额外的 Codex 安装。现保留原 Host1 的独立只读通道，完整执行资格被撤回时仍只能返回原回执，不能恢复执行资格。

修正借用原件读取后的四个完整文件17项通过、0失败0跳过，报告 `production-host-fixed.json`：默认宿主／回执8项、Provider选择5项、编译CLI准备3项、真实DOM／HTTP准备恢复1项。浏览器在准备、预约各丢一次成功响应后，保留原请求并分别只有一个 Context／Run，原 Host1 只有两项对应映射；实际恢复不重开账户或调用 Kernel 执行。正例仍含 PUBLIC 完整资格，不是实际生产允许。

原共享准入文件按改动范围另选6项复验，全部通过、17项过滤未运行，报告 `production-host-selected.json`。包括实际默认账户打开、缺件拒绝、await 后租约失效、普通模型工具子集及父 Skill 组合。不能把17项过滤算通过，也不将该文件称为最终整文件全绿。此前19项受控绑定完整验证单独保留，不把分阶段报告拼成一次完整回归。

最后复查又以两个独立定向反例确认新增异步边界缺陷：释放后响应守卫可在返回 void 时改变 Human 身份而仍返回成功；调用方在账户 await 期间修改请求对象，会改变原待提交命令。分别为1失败／8过滤和1失败／9过滤，保留 `production-host-final-guard-red.json`、`production-host-request-red.json`。现请求进入异步路径前分离快照，后续只读恢复及 Kernel 执行均使用同一快照；每次外层回调前后都复查原身份。原操作已经提交后，失效响应仍拒绝，但原映射／Context／回执保留，不回滚或重复创建。

这两项修正后 `pnpm check` 通过，最终四个完整文件19项通过、0失败0跳过，报告 `production-host-final.json`：默认宿主／回执10项、Provider选择5项、编译CLI准备3项、DOM／HTTP准备恢复1项。它替代此前17项的阶段结果，不能重复累计。两个新用例同时核对已提交操作仍只有一个原 Context／映射、零模型占用。

CLI／工作台编译帮助、文档 UTF-8／代码围栏／新增链接和 diff 检查在提交前复验。本批未运行全仓 `pnpm test`、完整 Windows/AppContainer Native、真实物理卷、模型、技能或账单验收；真实模型请求0。早期类型错误、四项旧预期失败及三个后续异步／原回执反例均保留，不改判。六个既有未跟踪文件未读、未散列、未暂存或删除，只提交本批明确文件，不 push。

## 继续工作

四项真实 Runtime 控制来源、真实 Skill／Human／Matt、完整 Native 与异常恢复、真实账单、普通 Change 到 ReadyForDelivery、指南实走和最终 Matt／Superpowers 仍是同一完整目标。新宿主没有自动批准任何 Provider，PUBLIC 正例不授权真实模型。遵循已确认的 Codex 登录及测试优先 gpt-6-luna；本批尚无真实模型请求，不 push，不处理六个既有未跟踪文件或旧 Unknown。
