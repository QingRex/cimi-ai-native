# 本地 provider 正式组合的写根与凭据进程

本批基于 `8b6ba08`。正式专用账户 Runtime 组合现在必须同时持有原安装、原固定卷能力和同 Host1 账户；仅传账户、连接和程序不能再构造正式执行组合。父子 Skill 沿用同一守卫，不新建业务 Run 或账户。

## 实际接线

真实 Windows 账户工厂在等待辅助器前快照工具目录，并以私有 WeakMap 保留实际账户与辅助器来源。新的原写根读取核验完整账户审计和原 Host1 ticket，捕获的原型方法不能由替换对象方法伪造；PUBLIC 构造账户不具备此能力。

应用服务从原安装和真实账户读取已知全部写根，包括安装根、安装工具、账户根和可能不同的账户辅助器根，与原项目仓库／数据目录一同交给既有固定卷核验器。核验前后复查原安装、项目作用域和路径集合，并使用同步保管终检。调用方提交的 writable_paths、盘符或普通目录不作为证明。固定检查配置和 Node 也进入执行守卫。

独立增量复核发现 DPAPI 解密辅助进程仍继承全局用户／临时目录；已修复实际默认模型路径。每个原 operation_key／call_id 的凭据辅助器使用所属数据根内私有 HOME／AppData／PROGRAMDATA／TEMP、cwd，前后核对目录和原密文字节，传递原预约守卫与取消信号。CurrentUser 身份保持，不复制真实凭据。loopback format2 缺所属根在读取凭据前拒绝，历史 format1 单独调用保持兼容。无数据库、Schema242、Host1 格式改变。

这是已知代码来源的写根约束接线，不能据此宣布任意 OS 写入均受物理硬限制、四完整控制通过或生产派发获准。默认完整宿主与独立资格读取仍继续实施。

## 反例与验证

报告前缀均为 `.cimiloop/codex-2026-10-28-`，失败报告保留，不覆盖：

- `dedicated-writable-roots-red.json`：定向 0通过／9失败／50过滤，包含缺实际原写根能力、正式组合未要求存储的旧行为。
- `dedicated-writable-roots-first.json`：3完整文件59通过／0失败／0跳过；写根7、正式准入26、账户26。使用真实 Kernel／SQLite 和固定检查；物理卷、模型、Native 准入投影仍为 PUBLIC。
- `dedicated-credential-environment-red.json`：1通过／4失败。初版目录替换反例没有证明已替换，不能使用该通过作证据；已增加必须处于本用例私有 temp 且实际替换成功的断言。检查确认原任务 Temp 根创建时间未变、没有 retained 兄弟目录，没有执行恢复或清理操作。
- `dedicated-credential-forwarding-red.json`：定向0通过／1失败／49过滤；默认辅助器未按原 operation_key／call_id 隔离，现已修复。
- `dedicated-credential-environment-first.json`：2完整文件9通过／0失败／0跳过。包括真实 Windows 新建 PUBLIC DPAPI CurrentUser 往返，未读取用户凭据。
- `dedicated-writable-windows-first.json`：最后原进程正常退出0，4完整文件66通过／0失败／0跳过；真实 Windows 原账户来源7、模型传输50、连接4、凭据私有环境5。模型测试使用 PUBLIC 受控本地 TLS／HTTP，不是用户 provider。

以上按每个文件最新完整结果为7个不同文件125项分轮通过，不能称一轮冻结125项，更不与中途重复文件累计。最终产品修改后 `pnpm check` 通过。独立增量复核确认辅助器遗漏已关闭；不是最终 Matt／Superpowers 真实方法评审。

## 尚未完成

本批没有实际用户密钥读取、模型请求、账单认证、业务 Plan／Task／Run 或 ReadyForDelivery。安全输入与计费方式原 Human 问题仍待答，不重复提出，不回退旧 Codex 登录。默认生产宿主、完整独立控制和真实方法链继续；五组 S1 范围保持，没有 push，六个既有未知文件未触碰。
