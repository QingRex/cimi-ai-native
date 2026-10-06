import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { DomainError } from "@cimiloop/protocol/v2";
import { LocalProjectError as CliInputError } from "@cimiloop/local-app";
export { LocalProjectError as CliInputError } from "@cimiloop/local-app";
export const readJsonObject = (file: string): Record<string, unknown> => {
  const path = resolve(file);
  let content: string;
  try {
    const info = statSync(path);
    if (!info.isFile() || info.size > 8 * 1024 * 1024) throw new Error("invalid file");
    content = readFileSync(path, "utf8");
  } catch { throw new CliInputError("无法读取 JSON 文件；须为不超过 8 MiB 的普通文件", "CLI_ARGUMENT_INVALID", "validation", { file: path }); }
  let value: unknown;
  try { value = JSON.parse(content.replace(/^\uFEFF/, "")); }
  catch { throw new CliInputError("JSON 文件语法无效", "CLI_ARGUMENT_INVALID", "validation", { file: path }); }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new CliInputError("JSON 文件顶层须为对象", "CLI_ARGUMENT_INVALID", "validation", { file: path });
  return value as Record<string, unknown>;
};
export const targetNotFound = (kind: string, id?: string): never => {
  const codes: Record<string, DomainError["code"]> = { task: "TASK_NOT_FOUND", work_item: "WORK_ITEM_NOT_FOUND", standing_authorization: "AUTHORIZATION_NOT_FOUND", change: "CHANGE_NOT_FOUND" };
  throw new CliInputError("未找到当前项目中的命令目标", codes[kind] ?? "OBJECT_NOT_FOUND", "not_found", { object_type: kind, ...(id ? { id } : {}) });
};

export const importInputFile = <T>(file: string, importFile: () => T): T => {
  try { return importFile(); }
  catch { throw new CliInputError("无法导入原始报告；请检查文件及本地内容目录", "CLI_ARGUMENT_INVALID", "validation", { file: resolve(file) }); }
};
