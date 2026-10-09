# CimiLoop Native 原回执独立核验 v0.1

2026-10-09，D-233，V1-09 续批。承接 [SDK 调用与 IPC 原字节账本](CimiLoop-SDK调用与IPC原字节账本-v0.1.md)。本批将独立 Native 核验接入原操作采集和共享应用服务；它核对历史实际工具回执，不批准模型 / 账户、结清费用、提交 RunObservation 或启用正式 Agent。

## 可执行路径

`LocalAgentRuntimeOperations.collect` 从 Store 取得原 Project / AgentRunRecord，按原 Scope 采集既有操作，随后独立读取文件 SQLite 账本及固定检查原记录。没有新的 Run、操作键或工具 dispatch；原生格式 10、242 Schema、文件账本格式 1 保持，不升级用户库。

文件读取器以只读事务校验原数据库结构、策略、Project / Repository / Run / operation_key / executor / Context，再返回原输入、状态和完整 Native 回执。准备、已 dispatch 未结、Unknown 和未启动均保留原状态，读取不恢复资源或获得执行许可。

固定检查读取器核对完整 Scope、原 recipe / catalog / policy / Node 摘要，以及 request、dispatch、Native 归属 / 执行策略、捕获字节、原快照和回执。完成回执必须有准确的 `{input_digest, nonce}` dispatch，不能同时存在 not-started；独立核对原 nonce、PID / 程序路径、profile、Job 归属、禁止网络的执行策略，重读原 launcher / Node 二进制字节与原摘要。原二进制缺失或变化保持未确认，不用本机缺少缓存证明旧效果不存在。

核验器将原 IPC 请求转换回固定文件 / 检查输入，与独立原账本中的完整输入和回执逐项对应。检查还必须对应唯一原启动登记中的固定 catalog，不能用新 recipe 解释旧结果。同一原调用的准确重放只重复核对，不再次产生效果；响应丢失留下的 Native 完成、无 Native 依据的 IPC 成功、未结原调用、损坏记录及空资料均不能得到 Verified。Native 资料前后读取不一致时保留 Unknown。

## 结果含义

原采集结果新增 `native` 部分。`native.status: Verified` / `native_effect_reverified: true` 仅表示本次读取的历史工具回执与原 IPC 完整对应，不能证明当前源码仍相同、固定检查通过、原模型已批准、费用已结清或 Task 成功。实际失败的检查也可以有完整有效的 Native 回执。

D-232 的 `ipc.correlation` 继续只核对 SDK / IPC 原字节，其中 `native_effect_reverified: false` 保留原含义；新 `native` 部分独立给出 Native 核验结果，不能用前者冒充后者。运行中的采集仍可能只有部分资料。缺少可信原 Project / AgentRunRecord 的直接 Adapter 采集将 Native 核验保留 Unknown。

`model_account_custody_proven`、`formal_agent_execution_enabled` 和 `domain_observation_produced` 不因本批变化而变为 true；没有凭据读取、外部模型请求或费用结清。完整生产 Runtime / 领域结果桥接、实际型号 / 套餐 / 批准预算与账单、物理配额 / 历史容量 / 全恢复，以及真实技能、前置澄清、独立方法评测、工作台正式执行和真实 Change 到 ReadyForDelivery 均继续属于完整 S1 目标。

## 验证

本机仓库已从干净 main 安全快进到交接提交 `e789902`；origin/main 与交接提交一致，未 reset / clean / 强推或 push。使用 Node 24.19.0、固定 pnpm 12.4.2，按锁安装；固定 OpenCode 1.18.34 的 SHA-256 为 `5283c2cd5b4285855daa97e6f7d17bf48146227cdf2a940e79e0f2b7869fd06e`，与历史固定摘要一致。

合同覆盖原回执只读、准确重放、替换回执、已 dispatch Unknown、丢响应和原账本缺失；固定检查另覆盖 dispatch 缺失 / 替换、冲突 not-started、nonce / PID / 策略替换、launcher 摘要替换及原二进制损坏 / 缺失。模型 / 受控资格与合同 Native 数据明确构造，不能作为真实模型 / 技能 / S1 证据。实际 Windows / OpenCode 文件、检查、取消与恢复验证范围及首轮失败记录见[本机研究记录](../research/CimiLoop-Native原回执独立核验-2026-10-09.json)；最终结果以记录中的实际命令、退出码和源码摘要为准。

失败原生夹具保留自己的原目录用于诊断，成功夹具仍只在原处置证明成立后清理。新电脑不能通过查不到旧进程 / 映射，证明旧电脑历史 Unknown 已清理。

固定源码受影响回归为 16 文件 / 108 项，104 通过、4 失败、0 跳过。失败涉及原生 broker 准备、强制退出准备、控制器启动和 Bun 启动崩溃；一个 Bun 原 stderr 的栈包含 CcLHShield64.dll，另两个控制器原记录为 0xC0000005。根因未确认，不能解释为核验通过或资源已处置。对同一保留 broker 的 30 次只读 inspect 均成功，不能替代正式 Runtime 稳定性。失败文件针对复验结果另列于研究记录，不覆盖本轮失败。

同一固定源码的失败文件复验为 4 文件 / 20 项，18 通过、2 失败、0 跳过，均仍在 Native 身份辅助程序或控制器准备阶段。不能据此报告 Windows 回归全部通过；本机原生启动稳定性列为后续必要条件。类型检查、编译后 CLI 帮助和独立代码复核通过，298 个被测源码 / 夹具文件摘要前后未变化。
