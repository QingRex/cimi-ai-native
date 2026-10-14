# D-309 父 Skill、领域结果与原费用的同一执行路径

本批把已有候选中的当前父 Skill 结果实现接入 main，解决原 SDK 的 cimi_run_skill 输出不能成为当前 Task 领域结果的问题。复用原 Run、共享 Runtime、Kernel、工作台 HTTP 和账户账本，不建立第二套执行流程。

父 SDK 返回的原调用回执必须对应当前 Skill 输入、完整工作区材料及原结果。共享读取器重新核对这些原件，产出 cimiloop/original-task-execution-result/3.0.0；当前工作区适用性证明不替代模型／Skill 资格、费用结算或 Task 验收。新 config10／claim3 沿 D-308 固定启动策略验证，旧格式按原含义读取。

RunObservation 和原终态读取复用同一领域结果证据。账户结算仍核对原父子请求、占用和认证账单；响应丢失或工作台重启后重放原 Command，不重开 Run、不增加调用或费用。Task 满足与 ReadyForDelivery 仍由 Kernel 的独立验收决定。

本批接入十三个已有领域结果路径，并修复当前结果批量复制。最多64条的 receipt 与 current_input 各自保持原单帧4096节点／深16限制，不再让数组或包装对象扣减单条容量；数组空洞、额外属性、访问器及 Proxy 被拒绝。后续严格原件解析和独立 SDK／IPC 对照保持。

最终完整六文件118项通过，零失败／零跳过，795源码零漂移；pnpm check、CLI帮助通过。批量红例5通过4失败，最终十项边界检查计入118项，不重复相加。普通独立工程复审的容量发现已修复，未发现新增必修；复审者未独立运行测试。

实际父子 Native 整链路一文件一项失败：子 Native 和子账单返回后，父模型预期4次、实际3次；父原进程因固定30分钟Task到期退出12，清理报告 resources_disposed=true、无错误。第四次只有宿主请求锚点，尚无专用发送意图／提供方 dispatch；未到达父终态及总费用结算。保留失败原件，不重开、不续期。该轮使用794源码且尚无最终批量修补，不能作为最新main整链路通过证据。终态后仅同步两路径，候选与main795源码归一化一致，等待原回读耗时修复后复验。

[验证范围与保留失败](../research/CimiLoop-parent-skill-domain-execution-path-2026-10-14.json)。

Windows／AppContainer／SDK、固定检查、HTTP 和原账本使用实际实现；本轮模型回复、Skill 资格、账户批准及账单认证使用明确的 PUBLIC 夹具，不构成真实模型、真实 Skill 或 S1 验收。具体智谱模型、套餐及现金／积分上限仍待确认，确认前不付费。

Schema242、项目数据库10和Host1保持。后续交付是通过共享应用服务安装完整工作台执行与恢复组合，再完成真实澄清／Skill、普通 Change 到 ReadyForDelivery 及完整 S1 验收。
