# 固定 Skill 隔离调用接入指南 v0.1

本入口用于取得首次独立方法调用原件，补齐方法资格的启动路径。它不创建业务 Plan、Task、Context、Agent Actor 或 Run，不批准 Provider，也不结清费用。普通 Change 到 ReadyForDelivery 的正式 S1 接入指南和实际验收仍须另行完成；本指南还没有在当前电脑的完整真实配置上执行成功。

## 执行前条件

使用 Windows x64、Node >=24.15 <25、pnpm12.4.2，按锁文件安装并通过 `pnpm check`。当前 Human 须具有有效的项目负责人指派。候选 Skill 由固定 Git 包导入；方法只使用固定材料 SDK，不取得任意文件、网络、环境或其他业务动作权限。完整包内方法依赖仍须实际调用，宿主不支持的 harness 能力必须保持未证明。

需要已有的 Codex 安装和原共享账户容量政策、原固定卷范围、同卷仓库外官方登录目录；模型使用安装中已批准的选择，真实测试优先 gpt-6-luna。账户、安装、注册账本、工具、项目、数据和登录目录都须通过同一物理配额守卫。不提供 API Key，不提取或复制登录令牌。

当前已有安装/共享账户如果仍在系统盘，完整兼容放置/迁移仍是未完成的实现工作。不要通过修改 LOCALAPPDATA、删除原安装、另建预算或复制登录状态来绕过。缺少配置时会在派发前拒绝；这不是实际原生验证通过。原 Native 控制器还要求实际可加载的路径长度，拒绝长根后不能复制/别名原控制器来伪装同一原操作。

后续显式迁移还须保留本入口的原容量票据、请求、取消、采集记录与样本3目录。新电脑或新位置找不到旧资源，不能作为历史 Unknown 已清理或可释放容量的证据。

Runtime Binding 必须是当前项目已由 Human 批准的原绑定。`isolated_provider_probe` 的技术资格只允许隔离采集；正式任务资格需要 `task_execution` 的完整 Runtime 控制证据，不能把旧隔离原件重新标成另一个 Binding。

可先查询当前状态，以下命令均从仓库中运行；对其他项目使用全局 `--project-dir` 显式指定其实际目录：

```powershell
pnpm cimiloop runtime codex-installation --json
pnpm cimiloop runtime codex-budget --json
pnpm cimiloop runtime codex-storage --json
pnpm cimiloop provider list --json
pnpm cimiloop skill probe --help
```

这些查询不会初始化、修复或批准原件；更多安装操作见 `pnpm cimiloop runtime --help`。

## 固定方法与输入

使用已有 `skill import`/`skill inspect` 接入固定来源。以仓库的 `packages/skill-adapter/candidates/matt-clarification.json` 为例，须取得其中完整 commit 和全部模块、LICENSE，不能猜测本机 Skill 缓存等于这个来源：

```powershell
pnpm cimiloop skill import --file packages/skill-adapter/candidates/matt-clarification.json --repository <固定commit的Git源码目录>
pnpm cimiloop skill inspect <descriptor-id> --json
```

导入只登记候选，输出不证明实际方法行为或 Provider 批准。入口方法名从 inspect 中的固定包入口读取。

在项目外准备 `method-input.json`。下面是输入形状示例，必须替换为真实需求、背景和约束，不能把示例或模型建议当作 Human 的回答：

```json
{
  "purpose": "clarification",
  "requirement": "填写本次需要澄清的真实需求",
  "background": "填写已知背景与仍未知的事实",
  "constraints": [
    "只返回本轮最关键的业务问题，等待真实 Human 回答",
    "不可验证的事实保留为 unresolved；不创建 Plan、Task、Run 或 Decision"
  ]
}
```

评审方法改用 `purpose: "review"` 及真实 `goal`、`spec`、`standards`。可通过 `--artifact <file...>` 显式选择固定评审资料，单份最多256KiB；CLI 把字节保存为不可变引用，模型不能指定外部路径。引用数量、整体上下文和输出仍受固定 SDK 的原容量限制。不要在输入或资料中填写登录凭据。

## 首次启动与原请求控制

先生成并保留请求 UUIDv7，第一次发送和重试始终使用它。以下仅使用当前命令行的任务变量，不修改全局目录或环境配置；普通的 UUIDv4 不是此协议的请求 ID：

```powershell
$skillProbeRequest = node --input-type=module -e "import { createInternalId } from './packages/protocol/dist/v2/index.js'; console.log(createInternalId())"
$skillProbeRequest
pnpm cimiloop skill probe start <descriptor-id> --runtime-binding <binding-id> --method <入口方法名> --request-id $skillProbeRequest --input-file <method-input.json> --max-elapsed-ms 180000 --json
```

新请求通过当前权限和真实资源预检查后，先在原 Host1 中原子预约历史容量并确定唯一派发者，再准备和启动 Native。预算复用原共享账户，不新增账户、重置容量或释放 Unknown。一个项目在此原安装下最多保留64个技术请求，包括失败和 Unknown；达到上限明确拒绝，不能清空历史绕过。

同请求、同输入重复 start 只读取原操作。即使首次响应丢失、进程退出、原 Native 还没有完整登记或只写入了原容量票据，也不会再次调用执行工厂。同 ID 换输入被拒绝。原请求 ID 不等同于业务 Run：传输层使用相同 UUID，但所有原件、时钟和控制器放在固定的 `skill-method-probe-originals/<project>/<request>` 命名空间，不进入业务 Run 的原件目录。

```powershell
pnpm cimiloop skill probe query $skillProbeRequest --json
pnpm cimiloop skill probe collect $skillProbeRequest --json
pnpm cimiloop skill probe cancel $skillProbeRequest --json
pnpm cimiloop skill probe recover $skillProbeRequest --json
```

cancel 先持久保存原取消意图，再传给同一 Native。准备尚未返回时收到的取消也会阻止随后派发。recover 需要已有原取消，只恢复同一原资源，不再执行方法。`Unknown`、观察超时、目录缺失或收到停止请求，都不能证明原进程结束、费用结清或资源清理完成。禁止批量清理历史临时目录、映射和 Profile。

collect 重读固定方法/SDK/模型/Native 原件。只有实际材料读入、完整调用关系、结构化输出和原 Native 结果都可核验，才能保存方法证据；启动回执、stdout 或某一个模型回复不能替代它。

## 保存方法证据

完整受控资格需要至少两次独立真实调用，还须实际权限、费用、恢复、行为和全部 harness 核验。第二个独立样本必须显式使用另一个新请求；这与重开一个 Unknown 原请求不同。先处理原请求的未确定状态，不能把新调用当作原请求的接续。

```powershell
pnpm cimiloop skill probe capture <原请求1> <原请求2> --json
```

一次采集1–4个同 Descriptor、同 Runtime pin、同方法/用途的原调用，返回 `evidence_ref` 和兼容现有 Provider 命令的 `raw_result_ref`。之后使用现有 `provider record-evidence`、`provider evaluate` 和 Human `provider bind` 流程。capture 不自动创建上述业务记录，也不批准或替代它们。技术契约通过不等于 `controlled_execution` 通过。

内部新样本3只选择固定隔离目录；旧样本1仍选择原固定根，旧子调用样本2仍选择原子目录。不存在跨目录回退、给旧原件补新权限或自动迁移。

## 工作台

启动 `pnpm workbench --project-dir <实际项目目录>`，进入“技能隔离调用”。选择候选和 Runtime、填写固定入口方法、原请求 ID 和真实方法输入后发起。页面在发送前保存 ID；响应丢失后按原 ID 查询，不生成另一个 ID 自动重发。页面、CLI 复用同一应用服务、Kernel 权限和 Host 原登记。

列表只读同一原安装的技术请求，提供查询、采集、停止、恢复和1–4个原请求的证据采集。浏览器存储不可用时暂停新调用，仍可查询服务器保留的原请求，也可以手工输入已保留的 ID。会话/CSRF、关闭状态和 Human 权限在异步边界及每次效果前持续核对。

## 当前证据边界

本入口完整接通了隔离调用的用户操作及真实 Native 执行组合，但本批检查使用 PUBLIC 的 Provider 批准、Native/模型投影或派发替身，没有进行新的真实模型请求或完整 Windows/AppContainer 回归。真实固定卷、兼容目录放置/迁移、真实账单口径仍未齐；当前电脑不能据此宣布已真实跑通本指南。

原 Matt 会话继续等待其真实 Human 回答；此入口不能代答、补记前置澄清或把一次隔离问答当作正式计划资格。默认完整生产 Runtime、真实受控方法行为和账单、普通 Change 到 ReadyForDelivery、最终 Matt/Superpowers、全部五组 S1 验收均未完成。

## 本批实际开发检查（2026-10-27）

使用 Node24.22.1、pnpm12.4.2，子进程 TEMP/TMP 指向本轮 D 盘测试目录；不修改全局目录或用户登录。两个 Kernel 权限用例和三个应用服务原身份用例先运行失败，均为已收集用例缺少所需入口，不是模块加载错误。另一个已收集取消反例证明此前会在准备返回后继续 launch，修复为先保存取消意图并逐效果检查；原失败报告保留。

首轮新增四完整文件13项通过。复查后进一步将原件/时钟/Native 控制器与业务 Run 分目录，并使用原 Host1 的原子 capacity ticket 同时约束历史容量和选出唯一派发者；索引写入失败后仍从同一票据只读恢复，不另选发送者。内部样本3明确选择隔离目录，旧样本1、子样本2保持原义。

最终受影响六个完整文件20通过、0失败、0跳过：Kernel权限2、应用服务8、固定目录及旧格式兼容2、原子调用采集兼容5、真实HTTP/会话/CSRF/Kernel集成1、浏览器DOM2。覆盖同请求并发、派发响应丢失、容量登记后索引丢失、准备阶段取消、Human权限在await后改变、原64项历史容量耗尽、真实默认组合缺失、旧/子/新原件目录不回退、浏览器重载及存储拒绝。

`pnpm check`、编译后的CLI/工作台帮助及前端语法检查通过，指南UUIDv7生成命令已实际核对。以上包括实际Git内容、SQLite、Host账本代码、HTTP与DOM；Host身份/平台保护、Provider批准、Native结果/模型IO和派发为明确PUBLIC投影，不是Windows受保护账本、实际AppContainer或真实模型验收。没有运行全仓`pnpm test`、完整Native回归、真实模型/费用核对、最终Matt/Superpowers或S1。完整报告在忽略目录`.cimiloop/codex-2026-10-27-skill-probe-*.json`，不把新增用例/提交数量当作产品验收。

公共Schema242、项目库10、Host1未变，容量使用现有Host1票据，无DDL迁移。原六个未跟踪文件保持不动，不push。
