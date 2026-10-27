# 原安装程序接入及官方 Codex 无账户启动

接续 `95dacd8`。本批将现有安装中已经固定的 `codex.exe` 和 `codex-code-mode-host.exe` 接入原模型 Job，验证真实 CLI 程序的离线兼容性。完整 S1 五组保持，正式 Agent 完整门禁未启用。

## 默认执行路径

`openInstalledCodexAgentRuntime` 的真实冻结租约通过私有 WeakMap 借出程序能力。运行时只从主程序的同目录选择安装原件中已固定的 code-mode-host；不接受模型或 JSON 提供的额外程序清单。租约原守卫每次复核原 Host1、安装票据、字节和物理身份；复制租约、复制能力或释放原租约都不能继续派发。

普通 Agent、Skill 子调用、具名方法探测和 Runtime 技术契约四处默认组合均传入该能力。新原方法 start14、模型 header29–31、Native launch6／start5／end5 固定两份原程序的摘要及物理身份。新模型头继续使用原工作区／父 Skill backend8、具名方法 backend13，不更换业务工具协议。旧 start／模型头／launch 按原版本读取，旧 pending 不升级或重派。Schema242、项目库10和 Host1 不变。

Native 在创建 AppContainer 及授权之前验证程序清单并打开只允许读取共享的原文件句柄，直到原 Job 收齐才释放，防止执行期间修改内容或替换文件。主程序和随附程序只能获得精确文件上的读取执行授权，不能落入模型可写根；不为整个安装目录增加读写权限。挂起的真实模型通过原 SID／Job／程序核对后再次复查程序原件；原 Job 活动进程为0、出口停止、授权移除及 Profile 删除后再复查并写 end5。原查询／完成读取同样核对两份程序及新原件。

## 真实官方程序的阻碍

当前 PowerShell CLI shim 指向用户本机 npm 安装包，其版本字段为 `0.162.0`。本轮从该包读取两份程序字节，复制到新测试目录，只使用本轮空的 HOME／USERPROFILE／AppData／TEMP／CODEX_HOME。未读取、复制或使用现有登录文件，未把旧下载目录当作当前批准程序。

第一次真实离线启动：`--version` 通过，`app-server --stdio` 在处理初始化前以1退出，错误为 `failed to canonicalize CODEX_HOME`／Win32 error5。新程序能力接入后再次复现同一失败；不是缺少 code-mode-host 授权造成的已证明问题。

独立 Native 用例在有、无代理两种模式下分解了系统调用：对同一已授权目录，CreateFile 的0／READ_ATTRIBUTES／GENERIC_READ三种访问均成功；GetFinalPathNameByHandle 的 NT 名称成功，DOS／GUID 名称转换失败为5。仅目录 ACL 成功不能证明 Rust 标准库的 canonicalize 能用。诊断用例允许记录已支持或确切 error5；它不是正向 Runtime 验收，真实启动的正向用例仍失败。

[官方仓库 issue45871](https://github.com/openai/codex/issues/45871)报告同类 AppContainer 路径转换问题；本轮另核对了[官方0.164.0源码](https://raw.githubusercontent.com/openai/codex/rust-v0.164.0/codex-rs/utils/home-dir/src/lib.rs)，该版本仍在 CODEX_HOME 分支要求 canonicalize。源码核对不等于本机实跑0.164.0，也不证明所有版本均不可用。[Microsoft API 文档](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfinalpathnamebyhandlew)区分返回 NT／DOS／GUID 路径的参数；本机实际失败以 Native 原件为准。

没有通过扩大目录写权限、修改全局对象 ACL、撤掉 AppContainer、清空现有 CODEX_HOME 或修改官方程序字节来隐藏失败。后续需提供可在原边界启动的程序或有明确原件与兼容验证的运行方式；不能据当前结果宣称真实模型链路可用。

## 验证及复验入口

程序能力反例先在旧实现失败：序列化清单被旧准备器忽略而错误放行；修复后在产生启动原件前拒绝。实际 C# 主程序在同一原 Job 启动随附程序、读取原文件、写打开被拒绝，原 Job／授权／Profile 回收，原件同字节替换后拒绝重读，均属于 PUBLIC 程序的真实 Native 验证，不是真实 Skill 或模型。

真实官方启动验证需显式提供本机已选择程序的绝对路径（不提供登录路径或 Key）：

```powershell
$env:CIMILOOP_OFFICIAL_CODEX_BINARY='<本机当前安装包中的 codex.exe 绝对路径>'
pnpm exec vitest run packages/runtime-adapter/test/codex-official-startup.test.ts packages/runtime-adapter/test/codex-appcontainer-path-diagnostic.test.ts
```

该命令在本机当前版本会保留真实初始化失败；`--version` 通过不能抵消初始化失败。未设置程序路径时，官方启动两项被跳过，不能算通过。测试将程序摘要、物理身份、退出码和版本输出保存到本轮短目录中的 `PUBLIC-program-startup.json`；不保存凭据或真实账户内容。全部失败目录和原件保留。

功能完整文件按最新结果共7文件59项分轮通过、0失败0跳过：

| 完整文件 | 项数 | 实际范围 |
| --- | ---: | --- |
| codex-program-bundle.test.ts | 3 | 原能力／复制清单拒绝、写根交集拒绝、真实 Native 随附进程／原文件及回收 |
| codex-fixed-volume-confinement.test.ts | 3 | 新旧策略、start14、三类新模型头、防降级和原操作重放；模型／卷 OS 观测是 PUBLIC |
| agent-codex-installation.test.ts | 20 | 真实 Host1 安装原件、真实冻结租约／释放和复制拒绝；账户／程序是 PUBLIC |
| agent-parent-skill-composition.test.ts | 9 | 共享组合和能力转交；PUBLIC staging 投影禁止模型派发 |
| skill-invocation-codex-composition.test.ts | 3 | Skill 子组合和能力转交；PUBLIC staging 投影禁止模型派发 |
| codex-process-job.test.ts | 18 | 原 Job、取消／宿主退出、原请求、旧版本及原身份读取 |
| codex-contained-proxy.test.ts | 3 | 实际代理、异域／错误 SNI 拒绝、等待 TLS 时原取消 |

五文件集中轮38项通过（`.cimiloop/codex-2026-10-27-program-bundle-integration.json`）；写根交集拒绝补入后，底层三个完整文件24项通过（`program-bundle-final`），其中程序能力三项与集中轮重叠，不重复累计。这里是分轮覆盖，不称最终七文件同轮验收。最初单文件2项 Native 通过记录不替代最后完整文件3项。首次类型检查出现未知配置的缩窄及 PUBLIC 投影标签不一致，修正后最终 `pnpm check` 通过，Node24.22.1／pnpm12.4.2。

另有官方无账户启动及系统路径诊断两个完整文件，最终3通过1失败、0跳过（`official-bundle-final`）：版本查询和两种路径诊断通过，真实服务初始化失败。初始化失败后的 end5 核对原 Job 活动进程为0、授权移除、Profile 删除及网络打开／连接／字节均为0。这不把业务启动失败变成成功；路径诊断两项也不作为 Runtime 兼容性验收通过。最初 `official-startup-initial` 和 `canonical-red` 的失败记录保留，没有用期望失败掩盖正向启动缺口。

已刷新 origin/main，无远程新增，默认不推送。旧六个未跟踪文件保持，仅处理本批明确文件。没有全仓测试、完整 Native 族回归、真实模型／账户／账单、真实 Skill／Human 回答、ReadyForDelivery 或最终 S1 验收。

## 接续工作

除了上述真实程序兼容性，四项生产控制来源仍须接入 LocalProviderVerifier：完整网络与宿主限制、费用及结清、全部写路径物理配额与历史容量、完整异常恢复。固定卷准备证明、同卷官方登录目录、真实账单及 Human 问题的回答仍待接入。继续推进不依赖这些外部条件的生产来源和共享应用链路，不停留在本批程序诊断；最终真实 Change／指南实走及 Matt／Superpowers 评审仍必需。
