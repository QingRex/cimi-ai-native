# CimiLoop 原 Native 输入关闭与执行中断 v0.1

> D-254；V1-09 / V1-10 续批。完整五组 S1 持续目标 active，正式默认 Agent 仍未启用。

## 实际路径

Human 在最终异步模型准入等待期间撤销 technical_owner，共享启动服务再次核权后拒绝 SDK resume。Runtime 关闭同一原 Native 输入，不另建 Run、Operation 或进程。原 Native 现在将完整 EOF 作为受控中断，退出125并沿原 Job / ACL / 映射 / Profile 清理路径收尾；在准备阶段、runtime_created、suspended、running 都保留当时事实。输入截断、无效 UTF-8、额外完整帧、读取异常仍是失败，不生成输入关闭证明。

准备和恢复线程保存异常并在 Join 后传递，不再将读取错误吞成 null。Join 返回后再核原十秒期限；Task deadline 与运行 elapsed 到期优先于 EOF，不延长原等待。只有 ResumeThread 成功才记录 runtime_resumed:true；CreateProcess 成功后、runtime_created checkpoint 前立即固定实际进程身份，不能用旧窗口中 runtime:null 推断尚未创建进程。

新私有原件 agent-sandbox-interruption.json 使用 cimiloop/agent-workspace-interruption/1.0.0：nonce、scope_digest、config_digest、owner、supervisor、runtime、phase、runtime_resumed、reason。FileMode.CreateNew + Flush(true) 禁止覆盖；捕获时固定阶段，随后资源账本改为 ended 不改写这份原件。写入失败不生成受控关闭结论；清理失败保留 Unknown，不证明资源已处置。配置首帧尚未收到、原 Scope / nonce 还不能建立时，也不能补造这份关闭证明，原不完整状态继续待核对；这属于完整异常恢复的剩余边界。

## 原采集、核验和工作台

既有 collectAgentRuntimeOperation 在事务外新鲜查询原 OS 身份、原控制器 / SDK 物理证明及处置记录，再采集可选中断原件。只有 ENOENT 才视为缺失；存在但不可读、损坏、与原 nonce / owner / runtime / config / cleanup 不一致时拒绝，不降级成旧无字段。旧集合保持原 format1 和原字段，无此原件不补造 interruption。

Kernel 的同步结果读取核对集合 Blob 摘要、唯一文件名、原操作下不可变 config / launcher / interruption / suspended sandbox 文件，以及原 Identity.input 的 binary_original / sandbox_original。外来同 Scope、自洽替换的配置或进程身份不能通过。历史资源处置记录仍按采集字节核验；其后恢复导致可变资源账本更新，不以新阶段重解释旧中断。真实 OS 观察在共享异步采集内，不能在 Kernel SQLite 事务里编译或调用 Native。

interruption.status:Observed 只证明原历史中断字节和归属，不声称当前 OS 状态、任务完成或账单结清；当前 OS 状态由 collection.status 独立提供。工作台“采集原资料”显示 SDK 恢复前或恢复后关闭，保留任务和费用待核对。恢复 Human 当前权限后，原 RecordRunObservation 走唯一 Kernel 收据，仍为 Unknown / cost_known:false，预算保留，不产生任务成功、第二个 Run 或第二次模型效果。

## 接入测试

新电脑先按锁文件安装，使用 Node >=24.15 <25 / pnpm12.4.2，再执行 pnpm check 生成当前 dist。Windows x64 / C# / AppContainer 回归不允许用跳过代替通过：

```powershell
pnpm check
pnpm exec vitest run packages/runtime-adapter/test/agent-native-input-close.test.ts tests/scenarios/agent-runtime-operation.test.ts tests/scenarios/agent-production-lifetime-runtime.test.ts tests/scenarios/agent-original-edit-check-runtime.test.ts --no-file-parallelism
```

直接 Native 用例不恢复 SDK；执行场景的模型与资格是构造输入，仅实际 Windows、SDK、HTTP、IPC、工具和 Kernel 原字节可作对应事实。不能把这些构造回复当作真实模型、Skill、Matt / Superpowers 或 S1 验收。实际夹具保留本批原件及资源处置证据，不能用于清理旧电脑 Unknown 或批量移除 Temp / Profile。

不增加领域 Schema，不改变242 Schema、用户库10、原启动账本1、Native config5 / launcher2 / resources1 / cleanup1；仅添加独立私有中断格式及可选集合字段，不升级用户库。旧 Native 原失败和历史 Unknown 保留，当前成功不覆盖旧 Bun / CLR / clock 或 D-253失败。

## 本批验证

最终范围与原失败见[分阶段研究记录](../research/CimiLoop-原Native输入关闭与执行中断-2026-10-10.json)。分阶段最终受影响7文件85项全部通过、0跳过；首轮84通过1旧启动15秒超时，原源码 / 原期限不变的完整10项独立复验通过，原因未证明。实际Windows最终组合5文件27项26通过1失败、0跳过；独立新读查夹具1项通过（另1项过滤），不覆盖首次Bun1.3.14 / exit3崩溃。真实Windows EOF红反例stderr175 / exit12已保留，当前受控关闭stderr空 / exit125；准备 / runtime_created / resumed损坏输入、原停止 / 恢复 / 收据与控制器保留各按原范围验证。类型检查 / CLI帮助及37份文档检查通过；620源码同阶段前后零漂移（红阶段617）。

实际Windows最终撤权反例0模型调用、一次原Unknown观测、预算100继续待核对；独立读查构造模型3轮 / Native匹配2 / 固定检查1，读改查4轮 / 匹配3 / 检查1，各一次原Unknown观测。所有本批原件与首次失败保留，普通独立工程复核不计Matt / Superpowers。首次错误CLI别名和两次类型错误亦记录，最终命令通过不抹去早期失败。

## 剩余完整条件

正式领域验收、真实模型 / 账户 / 套餐 / 预算账单、物理配额、历史容量和完整异常恢复继续。真实 Skill、所有 Plan / Task 前 Human / Matt、Matt 完整独立评审、Superpowers 当前源码新鲜验证及真实行为对照、正式默认 Agent 与普通 Change 至 ReadyForDelivery / S1验收和操作指南不缩减。智谱具体模型、套餐、现金与积分上限尚待用户批准；本批不付费，不读取真实凭据。仅本地提交，不 push。
