# 命名 Skill 原件进入统一 Provider 准入

接续 `48987d25a83adf4ec2d47217c3e5441837e00364`。按用户调整后的节奏连续补主链，开发期仅运行必要类型与关键行为检查；整套真实模型、Native、S1与最终评审留在主链接齐后集中执行。本批没有新增模型请求或更改 Native 启动策略。

## 本批用户入口

现有 `provider record-evidence` 可以通过 `--probe-file` 与 `--artifact-root` 导入已有 `NamedSkillMethodEvidence` 及它引用的固定输入、方法记录、SDK stdout、Native证明和复核材料。只复制按摘要定位、在显式根目录内的限额文件；导入完整字节不授予资格，不复刻外部机器的原进程或原资源。

相同 `RecordProviderEvidence`、`EvaluateProvider`、`RegisterProviderBinding` 命令现在识别命名方法原件，交给现有 `LocalNamedSkillMethodAssessment`。不再要求把真实 `cimi_invoke_skill` 伪装成旧内置 `skill` 工具。旧内置Skill探针继续走原算法，不能与命名方法原件混在同一次评估中。

普通CLI和工作台命令入口共用 `executeProviderCommandWithSources`。它只为命名方法读取现有受保护Codex安装元数据，临时装入 `LocalCodexNamedMethodOriginals`，随后仍调用原Kernel实例；不读取登录令牌、不调用模型、不创建Run、不自动批准Provider。已有命令回执先由原Kernel核对并重放，不要求重新打开来源工厂。工作台在来源打开等待后和返回前重新核对关闭状态及Human会话，原上下文改变时拒绝写入，并释放借用的安装。

CLI示例仍使用既有命令，所有占位项均须来自当前项目真实记录：

```powershell
pnpm cimiloop --project-dir <当前项目> provider record-evidence --file <Descriptor引用输入.json> --probe-file <命名方法原件.json> --artifact-root <原内容对象目录>
pnpm cimiloop --project-dir <当前项目> provider evaluate --file <包含原Evidence引用及profile的输入.json>
pnpm cimiloop --project-dir <当前项目> provider bind --file <包含原Evaluation摘要及Runtime绑定的输入.json>
```

这些是入口说明，本批没有将上述命令作为一次真实生产接入从头执行成功。CLI仍须持有原完整命令输入，内联 `--probe-file` 导入不替代缺文件时的完整CLI恢复指南。已知原回执的共享服务重放通过，不把它扩大为所有CLI外部输入丢失都已恢复。

## Kernel保留的批准边界

Kernel核对原项目、Descriptor、方法、目的、原Runtime绑定、字节摘要、包来源及Schema；独立重新读取受控方法评估，而不接收客户端传来的ALLOW报告。每个样本必须覆盖固定方法读契约，受控模式还须覆盖真实模型、Runtime归属、独立上下文、依赖、权限交集、费用与预算、恢复、行为及原包全部harness要求。缺项、重复项、结果标签与检查不一致、异步结果或回调替换均不形成有效批准；至少两个独立样本仍是受控方法的条件。

完整依据成立时，现有Human Project Owner可显式批准Task级Skill绑定：必须使用同一已批准的Task级Runtime、对应的v1澄清或评审能力和精确声明权限。批准前重新计算整个依据；同一命令只写一次事件。仅有隔离Runtime、方法读契约、旧技术评估或缺少费用/权限/恢复/行为的材料均不能升级。Skill绑定也不替代每次调用的Kernel权限交集、具体方法资格、预算、当前源核对和独立结果读取。

复用现有 `NamedSkillMethodEvidence`、`NamedSkillMethodAssessment`、`ProviderEvidence`、`ProviderEvaluation`、`ProviderBinding`；不增加公共Schema或用户库格式。在既有assessment key中用 `named-skill-provider-assessment/1.0.0` 明确标识组合规则，原完整方法评估进入输入摘要。公开规则仍为 `skill-provider-assessment/1.0.0`；旧证据及旧评估不回填、不提升。Schema242／项目库10／Host1不变。

## 实际检查与开发边界

最初三个针对性用例均因旧入口拒绝命名方法原件而失败。接线后，本批一次四文件检查58项通过，0失败、0跳过：方法评估36、Kernel绑定4、来源等待/重放3、工作台入口15。包括默认Provider宿主导入与方法契约读取、缺失控制、缺失检查的ALLOW拒绝、精确Task Runtime与能力、事件幂等、来源等待后Human过期和原Kernel替换拒绝。类型检查通过。

上述使用实际Kernel／SQLite／Git／内容读取和HTTP入口，但方法、完整控制与账户来源存在明确PUBLIC夹具；没有新的真实模型、完整CLI接入或Windows/AppContainer验收。编译失败中的测试类型/路径问题已修正，不作为产品反例。此前真实模型小场景及旧512模式整轮时限失败保持原结论，本批没有重跑或宣布关闭它们。

默认具体Codex读取器目前仍不能独立给出全部权限、费用、恢复、方法行为和harness证明，因此受控资格仍会拒绝或返回NEED_MORE_EVIDENCE。当前默认读取范围为当前数据根，子Skill的固定子目录原件消费及首批隔离资格采集入口还须继续接通。不能把测试端口的完整ALLOW当成生产已批准，更不能把新绑定入口当成Task验收或ReadyForDelivery。

## 连续开发清单

1. V1-09：把网络、真实费用/账单、物理配额、历史容量及恢复的具体控制来源装入默认宿主，补全当前适用性；解决旧512模式时限稳定性。
2. V1-21：接通隔离资格采集、子Skill原件、完整方法资格及默认调用/恢复，随后收敛父工具目录；接齐Plan/Task前Human/Matt流程并等待真实Human回答。
3. V1-10：默认CLI/工作台使用完整准入与账户组合，完成真实操作及原身份接续的一致性；不依赖调用方注入内部对象。
4. V1-11：在同一真实普通Change中接通澄清、计划/任务、技能、修改、固定检查、独立评价与交付，实际执行接入指南；真实费用、恢复和幂等纳入同一条链。
5. V1-22：最终源码集中自测、Matt独立完整评审、Superpowers新鲜验证和行为对照，修复全部阻断项。

已有外部缺项继续集中保留：可关联原调用的Codex账单来源、专用固定卷prepared.json、同卷仓库外官方已登录目录，以及原Matt业务问题的Human回答。先推进独立实现，不代答、不推断零费用、不以路径或安装状态批准执行。本批本地提交，不push；S1和持续目标未完成。
