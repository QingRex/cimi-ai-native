# D267：原 Skill 子调用专用账户与模型组合

基线：main / 7c300b7。完整 S1 持续目标保持 active；本批不执行付费调用，不启用默认正式 Agent。

本批把原 Skill 子操作与专用账户绑定：子范围保留真实父 Run，使用原 invocation_key/input_digest，必须核对原 Host 出生票据及当前 Kernel/独立账户准入。新绑定显式前瞻创建，旧库不迁移、不补造。独立受保护文件与 Host 票据互验；任一丢失保持 Unknown 并拒绝消费。父子共享同一现金/积分总额，禁止旧父范围费用接口漏算子调用；提供要求完整子范围清单的账单汇总。共享应用服务反复核对 Kernel，接入真实专用模型生产工厂，子模型原账本使用独立根但不创建新 Run。

顺序：先红测，实施，受影响回归与 pnpm check/CLI/242 Schema 验证，实际 Windows Host 原票据与账户原件回归，独立代码评审，更新交接与实施/研究记录，然后仅本地提交。

边界：构造准入/模型、普通代码评审、Windows 存储回归均不代替真实 Skill、模型/套餐批准、Matt/Superpowers、完整 Native 子 Runtime、领域结果核验或 S1 验收。原 Task 时钟、完整 Skill Native/SDK 方法执行与结果/账单联合核验仍要接通；D258/D265 原生失败保留，不通过重跑覆盖。
