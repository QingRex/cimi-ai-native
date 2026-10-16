import type { LocalProject } from "./project.js";
import { LocalProjectError } from "./errors.js";
import type { HumanAgentRuntimeFactory } from "./agent-runtime-human-start-local.js";

// The product owner confirmed only the Zhipu provider. A model id, plan, and
// cash/credit ceiling are still unapproved. A file, old credential, or caller
// argument is not that approval, and this gate must not send a paid request.
export const PRODUCTION_ADMISSION_MISSING = ["智谱具体模型", "套餐", "现金上限", "积分上限"] as const;

export const productionAgentRuntime: HumanAgentRuntimeFactory = (_runId: string, _local: LocalProject) => {
  throw new LocalProjectError(
    `正式 Agent 不能启动。付费请求尚未批准。缺项：${PRODUCTION_ADMISSION_MISSING.join("；")}。未读取凭据，未发送模型请求。`,
    "CAPABILITY_UNAVAILABLE",
    "conflict",
    { production_admission: "unapproved", missing: [...PRODUCTION_ADMISSION_MISSING] },
  );
};
