# Matt与委派调查的Codex普通额度门禁

基线d86c132。完整S1五组保持，Schema242／项目库10／Host1不变；本批不把普通额度许可当作费用账单、Provider资格或完整验收。

源码显示正式Agent模型请求已显式要求`require_ordinary_permission/1.0.0`，默认Matt及其事实调查共用的Codex传输尚无强制该要求。将固定策略下沉为可信传输选项，并在默认安装工厂启用，覆盖Matt父方法和所有共用传输的委派方法。每次新模型发送前必须由原Codex后端明确允许普通使用，并核对账户；完成后继续采集同账户原额度快照。缺少、拒绝、过期通知或账户变化均拒绝或保留Unknown，不发送替代请求。

新传输启动格式7保存原始方法请求及独立`transport_usage_policy`。请求本身不被改写，已封口历史1—6仍按原格式和原字节只读重放；历史未封口请求不能因安装新策略重开。旧格式不追加策略标记，新格式缺失或更改标记应拒绝。默认CLI和工作台共用的Matt安装工厂固定该选项，序列化请求不能提供回调或批准标志；凭据仍由CLI本身管理，不读取登录文件。

完整降级反例实际证明，只固定可改写的start及seal仍不足：删掉全部额度RPC／通知、把start7改为3并重新计算摘要后，旧读取分支会接受。现在强制策略构造必须另外获得真实`AgentStartLedger`能力，不能把它放进可序列化配置。默认工厂传入原受保护安装账本；每个新操作在写start和spawn前，经Host1原writer以`codex_method_transport`命名空间原子选主，固定新格式claim摘要、原目录和操作目录物理身份。只允许首次created发送，丢start仍保留原票且不补写，读操作不能创建票。Host1现有1024票容量继续有效，未改变DDL或用户库。

第二轮复核发现Windows槽名别名：原操作目录丢失后，改变root或operation_key大小写会绕过直接字符串摘要，两个真实stdio反例都触发了第二次模型发送（PUBLIC服务器）。键现以`realpathSync.native`实际长路径折叠root短路径别名，并在Windows统一root与ASCII操作键大小写；保存的原输入、确切路径和物理身份继续独立比较，不能借键归一化修改原请求。修复后两个反例都在新目录／start／spawn之前拒绝。8.3路径归一化经源码复核，未另行制造或宣称8.3运行验收。

验证分阶段执行：最初门禁反例7失败／1通过；完整降级反例1失败／35未运行；Windows缺目录大小写反例2失败／40未运行。这些是修复前证据。修复及调用接线后七个完整文件140项通过／0跳过，随后键别名修复的额度整文件42项通过／0跳过；没有把早期局部跳过项算作通过。最终`pnpm check`、编译CLI帮助通过。独立工程复核的两项P2均修复，末次静态复核无新增必修；该复核不代表完整Matt或Superpowers验收。

报告保存在本机`.cimiloop/codex-2026-10-22/matt-ordinary-origin-final.json`、`matt-policy-case-final.json`，原失败也保留。默认安装工厂测试实际连接Windows受保护Host1、SQLite与共享澄清服务，但模型由受控拦截在发送前停止；不能代替真实模型／Skill行为资格。

## 默认入口实际验证

复用已明确批准的现有Codex登录及测试模型`gpt-6-luna`，使用先前已安装的真实Matt Git材料和固定`src/query.ts`快照。原项目／Change／安装与旧澄清会话均保留，另建独立澄清会话`f9845707-2ef5-4fcc-83ea-7ad0913bd55c`，原advance请求`5e54f93e-9d22-4ade-a3f4-850c6367389e`。通过编译CLI默认`clarification advance`实际执行，不注入模型或宿主工厂；再由默认认证工作台HTTP重放同一原请求。

实际结果：父Matt与`delegate_facts`独立调查各一轮真实Luna，两个新原启动均为格式7。两者都由后端在发送前明确允许普通额度使用，各采集前后两次额度读取且账户一致；共四次额度读取，未调用购买／积分重置。实际加载两个Skill入口、两个固定资源及澄清上下文后委派调查，最终得到一个待Human回答的问题。CLI和HTTP原响应重放一致，新增原操作／模型发送／Kernel业务事件均为0，没有Plan或Task。资格仍为`unqualified_method_execution`，`costs_reconciled:false`，不能据此确认Human选择、方法完整行为或费用。

真实调用约144秒完成。仓库外证据目录为`%LOCALAPPDATA%/CimiS1/codex-default-85a52568-85ee-4e0c-a57f-401efa4d4915/ordinary-permission-0f5b4f38-e0b7-4436-b316-3efac3a7c3d8`，含新操作UUID、请求、原响应、源文件／构建文件SHA256及只含必要事实的summary；原stdio和Host1票仍在原受保护安装中。测试脚本在本机`.cimiloop/codex-2026-10-22/run-matt-ordinary-permission.mjs`，不能重跑脚本替代旧请求恢复。第一次准备脚本误猜实例文件位置而在新会话创建前终止，修正为共享项目定位后才发生上述两轮真实调用；未修复旧原件或重发失败操作。

V1-21的默认真实方法和调查现已实际跑通本批额度边界，完整Human/Matt交互及方法资格仍未完成。V1-09的完整独立宿主、物理配额／全部写路径、账单与全部异常恢复，V1-22当前源码完整评审与行为对照，V1-10默认正式Agent执行组合，V1-11普通Change到ReadyForDelivery仍待完成。五组完整目标不变，未做全仓测试，也未将本批当作Windows/AppContainer完整验收。

先用真实stdio受控服务器证明旧行为会绕过该门禁，再实现并复验正常、拒绝／未知／账户变化、原响应重放、缺封口及跨版本原件。补默认宿主实际调用接线检查，再运行相关整文件、check、局部独立复核及文档检查后本地提交，不推送。

本轮先完成的Bun诊断未给出根因：两组环境继承／显式Unicode、DO_NOT_TRACK测试值对照（分别使用原安装路径与新自有runtime.exe副本，各8次无网络启动）未复现段错误；不能因此修改生产环境。新PUBLIC SDK进程附加元数据观察器后完成三轮受控SDK及HTTP缺原件拒绝，只记录到初始断点和退出0，LHShield64.dll仍在已加载模块列表。诊断改变进程调试状态，1通过／3未运行不能算正式SDK或稳定性通过。原失败保留，完整SDK回归仍未通过。

诊断源、报告和自有原件保留于本机`.cimiloop/codex-2026-10-22`、`D:/CimiS1/sdk-private-dd2dbb69/environment-ab-gLpF6G`、`environment-ab-FLjr1M`及`cimiloop-host-model-runtime-wA0lrF`。复制的临时测试入口已移出默认测试集合，未改变生产源码或历史Run。依据：[微软CreateProcessW环境块约定](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw)、[异常调试事件](https://learn.microsoft.com/en-us/windows/win32/api/minwinbase/ns-minwinbase-exception_debug_info)。
