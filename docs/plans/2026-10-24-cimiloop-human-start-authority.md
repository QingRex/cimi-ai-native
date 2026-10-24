# Human首次启动的原Kernel权威

固定发现基线e33f8a7。Matt Spec完整候选复审定位到Human启动端口仍动态读取可替换的Kernel方法；下层Agent启动、工具和模型权威不核对Human technical_owner，不能补偿这个边界。当前用户授权仍是完整S1五组；本批不启用未合格Runtime或重开旧Run。

1. 沿真实Kernel／SQLite角色撤销夹具，覆盖服务构造后、工厂等待后、Native前守卫及release等待后的Kernel对象／方法替换。先证明旧代码把缓存的旧许可认作当前Human授权。
2. 服务构造时固定原Kernel与原授权方法，调用其绑定函数；每次读取及可信回调前后核对同一项目／数据位置／实例／调用者／store／Kernel身份，且授权方法不可被替换。当前角色仍每次新鲜从原Kernel查询，不能把首次ALLOW缓存成后续许可。
3. 保持原操作只读恢复、同Run/UUID重放、失败清理和原件／预算不变。异步工厂完成后若撤权仍释放一次自有lease；release后撤权不得返回陈旧许可，不撤销已发生原效果。
4. 受影响整文件、check、CLI／工作台共享入口验证、独立工程复查、文档与本地提交；不push。受控staging不能当真实Native／模型或S1。

独立完整Matt Standards／Spec审查仍固定e789→e33，其报告不得被本修复改写；后续差异另作新鲜核对。更大的正式登录根、真实账单、物理配额、完整宿主和五组验收继续，不用这个修复替代。

## 实现与验证

服务现固定原store／Kernel及位置／实例，捕获并绑定原启动授权函数，在请求、工厂等待、Native前守卫和release后重新核对身份及原Kernel的当前Human角色。Kernel内部共享Human授权辅助函数改为JavaScript私有方法，不能再以同名公开属性替换。授权失败不重开Run、不返还Unknown预算；已发生的原效果保留，自有lease仍只释放一次。Schema242、项目库10及Host1未改变。

旧行为先被反例复现：八项边界反例失败；其中Kernel替身最初误用了不存在的local.caller，修正为原instance的真实local_operator后，四项Kernel替换反例仍失败。另两项启动／控制内部辅助函数替换反例失败。最终修复后，以下五个整文件57项通过、0失败0跳过，报告为`.cimiloop/codex-2026-10-22/human-start-authority-final.json`：

```text
packages/local-app/test/agent-runtime-human-start-local.test.ts   23
packages/local-app/test/agent-runtime-control-local.test.ts       16
apps/cli/test/agent-runtime-start.test.ts                         8
apps/workbench/test/agent-runtime-start.test.ts                   5
apps/workbench/test/agent-runtime-start-ownership.test.ts         5
```

Node24.22.1／pnpm12.4.2；`pnpm check`通过。独立工程复查本批源代码及测试未发现可操作问题，未把已有完整Matt审查检查点改写成完成。这些测试包含实际Kernel／SQLite撤权、编译CLI及认证工作台HTTP；Native启动为受控替身，无新增真实模型请求，不是全仓测试、Windows/AppContainer执行或S1验收。
