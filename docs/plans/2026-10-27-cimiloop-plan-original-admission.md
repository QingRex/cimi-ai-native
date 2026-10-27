# CimiLoop 计划原件准入与工作台复查接线（2026-10-27）

接续 `14fd9fe`。S1 五组范围保持，本文是开发批次记录，不是 V1-21、V1-22 或完整 S1 验收。

## 用户操作与实际接线

工作台的计划表单现在先将完整 Plan 和当前正式 Contract 交给原 Matt 方法复查。该轮仍有新问题或 unresolved 时，继续真实 Human 问答／方法调查；没有新问题与未决时，显示原复查内容，并由 Human 提交同一份 Plan。提交时不重新生成 Task ID 或重新拼装 Plan，之后仍须 Kernel 准入和 Human 的正式确认。

CLI 的 Plan 提交／确认／任务初始化、共享异步命令和工作台候选接口现在复用 `withInstalledPlanningClarification`。它在 Kernel 事务外打开既有 Matt／Runtime／控制原件，事务内仅安装同步历史读取窗口，退出立即撤销。历史成功回执先于来源打开；不调用模型、不创建账户／Run，不自动批准 Provider。旧同步应用入口仍要求调用方明确提供历史核验窗口，不能凭空获得 Matt 权限。

默认组合实际执行以下核验，而不是接受上传的 JSON verdict：

- 从私有不可变问答库重建每次 Matt 的完整原输入、此前 Human 问答、结果及最后计划候选；原 Human 投影的既有格式与摘要保持。
- 最后一次 Matt 必须紧邻候选，其 `review_plan.body` 和 `review_plan.contract` 精确对应 Kernel 当前 Plan／Contract；必须已回答原 Human 问题，最后一轮没有新问题／unresolved。PUBLIC 来源不能用于正式准入。
- 逐次复查受保护原方法结果、完整方法资格及当前来源；回调必须同步严格返回 undefined，回调替换和原件变化拒绝。方法原件的 `unqualified_method_execution` 不等于资格批准。
- 原方法的真实进程控制单独复读，核对原程序和 companion 包、Job 硬限、原项目写域、网络、私有登录目录、环境／路径／包权限。模型、账户、来源相同不能替代实际 harness 对应。
- 普通用量政策核对实际原请求及前后额度账户事实。受控配置不能同时设置配置级 `usage_policy` 与 `state_policy`；新方法仅显式指定 `ordinary_quota_account_digest` 时在原请求加入政策／账户固定，未指定的历史请求不变。这不是金融费用结清。

`CAPABILITY_UNAVAILABLE` 或 `EVIDENCE_MISSING` 不再终结计划候选。原候选保持 pending，来源可用后重放同 request_id／requested_at／body；不重新调用 Matt。重复失败可以产生新的当前诊断时间，原候选输入始终相同；成功仍使用 Kernel 不可变回执。既有已终结拒绝记录不改写。

## 兼容与安全边界

私有会话记录2中的 `matt` 动作增加可选 `review_plan:{body,contract}`。旧无该字段的动作和格式1／2会话仍可读取；它们不会自动变成已复查的新计划。私有库 DDL／user_version1、Schema242、项目库10、Host1及锁文件保持，没有用户库迁移。

另关闭本批独立审查的两处共享服务问题：Human 启动拒绝 Promise／false／thenable 等非 undefined 请求守卫，接管真实 Promise 拒绝且不调用任意 thenable；子 Skill 控制在构造时固定 store、Kernel、授权方法和 bound 调用，默认原件租约也固定该方法，效果前和 await 后检查替换。Kernel 仍拥有业务取消和全部领域结果的唯一权威。

## 尚未接通的正式路径

现有 `openInstalledCodexMatt` 的安装2仍是独立的预计划方法执行安装，其执行配置没有完整受控 Runtime 的程序包／Job／固定卷／网络组合。新增实际控制核验会明确拒绝；本批没有自动升级或改写旧安装，也没有实现新的受控预计划安装器。必须补齐该安装及原用量／金融预算关系，并获得真实行为资格，默认真实计划链才可通过。

Codex 子 Skill 的正式已知费用结果仍需实际财务原件适配；不能用 token、额度窗口或订阅推定费用为零。命名方法权限／费用／恢复／行为与 Runtime 完整异常来源仍有未完成实现。不能将上述历史核验接线称为完整生产 Runtime 或 S1 开发已完成。

## 验证与评审

本批反例先验证了旧行为：计划缺少具体复查输入／原件准入、守卫接受非 void、Kernel 方法可替换、原候选因能力／原件缺失被终结、新受控请求没有政策字段。均在对应实现后复验。

Node24.22.1／pnpm12.4.2 的 `pnpm check`、编译后 `clarification advance --help`、工作台脚本语法检查通过。规划最终同轮9个完整文件87项通过、0失败、0跳过、exit0／success=true（约71秒），记录为 `.cimiloop/codex-2026-10-27-planning-original-admission-final.json`：规划原件准入10、既有规划准入18、默认准入9、Matt执行15、具体Codex宿主6、固定方法12、工作台规划HTTP2／Plan9／Matt前端6。

共享启动／子Skill控制另一次完整2文件回归46项通过、0失败、0跳过、exit0／success=true（约314秒），分别24／22项；记录为 `.cimiloop/codex-2026-10-27-original-control-guards-final.json`。它在后续规划请求字段修订前执行，未作统一最终整仓回归或累计S1验收。

首次规划完整回归因“失败诊断时间应完全相同”的旧断言失败：新 pending 请求会重新核对当前条件，调整为核对原请求／会话／错误及零业务效果。另一次9文件85项虽通过，进程因浏览器丢响应夹具未排空 HTTP body 产生 Undici 未捕获异常而 exit1，不能记通过；夹具现排空响应并等待本轮 fetch 完成后关闭 DOM，最终重跑无未捕获异常。

两轮独立 Matt Spec／Standards 开发中静态审查发现并促成上述 UI、实际 harness 对应及配置／请求政策矛盾修复。最终限定静态复核未再发现确定矛盾，但没有覆盖整个历史差异，也不是最终 V1-22 评审。PUBLIC 方法／资格端口及模拟丢响应仅用于验证应用集成；不是实际模型、Native 方法、费用或 S1 证据。

## 外部条件和后续开发

当前完整管道客户端仍未构建成功。此前真实构建因2GiB空间保护停止，原 Job 已处置且未重开；本次盘符核对 C 约2.10GiB、D 约0.08GiB空闲，仅有这两份文件系统容量。需至少10GB可用构建目录或另一台 Windows builder；不降低保护线、不删除未知资源、不禁用系统组件。官方 Codex 现金／积分账单来源仍需确定，不索要 API Key 或登录令牌。

下一开发批次须优先实现受控预计划安装／用量与费用组合、Codex 子 Skill 正式费用及真实方法行为来源；新空间落实后继续完整客户端与 Native 验收。随后完成实际 Human／Matt／Skill、默认 Agent 工作台、普通 Change 到 ReadyForDelivery、指南实走及最终整体评审。默认只本地提交，不 push；六个既有未知文件及历史 Unknown 保留。
