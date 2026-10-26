# 将真实 Codex／Native 方法原件接入资格评估

接续 `75837f442c6274bb52b31c898ba7cffc467e0558`，完整 S1 五组不缩小。原方法评估器只消费旧网关 `FixedMethodTranscript` 和旧格式 Native 回执；当前 SDK 的 `cimi_invoke_skill`／`cimi_read_method_resource`、IPC 账本、Job 与 Codex 原件无法进入该评估路径。因此，即使已有真实 Matt 原调用，也不能直接核对其资格缺项。

## 实现路径

`LocalNativeNamedMethodSamples` 从受信任安装指定的原件根读取已有 scope，实际重核固定 Git 包、方法输入、原请求 profile／instructions、Native 与 SDK／IPC 对应、输出契约、清理证明和原二进制身份。样本只保存 scope、profile／原身份／结果／完整原件清单摘要，以及原 stdout 和清理回执的不可变内容引用；不接受 JSON 提供的目录、成功标志或预计算评审结果。重复捕获同一原调用仍只读原件并复用内容摘要，不派发 Native 或模型，也不创建 Kernel 业务记录。

样本使用新的内部内容格式 `cimiloop/native-named-method-sample/1.0.0`，放在现有 Provider artifact 引用中。评估器按该明确格式选择独立读取器；旧网关格式按原解释完整保留。公共 Schema242、项目库10及 Host1不变，没有用户库迁移。历史资格仍逐次独立重算，不能用导入的 ALLOW 标签覆盖原件。

`LocalCodexNamedMethodOriginals` 进一步核对受保护原安装的程序、模型、账户与额度账户，原 Codex request／response／seal、SDK 投影和原调用时的普通额度许可。它在全部样本之间拒绝重用 Native Profile、SDK session 或 Codex thread，并重核原安装身份。可证明的原 Job／Native 原件链、空 Provider 依赖及实际命名 SDK invoke／材料读取按各自边界记录；有效权限交集、现金／积分账单、完整恢复行为和方法行为不会被这些原件推导为通过。

该具体读取器可由受信任 Runtime／Skill 装配使用，替代只能核对 PUBLIC 网关账本的读取器。它没有新增业务批准入口，也没有安装完整生产宿主或给 Runtime／Skill 绑定发 ALLOW。方法资格仍须通过全部既有条件及 Kernel 的当前业务授权。

## 已执行的真实原件核对

保留的真实 Matt 来源为 `mattpocock/skills@6fd947921b935b7e1e69293a200400f0fdd5c15f`。本批先验证其本机实际 Git 来源和已有原调用仍存在，再用当前读取器核对原来的5次 Luna调用、完整命名 SDK／Native／IPC 原件及原结果。新的候选材料只存入本批自有证据目录，没有将新 Descriptor 写入原项目 Kernel。

这是当前源码对历史真实调用的重新核验，新增模型请求、方法效果及 Kernel 事件均为0；不是本批新执行方法，不是最终源码上的新鲜 Matt 独立评审，也不能升级历史 Native13原件为新 Profile／固定卷的证据。读取契约返回 ALLOW，完整受控资格返回 NEED_MORE_EVIDENCE，缺项包括权限交集、账单、恢复、方法行为、Human 问答／委派能力和第二个独立样本。原 Human 问题继续等待真实回答。

复查时新增“只改变原件字节、保持 JSON 意义且更新局部摘要”的反例，先确认初版桥接缺少全原件清单固定。现将 Native 及 Codex 全部原件的路径／名称／摘要清单加入样本摘要；不能通过刷新局部 digest 把新字节冒充旧证据。最初失败、修复后的独立反例及最终完整回归分别保留。

## 验证与继续条件

Node24.22.1／pnpm12.4.2，按锁文件安装；类型检查通过。新增 Native样本9项与 Codex读取器6项分别先失败后通过；对应19／28项未运行不能算各自整文件通过。首次测试还修正了测试工程对 package 类型路径和 Vitest 替身解析路径的装配错误，不改变产品验证规则。

首个受影响回归为五个完整文件140通过／1失败／0跳过，失败就是新增原件清单固定的反例；该回归在清单固定修复前已经启动，原报告保留。完整 Runtime准入20项、原Skill结果22项、父当前结果38项和人工对账26项通过。修复后以新进程完整重跑方法评估文件35项，全部通过；最终分阶段取五个完整文件共141项通过、0失败0跳过，不重复累计已重跑文件。

加入完整原件清单后的真实历史调用回验再次通过，仍为原5次 Luna回合，新增模型／方法／Kernel效果为0。`native-method-validation-summary.json`固定前后五份源码摘要、各个最终完整文件报告、首次失败及最后一次真实原件回验摘要。CLI Skill帮助、工作台帮助、两份文档 UTF-8／围栏／97个本地链接和`git diff --check`通过。未运行全仓测试；本批没有新建 AppContainer 或执行新的真实方法，历史原件回验不计作新源码上的完整 Native／模型／S1执行验收。

完整生产资格／默认装载仍未完成。固定卷与登录目录的真实准备、账单来源、Human 原回答、完整恢复／幂等场景、真实普通 Change 到 ReadyForDelivery 及最终 Matt／Superpowers／S1 验收仍须继续。本批不将原件读取、技术契约、构造资格或历史模型调用称为其中任一组正式验收完成；默认不 push。
