# 将生产 Codex 进程树绑定到原宿主生命周期

接续 `2d6a4e2b532f0dd5b73e6a04fde7940d71e6e1b6`，完整 S1 五组继续。本批直接修改生产执行路径，解决 Codex app-server 及其后代在原宿主退出时的归属、终止与原件问题；不将这个恢复子场景等同于完整生产准入或 S1 验收。

## 问题与执行路径

原路径由 Node 直接 spawn app-server，终止时只操作直接 ChildProcess。不能从这段代码证明完整后代树已停止。进一步核对 [libuv 的 Windows 实现](https://github.com/libuv/libuv/blob/v1.x/src/win/process.c) 后确认：它已有针对直接子进程的退出 Job，但允许后代脱离。初版监管器也被该 Job 先终止，无法保存结束回执；真实强制退出测试复现了这一点，原失败原件保留。

新 `CodexProcessJob` 以真实原宿主的进程句柄监测退出，核对实际父子关系、创建时刻及程序身份，拒绝 PID 复用。它使用 [PROC_THREAD_ATTRIBUTE_JOB_LIST](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute) 在创建时把 worker 加入私有 Job，先保存挂起态身份，再允许初始线程运行。worker只继承stdin／stdout／stderr，不继承Job句柄，也没有breakaway许可。

监管器以隐藏且独立于libuv直接子进程Job的方式启动，仍持续观察原宿主句柄。宿主退出时终止自己的完整Job；正常worker退出时也终止残留后代。只有实际查询到active_processes=0且Job句柄关闭后才保存结束回执。[Windows Job 规则](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)支持这种进程树归属和终止方式；本批只对实际运行的边界场景作结论，不声称覆盖调用方在CreateProcess系统调用任意时刻死亡的所有结果。

Job终止后的5秒是查询观察期限，不是Windows对清理耗时的保证。超时、监管器异常退出或缺少回执均不能封口成功；原操作和预算继续待核对。没有引入全局进程扫描、任意PID终止、旧Temp／映射／Profile清理或管理员设置变更。

生产普通／父Run和Codex Skill子调用均显式选择 `owner_job/1.0.0`，使用原安装的独立Host1。原Kernel权限、模型／账户核验、固定卷和登录根守卫保持；Job只负责进程生命周期，不授予业务权限或新的Provider批准。凭据仍由官方Codex读取，监管器配置只有非秘密程序参数和身份，不包含API Key或令牌。

## 原身份、证据与路径

新的Codex方法启动原件使用内部 `cimiloop/codex-method-start/10.0.0`，固定进程政策、原Host引用及可选短根。它与项目数据库格式10是不同概念；公共Schema242、项目库10及Host1均不变，没有用户库迁移。旧启动原件1—9按原解释只读重放，不附加新政策或重开旧操作。

独立Host的唯一intent先于异步编译／准备写入。其后撤权、编译失败、丢失响应或宿主崩溃均保留原登记；再次执行不能借新目录、编译或模型进程完成旧请求。成功还须独立Host的完成票、真实Job原件、文件身份和方法seal同时匹配。修改原字节后重算本地seal，不能覆盖Host完成票中的原依据。

新增的原Host只读引用固定原根、机器／主体、账本及物理身份，只能读取已有不可变记录，不能安装权限、写入或补造登记。跨宿主读取使用只读SQLite连接和一致快照，不依赖已经关闭的活对象，也不读取凭据。查询缺件时失败，不创建原根或重新编译。

生产Job资产放在项目数据目录下的 `codex-processes`，按原transport根和原operation派生固定短路径；方法workspace、stdio和历史路径保持。这样避免在Skill深层原目录下继续叠加托管程序路径。短根被启动原件和Host intent固定，仍位于原数据根的固定卷约束内；过长的托管程序／配置路径直接拒绝，不创建别名或搬迁旧目录。

SDK模型原件读取器实际复读Job启动与结束原件、独立Host完成票，并把四份Job原件加入既有artifact清单。普通header15和命名Skill header16分别验证新路径及历史重放，不改变SDK回复为建议、真实效果在原SDK执行的边界。

## 验证记录

最初3项反例全部失败：缺少进程Job原件、无需独立Host也接受进程政策、宿主退出场景没有Job启动记录。初版修复后2通过／1失败，失败是上文libuv先终止监管器导致无结束回执；调整后3项通过。撤权期间intent缺失、短根未生效两个独立反例也先失败后修复。所有失败报告与新建操作根保留，没有重开失败原操作。

真实Windows测试覆盖正常完成后终止后代、宿主强制退出后终止worker及后代并观察空Job、同原操作不重启、独立Host关闭后的只读重放、撤权保留intent、原字节篡改与本地seal重算拒绝，以及显式短根。测试使用PUBLIC Node app-server回复，没有真实登录、模型、费用或Skill效果。

首次受影响整轮7文件134项全部通过。短根修补后重跑实际使用新路径的四个完整文件，80项全部通过；另三个未受布局修补影响的完整文件55项通过，合计分阶段7文件135项、0失败、0跳过。不是单次135项完整运行。Node24.22.1／pnpm12.4.2，类型检查及CLI／工作台帮助通过；最终统计只选各文件最后一次完整结果，不重复累计早期验证。

真实Native场景已接相同进程政策和独立Host，改验内部start10、Job原件及完成票，仍保留原Windows/AppContainer、SDK、领域结果、工作台观察幂等和费用Unknown断言。真实调用只使用用户已授权的当前Codex登录及gpt-6-luna，Task仍为600000ms，模型执行入口最多6次；该测试限次不是生产费用批准或账单。仓库外测试配置仅含程序路径、模型和MCP名称；本机原安装及固定OpenCode1.18.34／固定SHA已先核对，未提取登录凭据。

本轮真实场景终态为1文件0通过／1失败／0跳过，原Run为`01a17870-00f8-7540-85fa-0eddc0087740`。实际2轮Luna回复均封口，2份Job结束原件均为worker_exited／exit0／active0／job_closed；内部start10、SDK Job资产与独立Host完成票断言已先通过。SDK实际完成两次cimi_read，后续模型建议cimi_replace，但原WorkItem仅允许read_files／run_checks，Kernel真实拒绝，IPC原响应为denied／tool_authority_denied。源码query.ts摘要仍为原8a38b8bc…，未产生写入或固定检查。独立Native核验因此保持Unknown／agent_native_originals_incomplete，匹配2次已完成读取而完整历史还含1次被拒绝调用；6次IPC均有原响应，身份关联无未匹配项。这是完整真实联动失败，不是模型没有启动或Job回执缺失，也不由此推断模型为何提出越权编辑。

本轮没有执行失败断言之后的领域结果核验、原Run第二次start及工作台观察重放，不将它们计为通过。失败后只读复查原Run和原件，没有重开该Run、再次派发模型、放宽权限、延长Task或更改费用Unknown。原失败报告和全部新资源保留；后续应继续完善只读Task的实际执行与工具暴露／行为对齐，而不能删除拒绝记录、降低Native断言或用已有Job通过项代替完整联动。

本批Windows Job／进程树和文件／Host原件验证通过；新的AppContainer＋真实Luna联动已实际运行但完整场景失败，不是完整Native或模型验收。完整Runtime控制来源、真实账单、物理配额及全部可写路径／历史容量、完整异常恢复矩阵、Human原澄清回答、普通Change到ReadyForDelivery、接入指南和最终Matt／Superpowers／S1均继续。默认完整生产门禁未放宽；不push。

关联：[受控证据与绑定批准](2026-10-26-cimiloop-runtime-controlled-binding.md)、[默认Codex入口](2026-10-26-cimiloop-codex-production-entry.md)、[本机接续](2026-10-09-cimiloop-S1跨电脑接续.md)。
