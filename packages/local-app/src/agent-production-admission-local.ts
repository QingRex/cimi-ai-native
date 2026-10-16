import type { LocalProject } from "./project.js";
import { LocalProjectError } from "./errors.js";
import type { HumanAgentRuntimeFactory } from "./agent-runtime-human-start-local.js";

// Model calls use the OpenAI chat completions request. The installed connection
// names the model and https endpoint. Cash and credit ceilings are waived for
// this development stage and must not stop the rest of the work. A file, old
// credential, or caller argument is still not a connection, and this gate must
// not send a request before that connection is installed.
export const PRODUCTION_ADMISSION_PLAN = "Grok" as const;
export const PRODUCTION_ADMISSION_MISSING = ["OpenAI 兼容连接"] as const;

export const productionAgentRuntime: HumanAgentRuntimeFactory = (_runId: string, _local: LocalProject) => {
  throw new LocalProjectError(
    `正式 Agent 不能启动。模型请求使用 OpenAI chat completions。模型标识和 https 端点来自已安装连接，不限定智谱 glm。现金上限和积分上限本阶段不作为缺项。缺项：${PRODUCTION_ADMISSION_MISSING.join("；")}。未读取凭据，未发送模型请求。`,
    "CAPABILITY_UNAVAILABLE",
    "conflict",
    { production_admission: "unapproved", plan: PRODUCTION_ADMISSION_PLAN, missing: [...PRODUCTION_ADMISSION_MISSING] },
  );
};
