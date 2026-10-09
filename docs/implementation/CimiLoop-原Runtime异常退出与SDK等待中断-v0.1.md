# CimiLoop 原 Runtime 异常退出与 SDK 等待中断 v0.1

2026-10-09，D-238，V1-09 / V1-10 异常恢复续批。承接[原宿主启动组合](CimiLoop-原宿主首次启动账本与Runtime组合-v0.1.md)，修复实际原 Native 控制器失败后 SDK 工具等待缺少及时中断的问题。完整生产驱动、正式领域结果 / 费用、真实方法与 S1 仍在实施；默认正式入口没有启用。

## 原操作的异常终止路径

同一受信宿主、原启动 claim、Native 控制器、AppContainer 内的 OpenCode、IPC 账本和工具回调沿用原 Run / operation_key。SDK 回调仍在等待，不能证明 Runtime OS 进程仍存活；查询继续要求原控制器和 Runtime 的 PID、创建时刻与映像核验。缺少证明仍为 Unknown，不根据回调、心跳或旧阶段返回 Running。

问题位于 `runOpenCodeWorkspaceToolRehearsal` 的原 Native close 处理：恢复前退出已经停止原 lifetime；恢复后非零 / 信号退出只完成 ended Promise。随后的 channel.close 等待正在等待同一个 signal 的 SDK callback，而该 signal 直到原期限才会中断。外部运行已经失败，宿主却仍被未结束回调拖住。

修复后，恢复运行后的非零退出、null 退出码或信号退出立即以 `workspace_rehearsal_runtime_failed` 停止同一个 lifetime，再完成原 ended。此前 Human 取消、期限或其他首中断原因仍优先保留。正常零码退出沿用现有完整 Native / 原工具 / 原字节核验，不能因本修改跳过任何成功条件。没有改变 Native 权限、进程身份判定或超时时间，也没有重试 / 新建 Run。

异常分支经过已有 finally 关闭原通道和原控制器，保留 claim、IPC 请求 / 响应、stdout / stderr 及 incomplete。incomplete 的中断原因可供原操作采集，资源处置仍须原 Native cleanup / OS 身份证明。资源查询可以是 Stopped，领域 Run 在未提交观测时仍是 Reserved；两者不能混用。现有 Human 工作台可继续查询、采集、Kernel 取消后的原资源恢复及记录待核对观测；它只产生 Unknown / 未知费用，不能推定成功、退款或预算结清。

这里修改的是当前 SDK / Native 组合路径，没有把构造模型包装成正式生产驱动。生产模型 / 账户 / 固定检查 / 费用完整资格和真实执行接续还须接入，正式工具及工作台启动默认继续关闭。

## 实际红绿反例

新增 Windows x64 场景使用实际 AppContainer、固定 OpenCode 1.18.34 与原 IPC。SDK 请求进入回调后，测试仅结束它自己创建并登记的原控制器 stdin，由该控制器终止自己的 Job 并处置资源；没有按 PID 盲杀、批量删除或制造另一 Run。回调等待原 signal，cancel 回调不主动解除这个等待，用来隔离待修复行为。

修复前，预期的原失败原因没有到达，实际为 `workspace_rehearsal_deadline`，反例1项失败、其余4项过滤；不是模块导入 / 解析错误。修复后该项通过，检查从 SDK 等待开始到收到 abort 小于8秒、原资源 Stopped、Native 核验 Unknown、原 incomplete 原因、原 claim 拒绝重启，以及领域事件 / Run / 预算 / 仓库文件均未改变。8秒是此受控失败测试的验证窗口，不是生产响应服务承诺。单项运行过滤的4项不计作通过。

完整文件的前置诊断4项通过与上述新增反例分开记录；单项工作台诊断1项通过 / 3项过滤，不能覆盖 D-237 历史失败。所有工程记录、原红绿与最终回归范围见[本机研究记录](../research/CimiLoop-原Runtime异常退出与SDK等待中断-2026-10-09.json)。普通独立代码复核没有发现此修补的额外必修问题，未执行真实 Matt 或 Superpowers 方法。

## 旧失败现场的只读证据

D-237 保留的本机 RF2MtR 原 Runtime 目录仍在。D-238 只读核对其中原 cleanup：reason 为 exited、exit_code 为3、resources_disposed true、cleanup_errors 空；stderr 记录 Bun v1.3.14 的 segmentation fault，崩溃栈出现 CcLHShield64.dll。这里只报告这些原记录；DLL 出现不能证明崩溃原因，也没有关闭防护、增加白名单或修改上游二进制。

该次运行确实发生过崩溃，但此前未保存工作台查询时点的全部独立 OS 检查值。不能用之后的 cleanup 回填“原查询必定因某检查返回 absent”的时点因果，也不能据后续通过宣布 Bun / Native 稳定性已解决。D-237 首次启动准入及 Context 准入两项失败同样没有被本修补解释。D-233–237 历史失败与本批结果均保持独立；旧 Run 未重启、旧 Unknown 未清除。

## 本批验证与可操作检查

最终固定源码受影响回归为6文件 / 39项：37通过、2失败、0跳过；344个源码 / 测试 / Native C# / 配置摘要零变化。pnpm check、编译CLI帮助和242 Schema / 项目库10核对通过；17文档UTF-8 / 链接 / 围栏及diff检查通过。仅本批受影响范围，不是全仓库或完整S1。

最终首次的两项失败分别为：实际新Context固定检查SDK场景的workspace_rehearsal_runtime_failed；共享原启动丢响应用例超过未修改的15秒测试期限。两项根因尚未确定。前者测试自身清理在记录资源处置后删除了失败夹具原目录，故不能补造其原退出码 / stderr原因；最终JSON与独立旧崩溃资料保留，两者不混为同次证据。

对仅失败的两个文件同一固定源码复验为16项：16通过、0失败、0跳过；未修改断言或期限。首次37/39保持，复验不覆盖首次失败或证明原生稳定性。

在满足 Node `>=24.15 <25`、pnpm `12.4.2`、实际 Windows x64 / AppContainer 与 Framework64 csc 的本机工作区，先核对分支 / 改动并按锁安装。保留已有变化；不要 reset / clean 或自动迁移用户库。

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm check
pnpm exec vitest run packages/runtime-adapter/test/execution-lifetime.test.ts packages/local-app/test/agent-runtime-start-local.test.ts tests/scenarios/opencode-lifetime-runtime.test.ts tests/scenarios/agent-runtime-operation.test.ts tests/scenarios/agent-workspace-ipc-runtime.test.ts tests/scenarios/agent-check-admission-runtime.test.ts --maxWorkers=1
node apps/cli/dist/bin.js --help
```

这些测试在各自新建的项目夹具中执行真实 OS / SDK / 文件 / Node 效果；Provider 完整资格和模型回复是明确构造，真实模型 / 技能 / 账单没有验收。其他平台跳过 Native 场景不算通过；单项过滤也不能作为上述完整范围通过。OpenCode 固定摘要及本批具体环境由研究记录保存，不使用旧电脑绝对路径或进程状态。

失败时保留原 JSON 输出及已登记的原夹具，不重新执行同一 Run 以“补结果”。本文件新增失败场景沿用保留失败原目录的规则；旧 IPC / lifetime 测试自身清理仍限制部分失败目录取证，完整 JSON 结果保留，该限制不能宣称为完整异常恢复能力。原生崩溃与自控原退出是两种证据，不能混为根因已修复。

## 剩余条件

完整五组目标继续：V1-09 的生产 Runtime / 模型账户 / 原费用和账单、正式终态、物理配额 / 历史容量和完整恢复；V1-21 的真实 Skill 与 Plan / Task 前 Human / Matt 澄清；V1-22 的独立完整 Matt、当前源码 Superpowers 新鲜验证及行为对照；V1-10 的正式工作台执行与原执行接续；V1-11 的真实 Change 到 ReadyForDelivery、真实技能 / 中断恢复 / 完整 S1 和接入指南。

用户仅确认智谱提供方，模型、套餐与现金 / 积分上限仍待确认。实际凭据读取、外部模型请求、付费请求均为0；凭据不得进入 Git / 日志 / Agent 上下文。242 Schema、项目库格式10与私有启动账本格式1保持，未升级用户库。来源未明的 QA5363D6C.tmp / QF192D3E3.tmp 保留，不加入提交；本批只本地提交，不 push。持续目标保持 active，不声明 S1 完成。
