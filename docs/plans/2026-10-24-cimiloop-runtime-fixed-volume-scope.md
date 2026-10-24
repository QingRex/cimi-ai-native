# 正式Codex Runtime的固定卷接线

基线1bf7ef5，S1五组及Schema242／项目库10／Host1保持。固定卷已能独立核验，但默认Runtime没有消费该能力。本批将新验收项目的仓库及完整运行数据目录固定到同一原专用卷，原state／TEMP／工具工作区随原数据根定位；不迁移用户库或改变历史操作路径。

采用现有`FixedVolumeQuota`的真实原生reader及同一受保护Host1保存独立运行范围票，固定项目、原卷票及目录位置。运行范围能力只能从真实quota和原Host票生成；JSON证明不能创建能力，读取不能补票。默认Codex组合必须获得该能力，首次准备、模型检查及Native副作用前均重核原卷和同一数据根。旧低层受控演练保持其原测试含义，不能获得新物理资格。

提供显式CLI安装和只读查询，安装先核对两个项目路径位于指定卷，再核验原镜像及固定卷。不读取登录文件、不调用模型、不创建或格式化卷。已有安装／运行范围丢件时拒绝且不修复；Host1现有容量与不可变约束继续适用。

先用PUBLIC OS投影及真实SQLite红测范围固定、同卷约束、不可伪造、原票重开和卷变化撤销，再接实际默认应用路径及CLI反例。最后执行相关整文件、check、编译CLI及独立静态复核并本地提交。PUBLIC投影不计为真实固定卷或S1通过。

本机已实际核对：非管理员、`%ProgramData%/CimiLoopPhysicalQuota`不存在、未配置`CIMILOOP_FIXED_VOLUME_PREPARED`。实际管理员准备、满盘及Native正向路径仍缺条件；现有指南中的新卷准备步骤继续适用。本批不会把`runtime_scope_proven:false`改成完整验收结论。

## 实现与边界

`FixedVolumeQuota.bindRuntime/openRuntime`使用同一Host1的`fixed_volume_runtime`票固定项目ID、仓库根、数据根及原卷票。新能力由模块私有token／WeakMap和真实quota品牌创建；JSON、Object.create、借用方法及无关Host票不能生成它。正式组合另外核对运行票的Host身份等于原Codex安装Host，使用原捕获路径核验函数和私有`#proof`读取实际卷；公开方法被替换不能把已变化的卷改报为通过。两个目录必须在原卷，不能把系统盘目录当作固定卷路径。

默认生产工厂读取既有账户后，再只读打开原storage关联；两个await后均重核租约／账户。`LocalAgentRuntimeComposition.openCodex`缺能力即拒绝，guard贯穿准备、模型准入、实际发送及Native副作用；拒绝前不创建模型header或预约调用。已有受控普通／父Skill测试明确使用PUBLIC存储权威缝隙，其通过不能当作真实存储或Provider资格。

安装入口为`runtime install-codex-storage`，查询为`runtime codex-storage`。安装要求项目仓库及数据根均已在指定卷，先检查位置，再打开原受保护Codex安装并读取OS卷。它不创建／挂载／格式化磁盘、不搬迁库、不读登录文件或调用模型。程序、quota与运行范围通过后才保存最终关联；各政策、容量和Schema保持原格式。

只读构建查询现在直接读取原recipe及原物理二进制，不建目录、登记或调用编译器。独立复核还发现部分安装漏洞：卷／运行票已写但最终关联未写时，helper丢失可能被重新编译。已补编译前独立Host1 intent，固定输入、scope与helper目录物理身份；首次成功后再由独立ready票固定原retained二进制完整proof。重试只读取原helper，缺intent／ready／目录或同字节替换均拒绝，不能补ready或借新helper完成旧关联。首次编译失败和未封口状态保留Unknown，不删除任何原件。

实际写入位置选择沿用原Native配置：sandbox/state、TEMP、检查和工具工作区位于原数据根，因此无需改写旧config或历史Run路径。这只接通Native项目写入的物理位置及执行守卫；完整可写路径再验、外部Codex宿主状态／账户历史容量、费用和全部恢复仍需实际证据，`runtime_scope_proven:false`保留，Kernel controlled_execution仍不据此ALLOW。

## 实际验证

Node v24.22.1、pnpm12.4.2。分阶段按实际完成的JSON报告计七个整文件70项通过、0失败、0跳过；没有重复累计同一文件的早期结果。

| 整文件 | 通过数 | 范围 |
| --- | ---: | --- |
| runtime-adapter/fixed-volume-policy | 18 | 真实SQLite／Host票，PUBLIC OS投影；范围固定、不可伪造、公开方法替换、部分安装及ready残存拒绝 |
| runtime-adapter/fixed-volume-quota | 5 | 实际C#编译／只读重开／缺程序拒绝／原生负向，无真实VHD正向 |
| runtime-adapter/agent-sandbox-build-originals | 11 | 原物理程序／构建容量／原件丢失及同字节替换 |
| local-app/agent-codex-storage | 7 | 真实项目库／原票、缺失与部分登记状态、off-volume拒绝，无真实模型／卷 |
| local-app/agent-parent-skill-composition | 9 | 共享Kernel／检查／模型准备；PUBLIC存储权威和Native启动缝隙，含卷撤销前不启动 |
| local-app/agent-runtime-admission-local | 15 | 默认工厂／租约／账户与storage等待后重核；PUBLIC完整宿主与存储权威 |
| cli/codex-runtime-installation | 5 | 编译CLI入口、显式安装参数／确认和只读缺失查询 |

最终四文件35项报告为本机`.cimiloop/codex-2026-10-22/runtime-volume-final-four.json`；原构建／组合完整结果在`runtime-volume-scope-focused.json`，默认准入最终15项在`runtime-volume-default-final.json`。第一次指定准入测试路径有误，runner实际只执行六文件49项，未将缺失路径算作通过；随后按真实文件路径完整复验。准入夹具第一次没有提供新增存储能力，整文件13通过／1失败；补明确PUBLIC存储缝隙后，包含新增await撤销反例的15项全部通过，没有在产品代码加入测试绕过。

修复前红测均保留：范围API缺失2失败、只读打开会创建helper 1失败、默认组合未要求存储1失败、新CLI入口2失败、公开方法替换1失败、部分安装丢helper会重建1失败、ready残存会先编译1失败、pending查询误报missing 1失败。独立工程复核的两项P2均由反例复现并修复，最后静态复核无新增必修；并非完整Matt／Superpowers评审。

`pnpm check`及编译新CLI帮助通过。实际既有Codex安装项目`%LOCALAPPDATA%/CimiS1/codex-installed-hvdQ4C/project`执行编译`runtime codex-storage`和共享读取，均为missing；前后Kernel事件、模型原件目录、五类Host票和helper目录状态完全一致，新增均为0。报告`runtime-volume-actual-missing-final.json`保存最终源码／构建SHA256及实测状态，未启动模型、Native Runtime或创建卷。

没有全仓测试、本批真实模型调用、真实固定卷正向／满盘／完整Native验收。前批完整SDK仍有Bun早期启动失败，未在此将其改报为通过。V1-09完整资格／预算账单／全部恢复、V1-21完整真实Human/Matt行为、V1-22最终源码完整评审与Superpowers、V1-10默认正式Agent及V1-11普通Change到ReadyForDelivery仍待完成；五组目标不变。
