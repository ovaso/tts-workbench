import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface LoadEnvFilesOptions {
  cwd?: string;
  override?: boolean;
}

export interface LoadEnvFilesResult {
  loadedFiles: string[];
}

const ENV_FILE_NAMES = [".env", ".env.local", "apps/api/.env", "apps/api/.env.local"] as const;

// loadEnvFiles: 入参为当前工作目录和覆盖策略；功能是按固定顺序读取本地 env 文件并写入 process.env。
export function loadEnvFiles(options: LoadEnvFilesOptions = {}): LoadEnvFilesResult {
  const cwd = options.cwd ?? process.cwd();
  const loadedFiles: string[] = [];

  for (const fileName of ENV_FILE_NAMES) {
    const filePath = path.resolve(cwd, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    applyEnvContent(content, options.override ?? false);
    loadedFiles.push(filePath);
  }

  return {
    loadedFiles
  };
}

// applyEnvContent: 入参为 env 文件内容和覆盖策略；功能是解析 KEY=VALUE 行并写入 process.env。
function applyEnvContent(content: string, override: boolean): void {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    const rawValue = normalizedLine.slice(separatorIndex + 1).trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      continue;
    }
    if (!override && process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = parseEnvValue(rawValue);
  }
}

// parseEnvValue: 入参为 env 原始值；功能是去除包裹引号并处理常见转义。
function parseEnvValue(rawValue: string): string {
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    const unquoted = rawValue.slice(1, -1);
    return rawValue.startsWith('"')
      ? unquoted.replaceAll("\\n", "\n").replaceAll('\\"', '"').replaceAll("\\\\", "\\")
      : unquoted;
  }

  const commentIndex = rawValue.indexOf(" #");
  return commentIndex === -1 ? rawValue : rawValue.slice(0, commentIndex).trimEnd();
}
