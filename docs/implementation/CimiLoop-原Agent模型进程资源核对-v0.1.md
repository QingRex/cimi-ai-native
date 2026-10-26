# 原 Agent 模型进程资源核对 v0.1

同一个 Agent Run 的 Native 沙箱与 Codex 模型进程属于不同 Job。沙箱已停止不证明模型进程已停止；资源已停止也不证明模型结果、真实费用或任务验收已完成。

## CLI 与工作台

CLI 现在复用工作台已有的 `LocalAgentRuntimeControl`，无需安装新的执行工厂或重新取得模型登录：

```powershell
pnpm cimiloop run query-original <run-id> --json
pnpm cimiloop run collect-original <run-id> --json
```

对另一个项目加 `--project-dir <当前电脑实际项目目录>`。查询只操作当前 Human 可访问的原 Run；采集保存原始字节引用，不产生领域观察、不调用模型、不创建另一个 Run。

停止前先由 Kernel 记录原 Run 取消。准备包含实际理由的 `cancel.json`，例如 `{"reason":"用户要求停止本次原运行"}`。先保存取消命令 UUIDv7；响应丢失时仍用同一命令 ID、目标及 payload 核对，不改成新的取消业务操作：

```powershell
pnpm cimiloop run cancel <run-id> --file <cancel.json> --command-id <原取消命令UUIDv7> --json
pnpm cimiloop run cancel-original <run-id> --json
pnpm cimiloop run recover-original <run-id> --json
pnpm cimiloop run query-original <run-id> --json
```

`cancel-original` 重试同一原取消标记，不新增 Kernel 取消事件。`recover-original` 仍须当前 Human 的 Kernel 控制权限和原取消记录，沿原身份处理资源；不重开模型或 Run。Unknown 返回退出码1；正常查询 Running 可以返回0，不能把退出码0当作任务完成或费用结清。

工作台继续用“查询原运行”“恢复原资源”等现有入口。若沙箱已停止但模型进程仍不可核对，会明确显示“沙箱资源已停止，模型进程仍待核对；继续保留原运行与预算”。

## 如何读取结果

当前 Codex Run 的结果含 `resource_scope: "native_and_current_codex_run"`、`native_resources_disposed`、`model_resources`，以及两者合取的 `resources_disposed`。两者没有都通过，整体不报资源已处置；Native 已 Stopped 而模型未核对时，整体 status 为 Unknown。采集结果中同一信息位于 `status` 对象。

`model_resources.calls` 对每个原模型调用分别报告 active／unknown／disposed。`completion_proven:false`、`costs_reconciled:false` 和 `family_resources_disposed:false` 保持明确：这里覆盖当前 Run 的模型 Job，未自动扩大到原子技能、整个任务、账单或全部 S1 恢复。

没有可核对 Codex 绑定的旧类型只报告 `resource_scope: "native_only"`。旧 Unknown 缺少新证明时继续 Unknown；找不到进程、原根或一份本地 JSON 不能证明已清理。

## 原证明和兼容

新进程使用内部 `codex-process-launch/2.0.0`，固定取消路径、nonce 与配置摘要。原 Host1 先固定准备材料，再固定实际启动身份；首次 RPC 前必须完成启动登记。取消时原监督进程终止整个 Job，确认活动进程为0、关闭 Job并保存结束原件。宿主退出同样由原监督进程处理，不能只停止主进程而留下后代。

资源读取独立于模型成功封口。新启动原件、Host1 票据、结束链和原始 PID／创建时间／程序身份共同核对；只读 OS 观察器使用原固定程序。缺少结束原件时，即使当前两个进程都不在，也不报告已清理。完成回执已丢失但 Job 证明完整时，可以报告资源已处置，同时模型原请求仍 pending，不能再次派发。

旧 launch1、方法 start10、模型 header1—19及原 Host1 完成票据继续按各自原语义读取，不回填新启动票据，不更改用户库。Schema242、项目库10、Host1保持。详细验证和保留的失败见[实施记录](../plans/2026-10-27-cimiloop-model-process-recovery.md)。
