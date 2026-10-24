# Codex 原 Skill 调用的应用服务接入

本批接续 `2b1c3b2`，保持完整 S1 目标。实际阻断是命名方法已经有 Codex 传输及独立原件读取，但 `LocalSkillInvocationNativeComposition` 和结果采集仍只接受 Dedicated 账户。默认父 Runtime 的真实资格、Human 回答、固定卷和账单没有因此获得证明。

## 实施路径

1. 为新的固定卷登录目录命名调用增加私有模型 header16，协议行为保持 header13；普通调用 header15 和全部历史原件保持原义。通过真实 stdio PUBLIC 夹具验证工具、结果、重放与降级拒绝。
2. 在共享 Skill 执行组合中安装 Codex 分支，复用原 SkillInvocation、父 Run 的 Task 时钟、原 Native/SDK、同一账户容量政策和固定卷登录目录。每次副作用重新核验当前 Kernel 子调用权威，不能借用普通父 Run 模型 ALLOW。
3. 结果采集根据原模型身份选择独立 Codex 原件读取，完整保存对应字节。没有真实账单时仅保存 Unknown 候选；不让 Dedicated 账单为 Codex 调用结清。
4. 针对性反例后集中执行受影响整文件、`pnpm check`，记录实际范围并本地提交，不 push。

## 验收边界

PUBLIC 模型／物理卷观察夹具不能作为真实账户、真实技能或 S1 证据。不能用 token 消耗或本地容量票作为实际费用。已有派发在响应丢失、取消或账户不可用后仍只查询原操作，不重新启动。Schema242、项目库10、Host1 不变。

真实固定卷 prepared.json、该卷上的官方登录目录、真实账单来源及原 Matt 会话的 Human 回答仍等待实际输入。本批继续实现可独立推进的主链，不代替用户填写这些事实。

## 实现结果

共享组合新增 `openCodex`，消费现有安装、共享账户容量、受保护卷和登录根能力，复用原 Native／SDK／命名方法宿主。子模型只可使用命名方法工具，副作用前重新核验原 Kernel 方法、调用身份及当前权威。准备期间取消或替换 Kernel 方法拒绝派发；原派发即使账户后来不可用也只读恢复，不开启新 Run。

结果采集从原 SDK 模型标识选择 Codex 或 Dedicated 读取器。Codex 独立核对 scope、header、原派发及每轮返回；对应完整字节按原件摘要保存，任一缺件／改变不能靠捕获候选掩盖。原 Codex 传输的三份原件保留各8MiB上限，其他原件沿用旧限制，整体容量按64轮完整上界计算，不扩大历史 Dedicated 容量。Codex 未有真实账单时只可捕获 Unknown 候选，不能输出已验证成功，也不能把 Dedicated 账单映射到该调用。

新私有 header16 只把 header13 的命名工具／结果协议绑定到 start9 受限登录根；普通／父调用 header15 仍继承普通协议。PUBLIC 真实 stdio 夹具覆盖新格式、严格结果、只读重放及降级拒绝，不读取真实凭据。

## 已执行验证

反例先复现：header16一项失败；应用新增四项反例全部失败，包含错误后端账单可能被接受的问题。首轮五完整文件107项中106通过、1失败、0跳过；失败为超过4MiB的Codex原件在最后一次复读仍使用旧限制，已修正该末次读取。该首轮报告保留，不能称为全绿。

报告保留在 `.cimiloop/codex-2026-10-22/`：`codex-skill-header-red.json`、`codex-skill-app-red.json`、`codex-skill-affected.json`。后续整文件复验和真实Windows／AppContainer结果分别记录，最终汇总只选择每个完整文件的最新结果。

Node24.22.1／pnpm12.4.2下的 `pnpm check` 通过；三份文档UTF-8／围栏／54个相对链接及 `git diff --check` 通过。系统默认Node版本没有被修改；构建与测试显式选择符合要求的运行时。

最终分阶段六个完整文件109项通过、0失败0跳过。首轮失败文件由末次完整复验替代，不合并单项成功、不重复计数，也不把首轮称为一次全绿。

| 完整文件 | 最终通过 |
| --- | ---: |
| runtime-adapter／agent-codex-model | 47 |
| local-app／skill-invocation-execution-local | 30 |
| local-app／skill-invocation-codex-composition | 3 |
| local-app／skill-invocation-result-capacity | 5 |
| local-app／skill-invocation-verified-result | 22 |
| scenarios／skill-invocation-native-runtime | 2 |

末次两文件24项完整通过，报告 `codex-skill-final-native.json`；`codex-skill-validation-summary.json`选择六个文件的最终结果并固定本批三个实现及编译产物的摘要。实际原生文件覆盖Windows／AppContainer／Native／SDK／IPC／命名工具、成功及无效输出、丢失完成响应后的原身份查询与重试、候选和结算读取。模型回复、方法资格、账单与账户批准仍为PUBLIC构造，不是真实Codex模型／真实Skill验收。原生原件目录登记在 `codex-skill-native-originals.json`，全部保留，旧完整SDK／Bun故障和历史Unknown没有凭本批两项通过被关闭。

新增组合单元的OS时钟／卷／登录根／方法与Native派发使用明确的PUBLIC缝隙；它验证共享服务的身份、取消、模型配置和幂等，不能证明实际物理配额。真实Codex新header16的传输测试使用独立PUBLIC stdio子进程；本批真实模型请求为0，没有读取真实登录凭据。未运行全仓 `pnpm test`，未进行完整S1验收。

## 主链剩余

默认父 Runtime 的真实 Skill 宿主、Codex家族费用读取与结算、完整Provider受控资格、真实方法行为资格、真实普通Change交付仍继续。本批的应用服务组合和候选采集不证明这些条件，也不能使默认正式入口绕过缺证门禁。没有新增真实模型请求或账单，不宣布五组任一完成或S1验收。
