# D-299 共享 Human 原费用提交的同步 void 守卫

共享费用服务此前只拒绝对象 thenable，false 与函数 thenable 仍可能进入 Kernel 提交或返回原回执；Promise.resolve 还会读取 getter 并执行任意 then。内部观察器虽已使用严格守卫，外层 authorize 返回 undefined，无法替它发现嵌套的错误返回值。

现在共享 record/reconcile 的 authorize 要求 beforeCommit 返回 undefined。固定原 Promise.prototype.then 只为真实 Promise 安装拒绝处理；其他返回值立即拒绝，不访问用户 then。原 Human/location/Run 输入继续新鲜复验，原 guard 错误身份和已有账户 lease 释放保持；这不赋予账单写入或运行权限。

18 项独立矩阵覆盖入口、账户 await 后与 prepared 存在后的六种返回值，另 1 项覆盖已存在回执的 false 返回。实际 Runtime collector、原模型/TLS与账单材料、Kernel 原回执用于验证：拒绝不产生事件，prepared 原字节保持，同一 command_id/时间/expected_revision 恢复只采集一次，回执重放不重开账户、不重复事件或模型发送。矩阵直接覆盖 record；reconcile 复用相同核心，其终态条件通过既有完整父/子/家族回归验证，不声称新增矩阵分别遍历 reconcile。

首次分组红测 4 失败且组内首失败遮住余项，仅保留作探索；拆成独立矩阵后实际 13 失败、6 通过。修复后聚焦 19 通过；这些运行均过滤掉 11 个旧项。最终完整受影响 9 文件 80 项通过，0失败0跳过，source-before/after 788 文件零漂移，类型与构建检查、CLI帮助通过。普通独立工程 review 未发现具体必修但未执行测试，不是 Matt 或 Superpowers。

独立 Native 五文件复验尚无整轮终态，当前父 SDK→Skill 领域结果场景已报告 1 项失败；最终错误详情仍待整轮报告；隔离树 790 源码保持冻结，原普通 600000ms/父 1800000ms 预算不变。 原 Native 49 通过/1失败记录不改判。本批不是 Windows/AppContainer 新验收或 Native 性能证明；PUBLIC 模型、资格和账单不是付费智谱、真实 Skill 或 S1 证据。Unknown 运行不因费用 Known 自动成功、结清或释放预算，Task 仍需领域及验收链路。五组持续目标保持 active，具体模型/套餐/现金与积分上限仍待确认，未读真实凭据、未付费、未push。用户库格式10、Schema242、Host1保持；未知 TMP 和旧 Unknown 资源未处理。

证据：[研究记录](../research/CimiLoop-original-fee-void-guard-2026-10-14.json)、[原工作台 await 守卫](2026-10-13-cimiloop-workbench-original-await-session.md)。
