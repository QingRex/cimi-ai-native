# CimiLoop 原宿主首次启动账本与 Runtime 组合 v0.1

2026-10-09，D-237，V1-09 / V1-10 续批。承接[原启动授权与共享组合](CimiLoop-原Agent启动授权与共享组合-v0.1.md)，把独立原宿主首次启动证明接入 Context 准备、Kernel 当前启动核验、共享应用服务及实际 Windows Native / SDK / 固定检查路径。正式生产驱动与完整五组 S1 继续，默认 Agent 入口没有启用。

## 已接通的原启动路径

受信宿主显式建立全新的原登记根；读取已有登记根使用独立 open，缺失、半份、不可读或身份改变时拒绝，不能自动补建。Windows 工厂读取实际机器标识摘要和当前登录 SID 摘要，保护仅本次新建目录的 ACL。原机器、主体、绝对根路径摘要、目录 / SQLite 文件身份及随机账本 ID 都固定在原头部；复制到别处、换机器 / 登录或同路径新建另一账本不能接受旧票据。没有读取 API Key，也不把主体名称、机器原标识或脚本 stderr 放入上下文与报告。

Context 准备先调用独立完整宿主准入，再把固定 Task / WorkItem / 原定义、Contract / Plan、动作资源预算、停止条件、Source / Workspace 字节摘要和原引用、Runtime / Skill 绑定写成原票据。票据与原完整准入引用一起保存为既有 local_content / agent_host_admission；ReserveRun 复验同一票据。原票据不包含 Task 可变状态 / revision / usage，预约不会改变原输入。此包装使用现有 Schema，不创建另一套领域批准。

LocalAgentRuntimeStart 先核对原 Native 登记与本地 dispatch；只有二者明确缺失且原 Context 的账本票据仍可核验才考虑首次启动。已有独立账本 claim 而本地登记缺失，返回 Unknown，不重新准备或执行。Kernel 核对当前领域权威；共享服务还直接调用自己装配的 custody 完整核验，并与 Kernel 的 host_validation_digest 比对，不能靠另一个肯定回调绕过所装配宿主拒绝。

异步 staging 后重核当前资料；随后在独立账本事务中不可逆登记 Run 和 operation_key，唯一键保证只能一个调用取得首次启动 claim。再写原本地 materials / dispatch，最后重核并调用一次既有 Native claim-before-effect。崩溃、丢响应、半份 / 损坏登记及原 Native 效果不明，都保留原身份；claim 没有删除、释放或重试接口。claim 是“已经领取原启动权”的事实，不代表 Native 已启动或完成；接口仍不证明领域成功和费用结清。

## 账本、权限与固定检查组合

starts.sqlite 是独立宿主私有格式1，项目数据库仍为格式10。SQLite WAL / FULL 持久事务、原头部 / 票据 / claim 不可变触发器、精确 DDL、quick_check / 外键、记录数量 / 摘要及完整原 claim 关系在每次读取 / 写入时重核；完整性检查使用同一数据库快照，防止合法并发新票据 / claim 被误判为坏账本。结构或内容损坏拒绝而不修复。

Windows 每次重核保护根目录精确所有者、唯一当前 SID FullControl、禁止继承及对子文件继承标记；SQLite / WAL / SHM / journal 文件必须由该原主体拥有并仅继承原访问规则。权限漂移拒绝。仅同一受信宿主主体可管理此账本；它没有提供管理员抗篡改或旧备份原地回滚的独立外部证明。不得据此宣称完整跨启动 / 登录恢复或任意备份接续已经验收，原登记仍须保留和独立核对。

固定检查组合显式经过 LocalAgentStartCustody 原票据核验后，解包给 LocalAgentCheckAdmission 复验原完整准入、模板 / Node / 策略 / workspace 字节。工具准入与原 Context / Scope 仍使用外层固定引用，原检查 catalog 仍绑定实际 Run。installChecks 对检查准入和启动准入两种包装均拒绝手工替代；installAdmittedChecks 显式接受原 custody，并在执行和读取目录时重新核对。真实检查不能由模型声明成功，也不能因新增包装放宽固定 harness。

宿主数据库上限为1024原票据 / 4096原 claim，初始化 SQLite 页上限16384页，原记录65536字节上限。它们是本子系统限制，不能代表整个 Runtime 的物理硬配额、总 WAL / 历史容量或生产账户限额；这些完整组合仍待实施。

## 实际验证与证据范围

最终固定源码受影响回归为9文件 / 65项：63通过、2失败、0跳过；316个源码 / 测试 / 配置摘要零变化。实际 Windows/AppContainer、原 SDK、固定 Node 检查、原启动账本与当前 Kernel 权限按文件分别记录；pnpm check、CLI帮助、242 Schema / 项目库10及16文档UTF-8 / 链接 / 围栏和diff检查通过。仅本批受影响范围，不是全仓库或完整S1。本批失败必须按原报告核对，不得据通过项声明整个批次或Native稳定性通过。首次失败和实际各文件结果另见[本机研究记录](../research/CimiLoop-原宿主首次启动账本与Runtime组合-2026-10-09.json)。

首次最终回归的两项生命周期失败分别为首次启动当前授权拒绝、PrepareRunContext宿主准入不可核验，未完成预定Native效果断言；本机原IPC9项通过，不能据此解释D-236历史失败。对仅失败文件同源复验为4项中3通过、1失败、0跳过：共享唯一启动 / Native / SDK采集组合通过，但Human工作台在原SDK等待期间查询返回Unknown / resources_disposed false，预期Running，仍不通过。三份本批失败夹具保留。后续只读事实查询第一份旧失败Run得到ALLOW，第二份没有预约Run；这不是原失败时点的证明，未重开原Run，根因未定。首次结果、复验和后续查询分开留证，不声明整个生命周期稳定。

18项初次相关回归通过：真实 Kernel / SQLite 合同使用构造宿主完整资格；Windows 场景使用本机实际机器、登录主体、ACL、另两个宿主进程以及同原 Run 的唯一 claim。反例分别证实缺独立 custody、结构触发器被删除、另一个肯定 Kernel 回调、已打开账本的文件 ACL 漂移所造成的缺口，再修复后通过。模块缺失和测试解析错误是诊断，不算行为验收；初次 Context 夹具误把宿主目录放进源码树且超出WorkItem允许路径而失败，移到本次 .git 数据目录后核验，原失败未覆盖。

真实 Native / AppContainer / SDK / Node 检查只证明实际原效果与组合，测试的 Provider 资格、模型回复及完整账户仍是构造。独立工程子代理复核不算 Matt 方法评审或 Superpowers 的真实调用。智谱具体模型、套餐、现金 / 积分上限未确认，真实凭据读取、外部模型、付费请求均为0。

## 继续实施与操作约束

V1-09 仍须完整生产驱动、当前模型 / 账户 / 费用上限与账单、正式终态领域结果、物理配额 / 历史容量、原时钟与完整异常恢复，及已知 Native 启动不稳定的根因核验。V1-21 继续真实 Skill 和 Plan / Task 前 Human / Matt 澄清；V1-22 继续完整独立 Matt、当前源码 Superpowers 新鲜验证和真实行为对照；V1-10 继续正式工作台启动与原执行接续；V1-11 继续真实普通 Change 到 ReadyForDelivery、真实技能 / 中断恢复 / S1 和接入指南。

正式宿主组合先准备外部安全连接和经批准的完整资格 / 账户端口，再组合固定检查与启动 custody，最后安装共享 Runtime driver；Human / 模型 / JSON 不能安装这些受信端口。本批没有新建真实用户项目登记根、修改原用户权限、读取凭据或升级用户库。新电脑缺少旧原账本或进程资料时只保留 Unknown，不清除旧 Temp / 映射 / Profile。两个来源未确认的仓库根 tmp 文件保留，不加入本批。完整持续目标保持 active；只本地提交、不 push。