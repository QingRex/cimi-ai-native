# 技术执行入口遵守当前 provider 选择

本轮核对发现，默认业务启动与 Matt 已检查本地 provider 选择，但固定 Runtime 契约执行和隔离 Skill 方法执行仍可打开旧 Codex 账户。用户改选本地连接后，这两条新效果路径也须遵守同一选择。

两个具体生产执行工厂现于账户打开前、账户 await 后、固定卷 await 后／登录前及存续 guard 前后调用现有选择门禁。执行／准备过程仍在外部回调前后核对同一 guard；等待期间改选将关闭原借用账户，不启动模型、Native 或另建替代运行。

历史技术请求的查询、采集、取消及原资源恢复服务保持原身份读取。没有在历史账户打开或原安装读取器上加入新执行门禁，避免当前连接改变使旧原件无法核对。没有模型调用、凭据读取、数据库升级或历史资源清理。

## 验证

`technical-provider-selection.test.ts` 的两个入口各覆盖：打开前已选本地连接、账户 await 中改选、卷 await 中改选、借用后改选。修复前完整文件0通过／8失败／0跳过，保存为 `.cimiloop/codex-2026-10-28-technical-provider-selection-red.json`。

修复后与 `runtime-contract-local.test.ts`、`skill-method-probe-local.test.ts` 三完整文件26通过／0失败／0跳过，原结果为 `.cimiloop/codex-2026-10-28-technical-provider-selection-final.json`。新文件使用真实选择标记与生产工厂，但账户／固定卷为明确 PUBLIC seam；原两文件使用真实 Kernel／原请求账本与 PUBLIC 执行端口。不是实际模型、Native处置、真实方法或 S1 验收。独立增量代码复核未发现确定阻断。

本批仅关闭旧登录回退缺口，不把尚未安装的本地 provider 完整宿主声明为可执行。完整五组 S1 与真实业务交付继续，默认不 push。

## 工作台当前连接

工作台 Runtime 页与原 Run 页现消费已有 `selected_runtime`／本地安装／存储元数据，显示当前本地模型与安装状态；已选本地连接时不会把历史 Codex 安装描述为当前模型。安装与固定卷绑定仍明确保留完整生产核验条件，不因页面显示而放行执行。原请求按钮继续可用。

三种本地安装状态的 DOM 反例修前0通过／3失败／3过滤；修后 `runtime-contract-frontend.test.ts` 完整6通过／0失败／0跳过，分别保存 `provider-selection-ui-red.json` 与 `provider-selection-ui-final.json`。仅 DOM／PUBLIC HTTP响应，未据此声明真实后端执行。最终类型检查、页面脚本语法及编译 CLI 帮助通过。

与原账户主链合并冻结后，最终同一整轮9完整文件103项通过、0失败0跳过，原结果 `.cimiloop/codex-2026-10-28-local-provider-batch-final.json`，退出0；上述三技术文件26项及DOM6项包含在这一轮中，不能累加。全部实际失败、修复与非验收边界见[原账户记录](2026-10-28-cimiloop-local-account-original-reader.md)。
