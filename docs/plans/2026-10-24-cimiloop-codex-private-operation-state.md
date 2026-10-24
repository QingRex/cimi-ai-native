# 正式Codex传输的原操作私有状态

基线dbdae50，继续完整S1五组。当前`openCodex`虽要求固定卷，却仍把模型传输原件放到系统盘安装根；Codex继承系统TEMP，SQLite／日志和会话也未固定。本批直接改正式组合与实际子进程，不新增资格探针代替执行。

1. 先用真实stdio夹具复现缺失策略：每原操作SQLite／日志／TEMP/TMP与ephemeral会话；响应误报持久化、取消、丢件、降级及历史兼容。正式默认组合测试要求原传输根位于原项目数据根。
2. 新私有传输start8固定`private_operation_state/1.0.0`、原操作内SQLite／log／temp路径及ephemeral线程。原件读取仅验证，不能创建这些目录或重发。历史start1—7保留原义；新Codex Agent header14明确标记该策略，旧header不追加能力。
3. 正式`openCodex`在已验证固定卷的数据范围创建原传输根，选择新策略；原登录方式不变，不读取／复制auth.json或令牌。每个真实效果继续走现有Kernel／账户／存储守卫。
4. 跑受影响整文件、check、默认组合，独立工程复核后更新接入指南／清单并本地提交，不push。

选择逐原操作私有状态而不是修改用户全局配置；不改变当前登录根，不迁移旧操作。`CODEX_HOME`依然可能承担其他写入，单靠本策略不能证明全部Runtime写路径、网络额度、账单或完整S1。管理员新卷正向验证与真实账单仍需继续，不能将`runtime_scope_proven`改为true。

官方依据：[环境变量](https://learn.chatgpt.com/docs/config-file/environment-variables)明确CODEX_HOME包含登录与多类状态、sqlite_home优先于CODEX_SQLITE_HOME；[App Server](https://learn.chatgpt.com/docs/app-server)的线程协议提供ephemeral状态。实现按实际原请求／响应核对，不把文档声称当成本机完整验收。

## 实现及兼容

新传输必须仍有明确普通额度许可；原start8固定state策略及精确启动config，实际thread/start请求携带ephemeral，响应未确认时在模型turn/start前拒绝。独立原始帧读取再次核对同一请求／响应，并继续核对原额度账号及前后账户。SQLite、日志和TEMP/TMP位于原模型操作的state下；环境中原TEMP/TMP不以大小写别名残留，当前登录环境不变。可信回调后、每次实际发送及封口前重新核对三份目录物理身份，目录替换拒绝；查询和已封口重放不要求重建已归档的state目录。

header14只在完整普通输出／额度账号政策和新state策略下创建，通过显式映射继承普通／父Skill header8协议；不能误入named9—13的工具或结果协议。旧header带新state字段拒绝，原start1—7按原配置重读。当前named子方法仍使用原header13／传输政策，不借本批追加能力。Schema242、项目库10、Host1不变。

正式`LocalAgentRuntimeComposition.openCodex`在同一固定卷守卫内选择`dataDirectory/codex-runtime-originals/<project>/<run>`和新策略。原Codex安装仍只提供固定二进制和账户，不能把登录、配额政策或PUBLIC完整宿主当作Provider资格。默认工厂接线用实际Kernel、SQLite和Host1验证，完整宿主与存储证明仍为明确PUBLIC夹具。

## 验证

实际Node24.22.1／pnpm12.4.2。首次新增反例报告`codex-private-state-red.json`为6失败、1通过、14未执行，复现状态未固定、持久化线程未拒绝、策略可增删及默认根未进入数据范围；并行回归未执行的14项不计通过。启动回调目录替换另有反例先1失败、7未执行，修复后拒绝。初次新桥接测试误把Host.execute返回包装当作原响应，类型检查及测试均指出该错误；已修正为读取receipt，并单独断言原响应重放。

最终六整文件单轮`codex-private-state-final.json`：144通过、0失败0跳过，252.80秒，`--maxWorkers=2`。

| 整文件 | 通过 | 范围 |
| --- | ---: | --- |
| runtime-adapter／codex-runtime-state | 10 | 实际stdio、状态启动参数、ephemeral拒绝、目录替换、取消／丢件／兼容与独立重读 |
| runtime-adapter／agent-codex-model | 45 | 原SDK模型、header14普通协议及旧named协议，PUBLIC模型／账户 |
| runtime-adapter／codex-original-method | 26 | 原方法stdio、取消、重复请求、异常回复、身份与历史政策 |
| runtime-adapter／codex-ordinary-quota | 42 | 额度普通许可、原Host1、降级／丢件／物理身份与重放 |
| runtime-adapter／codex-login-inspection | 6 | PUBLIC登录元数据及超时，不读取真实登录 |
| local-app／agent-runtime-admission-local | 15 | 共享Kernel／检查／Host1及默认工厂，新根路径、释放与等待后守卫；完整资格为夹具 |

最终`pnpm check`通过。独立工程静态复查无新增必修，未独立跑模型或测试；这不是完整Matt或Superpowers验收。真实Luna／Native场景的终态另记，不能以本表替代。没有全仓`pnpm test`或完整S1验收。

共享传输还被固定Matt方法与事实调查消费，因此补跑两个既有消费者整文件：`codex-fixed-method`11项、`codex-fact-investigation`7项，共18通过、0失败0跳过，报告`codex-private-state-method-consumers.json`。这是受控方法接口回归，不是真实Matt执行；与上表分开，受影响范围分阶段合计8文件162项。

## 本批真实Luna／Native执行

在新建且已核对ACL的本机短根，用现有仓库外非秘密二进制／模型配置及已授权Codex登录，执行`tests/scenarios/agent-codex-native-runtime.test.ts --maxWorkers=1`。仅执行这一次新场景，不重开旧Run：1文件1项通过、0失败0跳过，测试442.01秒、总耗时461.68秒。报告`codex-private-state-native.json`，保留根`D:/CimiS1/sdk-private-dd2dbb69/codex-native-4Z7Zje`，原Run为`01a16c72-1e96-727e-a77b-535362230f53`。

实际gpt-6-luna三轮均封口为reply_recorded，原start8状态政策／路径及服务器ephemeral回执由独立reader核对。三个原操作SQLite目录分别可见15／15／16项文件；结束时log／temp为空，此事实不证明其外不存在其他写入。没有读取或复制登录令牌。

实际Windows/AppContainer与Native原效果Verified、SDK／IPC关联Observed、原读取和固定`query_test`检查及领域结果独立核验通过。原Run重放新增模型回合0；默认认证工作台记录未知费用观测并重放同一请求，新增重复业务事件0，保留原预算与Task待核对。`codex-private-state-native-summary.json`绑定三份运行源码／编译产物和场景源码SHA256。

场景通过低层共享组合运行；Provider资格、账户业务准入与初始领域数据仍为PUBLIC夹具，不是正式默认完整宿主验收，未执行真实Skill或普通Change交付。其`productionQualification:false`、`runtime_scope_proven:false`、`costsReconciled:false`保持。真实本机路径只用于定位本次原件；换电脑不能照搬或据缺失判定历史资源已清理。旧Bun/LHShield故障和其他Unknown没有由本次通过得到根因修复证明。

CLI帮助、三份文档UTF-8／围栏／44个本地链接及`git diff --check`通过。以上为分开的六文件144项、两文件18项与一文件真实原生1项，不能称作一次全仓或完整S1验收。

本机仍为非管理员，`%ProgramData%/CimiLoopPhysicalQuota`不存在，也没有`CIMILOOP_FIXED_VOLUME_PREPARED`，专用卷正向／ENOSPC未运行，不计通过。当前登录CODEX_HOME中的其他写入、全部Runtime写路径、认证费用账单、默认完整宿主、真实Skill资格和普通Change到ReadyForDelivery仍待完成；保留历史Unknown及原预算。
