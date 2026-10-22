import { execFileSync } from "node:child_process";
import { installCodexMatt, openLocalProject } from "@cimiloop/local-app";
import { packageGitSkill } from "@cimiloop/skill-adapter";
import { digest } from "@cimiloop/runtime-adapter";
import { CliInputError, readJsonObject } from "./input.js";
import type { GlobalOptions } from "./commands.js";

export async function installCodexClarification(options: GlobalOptions & { binary: string; repository: string; file: string; model?: string; yes?: boolean; disableMcpServer?: string[]; factPath?: string[]; factCommit?: string }) {
  if (!options.yes) throw new CliInputError("安装会绑定当前 Codex 登录及所选模型；请显式使用 --yes 确认。不会发送模型请求。");
  const local = openLocalProject(options);
  try {
    const source = packageGitSkill(options.repository, readJsonObject(options.file));
    let facts: { source_identity: string; files: { path: string; content: string }[] } | undefined;
    if (options.factPath?.length) {
      if (!options.factCommit || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(options.factCommit) || options.factPath.length > 32 || options.factPath.some(path =>
        !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path) || path.split("/").some(part => part === "." || part === "..") || /(?:^|\/)(?:auth\.json|\.env(?:\..*)?|credentials[^/]*|[^/]*\.(?:pem|key|pfx))$/i.test(path))) throw new CliInputError("事实快照需要完整 commit 和有界的明确源码路径。");
      const files = options.factPath.map(path => ({ path, content: execFileSync("git", ["-C", local.location.repositoryPath, "show", options.factCommit + ":" + path], { windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }) }));
      facts = { files, source_identity: digest(JSON.stringify({ repository: local.location.repositoryPath, commit: options.factCommit, files: files.map(file => ({ path: file.path, digest: digest(file.content) })) })).value };
    } else if (options.factCommit) throw new CliInputError("--fact-commit 需要同时指定 --fact-path。");
    const result = await installCodexMatt(local, { source, binary: options.binary, model: options.model ?? "gpt-6.1-sol", disabled_mcp_servers: options.disableMcpServer ?? [], ...(facts ? { facts } : {}) });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } finally { local.store.close(); }
}
