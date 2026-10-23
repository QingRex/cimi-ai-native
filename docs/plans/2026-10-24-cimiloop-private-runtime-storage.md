# 正式Runtime私有写入边界

基线17c400e。完整S1五组、Schema242／项目库10／Host1保持。上一批已接通Human准备／预约，但不具备正式完整宿主；本批继续实现物理配额的实际消费前提，不把卷根或环境变量当完整写路径证明。

当前Agent Native将TEMP／TMP／USERPROFILE／AppData重定向至私有state，但新建AppContainer的OS Profile仍可通过GetAppContainerFolderPath定位。先用原生子进程验证该目录实际写权限，然后对前瞻的新配置14／15／16启用private_state_only/1.0.0：仅处理本次新建Profile树，移除Package／Capability写授权，固定本次Package SID为读／执行，并设置OWNER RIGHTS只读权限以抑制隐式WRITE_DAC；保留宿主用户、System及管理员权限。私有state继续按既有授权可写。ACL必须在子进程创建之前设置并重读；拒绝重解析点并限制遍历数量，异常即拒绝启动。旧1—13配置不追加策略、不重解释、不更改历史原件；新配置／原输入标记严格匹配。

真实Windows canary使用本次新建Profile、实际AppContainer token，要求Profile根及子目录创建均被拒绝，私有state读写成立；失败保留自有证据。不读取登录文件、不调用模型、不处理旧Profile／Temp／映射。受影响编译、原件读取／恢复、Native场景及类型检查须复验；局部独立审查后提交，不推送。

本策略本身不证明专用固定VHD已安装、全部宿主／模型写路径已接物理卷、注册表写入有界、费用结清、真实Skill资格或S1完成。随后继续完整储存布局、正式默认宿主、账户与完整异常恢复，五组验收边界不变。

依据：[微软AppContainer启动说明](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)、[GetAppContainerFolderPath](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-getappcontainerfolderpath)、[OWNER RIGHTS SID语义](https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/understand-security-identifiers)。

## 已实现及原件兼容

生产Agent控制器编译原件新增`AgentProfileStorage.cs`，其源码与二进制继续纳入原构建配方／物理身份。普通、父Skill和命名方法的新前瞻配置分别为14／15／16，同一不可变claim输入保留`writable_storage_profile`；配置和输入必须严格一致。编译后的C#解析器、Node消费者、采集与恢复共用这一版本含义。旧1—13原件和原二进制保持旧含义，缺件不重编译、不补写策略。既有命名方法配置13的只读补验继续保留13，新方法执行才固定16。项目Schema242／库10／Host1未变。

Windows实际canary调用本次生产保护组件，使用真实AppContainer token，覆盖根目录写入、新目录创建、既有根文件与嵌套文件写入、删除及真正增加FullControl规则的DACL修改；全部要求拒绝，并同时验证私有TEMP/state读写。不能用把未修改的ACL对象写回代替实际改权限检查。

## 验证记录

Node24.22.1／pnpm12.4.2。最终受影响八个整文件108项通过、0失败、0跳过：`agent-model-output`、`agent-job-policy`、`agent-parent-operation-recovery`、`agent-parent-skill-native-config`、`agent-named-method-output-policy`、`agent-runtime-operation`、`agent-sandbox-build-originals`及`agent-private-profile-storage`。报告保留于`.cimiloop/codex-2026-10-22/private-profile-focused-final.json`。包含实际Windows/Profile token与ACL效果、编译C#契约、原控制器身份／构建容量／缺件不重建和恢复反例；不是全仓测试或真实模型验收。

实现前有效原生红测保留于`private-profile-native-red3.json`及自有目录`C:/Users/hector.he/AppData/Local/CimiS1/profile-dkSqSn`：真实AppContainer能够写入OS Profile，私有state也可写。早期测试准备错误、普通deny ACE尝试及未改ACL的无效反例均不计最终通过。

SDK整文件首次运行的四项均在Host目录保护阶段失败，未进入Agent：新D盘测试父目录只有用户组修改权限，Host辅助器显式设置owner时得到UnauthorizedAccessException。独立诊断在新自有D盘目录重现，在新自有LocalAppData目录成功。没有放宽Host校验或修复失败原件；随后仅为新建、已核对属主的短测试父目录设置当前用户独占FullControl继承，再使用全新夹具验证。首次报告`private-profile-sdk-final.json`不能算通过，失败原件保留。

独占测试父目录上的第一次整文件为3通过／1失败／0跳过；新配置用例的受控模型缺少已有输出策略要求的Codex原件类型声明，在Native启动前被拒绝（`agent_model_output_policy_unproven`）。测试夹具补齐PUBLIC声明，采集仍必须明确保留真实Codex原件缺失为Unknown／真实模型回合null，不能因此获得模型或账户资格。此夹具不调用真实模型；该事实不能让缺少原件的历史消费者把unknown改成0。取消场景同时改为覆盖新配置；此处不修改生产输出策略或扩大准入。报告`private-profile-sdk-owned-root.json`保留，不计最终整文件通过。

补齐夹具后的整文件仍为3通过／1失败／0跳过，报告`private-profile-sdk-complete.json`：旧配置正常、新配置取消和缺端口拒绝通过；新配置正常执行在模型请求前，Bun1.3.14启动37ms发生Segmentation fault，堆栈含LHShield64.dll，控制器退出3且自有资源清理成功。原目录`D:/CimiS1/sdk-private-dd2dbb69/cimiloop-host-model-runtime-syRTJi`、stdout／stderr及清理原件保留，未重开其Run或放宽限制。新建A/B夹具`profile-bun-ab-VOvZhT`中，同一固定Runtime二进制、无网络、JIT0，在未保护／保护的新Profile上各运行一次`--version`均退出0；新配置取消场景也已实际执行到模型等待。这些证据尚不能将单次启动崩溃归因为ACL或LHShield，不能当作修复或完整SDK通过。仅再对新测试操作执行整文件回归，旧失败状态不改写。

诊断后整文件`private-profile-sdk-after-bun-diagnostic.json`为2通过／2失败／0跳过。新配置正常执行已完成三轮受控SDK、Native读取／固定检查并正常清理（`cimiloop-host-model-runtime-0orVex`），随后失败在新增测试错误地把缺失Codex原件的`real_model_turns`断言为0；生产消费者实际保留null是正确行为，已修正该测试。新配置取消场景在另一次启动36ms发生同类Bun段错误（`cimiloop-host-model-runtime-KqqeUP`），保留原失败及清理证据。独立只读复查未能确认Profile／启动环境源码根因；短路径A/B或后续通过均不能证明此稳定性问题已解决。

修正null后的整文件`private-profile-sdk-null-preserved.json`为1通过／3失败／0跳过。旧配置8的`ZztBti`和新配置14取消的`jLYo1O`均在启动时发生同类Bun／LHShield堆栈，已确认问题不限于新Profile策略；尚未证明具体根因。新配置14的`95MZzg`正常执行三轮SDK、读取／检查、原Run重放及独立原件采集后，工作台对缺真实Codex原件的PUBLIC模型声明返回409；这是正确的缺证据拒绝，新增用例错误期待200，已改为两次409、零观测／零业务事件、Run仍Reserved、原预算不变。生产HTTP消费者没有放宽。自有PUBLIC原生故障摘要保留于`private-profile-native-failures.json`，四次段错误均有`resources_disposed:true`；不能把清理成功当作执行成功。

完整SDK整文件仍未通过，不累计各轮通过项，不继续为取得绿色结果重复整文件；当前只对修正后的PUBLIC缺原件拒绝场景作一次选择补验，其余未运行项不算通过。随后优先调查实际Bun启动故障，再继续完整Runtime组合与默认宿主。后续实际故障归因需要故障指令／转储或拒绝访问跟踪，现有DLL栈名不足。

最终选择补验`private-profile-sdk-http-refusal-selected.json`：1项通过、3项未运行（跳过），用例157.20秒、进程退出0，保留夹具`D:/CimiS1/sdk-private-dd2dbb69/cimiloop-host-model-runtime-XIDyB0`。实际新14配置完成三轮受控SDK、Native读取与固定检查、原Run重放不新增请求、独立采集；缺真实Codex原件仍为Unknown／null，两次实际认证HTTP观测均409，零业务事件／零观测、同一Reserved Run及预算保持。不是该文件全通过，不与108项合称全量通过。最终`pnpm check`及CLI／工作台帮助通过；三份文档UTF-8／代码围栏／34个本地链接与`git diff --check`通过。完整SDK及S1未通过，Bun早期启动稳定性继续未解决。

本机复验前先使用当前Node／锁文件环境执行`pnpm check`，为测试准备新的短、自有目录，并核对当前用户拥有可继承FullControl。不要直接使用另一台电脑的目录或修复历史失败根。通过`CIMILOOP_NATIVE_TEST_ROOT`指定新测试父目录，再运行：

```text
pnpm exec vitest run tests/scenarios/agent-host-model-runtime.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=<本机新的报告路径.json>
```

该场景仅用受控模型，不需API Key、不消耗模型额度；仍会实际创建本次自有AppContainer／Job、执行固定Node检查并保留原件。测试失败须保留stdout／stderr、原操作与预算，不通过更换Run身份恢复业务。

局部独立静态复核未发现must-fix，覆盖ACL／OWNER RIGHTS、14／15／16跨语言映射、原输入绑定和历史恢复；它不是完整Matt独立评审或Superpowers资格。没有读取凭据、新增模型请求、管理员准备或推送。
