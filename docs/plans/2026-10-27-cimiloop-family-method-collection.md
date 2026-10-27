# 父子原件与固定方法结果采集接线

本批继续完整五组 S1。已有父子查询／停止／恢复，父入口采集仍只返回父操作；默认子采集未传原固定方法输入，独立方法读取器只能报告 `agent_method_original_inputs_missing`。本批补齐实际 CLI／工作台采集路径，不升级生产资格。

## 实现

- `LocalHumanAgentRunFamilyControl.collect` 复用现有家族枚举、固定关系与守卫，将父采集和每个原子调用采集组合在同一响应。原子调用缺失／失败保留各自 Unknown，继续其他成员；Human／会话／完整集合变化终止余下操作。没有子调用时保留旧响应。
- 默认 `productionSkillRuntimeOriginals` 租约装入 `LocalSkillMethodInputs`。子采集以原 Project／Descriptor／SkillInvocation 重建固定包输入，给现有独立采集器传 `profile` 和 `files`，采集 await 后重读完整计划并比较。同一读取器被替换、原包不可读或输入变化时抑制结果，保留 Unknown；原租约仍释放。查询、取消、资源恢复不读取方法包，不新增执行或准入依赖。历史未安装输入源的受信租约保持部分采集，不能伪造方法核验。
- 默认 CLI `run collect-original` 和工作台父运行采集沿用共享服务，返回完整 `family.children`。原父／子 Scope 和 custody 均复用；没有新 Run、原执行重派、领域观察、费用结清、预算释放或数据库迁移。

## 验证

修复前父子采集反例：1文件选中4项，3失败、1通过、16未选择。失败分别为缺完整子响应、缺故障后的子响应、没有进入子采集会话检查。固定方法输入反例：1文件选中3项，2失败、1通过、16未选择；失败为没传固定输入及输入漂移后仍返回结果。另测已有租约守卫：1通过、19未选择，证明该守卫原已生效，不把它列为新增修复。

家族接线阶段完整3文件29项通过、0失败0跳过；这是随后方法输入接线之前的阶段结果。类型检查首次暴露新测试对可选 family 未收窄，修正测试后通过，未放宽返回契约。

最终 Node24.22.1／pnpm12.4.2 的 `pnpm check`、编译 CLI `run collect-original --help` 和 `git diff --check` 通过。`pnpm exec vitest run` 同轮选下列5个完整文件，参数 `--maxWorkers=1 --reporter=default --reporter=json --outputFile=.cimiloop/codex-2026-10-27-family-method-collection-final.json`，55项通过、0失败、0跳过：

| 完整测试文件 | 通过项数 |
|---|---:|
| `packages/local-app/test/agent-run-family-control-local.test.ts` | 20 |
| `packages/local-app/test/skill-invocation-control-local.test.ts` | 20 |
| `packages/local-app/test/named-skill-capture-local.test.ts` | 6 |
| `apps/workbench/test/agent-run-family-control.test.ts` | 7 |
| `apps/cli/test/agent-original-control.test.ts` | 2 |

JSON 保留在上述本机忽略目录。覆盖每个原子 Scope／根、重复采集不准备或新建 Run、父／部分子失败后仍采集其他成员、await 后会话失效、完整集合变动、方法输入前后对应、输入变化抑制结果、默认原包缺失时不接受下游伪造的正向方法结果，以及纯查询不读取原包。实际 Kernel／SQLite／Host1／编译 CLI／HTTP／DOM 与原 custody，Native 和方法结果为明确 PUBLIC 端口；未运行全仓 `pnpm test`、Windows/AppContainer 原生回归或真实模型／Skill，不能作为这些范围或 S1 验收的通过证据。

## 继续条件

本批不证明正式 Runtime 完整准入、真实模型账户费用、Native 恢复矩阵或 S1 通过。完整 `.2` 客户端仍未构建成功，本机磁盘空间未改善；现有2GiB构建停止线不降低。官方财务原件来源、同卷运行条件、完整控制／方法读取来源、真实 Human／Matt／Skill、普通 Change 到 ReadyForDelivery、指南实走和最终 Matt／Superpowers 评审继续完成。

Schema242、项目库10、Host1及锁文件保持；不读取登录、不发送模型请求、不push，不处理六个既有未知文件和历史 Unknown。
