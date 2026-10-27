# 原 SDK 取消与恢复重试送达原 Codex 模型 Job

接续 `47cd8b5`。已有查询／恢复会将 SDK 与当前 Codex Run 的模型 Job 共同核对，但原 `requestAgentRuntimeCancellation` 只保存 SDK 取消标记，没有向已登记模型 Job 投递原取消。宿主还活着而 SDK 已取消时，不能依靠宿主退出、后续超时或“SDK已停”代替模型停止。本批补齐实际停止投递和已有取消的恢复重试；完整恢复控制来源及五组 S1 仍未完成。

## 执行路径

原取消先保存并复核同一 SDK cancel.json，再从已固定 input 的 `codex_login/1.0.0` 选择原模型读取路径。请求 JSON 不能选择进程、程序、账户、取消路径或新工厂。旧非Codex操作保持原结果结构；缺模型原件不阻止保留 SDK 取消，但返回 `model_cancellation.status: Unknown`，不当作模型已停。

模型层逐份读取该原 scope 的实际请求。`CodexOriginalMethodRuntime.requestProcessCancellationRetained` 以只读模式重开原配置，只接受独立 Host1 的原 intent、prepared、claim、原 launcher/config 身份，以及已有 started 时的原出生登记。缺失／不符时不写不明目标、不按PID杀进程、不重新构建或启动模型。实际投递仅创建同一原 Job 的 nonce/config 绑定 cancel.json；重复请求验证并重用原标记，不改写已有字节，不封模型输出或补 complete 票据。

普通 Human Run、子 Skill、Runtime 技术契约、技能隔离调用和内部原操作入口都将当前控制守卫传入。守卫在原取消保存和每个模型物理投递前后复核；Kernel取消仍为唯一业务决定。撤权错误不能作为普通模型不可用吞掉。先前已提交的原取消和占用保留，没有反向撤销或重复领域效果。

投递后只返回 requested；`stopped_proven:false`、`completion_proven:false`、`costs_reconciled:false`、`family_resources_disposed:false` 保持。实际资源处置继续经原 Job／身份／授权／Profile证据查询，不能用取消应答结清费用或声称完整父子族已停。

恢复先验证已有原 SDK 取消；有原标记时先经同一模型投递路径重试，再进入原 SDK 资源恢复，await 后仍重核当前权限。SDK 的执行 config 丢失也不妨碍对仍可核对的原模型 Job 重送取消，但整体仍为 Unknown／resources_disposed:false，不能据模型退出证明 SDK 已清理。没有原取消标记时不生成模型取消；先按原身份重试取消，不推断业务批准，也不创造新请求。

## 结束原件到达时的正确核对

联调实际复现：取消送达会产生新的 Job ended.json。如果将动作前后的完整观察切面要求逐字相同，正确结束也会让整个取消应答变成 Unknown。现在固定并复核完整原请求集合、header／request原字节和物理身份，允许动作产生独立结束原件；新请求、替换请求或删改原身份仍不能得到“全部送达”应答。

Windows反例分别在真实模型Job运行中投递SDK取消，以及在“SDK取消已记、模型投递丢失、SDK执行登记缺失”后按原身份恢复；两者均在同步守卫中等待原结束文件到达，强制覆盖该时间窗口。账户原预约保留、模型只发起一次，原Job为空；模型回复和费用仍Unknown。它使用PUBLIC stdio模型和构造SDK claim，不是正式SDK／真实账号或S1链路。

## 验证边界与失败

原缺口反例先4失败、1通过、18未选择：没有保留原Job取消方法、SDK没有模型投递以及guard未使用；旧非Codex取消对照通过。第一轮新增实际Job目标通过后，又加入结束原件到达反例；该反例最初因PUBLIC transport漏账户摘要而在准备阶段失败，修正夹具后实际复现Unknown应答，固定请求集合后通过。准备失败没有模型效果，原材料保留，不算产品反例。

恢复补丁前反例另有2失败、1通过、5未选择：原恢复不重试模型投递，也不接收当前权限守卫；没有原取消不新建标记的对照通过。

Native测试只操作本批创建的PUBLIC进程及原Job；撤权和缺失started原件拒绝写取消，同一原标记重放、模型不重开、原Host不补complete、预约不释放均另有断言。第一轮8文件89项断言通过，但子Skill文件 afterAll 因 `TEMP` 的正反斜杠表示不同而报 Unsafe cleanup，整轮exit1，不算全绿；其余7完整文件74项通过，子Skill在保留父目录／名称限制并使用解析后的绝对路径比较后，另轮完整15项通过。首次失败夹具保留，没有手动删除它。一次类型检查发现新测试的 `local_content` 字面量推宽，补类型标注后通过；生产源码不因此变化。

最后 `pnpm check` 通过（Node24.22.1／pnpm12.4.2），包含恢复新增用例和测试路径修复。最终同轮8完整文件95项通过、0失败0跳过：原模型Job文件21、取消／恢复组合8、原Runtime操作13、Human原Run控制18、子Skill控制16、Runtime契约10、技能隔离调用8、工作台Runtime契约HTTP1。原模型Job文件含实际Windows Job、子树、owner退出、原物理身份和取消／恢复；PUBLIC stdio模型及构造SDK claim不等于实际LPAC新客户端／完整正式SDK链，模型和费用不由这些用例批准。

报告在本机忽略目录 `.cimiloop`：同日前缀 `codex-2026-10-27-` 的 `original-model-cancellation.json` 为早期目标5通过18未选择，`original-model-cancellation-final.json` 为89断言通过但afterAll失败的旧整轮，`original-model-cancellation-child-fixed.json` 为修正路径后的子Skill完整15通过；最终 `original-model-recovery-final.json` 为8文件95通过，success=true、exit0。原失败和目标未选择项不改判，最终源码不复用旧整轮冒充通过。测试目录使用C盘新私有位置，不恢复被停止的旧测试、不删除旧Unknown。

## 仍需完成

这里只补了“保存原取消→原模型 Job 收到取消→独立资源观察”的停止路径，没有将部分场景当作完整崩溃／重启／恢复矩阵，也没有安装 `crash_recovery: supports` 来源。未登记／原件丢失／历史无owner_job的模型仍Unknown，不为它创建新进程。父子族仍需逐原调用核对；完整 `.2` 客户端构建、真实模型与技能、全写根配额／历史容量、真实费用结清、默认工作台业务链、普通Change到ReadyForDelivery、指南实走及最终Matt／Superpowers评审继续。

本批不读取登录，不发真实模型请求，不push，不改Schema242、项目库10或Host1，不处理六个既有未知文件／历史Unknown。空间充足的Windows构建环境和官方财务来源问题仍等待真实Human信息。
