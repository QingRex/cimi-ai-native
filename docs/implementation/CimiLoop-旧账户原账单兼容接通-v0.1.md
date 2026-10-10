# CimiLoop 旧账户原账单兼容接通 v0.1

2026-10-10 D-264：SQL1原账户可显式增加受保护账单与独立意图库，保持旧登记／Schema／扣留／Run身份；旧句柄、无完成物理登记的中断、三方原件丢失均拒绝。当前D-257历史Native／SDK／领域原件独立重读后，经共享Human服务与Kernel按同单位公开受控账单对账为原Run Succeeded、48微现金、预算保留0、尝试1，Task仍InProgress，原请求重放不重复效果。不是实际智谱模型／账单／方法／S1证据；新生产组合和Bun故障未据此宣称通过，正式Agent默认关闭，五组目标持续、零付费。

## 实际可用路径

可信启动代码可将既有SQL1账户显式接上原账单。新 billing.sqlite 保存原供应方字节及逐请求收费投影；billing-attachment.sqlite 保存独立账单意图。两个新库均格式1，原 account.sqlite 格式1、原 account_origin、DDL、扣留行及Host扣留登记不变。新账户现有格式2、项目库10和公共242 Schema不变。

每张账单必须由安装的同步真实账单核验器重新认证，逐项匹配原 request_id、scope、call_id、request_digest、hold_digest、原批准／套餐／价目及单位。没有默认认证器，不从tokens推算收费，也不把无账单当零费用。

## 安装与原操作接续

受信代码调用 attachWindowsDedicatedAgentAccountBilling({origin,accountDigest,connection,admission,toolsRoot,billing})，或以真实custody调用 DedicatedAgentAccountLedger.attachOriginalBilling。connection是原连接描述，不能读取历史消息复制Key；凭据保持仓库外安全配置。billing.identity_digest／currency／credit_unit固定在独立Host登记，verifyOriginal需实际认证历史原字节和最终逐请求收费。正常openWindowsDedicatedAgentAccountLedger只重读已安装接入，需要同一核验器，绝不自动升级或换库。

可把打开的同一个 DedicatedAgentAccountLedger交给已有HumanAgentAccountFactory。LocalHumanAgentRunCostObservation.reconcile使用现有Kernel及原Run资料；编译CLI run reconcile-original、工作台HTTP与按钮复用此共享服务。浏览器JSON／命令参数不能安装核验器或批准模型。原命令成功回执重放不再查询账户／采集Native／发送模型请求。

Host先保存唯一接入claim，完成登记绑定旧账户ticket、完整原origin及两个新增库物理身份。若完成登记已经提交但响应丢失，按原登记重读；若claim后尚未完成独立物理登记，即使两库可读且摘要自洽也保持Unknown。不能重建、复制后替代、批量清理或解除扣留。未完成接入必须保留原件并交由另行设计的显式恢复处理，本批没有开放无锚修复。

账单写入顺序为独立意图提交、Host原账单提交、账单库提交，父账户writer锁覆盖整个操作。读时三方逐项全量匹配；任一部分提交／丢失／替换／权限异常拒绝。旧打开句柄不能继续忽略新账单，必须安装同一核验器后重新open。

## 当前历史Native核验

精确本会话D-257原Run 01a123d7-72b1-7233-8553-a7c2508bbe71、原operation c335e2e0-0c86-4535-a97e-53f2a12f58e5 当前保留的Native／固定二进制／SDK／IPC／领域版本已经独立重读。4次调用和4个原扣留仍对应同一原操作，Native正常退出0且资源disposed；没有重新运行旧进程或改原控制器。

公开受控账单按原Kernel预算USD单位逐项12微现金，共48；这是明确构造的账单认证，不是智谱真实账单或汇率换算。共享Human服务与Kernel把同一原Run对账为Succeeded，费用48、预算保留0、尝试1、pending_reconciliation=false；Task仍InProgress，没有完成Task或ReadyForDelivery。原SQL1账户登记／DDL／扣留行前后相同，项目库经schema_migrations／readDatabaseFormat确认10。相同请求立即重放返回同回执，账户工厂只调用一次；同一编译普通CLI在未安装账户工厂时重放该原请求也返回完全相同回执。没有重开Run、Key读取或付费请求。

## 最终验证及失败边界

- 受影响 13 文件 123 项通过；实际Windows 4 文件 18 项通过；两组均0失败／跳过／未处理异常。这不是全仓库或完整S1验收。
- pnpm check及编译CLI两组帮助通过；667个源码文件前后0漂移；公共242 Schema语义0变化。
- 保留首次8项缺入口失败、首次实现8通过、修复阶段3文件解析失败（重复局部db声明）、后续账户36通过；沙箱Windows原生控制不可用的5项失败未计通过，实际主机8项通过后再按最终源码完整复验。首次完整受影响范围122通过1失败：已有local-app前端测试从错误包位置加载jsdom；改为从声明依赖的工作台package.json加载，锁文件不变，完整范围重新复验。
- 普通只读工程审查修复第三库ACL遗漏及无物理锚接续；[requesting-code-review](C:/Users/hector.he/.agents/skills/requesting-code-review/SKILL.md)未提供正式Matt／Superpowers资格。
- 原件与最终源码摘要见[研究记录](../research/CimiLoop-旧账户原账单兼容接通-2026-10-10.json)，具体兼容设计见[实施设计](../plans/2026-10-10-cimiloop-旧账户原账单兼容接通实施设计.md)。

## 完整五组仍未完成

V1-09继续新生产Runtime组合的正向Native执行与异常恢复、真实模型／账户／费用资格、物理配额和历史容量；D-258 Bun故障根因未证明。准备阶段取消也不能以零请求／零账单推导零费用结清。V1-21继续真实Skill及真实Matt计划前澄清与默认入口完整安装。V1-22继续Matt独立完整评审、Superpowers当前源码新鲜验证和真实行为对照。V1-10继续工作台正式Agent完整执行／查询／停止／原操作恢复。V1-11继续真实普通Change到ReadyForDelivery、真实技能与中断恢复、S1验收及完整可操作指南。

仅确认智谱提供方；具体模型、套餐、现金／积分上限仍待确认，真实凭据保持仓库外。正式Agent默认关闭，持续目标active，默认只本地提交、不push。旧Unknown资源与两个保护tmp保持，找不到不等于清理。
