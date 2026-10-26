# Codex 同卷安装与有限额度分配 v0.1

本入口为新项目补齐安装、工具和模型容量账本的同卷放置，不迁移已有项目、数据库、调用历史或登录凭据。它不批准 Provider，不启动 Run，不调用模型，也不证明费用结清。完整生产 Runtime、真实 Skill、普通 Change 到 ReadyForDelivery 和 S1 验收仍须完成。

## 使用前条件

使用 Windows x64、Node >=24.15 <25、pnpm12.4.2。仓库和项目数据已在原专用固定卷上；该卷须为现有固定 VHDX，镜像身份及容量通过现有独立 OS 读取器核对。本文命令不会创建、挂载、格式化或删除卷。需要 Human 在源、目标项目具有当前有效的项目负责人权限。

源项目已有明确安装的原账户容量政策。分配使用同一已授权 Codex 账号及 ordinary quota 身份，从原政策剩余量中永久占用一部分，绝不因换项目、目录或卷而新增总额。源账户的历史 Unknown 和分配占用都不自动释放。

以下路径均为示例，须替换为当前电脑实际路径，不能沿用旧电脑绝对路径。`R:` 代表已经核对的原专用固定卷，不代表任意普通目录已取得物理配额。

## 新项目首次安装

先准备固定检查 JSON 数组及实际 Codex、工具宿主、OpenCode、Node 程序。模型按已经授权的选择，测试优先 `gpt-6-luna`。只检查官方登录身份，不提取令牌，不把凭据放进 JSON 或 Git。

```powershell
pnpm cimiloop runtime install-codex --project-dir R:\projects\example --placement-root R:\cimiloop-hosts --binary <codex.exe绝对路径> --native-binary <opencode.exe绝对路径> --node-binary <node.exe绝对路径> --checks <固定检查JSON绝对路径> --model gpt-6-luna --yes --json
pnpm cimiloop runtime codex-installation --project-dir R:\projects\example --json
```

安装派生 `R:\cimiloop-hosts\runtime-codex\<project>\<actor>` 与 `R:\cimiloop-hosts\runtime-codex-tools`。二者均须在仓库、项目数据之外，且与项目同卷。放置选择固定在项目数据的 `codex-runtime-placement/original.json`；后续省略 `--placement-root` 仍选择相同位置。原选择缺失或冲突会拒绝，不回退另一安装。已经有旧安装的项目不能使用该选项遮蔽原安装。

然后绑定已经准备好的原卷：

```powershell
pnpm cimiloop runtime install-codex-storage --project-dir R:\projects\example --image <原VHDX绝对路径> --volume-root R:\ --maximum-mib <原固定容量MiB> --yes --json
pnpm cimiloop runtime codex-storage --project-dir R:\projects\example --json
```

## 从原账户分配有限额度

保存一个 UUIDv7。首次发送与响应丢失后的重试始终使用同一个 ID、源项目及上限。示例的次数和输出 token 是应用层有限预约，不是现金金额、积分、provider quota 或真实账单。

```powershell
$codexAllocationRequest = node --input-type=module -e "import { createInternalId } from './packages/protocol/dist/v2/index.js'; console.log(createInternalId())"
pnpm cimiloop runtime allocate-codex-budget --project-dir R:\projects\example --source-project <原账户项目绝对路径> --request-id $codexAllocationRequest --max-model-calls 2 --max-output-tokens 4096 --yes --json
pnpm cimiloop runtime codex-budget --project-dir R:\projects\example --json
```

目标安装下派生 `usage-capacity/<request>`，辅助程序使用原安装工具根下的 `usage`，二者均在原配额卷内。账号摘要仍固定在原请求和子政策中，不用冗长的嵌套路径重复编码；原生工具编译路径还须符合实际 Windows 路径能力。先保存原请求并建立尚未拨入的子政策，再由父账户原子占用对应额度，子 Host1 保存来自同一原父预约的拨入证明，最后完成目标附件。子政策缺少拨入证明时不能预约模型。复制或序列化分配返回值不能制造拨入能力；同上限的另一物理账本也不能借用它。

父账户已占用而响应丢失，可以按同请求继续拨入和完成附件，不重复占父额度。完成后重放及 Runtime 读取只使用目标本地原账本与拨入证明，不继续打开系统盘父账户或全局注册账本的写句柄。原父占用永久保留，所以父子合计仍受原总额约束。

原 intent 存在但子根、原政策或原资金证明缺失时，查询报告不可用；不能用新目录重建原账户。未完成分配须恢复同一原请求，不换新 ID、换源项目、增大上限或重新安装普通政策。当前不提供撤销分配、返还容量或自动清理历史。

## 后续接入

使用现有 `runtime install-codex-home`，绑定同卷仓库外的官方 Codex 登录目录。不复制旧登录状态。账户容量租约通过原私有来源品牌列出本地真实写根；完整 Runtime 继续交叉核对安装、工具、容量、项目数据和登录目录的同一原物理配额。

固定 Skill 的隔离执行见[接入指南](CimiLoop-固定Skill隔离调用接入指南-v0.1.md)。同卷容量安装成功不会自动启用正式 Agent，不等于方法资格、真实权限/费用/恢复验证或 S1 通过。

## 验证边界

本指南是新接入入口和恢复步骤，不是已经在当前电脑完整执行成功的 S1 指南。应用测试使用真实 Windows 受保护 Host1 与 SQLite，但程序、登录及卷观测是明确 PUBLIC 夹具；独立物理卷、真实模型/技能、真实账单和全部异常恢复仍须在最终配置上实际验证。

沿用 Schema242、项目库10、Host1。附件新增内部 format2，只用于显式新分配；旧 format1 政策和安装继续按原路径打开，不进行用户库迁移。
