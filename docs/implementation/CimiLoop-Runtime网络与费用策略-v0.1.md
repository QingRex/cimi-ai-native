# CimiLoop Runtime 网络与费用策略 v0.1

2026-10-04，V1-09续批，决策D-197。本批落实新探针的默认网络隔离、执行策略快照及未实现限制的启动前拒绝。联网主机白名单、可靠费用硬上限和正式Agent执行仍未启用；领域协议2.0.0、数据库格式8保持，没有升级用户库。本批没有模型请求或实际凭据读取。

## 1. 已实现边界

新操作保存`managed/1.2.0`，在原磁盘限额 / 启动器摘要之外，将生效网络及费用策略纳入control_digest。监督进程在读取凭据、创建沙箱或启动Runtime前重新核验。策略改变不能沿用同一操作键；已存在的操作只查询，不因新默认值启动第二次。

| 策略 | 当前行为 | 证据边界 |
|---|---|---|
| network.deny_all | 新操作及版本 / OS canary的默认值；不向AppContainer授予网络Capability | 实际公网TCP拒绝、IPv4 / IPv6回环TCP未建立连接、受控IPv4回环UDP未收到数据；不声称公网UDP / DNS或全部入口已验收 |
| network.unrestricted_probe_only | 必须显式选择；仅合成探针，授予internetClient | 仍未限制出站主机，不允许正式Task执行 |
| network.host_allowlist | 启动前拒绝network_host_enforcement_unavailable | baseURL、代理环境变量或工具权限不能替代操作系统出口限制 |
| cost.unmetered_probe_only | 仅探针模式；结果保留cost_known=false | 没有可靠计费事实，不表示费用为0 |
| cost.required_cap | 启动前拒绝cost_enforcement_unavailable | 不将工具步数、超时、订阅名称或未知用量当作货币上限 |

不显式提供联网策略的模型探针返回model_network_access_denied。无效或未实现的策略在创建操作占位、读取实际Key和启动Runtime之前拒绝；CLI退出2，保留严格错误结构。有效性检查不回显策略文件的私密内容。

原生控制端在CreateProcess已绑定Job、但Runtime尚未Resume时保存execution-policy-proof.json，记录实际授予的Capability、进程ID、网络模式和费用模式。query核对该证明与固定策略及原生PID；缺失、错误或矛盾保持Unknown，不接受声明“已强制执行”作为成功。collect固定原始字节摘要。该文件证明控制端的实际配置，流量阻断另由真实进程和受控监听器验证。

历史managed/1.0.0、managed/1.1.0和未受管理记录保持原语义，不补写新的网络证明，不将历史internetClient追认成deny_all。D-196的恢复器仍适用于受管理操作；恢复不改写原证明或将Unknown变成功。新版本 / OS canary改为默认无网络Capability，但native-probes的完整崩溃恢复仍待补齐。

## 2. CLI使用

版本及OS权限探针沿用原命令，默认无网络Capability。需要重新执行真实合成模型探针时，显式提供以下策略文件；这是接受当前探针限制的配置，不是正式执行授权：

```json
{
  "network": { "mode": "unrestricted_probe_only" },
  "cost": { "mode": "unmetered_probe_only" }
}
```

```powershell
node apps/cli/dist/bin.js --json runtime probe --binary '<固定OpenCode原生文件>' `
  --output-dir '<新的合成探针目录>' --model-probe `
  --execution-policy-file '<probe-policy.json>' --connection-file '<已有专用DPAPI连接>'
```

正式费用上限用整数微美元表达，避免浮点累计歧义。例如`cost: { mode: "required_cap", max_cost_microusd: 10000 }`表示请求0.01 USD上限，但当前会被明确拒绝。该字段是约束声明，尚无可执行的计量 / 预留实现。

## 3. 实际验证

真实Windows子进程使用与其他探针相同的AppContainer / Job。可信宿主先确认IPv4及IPv6 TCP监听器可达，并等待服务端接收计数稳定；UDP也先验证宿主控制数据确实收到。随后沙箱尝试直接IP连接和发送，分别记录API返回及接收端观测：

- 公网TCP尝试返回WSAEACCES / 10013。
- IPv4 / IPv6回环TCP在1500ms观测时限内未建立连接，宿主没有收到新增连接；保留10060，不伪造为访问拒绝码。
- IPv4回环UDP SendTo返回成功，受控接收端在另500ms观察期内收到沙箱数据0次；发送成功不能证明数据已送达，未收到也不扩大为全部公网UDP已阻断。

实测另保存显式internetClient的本地合成等待操作及3项真实CLI启动前拒绝；固定OpenCode1.18.34在默认无网络Capability下的版本及双模式OS边界也通过，未调用模型。首次宿主监听计数尚未稳定的核验尝试没有用于验收，原操作与恢复记录保留，重新核验使用新键。详见[实测快照](../research/CimiLoop-Runtime网络与费用策略-2026-10-04.json)，原始记录位于本机`.cimiloop/network-policy-v1-09/`；文件内容摘要已逐项核验，原操作同键未重启，资源已核对清理。本地Fixture的Succeeded仅表示该程序按预定方式结束，不产生Provider、Task或Run的ALLOW。

新增5项策略 / 实际Windows测试及4项CLI回归；专项4个测试文件40项通过；Node24.15.0 + pnpm12.4.2下构建、类型检查、Schema同步及全量32个测试文件307项通过。最终补强监听器计数后的5项网络策略测试另行复验通过，结果同步实施基线及D-197。新增RuntimeExecutionPolicy / RuntimeExecutionPolicyObservation两个严格v2机器Schema，原RuntimeProbeResult / RuntimeOperationResult及冻结v1制品保持。

实际隔离测试退出前也先核对 / 取消 / 恢复该测试的受管理进程，再删除临时目录；不能因为断言失败就删除仍有活跃所有者的持久记录，恢复未知时保留目录。补强后的适配与网络策略专项17项另行通过。

AppContainer网络Capability及配置原理依据[微软AppContainer隔离说明](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation)和[创建AppContainer](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)。没有新增全局防火墙规则、Loopback豁免或驱动，也未提权。

## 4. 下一步实现顺序及验收

第1项已由后续D-198完成实际合成传输验证，见[Runtime IPC传输](CimiLoop-RuntimeIPC传输-v0.1.md)；第2–4项仍待实施。以下保留网关和可靠计费的验收要求。

1. 先验证可信模型网关的沙箱传输。候选方案是仅授予当前AppContainer SID访问的IPC端点，由可信宿主核对实际客户端PID / 创建时间及操作归属。OpenCode是否支持相应传输仍须实际验证；不能为了连接普通HTTP代理而恢复Runtime直接出站，也不能用全局Loopback豁免放行人类入口。不满足时评估具备相应边界的执行后端。
2. 网关只转发批准的HTTPS主机、端口和API路径，固定模型及最大输出参数；禁止任意URL / CONNECT、重定向绕过和未经核验的DNS变化。Key由网关持有，Runtime不再直接获得Key。验证直接IP、替代代理、IPv6、UDP / DNS及受保护宿主入口的绕过尝试，接收端证据须可复核。
3. 在首个外部请求前持久预留预算，固定可信费率来源 / 币种 / 有效期、计费类别和保守上界；没有可靠上界的Provider继续拒绝required_cap。实际账单 / 用量与预留分开保存，流式中断、超时或崩溃未知时保留预留，不退回余额或按0计费。Coding Plan和按量API分别建证据，不能推断订阅中的每次请求货币成本为0。
4. 补齐文件系统硬上限和所有资源创建窗口的恢复，明确机器中断 / native-probes等覆盖。四项受控执行证据完整后再扩展Provider评测与Task Binding，然后实现可信Agent入口、预算 / Context / 工作区校验、实际Run及独立评价。

这批只完成上述方案的默认隔离和拒绝基础，不宣称网关、可靠计费或完整A9已经实现。V1-21/22技能包装及Matt / Superpowers试点仍在S1，OpenSpec可选，ECC按需参考。

后续D-199已实现宿主HTTPS网关核心和独立SQLite持久预算：固定合成主机 / 路径 / 模型 / 输出上限，TLS验证、响应限额、请求前预留、跨进程竞争及Unknown预留保留通过验证。CLI合成探针12项全部通过，实际Key读取与外部模型请求0。AppContainer IPC与网关尚未桥接，真实Provider计价及受控执行未验收，正式Task绑定与Agent Run继续关闭。 见[宿主模型网关与持久预算](CimiLoop-宿主模型网关与持久预算-v0.1.md)。下一步接通准确身份核验的AppContainer IPC与宿主网关，先验证OpenCode经IPC收到合成HTTPS回复，再实现可靠真实计价 / Provider验收；补齐文件系统硬配额与完整恢复后接正式Task及Agent Run。 本批结果不替代真实模型契约或实际账单，既有Runtime host_allowlist / required_cap仍拒绝，Provider受控执行不提升。

2026-10-05后续D-200已接通无网络AppContainer中的OpenCode IPC与宿主HTTPS网关：固定模块、准确进程身份、私有目录及策略摘要贯穿请求和回复，发送前持久预留，取消 / 崩溃保留Unknown预算。实际OpenCode 1.18.34完成2次合成HTTPS请求，9组桥接异常 / 恢复实测通过；实际Key读取与外部模型请求0。真实Provider计价及受控执行仍未验收，正式Task绑定与Agent Run继续关闭。 规则见[IPC宿主网关桥接](CimiLoop-IPC宿主网关桥接-v0.1.md)。下一步建立真实Provider可核验的计价上界及公网DNS / 固定地址 / 重绑定防护，再做真实网关契约验收；补齐文件系统硬配额与完整恢复后接正式Task及Agent Run。 既有host_allowlist / required_cap仍拒绝真实Runtime启动，本批不提升Provider受控执行。

2026-10-05后续D-201已实现固定智谱Coding Plan公网DNS / 一次性地址固定及TLS对端核验，实际两条A / 两条AAAA与所选IP的TLS1.3验证通过；新增有期限的GLM-5.3积分估算及计费缺项查询。公网连接探针的模型端点HTTP、真实Key读取和外部模型请求0，未启动Runtime。积分估算不作为实际费用或准入证明，真实网关计费与正式Task / Agent执行仍未验收。 见[公网网关边界与积分估算](CimiLoop-公网网关边界与积分估算-v0.1.md)。下一步确认专用连接的套餐版本及网关适用环境，建立包含思考Token的输入 / 输出上界、积分与现金预算的明确关系及持久预留，再验收真实HTTPS / Runtime契约；文件系统硬配额与完整受控恢复仍待完成。 本批仅验证连接层，既有真实Runtime host_allowlist / required_cap保持拒绝，Provider受控执行不提升。

2026-10-05后续D-202已实现独立持久积分演练账本、共享账户 / 任务累计上限、一次发送凭据、历史回执及原宿主身份核验后的恢复。实际三个独立宿主验证共享上限CAS与发送状态提交后的进程退出；15项CLI检查通过。HTTP、真实Key及模型请求0，真实计费准入与正式Task / Agent仍未启用。 见[持久积分预算与宿主恢复](CimiLoop-持久积分预算与宿主恢复-v0.1.md)。下一步确认套餐版本与网关工具资格，证明服务端输入及思考输出上界，固定实际账户唯一账本、配额 / 账单核对及Task现金 / 积分预算关系，再实现真实HTTPS请求契约；文件系统硬配额和完整受控恢复仍待完成。
