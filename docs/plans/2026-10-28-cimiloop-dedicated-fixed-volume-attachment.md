# CimiLoop 本地 provider 原固定卷接线

从 `4b4e4ed` 继续新 provider 主链。现有原安装可通过共享应用服务显式绑定**已存在**的固定 NTFS 卷；CLI 安装／查询与工作台元数据均复用该服务。没有创建、挂载、格式化或扩容任何镜像或卷，没有调用模型。

## 实际功能

新增 `runtime install-local-provider-storage`、`runtime local-provider-storage`。必须先有受保护本地 provider 原安装，仓库及数据目录必须与指定挂载根同卷；随后由原 OS reader 核对固定镜像、卷身份和物理容量，保存同 Host1 的原配额／Runtime 票据。重复同一输入读取原票据；物理身份改变、部分登记、reader 原目录丢失或安装改变都拒绝，不编译替换原 reader，不补写缺失原件。

```text
runtime install-local-provider-storage --image <原固定VHDX镜像> --volume-root R:\ --maximum-mib 4096 --yes --project-dir <项目目录> --json
runtime local-provider-storage --project-dir <项目目录> --json
```

这是参数示例，不能视为本机真实项目已执行。真实 R: 固定卷的建立与原 OS 读取见[准备记录](2026-10-28-cimiloop-fixed-volume-preparation.md)；当前连接尚未保存，因此没有为业务项目新建 provider 安装或绑定票据。

`runtime-storage-attachment-local.ts` 抽出既有原卷读取、配额和 Runtime 绑定，旧 Codex wrapper 保持 `codex_runtime_storage`／`cimiloop/codex-runtime-storage/1.0.0`、原摘要键及所有旧票据含义。新 wrapper 采用独立 `dedicated_runtime_storage`／`cimiloop/dedicated-runtime-storage/1.0.0`。profile 由代码固定，CLI／HTTP JSON 不能替换 reader 或提供 `supports`。本批没有升级 Schema242、项目库10或Host1。

工作台认证 `/api/context` 在本地原安装实际可读时返回 `local_provider_runtime_storage`。未绑定时明确 missing；没有安装时不打开新 reader。该绑定核对项目／数据范围，仍须将安装、共享账户、全部工具／进程临时根及历史容量逐一接入真实完整控制读取器。**本批不能声明全部写根 G2 通过、默认 Agent 可执行或 S1 完成。**

## 验证记录

- 新边界整文件：旧实现 **0通过、7失败、0跳过**，缺少新入口。报告 `.cimiloop/codex-2026-10-28-dedicated-storage-red.json`。
- 第一次3完整文件 **15通过、1失败、0跳过**。旧 Codex 边界7项与新 provider边界7项通过；正向装配的绑定／重放／独立 namespace 通过。剩余反例在检查“没有重建 reader”时，将 `buildWindowsFixedVolumeReader(...,{readOnly:true})` 的合法只读打开也计为编译，计数为6而期待5。复查真实实现确认 readOnly 路径没有编译；只修正 PUBLIC mock 计数区分，只读／缺件拒绝及原票据不变断言均保留，生产实现没有为此修改。报告 `.cimiloop/codex-2026-10-28-dedicated-storage-first.json`。
- 修正计数后，受影响两个完整文件 **12通过、0失败、0跳过**：正向存储组合2项、原安装及编译CLI／认证工作台HTTP10项。工作台实际返回未绑定存储为missing，读取没有生成原reader；报告 `.cimiloop/codex-2026-10-28-dedicated-storage-composed.json`。结合此前两个边界完整文件的14项，各文件最新完整结果覆盖4文件26项，分轮通过，不是单次全范围整轮。
- 最终 `pnpm check` 通过，编译CLI的两个新存储命令帮助实际执行成功。独立增量复核确认共享提取保留旧格式、namespace、票据及只读行为，没有新增挂载、格式化、模型或登录行为。未机械重跑不受后续mock／HTTP字段改动影响的14项已通过边界。

边界使用实际 SQLite／Host1 算法，正向装配使用真正原安装、branded 配额和原 reader 组合，但 OS 卷事实／Host 身份／程序是明确 PUBLIC 夹具，未建立或读取真实新镜像。既有真实固定卷准备与历史 Native 通过不能自动拼为本批生产证据。未运行全仓或真实 provider，不含完整 S1 验收。

## 接续

将本绑定接入本地默认完整宿主，继续原持久账户预算／账单、全部写根与历史容量、SDK／工具独立效果及完整恢复来源，再执行真实方法资格和 Human／Matt 澄清。原连接安全窗口及计费方式问题保持待答，不重复询问、复制聊天密钥或发未批准付费请求。真实需求仍为 Draft CHG-0001“工作台原运行列表按状态筛选”，没有业务 Plan／Task／Run 或 ReadyForDelivery；保留旧六文件和全部历史 Unknown，不push。
