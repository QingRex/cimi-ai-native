# CimiLoop 原账单费用 Kernel 接通实施设计

D-260，基于 D-259 / 7c214a3。完整五组S1保持；当前专用Native/Bun故障和真实批准／账单认证缺项继续保留。

本批先完成完整的原账单→SDK/提供方原请求→共享Human观测→Kernel现金用量路径。Native终态不足时仍记录Unknown并保留未决预算，不冒充ReconcileRun结清。正式终态与全五组最终验收继续，不以此支路定义S1成功。

1. Runtime独立费用核验逐笔读原专用模型spine／固定输入、提供方请求／响应、原账户占用及认证账单；核对scope、admission、connection、profile、完整hold、调用数量与所有账单。任一原件／账户／调用数量改变拒绝；零调用、缺账单不能推导费用0。读取不调用模型或账单写入。
2. 新显式费用观测proof／intent／prepared格式保持旧Unknown／失败proof原义。只由受信代码安装的真实账单ledger生成；任意JSON汇总不能成为权威。费用证据保存原账单摘要、现金、积分单位及SDK对应身份，Kernel读取时重新核验原件与保管；原费用CNY不能换成Kernel原USD预算。
3. 新共享Human应用服务复用既有Kernel与原命令，受信账户lease在异步等待后复核Human原资料。首次记录真实已核定现金用量、保留Unknown终态／原剩余预算，不记录Task满足或未启动返还。原完整请求／rawref不可变；Kernel已提交且响应丢失时重复同命令只返回原回执，原账单丢失也不能重新生成或重复收费。
4. 接工作台原Run费用观测动作及同编译CLI命令。只传原RecordRunObservation命令，不接收金额、账单、caller、根或端口选择。默认工厂缺项拒绝。读费用和记录费用分开；写操作走既有CSRF、会话、角色、修订及原请求持久化。
5. TDD覆盖实际SQLite／Kernel／本机TLS原请求与账单、账单齐全但SDK缺原件、外来账户、费用币种、原prepared响应丢失重放、prepared之后原账单变化、HTTP／浏览器真实原请求恢复及CLI安装。Windows原账户／账单保管实际复验，零跳过要求保持；不重复已确认相同Bun崩溃试跑。

所有模型／账单认证／资格均公开构造合同验证，非实际智谱、Skill、Matt、Superpowers、AppContainer SDK终态或S1证据。项目库10、242 Schema、原启动账本1、D-258显式新账单账户2／旧账户1不迁移。只确认智谱提供方；模型／套餐／现金积分上限未确认前，付费请求0、真实Key读取0。保留已有改动及旧Unknown资源，本批本地提交、不push。
