# CimiLoop 原 Run 修改后固定检查 v0.1

2026-10-09，D-243；实施 V1-09 的生产执行组合。正式 Agent 默认入口继续关闭。构造 Provider / Skill / 账户与模型回复只验证执行路径，不是实际资格或 S1 验收。

## 1. 问题与实际行为

旧固定检查把检查脚本和普通源码一起固定在启动前 Context 的摘要。即使 Agent 通过原 Native 工具合法修改源码，随后检查仍按旧摘要读取，因不匹配而拒绝。D-243 新增显式 `original_run_edits/1.0.0` 策略：保留固定检查脚本、Node、argv、权限、时间与输出限制；在同一 Run 中检查已完成 Native 写入后的源码快照。

可信安装模板显式选择策略。模板中有 `expected_digest` 的文件继续固定，没有该字段的普通输入被列入 `editable_inputs`，其初始摘要仍来自原 Context 实际字节。入口脚本必须固定，不能设为可修改输入。HTTP、CLI、模型参数不能指定策略、源码摘要、配方或账户。

```ts
const template = {
  check_id: "query_test", profile: "node_test", entry: "src/check.mjs",
  source_policy: "original_run_edits/1.0.0",
  inputs: [
    { path: "src/check.mjs", expected_digest: fixedHarnessDigest },
    { path: "src/query.ts" }
  ],
  max_elapsed_ms: 4000, max_output_bytes: 32768
};
```

调用仍只选择原 `check_id`，原 SDK call identity 和目录摘要保持；不增加自由 shell、命令行或模型选路径。共享 `LocalAgentCheckAdmission` / `LocalAgentWorkspaceToolService` / `LocalAgentRuntimeComposition` 使用同一实现。

## 2. 原写入与输入核验

宿主独立只读核验同一个 Run、operation_key、executor 和 Context 下的原文件账本，不能采用模型自报的写入。未知、reserved、executing 的原文件调用阻断；not_started 不被当作效果。

对可修改输入，从 Context 初始摘要出发，沿已完成 Native 回执的 before / after 摘要构造唯一链。SDK call_id 没有顺序含义，不能按名称猜时间。缺少起点、分支、循环、重复身份，以及固定文件被原工具写入都拒绝。Windows 大小写路径按保守大小写折叠匹配，不能用 `src/QUERY.ts` 跳过 `src/query.ts` 的历史写入。

当前保守实现拒绝返回已见摘要的重复或循环写入，不能自动证明它们的时序。需要后续明确时序证据再扩展支持，不修改或清空旧账本。

实际读取通过持有文件身份的 Native broker，并要求文件当前摘要等于原回执链末端。宿主或其他 Run 直接修改源码不能由磁盘上的新摘要取得资格。捕获完成和 dispatch 后再次核对原文件账本；变化不启动检查，dispatch 后缺回执保持 Unknown。

每次检查只执行捕获的只读源码快照，保留 `sources.json`、快照文件、原 Native 资源归属、stdout / stderr 和实际结果。新回执的 `source_basis_digest` 绑定完整 `{sources, original_file_calls}`，贯穿原 IPC 回复及 SDK 工具输出；后续合法写入的回执也不能替换第一次检查的来源。后续源码变化不改变历史检查的适用范围；历史 passed 不能自动满足当前源码或领域完成。

## 3. 私有格式兼容与原操作接续

| 私有格式 | 语义 |
|---|---|
| catalog / request / sources / receipt / SDK output 1 | 旧固定源码配方和严格字段保持，不能加入新策略或来源证明字段 |
| catalog 2 | 固定完整目录，明确包含新策略配方 |
| request / sources 2 | 固定原配方，保存捕获时 Native 写入回执摘要与实际源码快照 |
| receipt / SDK output 2 | 保留源码内容摘要，另绑定完整来源证明摘要 |
| call、文件 Native 工具账本、IPC 请求 / 响应 1 | 原调用身份、独立 Native 效果和原字节重放保持 |

领域 242 个 Schema、用户数据库格式 10、锁文件保持；本批没有用户库迁移。旧检查准入和旧目录按原义读取，不追溯改写 Binding 或资格。

独立历史 reader 重新核验捕获时引用的原 Native 写入回执、唯一摘要链、完整来源证明摘要、快照字节及 Native 检查结果；不要求以后发生的写入倒写过去的快照。同一 check call 重放返回原回执，不重新捕获或执行。后续检查使用新的原 SDK 调用身份。旧失败、not_started、Unknown 和资源恢复不被补写为成功。

## 4. 验证与证据

本批原始验证及实际夹具摘要在 [D-243 研究记录](../research/CimiLoop-原Run修改后固定检查-2026-10-09.json)。每个失败阶段保留，不用后续绿测覆盖历史原因。Windows / AppContainer 用例跳过不算通过。

构造 Task 的修改权限必须与 TaskDefinition、WorkItem 一致，首次完整 SDK 场景因未对齐而被 Kernel 拒绝；修正的是新测试定义，未放宽 Kernel 或更改旧记录。独立工程评审提出路径大小写别名及捕获来源未进入回执摘要的问题，已修复并补反例；该评审不是 Matt 完整方法或 Superpowers 验收。

最终4文件30项及3文件25项契约通过；实际Windows原生3文件12项中11通过1失败、0跳过。完整SDK场景因native_control_unavailable中断检查；隔离复验在Native granted阶段出现ArgumentNullException、零模型回复。两次失败原因分别保留，SDK修改后检查到工作台观测的完整链路仍未通过。596个冻结源码 / 测试 / Native / Schema前后零变化，pnpm check和CLI帮助通过。

最终范围与实际结果见研究记录，不计为全仓库回归、真实模型 / Skill 或完整 S1 验收。正式正向领域结果继续实施。

## 5. 剩余条件

本功能证明原 Native 修改与固定检查的可执行关系。真实模型 / 账户 / 费用、Skill 调用、Plan / Task 前完整 Human / Matt 澄清、Matt 独立评审、Superpowers 当前源码真实行为、正式正向领域结果、物理配额 / 历史容量及完整异常恢复仍是完整 S1 的必要条件。Run 观测保留未知费用与预算，不自动完成 Task 或 Change；五组目标继续。