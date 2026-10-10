# CimiLoop 原账户账单与余额核验 v0.1

2026-10-10 D-261：原Native终态、独立SDK／领域结果、原IPC／模型调用和认证账单已接入共享Human ReconcileRun、同一编译CLI与工作台原请求恢复。受控组合验证原Run成功／失败、现金12及剩余预算结清，保留启动次数且不自动满足Task；真实Windows已知账单但缺Native原件时拒绝结清，88继续冻结。受控Native／SDK及公开批准／账单不是实际智谱、真实Skill／Matt／Superpowers或S1证据，完整Native故障与四项账户确认仍未解决。默认正式Agent关闭，库10／242 Schema及完整五组目标保持。 [实施记录](CimiLoop-原执行终态与账单核对-v0.1.md)。

2026-10-10 D-260：原模型请求、账户占用和认证账单已逐笔接入共享Human费用观测、Kernel独立再核验、同一编译CLI及工作台原命令恢复。实际Kernel现金记入12、剩余88继续冻结；Run仍Unknown，不满足Task或ReconcileRun结清。真实Windows原账单保管漂移拒绝新观测，已提交回执仍按原命令重放。测试模型／批准／账单认证为公开构造，非真实智谱或SDK完整终态、Skill／Matt／Superpowers／S1证据；专用Native/Bun故障和四项账户确认继续。默认正式Agent关闭，项目库10／242 Schema保持，完整五组持续。 [实施记录](CimiLoop-原账单费用Kernel接通-v0.1.md)。

2026-10-10 D-259：原Run费用查询已接共享Human服务、受信代码安装的同一编译CLI命令、回环HTTP及工作台按钮。工厂与释放等待后复核原资料，错误只返固定公开码；页面拒绝旧查询／旧页面迟到结果。实际Windows原账户／账单保管→共享服务→HTTP查询与权限漂移Unknown通过，不启动模型、不产生领域结果或Kernel结算。普通CLI／工作台仍需真实原账户工厂，默认正式Agent关闭。上批专用Native／Bun段错误仍未解决；构造账单认证不是实际智谱／Skill／方法／S1证据。项目库10／242 Schema保持，完整五组持续。 [实施记录](CimiLoop-原Run费用共享入口-v0.1.md)。

2026-10-10 D-258：原账单字节经受信端口核验后追加到账户意图／Host／独立账单库，完整三方历史核对、现金积分实际费用与未决占用计算、超额冻结和同原件重放已实现。共享 Human 原 Run 费用查询复用 Kernel 读取权限，取消后可读，不产生正式结算。仅新账单账户使用私有账户格式2，旧账户格式1拒绝原位升级；项目库10／242 Schema／原启动账本1保持。实际 Windows账单保管／并发回归通过；完整Native三轮均2通过1失败，末两轮专用组合Bun段错误，尚未接通Native四轮→账单→Human查询，不能算组合通过。构造模型、账单认证及批准不是实际智谱／Skill／S1证据。正式默认Agent关闭，完整五组持续。

## 实际可用能力

代码安装的 DedicatedAgentAccountLedger.observeBill 接收原账单字节，独立同步 DedicatedAgentBillVerification 认证每份原件及其历史批准／套餐／资费与币种、积分单位、请求归属和最终费用；没有核验器即拒绝。此端口没有提供方默认实现，导入JSON、usage、截图和运行成功不能替代认证。现有模型请求使用同一账户reserve路径，新的额度实际由已核定费用加未决原上限决定，跨Run／进程共享。

readRunCosts 保留固定Scope和原请求匹配；LocalAgentAccountBilling 为CLI／工作台受信组合提供共享只读服务，核对原Human项目入口并查询Kernel原Run对象（getObject本身不做调用者／角色授权），取消后仍可读历史费用。JSON不能指定账户根、端口或调用者。此批未新增HTTP／CLI账单路由；代码组合可直接使用该服务。账单查询不发送模型、不重开Run、不产生RunObservation；kernel_costs_reconciled固定false，Task预算及Unknown状态不会被查询改变。

## 显式兼容与不可变历史

新建账单账户：AccountOrigin body2 显式 account_database_version:2，固定仓库外账户根、目录／主库物理身份与独立 billing.sqlite 身份、完整政策、核验器身份、现金币种和积分单位；原身份在Host与账户库共同固定。私有账户 application_id=0x434d4131／SQLite2增加immutable account_bills意图；独立账单 application_id=0x434d4231／SQLite1固定billing_origin及immutable bills。旧body1／SQLite1保持原Schema及未决全上限，没有原位升级／账单安装，重开不能回填。项目库10、242公开Schema及原启动账本1保持，无自动迁移用户库。

仅双向账单库／Host核对不足：自洽删除两边同笔90费用而保留30上限，会错误恢复剩余预算。本批红例复现后增加不属于这两组账单行的账户原意图。父账户BEGIN IMMEDIATE先写原意图，Host提交→账单库提交→父账户最后提交；所有read／reserve／replay完整核对三方数量、身份、原字节、投影和唯一请求。Host已提交后响应丢失，父意图回滚／bill缺行会持续拒绝，不能用重放补写。两方同删、任一方单删、物理原库丢失／复制、核验器撤销或变更均拒绝。管理员损毁所有安全原件后不能宣称证明已恢复。

每份1–64项、原字节最多16KiB、完整原记录60,000字节，保留Host1024票据共享及每票64KiB边界。每项匹配原request_id、scope_digest、call_id、请求摘要及占用摘要；同请求只一份最终账单，重复/变更拒绝。多项整体一次入账；相同原字节与投影重放不新增票据／费用，原占用永不改写。预算用BigInt累加；1023请求、单项最多1e12使返回Number在安全整数界内。真实超原单次上限／总额费用完整保存，冻结现金及积分新请求，不截断、退款或批准额外预算。零占用不证明零费用。

Windows Native保管原starts／account规则，新增billing主库／WAL／SHM／journal文件新鲜ACL核验；文件须继承当前账户根唯一current-user规则且物理身份一致。页数／逻辑记录界限不证明物理磁盘或WAL硬配额。所有账户读取也取得同一父writer边界：WAL旧读快照不能与提前提交的Host／bill新原件混合。新鲜审计结果仅在本次同步事务内复用，异步准入前后各取新事务，最终reserve原占用重放／verifyHold仍独立核超额，纯历史读取继续可用。

## 验证与边界

- d258-affected-final.json：18文件203通过，0失败、0跳过。
- d258-account-custody-final.json：6文件41通过，0失败、0跳过。
- d258-native-final.json：1文件2通过，1失败、0跳过。

pnpm check、CLI帮助、Schema242语义无漂移、UTF-8／链接／围栏及git diff --check完成；639源码前后摘要一致。实际Windows测试包含billing主库／WAL／SHM ACL漂移、原账户旧ACL、不同子进程同账单重放与不同账单重叠仅一笔生效。完整Native三项实际执行、0跳过，通用SDK读／固定检查及Human撤权不Resume通过，专用HTTPS读改检查／账单组合失败。当前专用夹具保留一个原占用／锚点，零提供方fixture请求、零账单／意图／summary，不证明四轮读改检查或现金48已结算。源码中四轮之后构造账单／Human查询的组合断言尚未执行通过；独立账户及共享Human单元验证仍分别有效，不能替代组合。Kernel没有因此被结清。

红例／中间失败报告均保留：缺方法6失败；初实现JSON null-prototype比较；打开后policy键序；共享Human测试未使用原请求封装；双方同步丢账独立红例1失败；实际两进程混合旧parent快照误报历史缺失，确定性SQLite连接红例；先期准入后超额与最终writer cut超额的红例。首轮6文件37项34通过3失败（两个快照竞态、一个测试harness15秒），原首轮受影响18文件201通过因中途源码改变仍只作中间证据。首轮Native三项2通过1失败：四个原占用／锚点保留，仅三次提供方fixture请求完成，未生成bill意图／bill行／构造账单summary，费用未决，不能退款或算账单成功。第二轮独占完整Native仍三项2通过1失败：原stderr为Bun 1.3.14段错误、exit3，提供方fixture零请求，保留一个原占用／锚点，零bill意图／行／summary。原日志栈出现CcLHShield64.dll，但其出现不能证明故障原因；RSS0.70GB／commit0.92GB也不能证明2GiB JobObject限额触发。未更换运行时二进制、关闭安全软件或重开失败Run。第三轮用新原Run完整复验，仍2通过1失败：专用原stderr再次Bun段错误／exit3，零提供方fixture请求、一个原占用／锚点、零bill意图／行／summary；RSS0.71GB／commit0.90GB、相同DLL栈出现，仍不确定根因。未延长600秒原Task期限，未重开原Run或释放占用；停止相同重跑，作为尚未解决的生产组合故障保留。核验脚本读取大Schema曾受child_process默认stdout上限截断，增加脚本缓冲后重新执行；不是Schema或生产功能失败。定向TDD红例的非目标单元会被筛选，最终各完整回归均为0跳过；账单／受影响回归通过，完整Native仍1失败，未宣称全部必需检查通过。未执行全仓库或完整S1验收。

## 接入与复验操作

先核对当前电脑Node >=24.15 <25、pnpm12.4.2及锁文件安装；Windows x64原生能力不能跳过算通过。按顺序运行下列命令，不并行挤占生产Task夹具期限。测试只使用公开构造模型／账单认证，不读取真实Key、不发付费请求；完整Runtime使用独立新Run与固定原Task，原失败根和账本保留。

```powershell
pnpm check
pnpm exec vitest run packages/runtime-adapter/test/agent-account-bills.test.ts packages/runtime-adapter/test/agent-dedicated-account.test.ts packages/local-app/test/agent-account-billing-local.test.ts --maxWorkers=1 --testTimeout=120000
pnpm exec vitest run tests/scenarios/agent-account-bills-custody.test.ts tests/scenarios/agent-dedicated-account-custody.test.ts tests/scenarios/agent-start-custody-runtime.test.ts --maxWorkers=1 --testTimeout=120000
pnpm exec vitest run tests/scenarios/agent-production-lifetime-runtime.test.ts --maxWorkers=1
pnpm cimiloop --help
```

真实接入须先得到模型／套餐／现金和积分预算确认，再用现有仓库外安全连接；代码安装真实账单认证端口，其basis包含原固定policy与所有原占用，必须进一步独立对应SDK原请求与提供方账单身份。不得把此文中的构造核验器接成生产默认。新建账单根后丢库或核验器失效必须停在Unknown，不复制根／补历史。费用共享查询可观察原证据，正式Kernel费用结算仍须后续完整适配，不从CLI手工JSON伪造结清。

真实智谱账单认证端口与实际提供方请求ID／SDK原身份独立映射、模型／账户／套餐／费率资格、Kernel费用正式ReconcileRun、物理硬配额和完整恢复仍待完成。只有智谱提供方确认，具体模型、套餐、现金／积分上限待用户确认，确认前付费请求0、真实Key读取0。构造认证不能作为真实账单、Skill、Matt、Superpowers、ReadyForDelivery或S1验收；默认正式Agent关闭。五组V1-09／21／22／10／11全部保留，持续目标active。本批本地提交、不push，不清旧电脑Unknown／历史Temp、映射或Profile。

证据：[研究记录](../research/CimiLoop-原账户账单与余额核验-2026-10-10.json)；[实施设计](../plans/2026-10-10-cimiloop-原账户账单与余额实施设计.md)；[跨电脑接续](../plans/2026-10-09-cimiloop-S1跨电脑接续.md)。
