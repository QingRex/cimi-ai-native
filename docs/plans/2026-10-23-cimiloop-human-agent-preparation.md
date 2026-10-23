# Human 发起 Agent 原运行准备与预约

更新2026-10-24，基线`7838933`。完整S1五组、公共Schema242／项目库10／Host1保持；不重写历史Context、Run或原回执。

原Human CLI／工作台无法直接以Agent执行者身份准备Context。数据库格式10还明确要求Agent Context的producer等于Agent executor；直接改成Human producer的实现曾在实际SQLite落库中失败，已撤回，没有修改格式10触发器或用户库。

采用可信宿主发起实际Agent元数据命令的路径：先用当前Human Kernel只读核对技术负责人指派、Agent WorkItem和项目；在原Host1的`human_agent_preparation`命名空间保存首次完整Human请求及固定Agent命令；再用原Agent Kernel执行同UUID的PrepareRunContext／ReserveRun。Kernel内部`agentPreparationInitiator`仅由可信应用代码安装，在writer事务内、读取既有回执之前重新核对Human当前指派和固定执行者。HTTP／命令JSON不能传入该内部选项。Context、Workspace、Run及事件保留实际Agent生产者，不更改既有执行、Provider、独立宿主或预算规则。

原请求由项目与command_id唯一标识。按Kernel既定commandDigest比较业务语义，允许CLI重试重新生成时间和关联ID；实际复用首次票中的完整Agent命令。业务字段变化拒绝COMMAND_ID_REUSED。已有Agent回执但缺Human票据时拒绝，不能补造原请求。释放／重开完整准入租约后仍读取原票和原回执；撤权后不能靠回执绕过当前权限。准备与预约不调用模型、不启动Native、不结算费用。

共享executeHumanAgentRunCommand已接CLI及工作台executeLocalCommand。CLI仅在原WorkItem执行者为Agent的准备／预约命令上默认声明technical_owner；显式executor仍交原Kernel检查。工作台新增原快照、固定Runtime／Skill摘要选择及原Context费用预约表单，沿既有sessionStorage保存完整pending请求。可信启动代码可通过runtimeAdmission安装同项目完整租约；启动失败或关闭会释放租约并关闭自有数据库，借用Host及原操作继续保留。默认bin尚未加载真实完整宿主，缺失时拒绝，不能将此hook或PUBLIC full端口视为正式资格。

验证环境Node24.22.1／pnpm12.4.2，使用实际Kernel／SQLite10／Host1、编译CLI及DOM／认证HTTP；Provider资格及完整宿主仍为PUBLIC受控夹具。新增路径四整文件24项、0失败0跳过：

- `pnpm exec vitest run packages/store-sqlite/test/agent-human-preparation.test.ts packages/local-app/test/agent-runtime-admission-local.test.ts`：6＋14项，含事务内撤权、历史回执前撤权、跨租约重开、业务摘要重试、缺原Human票拒绝及授权回调替换拒绝；报告`.cimiloop/codex-2026-10-22/human-preparation-kernel-host-final.json`。
- `pnpm exec vitest run apps/cli/test/agent-run-preparation.test.ts`：3项，编译CLI缺真实完整宿主时拒绝，显式executor仍受Kernel约束；报告`human-agent-cli-green.json`，同上报告目录。
- `pnpm exec vitest run apps/workbench/test/agent-preparation-frontend.test.ts`：1项，真实DOM／认证HTTP两次提交响应丢失、准备后页面重开、原UUID单Context／Run、借用Host保留及无效Matt启动异常释放；报告`human-agent-workbench-final3.json`。

原有回归`pnpm exec vitest run packages/store-sqlite/test/agent-runs.test.ts apps/cli/test/agent-runtime-start.test.ts apps/workbench/test/server.test.ts apps/workbench/test/agent-runtime-start-frontend.test.ts`四整文件39项、0失败0跳过，报告`human-preparation-regression-final.json`。本批分阶段共八个整文件63项通过，未重复累计中途选择运行或先前报告。

`pnpm check`、两条编译CLI命令帮助、三份文档34个本地链接／UTF-8／代码围栏和`git diff --check`通过。局部独立静态评审发现的CLI时间／关联ID重建误拒绝和工作台Matt构造异常泄漏租约已修复并复核；不计完整Matt／Superpowers验收。

早期Human producer方案的实际落库失败、CLI新增用例的2项红测、模块身份接线错误及部分选择运行均不计整文件通过。当前真实模型、Native、付费服务及管理员操作新增为0；没有全仓`pnpm test`或完整S1验收。

五组仍未验收。继续正式默认宿主安装、完整物理写路径与历史容量、原费用与异常恢复、真实Skill／Human/Matt创建前澄清、最终源码Matt／Superpowers验证，以及真实普通Change到ReadyForDelivery。[S1执行清单](2026-10-16-cimiloop-S1-执行清单.md)与[接入指南](2026-10-16-cimiloop-S1-接入指南.md)保持同一目标。
