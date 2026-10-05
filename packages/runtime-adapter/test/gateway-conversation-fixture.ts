import { randomUUID } from "node:crypto";
export const conversationTool = () => ({ type: "function", function: { name: "read_fixture", description: "public tool description excluded from persistent contracts", parameters: {
  type: "object", properties: { path: { type: "string", maxLength: 128, description: "public path description excluded from persistent contracts" } }, required: ["path"], additionalProperties: false } } });
export const conversationCall = (id = "call_1", args = '{"path":"public.txt"}') => ({ id, type: "function", function: { name: "read_fixture", arguments: args } });
export const conversationInput = (mode: "json" | "sse" = "sse") => ({ request_id: randomUUID(), messages: [{ role: "user", content: "public private-prompt fixture excluded from persistent contracts" }] as Record<string, unknown>[],
  tools: [conversationTool()], response_mode: mode, input_tokens: 100, max_output_tokens: 32 });
export const conversationCompletion = (request_id: string) => ({ id: "fixture-completion", model: "glm-5.3", request_id, object: "chat.completion", created: 1791158400,
  choices: [{ index: 0, message: { role: "assistant", content: null as string | null, tool_calls: [conversationCall()], reasoning_content: "public fixture reasoning excluded from reply cache" }, finish_reason: "tool_calls" }],
  usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } });
export const conversationEvents = (request_id: string) => {
  const completion = conversationCompletion(request_id), frame = (delta: unknown, finish: string | null = null) => ({ id: completion.id, model: completion.model, request_id, object: "chat.completion.chunk", created: completion.created,
    choices: [{ index: 0, delta, finish_reason: finish }], ...(finish ? { usage: completion.usage } : {}) });
  return [frame({ role: "assistant", reasoning_content: completion.choices[0]!.message.reasoning_content }), frame({ tool_calls: [{ index: 0, ...conversationCall("call_1", '{"path":') }] }),
    frame({ tool_calls: [{ index: 0, function: { arguments: '"public.txt"}' } }] }), frame({}, "tool_calls"), "[DONE]"];
};
export const conversationStream = (events: unknown[]) => Buffer.from(events.map(value => "data: " + (typeof value === "string" ? value : JSON.stringify(value)) + "\n\n").join(""));
export const conversationReply = (body: unknown) => {
  const request = body as { request_id: string; stream: boolean };
  return { content_type: request.stream ? "text/event-stream" : "application/json", chunks: [request.stream ? conversationStream(conversationEvents(request.request_id)) : Buffer.from(JSON.stringify(conversationCompletion(request.request_id)))] };
};
