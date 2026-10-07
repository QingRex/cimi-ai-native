import type { FixedMethodProfile } from "@cimiloop/protocol/v2";
import { isDeepStrictEqual } from "node:util";
import { GatewayCreditLedger, type GatewayCreditPolicy, type GatewayCreditConversationOriginalOptions } from "./gateway-credit.js";
import { replayFixedMethodTranscript } from "./fixed-method-replay.js";
import { digest, RuntimeAdapterError } from "./files.js";

const same = (a: unknown, b: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
// Opens an existing format-4 public ledger read-only. No imported JSON flag,
// current caller identity or archived Native stdout can declare external origin.
export function openPublicNamedMethodOriginals(path: string, policy: GatewayCreditPolicy, options: GatewayCreditConversationOriginalOptions) {
  const ledger = GatewayCreditLedger.openPublicOriginalsReadOnly(path, policy, options);
  return Object.freeze({
    verify(profile: FixedMethodProfile, files: { path: string; content: string }[], transcript: unknown, prompt?: string) {
      const replay = replayFixedMethodTranscript(profile, files, transcript, prompt), originals = ledger.readConversationOriginals();
      const context = ledger.conversationOriginalContext(), profileDigest = digest(JSON.stringify(profile)).value;
      if (context.operation_key !== profile.invocation_key || context.profile_digest !== profileDigest) throw new RuntimeAdapterError("named_method_original_pins_changed");
      if (originals.length !== replay.original_requests.length) throw new RuntimeAdapterError("named_method_original_count_changed");
      const byId = new Map(originals.map(original => [original.request.request_id, original]));
      const receipts = replay.original_requests.map(request => {
        const id = (request.input as { request_id: string }).request_id, original = byId.get(id);
        if (!original || original.state !== "completed" || !original.response_body || !original.response || !original.receipt ||
          original.operation_key !== profile.invocation_key || original.profile_digest !== profileDigest ||
          !same(original.input, request.input) || !same(original.response, request.response)) throw new RuntimeAdapterError("named_method_original_exchange_unproven");
        return { request_id: id, input_digest: original.request.input_digest, credit_request_digest: original.receipt.request_digest, response_digest: digest(original.response_body).value,
          request_bytes: original.request_body.length, response_bytes: original.response_body.length, receipt: original.receipt };
      });
      return { origin: "public_fixture" as const, operation_key: profile.invocation_key, profile_digest: profileDigest, receipts,
        raw_conversations_verified: true as const, actual_cost_known: false as const, formal_execution_enabled: false as const };
    },
    close: () => ledger.close()
  });
}
