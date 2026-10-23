# Codex 普通额度许可与原模型发送

基线 `5c38f7c`。已有Codex／SDK／Native完整子链路通过，但生产账户保管未完成。本批把普通额度许可接到原模型实际发送及独立原件读取，不通过百分比推断许可，不把用量快照当作账单。

## 实施契约

新操作可由可信代码端口明确选择 `require_ordinary_permission/1.0.0`。新Codex模型后端header7同时固定已有2048输出策略和额度策略；原传输启动格式5保留该策略。旧后端1—6、传输1—4及原Run继续原规则，不能追加策略、移除策略或把旧原件追认为已取得新许可。Schema242、项目库10、Windows Host1保持。

实际发送在同一受限App Server会话先核对原账号、模型、外部工具目录，再调用 `account/rateLimits/read`。固定参数是 `supportsLunaReserve:false`、`excludeResetCreditDetails:true`；不消费重置额度、不购买积分，也不启动额外服务。只有后端明确返回 `ordinaryUsageAllowed:true`且额度账号摘要非空才允许实际`turn/start`。许可null、缺字段、false或未知额度账号均拒绝；已收到的稀疏额度更新使发送前快照失效，不能据旧百分比或重置时间恢复。账号摘要只是对实际后台标识的哈希，不把邮箱指纹和额度标识当作已证明的全套账户保管。

完成后重读同账号元数据及额度快照。正常耗尽允许记录after=false，不删除已完成结果；账号不一致、原响应丢失或缺少原件仍保持Unknown，不重发。独立读取从完整真实stdio恢复原请求、前后快照及顺序，不相信模型自报账户、许可、用量或费用。SDK模型回执只得到原业务建议与真实token用量，不得到账户快照。

普通许可是发送前的必要条件，不是提供方原子预留、并发账户预算或禁止后端回退收费的证明。其他会话可同时消耗额度，原回合也可能超限；这些情况必须保留原件和Unknown保管。`model_account_custody_proven`与`costs_reconciled`不会因此变为true。

`inspectCodexMethodLogin`可显式选择同一策略，只读账号／额度／同账号复查，不创建线程或模型回合。该瞬时状态不代替每次真正发送的许可检查，也不是生产安装或持续许可。

只读inspect可以返回未知额度账号供展示，不能用来发送。实际执行与独立stdio读取均要求非空且前后一致；两个null相等不构成同账号证明。独立评审指出该反例后，两条新增用例在修前均失败，修后进入整文件回归。

## 验证计划

先行失败分别覆盖不支持新请求策略、缺SDK策略保管、只读检查忽略额度字段；实现后复验实际stdio、同原请求重放、明确拒绝／未知、额度通知竞态、回合后耗尽、跨账号及重新封口的PUBLIC篡改。随后类型检查、本机零模型核对及必要的真实Luna模型交换；先核对实际普通许可，再发送已授权的模型请求。

本批后继续受保护的账户／Runtime安装、共享默认入口、额度预留和账单核验。完整Skill、Matt／Superpowers、异常恢复、真实Change到ReadyForDelivery和最终接入指南仍在S1目标中。

## 已完成验证

Node24.19.0、pnpm12.4.2，最终类型检查及编译CLI帮助通过。最终额度、原Codex方法、Agent模型三个整文件66项通过，0失败0跳过；包含同原请求重放、零发送拒绝、回合后耗尽、通知竞态、账号变化、重复响应、固定RPC参数和重新封口篡改。PUBLIC进程／账号夹具不证明真实模型或生产资格。报告在忽略目录`codex-quota-complete-final.json`；前一次61项通过报告仍保留，不重复累计。

独立读取还固定前后读的阶段：前读必须晚于线程／外部工具目录／新鲜同账号核对；后读必须晚于完成后的同账号核对。账号RPC的请求本身也必须发于对应阶段，不能靠旧请求的迟到响应充当新鲜核对；只允许`refreshToken:false`。两条额度重排和三条账号请求重排／刷新参数反例先行失败，修后通过；报告`codex-quota-order-red.json`、`codex-quota-account-order-red.json`均保留。静态独立评审复查后未发现新增必须修复项，没有把该复查当作完整Matt／Superpowers资格。

本机零模型核对为`2026-10-23T04:59:38.356Z`至`04:59:43.267Z`，明确ordinary许可为true且额度账号标识存在，credits为0。结果保留于`%LOCALAPPDATA%/CimiS1/codex-account-quota-2o3OSv/inspection-summary.json`；没有模型回合、原业务操作或认证令牌读取。没有从百分比推断许可，也没有据该快照自动启用生产Runtime。

## 真实Luna／Native结果

新测试项目保留于`%LOCALAPPDATA%/CimiS1/codex-native-9myPjl`，原Run为`01a16722-b4e1-7167-927b-356ed7f9e49f`。时间`2026-10-23T05:01:07.615Z`至`05:09:20.281Z`，真实Windows/x64／AppContainer整文件1项通过、0失败0跳过，报告`codex-quota-native.json`。

当前Codex登录和获批测试模型`gpt-6-luna`实际3轮；原输入token为48683／49667／50597，输出为198／80／389，reasoning均为0。三轮各有前后两份实际额度响应，普通许可均为true，额度账号摘要非空且前后一致。原件在最终独立读取代码下只读补验为Observed，没有新增模型请求、改写策略或重开旧Run。

真实SDK／IPC有6次交换，3项原业务调用全部关联，未关联及未解决均为0；Native独立复验Verified。两次原生读取`src/query.ts`、`src/check.mjs`和固定`query_test`实际通过，独立领域候选成立。默认认证工作台的原观测命令使事件序号25→26，同一请求重放仍为26、模型仍3轮。

测试的业务准备、提供方及账户资格仍为PUBLIC；`productionQualification:false`、`task_acceptance_proven:false`、`model_account_custody_proven:false`、`costs_reconciled:false`保持，Task的100微美元夹具预约继续持有。这不是正式默认Agent启动、真实Skill、真实普通Change到ReadyForDelivery或S1验收。旧512原件和失败原Run未升级、删除或重开。

## 最终回归与保留

消费者五个整文件122项通过、0失败0跳过：共享观测19、专用模型48、普通领域结果19、父领域结果31、父终态5。报告`codex-quota-consumers-final.json`。与核心66项及真实Native1项合计为分阶段9文件189项通过；没有运行全仓`pnpm test`，不重复累计早期报告或将静态评审算作测试。

三个历史实际项目在最终代码下纯只读补验，无新模型调用：`codex-native-OcryA3`仍为两轮Observed（弱早期测试，不作完整链路证据）；`codex-native-a5ReHI`仍为三轮Unknown，旧512策略下的原输出194／80／688保留；`codex-native-CsNxRQ`仍为三轮Observed且固定2048策略。三者均未补记新额度许可，报告`codex-quota-legacy-readonly.json`。其中a5ReHI的原上限为512，不能把688截断或重新认定为成功。

文档UTF-8、Markdown围栏／引用及`git diff --check`通过。本地提交不push，受保护的未知临时文件、旧Unknown资源和全部失败原件保持。下一批继续可信Codex账户与默认生产Runtime组合，不以本批快照代替持久预算、提供方账单、物理配额或完整资格。
