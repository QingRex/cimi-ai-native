# D-292 原 Host 当前结果消费

本批接通共享 Host 的 readCurrentOriginal / readCurrentOriginalFromReader。先用固定读取器从同一 Kernel 快照读取原 frame、intent、birth、header、anchor、ReserveSkillInvocation 回执及真实子预约，再核对已知原观察与 RecordSkillInvocationObservation 回执。缺失、Unknown、reconciliation 或不一致都拒绝，不重新 resolve、预约、启动、采集或观察。

在任何候选历史回调之前取得真正的 Collection Runtime/start/Host票据/字节封口，随后完整历史语义再验，再读取同一原输入对完整当前源码的适用性。最后固定读取原预约、观察、结果 intent、本地身份及真正 Runtime 封口；封口后无安装回调，仅返回副本。默认 Agent 仍关闭。

普通独立评审发现公开 current/history 方法可被替换并接收真实 Writer，伪 current_input 可旁路候选核验。新增 5 项在各自原成功正例之后真实复现（完整文件9通过5失败），覆盖 Calls current/history、Host history、身份和目录 getter。修复使用模块固定原类方法/getter，Writer 路由及辅助方法改为 ECMAScript #private，Host 独立严格解析 current fact 并匹配原 command/candidate/input/proof。末次身份检查在 Runtime 纯封口之前。复审无新增必修；普通复审不算完整 Matt/Superpowers/S1。

隔离完整6文件71项通过、0跳过、782源码无漂移；main精确集成9路径，完整10文件143项通过、0跳过、782源码无漂移，pnpm check通过。main已有模型准备与终检修补保留，未覆盖两个未知TMP。PUBLIC模型、资格、账单、二进制与当前事实合同不是实际模型/Skill/资格批准或S1验收。

共享结果工厂当前能力、领域结果明确新格式3及生产父子组合继续；旧结果1/2保持历史含义，旧目录1不能成为新当前输出。完整五组目标保留，Schema242、用户库10、Host账本1不变，未付费、未push。模型、套餐、现金币种与上限、积分上限尚未确认，确认前不请求付费模型，不读取真实Key。

证据：[研究记录](../research/CimiLoop-current-host-result-2026-10-13.json)、[原结果封口](2026-10-13-cimiloop-original-result-seal.md)、[完整结果后续](2026-10-13-cimiloop-current-result-consumption.md)。
