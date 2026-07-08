import path from "node:path";
import { existsSync } from "node:fs";

// defaultDataRoot: 无入参；返回本地 archive 根目录，优先使用 TTS_DATA_DIR，其次定位 workspace 根目录下的 data。
export function defaultDataRoot(): string {
  return process.env.TTS_DATA_DIR ?? path.join(findWorkspaceRoot(process.cwd()), "data");
}

export function runsRoot(dataRoot: string): string {
  return path.join(dataRoot, "runs");
}

export function runRoot(dataRoot: string, runId: string): string {
  return path.join(runsRoot(dataRoot), runId);
}

export function voicesRoot(dataRoot: string): string {
  return path.join(dataRoot, "voices");
}

export function benchConfigsRoot(dataRoot: string): string {
  return path.join(dataRoot, "bench-configs");
}

// datasetsRoot: 入参为 data root；返回本地 datasets 目录。
export function datasetsRoot(dataRoot: string): string {
  return path.join(dataRoot, "datasets");
}

// benchmarkRunsRoot: 入参为 data root；返回本地 Benchmark run archive 根目录。
export function benchmarkRunsRoot(dataRoot: string): string {
  return path.join(dataRoot, "benchmark-runs");
}

// benchmarkRunRoot: 入参为 data root 和 benchmarkRunId；返回单个 Benchmark run archive 目录。
export function benchmarkRunRoot(dataRoot: string, benchmarkRunId: string): string {
  return path.join(benchmarkRunsRoot(dataRoot), benchmarkRunId);
}

// findWorkspaceRoot: 入参为起始目录；向上查找 pnpm-workspace.yaml，找不到时回退到当前工作目录。
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
