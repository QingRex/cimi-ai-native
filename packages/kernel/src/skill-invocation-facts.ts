import type { RuntimeReader } from "@cimiloop/store";
import type { SkillInvocation, SkillInvocationObservation, Run } from "@cimiloop/protocol/v2";
import { contentDigest } from "./intent.js";

export const skillInvocationInputDigest = (value: SkillInvocation | Omit<SkillInvocation, "input_digest">) => {
  const { input_digest: _digest, ...body } = value as SkillInvocation;
  return contentDigest(body);
};
export const skillInvocationState = (observations: SkillInvocationObservation[]) => {
  let status: Run["status"] = "Reserved", costKnown = true, costMicros = 0;
  let latest: SkillInvocationObservation | undefined;
  for (const observation of observations) {
    status = observation.resulting_status;
    costKnown = observation.report.basis === "reconciliation" ? true : costKnown && observation.report.usage.cost_known;
    if (observation.report.usage.cost_known) costMicros = Math.max(costMicros, observation.report.usage.cost_micros);
    if (observation.applicability !== "late" || observation.report.basis === "reconciliation") latest = observation;
  }
  return { status, costKnown, costMicros, latest,
    settled: costKnown && ["Succeeded", "Failed", "Cancelled", "NotStarted"].includes(status) };
};
export const runSkillInvocationFacts = (reader: RuntimeReader, run: Run) => {
  const observations = reader.listRuntimeRecords("skill_invocation_observation", run.change_id);
  const calls = reader.listRuntimeRecords("skill_invocation", run.change_id).filter(call => call.run_ref.id === run.id)
    .map(invocation => ({ invocation, observations: observations.filter(observation => observation.invocation_ref.id === invocation.id) }));
  const states = calls.map(call => ({ ...call, state: skillInvocationState(call.observations) }));
  const costMicros = states.reduce((sum, call) => sum + call.state.costMicros, 0);
  if (!Number.isSafeInteger(costMicros)) throw new Error("Skill cost exceeds safe integer");
  return { calls: states, unresolved: states.filter(call => !call.state.settled), costMicros,
    has_effect: states.some(call => call.state.costMicros > 0 || call.observations.some(observation => !["unknown", "not_started"].includes(observation.report.status))) };
};
