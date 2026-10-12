# Original Skill cancellation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把完整原 Skill 取消、历史资格和最终现金/积分账单接到共享 Human、工作台及 Kernel Cancelled 核对，保留同原调用与命令。

**Architecture:** 可信只读采集器查询原物理身份，再独立重读原 cfg6、方法材料、取消、SDK/IPC、模型及账单。Kernel 同步复核保存的原证据，只由 Kernel 提交领域状态。物理停止不替代取消、未启动、费用结清、父预算或 Task 验收。

**Tech Stack:** Node24.19.0/pnpm12.4.2、TypeScript、Vitest、SQLite、Windows AppContainer/Job、原 OpenCode SDK。

---

2026-10-12，D-278开始前制定计划；本批五项任务已实现、完整验证和更新文档，按要求仅本地提交，不push。基线655ee7cfb18f99a6f776f0684d005f62992c7eb5；完整V1-09/21/22/10/11目标active。用户已授权自主顺序实施，不重复架构审批/执行选择，不切换现有main工作区；保留Schema242/用户库10、原身份、不可变证据和已有两个未跟踪TMP。不push、不读真实凭据、不付费。

## 实施前源码已核定的缺口

- packages/local-app/src/skill-invocation-result-local.ts只接成功/固定方法输出失败，Human报告只接受succeeded/failed。
- packages/runtime-adapter/src/agent-named-method-result.ts要求result.json、exit0、完整SDK最后stop和全部材料访问，不能用于证明取消。
- packages/runtime-adapter/src/agent-runtime-cancellation.ts已核cfg5/6原marker、scope/owner/nonce/phase、130及可信清理。
- collectAgentRuntimeOperation已查询原OS进程并采集原取消、IPC、模型字节，但collection标签还必须独立重验。
- packages/local-app/src/agent-runtime-terminal-local.ts父Run固定cfg5；不能拿父record/scope冒充child或放宽普通工具验证。
- dedicated/model/cost读者对无调用不证明Observed/零费用；目录缺失、unclaimed、旧电脑不存在不能证明NotStarted。
- packages/kernel/src/skill-invocations.ts已有cancelled/not_started语义，公开Schema不变。

## Task 1: 独立原named取消核验

Files: 新建packages/runtime-adapter/src/agent-named-method-cancellation.ts、packages/runtime-adapter/test/agent-named-method-cancellation.test.ts；修改packages/runtime-adapter/src/index.ts。

1. 行为红测：闭合原cfg6、取消130、原OS已停止/处置、模型/方法/IPC一致才产生取消候选；仅Stopped、成功result或伪造取消均拒绝。单元夹具明确构造。
2. 运行pnpm exec vitest run packages/runtime-adapter/test/agent-named-method-cancellation.test.ts，确认缺入口行为失败。
3. 新只读入口核原ticket/claim/binary/Job/admission/method/model binding、Kernel原取消、marker/phase及incomplete130。复用verifyCollectedAgentRuntimeCancellation，不接HTTP传入root/scope/pid/终态。
4. 独立枚举并匹配全部原方法和模型调用与认证IPC；已有SDK记录核实际身份/入参/输出。拒绝未决、额外或缺失调用和SDK冲突；取消不要求方法成功/访问全部材料，不伪造SDK完成或Skill输出。
5. 两次重读原件/摘要；缺资料、无调用和未决发送保持Unknown。

拟定新私有结论：format=cimiloop/original-named-cancellation/1.0.0；status=Observed|Unknown；cancellation_reverified:boolean；method_result_reverified=false；costs_reconciled=false；domain_observation_produced=false；artifacts仅原name/path/digest。旧成功/失败格式不变。

## Task 2: 原取消、资格、账单与同步readResult

Files: 修改packages/local-app/src/skill-invocation-result-local.ts；测试packages/local-app/test/skill-invocation-reconciliation.test.ts、packages/local-app/test/skill-invocation-result-capacity.test.ts。

1. 红测真实Kernel父cancel_requested、原child取消、原历史资格和完整账单缺一拒绝，原Unknown无变化。
2. 保留既有同步captureReconciliation；增加单独异步取消采集及共享Human选择入口，内部仅调用固定原root/scope只读collectAgentRuntimeOperation。
3. 所有等待后重核location/instance/metadata/custody和Kernel取消。新取消proof/report无output，completion_proven=false；只Human reconciliation可报告cancelled。
4. 仍须DedicatedAgentAccountLedger实例、同原calls/holds/connection/admission/currency、认证最终现金/积分账单及预约固定历史资格。token usage、余额或取消标签不是账单。
5. 同步readResult逐字段重核原collection、可信OS与Native原证据、原bytes/副本、材料、全部调用、资格和账单，不能只信布尔标签。独立增加内部proof格式及容量边界，兼容旧原件/旧报告/库10。
6. 验证childCancelled时父仍Unknown/预算held、Task未验收；父最终结清仍走完整family费用及终态路径。

## Task 3: 共享Human/HTTP原操作接续

Files: 修改packages/local-app/src/skill-invocation-reconciliation-local.ts；测试apps/workbench/test/skill-reconciliation.test.ts。

1. 红测原CancelRun后ReconcileSkillInvocation只一次Kernel领域效果，响应丢失/释放失败/重启后同Command ID重放，无新模型/Native效果。
2. 服务等待真实采集后重核Human、权限、关闭/会话guard、完整location/instance/invocation；准备及提交前再授权，沿用原intent/prepared/receipt。
3. 已提交不重采且不需collector工厂；未提交原prepared仍须完整同步核验。精确字段拒绝序列化终态/证据/账单/root。

## Task 4: 实际Windows与完整验证

Files: 新建tests/scenarios/skill-invocation-cancellation-native-runtime.test.ts；参考现有skill-invocation-native-runtime.test.ts及skill-invocation-control-native-runtime.test.ts。

1. 新原AppContainer/Job/实际SDK/认证IPC夹具在可闭合边界请求Kernel取消，独立获取130及OS停止/处置；模型/资格/批准/账单明确构造，无真实凭据或付费。
2. 工作台完整原取消核对，丢响应/重启后同命令恢复；证明childCancelled、费用已核、父Unknown/held、Task待验收，无重开或新发送。
3. 未决发送、截断SDK、缺账单/资格、原marker/nonce/owner/scope/Job/材料替换及额外调用反例均Unknown或拒绝；不得补原件制造正向。
4. 在固定源码上复验所有受影响完整文件与实际Windows文件，跳过不算通过；保留失败及原资源，不选绿项掩盖失败。D277首次Job控制器错误根因未证明，保持记录。

验证使用选定Node/PATH与pnpm12.4.2、同锁文件；每轮唯一log/report/exit及源码摘要：

- pnpm exec vitest run packages/runtime-adapter/test/agent-named-method-cancellation.test.ts
- pnpm exec vitest run packages/local-app/test/skill-invocation-reconciliation.test.ts packages/local-app/test/skill-invocation-result-capacity.test.ts apps/workbench/test/skill-reconciliation.test.ts
- pnpm exec vitest run tests/scenarios/skill-invocation-cancellation-native-runtime.test.ts tests/scenarios/skill-invocation-native-runtime.test.ts tests/scenarios/skill-invocation-control-native-runtime.test.ts
- pnpm check；CLI帮助、242Schema/库10核对；git diff --check。

## Task 5: 文档及本地提交

新增D278实施/研究记录，更新实施/研究索引、V1计划、SDK原字节账本及跨电脑接续记录，列实际可用入口、真实/构造边界、完整验证、失败与未决及可操作指南；精确stage本批文件后本地commit，不push。

完整五组仍保持：无调用/NotStarted独占及零效果证明、完整父子结清、磁盘硬配额/历史容量/全部异常、真实模型/账户批准、真实Human/Matt Skill、Matt完整评审、Superpowers当前源码验证与普通Change至ReadyForDelivery/S1验收。本批取消不替代这些条件；新发现的原件/容量/异步约束须修正计划并继续实施。

## 本批收尾

受影响16文件187项通过；实际Windows7文件15项通过，均0跳过、单轮完整范围通过；713源码无变化、check/CLI/242 Schema/库10通过。新增SDK非最后stop、工厂/采集/释放location漂移及取消容量行为红测后修补；最初Local红测caller夹具无效不计特性红证据，修正后使用实际失败行为。实际Windows原取消已接最终账单、Human HTTP、Kernel和同命令重启恢复；模型/资格/账单仍构造，父Unknown/held与Task待验收。见 [D-278实施记录](../implementation/CimiLoop-原Skill取消终态与费用核对-v0.1.md)。完整五组目标active，本批不push。
