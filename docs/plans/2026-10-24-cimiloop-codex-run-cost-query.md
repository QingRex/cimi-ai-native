# Codex 原 Run 用量接入费用查询

基线 a2d3432。完整 S1 五组、Schema242／项目库10／Host1不变。本批补默认 CLI 与工作台只能查询 Dedicated 账户、不能消费 Codex 原调用与账户预约的缺口。用量与普通额度许可不提供账单证明，费用继续 Unknown，不产生领域观测或释放预算。

1. 通过现有原字节 reader 与真实 Host1 容量票，逐调用连接 scope、原 SDK 请求摘要、Codex header 摘要及输出预约。缺响应保留占用，不重新发送。展示可核对 token；缺原账单时现金和积分为 null。只覆盖当前 Run，明确不代表整个 Skill 家族结清，不暴露其他项目预约。
2. 共享 Human 查询服务增加独立只读 Codex 租约，保持 Dedicated 账单／领域费用观测工厂的原语义。默认查询按已安装提供方打开现有账户，缺失不初始化、不修复、不切换到其他账户。await 与释放后重核 Human 和原输入。
3. 编译 CLI 的 run costs 与认证工作台使用同一服务。工作台展示已核对用量与未知费用，Codex 查询可用不启用账单写入／结算按钮。
4. 先运行新增反例，再跑相关整文件、pnpm check、编译 CLI 和真实 HTTP 路径，独立静态复核，更新指南并本地提交，不 push。

PUBLIC 协议宿主、受控账户或只读查询通过，均不能算真实模型、真实账单、完整 Native 或 S1 验收。真实固定卷／完整 Native、正式账户费用结清、真实 Skill／Human-Matt 行为、最终源码独立评审及普通 Change 到 ReadyForDelivery 继续是完整目标的未完成条件。

## 实现

`readCodexAgentRunUsage`使用现有独立原字节 reader 和同一真实 Host1 账户容量票；不改变历史模型 summary／collection 格式。它逐调用核对原 scope、SDK 请求摘要、Codex header 摘要、模型／账号与普通额度账号、输出预约。额外同 Run 预约也保留，缺响应不补发。已核对 token 单独累计，未知用量为 null；仅覆盖此 Run，不暴露其他项目的明细或假称整个 Skill 家族费用已齐。

共享查询增加独立只读 `HumanAgentCostsFactory`，原 `HumanAgentAccountFactory`仍只用于 Dedicated 真实账单读取与领域费用观测。默认 CLI 和工作台直接使用新工厂，Codex 返回 `codex_usage`及费用 Unknown，现金和积分 null／CLI 退出1，不新增 Kernel 事件。没有真实原账单／核验器时不能推进费用核对；工作台仍能展示已核对用量，而非丢弃为一个通用错误。

独立复核发现当前安装目录会错误路由历史 Run，已改用原 SDK Host／Native 输入及残留原件的后端判定；未开始且没有模型原件的 Run 只在不存在其 Codex 预约时读取原 Dedicated。两种账户可并存，Codex 原安装丢失不能改读 Dedicated 零占用。后端判定与 Human／固定输入在 factory 和 release 等待后均重核。页面按当前 Run 展示账单能力，项目安装 Codex 不会关闭已有 Dedicated 历史 Run 的账单入口，也不把新 Codex 用量查询升级为账单结算。

## 验证记录与限制

新增原字节／容量连接四项反例在实现前4失败，修复后4通过；39项未运行不计为该文件通过。默认入口的首次红测先遇到本批夹具漏建项目目录，修正夹具后，实际共享工厂、编译CLI及HTTP三项均按预期失败，保留在本机报告。没有以夹具错误作为产品反例。

第一轮七个整文件88项通过，包含43项完整Codex原模型／SDK协议回归、默认Windows保护账户／SQLite、编译CLI、认证HTTP与浏览器。独立复核随后发现历史Run路由及同一路由的await窗口；已修复，并新增并存账户、原安装丢失及factory／release等待期间出现原后端的反例。最后静态复核确认该P2闭合，无新增必须修复；这不是完整Matt／Superpowers评审。

最终入口组合回归中，七个整文件48项通过；新增Codex入口套件在beforeAll的“安装后只读重开容量账户”发生一次失败，9项未执行。原目录保留，独立Node进程只读重开原目录成功、占用为0，未初始化或改写政策；针对同一路径的受控单项诊断1通过／8未运行，不能算整文件通过。失败根因尚未确定，不将之后的通过描述为已修复该初始化故障，也不以之证明原生稳定性。

随后单独执行Codex入口完整文件9项通过、0失败0跳过，含默认编译CLI、认证HTTP、真实浏览器脚本／HTTP、缺账户拒绝和Codex原安装丢失不回退Dedicated。根据每个文件最后完整结果去重，分阶段共九文件100项通过、0失败0跳过；不是一次全仓运行。Node v24.22.1、pnpm12.4.2，`pnpm check`与编译CLI帮助通过，文档UTF-8／代码围栏／相对链接及`git diff --check`通过。

| 整文件 | 通过 | 实际范围 |
| --- | ---: | --- |
| runtime-adapter/agent-codex-model | 43 | 原stdio子进程、SDK及容量连接；PUBLIC模型与账户，不读取用户登录 |
| local-app/codex-run-cost-entry | 9 | 实际Windows保护Host／SQLite、默认CLI／HTTP／浏览器；PUBLIC安装与未发送预约 |
| local-app/agent-account-billing-entry | 11 | Human／原后端的factory及release等待后复核、原账单夹具 |
| local-app/production-account-entry | 8 | 实际Windows原Dedicated账户、并存Codex安装后的历史读取 |
| cli/agent-account-costs | 7 | 编译默认入口、未知费用退出码及禁止序列化路径覆盖 |
| workbench/agent-account-billing | 7 | 认证HTTP、会话变化、原账户读取 |
| workbench/agent-account-billing-frontend | 7 | 浏览器／HTTP、响应丢失、乱序与导航 |
| workbench/agent-run-cost-observation | 5 | 实际Kernel费用命令与HTTP；PUBLIC账单认证 |
| workbench/agent-run-cost-observation-frontend | 3 | 原费用命令丢响应与重放，不新增效果 |

本机最终结果采用`run-cost-query-focused.json`中的runtime-adapter整文件43项、`run-cost-query-final-entry.json`中完成的七文件48项及`run-cost-query-codex-entry-final.json`九项；未将前一失败套件或受控单项的跳过计作通过。目录为`.cimiloop/codex-2026-10-22`，属于本机忽略的报告，不随Git迁移。没有用新增记录代替产品接线：默认命令和工作台实际共享同一原账户／用量读取路径。

本机再次核对仍为非管理员，`CIMILOOP_FIXED_VOLUME_PREPARED`为空，原准备目录不存在。未运行本批真实模型、真实专用卷正向／满盘、完整Native或全仓测试；不读取凭据、不结清账单、不放开正式Agent。S1五组和持续目标保持未完成。
