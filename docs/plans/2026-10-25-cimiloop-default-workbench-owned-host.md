# 默认工作台入口与新 Host 目录托管

基线 `8bfab832b80e9a3ff34292d3bc843f772e12860d`。上一轮已提交 Runtime／Skill 组合、父子用量及页面接线。本批继续实际默认入口和 Windows Host 拒绝问题；完整 S1 五组范围保持。

## 共享工作台默认入口

工作台可执行入口原来显式传入 `productionAgentRuntime`，直接调用 `startWorkbench` 的共享服务入口则没有默认工厂。因此，即使已安装同一项目的完整 Runtime 准入，调用者仍须重复提供工厂才能启动。

共享服务现在默认选择同一个 `productionAgentRuntime`，可执行入口直接调用 `startWorkbench({projectDir,port})`。可信代码提供的工厂仍按原方式消费。入口可用只表示服务接线存在；首次执行仍须通过原 Human Kernel 授权、完整 Runtime／模型／账户／预算准入。缺证不能启动，HTTP 也不能安装工厂或覆盖调用身份／模型／路径。原操作回读仍先于首次启动工厂，响应丢失不重开原 Run。

新增 HTTP 用例先实际复现两个失败：默认入口可用性为 false，原 Human 请求没有进入默认生产工厂。另两个负例通过。用例使用真实 HTTP、会话、CSRF、Kernel 和 SQLite，生产工厂是显式 PUBLIC 拒绝夹具，不构成真实模型或完整 Runtime 资格证明。

## Windows 新目录托管

此前默认费用入口在较长 D 盘临时根下编译失败，候选路径长度为260；换新短根后越过编译，仍在新 Host 目录保护阶段失败。原失败目录全部保留。

只读检查确认失败新目录已由当前用户所有，继承的权限未给用户 WRITE_OWNER。托管 helper 原来无条件再次 SetOwner；即使 Owner 未改变，Windows 仍会要求额外的 WRITE_OWNER。一个新自有目录、继承 Modify 权限的原生用例在修复前实际失败。

现在仅在实际 Owner 与当前 SID 不同时调用 SetOwner。已拥有的新目录只设置精确的私有 DACL，利用所有者已有的 WRITE_DAC。后续保护与核验仍要求当前 Owner、保护后的唯一用户 FullControl 规则及数据库文件的精确继承规则；没有放宽原 ACL 条件，也没有修改已登记／失败目录的权限。`protect` 仍只由新 Host 显式初始化调用，既有根不会被重新初始化或修复。

修复后，原 Host 完整文件4项与实时钟完整文件2项全部通过：实际 Windows 主体／目录／SQLite、跨进程唯一派发、原票据回读、权限漂移拒绝及64次新鲜核验均按各自断言执行。实时钟用例耗时10003ms，小于原15000ms限制，未延长生产 Task 或测试判据。这是 Host 托管原生验证；完整 AppContainer 执行链仍需单独验收。

helper 参数和身份输出格式、Host1、Schema242及项目库10保持；当前源摘要选择新的 helper 编译目录，不重写旧原件。没有提取／复制凭据或发送真实模型请求。

## 继续条件

完整 Runtime 生产资格读取器与默认装载仍未完成；Provider 受控评估中的固定缺项没有被本批改成批准。真实方法资格、固定卷／登录、账单、Human 原回答和真实 Change 交付仍须推进，最终 Matt／Superpowers 在完整链形成后进行。

本次查阅的 [OpenAI 定价文档](https://learn.chatgpt.com/docs/pricing) 区分订阅内用量、购买积分及 API 计费；[Usage Insights](https://learn.chatgpt.com/docs/enterprise/usage-insights) 也要求区分 token、积分和账单影响。这些页面没有为本仓库提供一个已核实的原调用现金账单接口。本批没有据此推断当前账号无此能力，也没有把订阅用量或 token 折算成已知现金。具体账单来源仍待用户提供。

C盘空间不足、专用固定卷与官方专用登录根仍需本机准备；方法真实 Human 问答不能由实现者代答。本批新增目录位于自有短D盘根，未删除、移动或处理历史 Unknown、Temp、映射或 Profile。默认不push。

## 最终受影响回归

分阶段10个完整文件49项通过，0失败0跳过；每个文件取其完整最终报告，不混合单用例结果。默认工厂新增4项最终通过；现有Human启动5项、原启动所有权5项、浏览器原请求恢复4项及准备入口1项均通过。实际Windows Host4项、实时钟2项、专用账户托管7项、原账单托管8项均通过，判据未放宽。

此前失败的默认Codex费用整文件9项本次完整通过，实际执行编译CLI、认证HTTP和浏览器读取，继续显示Unknown现金并保留预算。安装／登录／额度元数据和模型原件仍是PUBLIC夹具；没有真实模型或真实账单调用。这次新场景的通过不修复、删除或结清之前失败目录及其原操作。

Node24.22.1／pnpm12.4.2、`pnpm check`和工作台帮助通过。未运行全仓测试；完整AppContainer场景、真实固定卷／登录／账单、正式方法资格、真实普通Change交付及最终Matt／Superpowers仍未完成。C盘再次为0字节，不能把本次Host托管通过扩写成完整原生验收或物理配额验收。
