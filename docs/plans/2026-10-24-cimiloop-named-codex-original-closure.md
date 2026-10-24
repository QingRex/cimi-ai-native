# 固定 Skill 正常及取消结果的 Codex 原件闭包

基线98b02dd。S1五组、Schema242／项目库10／Host1保持。核对正式宿主时发现实际结果消费缺口：正常固定方法只比对外层SDK回执；取消读取还只接受采集格式1，而Codex原采集已是格式2。已有原字节不等于结果消费者已经验证它们。

1. 新增反例覆盖Codex内层缺失／未封口／scope、header、调用或响应不一致；外层Native／SDK自洽也必须Unknown。保留Dedicated和无外部模型的历史原义。
2. 正常及取消读取共用原模型闭包核验：原Host header／输入／Native输出策略与原绑定一致；Codex逐调用须由既有独立reader验证且原Native输入确已固定。读取结束再核对同一原件，不初始化、修复、执行模型或方法。
3. 取消路径按原后端接受格式1／2；格式2必须核对完整Codex summary及原始blob，不能仅把格式号改为允许。仍只证明原取消及已完成前缀，不生成方法成功、领域完成或费用结清。
4. 跑受影响整文件、check、真实Windows/AppContainer命名方法回归，以及原真实Luna／Native封口的只读补验。独立静态复核、更新指南和本地提交，不push。失败与Unknown原件保留，不能将受控模型、跳过或重复子集当作S1验收。

完整宿主仍需真实全部写路径／物理配额、费用和完整恢复的准入，不能靠新callback或ALLOW标志启用。继续完成默认正式Runtime、真实Skill／Human-Matt、最终源码Matt／Superpowers及普通Change到ReadyForDelivery。

## 实现与兼容

正常结果与取消读取共用私有 `readNamedMethodCodexOriginals`。它核对原 Host header 摘要／模型声明、原 Native 输入中的模型绑定、输入与配置的输出模式，以及独立 Codex reader 返回的 scope／header／逐轮调用ID、封口状态和响应；结束前再次读取同一原件。内层缺失、未固定到原 Native、未封口或与外层响应不一致时保持 Unknown。

取消格式2沿用现有 collector 的 Codex summary 与原 blob 核验器；Codex blob 上限沿用已有8MiB，其余采集原件仍4MiB。非 Codex 后端仍只接受原格式1，不把 Codex marker 降级成旧证据。没有新增公开结果格式或升级历史用户库。

独立复查另发现并行工具完成顺序误判：取消读取此前按列表位置比对模型工具与 SDK 完成事件。新增完整步及末尾未完步两项反例先复现 Unknown，再改为按原 `tool_call_id` 对应；重复ID、数量、输入、完成状态和IPC步骤／ordinal边界均保留。复查确认该项关闭，无新增必修；这是本批静态工程复核，不能代替完整 Matt 或 Superpowers 方法验收。

## 原生与真实原件范围

先跑新增原件反例，报告 `named-codex-closure-red.json` 为10失败、7通过、31未执行：复现正常结果错误接受、取消格式2误拒和格式降级误认。修复后的两整文件报告 `named-codex-closure-focused.json` 为48通过、0失败0跳过。独立复查新增并行顺序反例，`named-codex-cancel-parallel-red.json` 为2失败、33未执行；这些仅是反例复现，不能累计为整文件通过。最终整文件结果另列下方。`pnpm check` 和编译 CLI 帮助均通过；三份文档UTF-8、围栏和42个本地链接通过，`git diff --check`通过。

最终 `pnpm exec vitest run` 指定下列六个整文件，`--maxWorkers=2`，报告 `named-codex-closure-final.json`：139通过、0失败0跳过，631.39秒。

| 整文件 | 通过 | 实际范围 |
| --- | ---: | --- |
| runtime-adapter／agent-named-method-cancellation | 35 | 受控原件，含格式2与并行顺序反例 |
| runtime-adapter／agent-named-method-output-policy | 15 | 受控跨层策略／Codex缺件与不一致拒绝 |
| runtime-adapter／agent-codex-model | 44 | 真实stdio子进程与原账本；模型／账户回复PUBLIC，含新消费者闭包／blob丢失拒绝与同原件恢复 |
| runtime-adapter／agent-named-method-result | 2 | 固定目的与结果Schema语义 |
| local-app／skill-invocation-verified-result | 17 | 实际Kernel／SQLite／原保管，模型／资格／账单reader为夹具 |
| local-app／skill-invocation-reconciliation | 26 | 同上，含原取消／费用恢复与重复请求 |

在本机实际 Node24.22.1／pnpm12.4.2 环境，`CIMILOOP_NATIVE_TEST_ROOT` 显式指定本机新建且已核验ACL的短根后，执行 `pnpm exec vitest run tests/scenarios/agent-named-method-runtime.test.ts --maxWorkers=1`：1文件1项通过，0失败0跳过。实际保留根为 `D:/CimiS1/sdk-private-dd2dbb69/cimiloop-named-runtime-lSLy0v`，报告 `named-codex-closure-native.json`。测试覆盖真实 Windows/AppContainer／Native／原 SDK／IPC、六步受控模型回复、五次固定方法读／调用及资源恢复；模型和资格为 PUBLIC 夹具，不能当成真实模型或完整 Native／S1 验收。测试采用同类场景已有的可选短根变量，原默认根仍保留。

该原生正向运行覆盖本批最终未再改动的正常方法及共享Codex闭包代码；之后取消并行匹配修改由上述最终整文件覆盖，原生正向不包含真实模型取消。全部计数按各自实际运行范围保留，不将旧全仓／原生故障改写为通过。

最终编译 reader 对保留根 `%LOCALAPPDATA%/CimiS1/codex-skill-1yqPJR` 的真实历史五轮 Luna／Native 原件只读复验：四次方法调用与最终结果核对通过；原 Codex、SDK、Native 身份和方法账本前后相同，Kernel事件不增。固定上游源码提交 `6fd947921b935b7e1e69293a200400f0fdd5c15f`；这次新增模型回合／方法效果／Kernel事件均0。最终报告 `named-codex-closure-final-actual-original.json` 绑定三份 reader 的源码及编译产物SHA256，不打开或提取登录令牌。

尚无本批真实模型取消的正向验收。完整 `LocalSkillInvocationResultCollection` 的生产模型／账单组合仍需继续，不能把本次底层结果核验冒充其已完成。缺实际费用时 `costs_reconciled:false` 保持；当前没有全仓 `pnpm test`、全部 Native 回归或普通 Change 到 ReadyForDelivery 的完整证据。管理员专用卷、全部写路径与物理配额验收仍待实际准备及执行，历史 Unknown 资源不变。
