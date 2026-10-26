# Codex 生产组合的私有用户目录策略

接续 `c463c46`，完整S1五组保持进行中。本批修正生产模型进程仍继承系统盘用户目录环境的实际缺口，为完整物理配额控制准备可核对的写入范围，不把这一项修正当作完整配额或生产资格已经成立。

## 执行行为

原 `private_login_home/2.0.0` 只固定官方登录目录、SQLite／日志及临时目录；HOME、USERPROFILE、LOCALAPPDATA、APPDATA、PROGRAMDATA仍可来自父进程。安装、账户、仓库、数据和登录目录在同一个VHD上，不足以证明这些潜在用户目录写入也被覆盖。

新增代码安装的 `private_user_directories/1.0.0` 环境策略。新进程的HOME／USERPROFILE固定为原操作 `state/user`，AppData的Local／Roaming在其下，PROGRAMDATA固定为 `state/program-data`，TEMP／TMP在原 `state/temp`。CODEX_HOME继续选择已绑定的官方登录目录，不读取或复制凭据。环境键按大小写无关方式剔除父进程对应值，然后显式设置固定路径；父进程本身的环境不改变。

所有私有目录在启动前创建并固定物理身份，原效果守卫在等待后和每次效果前复核。该策略必须同时有原私有登录、owner Job和独立Host1来源；一个环境标签或客户端JSON不能替代这些能力。普通Run、Skill子调用、Skill隔离调用、Runtime技术契约四个默认组合已安装该策略，CLI／工作台无需手工传环境对象。

## 原件与兼容

内部方法start11明确保存环境策略和完整目录映射，进入原claim及独立Host1请求摘要。内部模型header20／21／22分别用于普通／父任务／具名方法，固定原环境策略；新记录改成旧header或移除新策略会被拒绝。原方法start1—10、模型header1—19继续按自身原语义重放，当前新默认组合不能把旧pending操作静默升级或再派发。

这不改变公共Schema242、项目库10或Host1格式，没有用户库迁移；新策略只用于新的代码组合及原件版本。固定SDK工具、账户ordinary权限、容量持有、原请求身份、Job清理及费用未知规则保持有效。

## 验证

Node24.22.1／pnpm12.4.2，本批真实模型请求0。PUBLIC stdio程序和账户不是真实模型或费用资格。

- 实际Windows子进程反例先1失败、8项过滤：父用户目录仍被继承，`contained:false`（`.cimiloop/codex-2026-10-27-private-environment-red.json`）。反例只记录非秘密目录路径；只有全部路径位于该PUBLIC测试根时才写测试文件，未向系统盘用户目录写反例文件。
- 首次实现后同一实际Windows用例1通过、8项过滤（`private-environment-first.json`），核对实际环境、目录内真实写入、start11原映射及只读重放。
- 普通／父任务／具名方法三个定向模型接口用例3通过、61过滤（`private-environment-codec-first.json`），验证header20／21／22、原建议回执重放不新增调用、降级header拒绝。过滤项不计该文件通过。
- 后续增加原环境映射篡改拒绝、真实Native双阶段使用新策略，以及父环境键大小写的规范剔除。完整八文件106项通过、0失败0跳过（`private-environment-full.json`），包括实际Windows／AppContainer、SDK双阶段；其中模型与账户仍为PUBLIC。随后补三个非法策略反例，进程测试完整文件最终12项通过、0失败0跳过（`private-environment-job-final.json`）。按每个完整文件最终结果合计八文件109项，分轮执行，不称一次109项整轮或全仓通过。
- 最终 `pnpm check` 通过（Node24.22.1／pnpm12.4.2，源码及测试工程类型检查），`git diff --check` 通过。旧进程句柄在接续时已不可用，测试结果依据上述已保存报告核实，类型检查重新执行成功；不据已失效句柄推断结果。

旧六个未跟踪文件不读取、不散列、不暂存或删除；没有修改旧Unknown资源、重开旧Run或释放原预算。未推送。

## 控制来源仍需完成

本批证明声明的用户目录环境和实际测试写入已固定，不能扩大为所有OS写入均受配额或完整 `disk_limit` 已通过。检查源码仍发现编译辅助程序的临时环境、安装／登录检查进程，以及全部OS资源／历史容量需要进一步覆盖或独立核验；官方程序的系统API目录行为也不能仅由环境变量推断。四项完整网络／费用与上限／物理配额／恢复读取器仍未全部装入生产路径，默认正式Agent继续受门禁限制。

接续完整生产组合时须消费实际原件及真实固定卷证明，而不是把本策略字符串转成supports。固定卷prepared.json、同卷官方登录目录、真实账单与原Human问题的回答等缺项保持明确；真实Skill、普通Change到ReadyForDelivery、指南实走、Matt／Superpowers最终评审和完整S1继续未完成。
