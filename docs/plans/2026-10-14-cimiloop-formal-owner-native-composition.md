# D-300 正式 owner 模型账户与 Native 测试组合

本批核对发现，生产父 openDedicatedPersistent 与子 createModel 已安装 D-298 原 Ledger owner 端口，而本批修改前的实际 Native 测试为了连接本地 TLS，直接传入 Local 父账户和 Local 子账户对象，执行通用 check+hold 路径。普通生产测试仅对 openDedicatedPersistent 作 scope 断言，随后实际运行的模型仍接通用账户；当时的父 SDK→Skill 场景同样直接接通用父/子账户。因此这些 Native 运行不能证明正式 owner 完整 hold 路径的效果。

原 current-parent 操作 d6543dd1-150a-4883-b534-be355cd14551 的第4请求在17:36:40 UTC落盘，没有原 reply；17:39:08 UTC清理报告 reason 为 agent_sandbox_task_deadline，incomplete 原报告 interruption_reason 为 workspace_rehearsal_deadline、native_exit.code=12、completion_proven=false。原件正面报告 resources_disposed=true、cleanup_errors=[]，这不用于证明其他旧Unknown资源清理。保留原30分钟Task、原Run和失败，不续期、不重发。接线差异是已核实事实，但仍不是超时因果证明。

共享子账户新增 modelAccountPort，先核对原子 scope/Kernel，再返回实际 Ledger owner 创建的冻结端口；该端口仍在每个准入 await 前后调用私有 Kernel guard。生产 createModel 使用私有 #modelAccountPort，公开方法被替换也不会改变生产固定工厂。main普通生产和父子家族Native场景的本地TLS模型改用同一原父/子owner端口；不减少固定检查、Native/SDK/IPC、费用和同回执重放断言，不修改生产Task期限、账户批准或凭据路径。泛端口 fallback 继续由已有完整账户/模型回归覆盖。

新反例实际通过原Kernel/SQLite及持久Ledger核对：同一child原scope跨端口预约重放只保留一个hold；父scope不能使用child端口，父大门保持DENY；await期间Human取消后拒绝完整hold核验，原现金/积分hold保持、Run数量不增加。实施前2项失败，23个旧项因过滤未执行。初轮13文件195项通过后，补充复审发现业务权威仍可在await内替换；真实CancelRun后替换Kernel对象或assessment方法，父子generic/owner共8项全部错误resolved。现已固定原store/kernel引用、caller/location快照、原assessment方法及bound调用；guard入口、原scope/custody读取后和assessment前后复核。修复后8项聚焦反例通过、29旧项过滤；原hold和仅一次取消事件保持，替换方法调用为0。首次类型检查比较函数名错误已修正，首次失败保留。最终main完整13文件203项、零失败零跳过，788源码前后零漂移；check与CLI帮助通过。普通独立工程review无具体必修，未执行测试，不是Matt或Superpowers。

原 D-298 隔离 Native 整轮5文件50项49通过1失败、790源码零漂移，失败仍为父模型预期4次实际3次；原件保留。原进程终态后精确同步9路径，保留领域结果3并补入D-299费用守卫；隔离完整2文件37项与check通过。正式owner接线新完整5文件Native已在原普通600000ms/父1800000ms预算下运行，session66214、790源码冻结，尚无新终态。 当前领域结果3所在的隔离树不能在原测试运行中改动。新的完整 Native 原操作必须在安装本批实际owner接线后，以普通600000ms/父1800000ms预算执行；本批契约通过不是Native性能改善或当前领域结果成功证据。PUBLIC模型、资格、账单和本地TLS凭据继续标作受控材料，不等于真实智谱批准、真实Skill、账单结清或S1验收。

五组持续目标保持active，正式Agent默认入口关闭。具体模型/套餐/现金及积分上限待确认；未读真实凭据、未付费、未push，Schema242/用户库10/Host1保持，未知TMP和旧Unknown资源未处理。

证据：[研究记录](../research/CimiLoop-formal-owner-native-composition-2026-10-14.json)、[D-298原完整hold组合](2026-10-14-cimiloop-original-full-hold-model-port.md)、[D-299费用入口](2026-10-14-cimiloop-original-fee-void-guard.md)。
