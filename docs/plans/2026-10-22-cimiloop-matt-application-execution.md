# 创建前 Matt 共享执行与原请求恢复

日期：2026-10-22，基线 `69365f1`。本批实现共享应用执行服务和 CLI／工作台异步入口，没有安装真实 Native／模型方法宿主，没有真实 Matt、付费调用或 S1 验收证据。

受信应用可通过 `prePlanMatt` 安装 `MattClarificationHost`。HTTP／CLI JSON、候选 Skill 描述均不能安装宿主。缺宿主继续明确拒绝。`advanceAsync` 先持久登记原意图再执行，绑定 Human、原 Change、会话、此前全部问答和请求摘要。这是创建前方法操作，不伪造 Agent Run。同请求只有首个登记者可 invoke；中断或丢响应重试只读原件，缺结果保持 pending，改输入或换请求不能越过待核对操作。

结果经两次读取、最后 await 后的同步独立核验及当前身份／会话守卫后入账。方法问题与未决项成为带确定身份的待回答问题，Human 沿用原 answer 动作回答。方法候选只是建议，不确认约定、不创建 Plan／Task。PUBLIC 夹具不增加真实调用计数。执行前检查输入字节与剩余回答／候选轮次；失败不登记 pending。输出问题数也受剩余容量约束。

## 兼容与剩余条件

Schema242、项目库10、私有澄清库 DDL／user_version1 不迁移。旧 Human 格式1及Plan格式2原输入／重放规则保持。新方法原件以显式 `cimiloop/pre-plan-matt-input/1.0.0` 和 `cimiloop/pre-plan-matt-original/1.0.0` 保存到前瞻性 matt 动作的 method_result，不回填历史调用。旧二进制遇到新方法结果应拒绝，不重解释或静默降级。

宿主仍须实现固定来源、完整 harness、模型／账户准入、受保护原会话和效果核验。端口本身不授予这些能力。Kernel 的独立 Matt Plan 核验门禁保持，受控方法输出不会自动通过 Plan／Task 创建。真实宿主、提供方账单与完整 S1 仍待继续实施。

## 验证

Node24.19.0／pnpm12.4.2，check通过。分阶段六文件72项通过、0最终失败0跳过，不是一次整轮72项：

- 新方法执行／实际HTTP12项：原请求重放、丢响应恢复、缺原件、拒绝未核验输出、Human变更、会话过期、输入及轮次容量、最后异步读取后原件撤销、拒绝JSON宿主；宿主为PUBLIC受控实现。
- 既有共享 Plan 门禁18项、HTTP门禁2项。
- 既有 Human HTTP／编译CLI／实际跨进程竞争／原收据恢复／历史容量与损坏拒绝12项。
- IPC20项、IPC原字节／SDK关联8项。这不是D-232原全部十文件59项或完整Native复验。

中间失败保留：新入口初始6项失败；后一次测试引用不存在的fixture字段使身份用例失败，已修正。输入容量和剩余轮次各有实际失败反例后修复。既有HTTP末项在累积三份64轮最大中文会话后两次超过默认15秒（约15.9–17.3秒），无断言不符；测试时限与相邻大历史案例一致改为120秒后整文件通过，末项16.019秒。产品期限、容量及全部原字节／无副作用断言未放宽。

独立工程复查发现并关闭三项：最后异步读取后的原件核验、超限前登记、负剩余轮次；最终只读确认无新增must-fix，未另跑测试，不是最终Matt／Superpowers验收。

本机原报告在忽略目录 `.cimiloop/codex-2026-10-22/`：clarification-matt-red.json、clarification-matt-green.json、clarification-capacity-red.json、clarification-matt-recheck.json、clarification-rounds-red.json、clarification-ipc-final.json、clarification-matt-final.json。不覆盖中间失败。
