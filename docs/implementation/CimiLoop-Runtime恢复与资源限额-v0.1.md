# CimiLoop Runtime恢复与资源限额 v0.1

2026-10-04，V1-09续批，决策D-196。本批为`operations/<operation_key>`中的新合成操作实现持久资源归属、进程身份核对、恢复清理和资源超限停止。实际Windows进程及CLI验证通过；正式Task绑定、Agent Run及完整A9仍未启用。领域协议保持2.0.0、数据库保持格式8，未升级用户库、未读取实际智谱凭据或新增模型请求。

后续D-197新操作已使用managed/1.2.0，将生效网络 / 费用策略一同固定；默认无网络Capability，新的模型探针须显式策略文件。见[网络与费用策略](CimiLoop-Runtime网络与费用策略-v0.1.md)；历史控制版本不回填或重启，下面D-196验证保留为当批事实。

后续D-198已完成无网络Capability下的OpenCode 1.18.34合成IPC传输：准确AppContainer SID / 实际PID与创建身份核对、帧限额及重放校验、内容只读模块兼容、取消 / 原生崩溃与归属恢复验证均接通。外部模型请求和实际Key读取0，HTTPS主机 / 路径 / 模型强制限制与持久预算预留 / 可靠计费仍待实现，controlled_execution、正式Task绑定及Agent Run不提升。 见[Runtime IPC传输](CimiLoop-RuntimeIPC传输-v0.1.md)；合成transport-probe结果不能替代原RuntimeProbeResult或真实模型契约证据。

## 1. 资源归属与启动

操作键在外部启动前持久化，同键只查询原操作，输入不同仍拒绝。D-196控制记录`managed/1.1.0`固定生效磁盘限额、原生启动器摘要和control_digest；默认值调整不改变旧操作的已保存配置。旧`managed/1.0.0`仍可核对，未受管理的历史操作保持原形状。

Supervisor在读取专用凭据和创建沙箱前记录自己的PID、Windows进程创建时间及完整程序路径。原生控制端在创建Profile、授予权限或分配盘符前保存`native-ownership.json`，Profile名称固定操作nonce，映射前记录准确目标。JSON先写临时文件、刷新数据再原子替换；丢失或不一致的记录不能授权清理。

Runtime在CreateProcess时通过JOB_LIST原子加入限额Job，控制端退出后由KILL_ON_JOB_CLOSE结束Job内进程，关闭“创建后尚未绑定Job”的中断窗口。该机制依据[微软的原子Job绑定说明](https://devblogs.microsoft.com/oldnewthing/20230209-00/?p=107812)及[Job生命周期文档](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)，已用实际Windows进程验证。

## 2. 恢复及结果

`runtime recover`核对原Supervisor、原生控制端与Runtime的PID、创建时间和程序路径。PID重用不代表原进程仍在；无法读取身份时保持unknown。有原进程存活则返回active，不取消、不删除状态、不重新启动。只有确认全部原进程已结束，才处置该操作的残留资源。

| outcome | 含义 |
|---|---|
| active | 原进程仍在，保留现状；需要停止时另执行cancel并核对实际结束 |
| recovered | 该操作资源已释放；此结论不代表原执行成功 |
| unknown | 归属、身份、记录或清理无法确认；保留需要恢复的记录 |

清理只移除该nonce对应Profile的准确ACL、准确目标的DOS映射及该Profile。记录已证明资源释放后，旧盘符被其他操作复用时不再操作它；未释放记录与实际映射目标不符时拒绝清理。按nonce的Windows互斥锁串行处置原生资源，拒绝链接路径。

随后仅删除该操作`sandbox/state`。专用连接的原始采集丢失时，合成工作区也整体丢弃，防止把未脱敏凭据作为输出保存；恢复过程不解密或读取凭据。保留原始进程证明、日志和同键记录，recovery标记只记录恢复事实。缺少结束证明或Supervisor完整采集时，原操作仍为Unknown，不能猜测成功、补造失败或自动重新执行。

恢复结果按严格RuntimeRecoveryResult Schema输出。资源释放、专用状态清理和工作区丢弃分别显示；清理失败返回unknown。`recovered`与`operation.status: Unknown`可以同时成立。

## 3. 资源控制及限额

| 字段 | 默认值 | 落实方式 |
|---|---|---|
| max_sandbox_bytes | 64 MiB | workspace与state总逻辑字节，100ms采样，超限终止Job |
| max_sandbox_entries | 256 | 两个目录的文件与子目录条目总数，超限终止Job |
| max_file_bytes | 8 MiB | 单文件逻辑大小，超限终止Job |
| max_output_bytes | 8 MiB | stdout / stderr合计，在控制端写入前截断并请求终止 |

严格RuntimeDiskLimits拒绝无限值、额外字段、不合理范围及输入本身超限。限额进入持久控制摘要，同键重放不重新计算默认值。原生ResourceObservation保存实际采样值、使用限额、采样间隔和停止原因；采集后按原字节内容寻址。日志超限只创建一次取消请求，避免持续输出与控制端读取之间的文件锁竞争。

有实际结束证明时，超限归一化为Failed / disk_budget_exhausted或output_budget_exhausted。超限输出不作为候选制品采集；保持已经证实的停止结果，不因大文件超出采集上限改写为Unknown。暂时不可读或观测异常仍保持Unknown，不把取消请求当成结束。

沙箱监测是采样后的停止控制，写入可以在采样间隔内超过阈值；逻辑字节也不等于NTFS分配空间。它不能作为文件系统硬配额或全部宿主存储边界的证明。[NTFS配额按用户及卷计费](https://learn.microsoft.com/en-us/windows/win32/fileio/disk-quota-limits)，本批没有修改用户整卷配额或增加系统权限。

## 4. CLI及兼容

```powershell
node apps/cli/dist/bin.js --json runtime recover '<operation-key>' --output-dir '<对应探针目录>'
node apps/cli/dist/bin.js --json runtime show '<operation-key>' --output-dir '<对应探针目录>'
node apps/cli/dist/bin.js --json runtime collect '<operation-key>' --output-dir '<对应探针目录>'

# 自定义新模型合成操作的限额；limits.json包含上表四个正整数字段
node apps/cli/dist/bin.js --json runtime probe --binary '<OpenCode原生文件>' `
  --output-dir '<探针目录>' --model-probe --disk-limits-file '<limits.json>' `
  --execution-policy-file '<probe-policy.json>' `
  --connection-file '<已有专用DPAPI连接>'
```

recover的unknown退出1；缺少记录退出3，非法操作键或限额退出2。只读查询、恢复及合成探针不写Task、原生Run、预算或Gate。历史无归属记录的操作返回durable_ownership_missing，不能据旧PID或盘符名自动清理。版本 / OS canary的旧native-probes入口不由本批恢复命令管理。

只新增RuntimeDiskLimits、RuntimeResourceObservation及RuntimeRecoveryResult三种v2机器Schema；既有RuntimeOperationResult / RuntimeProbeResult制品与冻结v1保持。Provider受控执行评测规则仍报告原四项缺口，本批没有把部分恢复测试或采样阈值提升为正式Task准入。

## 5. 实际验证与下一步

实际Windows测试覆盖总量 / 单文件 / 条目 / 日志超限、固定默认限额与篡改拒绝、活跃进程保留、强制终止原生控制端及双控制进程、原证明保留、Unknown及同键不重启、nonce错配、他人映射保护、进程路径与创建时间校验、真实CLI和历史无归属拒绝。合成DPAPI与本地Fixture程序验证未脱敏工作区清理，Fixture不调用模型或网络，也不访问用户实际凭据。

另在本机保存四类真实合成资源超限与实际CLI恢复记录，见[2026-10-04实测快照](../research/CimiLoop-Runtime恢复与资源限额-2026-10-04.json)，原始结果在`.cimiloop/runtime-controls-v1-09/`。初次日志实测的未完成观测也保留，资源已恢复、原结论仍Unknown；修复后使用新的操作键核验，不改写旧结果。新增模型请求和实际凭据读取均为0。Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全量31个测试文件298项通过，新增14项恢复 / 资源测试及1项CLI参数回归。全量结果同步[实施基线第10节](CimiLoop-V1可执行设计与实施计划-v0.1.md)及D-196。

下一步实现出站主机限制及可靠费用计量 / 控制，补齐文件系统硬上限与恢复覆盖，再更新受控执行评测、正式Task绑定和可信Agent入口 / Run。Matt / Superpowers试点仍按V1-21/22进入S1，OpenSpec可选，ECC按需参考。

后续D-199已实现宿主HTTPS网关核心和独立SQLite持久预算：固定合成主机 / 路径 / 模型 / 输出上限，TLS验证、响应限额、请求前预留、跨进程竞争及Unknown预留保留通过验证。CLI合成探针12项全部通过，实际Key读取与外部模型请求0。AppContainer IPC与网关尚未桥接，真实Provider计价及受控执行未验收，正式Task绑定与Agent Run继续关闭。 见[宿主模型网关与持久预算](CimiLoop-宿主模型网关与持久预算-v0.1.md)。下一步接通准确身份核验的AppContainer IPC与宿主网关，先验证OpenCode经IPC收到合成HTTPS回复，再实现可靠真实计价 / Provider验收；补齐文件系统硬配额与完整恢复后接正式Task及Agent Run。 本批结果不替代真实模型契约或实际账单，既有Runtime host_allowlist / required_cap仍拒绝，Provider受控执行不提升。

2026-10-05后续D-200已接通无网络AppContainer中的OpenCode IPC与宿主HTTPS网关：固定模块、准确进程身份、私有目录及策略摘要贯穿请求和回复，发送前持久预留，取消 / 崩溃保留Unknown预算。实际OpenCode 1.18.34完成2次合成HTTPS请求，9组桥接异常 / 恢复实测通过；实际Key读取与外部模型请求0。真实Provider计价及受控执行仍未验收，正式Task绑定与Agent Run继续关闭。 规则见[IPC宿主网关桥接](CimiLoop-IPC宿主网关桥接-v0.1.md)。下一步建立真实Provider可核验的计价上界及公网DNS / 固定地址 / 重绑定防护，再做真实网关契约验收；补齐文件系统硬配额与完整恢复后接正式Task及Agent Run。 既有host_allowlist / required_cap仍拒绝真实Runtime启动，本批不提升Provider受控执行。

2026-10-05后续D-201已实现固定智谱Coding Plan公网DNS / 一次性地址固定及TLS对端核验，实际两条A / 两条AAAA与所选IP的TLS1.3验证通过；新增有期限的GLM-5.3积分估算及计费缺项查询。公网连接探针的模型端点HTTP、真实Key读取和外部模型请求0，未启动Runtime。积分估算不作为实际费用或准入证明，真实网关计费与正式Task / Agent执行仍未验收。 见[公网网关边界与积分估算](CimiLoop-公网网关边界与积分估算-v0.1.md)。下一步确认专用连接的套餐版本及网关适用环境，建立包含思考Token的输入 / 输出上界、积分与现金预算的明确关系及持久预留，再验收真实HTTPS / Runtime契约；文件系统硬配额与完整受控恢复仍待完成。 本批仅验证连接层，既有真实Runtime host_allowlist / required_cap保持拒绝，Provider受控执行不提升。

2026-10-05后续D-202已实现独立持久积分演练账本、共享账户 / 任务累计上限、一次发送凭据、历史回执及原宿主身份核验后的恢复。实际三个独立宿主验证共享上限CAS与发送状态提交后的进程退出；15项CLI检查通过。HTTP、真实Key及模型请求0，真实计费准入与正式Task / Agent仍未启用。 见[持久积分预算与宿主恢复](CimiLoop-持久积分预算与宿主恢复-v0.1.md)。下一步确认套餐版本与网关工具资格，证明服务端输入及思考输出上界，固定实际账户唯一账本、配额 / 账单核对及Task现金 / 积分预算关系，再实现真实HTTPS请求契约；文件系统硬配额和完整受控恢复仍待完成。
