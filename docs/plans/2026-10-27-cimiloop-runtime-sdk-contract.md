# Runtime 首次原 SDK 契约与资格消费

## 可执行路径

本批把首次 Runtime 真实修改／独立评审、当前 Codex／Native／SDK 原件读取、Kernel Provider 技术评估，以及 CLI／工作台接成一条路径。它直接服务正式 Runtime 的技术资格启动，不把已有原字节采集当作效果已验证，也不放宽正式生产门禁。

`LocalHumanRuntimeContract` 先取得 Kernel 对当前 Human 项目负责人及固定 Runtime Descriptor 的技术授权，再登记唯一 Host1 请求和两个原阶段。默认执行工厂打开已有原安装、有限账户容量、固定卷和同卷官方登录目录，核对全部已知写根。首次版本／canary 只派发一次；随后固定文件编辑，另一个 Profile／Session／模型线程只读评审实际输出。两阶段沿用原请求开始时间，不续预算。

这条技术路径不依赖已批准 Runtime／Skill，也不创建业务 Plan、Task、Context、Agent Actor 或 Run。现有 SDK 传输中的 `runtime_binding` 是 Descriptor 运输固定值，附件明确标记 `runtime_binding_is_descriptor_transport_pin:true`；它不是业务 Binding。业务 Kernel 找不到相应 Run／Binding，也没有被安装虚构的 AgentToolAssessment。

文件宿主只接受 `input.txt`，编辑只允许一次 `before\n` → `after\n`，评审只允许读取 `after\n`。每阶段16次文件容量、每项目64次技术请求历史，先预约后派发。准备、派发、完成分别保存 Host1 原票据。原请求索引缺失可按原容量记录读取，不重建原操作；已登记 Unknown 阶段不能再次派发。已修改但完成回执丢失仍 Unknown，不以新 call_id 再修改。

## 原件如何消费

`readRuntimeContractPhase` 不构造发送器／登录／业务对象，独立重读原 Native claim/config、Job 观测与清理、SDK／IPC 逐条关联、模型及 Codex 原 RPC、技术文件票据、最终文件内容及 Win32 文件身份。相同字节但物理文件已换也拒绝。编辑和评审分别要求原 SDK 调用及 literal final text，只有候选最终文本不能通过。

采集沿用 `RuntimeProbeResult` 的版本／边界形状，`model_operations` 留空，增加内部 `runtime-sdk-contract/1.0.0` marker。具体 `LocalCodexRuntimeSdkOriginals` 由原安装选 Host1 与规范根，核对原请求、Descriptor、安装、版本／canary 原件及导入字节、两个阶段、真实模型账户和独立性。外部 marker 不提供路径、回调或批准字段；没有原件就拒绝，PUBLIC 模型为 inconclusive。

Provider 登记、评估、绑定和默认生产保管器实际安装这一读取器。评估保存显式 assessment marker及完整依据摘要，绑定时按同一规则重算。旧评估仍按自身历史规则读取，不因新端口出现而改变语义。技术 ALLOW 仅能用于 Human 选择的 `isolated_provider_probe`；完整执行仍要求原四项独立 Runtime 控制。默认 Codex 宿主还明确要求本契约 marker，旧 OpenCode 技术资格不能直接作为当前 Codex 生产资格。

CLI 新增 `runtime contract start/query/continue/cancel/recover/capture/list`；工作台新增 Runtime 契约页面，两者复用同一共享服务。请求 ID 在发送前保存，丢响应只查询。HTTP 会话／CSRF 在等待前后复查，JSON 不能安装执行工厂。操作步骤见[接入指南](../implementation/CimiLoop-Runtime原SDK契约接入指南-v0.1.md)。

Schema242、项目库10、Host1不变。新增均为内部附件／票据／assessment 约定，没有自动迁移用户库。

## 开发中发现的实际缺陷

首次 API 红例、应用竞争 Host 和 release 期间撤权红例均保留，已在对应实现修正。新增真实 Native／SDK 正例又发现三处仅靠局部夹具无法暴露的接线错误：

1. Runtime 入口原来强制要求检查目录或具名方法，即使原模型只安装读写 SDK 也拒绝启动。现 config17 的固定文件工具子集可以没有检查目录；选择 `cimi_check` 仍须真实目录，具名方法和父技能仍须原宿主。
2. 技术文件回执混用了 Host1 按键排序的票据摘要和 Native／SDK 按固定解析顺序计算的请求摘要，SDK 因此拒绝回执。现分别保留两种身份，原 Native `input_digest`、`before_digest`、replacement 类型均独立复核，没有改宽 SDK 检查。
3. 原件读取器重算工作区摘要时沿用了 Host1 排序后的文件身份字段顺序，误拒实际成功文件。现使用当前 lstat 的固定字段顺序重算，同时保留完整原身份比较。

## 本批实际验证

环境 Node24.22.1／pnpm12.4.2。真实模型请求0；不读取或复制用户凭据。测试根保留，不读取、散列、暂存或删除原六个未跟踪文件。

- 应用／治理早期完整文件16项通过；早期 Windows 文件与页面两个完整文件3项通过。这些不是最终一轮全集。
- 最终新入口9个完整文件27项通过、0失败0跳过：CLI、DOM、实际HTTP／会话／CSRF／丢响应、Host1竞争／撤权、Kernel技术授权／SDK评估、实际Windows固定文件效果、完成票据丢失不重做，以及导入完成标记缺原件拒绝。报告 `.cimiloop/codex-2026-10-27-runtime-contract-entries-first.json`。
- 新完整 Native 测试最初1失败证明缺目录启动被拒绝（`native-red.json`）；随后 `native-first.json` 1失败为 Bun 原生崩溃、模型未派发；`native-second.json` 1失败暴露SDK摘要错误；`native-third.json` 1失败暴露工作区摘要字段顺序；`native-fourth.json` 编辑已Observed，但评审启动时Bun崩溃、评审模型未派发。各报告前缀均为 `.cimiloop/codex-2026-10-27-runtime-contract-`。
- 修复后 `runtime-contract-native-fifth.json` 完整文件1项通过、0失败0跳过，用时约83秒。实际 OpenCode／Windows AppContainer、Job、原SDK／IPC、原子文件效果、独立评审和原件重读均执行；模型／账户／技术授权仍是明确 PUBLIC 夹具。五次 PUBLIC 模型建议（编辑3次、评审2次）封口；原件复查不新增派发，同字节物理替换改为Unknown。不能作为真实模型／账户资格或S1。
- 原生失败日志两次记录 Bun1.3.14 启动阶段 segmentation fault，栈中含LHShield64.dll。这里只确认可见失败，不确定根因，不停用安全软件、不更换固定程序或覆盖失败；后续成功不证明该本机间歇问题已经解决。
- 受影响旧8个完整文件154项通过、0失败0跳过，报告 `runtime-contract-regression-first.json`；范围为旧Provider评估／目录／四控制门禁、具名Skill评估及绑定、Provider来源会话、默认生产宿主及Codex模型原件。与新入口27项分开运行，不称一次全仓测试。
- 旧 `adapter.test.ts` 实际Windows/AppContainer回归首次12通过、1失败、0跳过（`runtime-contract-native-regression.json`）：取消测试看到Running就取消，随后却要求子进程已输出完整提示词，原输出只有启动事件。测试现先等待原提示词实际输出，再取消并核验同身份重放；没有更改产品取消或恢复逻辑。完整文件最终13项通过、0失败0跳过（`runtime-contract-native-regression-final.json`），包含真实读写隔离canary、原证明锁Unknown、取消、期限和原claim不重启。
- 最终 `pnpm check`、编译CLI `runtime contract --help`、工作台JavaScript语法、文档UTF-8／围栏／相对链接及 `git diff --check` 通过。最终按各完整文件最新结果共19文件195项通过，但分轮运行且Native开发失败全部保留；不等于全仓或S1验收。

## 继续完整 S1

默认正式 Agent 仍受四项完整控制来源门禁限制。完整网络／费用账单与上限／全部物理配额／异常恢复读取器和生产安装、历史容量与兼容迁移、真实 Skill／Human／Matt、真实普通 Change 到ReadyForDelivery、指南实走、最终Matt及Superpowers评审继续未完成。已有固定卷 prepared.json、同卷官方登录目录、真实账单、原Matt问题的Human回答等外部缺项保持明确，不反复询问或代答。

上一批真实Luna原Run仍Unknown；本批没有重开、修复或改判它，也没有通过删记录或放宽权限制造成功。五组目标保持进行中，本批不是全仓或完整S1验收。
