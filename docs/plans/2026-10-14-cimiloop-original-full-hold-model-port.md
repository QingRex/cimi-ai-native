# D-298 原持久账户完整 hold 与正式模型发送组合

父 Runtime 的 openDedicatedPersistent 和子 Skill 的 createModel 现在实际安装原 Ledger owner 创建的冻结模型账户端口。只有实际账本实例在 initialize/open 完成原账本审计后才获得私有品牌；导出工厂捕获固定 owner 方法，端口绑定同一 scope、connection、profile 和 admission。模型工厂在重新包装方法之前检查私有 WeakMap；复制对象、同名接口、布尔标记和替换公开 helper 均不能获得合并能力。

账户的状态、原资料以及 read/checkOriginal/validate/finances/hold 等核心改为 ECMAScript #private，full-hold 闭包直接调用固定核验。每次都在独立准入 await 前后完整读取原账户/Host/物理身份、scope关系、账单与资金，并两次核对 exact 原 hold；父 Local 的原Run Kernel guard、子 Local 的原Skill Kernel guard保持等待前后和预约 beforeHold 临界检查，严格同步 void 守卫拒绝Promise/函数thenable/false，不执行任意thenable。

只合并发送前两组相邻 check+hold；通用端口继续执行原check+hold，首次准入、预约原临界检查、凭据等待后的权限检查、TLS后最后完整hold检查和原DNS pin均保留。不存在跨await缓存ALLOW、资金或权限，也没有重发/释放未知预算。按源码计数正常genuine路径可少四次Local Kernel核验，这不是实际耗时或30分钟Task通过结论。

最终原账户契约验证完成，实际Native仍运行中。新 owner API 缺失时六个聚焦用例失败，另16个旧用例因过滤未执行，不能当完整基线；实现后初步实际四文件93项通过，命令里不存在的child专用测试路径被Vitest忽略，已明确排除并修正runner为逐个检查文件存在。后来补入genuine实际本地TLS、凭据等待后准入撤销、复制假品牌泛端口和原Human取消await反例，最终两工作区各自完整13文件193项、0失败0跳过、0源码漂移通过，main788源码、隔离790源码；两工作区check和main CLI帮助通过。PUBLIC资格、账单、模型和凭据夹具不是付费智谱/真实Skill/Native/S1证据。

普通独立工程review未发现具体必修，核对固定owner、父子接线和历史兼容，但未执行测试，不替代Matt/Superpowers。账户原SQL1/SQL2历史、项目库10、Host1与Schema242保持；不迁移或升级用户库。原Native5文件50项49通过1失败、当前父30分钟到期与第4模型请求未回件仍保留；本批正式组合接通后已开始相同预算的新原操作完整5文件Native复验，仍运行中，不能抬旧期限或重开旧Run；普通600000ms/父1800000ms不变，源码790冻结，尚无新终态。D-294当前领域结果3仍留隔离树，main最后封口D-297已独立提交，不合并旧工作树过时模型/工作台源码。

默认正式Agent关闭；完整V1-09/21/22/10/11持续目标保持。未读真实凭据、未付费、未push，未知TMP和旧Unknown资源未处理。

证据：[本批研究记录](../research/CimiLoop-original-full-hold-model-port-2026-10-14.json)、[前批新鲜结果封口](2026-10-14-cimiloop-skill-runtime-fresh-boundary.md)。
