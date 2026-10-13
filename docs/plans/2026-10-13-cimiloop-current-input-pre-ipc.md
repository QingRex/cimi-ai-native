# D-288 原输入当前核验与 Native 准备阶段接续

> 最新原终态：隔离实际Native整文件2通过、1失败、0跳过，源码无漂移。普通SDK/读取/固定检查及Human最终撤销通过；专属HTTPS账户仅1次模型发送，第二条原请求保留且在原Task截止前未发送，原600000ms预算未改变。完整main仍运行。后续当前结果消费见[D-289](2026-10-13-cimiloop-current-result-consumption.md)。下文启动记录保留为过程记录，不代表仍在运行或全通过。

持续目标仍为 V1-09、V1-21、V1-22、V1-10、V1-11 完整五组。本记录是正在实施的隔离批次，尚未完成 main 集成或提交，不是 S1 验收。

原输入当前核验已在 D287 隔离工作树完成：5 文件、72 项通过，pnpm check 退出0，776源码文件前后哈希无漂移。readCurrentOriginal 在原请求结束后核对同一候选、完整当前源码和原不可变资料；不重新采集、不新开 Run、不生成效果。严格短事实解析器固定原 scope/catalog/call/command、引用及摘要。历史输入依旧可读，当前输入发生手工变化、原件丢失或最后读取期间 Native 原件变化则拒绝。当前领域结果3及父 Skill Host 消费路径仍待接入。

main 的原 103 文件完整受影响回归仍在 session65967；其中生产生命周期文件3项已失败，不能宣布完整通过。三个原操作都停在 registered、尚未恢复实际 SDK；原 incomplete 分别记录 workspace_rehearsal_preparation_failed、agent_dedicated_account_unavailable、workspace_rehearsal_preparation_failed，Native记录 parent_ended/125。保存其原件哈希，不将这三个当前操作资源处置证明推广到旧电脑 Unknown，也不重开原 Run。具体全部触发原因尚未最终证明。

冻结 main 源码上的独立准备合同已复现缺口：Native 原登记已出现但 IPC 尚未建立时，模型核验无条件执行 causal projection，得到 agent_ipc_causal_window_unproven（1失败、2拒绝通过）。首次临时合同因包解析未加载，0项，不计业务证据。

修复放在已结束旧验证的 D286 隔离工作树。合法的原准备阶段必须有原 config、launcher、resources；suspended 还需原悬停及同一 peer。IPC目录确实不存在、没有当前请求、没有 Native 效果时才继续当前独立权限核验。运行/结束/处置状态、部分IPC、原配置丢失、身份变化全部拒绝。最后完整源码读取后纯复核原登记、票据、资料字节及IPC缺失，随后没有外部回调。

独立普通复审先指出原配置丢失和末次源码读取窗口两项必修；5项行为反例真实复现（34通过、5失败），修复后3文件61项全部通过，最终 pnpm check 退出0，770源码文件无漂移。后续普通复审未发现新增必修。复审没有运行测试，也不是 Matt 独立完整评审或 Superpowers 新鲜验证。

隔离实际 Windows/AppContainer 生产链路整文件3项已启动，session44457，沿用原 Task 600000ms预算与原检查限制；新的自有夹具不替换原失败现场。当前尚无终态，不计通过；公开构造模型/资格/账户夹具不能证明真实模型、真实技能或S1。

下一步：消费两个原运行终态，修复实际 Native/SDK 组合问题；将当前输入核验接入独立父子结果与明确结果3消费；保持 Kernel 唯一业务权威和原操作身份。批次达到完整验证与文档条件后，仅显式路径本地提交，不 push。

Schema242、用户数据库10、Host账本1保持基线。智谱具体模型、套餐、现金币种/上限和积分上限仍未确认，不读取真实凭据、不付费。正式Agent默认入口未启用。

证据：[D-288研究记录](../research/CimiLoop-current-input-pre-ipc-2026-10-13.json)、[当前候选实施计划](2026-10-13-cimiloop-current-parent-candidate.md)。
