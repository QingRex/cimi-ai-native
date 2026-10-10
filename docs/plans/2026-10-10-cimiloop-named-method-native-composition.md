# D-268：原 Skill 命名方法生产 Native 组合

基线 main/fa8bc64，完整 S1 目标 active，默认正式 Agent 关闭，零真实模型/付费/Key读取。本批沿已有 SDK custom tool 和 OS 身份认证 IPC/Native sandbox 接通 fixed named method 生产路径；不会调用 synthetic conversation probe，也不把 native read 或自定义方法调用改写成 builtin Skill。

共享服务从原 SkillInvocation、方法包和 Kernel 当前权限形成冻结资料，子账户保留父 Run，子 Runtime 使用原 invocation_key/input_digest，父子共享原 Task 时钟与机器截止时间。命名 host 只返回原 profile 中的 entry/dependencies/request/input/artifacts；SDK只有 cimi_invoke_skill/cimi_read_method_resource，普通仓库读写和检查工具不开放。原 Native config 保持显式兼容，新方法配置前瞻创建。所有读、等待、Native启动及 SDK/model 工具效果前重新检查当前 Kernel。

先红测固定材料与重复请求/原件丢失/取消，接生产模型Host、原IPC账本、SDK工具模块、原Native controller 和共享准备工厂，再跑类型/受影响/实际Windows检查。保存实际失败及Unknown，不用后跑覆盖，不批量清理；普通代码评审后更新文档并仅本地提交。

这不是真实模型、真实命名方法行为资格、Matt/Superpowers/S1证明；真实账单、领域结果和完整恢复仍须独立联合核验。缺模型ID、套餐、现金与积分上限时继续拒绝付费。

实现已接原共享应用服务、专用模型/账户、固定材料 Host、SDK、原 IPC 账本及 Native 配置6；四项普通工程 must-fix 和 Node 丢失资源读取回归均先取得失败再修补。最终受影响/实际 Windows 命令和源码证据见 [实施记录](../implementation/CimiLoop-named-method-native-composition-v0.1.md) 与 [研究记录](../research/CimiLoop-named-method-native-composition-2026-10-10.json)。下一步必须补新 Local 工厂正向原启动及独立方法结果核验，不能据本批宣布真实 Skill 或 S1 完成。
