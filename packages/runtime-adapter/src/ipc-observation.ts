import { compileValidator, RuntimeIpcTransportObservationSchema, type RuntimeIpcTransportObservation } from "@cimiloop/protocol/v2";
import { RuntimeAdapterError } from "./files.js";
const parse = compileValidator<RuntimeIpcTransportObservation>(RuntimeIpcTransportObservationSchema);
export const validatePipeAttempts = (proof: Pick<RuntimeIpcTransportObservation, "attempts" | "accepted_requests" | "runtime_pid">): void => {
  const accepted = proof.attempts.filter(attempt => attempt.outcome === "accepted");
  const seen = new Set<string>();
  for (const attempt of accepted) {
    if (!attempt.request_digest || attempt.replay !== seen.has(attempt.request_digest)) throw new RuntimeAdapterError("ipc_transport_proof_mismatch");
    seen.add(attempt.request_digest);
  }
  if (accepted.filter(attempt => !attempt.replay).length !== proof.accepted_requests ||
    accepted.some(attempt => attempt.pid !== proof.runtime_pid || attempt.reason !== "runtime_identity_verified" || !attempt.request_digest || attempt.request_bytes < 1) ||
    proof.attempts.some(attempt => attempt.outcome === "rejected" && (attempt.replay || attempt.reason === "runtime_identity_verified")))
    throw new RuntimeAdapterError("ipc_transport_proof_mismatch");
};
export const parseIpcTransportObservation = (value: unknown): RuntimeIpcTransportObservation => { const proof = parse(value); validatePipeAttempts(proof); return proof; };
