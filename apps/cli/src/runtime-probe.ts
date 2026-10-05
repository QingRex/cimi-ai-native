import { resolve } from "node:path";
import { runOpenCodeProbe, parseRuntimeProbe, RuntimeAdapterError, openProbeOperation, parseRuntimeOperation, recoverProbeOperation, parseRuntimeRecovery, parseExecutionPolicy, requireSupportedExecutionPolicy, runOpenCodeTransportProbe, parseRuntimeTransportProbe } from "@cimiloop/runtime-adapter";
import { outputJson } from "./output.js";
import { CliInputError, readJsonObject } from "./input.js";
import { compileValidator, RuntimeDiskLimitsSchema, type RuntimeDiskLimits, type RuntimeExecutionPolicy } from "@cimiloop/protocol/v2";
import type { GlobalOptions } from "./commands.js";
import { runSyntheticGatewayProbe, parseRuntimeGatewayProbe } from "@cimiloop/runtime-adapter";
import { runOpenCodeGatewayBridgeProbe, parseRuntimeGatewayBridgeProbe } from "@cimiloop/runtime-adapter";
import { runPublicGatewayNetworkProbe, parseRuntimeGatewayNetworkProbe } from "@cimiloop/runtime-adapter";
import { runGatewayCreditProbe, parseRuntimeGatewayCreditProbe } from "@cimiloop/runtime-adapter";

export const runtimeGatewayCreditProbe = async (options: GlobalOptions & { outputDir?: string }): Promise<void> => {
  try {
    const result = await runGatewayCreditProbe({ root: resolve(options.outputDir ?? resolve(options.projectDir ?? process.cwd(), ".cimiloop", "gateway-credit-probe")) });
    if (options.json) outputJson(result, parseRuntimeGatewayCreditProbe);
    else process.stdout.write(`持久积分预算演练：${result.credit_budget_probe_passed ? "通过" : "尚未通过"}\n检查：${result.checks.filter(c => c.passed).length}/${result.checks.length}\n独立宿主进程：${result.independent_host_processes}\nHTTP / 模型请求 / 凭据读取：0\n真实计费准入：未通过\n正式任务执行：未启用\n`);
    if (!result.credit_budget_probe_passed) process.exitCode = 1;
  } catch (error) { throw new CliInputError("持久积分预算演练未完成", "CAPABILITY_UNAVAILABLE", "forbidden", { reason: error instanceof RuntimeAdapterError ? error.reason : "credit_probe_failed" }); }
};

export const runtimeGatewayNetworkProbe = async (options: GlobalOptions & { outputDir?: string; maxElapsedMs?: string }): Promise<void> => {
  const deadline = options.maxElapsedMs === undefined ? 8000 : Number(options.maxElapsedMs);
  if (!Number.isSafeInteger(deadline) || deadline < 1000 || deadline > 30000) throw new CliInputError("公网网关探针时限须为1000–30000毫秒");
  try {
    const result = await runPublicGatewayNetworkProbe({ root: resolve(options.outputDir ?? resolve(options.projectDir ?? process.cwd(), ".cimiloop", "gateway-network-probe")), maxElapsedMs: deadline });
    if (options.json) outputJson(result, parseRuntimeGatewayNetworkProbe);
    else process.stdout.write(`智谱Coding Plan公网DNS / TLS：${result.network_probe_passed ? "通过" : "尚未通过"}\n原因：${result.failure_reason ?? "固定地址及TLS身份已核对"}\nHTTP / 模型请求 / 凭据读取：0\n真实计费准入：未通过\n正式任务执行：未启用\n`);
    if (!result.network_probe_passed) process.exitCode = 1;
  } catch (error) { throw new CliInputError("公网网关探针未完成", "CAPABILITY_UNAVAILABLE", "forbidden", { reason: error instanceof RuntimeAdapterError ? error.reason : "gateway_network_probe_failed" }); }
};

export const runtimeGatewayBridgeProbe = async (options: GlobalOptions & { binary: string; outputDir?: string; maxElapsedMs?: string }): Promise<void> => {
  const elapsed = options.maxElapsedMs === undefined ? 30000 : Number(options.maxElapsedMs);
  if (!Number.isSafeInteger(elapsed) || elapsed < 1000 || elapsed > 180000) throw new CliInputError("网关桥接时限须为1000–180000毫秒");
  try {
    const result = await runOpenCodeGatewayBridgeProbe({ root: resolve(options.outputDir ?? resolve(options.projectDir ?? process.cwd(), ".cimiloop", "gateway-bridge-probe")), binary: resolve(options.binary), maxElapsedMs: elapsed });
    if (options.json) outputJson(result, parseRuntimeGatewayBridgeProbe);
    else process.stdout.write(`OpenCode ${result.provider.version}\nIPC至合成HTTPS网关：${result.bridge_probe_passed ? "通过" : "尚未通过"}\nRuntime直接网络：无Capability\n合成HTTP请求：${result.bridge.synthetic_http_requests}\n预留预算：${result.bridge.budget.held_micro_units}微TEST\n外部模型请求 / 实际凭据读取：0\n正式任务执行：未启用\n`);
    if (!result.bridge_probe_passed) process.exitCode = 1;
  } catch (error) { throw new CliInputError("IPC网关桥接探针未完成", "CAPABILITY_UNAVAILABLE", "forbidden", { reason: error instanceof RuntimeAdapterError ? error.reason : "gateway_bridge_probe_failed" }); }
};

export const runtimeGatewayProbe = async (options: GlobalOptions & { outputDir?: string }): Promise<void> => {
  try {
    const result = await runSyntheticGatewayProbe({ root: resolve(options.outputDir ?? resolve(options.projectDir ?? process.cwd(), ".cimiloop", "gateway-probe")) });
    if (options.json) outputJson(result, parseRuntimeGatewayProbe);
    else process.stdout.write(`合成HTTPS宿主网关：${result.gateway_probe_passed ? "通过" : "尚未通过"}\n检查：${result.checks.filter(c => c.passed).length}/${result.checks.length}\n预算单位：TEST\n外部模型请求：0\n实际凭据读取：0\nIPC网关桥接：本探针只覆盖宿主核心，端到端验证见gateway-bridge-probe\n正式任务执行：未启用\n`);
    if (!result.gateway_probe_passed) process.exitCode = 1;
  } catch (error) { throw new CliInputError("宿主网关探针未完成", "CAPABILITY_UNAVAILABLE", "forbidden", { reason: error instanceof RuntimeAdapterError ? error.reason : "gateway_probe_failed" }); }
};

export const runtimeTransportProbe = async (options: GlobalOptions & { binary: string; outputDir?: string; maxElapsedMs?: string }): Promise<void> => {
  const elapsed = options.maxElapsedMs === undefined ? 20000 : Number(options.maxElapsedMs);
  if (!Number.isSafeInteger(elapsed) || elapsed < 1000 || elapsed > 180000) throw new CliInputError("传输探针时限须为1000–180000毫秒");
  try {
    const result = await runOpenCodeTransportProbe({ root: resolve(options.outputDir ?? resolve(options.projectDir ?? process.cwd(), ".cimiloop", "transport-probe")), binary: resolve(options.binary), maxElapsedMs: elapsed });
    if (options.json) outputJson(result, parseRuntimeTransportProbe);
    else process.stdout.write(`OpenCode ${result.provider.version}\n合成IPC传输：${result.transport_probe_passed ? "通过" : "尚未通过"}\n直接网络：无Capability\n外部模型请求：0\n正式任务执行：未启用\n`);
    if (!result.transport_probe_passed) process.exitCode = 1;
  } catch (error) {
    throw new CliInputError("Runtime传输探针未完成", "CAPABILITY_UNAVAILABLE", "forbidden", { reason: error instanceof RuntimeAdapterError ? error.reason : "transport_probe_failed" });
  }
};

export const runtimeProbe = async (options: GlobalOptions & { binary: string; outputDir?: string; modelProbe?: boolean; maxElapsedMs?: string; connectionFile?: string; diskLimitsFile?: string; executionPolicyFile?: string }): Promise<void> => {
  const maximum = options.maxElapsedMs === undefined ? 90_000 : Number(options.maxElapsedMs);
  if (!Number.isSafeInteger(maximum) || maximum < 1000 || maximum > 180_000) throw new CliInputError("探针时限须为1000–180000毫秒");
  let diskLimits: RuntimeDiskLimits | undefined;
  if (options.diskLimitsFile) {
    const value = readJsonObject(options.diskLimitsFile);
    try { diskLimits = compileValidator<RuntimeDiskLimits>(RuntimeDiskLimitsSchema)(value); }
    catch { throw new CliInputError("磁盘监测阈值或日志上限无效"); }
    if (diskLimits.max_file_bytes > diskLimits.max_sandbox_bytes) throw new CliInputError("单文件阈值不能超过沙箱总量阈值");
  }
  let executionPolicy: RuntimeExecutionPolicy | undefined;
  if (options.executionPolicyFile) {
    const value = readJsonObject(options.executionPolicyFile);
    try { executionPolicy = requireSupportedExecutionPolicy(parseExecutionPolicy(value), options.modelProbe === true); }
    catch (error) { throw new CliInputError("执行策略尚不受支持或与模型探针冲突", "CLI_ARGUMENT_INVALID", "validation", { reason: error instanceof RuntimeAdapterError ? error.reason : "invalid_execution_policy" }); }
  }
  try {
    const result = await runOpenCodeProbe({ root: resolve(options.outputDir ?? resolve(options.projectDir ?? process.cwd(), ".cimiloop", "runtime-probe")),
      binary: resolve(options.binary), modelProbe: options.modelProbe === true, maxElapsedMs: maximum, ...(options.connectionFile ? { connectionFile: resolve(options.connectionFile) } : {}), ...(diskLimits ? { diskLimits } : {}), ...(executionPolicy ? { executionPolicy } : {}) });
    if (options.json) outputJson(result, parseRuntimeProbe);
    else process.stdout.write(`OpenCode ${result.provider.version}\n隔离边界：${result.boundaries.every(probe => probe.passed) ? "通过" : "失败"}\n真实模型契约：${result.contract_probe_passed ? "通过" : "尚未通过"}\n正式任务执行：未启用\n待完成：${result.gaps.join("、")}\n`);
    if (!result.boundaries.every(probe => probe.passed) || options.modelProbe && !result.contract_probe_passed) process.exitCode = 1;
  } catch (error) {
    if (error instanceof RuntimeAdapterError && error.reason === "invalid_dedicated_model_connection") throw new CliInputError("专用模型配置无效；须引用DPAPI凭据", "CLI_ARGUMENT_INVALID", "validation", { reason: error.reason });
    if (error instanceof RuntimeAdapterError && ["invalid_execution_policy", "network_host_enforcement_unavailable", "cost_enforcement_unavailable", "model_network_access_denied"].includes(error.reason))
      throw new CliInputError("执行策略未满足；联网模型探针须显式配置探针范围网络及费用策略", "CLI_ARGUMENT_INVALID", "validation", { reason: error.reason });
    throw new CliInputError("Runtime探针未完成", "CAPABILITY_UNAVAILABLE", "forbidden", { reason: error instanceof RuntimeAdapterError ? error.reason : "runtime_probe_failed" });
  }
};
export const runtimeOperation = (kind: "show" | "cancel" | "collect", key: string, options: GlobalOptions & { outputDir: string }): void => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(key)) throw new CliInputError("无效的Runtime探针操作键");
  try {
    const adapter = openProbeOperation(resolve(options.outputDir), key);
    const result = kind === "cancel" ? adapter.cancel(key) : kind === "collect" ? adapter.collect(key) : adapter.query(key);
    if (options.json) outputJson(result, parseRuntimeOperation);
    else process.stdout.write(`${result.operation_key}：${result.status}\n原因：${result.reason}\n取消请求：${result.cancel_requested}\n会话：${result.session_id ?? "尚未证明"}\n原始引用：${result.raw_refs.length}，输出：${result.outputs.length}\n`);
  } catch (error) {
    throw new CliInputError("无法读取Runtime探针操作", "OBJECT_NOT_FOUND", "not_found", { operation_key: key, reason: error instanceof RuntimeAdapterError ? error.reason : "operation_record_unavailable" });
  }
};

export const runtimeRecover = async (key: string, options: GlobalOptions & { outputDir: string }): Promise<void> => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(key)) throw new CliInputError("无效的Runtime探针操作键");
  try {
    const result = await recoverProbeOperation(resolve(options.outputDir), key);
    if (options.json) outputJson(result, parseRuntimeRecovery);
    else process.stdout.write(`${result.operation_key}：${result.outcome}\n原因：${result.reason}\n原运行：${result.operation.status}\n资源清理：${result.cleanup.resources_disposed}\n专用状态清理：${result.cleanup.state_removed}\n`);
    if (result.outcome === "unknown") process.exitCode = 1;
  } catch (error) {
    throw new CliInputError("无法核对Runtime探针操作", "OBJECT_NOT_FOUND", "not_found", { operation_key: key, reason: error instanceof RuntimeAdapterError ? error.reason : "operation_record_unavailable" });
  }
};
