# 从所选 Skill 停止完整原 Run

接续 `a736326`。父 Run 入口已核对全部原子 Skill，但子调用入口原本直接提交父 `CancelRun`，随后只取消所选子调用；其他原子调用与父模型仍可能运行。该入口的领域含义已是取消整个父 Run，本批让物理控制也复用同一完整集合，不增加新领域命令或另一份业务状态。

## 路径

`LocalHumanSkillInvocationControl.stop` 仍严格校验所选原调用与命令的父 Run，保留七字段 Human 命令边界。进入等待前分离请求快照、固定原 Human／项目入口／Kernel 控制方法及所选原调用。默认父子服务延迟加载后再复核，随后由原父控制服务提交或重放唯一 Kernel 回执，按完整原集合重试父及全部子取消。

延迟组合只导入本地应用模块，不安装 Runtime／账户、读取登录或启动模型。父子服务仅调用子 `retryCancellation`，不递归调用 `stop`。每个物理效果继续使用当前会话与权限守卫；一次失败在本次操作内保持。原件不可核对的成员保留 Unknown，不阻止其他仍获授权且身份可核对的成员；身份／会话变化则停止余下操作。

返回保留所选 `invocation_id`、`invocation_key`、`operation` 和原 `command_result`，附 `parent_operation`、完整 `family`。父原件缺失不能被子取消应答掩盖；资源、完成和费用仍按各自证据解释。已有工作台原请求恢复与整体状态提示直接消费该响应，不另造命令或派发。CLI 已有父 `cancel-original` 沿用上一批完整集合路径，本批没有新增 CLI 启动开关。

## 验证

首先用实际 Kernel／SQLite／Host1 与两个合法原子调用、PUBLIC Native 端口复现：停止所选 Skill 的反例1失败、13未选择，缺少父操作与完整集合，原实现只触达所选子调用。没有以业务构造观察证明真实方法或费用。

最终 Node24.22.1／pnpm12.4.2 的 `pnpm check` 通过。同轮受影响回归使用 `pnpm exec vitest run`，选择下表5个完整文件，参数 `--maxWorkers=1 --reporter=default --reporter=json --outputFile=.cimiloop/codex-2026-10-27-selected-skill-family-stop-final.json`，合计48通过、0失败、0跳过，success=true／exit0。

| 测试文件 | 项数 |
|---|---:|
| `packages/local-app/test/agent-run-family-control-local.test.ts` | 16 |
| `packages/local-app/test/skill-invocation-control-local.test.ts` | 16 |
| `apps/workbench/test/agent-run-family-control.test.ts` | 6 |
| `apps/workbench/test/skill-control.test.ts` | 7 |
| `apps/workbench/test/skill-control-frontend.test.ts` | 3 |

实际核对所选子调用取消两次时父控制两次、两个原子调用分别两次；只产生一次 Kernel 取消事件和回执，始终只有原 Run，原观察集合及预算占用保持。子停止命令在新增等待期间被外部改写时仍提交原快照、只能用原命令重放；本地入口等待期间被改写则在任何 Kernel 或物理效果前拒绝。实际 HTTP 返回保留所选子响应、父 Unknown 和完整集合；真实浏览器 DOM／HTTP 验证丢响应重载、撤权后原请求恢复及旧查询错误处理。

12份源码／测试在本轮前后摘要零变化，清单与最终JSON保留在本机忽略目录 `.cimiloop`，前缀 `codex-2026-10-27-selected-skill-family-stop-`。临时根使用 Windows 原生路径分隔符，使旧清理钩子的原目录限制按原规则执行，未改测试删除范围、未删除旧失败夹具。

没有运行全仓 `pnpm test` 或完整 Windows/AppContainer／真实模型／技能／账单验收。上述 Kernel、SQLite、Host1、编译 CLI、HTTP 和 DOM 均实际执行；方法、费用与 Native 资源返回为明确 PUBLIC 夹具，本批没有执行实际 Native 处置，不能证明真实进程已停或生产恢复矩阵完备。上一批78项保持其提交与范围，不累计为本批一次126项回归。

## 完整 S1 条件

这只补完整操作接线，不是实际 Native／真实模型／技能或 S1 验收。完整兼容客户端尚未构建和安装，磁盘空间与官方财务来源仍待外部条件；正式 Runtime 的费用与完整恢复依据、真实技能／Human／Matt、普通 Change 到 ReadyForDelivery、接入指南实走及最终独立评审仍未完成。Schema242／项目库10／Host1不变，不读登录、模型请求0、不push，不处理六个既有未知文件或旧 Unknown。
