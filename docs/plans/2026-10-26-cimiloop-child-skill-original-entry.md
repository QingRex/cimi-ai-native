# 原 Skill 子调用证据与默认控制入口

接续 `a256f27`。本批补齐已执行 Skill 的读取与控制路径，沿用当前 Kernel、原 Run／子调用身份和不可变内容库。没有启动真实模型、修改 Native 执行策略或授予 Provider 资格。

## 现在可以完成的操作

已安装的当前 Codex Host 中存在同一原 Skill 的准入和派发登记时，默认 CLI／工作台可以打开该原账本，查询、采集、传递已有 Kernel 取消及回收原资源。原账本、准入锚、派发锚、项目或当前 Human 不匹配时拒绝／保持 Unknown，不新建原登记、不修复缺失的一半、不读取登录令牌。旧专用 HTTP Host 记录不自动迁移到 Codex Host。

```powershell
pnpm cimiloop --project-dir <当前项目> --json skill query-original <原Skill调用ID>
pnpm cimiloop --project-dir <当前项目> --json skill collect-original <原Skill调用ID>
# 先通过原 Kernel CancelRun 命令确认父运行取消，再执行：
pnpm cimiloop --project-dir <当前项目> --json skill cancel-original <原Skill调用ID>
pnpm cimiloop --project-dir <当前项目> --json skill recover-original <原Skill调用ID>

# 保存一至四个已有调用的完整命名方法证据，不执行 Skill：
pnpm cimiloop --project-dir <当前项目> --json skill capture-original <原Skill调用ID> [其他原Skill调用ID]
```

工作台原 Skill 卡片的“保存原技能证据”调用相同共享应用服务。HTTP 入口为 `POST /api/skill-invocations/<id>/capture-original`，请求体只能是空对象，并要求当前会话、CSRF 和同源校验；它不接受路径、Provider 资格或结果覆盖。CLI 可将至多四个同 Descriptor／Runtime／方法／目的的不同原调用合为一份证据；工作台每次保存当前原调用。两者都不代替批准。

返回 `evidence`、命名证据 `reference` 和可用于既有 `RecordProviderEvidence.payload.raw_result_ref` 的 `raw_result_ref`。可以直接使用该本地内容引用进入上一批统一 Provider 命令，不必导出后重新导入原字节。内容已经保存；响应丢失后重复采集同一组原调用得到同一引用，不产生 Kernel 事件。`observed_at` 保守使用这组原调用最晚的不可变创建时间，不因重读而制造新的资格时效。目录缺失不能证明原操作从未执行或资源已清理。

## 读取与兼容边界

子调用原件实际位于当前可信数据根下的 `skill-runtime-originals/<project-id>/<invocation-key>`。新内部样本 `cimiloop/native-named-method-sample/2.0.0` 固定 `layout: skill_invocation`；目录只能由固定根和已校验的 scope 推导。Native、SDK、IPC、Codex 原模型读取使用同一目录，并重新核对固定方法包、输入、输出、原 Runtime、模型和账户。

旧内部样本1保持原固定根解释。不会因旧根缺失、不能读取或样本失败而尝试子目录；新样本不能加入任意 root，不能改成其他 layout。公共 NamedSkillMethodEvidence 和其他 Schema 不变，项目库10／Host1不变，没有升级用户库。

采集前先从当前 Kernel／SQLite 读取原父子关系和 Human 身份，并固定原 Host 准入／派发票与物理锚。来源打开等待后重新核对原对象和会话，读完后再次核对原锚及当前安装，所有借用来源均释放。只保存不可变证据，不写业务事件、不结算费用，也不判断任务验收。

## 本批验证

针对性反例先证明旧代码缺失子调用采集入口和共享 Human 采集服务：子目录新用例2失败、旧样本不迁移反例1通过，其余36项过滤；Human采集新文件3项失败。类型检查、编译 CLI 帮助及工作台脚本语法检查通过，公共Schema实数仍为242。

首次受影响五完整文件67通过、1失败、0跳过；唯一失败是新增HTTP测试误用了嵌套错误对象，实际服务端的既有契约为顶层code。仅修正该断言，生产源码未再变化，HTTP完整文件7项复验通过。按每个文件最新完整结果合计五文件68项通过、0失败、0跳过：命名方法读取39、Human采集／默认Host来源5、原Skill控制14、HTTP7、页面3。不是一次五文件全绿，首次报告继续保留。测试类型问题已修正，不作为产品反例。

报告位于忽略目录 `.cimiloop/codex-2026-10-26-child-method-development.json` 和 `.cimiloop/codex-2026-10-26-child-method-http-fixed.json`。CLI帮助证明新命令已编译暴露，尚未声称命令在真实Skill／生产安装上整链成功；页面测试覆盖原控制的既有交互，不把它扩大为新保存按钮的真实Native验收。

测试中的 Native／Codex原件投影、方法输出或安装来源含明确 PUBLIC 夹具；实际 Kernel／SQLite／Git／Host原登记与 HTTP／页面验证的范围需与它们区分。本批没有新增真实模型请求、Windows/AppContainer整轮、全仓回归或完整S1验收。

## 继续接完整主链

这条入口消费已经存在的原 Skill，尚不提供第一批独立隔离资格调用的创建／执行入口。完整权限、费用／账单、恢复、行为和全部方法 harness 的默认读取器仍须接通，当前 Codex 原件读取器不会把缺项变成 ALLOW。

随后继续：隔离资格采集与默认 Skill 调用；默认 Runtime 的完整控制来源与准入租约；真实 Human/Matt 开工前澄清；同一普通 Change 的修改、检查、费用与交付；最终源码集中 Native／真实模型／Skill／S1及 Matt／Superpowers评审。账单来源、专用固定卷和同卷外部官方登录目录、原业务澄清的真实 Human 回答仍待提供；不妨碍继续完成独立实现。五组目标与持续目标保持未完成，不push。
