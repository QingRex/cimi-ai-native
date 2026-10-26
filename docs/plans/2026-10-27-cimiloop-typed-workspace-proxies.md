# 普通与父任务的 Codex 具名 SDK 代理

接续 `5a4e33f`，完整 S1 五组、Schema242、项目库10、Host1保持。默认完整生产资格仍未完成。

## 实际问题与实施范围

普通任务旧桥接向外层 Codex 安装 `cimiloop_sdk_reply`，模型须在通用 JSON 中再次填写原 SDK 的工具名、调用编号和参数。固定 Skill 已有具名代理，普通／父任务仍没有。历史真实 Native 场景中，模型在读取后提出未获准编辑，Kernel拒绝，完整运行保持Unknown；该记录不能证明通用工具是失败的唯一原因，本批也不改判原运行。

本批让新普通／父任务的外层模型直接看到当前原 SDK 提供的具名代理及原参数Schema：`cimi_read`、`cimi_replace`、`cimi_check`、`cimi_run_skill`中本任务实际允许的子集。外层代理只记录下一条建议；实际读取、修改、检查和子技能仍由原 SDK 经IPC交给Kernel与Native，不在外层Codex中执行。没有提供的工具不能通过通用JSON重新请求。

最终文本统一经 `cimiloop_task_result({text})`提交，保留原Task结果契约及后续独立核验。该提交不证明检查通过、领域验收、费用结清或Human批准。每个外层回合只允许提交一次；回执明确 `sdk_effect_executed:false`、`response_submitted:true`，收到后须结束外层回合。真正SDK结果在下一原请求的转录中出现。

## 原版本与恢复

新私有状态普通任务使用内部模型header18，父任务使用header19；`private_operation_state/1.0.0`与`private_login_home/2.0.0`均按其原配置核对。新请求使用内部step9和submission3。具名代理的SDK调用编号由原scope、原模型call_id和原Codex工具call_id确定，调用方不能另外提供编号。

旧header1—17保留原解释、原请求摘要及重放路径。重新打开已登记的原操作时使用其原header，不把旧待执行请求转换成新代理，也不补造丢失的原件。修改来源、账户、模型、权限子集、参数Schema、最终ACK或原回执都会继续拒绝。失败或Unknown的原请求不因再次调用而重发。

实现复用现有预算、RPC原字节、模型原件、SDK／IPC及Kernel入口；不新增公共Schema、数据库迁移、账户或登录方式。

## 验证记录

新增前三个反例先运行：0通过、3失败、51过滤未运行，均为旧传输拒绝具名读取、检查和结果工具，报告 `.cimiloop/codex-2026-10-27-workspace-proxy-red.json`。首次实现后3项仍失败：PUBLIC stdio夹具未识别新结果工具，因而没有返回要求的最终ACK。已修正夹具使其按实际安装工具选择代理；这是夹具适配，未放宽真实ACK核对。报告 `workspace-proxy-first.json`保留。

随后原三个用例和旧有私有登录／父目录用例定向6项通过，其余48项过滤未运行，报告 `workspace-proxy-selected.json`。之后增加具名修改、子技能及越权／参数不合法／通用响应绕过／伪造验收字段反例。首轮完整模型文件59通过、1失败、0跳过：新增父任务夹具未传原服务要求的固定任务包，尚未开始模型调用；保留 `workspace-proxy-full.json`，现夹具显式绑定原任务包和SDK投影，不放宽宿主要求。

最终两个完整文件65通过、0失败0跳过，报告 `.cimiloop/codex-2026-10-27-workspace-proxy-final.json`：模型适配60项、原父子账户用量5项。覆盖五种具名代理、原参数Schema、未获准修改拒绝、错误参数／伪造验收字段拒绝、通用响应工具不能绕过目录、原请求重放不发送、错误原请求保持Unknown、原账户用量关联，以及既有固定Skill与私有状态行为。这些模型与账户仍为PUBLIC夹具，不代表生产资格。`pnpm check`、编译CLI Runtime帮助及工作台帮助通过。

### 真实 Luna／Windows／Native：未通过

同一生产实现另行执行 `tests/scenarios/agent-codex-native-runtime.test.ts`，1项失败、0通过0跳过，报告 `.cimiloop/codex-2026-10-27-workspace-proxy-native.json`。使用现有已批准登录及 `gpt-6-luna`，最多六轮模型派发的测试守卫保留，没有增加上限或重启原Run。项目资格、业务装配与预算仍含PUBLIC夹具，此次是实际模型／SDK／Native桥接验证，不是完整生产资格或S1。

原Run为 `01a179d8-f1f1-7004-986b-fbb14fed8b81`，原件在本机 `D:/CimiS1/_cu2dc6d4/codex-native-Hila0Q/.git/cimiloop`。四轮真实 `turn/start` 和四条 `turn/completed` 均有封口：依次为具名 `cimi_read`、`cimi_check`、`cimi_read`、`cimi_check`，实际读取 `src/query.ts` 与 `src/check.mjs`，两次固定 `query_test` 均返回 `outcome:passed`、退出码0，完整SDK历史确实逐轮送入后续模型请求。第二次检查发生在检查脚本读取之后；不能仅由重复检查推断代码异常。

第五轮已登记模型原请求，但原RPC账本没有 `turn/start` 或完成事件，保持Unknown。原Native清理记录为 `reason:agent_sandbox_task_deadline`、退出码12、`resources_disposed:true`、空 `cleanup_errors`，表明本次触发600000ms任务期限。该原件证明Native资源已处置，不证明全部Codex／OS受管资源完成S1恢复验收，也不证明费用为零或已结清。未得到最终Task结果候选，后续领域结果核验、工作台观测重放及成功summary均未执行。

新增代理断言最先访问缺失的第五轮回执，测试表面错误为 `Target cannot be null or undefined`。只读原件复查确认上面的任务期限与Unknown，保留 `.cimiloop/codex-2026-10-27-workspace-proxy-native-original-audit.json`，复查新增模型请求0、不重新派发。现将已有 `Observed` 断言移到代理原件遍历前，便于下次直接报告未完成；未为这一诊断次序调整再调用真实模型，不改判本次失败。性能／模型轮数为何耗尽本次任务期限仍须另行定位，不能假定已修复或单纯放宽期限制造通过。

65项完整夹具通过与本次真实Native失败分开保留。源码切面在完整单元验证后、Native终态前固定为 `.cimiloop/codex-2026-10-27-workspace-proxy-source-cut.json`；最终提交前核对生产实现无漂移，明确保留上述测试诊断次序调整。本批默认正式Agent仍受完整资格门禁限制，未推送，六个既有未跟踪文件不读取、不散列、不暂存或删除。

## 剩余完整目标

本批改善真正模型请求与原SDK之间的可执行桥接，不完成Runtime资格算法。技术资格原计划也要求真实修改与独立评审，不能删减；目前Runtime资格仍按旧OpenCode事件核验，当前Codex／SDK原件的资格消费仍须接通。四项完整生产控制来源、全部OS写入资源与历史容量、真实账单、真实Skill／Human／Matt、普通Change到ReadyForDelivery、指南实走、完整Native与最终评审继续推进。不得将PUBLIC模型／资格／账户、局部测试或一次真实模型调用当成完整S1。
