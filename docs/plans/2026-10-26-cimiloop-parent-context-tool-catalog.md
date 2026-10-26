# 父 Run 按原 Context 收敛 SDK 工具目录

接续 `b2fc5e8`，补齐正式 Skill 主链中的执行目录。普通 Codex Run 已按 Context 选择工具；此前父 Run 却始终把读、编辑、检查、调用 Skill 四项全部交给模型和 SDK。本批让父 Run 的模型、SDK网关、Native权限及原结果复查使用同一份目录，Kernel仍逐次独立决定每次效果。

## 执行行为

当前 Codex 生产组合从原 Context 的 `read_files`、`edit_files`、`run_checks` 推导工作区工具。安装了原父 Skill 服务时加入 `cimi_run_skill`；Skill仍须原Binding、方法资格、权限交集、父子预算及当前Kernel批准，目录中出现工具不授予这些权限。

例如原Context只允许读取与检查时，父Run的目录为 `cimi_read`、`cimi_check`、`cimi_run_skill`。模型看不到可用的编辑工具，Native默认拒绝中也不放行编辑；即使外部建议附加编辑调用，SDK模型请求和当前Kernel仍会拒绝。全四工具的旧模式保持原义。

一至三个工具的父子集必须保留 `cimi_run_skill`，仅支持当前有界Codex模式，使用显式内部版本：父工具政策 `fixed_parent_skill/2.0.0`、SDK请求5、模型Host原件9、Codex原件17和Native配置18。它们保存同一 `workspace_tool_names`，不能把旧模式通过附加字段升级。Codex17保持原工作区桥接协议，要求固定卷登录目录，不误用命名Skill专用模型协议。

新Native配置18保持原私有状态写入、固定Task期限和父Skill目录绑定。普通／命名／旧完整父模式的格式不改变，不重建旧Host，不改原请求ID，不在丢失响应后重新发送模型请求。Native采集、独立完成核验和资源恢复均理解新格式；仍由原Host／模型／Native／SDK／IPC字节相互核对。公共Schema242、项目库10／Host1保持，没有用户库迁移。

## 开发验证

新增模型Host、SDK网关、原件模式反例先运行，3失败、0通过、25项过滤；实际编译Native配置反例1失败，其余26项过滤。失败分别确认旧Host拒绝父子集、旧网关拒绝新政策以及旧Native不支持新配置。过滤不是整文件通过。

类型检查、CLI／工作台编译帮助、两个修改后SDK模块的脚本语法及diff检查通过。首轮六个完整文件121项通过、1项失败、0跳过。唯一失败为新增Codex测试声明原父任务包、却发送了旧普通提示；原包完整性检查正确拒绝，修正测试输入，没有修改生产核验条件。随后该Codex完整文件51项通过。另行Runtime原入口完整文件7项通过，验证缺少同一原Skill服务时拒绝、装配正确时进入原Task预算检查且无子调用效果。

按每个文件最新完整报告汇总七文件129项通过、0失败0跳过：Codex51、模型输出9、父SDK网关7、父模型12、实际编译Native配置27、通用模型16、Runtime入口7。不是一次七文件全绿；首次失败及反例报告均保留在忽略目录 `.cimiloop/codex-2026-10-26-parent-tool-*.json`。测试导入路径类型错误已修正，不作为产品反例。

验证使用PUBLIC账户／模型回复或准入端口；实际stdio子进程、命名管道和编译C#权限校验不等于真实模型或完整Windows/AppContainer执行。开发期间没有新增真实模型请求；完整Native、费用、Skill和S1验收留在主链接齐后集中运行。

## 剩余主链

本批只解决父Run多暴露工具的实际执行缺口，尚未完成默认完整Runtime准入与四项具体控制来源、首次隔离方法资格采集、完整方法行为／权限／费用／恢复读取器及默认Skill执行安装。Human/Matt开工前澄清、真实普通Change到ReadyForDelivery、接入指南实际验收、最终Matt／Superpowers仍须完成。账单来源、专用固定卷及同卷外部官方登录目录、原Human回答继续缺失；五组和持续目标保持未完成，不push。
