# Codex 模型 Job 硬限制及生产控制来源

接续 `e5430f7`。本批补上独立模型 Job 缺失的内存／进程硬限制，并将其原件接入默认 Provider 核验和正式宿主当前资格复核。完整目标仍是 S1 五组；本批不把另外三项控制或真实模型兼容性宣布完成。

## 实际执行路径

普通 Agent、Skill 子调用、具名方法探测、Runtime 技术契约四处默认组合选择 `codex_memory_process/1.0.0`。该策略必须同时持有原程序能力、受控网络和原固定卷能力；复制配置、未知策略或缺少原程序能力在准备 Job 前拒绝。

Native 创建原 Job 后实际设置 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_JOB_MEMORY | JOB_OBJECT_LIMIT_ACTIVE_PROCESS`，对应 flags `0x2208`，Job 总提交内存最多2 GiB，同时最多8个进程。代理和实际模型占其中两个名额，code-mode-host 等后代也继承该 Job，不允许 breakaway。旧工具 Runtime 的单进程策略不变；模型需要随附程序，不能把工具的单进程限制直接当作模型限制已执行。

监督器在设置后、实际模型挂起核验后保存 start 前、原 Job 清空并关闭前独立调用 QueryInformationJobObject 复查实际限制。原进程、程序文件、AppContainer、网络、取消、Job清空、授权移除和 Profile 删除的原件核对继续保留。

新内部原件为方法 start15／模型 header32–34／Native launch7、start6及end6，明确固定 Job 策略和实际限制。新模型头继续使用原工作区／父 Skill backend8、具名方法 backend13。旧 start14／header29–31／launch6及更早版本按原义读取，旧 pending 不升级，不因新代码存在而补写限制证据。原构建配方结构未改变，仍通过每份 Native 源码字节摘要选择并保留新的控制器原件；Schema242、项目库10、Host1不变。

## 生产读取器

`LocalCodexRuntimeControlOriginals` 由原安装租约选取技术契约和模型控制原件；导入的 JSON 只能关联原请求，不能选择源路径、程序、账户或执行工厂。SDK 读取器现在复用同一次验证的原请求和两阶段上下文，其原 SDK 证据输出形状不变。

网络／宿主限制支持必须同时具备当前安装的实际编辑及独立评审原件、真实模型来源标记、每次模型调用的原 Host1／Job完成票据、受控 TLS 策略、实际2 GiB／8进程限制、固定程序能力和项目写入约束。旧无硬限制原件保持 inconclusive。固定出口的 `chatgpt.com`、`auth.openai.com` 必须都包含在 Provider 声明的网络域名中，否则该项 refutes；不会自动扩大声明权限。原件在返回前再次读取，变化即拒绝。

读取器已接入 `executeProviderCommandWithSources` 的 Runtime 命令来源作用域，以及正式宿主的当前资格复核。CLI和工作台沿用共享应用服务；原 Kernel 回执重放仍在打开来源之前返回，响应丢失不重派。作用域结束后不可读取该来源，导入的 supports 字段不能创建来源实例。

默认宿主另检查私有来源登记中是否实际安装了四项读取函数，而不只检查 `readRuntimeControlEvidence` 方法存在。当前仅网络／宿主限制函数已实现，另外三项未安装，必须在安装执行适配器之前拒绝，并返回三项具体缺项；复制来源对象不能获得该登记。部分来源仍可用于Provider评测，但不等于完整生产宿主已可用。

另外三项仍保持真实缺口：费用只有原模型用量，尚未接真实账单和完整资金上限来源；固定卷记录约束不证明当前全部 OS 写入及完整历史容量；正常结束的 Job 不证明完整启动／崩溃／恢复矩阵。读取器为这三项绑定各自可重读的当前原件摘要，返回 inconclusive，不能视作三项已实现或已验收。Kernel 因此继续返回 NEED_MORE_EVIDENCE，正式 Agent 的完整门禁未放行。本批不提供伪造账单或任意配置 JSON 来把它们改为 supports。

## 实际验证与失败

硬限制用例先在旧实现失败：实际 Job 查询 flags只有 `0x2000`，内存和进程上限均为0。修复后的真实 Windows用例核到2 GiB／8进程，64 KiB内存提交成功，超过2 GiB的提交被拒绝；代理和模型之外可创建6个后代，第7个被拒绝，原Job结束后全部回收。未实际写入2 GiB内存。被改为9进程的本地结束声明不能被原读取器接受。

生产来源入口反例先因缺少实际读取方法失败。首轮三文件8通过1失败，唯一失败是测试用对象展开遗漏了原读取器的原型方法，导致 Kernel 不能读取原材料；改为绑定原方法后该轮三文件9项通过。随后补充 Provider 域名反例，该轮三个完整文件10项通过、0失败0跳过：来源文件6项、SDK原件反例1项、原命令来源／回执／Human撤权3项。来源聚合与Kernel结果测试使用明确的 PUBLIC SDK／Job投影，不作为实际模型、完整Native或S1证据。

五文件集成轮28通过1失败，发现旧宿主仅检查读取方法存在，新部分来源意外使冷宿主安装成功。保留该反例并补上代码实际来源齐备检查后，两个完整文件16通过1失败；剩余失败只是原测试仍期待“全部来源缺失”的旧诊断，已将断言精确改为当前缺少的三项，安装适配器、账户容量和领域事件不变的断言全部保留。

真实官方程序在新 bounded Job 下另跑离线启动：`--version` 成功，`app-server --stdio` 仍因 AppContainer 下 CODEX_HOME 的 DOS 路径转换error5失败。失败原件目录 `co-OHvmIU` 保留；未读取现有登录或发送模型请求。完整官方文件1通过1失败、0跳过，不以版本成功或正确清理抵消初始化失败。

最终功能范围按各完整文件最新结果共8文件40项分轮通过、0失败0跳过：

| 完整文件 | 项数 | 范围 |
| --- | ---: | --- |
| codex-bounded-job.test.ts | 3 | 实际OS查询、内存／后代越限、原Job回收和篡改拒绝 |
| codex-fixed-volume-confinement.test.ts | 4 | 四种新旧组合、start15、三类新模型头和原控制读取；模型／部分卷观测为PUBLIC |
| agent-parent-skill-composition.test.ts | 9 | 默认父组合转交Job策略；PUBLIC staging禁止模型派发 |
| skill-invocation-codex-composition.test.ts | 3 | 默认Skill子组合转交策略；PUBLIC staging禁止模型派发 |
| agent-production-host-local.test.ts | 10 | 宿主不提前安装、回执、并发借用与当前Human守卫 |
| codex-runtime-control-sources-local.test.ts | 7 | 原来源作用域、Kernel缺证据门禁、域名、历史版本、变化及覆盖范围；PUBLIC来源投影 |
| codex-runtime-sdk-originals-local.test.ts | 1 | 无原Host1请求不能用导入完成标记替代SDK证据 |
| provider-command-sources-local.test.ts | 3 | 原回执不重开来源、await后撤权和原Kernel更换拒绝 |

五文件集成轮的四个已通过文件保持原完整结果；实际内存越限补充后仅重跑硬限制完整文件3项通过（`bounded-job-memory-final`）。最后宿主／来源完整两个文件17项通过（`control-source-coverage-final`），替代此前宿主及来源文件结果；SDK／Provider来源沿用域名轮完整结果。没有把失败集成轮称整轮通过，也不重复累计重叠测试。官方程序文件另计1通过1失败，因此本批全部已运行范围按最新文件结果为9文件41通过1失败、0跳过；不能把这个失败排除后宣称正式Runtime通过。

首轮类型检查发现源网络字段的 unknown 收窄及测试反例的静态参数形状，修正后最终 `pnpm check` 通过，Node24.22.1／pnpm12.4.2。已刷新origin/main，无新增；旧六文件未读取／暂存／删除。没有全仓测试、完整 Native 族、真实账户／账单／Skill／Human流程、ReadyForDelivery或最终S1评审。

报告原件位于本机忽略目录 `.cimiloop`：`bounded-job-red`、`bounded-job-native`、`control-source-red`、`control-source-integration`、`control-source-final`、`control-source-hosts-final`、`bounded-job-integration`、`bounded-official-final`、`bounded-job-memory-final`、`control-source-activation-final`、`control-source-coverage-final`，前缀均为 `codex-2026-10-27-`。失败、跳过、PUBLIC投影和实际Native分别记录，不重复累计重叠测试。

## 接续

继续完成真实费用及账单来源、完整物理配额／历史容量、完整异常恢复来源和相应执行路径。当前官方程序兼容性、固定卷准备证明、同卷仓库外官方登录、真实账单、Human问题回答仍是具体外部／实跑条件；不扩大为所有独立开发的阻塞。真实普通Change到ReadyForDelivery、指南实走和最终Matt／Superpowers评审仍必需，五组目标保持active。默认不push，不处理旧Unknown或六个旧未跟踪文件。

## API依据

- [Microsoft：Job扩展限制结构](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information)区分Job总提交内存和单进程内存。
- [Microsoft：Job基础限制及标志](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information)说明活动进程、内存与关闭回收限制。实际本机设置、查询及越限结果见上述Native测试，文档不替代实际执行。
