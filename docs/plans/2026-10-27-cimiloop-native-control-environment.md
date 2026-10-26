# 默认 Native 控制进程的原环境接入

接续 `ec86a9f`。编译器及文件写入代次辅助器已使用所属根，Native控制器、IPC、文件broker、时钟和卷读取器仍会继承宿主用户目录。本批把实际默认辅助进程接到原私有环境，并保留查询／恢复的只读语义；完整S1五组继续。

## 实际能力

每个工具所属根首次准备一份 `native-process-environment/original.json`，固定所属根及环境目录的物理身份，HOME／USERPROFILE、AppData、PROGRAMDATA、TEMP／TMP和cwd均在该根内。不带登录目录或凭据，不改变父环境。绑定实际辅助程序的字节摘要和物理身份，启动、收取原结果、继续执行及效果前后重新核对。目录或同字节辅助程序被替换时，不能安装另一个绑定覆盖旧事实。

同一默认链的沙箱／身份观察器／Job观察器、IPC、文件broker、固定检查控制器、Host1、固定卷读取器均安装并消费该环境。隔离调用的Node监督进程及原SDK技术契约调用也选原控制器环境。后台进程在已知工具／保留二进制布局中只读定位原根，不把路径选择变成创建或安装权限。时钟Worker传递的只是原根选择，在Worker中只读重开并核对，不传递父环境、登录或安装能力。Codex模型Job监督进程与模型仍沿用已固定的私有模型环境；独立Job资源查询在现存原环境可读时只读恢复它。

安装是新执行之前的宿主准备，不修改旧Run或重新派发。已有完整辅助程序可前瞻绑定新环境；环境目录已存在却缺少原件时保持部分状态，不修复。读取原环境及原观察器不创建缺失目录或编译器。旧记录没有这份原环境时保留原读取语义，不伪造新配额证明。旧固定卷读取器也只读取其原二进制和OS事实；只有存在原环境才只读恢复它，缺少该新事实不能证明全部写入都受配额。新安装仍在执行前绑定原私有环境。

原Agent查询改为只读打开已安装的身份观察器：实际新执行在Run登记前已准备它。旧／部分记录缺少观察器时，返回 `Unknown/agent_original_observer_unavailable` 并允许采集原件，资源false；不临时编译，不推断原进程已停。取消和原Run身份继续由既有Kernel服务核对。

内部新增原环境格式1及可选Worker字段，不改变公共Schema242、项目库10或Host1；旧Worker帧继续按原结构读取。旧六个未跟踪文件、旧Unknown资源及已知费用状态不动，默认不推送。

## 实际验证与失败

Node24.22.1／pnpm12.4.2。本批真实模型请求0，模型和账户仍为PUBLIC。

- 实际C#辅助进程先1项失败：用户目录未位于所属根（`native-environment-red.json`）。随后四完整文件16项通过，包含实际进程环境／cwd／写入及既有时钟通道（`native-environment-first.json`）。
- 首轮九完整文件84通过、11失败、0跳过（`native-environment-full-first.json`）。11项暴露旧只读卷读取器／PUBLIC夹具没有新环境时的兼容问题；中间曾为明确单元夹具加环境seam，最终移除该seam，由产品按旧只读语义兼容，并明确旧事实不是新环境或完整写根的证据。真实卷读取器不使用该seam，旧读取器也不在查询时安装环境。
- 六完整文件第二轮76通过、1失败、0跳过（`native-environment-final.json`）。父原件夹具原先依靠查询时临时编译观察器；现明确先验证缺失观察器返回Unknown且不创建环境，再模拟真实启动阶段准备观察器，之后查询／采集仍不虚构完成。
- 后续完整父记录文件26项通过（`native-environment-parent-final.json`）。随后补齐缺失观察器返回Unknown的产品行为及断言，父记录／原Run两个完整文件39项通过、0失败0跳过（`native-environment-query-final.json`）。
- 后台进程与隔离入口接线后，五完整文件32项通过、0失败0跳过（`native-environment-composition-final.json`），包含真实Windows/AppContainer、本地HTTP／SDK网关、修改后的固定Node检查、原Host1／时钟和环境六项行为测试。
- 最终兼容修正后，环境／真实卷读取器／原PUBLIC卷策略三个完整文件31项通过、0失败0跳过（`native-environment-compatibility-final.json`），保留原PUBLIC夹具，未增加环境seam。按各完整文件最新结果合计16文件174项分轮通过，不称最终源码一次全范围验收。

最终 `pnpm check` 通过，含源码及测试工程类型检查；文档UTF-8、围栏、相对链接及 `git diff --check` 在提交前核对。Windows/AppContainer通过不等于真实模型／账户／技能或S1通过，分轮结果不称最终同一源码的一次全仓验收，早期失败不改判。

## 仍需完成

本批证明代码安装的环境、目录身份及实际PUBLIC写入，尚未证明官方程序所有系统API写入都被OS限制在固定卷。目录映射不能转为完整 `disk_limit` 或四项生产控制的supports。网络主机限制、完整OS写入约束及历史容量、真实费用结清、全族恢复仍需继续实施；完整控制读取器尚未全部装入默认Provider核验器。

固定卷证明／同卷官方登录／真实账单及原Human问题的回答等外部条件仍缺。真实Skill、普通Change到ReadyForDelivery、接入指南实走与最终Matt／Superpowers评审继续未完成。
