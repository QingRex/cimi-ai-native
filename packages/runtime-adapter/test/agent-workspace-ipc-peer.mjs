// Owned ordinary Node peer for actual Windows identity/file tests. It does not
// qualify a sandboxed Runtime, read credentials or request an external model.
import { createConnection } from "node:net";
import { exchangeAgentWorkspaceToolFrame } from "../transport/agent-workspace-ipc-client.mjs";

process.on("message", async message => {
  if (message.kind === "quit") { process.disconnect(); process.exit(0); }
  try {
    const reply = message.kind === "frame" ? await exchangeAgentWorkspaceToolFrame(message.pipe, message.frame) : await new Promise((done, fail) => {
      const socket = createConnection(message.pipe), timer = setTimeout(() => { socket.destroy(); fail(Error("raw_timeout")); }, 25000);
      socket.once("connect", () => { const bytes = Buffer.from(message.bytes_base64, "base64"), header = Buffer.alloc(4); header.writeUInt32LE(message.length ?? bytes.length);
        socket.write(Buffer.concat([header, bytes]), () => { if (message.kind === "drop") { clearTimeout(timer); socket.destroy(); done({ dropped: true }); } }); });
      let input = Buffer.alloc(0); socket.on("data", bytes => { input = Buffer.concat([input, bytes]);
        if (input.length >= 4 && input.length === 4 + input.readUInt32LE()) { clearTimeout(timer); socket.destroy(); done({ raw: input.toString("base64") }); } });
      socket.once("end", () => { clearTimeout(timer); socket.destroy(); done({ raw: input.toString("base64") }); });
      socket.once("error", error => { clearTimeout(timer); socket.destroy(); if (error.code === "EPIPE" && !input.length) done({ raw: "" }); else fail(error); });
    });
    process.send({ id: message.id, reply });
  } catch (error) { process.send({ id: message.id, error: error.message }); }
});
