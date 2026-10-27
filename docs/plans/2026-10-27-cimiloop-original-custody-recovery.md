# 执行材料丢失后的原 Skill 保管与资源控制

完整 S1 五组范围继续。本批修复实际恢复入口的执行依赖：此前默认 `productionSkillRuntimeOriginals` 打开完整 Codex 安装，任一程序或检查目录材料丢失，就无法借用仍完整存在的原 Host1／子调用保管记录。此时 Human 连原资源控制器也到不了，不能通过重新安装／新 Run 修复这个问题。

## 实现与边界

- 新 `openOriginalCodexRuntimeCustody` 只打开原受保护 Host1，核对当前 Human／项目／实例／仓库及数据目录物理身份、原安装与请求的对应关系、原 originals 目录身份和固定安装摘要。未安装返回缺失，既有原件损坏／丢失失败；不初始化、重建或迁移原账本。
- 返回租约只带原 origin、root、安装摘要及 guard／release，不带可执行程序、检查目录、模型账户或受信可写路径／程序 capability。将其交给现有完整安装的可写路径／程序能力接口会拒绝。租约释放后 guard 失败。
- 默认子 Skill 原件来源改借该租约，继续核对原父 Run、子调用、原 dispatch 及保护票据。已知原执行文件缺失时，可以到达原查询、Kernel 取消后的原取消投递／恢复入口；不证明原资源已处置。缺原子登记／跨机器身份不可证仍保持 Unknown，不从本机找不到证明旧资源清理。
- 完整安装读取器继续校验全部程序／检查原字节及物理身份，在末尾重核原保管记录。新启动及费用容量安装路径仍使用完整读取器。独立结果读取器仍复查其原执行材料，本租约不批准方法、结果、模型或费用。
- Schema242、项目库10、Host1、锁文件均保持；查询／恢复不新建 Run，不结清费用或释放预算；仅原 CancelRun 增加一次 Kernel 业务取消，同 Command ID 沿用原回执。

## 验证

修复前3项新保管接口反例全部失败（该文件20项未选择）。实际 Windows Host1／Kernel 子调用集成反例1项失败：保留受保护原登记、移开本夹具自己的5份执行材料后，默认子查询仅返回 Unknown，未到达明确 PUBLIC 原资源端口。使用测试专属材料，无用户程序／凭据／原进程被移动或执行。

首次类型检查发现新测试未收窄可选租约与领域错误联合，修正测试后 `pnpm check` 通过，未放宽产品契约。Node24.22.1／pnpm12.4.2 的最终同轮回归5个完整文件41项通过、0失败0跳过，exit0、success=true：

| 完整测试文件 | 通过项数 |
|---|---:|
| `packages/local-app/test/agent-codex-installation.test.ts` | 23 |
| `packages/local-app/test/skill-runtime-custody-recovery.test.ts` | 1 |
| `packages/local-app/test/agent-codex-budget-allocation.test.ts` | 4 |
| `packages/local-app/test/named-skill-capture-local.test.ts` | 6 |
| `apps/workbench/test/agent-run-family-control.test.ts` | 7 |

命令为 `pnpm exec vitest run <上述5个文件> --maxWorkers=1 --reporter=default --reporter=json --outputFile=.cimiloop/codex-2026-10-27-original-custody-recovery-final.json`。完整跨项目预算场景实际耗时681秒，其中三个复杂场景分别约218／196／205秒，沿用原240秒测试限时，未修改限时；不是模型或 Native 任务耗时。整轮耗时1180秒。编译后 CLI `run recover-original --help`、`skill query-original --help` 及 `git diff --check` 通过。JSON 留在本机忽略目录，不与上一批55项累计。

测试的 Host1／Kernel／SQLite／安装及调用保管是真实本机行为，二进制和登录内容为明确 PUBLIC，资源控制端口为 PUBLIC。未发真实模型请求，未做 AppContainer 原生处置，不能作为完整异常矩阵、真实技能或 S1 通过证据。

## 本批官方资料核对

实际读取 [官方 Codex App Server 文档](https://learn.chatgpt.com/docs/app-server)的 `account/rateLimits/read` 和 `account/usage/read` 说明，以及[官方计费说明](https://learn.chatgpt.com/docs/pricing)的订阅限额／额外积分区分。这些页面未建立 CimiLoop 原请求到金额／积分结清的逐项原件契约；这是本次已读资料的边界，不断言所有平台均不存在财务接口。token、额度窗口或积分价格不能直接当作原账单。本批不安装财务来源，不把订阅内请求自动记零。

完整客户端构建空间、全部生产控制／方法来源、真实账户费用、完整异常矩阵、真实 Human／Matt／Skill、普通 Change 到 ReadyForDelivery、指南实走及最终独立评审继续。既有六个未知文件和历史 Unknown 保留；本地提交、不push。
