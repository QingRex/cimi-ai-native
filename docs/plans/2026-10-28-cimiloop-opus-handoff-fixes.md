# Opus 交接前：原回执恢复与专用模型结果核验收尾

基于bf40232。用户要求收尾、正常推送，并由Opus 5.5完成全部剩余S1，不再等待Codex整体审核。原持续目标与自动续接均已暂停；S1仍未完成，完整范围见[交接文档](2026-10-28-CimiLoop-S1-Opus-5.5-交接.md)。

## 本批实际修复

Human准备命令丢失响应后，旧默认恢复只打开完整Codex安装。本地provider或执行程序丢失会阻断原回执读取。现仅借用原dedicated／Codex保管来源，按原command_id和受保护Human→Agent映射、Kernel回执摘要选择唯一来源，不开账户、凭据、模型或完整执行材料，不重新执行命令。即使两来源映射JSON相同也拒绝歧义；每次await和回调后核原应用身份，全部借用句柄按原释放函数释放。独立复核发现最后finally外部回调可在唯一性终检后增加第二映射，已以真实反例修复；释放后仅做纯身份检查，不再运行可修改原件的回调。

具名方法结果／取消此前只独立核验Codex内层原件。专用模型即使提供方响应或采集blob丢失，外层SDK回执仍可完整，旧方法读取器没有拒绝。新增中性模型原件读取路径，按原header／模型绑定／scope／原预约身份／完整call和采集字节复查专用模型；成功与取消消费者均接线，并在返回前重读原件。历史Codex消费者保留原返回形状，不把本地provider重标为Codex身份。

完整提供方原件继续由既有local-app的provider块唯一持有，不重复拼入method块；保持原1649项容量和历史输出形状，关闭独立复核发现的重复计数回归。不修改Schema242、项目库10、Host1、费用审批或自动迁移，不把原字节复核当模型／账户批准或费用结清。

## 实际反例、失败与验证

所有报告前缀为.cimiloop/codex-2026-10-28-，文件被Git忽略；以下是本机记录，不等于新电脑已复验。

- Human初始红测：human-provider-receipt-red.json，0过2失败4过滤，证明旧恢复尝试完整Codex安装，不能读取所选本地原件。
- Human首次两完整文件：human-provider-receipt-first.json，14过4失败0跳过；旧宿主12项通过，4项新增夹具因PUBLIC_read_guard不是合法Host namespace失败，已改合法小写namespace，未削弱产品检查。
- 最终回调首反例final-cut-red.json同样在夹具namespace处失败，不能作漏洞证据。修正后human-provider-receipt-final-cut-red-02.json为0过1失败6过滤，实测终检后的外部回调增加了第二来源。
- human-provider-receipt-final.json：新完整文件7过0失败0跳过。human-provider-host-targeted-final.json：旧宿主受影响4过8过滤，过滤项不能算通过。旧宿主完整12项通过发生在最终切点修正前，不称最终全文件单轮。
- 专用结果首红测dedicated-method-originals-red.json为0过2失败50过滤，其中一个用例错误假设不存在的collection3格式，不能作该漏洞证据。修正保持实际collection1后，dedicated-method-originals-red-02.json为0过2失败50过滤，两项均为应拒绝原件丢失而未拒绝。
- dedicated-method-originals-first.json：专用模型与Codex模型两个完整文件共120过0失败0跳过，使用PUBLIC账户／本地TLS／HTTP／构造模型；不是用户provider。此轮期间其他消费者仍有后续修正，不称最终全部源码冻结单轮。
- named-result-recovery-final.json：3完整文件17过35失败0跳过，其中取消夹具的正斜杠TEMP触发安全清理断言，现场保留。改用原私有目录的Windows反斜杠TEMP后，final-02为50过2失败0跳过；两项旧PUBLIC专用取消夹具只有占位header而没有内层原件，现明确提供受控独立原件端口和真实形状header，保留全部原成功／取消断言。named-cancellation-final.json整文件35过0失败0跳过。

最终消费者整文件回归handoff-named-readers-final.json为3完整文件52过0失败0跳过（输出语义2、取消35、输出策略15）；最终pnpm check通过。Human新完整文件7过及旧宿主定向4过／8过滤保持。独立增量复核发现的末尾回调与原件重复容量问题均已关闭，该复核不是最终真实Matt／Superpowers方法验收。

Windows/AppContainer原生整轮已实际启动，但用户决定现在转交Opus时尚未结束，**本轮不能计原生通过**。原命令是两文件skill-invocation-native-runtime.test.ts（成功／失败两项）与skill-invocation-cancellation-native-runtime.test.ts（一项），单worker；前置最终pnpm check已通过。原exec会话99703，最终报告目标.cimiloop/codex-2026-10-28-handoff-named-native-final.json。报告未出现前不能把超时、已有局部result或外层进程状态当整轮终态，不重复启动。

本机新夹具根C:\CH1028。交接时已创建_VDQFTs（18:32:22）及_gmb7fJ（18:44:13）。第一份子Native清理原件核到ended／exited／exit0／resources_disposed:true／cleanup_errors:[]，但它不证明该测试全部通过、账单或全族处置完成。其后的原测试仍可能继续运行；不终止不明进程、不清理现场。Opus接手先只读检查原报告和原操作终态，报告含失败则按原失败处理；原测试结束前不要重跑这轮或修改其正在使用的构建／源码来制造混合证据。

用户要求本次整理并推送开发交接版本，剩余原生整轮结果及完整S1由Opus接续。没有把上述待收取场景当跳过后的成功，也没有宣称当前提交全仓回归通过。

本批未发送用户本地provider模型请求，未读取真实凭据、安装真实费用／账单来源，未创建业务Plan／Task／Run；实际业务仍是Draft CHG-0001。没有运行全仓pnpm test或完整S1，也没有执行最终真实Matt／Superpowers评审。
