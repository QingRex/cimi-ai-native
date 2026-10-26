# 原件读取的路径检查开销与断链拒绝

接续 `529b73c`，完整S1五组、Schema242、项目库10、Host1不变。上一批真实Run保持Unknown，不重新启动、不改原件或清理历史资源。

## 问题与实现

上一批原件正面记录了600000ms任务期限结束，但没有证明期限消耗的唯一原因。本批先对其五请求／四封口回合的同一原件作只读CPU剖析，不读取登录凭据、不发送模型请求。三次完整模型宿主与Codex原件读取为1222、1129、1119ms，CPU样本显示大量时间用于存在性及属性查询，报告 `.cimiloop/codex-2026-10-27-workspace-proxy-read-profile.json`，CPU原报告在同名 `read-profile` 目录。

共享 `assertOrdinaryPath` 对每一级先 `existsSync`，再 `lstatSync`。前者跟随链接，除了多一次系统调用，还会把目标不存在的目录链接当作“不存在”，跳过链接本身的拒绝检查。实际Windows junction反例确认：断链本身及经过它的未来输出路径均被旧代码放行。

现对每一级仅执行 `lstatSync({throwIfNoEntry:false})`：检查条目本身，拒绝断链；普通缺失路径仍可以作为未来目录／文件路径返回，不创建它们。未引入跨调用缓存，原目录后来被junction替换时仍重新读取并拒绝。权限错误或非目录祖先的属性错误继续失败，不把错误推断为普通目录。原字节、物理身份、当前权限、账本与效果前后复核均保留。

## 实际验证

Node24.22.1、pnpm12.4.2。新增完整文件先运行2通过、2失败、0跳过：旧代码没有拒绝断链及其后代路径；报告 `.cimiloop/codex-2026-10-27-ordinary-path-red.json`。修复后普通路径、原程序物理身份、同步原件核验切面、Windows长原件路径四个完整文件35项通过、0失败0跳过，报告 `ordinary-path-originals.json`。

另一次两个完整文件56项通过、0失败0跳过，报告 `.cimiloop/codex-2026-10-27-ordinary-path-native-transport.json`：实际Windows文件句柄／读写／替换／链接／取消28项，以及Codex原RPC传输28项。前者包含真实Windows Native文件效果；后者的模型与账户是PUBLIC stdio夹具。这两份报告分阶段保存，不能称为一次六文件整轮通过，更不能称完整AppContainer／S1验收。`pnpm check`通过。

同一原件在修复后只读三次为914、739、725ms，中位从1129降到739ms，约减少35%，报告 `.cimiloop/codex-2026-10-27-ordinary-path-profile-after.json`。这是本机小样本读取结果，不是完整运行耗时承诺；OS缓存与机器负载会影响测量。不能据此把上一批真实期限失败改为通过，或声称它的所有原因已解决。本批新增真实模型请求0，没有为这一优化再跑真实模型。

## 后续完整范围

当前Codex／SDK原件进入Runtime技术资格的消费路径、四项完整生产控制来源、真实Skill／Human／Matt、真实费用与完整物理容量／异常恢复、普通Change到ReadyForDelivery、指南实走及最终Matt／Superpowers仍未完成。默认正式入口继续要求完整资格。六个既有未跟踪文件不读取、不散列、不暂存或删除，本批仅提交明确文件，不推送。
