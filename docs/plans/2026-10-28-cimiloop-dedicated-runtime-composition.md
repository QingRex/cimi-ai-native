# CimiLoop 专用连接共享 Runtime 接续

本批从 `318aa5a` 接续本地 OpenAI 兼容 transport。用户选择的本地 provider 和模型保持；不恢复 Codex 登录，不发送模型请求，不把该选择当作费用或行为资格。默认生产安装尚未完成，以下是完整准入宿主内部的执行接线，不是默认 CLI／工作台已通过验收。

## 实际实现

`LocalAgentRuntimeAdmission.runtimeForDedicatedRun` 复用已有完整准入租约、Kernel Agent 上下文、固定检查、Native Runtime 和持久专用账户。账户必须经完整审计，并从两侧 Host1 账本重读同一原 ticket；其他 Host 的账户不能借用本项目的启动权。原类方法在模块加载时捕获，实例方法被替换不能伪造这个判断。连接、账户、程序及宿主回调身份变化或租约释放后，原组合继续拒绝执行。

父 Skill 宿主增加专用账户分支，子调用继续走原 `SkillInvocation`、原 scope 关系、同一共享账户和现有 Native 方法组合，不创建替代父 Run。宿主 guard 进入真正 owner model-account port，在账户 await／完整 hold 核验前后检查，保持原 `fullHoldOwners` 身份。没有改为结构化 wrapper 或仅在响应后检查。

复核实际发现 `openDedicated` 曾遗漏向最终组合转发 `runtimeGuard`。新增反例证明 staged launch 在宿主释放后仍会 resolve，随后修复；现在启动 Native 前也检查租约，不只在发送模型时拒绝。

父 Skill 结果通过原 `LocalRunVerifier` 的同步借用范围注入当前 reader，继续调用原 `oldRead`。原核验器的账户、family、账单与 proof 版本规则保留；借用范围在成功／异常时恢复，拒绝异步返回。没有用缺少账单依赖的新空核验器替换它。

历史 catalog1 先用已有完整解析器核对原字节摘要、绑定和输入格式，再交还原历史 reader；不解释为新 catalog2，不创建子调用。当前借用 reader 返回空时仍可回到构造时的历史 reader，畸形记录及验证异常不吞掉。

## 验证记录

- 新共享工厂两个反例：旧实现 **0通过、2失败、23过滤**，失败为缺少该工厂。报告 `.cimiloop/codex-2026-10-28-dedicated-assembly-red.json`。
- 租约转发反例：修复前 **0通过、1失败、9过滤**，原 staged launch 意外成功返回。报告 `.cimiloop/codex-2026-10-28-dedicated-assembly-guard-red.json`。
- 父结果借用反例：旧实现 **0通过、1失败、2过滤**，没有借用方法。报告 `.cimiloop/codex-2026-10-28-dedicated-parent-result-red.json`。
- 历史兼容两个反例：修复前 **0通过、2失败、27过滤**，旧 catalog1 被新宿主拒绝、空借用 reader 没有回退。报告 `.cimiloop/codex-2026-10-28-dedicated-parent-history-red.json`。
- 第一轮四完整文件 **44通过、2失败、0跳过**，报告 `.cimiloop/codex-2026-10-28-dedicated-assembly-first.json`。账户8项、父组合10项、子Codex组合3项全过；主admission为23过2失败。两失败均在旧Codex staging夹具进入真实程序包封存核验时缺少材料，不是新provider已发送或生产检查被放行。
- 父结果／历史修复后两完整文件 **27通过、2失败、0跳过**：父账单结果3项全过，主admission为24过2失败，仍为上述旧夹具。报告 `.cimiloop/codex-2026-10-28-dedicated-assembly-parent-final.json`。
- 沿用已有父／子组合套件的明确PUBLIC程序能力和禁止 `execute` 的 staging subclass，补齐旧夹具，并检查程序／原卷与网络、Job、路径、package四项控制参数均被转发。正式核验和可发送路径不变。定向回验 **1通过、1超时、24过滤**，报告 `.cimiloop/codex-2026-10-28-dedicated-assembly-legacy-programs-final.json`。
- 对该超时用例单独计时，固定原120秒限制：fixture6.8秒、方法11.1秒、完整admission15.8秒、准备及预约34.5秒、拒绝未合格组合37.7秒、可用工厂43.8秒、原启动120.3秒、释放122.5秒。它在120秒线刚过完成，仍记 **0通过、1超时、25过滤**；报告 `.cimiloop/codex-2026-10-28-dedicated-assembly-parent-timing.json`。随后移除临时日志，只给这一包含真实Kernel／SQLite／两次工厂与原启动的组合用例180秒测试预算，不改生产Runtime、Task、资金或Native期限，不删除断言。最后定向 **1通过、0失败、25过滤**，实际123.3秒，报告 `.cimiloop/codex-2026-10-28-dedicated-assembly-parent-budget-final.json`。
- 按文件与用例名取各次最新实际执行结果，覆盖5文件50个不同用例，最新逐项均有pass。**这不是一次全文件全绿运行**；保留所有早期失败与过滤，不能把定向的24／25过滤算成整文件通过。修改后类型检查通过，最后增量独立复核确认租约、历史与原账单链缺口关闭。复核只覆盖本批代码，不能当正式Matt／Superpowers或S1验收。

这些测试使用实际 Kernel／SQLite／原请求／账户和 PUBLIC Native、模型、资格、账单验证端口；没有用户 provider 或真实费用结清。此前 transport 批的 Windows/AppContainer 两完整文件18项通过，不能替代本批新 provider 与正式 Runtime 的实际验收。

## 剩余主链

将本组合接到本地连接的默认生产安装／共享宿主，安装并独立核对网络、模型／账户、真实费用、全部写根／历史容量、完整异常恢复的原始来源；继续真实方法资格及 Plan／Task 前的 Human／Matt 澄清。真实需求仍为专用卷项目的“工作台原运行列表按状态筛选”，当前仅 Draft CHG-0001，三包仅候选。没有创建业务 Plan／Task／Run，没有声明 ReadyForDelivery。

本机安全输入窗口等待密钥在仓库外保存。模型目录价格字段不证明币种、扣款方式、逐请求账单或服务侧上限；相关真实调用条件待用户说明，开发不借此放开费用门禁。Schema242／项目库10／Host1不变，不自动迁移，不push，六个既有未知文件和历史 Unknown 原件保持。

原持续目标工具本轮仍返回blocked，用户此前已经点击继续，工具不能把它设回active。已恢复同一会话既有15分钟heartbeat，保持普通批次静默；若原持续目标恢复并另有执行者，本续接先暂停以免重复。它用于继续独立实现，不用于重复询问同一外部条件或反复跑已通过检查。
