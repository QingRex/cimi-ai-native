# CimiLoop 原启动共享入口与资源所有权 v0.1

D-265，2026-10-10。本批推进正式生产组合和工作台接续的具体入口；完整 S1 尚未验收。

## 可用路径

`LocalHumanAgentRuntimeStart` 是工作台与同一编译 CLI 的共享服务。先以当前 Human 身份通过 Kernel 原 Run 读取与技术负责人核验，再检查不可变启动登记。已存在的原操作可只读返回同一个 operation_id，未决局部登记返回 Unknown；两条路径均不调用组合工厂、不创建账户或 Run、不修复登记、不证明执行完成或费用结清。首次启动仍需完整受信生产组合、当前 Agent 权限和 Host 唯一启动保管。

生产组合工厂可返回 `AgentRuntimeLease { runtime, release }`。服务捕获原 release 方法，在启动结束或异常后等待并调用一次，覆盖错误身份、撤权、工厂返回后会话失效及启动失败。释放关闭安装者拥有的账户、Host、应用 Store 等句柄，不能停止原 Native 进程或删除证据。工厂在返回 lease 之前失败时，已打开的资源由工厂自身关闭；裸组合返回保持兼容，其外部资源仍由安装者负责。

工作台将当前 session、CSRF、closing 检查以代码回调传给服务，在工厂等待或拒绝后、每次 Native 效果前、释放后及返回前核对。共享服务同时复查 Kernel Human 指派和原范围。安装、lease 字段、scope 读取、启动与释放的非权限异常返回固定公开错误，不公开适配器私有 message。已经付出的效果不会因 HTTP 失败而重开 Run。

页面保留原 Run 的 pending 身份；生产工厂缺失时仍可点击“核对原启动请求”。第一次启动按钮仍依赖安装。正式 Agent 默认入口继续关闭。

## 接入与复验步骤

先确认本机 `node --version` 满足 >=24.15 <25、`pnpm --version` 为12.4.2，按锁文件安装并执行 `pnpm check`。不要将新安装器、模型、凭据文件或任意路径放进 HTTP/CLI 请求。凭据保持仓库外，具体模型、套餐和现金/积分上限批准前禁止真实付费请求。

对已经存在的原 Agent Run，使用当前项目路径和真实原 Run ID：

```powershell
node apps/cli/dist/bin.js run start-original --help
node apps/cli/dist/bin.js --json --project-dir $projectDir run start-original $originalRunId
node apps/cli/dist/bin.js --json --project-dir $projectDir run start-original $originalRunId
```

两次 `original` 应返回相同 operation_id、`completion_proven:false`，不增加 Run、启动次数、模型请求或业务事件。`unknown` 退出1，保留原身份与预算；首次启动缺少组合返回 CAPABILITY_UNAVAILABLE，原 Run 缺失返回 OBJECT_NOT_FOUND。禁止据“不存在”认定旧电脑 Unknown 已清理或认定没有付费效果。

需要真正首次执行时，由受信代码为 `createAgentStartOriginalCommand(factory)` 或 `startWorkbench({projectDir,agentRuntimeForRun:factory})` 安装同一个 factory，不能用 argv、环境变量或 JSON 安装代码。factory 只能准备固定原 Run 的 `LocalAgentRuntimeComposition`，返回拥有明确 release 的 lease。`LocalAgentRuntimeComposition.openDedicatedPersistent` 仍要求真实账户 ledger、专用模型连接、固定检查、Host 全组合准入和当前 Agent Kernel；其缺项不能由本指南的示例或受控测试端口替代。工厂内部失败也要释放已经打开的句柄。

验证资源与会话：延迟工厂期间撤销 Human 技术负责人、使当前 session 过期或关闭工作台；不得启动 Native，返回后的 lease 释放一次。释放失败不能抹掉原登记；恢复应以同一 Run 只读核对。释放等待期间会话失效时不得返回旧启动结果。目录局部登记、权限漂移、账单未知均保留原资源，不 reset、clean、删除 Temp、Profile 或映射。

验证范围和当前证据见[研究记录](../research/CimiLoop-original-start-ownership-2026-10-10.json)及[实施设计](../plans/2026-10-10-cimiloop-original-start-ownership.md)。测试中的控制组合、伪造资格和原登记不是实际 Native 执行或 Skill 证据；历史 D-257 原操作只读重放也不重新验证领域结果或账单。

## 尚需完成

V1-09：新生产 Runtime 完整 Native/SDK/工具/模型/账户组合、真实费用与批准、物理配额、历史容量、完整异常恢复；此前 Bun 故障原因未证明。V1-21：原 SkillInvocation 子范围真实执行及全面 Plan/Task 前真实 Human/Matt 澄清。V1-22：Matt 独立完整评审、当前源码新鲜 Superpowers 和真实行为对照。V1-10：工作台正式 Agent 的完整执行/查询/停止/原操作恢复安装。V1-11：真实普通 Change 到 ReadyForDelivery、真实技能、中断恢复、完整接入指南与 S1 验收。未完成任一组都不宣布持续目标完成。



## 验证记录

最终受影响12文件92项通过、0失败/0跳过/0未处理异常；pnpm check、CLI总帮助和start-original帮助通过。671源码在最终检查、测试前后原字节零漂移，242 Schema语义无漂移，实际历史项目格式10未升级。

实际Windows首轮3文件9通过1失败、0跳过；同源码及原期限的完整取消文件独立复验4通过0失败0跳过。首轮控制器访问违例3221225477发生在挂起确认前，无进程登记/清理证明，失败原件留存Unknown，根因未证明；复验不覆盖初次失败。历史D-257原operation_id两次CLI重放均退出0，Kernel/原身份/4次模型原件不变，Run仍Succeeded、Task仍InProgress；不是本批领域结果或费用再验，更不是新生产运行/真实模型/技能/S1验收。

普通工程复核两项必修已用3个红反例验证并修复，复核未发现新必修，未作为真实Matt/Superpowers。开发反例和测试入口生成代码语法失败完整留存于研究记录，未计通过。详见[研究记录](../research/CimiLoop-original-start-ownership-2026-10-10.json)。
