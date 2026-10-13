# D-291 原结果字节、Runtime 与原启动封口

本批接通共享 LocalCollection 的原已知 Skill 结果读取：先固定完整原证据字节及 Runtime 身份，再采集原 Host admission/dispatch 票据与锚点，完整复读 Native、SDK、模型、资格及最终账单，最后执行无安装回调的原件终检。它不创建观察、账单或预约，不重启 Run，不把 Unknown 或 Human reconciliation 晋升为直接已知结果。

在有效正例之外新增的两项顺序红测均复现漏洞：最后 Host 回调撤销账单授权仍被接受；资格回调自洽改写 claim/input/key 后，改写后的 Runtime 被重新选为原身份。修复后完整结果文件 12 项通过。r68 的新负例不足、r69 缺少 PUBLIC package 字节导致正例失败，均保留且不当作漏洞证据。

原 Runtime 身份、Node/controller/可选 Job observer 的独立保管登记与物理身份由固定读取器核验。原 admission/dispatch、选定 Host 不可变票据、物理根/文件/目录、所有结果引用和 8 个 namespace 的文件字节均封口。私有 WeakMap 品牌阻止复制、伪造、byte-only 结果或仅声明 verified 获得 Runtime 证明。允许合法新 Host 票据和原派发的迟到 ACK，不使用整库 hash。

隔离完整 6 文件 70 项通过，782 源码无漂移；main 精确集成 10 路径，完整 6 文件 72 项通过，779 源码无漂移，pnpm check 通过。main 的模型终检修补保持；D-288 的 Calls/current-input 组合仍在隔离，未以本批假称已接正式 Host。验证是 PUBLIC 构造契约，不是真实模型、Skill、资格/账单批准或 S1 验收。

此前 main 实际 Windows/AppContainer 生产生命周期及父子家族 2 文件 4 项、原配置 16 项、模型终检 3 文件 64 项分组通过；原完整 103 文件 943 通过、5 失败报告保留，不改判完整范围通过。本批未改 Native C#、用户 Task/模型预算或旧进程。main 首次沙箱回归在受保护 Temp 创建 Vitest 缓存时 EPERM，0 测试执行，原失败保留且未放宽 ACL。后续 main 原 7 文件 93 项通过仍保留为修补前结果；普通评审再发现 Host 回调内同字节 dispatch 替换窗口，新增 2 项在 original-read/ticket-capture 阶段分别复现（8 通过、2 失败），随后将 constructor-bound root/admission/dispatch 物理身份与字节提前到任何 Host 回调之前，并用纯终检复验。

正式 Host 当前结果消费、明确领域结果 3 和生产父子 Runtime 组合继续；完整五组 S1 未完成，默认正式 Agent 仍关闭。Schema 242、用户库 10、Host 账本 1 保持；智谱具体模型、套餐、现金币种/上限和积分上限未确认，未付费、未 push。每个完整批次验证和文档后本地提交。

证据：[研究记录](../research/CimiLoop-original-result-seal-2026-10-13.json)、[正式结果消费后续](2026-10-13-cimiloop-current-result-consumption.md)、[模型终检](2026-10-13-cimiloop-model-final-source-cut.md)。
