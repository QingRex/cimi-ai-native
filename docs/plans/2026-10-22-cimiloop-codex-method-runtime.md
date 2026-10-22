# Codex 登录复用与固定方法执行

日期：2026-10-22。批次基线 `9244041`。本批新增可执行的 Codex App Server 方法适配，完成一次真实 `gpt-6-luna` 调用；没有将其登记为完整 Skill 资格、正式 Agent Run 或 S1 验收。

## 用户选择及接入

本会话用户明确选择复用当前 Codex 登录和模型；正式配置选择 `gpt-6.1-sol`，随后指定测试可使用 `gpt-6-luna` 节省额度。该选择覆盖本批 Codex 方法测试，不将历史 OpenCode Go 现金预算解释为 Codex 账单证据。

当前 CLI 为 `codex-cli 0.162.0`，本机核对为 ChatGPT 登录。适配器通过 CLI 的 `account/read` 接口读取非敏感账户元数据并生成指纹；请求前绑定该指纹，执行完成后再次读取并比对。没有读取或转换 `auth.json`、提取登录令牌、配置 API Key，或启用额外付费服务。

该路径不需要 `model-connection.json`。默认 CLI 和工作台尚未安装本批适配；其现有 OpenAI compatible 原 Run 组合没有被一个方法测试替代。下一批继续完整方法宿主、应用入口和生产 Runtime 组合。

## 实际代码能力

`CodexOriginalMethodRuntime` 用固定可执行文件及摘要、固定参数前缀启动 stdio App Server。它固定 OpenAI 提供方、ChatGPT 登录类型、指定模型及不允许模型回退的策略，关闭 shell、MCP、apps、hooks、memories、自动项目说明及外部插件。线程响应必须确认指定模型、受限权限配置、空项目说明来源和不请求额外权限的策略。子进程环境采用允许列表；账户响应不进入模型上下文。

每个操作先以排他且同步落盘的启动记录占有原身份；崩溃发生在 spawn 之前也不回滚该记录。重试只重读原件，缺原件保持 pending，不启动第二个线程／模型回合。固定输入、代码安装参数或批准账户改变时拒绝重放。此记录是创建前方法执行的私有记录，不能伪造或替代 Kernel Agent Run。

账本保留实际 stdin／stdout 的原行字节，先落盘再严格解析 UTF-8。工具效果之前登记 RPC ID 和 callId，拒绝重复或冲突；执行终态之后拒绝新的工具效果。成功封口先停止并等待子进程 close、排空输出、拒绝残留字节，再同步固定原始字节、文件物理身份及摘要。历史读取重新解析完整实际 stdio，核对原请求、线程、回合、账户、模型、工具请求／返回／完成事件、用量和终态；不接受仅凭最终 JSON 的“已完成”声明。

`CodexFixedClarificationMethod` 将固定 Git 包生成的声明式 profile 映射为 `invoke_skill`、`read_method_resource` 和 `ask_human_round`。模型先明确调用入口，再加载声明依赖、所有固定输入和引用；任意路径不可读。Human 工具保存一个当前 frontier 问题轮次，各问题带建议；返回 waiting，不编造 Human 回答。最终输出必须逐项对应真实工具记录的待回答问题，候选／Decision／业务命令不由此工具确认。

固定提交里的 `grilling` 要求一轮询问当前可回答的全部独立问题，与本机其他版本的一问一答规则不同。已补两独立问题的失败反例并修复投影。本批尚未实现其要求的独立环境事实调查委派，因此所有结果明确携带 `qualification=unqualified_method_execution`。读过 Skill、模型给出问题或输出通过类型校验均不产生资格授权。

Schema242、项目库格式10、原私有澄清账本格式均未迁移；仅新增前瞻性私有 `codex-method-start`、`codex-method-seal`、`codex-method-original` 和账户摘要格式1。

## 已执行验证

环境为 Node24.19.0、pnpm12.4.2；锁文件此前已按 frozen 安装。`pnpm check` 最终通过。最终相关回归一次执行三文件32项通过，0失败0跳过：新 stdio 传输16项、固定方法投影7项、既有命名方法原件宿主9项。

先失败再修复的反例包括：新增接口缺失；重复工具产生两次效果；终态后仍可执行工具；非法UTF-8被有损转换后接受；未换行尾部被遗漏；正常启动通知先于线程创建响应而被误拒绝；未绑定账户而接受错误账户；固定来源的 frontier 轮次被错误缩为单问。最终均已覆盖。中间类型检查错误已修正，最终类型检查通过。

真实调用在 2026-10-22T14:58:05Z 至 14:58:34Z 完成，约29.4秒：

- 模型：`gpt-6-luna`；原线程 `01a1641e-9f94-7c52-858c-8c3d577383c8`；原回合 `01a1641e-a772-7cd3-a38a-5de329a4f54c`。
- 原操作 `f4ae2af2-01ff-46ec-ae1f-5ebe77dcb910`。
- Skill 仓库 `https://github.com/mattpocock/skills`，提交 `6fd947921b935b7e1e69293a200400f0fdd5c15f`，Git 原对象包摘要 `f59f753f16a25d089441a5f8fca3e8c209fe8b84e1c5f19a316e73decc42aed2`。
- 实际5个工具调用：`grill-me`、`grilling`、原请求、原输入、Human frontier 轮次；得到6个待 Human 回答的问题，尚无人工作答。
- CLI 报告累计输入85111 tokens，其中缓存66176；输出1097，其中推理195；累计86208。它是多次内部模型请求的累计用量，不是一个请求的上下文大小，也不是美元费用或提供方账单结清证明。
- 实际 stdio 原件摘要 `6537f4e598b892409d937caa861bdf866cb12ebc95b866c7eee38838f698111e`。原件已同步独立重读一致，没有再次调用模型。

本机原件在忽略目录 `.cimiloop/codex-2026-10-22/real-matt-luna-f4ae2af2-01ff-46ec-ae1f-5ebe77dcb910/`。未将含本机账户元数据的完整原件写入 Git 或模型上下文。首次接入 `f6e79d43-e90e-48b8-9c48-4f36b347c76d` 因启动通知顺序拒绝，在其 stdio 中没有 `turn/start`，没有模型回合；原现场保持，不以新操作“恢复”旧身份。

中间报告保留于同一忽略根：`codex-method-red.json`、`codex-method-green.json`、`codex-method-review-red.json`、`codex-method-review-green.json`、`codex-fixed-red.json`、`codex-frontier-red.json`、`codex-startup-red.json`、`codex-account-red.json`；最终三文件报告 `codex-method-final.json`。

## 剩余条件

当前真实测试验证了登录复用、固定来源的显式方法加载、模型问题轮次和原件重读。尚未证明完整 Matt 行为、环境事实委派、Plan／Task 创建前独立资格核验、正式 Run 的 Native／SDK／工具／模型／账户全关系、物理配额、账单结清、历史容量及全部异常恢复。本批没有运行全仓 `pnpm test` 或新的 Windows/AppContainer 原生场景。普通 Change 到 ReadyForDelivery、最终 Matt 独立评审、Superpowers 新鲜验证和完整接入指南验收仍未完成。
