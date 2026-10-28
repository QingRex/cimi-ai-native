# CimiLoop 本地 provider 原安装与默认选择

从 `b72f0a1` 继续共享专用账户 Runtime。本批完成实际 CLI 安装、只读发现和工作台元数据接线；**本地 provider 的默认完整执行宿主仍未完成，S1 未通过。** 安装回执明确返回 `model_dispatch_available:false`、`provider_qualification_proven:false`、`costs_reconciled:false`。

## 实际可用操作

CLI 新增 `runtime install-local-provider` 和 `runtime local-provider-installation`。前者显式接收仓库外连接元数据、固定 Native／Node 程序、固定检查 JSON 和同卷仓库外放置根，复制并封存到实际 Windows Host1 原安装。只登记元数据和程序，不读取或解密凭据，不连接 provider，不建立账户或业务 Run。

```text
runtime install-local-provider --connection <仓库外model-connection.json> --native-binary <固定opencode.exe> --checks <固定检查JSON> --placement-root <同卷仓库外根> --yes --project-dir <项目目录> --json
runtime local-provider-installation --project-dir <项目目录> --json
```

`--node-binary` 可显式指定；默认固定本次 CLI 自身的 Node 程序。示例仍有待配置项，不是本机真实业务安装已执行的证据。当前连接只接受受管 loopback 格式2；不能借此调用旧 Native 明文连接路径。

安装保存唯一原请求、程序与元数据的字节摘要／物理身份、原件目录身份、Human／项目／实例绑定。重复安装原材料返回同一原安装；改变检查或放置根拒绝。打开不会补写丢失的 Host1、程序或原件目录。只读 custody 不携带程序、连接或派发能力，程序丢失后仍可借用原身份用于后续历史控制。

所有路径按最近存在祖先的真实规范路径核对，识别现有 Windows 8.3 短名；没有创建 alias、映射或链接。Host1 await 后及返回前非修复式重读 placement；丢失即失败，不在查询中重建。账户未来放置根与安装／工具根都在显式同卷放置根下，没有改用系统盘默认账户路径；这仍不证明全部写根已被 G2 核验。

工作台认证后的 `/api/context` 新增 `selected_runtime`、`local_provider_runtime_installation`。安装存在与可执行资格分开呈现。新执行优先遵循本地 marker；安装损坏或完整控制来源缺失时拒绝，不回退到旧 Codex 登录。旧账户账单和原资源读取保持原路径。

增量复核发现前置 Human 准备及旧 Matt 仍可能借用旧账户，已补动态选择 fence：新 Codex production host 在打开及租约 guard 时拒绝；旧／受控 Matt 的 prepare、invoke 和 beforeEffect 同样拒绝新效果。Matt 保留原 contained＋legacy 合并读取，工作台不把历史宿主显示为当前可执行 Matt。历史读取可能核对原账户及登录目录，不等于登录、恢复登录子进程或模型派发；没有删除或升级历史安装。

## 实际验证

使用显式运行环境 Node24.22.1／pnpm12.4.2。系统默认 PATH 的 Node 为24.14.0，不能用作本仓库合格运行环境；本批检查、Vitest 和编译 CLI 子进程均使用前述显式 Node。

- 新安装入口反例：**0通过、6失败、0跳过**，缺少导出。报告 `.cimiloop/codex-2026-10-28-dedicated-installation-red.json`。
- 首轮实际安装整文件：**2通过、4失败、0跳过**；解析器的 null-prototype 对象与普通 placement 深比较不一致，改为校验后 JSON 原值规范化。报告 `...-dedicated-installation-first.json`。
- 第二轮：**5通过、1失败、0跳过**，多次实际 Host1 打开的 custody 用例超过默认15秒；其余程序替换、原件缺失及安装重放通过。报告 `...-dedicated-installation-second.json`。
- 独立复核两项路径／await 反例加入后：**5通过、3失败、0跳过**，两项错误地 resolve，另为上述15秒超时。报告 `...-dedicated-installation-interleave-red.json`。修复真实路径和非修复式 placement guard，只将该多 Host1 用例设为60秒测试预算，不改生产期限或断言。随后整文件 **8通过、0失败、0跳过**，报告 `...-dedicated-installation-fixed.json`。
- 默认选择反例整文件：**5通过、2失败、0跳过**；旧实现返回 Codex 选择并尝试其账户打开。报告 `.cimiloop/codex-2026-10-28-local-selection-red.json`。
- CLI／工作台／默认选择接线后，**4完整文件22通过、0失败、0跳过**：新安装10、provider-choice7、fee-authorization1、工作台默认入口4。实际编译 CLI 重放与发现、认证 HTTP 元数据均执行；报告 `.cimiloop/codex-2026-10-28-dedicated-installation-composed.json`。
- 旧前置宿主选择反例：**0通过、3失败、22过滤**，报告 `.cimiloop/codex-2026-10-28-local-selection-old-hosts-red.json`。修复后定向 **4通过、0失败、21过滤**，含旧 Human 原准备回执恢复和历史 Matt 来源读取，报告 `...-local-selection-old-hosts-fixed.json`。过滤不能算两个文件完整通过；此修复晚于上述4文件整轮。
- 历史读取复核反例：**0通过、1失败、3过滤**，旧快捷分支在切换 provider 后只回读 legacy，漏掉 contained 原件而返回null。报告 `.cimiloop/codex-2026-10-28-local-selection-contained-reader-red.json`。移除该快捷分支，保留原合并读者与新的执行 fence；随后整文件 **3通过、1超时、0跳过**，报告 `...-local-selection-contained-reader-fixed.json`。新增用例实际168.4秒，四个正向读取入口重复完整原账户、程序／home和卷审计，超过原120秒；仅该用例改为240秒测试预算，全部断言、生产期限和资金控制不变。最后定向 **1通过、0失败、3过滤**，实际170.5秒、exit0，报告 `...-local-selection-contained-reader-budget-final.json`；与先前三项通过合起来是各项最新结果，不是一轮整文件全绿。该套件用 PUBLIC 结果／OS端口验证路由，不认证真实模型或方法原件。
- 最终类型检查已通过；增量独立复核确认前述路径、选择及历史读取缺口关闭。编译期间曾发现辅助函数未导出和新测试中两个 optional／undefined 类型错误，均修复后复验，不能以 Vitest 转译成功替代类型检查。

安装套件用实际 Windows Host1／SQLite 和原件，程序为 PUBLIC whoami 副本且不执行；选择套件部分使用 PUBLIC 账户／资格 seam。这不是实际 AppContainer 新 provider 组合、真实模型／Skill、账单、Human／Matt 方法或 S1 验收。没有运行全仓测试或发送用户模型请求。

## 下一步主链

继续把本原安装、同 Host1 的持久专用账户、完整独立 Runtime 控制来源、父子 Skill 目录及原结果核验接到默认生产宿主；安装存在不能替代这一步。需要真实模型输出上界、账户与计费控制及逐请求账单的独立依据，不能把 `/models` 价格、模型名称或本地 socket 当费用批准。

本机安全输入窗口尚待保存，原结果／连接文件未出现；已向 Human 提出的计费方式问题保持待答，不重复询问、不复制聊天密钥。真实项目仍只有 Draft CHG-0001，三方法包仍为候选，无业务 Plan／Task／Run，尚无 ReadyForDelivery。后续继续真实 Human／Matt 澄清、方法资格、异常恢复／全写根和最终评审。Schema242／项目库10／Host1不变，不迁移、不push，不动六个未知文件或历史 Unknown。
