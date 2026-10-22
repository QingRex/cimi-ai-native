# 正式原账户默认入口接续

日期：2026-10-22。开发起点 `3231978`，远程只读核对为 `e789902`。用户要求 Codex 接回开发、加速完整 S1；本批没有 push，没有处理两个未知临时文件或旧 Unknown 资源。

默认编译 CLI 的 `run costs`、`record-costs`、`reconcile-original` 以及默认工作台，现在通过共享应用服务打开已安装的原 Windows 账户。历史查询不依赖新的模型许可、Runtime 二进制、固定检查或凭据存在。打开前核对 Human／原 Run，异步打开原 Host 和账户后重新核对本地身份、固定运行资料、布局和连接。模型准入恒拒绝，不因读账户产生新占用。释放可重放，失败时关闭已借用句柄。

缺原件不建库、不迁移；没有账单核验器时不能打开需要该核验器的账单账户，返回 Unknown。零占用查询仍 `costs_reconciled=false`。费用观测及终态核对继续经原 Command／Kernel，不授予新执行权限。Schema 242、项目库10、Host1保持。

验证使用 Node 24.19.0／pnpm12.4.2，按锁文件安装后先执行 check。新增反例在实现前为共享入口5失败、默认 CLI／HTTP 2失败；后一过滤运行有12项未执行，不计通过。首轮整文件验证有5个文件35项通过；新增 Windows 文件因测试从错误模块取导出导致5项失败，已修正测试导入，并增加实际默认 CLI／HTTP 正向案例。最终只补验受影响文件与首次命令中误写路径而遗漏的共享费用观测文件，两文件37项通过、0失败0跳过。合计分阶段七文件72项，不是一次整轮72项。

通过的文件：

- `apps/cli/test/agent-account-costs.test.ts`：7项。
- `apps/cli/test/agent-run-cost-observation.test.ts`：以本地 JSON 原报告为准。
- `apps/workbench/test/agent-account-billing.test.ts`。
- `apps/workbench/test/agent-run-cost-observation.test.ts`。
- `packages/local-app/test/agent-account-billing-entry.test.ts`。
- `packages/local-app/test/production-account-entry.test.ts`：7项；实际 Windows Host／账户保护、缺原件、取消后读取、禁止占用、默认编译 CLI 与认证 HTTP。
- `packages/local-app/test/agent-run-cost-observation.test.ts`：30项，含真实本机 TLS、受控账单和原命令恢复。

两次 check 均通过。独立工程复查发现测试导入问题，修复后复验；未发现本批实现的 must-fix。复查没有另跑测试，不是完整 Matt／Superpowers 验收。

原始报告保留于本机忽略目录 `.cimiloop/codex-2026-10-22/`：`production-account-red.json`、`product-account-red.json`、`production-account-green.json`（含上述测试导入失败）、`production-account-recheck.json`。Windows 测试只创建并保留自有新夹具，不清理历史资源。默认正向账户为公共构造 policy，没有任何凭据文件，没有模型调用或真实账单。

真实提供方账单核验器、真实方法宿主、完整 Native／中断恢复、物理配额与历史容量、普通 Change 到 ReadyForDelivery 以及最终五组 S1 验收仍未完成。本批只完成原账户默认读取／观测装配，不能宣告 S1 通过。
