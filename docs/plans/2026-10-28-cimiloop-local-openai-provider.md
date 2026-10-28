# CimiLoop 本地 OpenAI 兼容连接接续

## 当前选择与边界

用户本次改选 `http://127.0.0.1:3425/v1`、`codex/gpt-6-luna`，不再使用 Codex 登录作为新执行的连接。停止本次已核对父子身份的登录子进程，保留原启动、失败回执和目录；不删除或读取历史登录文件。用户在聊天提供过的密钥不复制到代码、文档、命令、日志或测试中。仓库外配置只引用当前用户 DPAPI 密文。

开发工具仓库基线 `0c3a960a261ad259b26b1d95081fd049ca04f724`。远程 main 本轮只读核对仍为 `e789902379534c6e36ea6ebc14266ed5167b761c`。不 push，不迁移 Schema242／项目库10／Host1，不处理六个既有未知文件。

## 已实施的执行通路

新增显式连接格式 `cimiloop/dedicated-model/2.0.0` 和 `loopback_http/1.0.0`。只接受规范字节形式的 `http://127.0.0.1:<1024..65535>/v1/chat/completions`，允许该模型的分层名称。历史格式1的公网 HTTPS、端点和凭据约束不变。

新增独立 loopback TCP boundary。它只连接精确的数字地址与端口，检查实际对端、连接所有权、一次消费和有效期。观察声明为 TCP peer，不生成 DNS／TLS／证书字段，不把本地代理视为上游模型或账户身份凭据。受管 Agent 请求复用原账户保留、发送前原意图、实际请求／响应字节及不可变回执；响应丢失继续 Unknown，重放不能重连或重发。HTTP 路径拒绝代理、重定向和自动重试，错误／响应及解析结果继续检查凭据披露。

独立复核指出旧 Native probe 也复用连接解析器。本批在 `start`、保存请求验证和旧 endpoint 投影处显式拒绝格式2，拒绝早于原操作登记、supervisor 身份探测、凭据读取及 Native 启动。局部 HTTP 方法门禁不能代替这项全入口检查。旧格式1读取及执行约束保持。

这已经是账户／原请求路径中的实际 transport 实现，不是另一个仅保存探针结果的入口；但默认 CLI／工作台完整生产组合仍未切到新连接。既有生产费用准入不因新 URL 或模型选择变为通过。下一批须接共享应用服务、固定检查、Native／SDK／工具／模型／账户与真实 Skill／Matt，并提供真实控制及账单来源。

## 实际验证

- 新连接／模型名称两个反例在旧实现失败；六个实际 HTTP fixture 反例在缺失实现时失败。分别保留 `local-provider-connection-red`、`local-provider-http-red` 报告。
- 旧 Native 三个入口反例修复前 **0通过、3失败、0跳过**。其中 start 当时晚到网络拒绝，另外两处没有格式2拒绝；不是已发送模型请求的证据。报告 `.cimiloop/codex-2026-10-28-local-provider-native-denial-red.json`。
- 修复后五个完整文件 **106通过、0失败、0跳过**：connection、agent-dedicated-model、loopback-agent-http、loopback-native-denial、gateway-http。报告 `.cimiloop/codex-2026-10-28-local-provider-reviewed.json`。真实 TCP／HTTP／旧 TLS fixtures；模型、账户与账单均为 PUBLIC 受控数据。
- 两个既有完整 Windows 文件 **18通过、0失败、0跳过**：adapter 13项、execution-policy 5项，实际编译并执行 Windows AppContainer。报告 `.cimiloop/codex-2026-10-28-local-provider-legacy-native.json`。它们验证受影响旧 Native 路径，不是新 provider 与正式 Native 组合验收。
- 修改后 `pnpm check` 通过，独立增量复核确认旧 Native 缺口关闭，`git diff --check` 通过。不是全仓测试、正式 Matt／Superpowers 或完整 S1 验收。
- 实际本地 `/v1/models` 无鉴权 GET 返回200、46个模型，目标模型存在。未发送 Chat Completions／模型请求。只保存状态、大小、摘要与目标存在性，不保存响应正文；原记录位于专用卷证据目录 `local-provider-model-discovery-01.json`。这不证明模型行为、请求输出上界、账户、费用或真实上游。

## 真实业务环境已准备的部分

在独立核对的4GiB固定卷创建 `R:/projects/cimi-ai-native`，从工具基线无 hardlink 克隆，分支 `codex/s1-workbench-state-filter`。使用默认 CLI 真实初始化项目并创建 `CHG-0001`（Draft／Active），需求为用户选定的“工作台原运行列表按状态筛选”。默认工作台进程已打开该项目；没有代替 Human 回答正式澄清，没有创建 Plan／Task／Run。

固定 Matt 来源 `6fd947921b935b7e1e69293a200400f0fdd5c15f` 与 Superpowers 来源 `8ca22dba9a94f28898bbce59f2537ff4d87c747d` 已在专用卷取得。通过默认 CLI 导入并检查 matt-clarification、matt-review、superpowers-verification，均只是 `candidate_package_only`。读包、导入与目录存在不是资格批准、真实方法调用或新鲜评审。

原始初始化／Change／导入请求和命令结果位于 `R:/evidence/s1-workbench-state-filter-20261028`。连接的本机安全输入第一次未完成，原失败回执保留，未生成凭据或连接文件；已另开掩码输入窗口，不覆盖原结果。不将配置等待混同于 Runtime 实现完成。

## 下一步与完整范围

接通新连接的生产安装与共享宿主，维持 Kernel 唯一业务权威和原身份恢复；真实资金上限／逐请求结清、物理配额全部写根、历史容量和完整恢复不得由兼容协议推断。继续真实 Skill、Plan／Task 前 Human／Matt 澄清、默认 Agent 工作台、真实 Change 到 ReadyForDelivery，再执行完整指南与绑定最终源码的独立评审。五组全部完成之前 S1 保持未完成。
