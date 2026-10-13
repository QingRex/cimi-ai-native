# D-297 原 Skill 结果 Runtime 边界的新鲜读取

本批把同一结果封口内部相邻的两次原 Runtime 全量读取收敛为一次。私有 boundary.verify 每次仍比较原参数，实际读取同一 claim/input/key、原 Node/controller 二进制登记及 observer 原件，再与最初身份比较；它返回本次新鲜身份，readRuntime 在原 start 和 before 字节封口之后使用该返回值。完整 namespace/content 检查前后仍各自调用 verifyRuntime。没有复用上次核验结果、mtime/哈希缓存、旧 ALLOW、实时资格或账单批准。

这只减少最后结果封口中无回调隔开的重复读取，历史Host.known调用readResult/facts不经过该边界，因此不能声称减少第4模型发送前的340次候选历史读取，亦不能证明原父任务已能在30分钟内完成。原5文件50项Native组合为49通过1失败，当前父SDK→Skill子Native已有result但父第4模型仅请求未回件；该Run原截止、原结果和失败报告保留，不续期、不以新电脑查不到证明已清理。D-294当前领域结果3仍在隔离工作树，未作为main完整S1能力发布。

新增PUBLIC observer fixture绑定现有Job policy，覆盖Node/controller/observer原件丢失、同字节物理替换及原登记/Runtime input改变。首次9失败发生在缺Job policy的夹具准备阶段，未测到目标核验，不算产品红例；修正后的10项基线全部通过。PUBLIC二进制、模型、方法资格和账单不是真实Native/真实模型/真实Skill/S1证据。保留真实Kernel/Host/物理登记的契约证据和所有早期报告。

最终验证：隔离790源码/main788源码各自冻结，两者各自六文件完整74项通过、0失败0跳过、0源码漂移；覆盖原结果、原Runtime封口、原启动及Host票据。实现后两工作区pnpm check和main CLI帮助通过。普通独立工程复审未发现具体必修，未执行回归，不替代Matt/Superpowers验证。先前未实现去重的check报告单独保留，不混为实现后的证明。

下一步对当前父SDK→Skill真实Native路径按原30分钟预算建立新原操作复验，并收敛下一处有完整原账户和Kernel权限保证的重复核验；通用账户端口检查不能因接口同名被跳过，所有回调后的新鲜权限与账单核验保留。完整V1-09/21/22/10/11持续目标仍未完成，正式Agent默认入口保持关闭。

Schema242、项目库10、Host1不变；不升级用户库、不读取真实凭据、不发起付费请求、不push、不处理未知TMP或旧Unknown资源。

证据：[本批研究记录](../research/CimiLoop-skill-runtime-fresh-boundary-2026-10-14.json)、[前批工作台会话](2026-10-13-cimiloop-workbench-original-await-session.md)。
