# CimiLoop 原 Job 提交内存策略与启动结清接入

2026-10-11，D-274，接续 D-273 303ac68f377eec9a02155294a6627582af5453eb。完整五组active；242 Schema、用户库10、默认正式Agent关闭、零付费、不push保持。

本机普通令牌没有卷管理权限，暂不能直接挂载专属VHD。目录扫描和逻辑文件上限不能算磁盘硬配额，不能把系统NTFS用户配额随意施加到现有用户所有文件。磁盘硬配额继续，不用内存结果替代；不修改系统卷、不删除旧资源。

1. 新运行输入冻结确切版本化Job策略及独立核验器物理二进制原件。当前Native已有kill-on-close、单进程、2 GiB committed memory上限；保留原Run/operation/scope和Task期限。
2. 原Runtime暂停时，独立核验器核对owner/supervisor/peer创建时间和镜像并持有句柄，只查询既有命名Job及peer归属。确认内存/进程上限及无breakaway，不能创建、修改或终止Job。
3. 放行前持久保存原OS证明，再核当前权限/期限/账户。失败保留原操作与Unknown，不重开Run。
4. 采集、成功领域核验及成功/失败/取消结清读取同一原证明和核验器；缺失、外来身份或宽松策略拒绝结清新运行。
5. 无新策略的旧输入精确按旧义读取，不补造历史证明；新私有标记显式兼容，公共Schema和用户库不升级。
6. 先写反例，再实现，完成受影响回归及实际Windows/AppContainer生产组合。小容量实际OS分配拒绝验证Windows机制，不能替代生产Job核对或真实模型/Skill/S1。

真实模型、套餐、现金上限及币种、积分上限仍待确认，不读取真实Key或付费。真实Skill、Plan/Task前Human/Matt、独立Matt与新鲜Superpowers、正式工作台及真实Change到ReadyForDelivery全部继续。两个既有tmp不读、不删、不暂存；每完整批实现、验证、更新文档后本地提交。

本批实现与验证完成：受影响37文件518项、按最新完整Native文件汇总7文件37项通过0跳过；过程失败与原件保留，五组目标active。见 [实施记录](../implementation/CimiLoop-原Job内存策略核验与结清-v0.1.md) 与 [研究记录](../research/CimiLoop-original-job-policy-2026-10-11.json)。
