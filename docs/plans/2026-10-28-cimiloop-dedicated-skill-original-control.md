# CimiLoop 本地 provider 子调用原宿主控制

从 `a3a3e0b` 继续默认生产主链。共享原子调用控制来源现在支持 dedicated 与历史 Codex 两类原安装；既有 CLI／工作台的 query、collect、stop、recover 仍通过相同应用服务调用 Kernel。没有新增业务 Run、模型或账户工厂。

## 实际变化

`productionSkillRuntimeOriginals` 只打开已有的原 custody。每个来源都必须由 `LocalSkillInvocationStartCustody.accountScope` 完整核对原 admission ticket、独立 admission anchor、原父范围和 record，才可借出来源；不是按当前 provider 字符串、候选包或目录存在性选择。dedicated 原票据匹配后不再打开无关 Codex 来源。

无关来源不匹配时只关闭本次借用句柄，再寻找原票据对应的历史来源；不会在另一 Host 补建 admission 或 dispatch，也不把关闭只读账本句柄当作 Native／模型资源已回收。缺失或无法核对仍为 Unknown／不可用，不产生清理、领域完成、RunObservation 或费用结清证明。

local／Kernel／授权方法、原 Human 和原子调用快照在 await 后及每个 guard 都复核。读取期间身份改变即拒绝；返回的固定 Skill 输入读者仍核对原方法包，不能用新 provider 的输入替换历史调用。旧 Run 不因当前 provider 切换而改换原宿主。

## 实际验证

- 新两个反例 **0通过、2失败、6过滤**：旧工厂只读 Codex，无法打开 dedicated 原子调用；无关 dedicated 句柄没有被核对及关闭。报告 `.cimiloop/codex-2026-10-28-dedicated-child-control-red.json`。
- 修复后整个 `named-skill-capture-local.test.ts` **8通过、0失败、0跳过**，报告 `.cimiloop/codex-2026-10-28-dedicated-child-control-first.json`。包含新来源、旧来源与无关 Host 共存、缺失／异 Host 不补写，以及既有默认控制／采集来源与原方法包缺失拒绝。
- `pnpm check` 通过。独立增量工程复核未发现确定阻断，确认路由保留原身份、await 后复核和释放语义。

该文件使用实际 Kernel／SQLite／Host1 算法和原 admission／dispatch，安装 opener 及 Native 采集为明确 PUBLIC 端口；不是本机实际模型／Skill、Windows 资源恢复或 S1 验收。没有重跑不受影响的控制套件、全仓测试或发送真实模型请求。本批不改 Schema242／项目库10／Host1，不push，旧六文件及历史 Unknown 保留。

## 继续主链

本地 provider 默认完整生产宿主、持久共享账户的正式预算／账单读取、全写根／历史容量及完整异常恢复、真实方法资格与 Human／Matt 澄清仍须继续。原固定卷绑定和本次原子调用控制来源不能替代这些门禁。真实业务项目仍为 Draft CHG-0001，无业务 Plan／Task／Run；安全连接保存及计费说明两个原问题保持待答，不重复提问或复制聊天密钥。
