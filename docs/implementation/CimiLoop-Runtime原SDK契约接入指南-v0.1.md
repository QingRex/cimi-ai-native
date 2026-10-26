# Runtime 原 SDK 契约接入指南 v0.1

这个入口解决首次 Runtime 技术资格对“先有合格 Runtime／Skill”的启动依赖。当前 Human 项目负责人可以对固定候选执行隔离技术契约：实际读取并修改 `input.txt`，然后在独立 Native Profile、SDK Session 和模型线程中只读复查修改结果。CLI 与工作台复用 `LocalHumanRuntimeContract`，结果进入现有 Provider 证据登记和 Kernel 评估路径。

本指南不是已经成功执行的完整 S1 接入验收。模型／账户、固定卷和账单等真实条件仍须落实，正式任务的四项控制来源仍未全部安装。技术资格只允许后续隔离采集，不会启用正式 Agent。

## 准备现有安装与候选

使用 Windows x64、Node >=24.15 <25、pnpm12.4.2，并通过 `pnpm check`。Human 必须具有当前有效的项目负责人指派。凭据留在仓库外，模型固定为已安装的授权选择；真实测试优先 `gpt-6-luna`，不能在请求 JSON 中另选模型或传入工厂。

按[同卷安装与有限额度分配指南](CimiLoop-Codex同卷安装与有限额度分配-v0.1.md)准备原 Codex 安装、有限账户容量、固定 VHDX 及同卷仓库外官方登录目录。技术入口也检查全部已知写根，不提供普通目录或无物理配额的回退。查询不修复缺失安装，不读取令牌：

```powershell
pnpm cimiloop runtime codex-installation --json
pnpm cimiloop runtime codex-budget --json
pnpm cimiloop runtime codex-storage --json
pnpm cimiloop provider list --json
pnpm cimiloop runtime contract --help
```

用现有 `provider register --file <ProviderRegistration.json>` 登记实际 OpenCode 可执行文件候选。候选须满足：`provider_kind: runtime`、`name: opencode`、固定版本与程序 SHA256、`local_file/executable` 来源、无依赖、`runtime.execute` 或 `runtime.probe` 能力、`read_files` 与 `edit_files` 声明，以及当前 `RuntimeOperationResult`／`RuntimeProbeResult` Schema 摘要。后续若要执行 Skill 隔离调用，绑定能力须为 `runtime.execute`。不得用测试可执行文件或编造的摘要登记真实来源。

入口不要求已有批准 Binding。传输字段里的 `runtime_binding.binding_ref.id` 承载候选 Descriptor ID，摘要承载 Descriptor 摘要；固定附件明确标记 `runtime_binding_is_descriptor_transport_pin:true`、`business_execution_approved:false`。它不是保存的 ProviderBinding，没有业务 Run，也不能授权 Kernel 的业务工具调用。

## 启动并保留原身份

生成 UUIDv7，先保存，再发送。另一个项目使用全局 `--project-dir <实际目录>`；不要照搬旧电脑路径。

```powershell
$runtimeContractRequest = node --input-type=module -e "import { createInternalId } from './packages/protocol/dist/v2/index.js'; console.log(createInternalId())"
$runtimeContractRequest
pnpm cimiloop runtime contract start <descriptor-id> --request-id $runtimeContractRequest --max-elapsed-ms 600000 --json
```

固定流程是版本／读写隔离边界验证、编辑阶段、独立评审阶段。编辑必须经原 SDK 读取 `before\n`，恰好原子替换一次为 `after\n`，提交 `CIMILOOP_EDIT_COMPLETE`。评审材料复制实际编辑输出，经另一原 SDK 读取 `after\n`，提交 `CIMILOOP_REVIEW_ACCEPT`。最终文本只是待核候选；原件读取器还独立核对 Native、Job、SDK／IPC、模型账户、文件效果和当前物理身份。

两阶段使用原请求开始时间和累计期限。Host1 最多保留64个技术请求，每阶段最多16个固定文件调用；耗尽不删除或重建账本，也不重置 Unknown 占用。模型调用仍受已有账户政策限制，token 预约不是费用账单。

```powershell
pnpm cimiloop runtime contract list --json
pnpm cimiloop runtime contract query $runtimeContractRequest --json
pnpm cimiloop runtime contract continue $runtimeContractRequest --json
pnpm cimiloop runtime contract cancel $runtimeContractRequest --json
pnpm cimiloop runtime contract recover $runtimeContractRequest --json
```

重复 `start` 只查同一原请求；响应丢失先 `query`。`continue` 只允许在前阶段原件完整可核验后，启动尚未登记过的原阶段。已登记但 Unknown 的阶段不重派，不换 ID 把它伪装成恢复。`recover` 先要求原取消标记，只核对和处理原操作资源；找不到不能证明已清理。

工作台用 `pnpm workbench --project-dir <目录>` 启动，打开返回的本地链接并进入“Runtime 契约验证”。页面在发送前把原 ID 保存到当前项目／Human 的 sessionStorage；存储不可用时禁止新启动，保留已有 ID 查询。查询、接续、停止、恢复和采集走同一个应用服务，HTTP 会话及 CSRF 权限在等待后重新核对。

## 采集、登记和评估

```powershell
pnpm cimiloop runtime contract capture $runtimeContractRequest --json
```

只有两阶段完整原件都能复查，才保存 `raw_result_ref`。采集把实际版本／canary 原件复制为内容附件，并保存指向原请求的内部 `runtime-sdk-contract/1.0.0` 标记。标记不能选择任意路径、模型、回调或授权。后续具体读取器必须通过当前安装找到原 Host1、Native／SDK／模型／文件原件；复制 `passed:true` 不能批准资格。

在仓库外准备登记 JSON：

```json
{
  "descriptor_ref": { "object_type": "provider_descriptor", "id": "填写原候选ID" },
  "descriptor_digest": { "algorithm": "sha256", "value": "填写目录中原候选摘要" },
  "raw_result_ref": "替换为capture返回的完整引用对象"
}
```

上面 `raw_result_ref` 的字符串只是替换提示，实际必须是完整引用对象。保存原命令 ID 后运行 `provider record-evidence --file <登记JSON> --command-id <UUIDv7> --json`。直接使用已采集引用时不传 `--probe-file`；该选项会重新导入指定文件，不是必需项。

再准备评估 JSON：相同 `descriptor_ref`／`descriptor_digest`，`profile: "technical_contract"`，以及 `evidence_refs: [{"object_type":"evidence","id":"填写登记返回ID"}]`，执行 `provider evaluate --file <评估JSON> --command-id <UUIDv7> --json`。Kernel 在评估及后续绑定时重算原依据，PUBLIC 模型只能得到 inconclusive，不能当真实准入。

真实技术评估为 ALLOW 后，Human 才能通过现有 `provider bind --file <绑定JSON>`，使用原 evaluation_ref、input_digest、候选能力和有效权限，选择 `binding_scope: "isolated_provider_probe"`。这仍不批准 `task_execution`。后续固定 Skill 调用见[固定 Skill 隔离调用指南](CimiLoop-固定Skill隔离调用接入指南-v0.1.md)。

## 验收边界

默认正式 Codex 宿主还要求本契约标记及网络、真实费用与上限、全部物理配额、完整异常恢复四项独立控制来源。旧 OpenCode 技术资格按旧规则读取，不能直接当作当前 Codex 正式资格。Schema242、项目库10、Host1保持；没有自动升级或修改历史评估。

当前实现与验证范围见[实施记录](../plans/2026-10-27-cimiloop-runtime-sdk-contract.md)。完整五组 S1、真实普通 Change 到 ReadyForDelivery、真实 Skill／Human／Matt、账单核对与最终新鲜评审继续未完成。
