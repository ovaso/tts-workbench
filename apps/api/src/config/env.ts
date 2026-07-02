import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface LoadEnvFilesOptions {
  cwd?: string;
  override?: boolean;
}

export interface LoadEnvFilesResult {
  loadedFiles: string[];
}

const ROOT_ENV_FILE_NAMES = [".env", ".env.local"] as const;
const API_ENV_FILE_NAMES = ["apps/api/.env", "apps/api/.env.local"] as const;

// loadEnvFiles: 入参为当前工作目录和覆盖策略；功能是从 workspace 根和 API 包目录读取 env 文件并写入 process.env。
export function loadEnvFiles(options: LoadEnvFilesOptions = {}): LoadEnvFilesResult {
  const cwd = options.cwd ?? process.cwd();
  const workspaceRoot = findWorkspaceRoot(cwd);
  const loadedFiles: string[] = [];
  const candidateFiles = [
    ...ROOT_ENV_FILE_NAMES.map((fileName) => path.resolve(workspaceRoot, fileName)),
    ...API_ENV_FILE_NAMES.map((fileName) => path.resolve(workspaceRoot, fileName)),
    ...ROOT_ENV_FILE_NAMES.map((fileName) => path.resolve(cwd, fileName))
  ];
  const uniqueCandidateFiles = [...new Set(candidateFiles)];

  for (const filePath of uniqueCandidateFiles) {
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

// findWorkspaceRoot: 入参为起始目录；向上查找 pnpm-workspace.yaml，找不到时回退到起始目录。
function findWorkspaceRoot(startDirectory: string): string {
  let current = path.resolve(startDirectory);
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDirectory);
    }
    current = parent;
  }
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
