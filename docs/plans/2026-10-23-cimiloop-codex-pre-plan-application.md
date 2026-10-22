# Codex 创建前方法接入共享应用服务

日期：2026-10-23；代码基线 `901755a7075a477d638e0d79729b1be92ecba7e8`。本批把真实 Codex 方法接入 `LocalPrePlanClarification`，通过认证工作台 HTTP 执行、同请求重放，并用编译 CLI 读取同一原结果。默认启动器尚未安装该宿主；完整 Matt 行为资格、正式 Agent Run 和 S1 验收均未完成。

## 实际行为

`CodexMattClarificationHost` 是受信应用代码安装的具体宿主，接受固定 Git 原对象包、原件 Runtime、模型及可选固定事实调查器。构造时重新核对完整 Git 证明；每次方法准备重新验证固定计划及引用。HTTP JSON、候选 Provider 描述、模型输出都不能安装宿主或宣称它已具备行为资格。

宿主把完整 Change 依据、原问题／Human 回答、此前步骤、当前请求及摘要作为固定应用上下文交给模型。`read_clarification_context` 必须在加载全部固定 Skill／输入之后、委派环境调查或询问 Human 之前实际调用；投影和历史读取核对完整工具返回字节。不能只给摘要、截断原会话或信任“我已读过”的模型文本。原输入最多131072字节，带来源封套的上下文最多192KiB，仍低于256KiB工具输出上限；没有把它塞进上游4000字的背景字段，也没有放宽上游固定文件的读取限制。

共享服务新增可选同步 `prepare`，在持久登记原请求之前验证宿主能处理该输入；随后再次核对 Human 身份、原 Change、会话及输入一致性。prepare 不发送请求或产生业务效果。登记后沿用原 invoke／双读／最后同步核验流程：同原身份只能首次 invoke；丢响应重放只读受保护原件，缺结果保持 pending。

前瞻性私有方法结果格式2明确携带 `qualification=unqualified_method_execution`，只将 `questions` 投影为带确定身份的 Human 待答问题；`unresolved` 保留在方法原件步骤中，不让 Human 回答环境缺项。格式1继续按其历史规则投影，既有记录不改写。该格式没有赋予 Kernel 独立 Plan 核验端口，也不能批准 Plan／Task。

可信安装必须明确给出 `origin`。PUBLIC 传输使用 `public_fixture`，真实模型分类必须安装具体 `CodexOriginalMethodRuntime`；来源分类和完整输入一起进入固定请求摘要。PUBLIC 测试真实调用计数保持0。真实调用计数只是方法执行记录，不表示方法资格、Native效果或S1通过。

## 真实接入发现及兼容

第一次真实 HTTP 测试的两份事实调查原件已封口，父模型也成功提交了 Human 问题；随后它调用 CLI 默认启用的内置 `sleep`。核心白名单拒绝这个未批准效果，父原件保持 pending。这是实际失败，不能算成功，也没有把原操作换成新身份“恢复”。保留项目为 `%LOCALAPPDATA%/CimiS1/codex-shared-26456ed8-b633-447c-9ba3-4a501a7a0653/project`，原会话 `48782a6b-0ed2-49fd-a376-2c3d234d2aa0`、原请求 `f1dca36b-e7b4-43a2-a5af-3d56db0c208d`；没有改写启动／字节／封口记录。

已通过本机 CLI `features list` 核对 `sleep_tool` 默认开启。新启动显式关闭它，使用私有 `codex-method-start/3.0.0`；格式1和2保留各自确切原配置供历史只读核对，未知格式拒绝。工具效果白名单未放宽。上下文提示要求记录问题后立即返回 JSON；实际 Human 回答由后续应用请求接收，不在模型进程中睡眠或轮询。Schema242、项目库10、Host1、澄清库DDL及user_version1未迁移。

旧格式1成功原件、旧格式2父子成功原件在新代码下均独立只读重放一致，没有发送模型请求。不能因为能重读旧原件，就追认旧隔离能力或允许重启旧操作。

## 已执行验证

环境 Node24.19.0、pnpm12.4.2。`pnpm check` 最终通过；最终六文件81项通过、0失败0跳过：Codex原件传输、固定澄清投影、固定事实调查、共享Matt执行、具体Codex宿主、独立Plan门禁。

新增反例先失败后修复：未安装完整上下文工具、格式2缺项被当人工问题、宿主输入无法处理却已登记 pending、PUBLIC 传输误计真实调用、内置 sleep 未关闭。中间一次宿主测试读取旧 dist 导致 prepare 缺失；重新编译后验证。中间测试类型错误已修正，最终类型检查通过。不能把早期部分通过结果当作最终整轮。

真实成功接入在 `2026-10-22T18:14:40.815Z` 至 `18:15:17.586Z` 完成，约36.8秒：

- 项目通过编译的正式 CLI 初始化，项目ID `01a164d2-64ec-711b-8f2a-219f25871051`；同一 CLI 创建普通需求 `01a164d2-6e70-75c0-a3d8-bbbd0373a6e4`，尚为Draft。
- 明确代码安装具体宿主后，通过工作台认证 HTTP 开始会话 `ac09be35-c9c4-4503-9576-417bbe2b2baf`，提交原请求 `a0e0b19a-2d02-4df1-b0f9-4a7d63beb354`。
- 首次和同请求重放均HTTP200且结果逐字节一致，head保持1，真实方法调用计数保持1；编译 CLI `clarification show` 能读取这份格式2原件。重放没有新模型回合，没有 Plan候选或Task。
- 模型实际为 `gpt-6-luna`；父线程 `01a164d2-8c9e-7b10-b44f-95e2a7c33343`，回合 `01a164d2-924c-7911-ad80-a7e61158584e`。实际7个工具调用包括入口、依赖、两固定输入、完整应用上下文、独立事实调查和Human问题轮次。
- 子操作 `257b342efa580b0c017d9ce62cc77274f74bcba21b99601ad2e53f97c324dd9c`，线程 `01a164d2-c04b-7591-a994-80a088582e3c`，回合 `01a164d2-c496-71f0-84dd-6d8af1994ef5`；实际读基线提交的Kernel前置澄清及local-app项目组合源码，没有把快照范围外的能力推断为不存在。
- 方法产出4个Human交互选择问题、2项源码范围／能力缺项；只有4个问题进入待答列表，缺项仍保留在方法结果。尚无Human新回答或决定记录。
- 父累计输入104345（缓存84096）、输出981（推理195），总105326 tokens；子累计输入32626（缓存14976）、输出768，总33394。这是CLI内部多次请求累计用量，不是单次上下文大小、美元费用或提供方账单结清。
- 父实际stdio摘要 `fa08f65f20f414c0d5195e99e4ab1a3fa74457b6e1fdaeddc98c9604c3a5e21b`。原始账户元数据仅在仓库外原件中，没有提取登录令牌、读取auth.json、写入Git或Agent上下文。

本次自有项目及原件保留于 `%LOCALAPPDATA%/CimiS1/codex-shared-2bf3318a-3464-48ca-9558-a3f78eb5c090/`。忽略目录报告：`codex-application-context-red.json`、`codex-application-format2-red.json`、`codex-pre-plan-host-red.json`、`codex-pre-plan-origin-red.json`、`codex-sleep-red.json`、最终 `codex-pre-plan-final.json`。独立代码评审提出的PUBLIC来源分类问题已修复，最终未发现新增必须修复项；评审未代替实际运行。

## 后续工作与边界

实际证明的是“显式安装真实宿主→认证HTTP→共享应用服务→原方法执行与保管→同请求重放→CLI读取”。默认 CLI／工作台启动器尚未发现或安装该宿主，页面尚缺方法按钮、分项缺项展示和服务器原请求恢复入口。不能说正式默认入口已经完成。

继续完成非阻塞 frontier、完整原Human理解确认与方法资格、严格Plan／Contract独立核验，以及生产Agent Runtime组合。Native／SDK／工具／模型／账户、物理配额、历史容量、费用账单、完整异常恢复、当前源码Matt独立完整评审、Superpowers新鲜验证、真实普通Change到ReadyForDelivery和完整指南验收都仍在总目标内。本批没有运行全仓pnpm test、新Windows/AppContainer原生场景或完整S1验收。
