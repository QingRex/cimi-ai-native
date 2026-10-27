# 父 Run 与完整子 Skill 原调用的共享控制

接续 `f246673`。原停止／恢复已覆盖当前 scope 的 SDK 与模型 Job，但默认父 Run 入口未枚举 Kernel 已登记的子 Skill。父操作已停止不能证明子操作停止；人工逐个操作也不能代替完整集合核对。本批把现有父控制与子控制组合到 CLI、工作台共用的应用服务，不改变 Kernel 业务状态机或启动准入。

## 实施与边界

- 新 `LocalHumanAgentRunFamilyControl` 在 SQLite 读切面列出原 Run 的全部 `skill_invocation`，固定原 scope、record、context 与完整子集合；最多64个，拒绝重复身份。每个 await 及物理控制回调前后重核当前 Human、会话、本地入口、固定 Kernel 权限方法及完整集合，不跨 await 持有数据库事务。
- 父停止先由现有服务执行唯一 `CancelRun`；只有原取消成立才重试父／各子物理取消或恢复。原命令重放沿用回执，响应丢失不新建 Run，不重新派发。子调用原件不可用时保留该行 Unknown，继续核其他原子调用；当前权限／会话／原集合变化则立即停止余下操作。一次守卫失败在本次操作内保持，后续回调成功不能抹去失败。
- 查询、重试取消、恢复在有子调用时附 `family`，无子调用保持原响应。采集继续使用原父原件采集器，不伪造子证据。所有操作不生成领域结果、不结算费用、不释放预算或历史 Unknown。
- 完整资源处置只接受父和每个子控制返回的 Native 与当前 Codex 模型共同正面处置。`observed`、`requested`、原派发关闭（`zero_effects_proven:false`）、旧 Native-only 结果和缺原件均不能得到完整处置结论。`completion_proven:false`、`costs_reconciled:false` 保持。
- 默认 CLI `run query-original/cancel-original/recover-original` 与工作台父运行查询／停止／取消重试／恢复使用同一服务。CLI 对未完整处置的父子集合返回非零；页面明确显示完整集合仍待核对，不能只看父操作停止。`run cancel` 仍仅为 Kernel 业务命令；实际原操作控制使用 `cancel-original` 或工作台对应入口。

## 验证记录

首先新共享服务反例按完整子集合查询失败：所需构造器不存在（1失败、5未选择）。补实现后初轮4通过、2失败：测试误传内部 Kernel 命令，修正为七字段 Human 本地命令，未放宽生产输入。随后12项中11通过、1失败，实际复现一次守卫失败被后续成功检查吞掉。父子服务保留首次失败后，另一个直接父控制反例仍1失败、12未选择：Adapter 自行捕获守卫异常后可返回成功；父控制现也保留首次失败，不允许后续检查覆盖。本批最终13项共同通过。

默认 HTTP／编译 CLI／浏览器的5个接线反例均失败：API／CLI 没有 family，浏览器没有整体资源说明。该轮有效夹具使用实际 Kernel、SQLite、Host1 与原 custody；没有 Native／真实模型。此前另一次 HTTP 夹具因混用源码与编译导出的 Host1 类导致构造失败，3项未执行，不能算接线反例。

第一次类型检查暴露测试的源码／编译 nominal 类型差异、工作台未声明的直接包导入及泛型响应丢失 family 类型；修正测试入口及返回声明后通过。接线时另发现 CLI 联合返回结构的 family 尚属 unknown，显式核对象后通过；没有修改协议 Schema 或放宽来源。

最终 Node24.22.1／pnpm12.4.2 执行 `pnpm check` 与编译 CLI `run --help` 通过。受影响同轮回归 `pnpm exec vitest run` 选下列8个完整文件，参数 `--maxWorkers=1 --reporter=default --reporter=json --outputFile=.cimiloop/codex-2026-10-27-parent-child-original-control-final.json`，合计78通过、0失败、0跳过，exit0、success=true：

| 测试文件 | 项数 |
|---|---:|
| `packages/local-app/test/agent-run-family-control-local.test.ts` | 13 |
| `packages/local-app/test/agent-runtime-control-local.test.ts` | 18 |
| `packages/local-app/test/skill-invocation-control-local.test.ts` | 16 |
| `apps/workbench/test/agent-run-family-control.test.ts` | 5 |
| `apps/workbench/test/agent-runtime-control.test.ts` | 9 |
| `apps/workbench/test/agent-runtime-frontend.test.ts` | 2 |
| `apps/workbench/test/agent-runtime-session-await.test.ts` | 13 |
| `apps/cli/test/agent-original-control.test.ts` | 2 |

覆盖实际 Kernel／SQLite／Host1、原调用 custody、编译默认 CLI、HTTP 与浏览器 DOM。新原集合测试包含两个合法原子调用（第一个先由构造观察结清再预约第二个，未更改 Kernel 单未结调用规则）；PUBLIC 零费用只是领域夹具，不能作为真实账单。原子调用故障不遗漏其余成员，原命令只产生一次领域取消，查询／恢复不新建 Run 或观察，不释放预算。还覆盖 Native-only／取消应答／派发栅栏不能证明完整资源处置，以及等待期间撤权／会话过期、一次守卫失败、无子调用兼容、完整集合变动拒绝。

本地忽略目录保留最终 JSON 与14份源码／测试摘要清单；整轮前后这14份文件零变化。没有运行全仓 `pnpm test`、完整 Windows/AppContainer 回归或真实模型／真实 Skill。本批未执行实际 Native 资源处置，资源结论来自明确 PUBLIC 端口；不能用78项通过替代真实父子 Native／模型故障矩阵。旧失败保留原结果，不改判。

## S1 未完成与外部条件

本批不是完整 Native、真实模型／技能、费用或 S1 验收。完整 `.2` 客户端构建与安装仍缺足够磁盘空间，官方财务原件来源仍待确认。正式生产控制来源、全部可写路径配额／历史容量、完整异常矩阵、真实 Human／Matt／Skill、普通 Change 到 ReadyForDelivery、指南实走及最终 Matt／Superpowers 评审继续。Schema242、项目库10、Host1不变；不读取登录、不发真实模型请求、不push、不处理六个既有未知文件及旧 Unknown。
