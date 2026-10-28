# 受控 Codex 客户端实际构建与离线启动

接续 `14708c4`。本批完成本机完整兼容客户端与 AppContainer 空登录启动这一技术停点；完整五组 S1 继续，正式模型、账户、费用和方法资格没有由此放行。

## 实际产物与来源

原构建14最终 code0、stopped=false、资源disposed、source_error为空，107份修改材料与六份选定工具前后相同；实际release构建约40分14秒。此前文档中的“14运行中”现为历史状态，不再重开该阶段。

后续完整15将受控启动修补纳入 `.2` 来源：监督器在实际受控子进程内设置 `CIMILOOP_CONTAINED_CODEX=1`；固定上游 PluginManager 据此跳过 curated 插件仓库的可选后台同步。空登录初始化不必访问允许域名之外的GitHub。插件读取、加载、权限和marketplace校验不因此跳过；网络域名、TLS/SNI、Token、Job、原卷句柄和写入边界保持。

15最终 code0、stopped=false、原资源disposed、source_error为空，约13分39秒；108份修改材料和六份选定工具前后完全相同。上游仍为 `c1382380de69521303b416720a52f42d51af6248`，本地版本 `0.162.0+cimiloop-lowbox.2`。当前源码另经精确来源验证，与15的source_after相同；不能因版本字符串相同将14、15材料互换。旧 `.1` 仍为六份修改材料，没有自动升级用户库或重解释历史原操作。

独立复核15后新补齐的ICU／Rust vendor共1,765份原件，物理身份及摘要零漂移，收据为原依赖目录中的 `after-full15.json`；12、13的收据保留。本机开发Job与两次新AppContainer运行的原件均保留，没有清理历史Unknown。

Cargo目标中的两个程序均为普通的两链接文件。为供后续安装使用，本批仅复制到全新的单链接目录，逐份核对原文件复制前后身份、mtime和摘要，再由真实program-bundle读取器封存。原缓存不删除或修改。当前本机保留目录：

```text
C:/CimiBuild/cx-5d37e2/releases/full15-20261028-01/
  codex.exe
  codex-code-mode-host.exe
  build-receipt.json
```

本机路径不是跨电脑配置，原件和缓存不随Git迁移。两个程序分别为315,972,096和76,237,824字节，SHA256为：

```text
codex.exe                 aba33b422896658b3125c32016ddf4940c30a5003917f3b9c058db31dfd6a3e0
codex-code-mode-host.exe  876f80e474affd76d65a649eb142d43b4bda3b6fa201ba557f625be39a7b2ff6
```

封存收据绑定15的原result摘要、当前108份来源、六份选定工具、新依赖复查和两个新物理文件；没有声称封存整个工具链。新目录程序摘要与以下两次实际AppContainer测试捕获的program_bundle完全相同。

## 本批实际验证

Node24.22.1／pnpm12.4.2，`pnpm check`及diff检查通过。报告位于 `.cimiloop/codex-2026-10-28-`：

- `official-startup-full15.json`：完整 `codex-official-startup.test.ts` 两项通过、0失败、0跳过、exit0。实际新程序分别执行版本查询与 `app-server --stdio` initialize；版本为上述`.2`，初始化收到实际成功响应。各自使用全新空登录、HOME、AppData及TEMP，模型请求0、凭据读取0。
- 两个原结束件均为网络opened／connected／bytes=0、boundary_failed=false、活动进程0、根授权移除和Profile删除成立；原资源读取器另核对disposed。不以版本输出代替初始化。
- `contained-proxy-sync-final.json`：两个完整代理文件4项通过、0失败、0跳过。包括实际AppContainer的域名／错误SNI拒绝、原Job取消和公开TLS握手；TLS用例实际启用且只完成chatgpt.com证书／SNI认证，应用请求0，不读登录、不调用模型。
- `node --test scripts/codex-appcontainer/pipe-source.test.mjs`：配置真实固定`.1`来源及两份认证归档，完整4项通过、0失败、0跳过。覆盖历史六材料兼容、`.2`双HTTP依赖／WebSocket来源、错误归档拒绝及有限模块来源／依赖漂移拒绝。该文件的断言不代替实际新程序启动。

以上为Vitest三个完整文件6项与Node一个完整文件4项，分轮执行，不称全仓或完整S1。仅采用本批可定位原件和输出；未重跑全仓测试、真实模型、真实Skill、费用结清或完整验收。独立定向源码复核未发现本修补的确定阻断缺陷，范围限可选同步、原权限边界与历史来源兼容，不是最终Matt或Superpowers资格评审。

## 下一步与真实停点

接入指南G1在本机已有上述真实证据。G2仍需实际管理员准备专用固定卷，再由Human通过官方安全登录为同卷独立目录连接已授权账户；不能复制auth.json或提取令牌。本机已有脚本的4GiB只读准备计划已生成，executes=false、runtime_scope_proven=false，没有创建、挂载或格式化磁盘，不算物理配额通过。

G3完整费用／上限及恢复来源、G4真实Skill／Matt资格、G5真实Human回答、默认正式Agent及普通Change到ReadyForDelivery仍须逐项完成。用户只有当前Codex登录；不要求其再提供Key，也不自动换用付费服务。登录可用、token记录或有限容量不替代官方硬上限和逐请求账单。新受控Matt仍在模型效果及预约前拒绝缺少的整个turn输出上界。

本批不启用正式Provider，不创建业务Plan／Task／Run，不释放Unknown预算，不迁移Schema242／项目库10／Host1，不触碰六个未知文件，不push。只有完整五组及真实交付链全部验收成立才可完成持续目标。
