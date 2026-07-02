import path from "node:path";

export function defaultDataRoot(): string {
  return process.env.TTS_DATA_DIR ?? path.resolve(process.cwd(), "../../data");
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
