import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { productionAgentRuntime } from "@cimiloop/local-app";
import { startWorkbench } from "./server.js";

const args = process.argv.slice(2);
let projectDir = process.cwd(), port = 0;
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--project-dir" && args[index + 1]) projectDir = resolve(args[++index]!);
  else if (args[index] === "--port" && /^\d+$/.test(args[index + 1] ?? "")) port = Number(args[++index]);
  else if (args[index] === "--help") { process.stdout.write("CimiLoop 本地工作台\n用法：pnpm workbench [--project-dir <目录>] [--port <端口>]\n默认使用随机回环端口并打开浏览器。项目须先通过 CLI 初始化。\n"); process.exit(0); }
  else { process.stderr.write("无法识别参数；使用 --help 查看用法。\n"); process.exit(2); }
}
try {
  const workbench = await startWorkbench({ projectDir, port, agentRuntimeForRun: productionAgentRuntime });
  const executable = process.platform === "win32" ? "rundll32.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const browserArgs = process.platform === "win32" ? ["url.dll,FileProtocolHandler", workbench.bootstrapUrl] : [workbench.bootstrapUrl];
  const launched = new Promise<void>((done, reject) => execFile(executable, browserArgs, { windowsHide: true }, error => error ? reject(error) : done()));
  process.once("SIGINT", () => { void workbench.close().then(() => process.exit(0)); });
  process.once("SIGTERM", () => { void workbench.close().then(() => process.exit(0)); });
  try { await launched; }
  catch { await workbench.close(); throw new Error("无法打开本地浏览器"); }
  // Never print the one-use fragment, session cookie or CSRF token.
  process.stdout.write(`CimiLoop 工作台：${workbench.origin}\n当前使用本地 Human 身份；Ctrl+C 停止服务。\n`);
} catch { process.stderr.write("工作台启动失败；请确认项目已初始化、数据库格式受支持且浏览器可用。\n"); process.exitCode = 1; }
