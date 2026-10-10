# CimiLoop 原 Skill 子调用专用账户与模型组合 v0.1

D-267 接入原 SkillInvocation 的专用账户共享应用服务和生产专用模型工厂。子调用保留真实父 Run ID，以原 invocation_key 和 input_digest 区分自己的操作；父子现金、积分在同一账户写事务内共享限额。创建模型端口不会发送请求。本批没有真实付费请求、真实 Key 读取、真实命名 Skill 或完整 Native 子执行，默认正式 Agent 关闭，完整 S1 持续目标保持 active。

## 已实现接口与接入

`LocalSkillInvocationStartCustody.accountScope` 先重新核验 D-266 原出生票据、资格包装和独立 admission 原件，再派生内部子范围。`LocalSkillInvocationDedicatedAccount.open` 从当前原 Kernel/SQLite 快照读取真实父子记录；它不接收调用者自报的范围、Human 批准或可序列化工厂。开户、模型检查、冻结预算、hold 验证均重新评估 `assessSkillInvocationExecution`，等待后再检查；不可逆登记和冻结前还有同步最终检查。父范围 `assessAgentRunModel` 在子未结清时继续拒绝。

可信安装器使用已有原账户与原 Skill custody，而非新建同名 Host/Run：

```typescript
const accountPort = await LocalSkillInvocationDedicatedAccount.open(
  originalAgentContext, originalInvocationId,
  installedOriginalAccountLedger, installedOriginalSkillCustody,
);
const modelPort = accountPort.createModel(approvedDedicatedConnection);
await modelPort.check(accountPort.scope);
```

这里的原上下文、原账本和 connection 都是代码安装的实际对象；connection 必须已有 Human 批准及完整独立准入。本例只检查端口，不发请求。模型生产请求沿用现有 dedicated model 的原字节、SDK 模型调用、先 hold 后发送、一次发送和不可变原件路径；本批只实测工厂挂载/检查和真实 Kernel guard，没有发真实 provider 请求。

子模型根固定为本机 dataDirectory 下 `skill-runtime-originals/<project_id>/<原 invocation_key>`。根内模型 Run 仍是真实父 Run，不能以新 Run ID 消除原冲突。生产 Native 子工厂须继续使用同一个根、子范围和模型端口，并复用原 Task 的预算时钟；目前不能直接以既有普通 read/replace/check 工具运行充当命名 Skill 执行。精确方法包/输入与输出 Schema、只读方法材料、真实 SDK 方法加载、物理权限/配额、原 Native claim、独立结果证明仍待接入，原 `beforeEffect` 必须贯穿每次效果。

## 账户范围与持久登记

账户新增内部 `registerSkillScope`，只接受准确的原父/子八字段、invocation_id 和同一原 Host 出生票据。六个共有固定字段及真实 run_id 必须一致，子 operation_key 来自原出生请求；完整 invocation/input_digest、方法、模型、账户、预算、物理准入还必须由代码安装的 `DedicatedAgentAccountAdmission.checkSkillScope` 独立核验。它无默认实现，不能用父 `check`、构造 Digest 或 JSON approved 替代。

当前 Host 已识别的原子调用尚未完成账户登记时，旧 `check/reserve/verifyHold` 不允许借用父准入新增消费。历史未绑定 hold 保持只读原义；出现原出生票据后也不能把旧 hold 自动改成新子登记。等待准入期间任何 relation 变化均拒绝；最后 reserve/verifyHold writer cut 再次比较首次核对的原 relation，不自动转换准入或重跑模型。

每个新子成员依序写不可覆盖的独立登记意图文件、原 Host intent ticket、独立主范围文件及原 Host 主范围 ticket。四份原件在同一账户 writer cut 下完整互验，包含物理文件身份及原 account ticket。即使零 hold，主文件和主 Host 行同时丢失仍有登记意图，费用读取和重新登记都拒绝。任一部分中断保持 Unknown，不补建、不退款、不重发。首个 child hold 的原 Host 锚还固定原范围 ticket，不能脱离注册关系。

Host 的 `readExclusiveNamespaces` 在同一个原格式1 `BEGIN IMMEDIATE` 事务内核验 scope、intent、birth；账户只在当前同步 writer cut 内复用深克隆的完整审计，finally 销毁，不跨等待或下一事务。登记及 hold 写后强制冷核验；最终 Kernel effect guard 后再次冷读，guard 中新增出生票据或破坏原件也拒绝。Kernel 权限、账户准入、资金及账单判断不缓存，实际 Windows 复验与只读耗时证据显示原5秒账户 writer 等待不足；账户显式对齐已有 Host 的30秒有界等待。获锁后重新审计、再次核对原范围及最后 Kernel effect guard，不重试模型发送、不修补原件；30秒 SQLite 等待是同步有界等待，可能阻塞本进程事件循环；本批未验证它与完整 Task 截止时间、外部取消、Native子进程寿命预算的组合，不能作为已满足时钟/停止要求。完整 Task 时钟和 Native 子厂接入仍是后续条件。

新注册子范围经 `parseDedicatedAgentSkillAccountScope` 形成规范字段顺序，与原 Kernel 出生票据一致；注册后以另一字段顺序提交同一子范围也明确拒绝，不能用新的 scope 摘要重复冻结同一原调用。已有父范围及账户 hold/request 的原 JSON 摘要算法不改，不补造或迁移历史原件。注册文件被真实 Windows custody helper 检查所有者、继承和单一 SID 的 ACL，单独放宽某份文件权限也会拒绝。

公共 Schema 保持242，项目库格式10，Host 库格式1，旧专用账户 SQL1/新账单账户 SQL2 不原位升级。本批只显式前瞻增加受保护原件和既有 Host exclusive 记录，不新增用户库迁移。每父 Run 最多64个注册子成员，Host现有总票据1024及账户 hold1023上限继续适用；多个原件共用 Host 总容量，64不是承诺全部同时可用，更不是完整历史容量验收。

## 完整家庭账单

父子 hold 和已认证账单共同占用同一现金/积分限额，任何一维超限都拒绝，不重复冻结原请求，不用 token usage 退款。已有子成员时，旧 `readRunCosts(parent)` 明确拒绝父范围单独结清；精确子范围成本仍可只读核验。

`readRunFamilyCosts(parent, originalChildScopes)` 要求清单与所有原登记子范围完全相同，不可省略、重复或替换成员，逐范围汇总实际原 hold 与已认证账单。任一范围零 hold 或未有对应账单，家庭 `costs_reconciled` 都为 false；零 hold 不能作为未发生效果/资源已清理的证明。只有全范围有原 hold、原账单全部核对后，该费用投影才可能为 true。

该投影不自动观测领域状态、不执行 `ReconcileSkillInvocation` 或 `ReconcileRun`，更不满足 Task。后续独立生产 verifier 必须从 Kernel 原 SkillInvocation 集合取得完整清单，并联合原 Native/SDK/工具/模型原字节与领域输出及认证账单核验。已实现父费用 reader 在有子成员时保持拒绝，不以父 SDK 摘要漏过子链。受控 CNY/积分账单只验证汇总逻辑，不批准实际智谱模型、套餐或账单。

## 可运行的零付费验证

定位本机 Node >=24.15且<25、pnpm12.4.2，按锁文件安装后执行：

```powershell
pnpm check
pnpm exec vitest run packages/runtime-adapter/test/agent-exclusive-snapshot.test.ts packages/runtime-adapter/test/agent-skill-account.test.ts packages/local-app/test/skill-invocation-execution-local.test.ts packages/local-app/test/agent-dedicated-account-local.test.ts packages/runtime-adapter/test/agent-dedicated-account.test.ts packages/runtime-adapter/test/agent-account-bills.test.ts packages/runtime-adapter/test/agent-legacy-account-billing.test.ts packages/runtime-adapter/test/agent-dedicated-model.test.ts packages/runtime-adapter/test/agent-start-ledger.test.ts packages/store-sqlite/test/agent-run-model.test.ts --maxWorkers 1 --testTimeout 240000 --hookTimeout 120000
```

实际 Windows x64 必须运行，跳过不算通过：

```powershell
pnpm exec vitest run tests/scenarios/agent-dedicated-account-custody.test.ts tests/scenarios/agent-start-custody-runtime.test.ts --maxWorkers 1 --testTimeout 240000 --hookTimeout 120000
```

Windows范围包括真实账户/Host原件 ACL、子范围文件权限漂移、两个独立 Node 进程对同一原 child 登记及 hold 的重放。它不运行 Bun/AppContainer 中的完整命名 Skill/SDK/model 子 Runtime；不能覆盖 D-258 Bun 段错误或 D-265 控制器访问违例。这些失败、旧 Unknown 原件和旧机器资源继续保留，未批量清理。

## 验证记录与继续条件

最终源码快照、回归逐项范围、Windows结果、开发失败原因和普通只读代码评审见 [D-267研究记录](../research/CimiLoop-skill-account-composition-2026-10-10.json)。本页不是完整 S1 接入验收指南。

本批最终受影响回归为10文件127项通过，实际 Windows 为2文件10项通过，无失败、跳过或未处理异常；此前失败的双进程子登记用例再次独立运行1项通过（其余6项是筛选排除，不计该次通过）。pnpm check、CLI帮助、242 Schema对照通过，680份源码前后核对无漂移。早期实际 Windows 两轮各8通过/2锁失败，30秒等待轮为9通过/1原件读取失败，失败原件保留；后续通过不能解释那次原件读取失败，也不证明历史资源已清理。普通工程评审未发现剩余必须修补项，不代替真实 Matt/Superpowers。

| 目标组 | 本批进展与必须继续的条件 |
| --- | --- |
| V1-09 | 原父子账户与生产模型工厂挂载、完整家庭费用汇总已实现；继续固定检查/完整 Native-SDK-方法-模型-账户组合、领域结果、物理配额、历史容量、费用预算/账单与完整恢复。 |
| V1-21 | 子调用账户共享服务可执行，原资格/当前 Kernel 校验贯穿；继续真实 Skill SDK 方法及 Plan/Task 前 Human/Matt 真实澄清。 |
| V1-22 | 三项普通工程评审缺陷已修补；继续真实 Matt 完整独立评审、Superpowers 当前源码新鲜验证及真实行为对照。 |
| V1-10 | 新共享服务保持 Kernel 唯一权威；继续工作台正式 Agent/子工厂执行、查询、停止、原操作恢复与实际端到端接入。 |
| V1-11 | 本页提供本批零付费检查，继续真实普通 Change 到 ReadyForDelivery 的技能、恢复、S1验收及可操作真实接入指南。 |

用户仅确认智谱提供方；实际模型ID、套餐及计费、现金上限/币种、积分上限仍未确认。确认前零付费、无真实 Key 读取，不从旧消息复制凭据。完整目标未缩小，五组未完成，持续目标保持 active。
