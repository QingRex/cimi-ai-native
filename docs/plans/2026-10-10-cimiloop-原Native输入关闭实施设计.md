# D-254 原 Native 输入关闭与执行中断衔接实施设计

完整五组 S1 持续。D-253 已把工作台原启动接至共享组合，实际 Human 最终准入等待撤权确实阻止 SDK 恢复，但 Native 把 EOF 传给 JSON 解析，生成 ArgumentNullException / unavailable。准备阶段还吞掉输入读取错误，必须区分完整空 EOF、截断帧、非法 JSON、读取错误及期限中断，不能以清理成功制造任务成功。

沿现有原 Native 控制器处理完整 EOF，记录原 parent_ended / 非零停止码并走同一 finally 处置。读线程保留读取异常，非空截断帧保持 unavailable，不当作正常关闭；原10秒输入及Task期限不放宽。原 Controller 的受控中断单独写不可变 interruption1，绑定 nonce、scope、owner / supervisor / runtime、原阶段、runtime_resumed；新旧控制器原字节和版本均保留，不升级242 Schema、用户库10、原启动账本1或已有Native config / cleanup格式。

新原采集包含可选中断原件，独立核对全部原身份、原配置 / launcher / resources / cleanup / 原OS已停止及字节摘要，并供HTTP / 页面展示恢复前或恢复后中断。没有新原件的旧集合与观测保持原义，不复制旧不可用错误为新证明。中断不是领域结果、账户保管或账单；Kernel仍保存原Unknown观测，原权限恢复后可按同Command ID核对一次，不能释放未知预算、再启动原Run或满足Task。

先让实际Windows最终等待撤权反例期待受控停止失败，再实现Controller、共享原采集 / 核验 / 页面。验证准备阶段关闭、最终恢复前关闭、截断与非法输入不误分类、恢复后原停止和正常SDK路径；模型与账户资格仍构造，不计真实模型 / Skill / Matt / Superpowers或S1。按本批实际结果更新研究 / 接续文档、普通独立工程复核后仅本地提交，不push；模型 / 套餐 / 现金积分上限未确认前不付费。
