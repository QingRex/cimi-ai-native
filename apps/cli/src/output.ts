import { parseVersionedErrorResult } from "@cimiloop/protocol";
import { compileValidator, CommandDiagnosticSchema, parseObjectShowResult, type ObjectShowResult, type CommandDiagnostic } from "@cimiloop/protocol/v2";
import type * as v1 from "@cimiloop/protocol/v1";
import type * as v2 from "@cimiloop/protocol/v2";
type DomainError = v1.DomainError | v2.DomainError;

export const isDomainError = (value: unknown): value is DomainError =>
  typeof value === "object" && value !== null && "code" in value && "category" in value;

export const outputJson = <T>(value: unknown, validate: (value: unknown) => T): void => {
  const validated = validate(value);
  process.stdout.write(`${JSON.stringify(validated, null, 2)}\n`);
};

export const outputError = (error: DomainError, jsonMode: boolean): void => {
  if (jsonMode) {
    outputJson({ ...("schema_version" in error ? { schema_version: error.schema_version } : {}), ok: false, error }, parseVersionedErrorResult);
  } else {
    process.stderr.write(`错误 [${error.code}]：${error.message}\n`);
    const { diagnostic, ...details } = error.details;
    if (Object.keys(details).length > 0) process.stderr.write(`${JSON.stringify(details, null, 2)}\n`);
    if (diagnostic) {
      const current = compileValidator<CommandDiagnostic>(CommandDiagnosticSchema)(diagnostic);
      process.stderr.write(`当前事实（事件序号 ${current.as_of_event_sequence}，读取于 ${current.observed_at}）：\n`);
      if (current.current) process.stderr.write(`${renderFields(current.current)}\n`);
      else process.stderr.write("目标已不存在。\n");
      for (const fact of current.related) process.stderr.write(`相关事实：\n${renderFields(fact)}\n`);
      if (current.missing_conditions.length) process.stderr.write(`阻塞 / 准入缺项：${current.missing_conditions.join("、")}\n`);
      if (current.readiness) process.stderr.write(`任务当前用量与预算：\n${renderFields(current.readiness)}\n`);
      process.stderr.write(`详情：cimiloop inspect ${current.target.object_type} ${current.target.id}\n`);
    }
  }
  process.exitCode = error.category === "validation" ? 2 : error.category === "not_found" ? 3 : 1;
};

const labels: Record<string, string> = { id: "ID", revision: "Revision", object_type: "对象类型", status: "状态", lifecycle_state: "生命周期", operating_status: "运行状态",
  contract_ref: "正式约定", plan_ref: "正式计划", executor_ref: "执行者", input_digest: "输入摘要", allowed_actions: "允许动作", allowed_resources: "资源范围", budget: "预算",
  next_actor_ref: "接续者", completed: "已完成", unresolved: "待处理", next_action: "下一步", reasons: "缺项", usage_digest: "用量摘要", budget_remaining: "剩余预算" };
export const renderFields = (value: unknown, indent = ""): string => {
  if (value === null || typeof value !== "object") return `${indent}${String(value)}`;
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index + 1), item] as const) : Object.entries(value);
  if (!entries.length) return `${indent}${Array.isArray(value) ? "[]" : "{}"}`;
  return entries.map(([key, item]) => item !== null && typeof item === "object" ? `${indent}${labels[key] ?? key}：\n${renderFields(item, `${indent}  `)}` : `${indent}${labels[key] ?? key}：${String(item)}`).join("\n");
};
export const outputObject = (input: ObjectShowResult, jsonMode: boolean): void => {
  const result = parseObjectShowResult(input);
  if (jsonMode) return outputJson(result, parseObjectShowResult);
  process.stdout.write(`${result.object_type} ${result.object.id}（事件序号 ${result.as_of_event_sequence}）\n${renderFields(result.object)}\n`);
  if (result.readiness) process.stdout.write(`任务授权 / 再次运行准入（仍需核验实际工作区与上下文）：\n${renderFields(result.readiness)}\n`);
};
