# D-295 正式原时钟独立线程与原期限保留

实际当前父 SDK→Skill 生产组合在原 Task 仍有 1751974ms 时失败：clock_continuous 固定 15000ms 控制期限被主线程同步工作拖到 119778ms，原 Native 返回未能及时由主线程验证。普通专用账户场景另有原600000ms Task到期失败，不能由时钟修复直接宣布已解决。两次原失败均保留，缺失目录不能证明原效果不存在或资源已清理。

本批把完整原 Native 时钟通道放入固定 Worker，生产 openWindowsAgentRunClock 直接使用此路径；不替换时钟读数、不预读缓存、不重启 helper、不变更 Task 起点/期限。Native 仍按原宿主 PID/creation_ticks、nonce/sequence、原二进制摘要、4096字节帧/8MiB总字节/8192次原读/16队列限额逐次验证。原入口到 Worker 的等待计入同一15秒控制期限，Budget.remaining继续扣除从原读取开始到主线程最终消费的全部时间。

取消立即拒绝调用者，但原队列槽直到原回复 consumed/drained 才释放，不补发。错误使用严格固定帧重建 NativeControlError，原Native首失败在Worker后续故障或close中保留，不传stderr、stack或任意异常message。SAB仅提供bounded一致性诊断；Worker死亡不证明Native退出，close必须等待固定Worker ACK、真实原Native退出以及Worker自身退出。Worker编译入口随当前pnpm check生成，与此次源冻结一并验证。

两个实际Windows17秒阻塞反例原先全部失败；修复后实际同helper读取/取消/原宿主死亡及原锚预算回归通过。独立工程评审另指出传输等待期限和首错误覆盖，两项均实际红测后修复，最终复审无新增必修。该评审不属于Matt/Superpowers。Worker非正常死亡与部分错误帧覆盖目前为显式构造传输测试，不宣称实际Worker死亡恢复已验收。

隔离最终完整5文件29项通过、0跳过、789源码无漂移，check通过。main只精确接入时钟相关9源码/测试路径，保留模型终检和Worker身份等原main修补；D-294领域结果3代码仍在隔离树，不能以本批替代。main重新完整check、CLI帮助通过；完整6文件33项（包括原Task实际Native锚/取消/期限）通过，0跳过、787源码无漂移。首次main完整6文件32通过1失败：跨Node --input-type=module 被Worker继承，受控诊断确认ERR_INPUT_TYPE_NOT_ALLOWED；正式Worker固定execArgv=[]后原完整范围重新通过，不覆盖初次失败。修补后的完整实际生产组合5文件已用新原操作启动验证，原600000ms/1800000ms Task预算未抬高，结果待原最终报告。

协议Schema242、用户库10、Host账本1不变，无用户库迁移、无真实凭据读取、无付费、无push。两个未知TMP及全部旧Unknown资源未处理。正式Agent默认关闭，构造模型/资格/账单和时钟合同不能证明真实模型/Skill或S1。

持续目标继续覆盖V1-09、V1-21、V1-22、V1-10、V1-11。后续先消费原生产组合报告，完成当前领域结果3和Native生产组合，继续共享工作台/澄清/真实Skill/独立评审/完整Change到ReadyForDelivery接入与验收。真实智谱具体模型、套餐、现金币种与上限、积分上限待确认；确认前推进不依赖付费的实现，不重复申请已授权工作。

证据：[研究记录](../research/CimiLoop-original-clock-worker-2026-10-13.json)。
