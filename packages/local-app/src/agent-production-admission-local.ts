import type { LocalProject } from "./project.js";
import { LocalProjectError } from "./errors.js";
import type { HumanAgentRuntimeFactory } from "./agent-runtime-human-start-local.js";

// The product owner named the current plan as Grok. That names the plan only.
// The dedicated connection still accepts only Zhipu glm models, and no cash or
// credit ceiling was given. A file, old credential, or caller argument is not
// that approval, and this gate must not send a paid request.
export const PRODUCTION_ADMISSION_PLAN = "Grok" as const;
export const PRODUCTION_ADMISSION_MISSING = ["智谱具体模型", "现金上限", "积分上限"] as const;

export const productionAgentRuntime: HumanAgentRuntimeFactory = (_runId: string, _local: LocalProject) => {
  throw new LocalProjectError(
    `正式 Agent 不能启动。当前套餐已指定为 ${PRODUCTION_ADMISSION_PLAN}。该套餐不是智谱模型连接，也不能代替现金上限或积分上限。缺项：${PRODUCTION_ADMISSION_MISSING.join("；")}。未读取凭据，未发送模型请求。`,
    "CAPABILITY_UNAVAILABLE",
    "conflict",
    { production_admission: "unapproved", plan: PRODUCTION_ADMISSION_PLAN, missing: [...PRODUCTION_ADMISSION_MISSING] },
  );
};
