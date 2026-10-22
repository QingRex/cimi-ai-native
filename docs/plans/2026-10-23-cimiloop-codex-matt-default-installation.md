# 默认 CLI／工作台的 Codex Matt 固定安装

日期：2026-10-23。代码基线 `ef0f822`。本批将已有具体 Codex Matt 方法接到默认入口：显式本地安装后，普通 CLI 和 `startWorkbench({ projectDir })` 可以发现同一受保护登记，不需要编写注入工厂。真实测试使用用户批准的现有 Codex ChatGPT 登录及 `gpt-6-luna`。正式模型默认仍为 `gpt-6.1-sol`。

本批不是 S1 完成或完整 Matt 资格认证。方法继续标为 `unqualified_method_execution`；Kernel 的独立 Plan／Task 前置核验没有放宽，正式 Agent Run 的生产组合也没有由这个方法安装动作代替。

## 安装和默认读取

新增正式命令：

```text
node apps/cli/dist/bin.js clarification install-codex --project-dir <项目目录> --binary <当前Codex原生codex.exe> --repository <固定Skill源码Git目录> --file packages/skill-adapter/candidates/matt-clarification.json --model gpt-6-luna --disable-mcp-server <本机已配置的外部MCP名称> --yes
```

`--binary` 同目录必须有 `codex-code-mode-host.exe`。主程序和工具宿主一起复制到受保护安装目录并固定摘要／物理身份，不能用单独的主程序代替运行包。没有外部 MCP 时省略 `--disable-mcp-server`；不要填写不存在的服务名。本次机器实际配置并禁用的是 `node_repl`。若固定源码调查需要文件，另传 `--fact-commit <当前项目完整commit>` 和 `--fact-path <明确源码路径...>`，只接受有界、无遍历的固定 Git 文件；拒绝常见凭据文件路径，不读取工作区任意文件或用户登录文件。

`--yes` 缺失时在打开项目或读取登录之前拒绝。安装只通过受限 CLI App Server 读取 `account/read` 的非秘密账号元数据，固定账号指纹；不读取 auth.json、提取令牌、转换 API Key、启动模型线程或发送模型请求。安装从当前真实 Human／项目／实例、仓库位置和物理身份建立绑定，不接受仓库 JSON 自报批准。

安装保管为 `%LOCALAPPDATA%/CimiLoop/matt/<project-id>/<actor-id>`，使用现有 Windows 受保护 Host1 不可变登记。首次申请就固定材料物理身份及 originals 目录身份，再写激活记录。申请已写而激活未写时，重试只能核对同一申请和同一原件；已经激活时重试只读原登记。改模型、同字节文件替换、目录替换或原目录丢失均拒绝，不补建原件，不再次读取账号来更换原申请。

新私有安装／申请格式为 2；Schema242、项目库10、Host1 不变。开发中首次真实失败实验留下的私有格式1保留，不原地补工具宿主、改登记或升级。它不是已交付给用户的安装格式；历史澄清查询仍可用，默认执行显示资料待核对。后续如需要用户安装迁移，必须另外设计显式迁移和原操作映射，本批没有启动该迁移。

默认 CLI 仅在 `clarification advance` 的 `kind=matt` 动作打开已安装宿主；list/show/begin 和 Human 问答不读取登录。默认工作台只打开现有安装，返回 installed／missing／unavailable；缺失或损坏时保留人工和查询能力，不自动安装或修复批准。每次效果和原件读取前后核对当前绑定、受保护登记及材料，释放服务器或 CLI 时关闭登记连接。

## 真实接入结果

本批在仓库外新建普通 CLI 项目及 Change，用固定提交的实际测试项目源码 `src/query.ts` 做事实调查。测试范围是默认入口／真实方法接入，不是完整功能交付：

- 项目 `01a16501-dc6c-73ab-8217-165d430212ee`，Change `01a16501-e41a-712a-be82-8a76dddcc9a8`。
- 会话 `98746bd9-1f1d-47d1-b86e-f1d650d782be`，请求 `86af1758-7bb6-4c61-bbcf-e529d3c5fc08`。
- 安装摘要 `83bed54bd1dbd96454b5bbecafabcc58d38747b11440f0101435829e7094dee2`，测试源码提交 `ff05ea70defded4d97e0d66bd96749f1333120bb`。
- 时间 `2026-10-22T19:06:25.565Z` 至 `19:10:25.832Z`，含初始化后安装、真实方法、CLI 重放及默认工作台 HTTP 核对。
- 实际调用固定 grill-me／grilling，读取完整原始输入和应用上下文，委派独立只读事实调查，得到3个待 Human 回答的问题及1项方法缺项。父方法实际计数1；该计数不是底层模型请求数或费用。
- 默认 CLI 原请求重放与默认工作台认证 HTTP 的原请求重放均返回同一结果。两次重放没有再调用模型；没有 Plan／Task 创建或 Human 代答。
- 父 stdio 原件 SHA256 为 `124de1798d3fbacb016f53038d45245f4f14a7c8d330748db5438acee09a702e`；另保留独立事实调查子原件。它们是实际 App Server stdio，不声称为 HTTP 线缆原字节或提供方账单。

项目、原请求及摘要保留在 `%LOCALAPPDATA%/CimiS1/codex-default-85a52568-85ee-4e0c-a57f-401efa4d4915`；受保护安装及父子 stdio 保留在对应 CimiLoop/matt 根。执行脚本位于忽略目录 `.cimiloop/codex-2026-10-22/run-default-codex-matt.mjs`，该脚本每次创建新测试项目，不是原请求恢复命令；不能靠重跑脚本恢复旧操作。

首次独立测试项目 `codex-default-b0c99bb7-1d12-4baf-90b2-15e2eb6d484e` 只复制主程序，真实模型完成回合但工具宿主没有启动，未能加载固定 Skill。应用正确拒绝采信，并保留原 pending 请求 `db0ad7fb-9bcf-42e2-8ad2-bebefc1eca50` 及已封口传输原件；同请求重读未重发模型。修复后另建上述独立验收项目，没有重开失败原操作，也没有把失败回合计为成功方法证据。

## 验证及边界

Node24.19.0、pnpm12.4.2。按锁文件 `pnpm install --frozen-lockfile --ignore-scripts` 成功；没有更新外部依赖版本。最终 `pnpm check` 及编译 CLI 帮助、缺 `--yes` 的拒绝检查通过。

分阶段回归：运行包修复前11文件122项通过、0失败0跳过；最终安装文件整文件11项通过、0失败0跳过。其余10文件114项的相关源码未再改动，因此合计覆盖11文件125项，但不是一次最终11文件整轮。报告分别为忽略目录内 `codex-installation-regression.json`、`codex-installation-bundle-final2.json`。覆盖实际 Windows Host1／SQLite 的安装、默认工作台发现／损坏时保留查询、原申请中断恢复和物理替换拒绝，以及既有方法、共享澄清、前置门禁与页面恢复。缺少 LOCALAPPDATA 的默认主机保持未安装，该反例修复前失败、修复后通过；这不是在其他操作系统上执行原生验收。Host1 测试使用 PUBLIC 登录／可执行文件夹具，不能作为真实模型、真实 Skill 资格或完整 Native／AppContainer 验收。

安装阶段原有3项失败来自严格 JSON 的 null 原型比较；已在保留重复键／危险属性拒绝后规范化。独立复审另发现申请与激活之间的物理身份窗口，已把材料／目录身份提前写入首次申请，并增加真实 Host1 中断反例。登录检查的坏帧失败锁存、关闭后 guard、账号读取不响应的有界超时均覆盖；一次尝试用继承管道制造关闭挂起的测试未成功制造该状态，已经换成实际子进程不响应 account/read 的反例，不声称前者得到验证。最终独立复审未发现新增必须修复项；评审未另跑测试或模型。

没有运行全仓 pnpm test、新的完整 Agent Windows／AppContainer 原生回归、真实提供方账单核验、普通 Change→ReadyForDelivery 或完整 S1 验收。实际调用不代表账户费用结清、物理配额生效、完整异常恢复、Matt 独立完整评审或 Superpowers 对最终候选的新鲜验证。

## 继续实施

继续完整非阻塞 Matt 调查／Human 澄清及独立 Plan 资格；把现有 Codex 登录组合接到正式 Agent Run、固定检查、领域结果和观察服务；完成预算、额度／账单、物理配额、历史容量及异常恢复。默认工作台 Agent 执行、查询／停止／原身份恢复，真实普通 Change 到 ReadyForDelivery、最终源码独立评审和完整接入验收继续保留为同一个 S1 目标。
