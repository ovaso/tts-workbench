import type { ArchivedRunSummary } from "@tts-platform/core";

// syncSynthesisRuns: 入参为跨 operation 运行摘要；输出语音合成页面展示的同步合成记录。
export function syncSynthesisRuns(runs: ArchivedRunSummary[]): ArchivedRunSummary[] {
  return runs.filter((run) => run.operation === "tts.sync");
}

// runAudioTitle: 入参为运行摘要；输出语音合成记录中的音频信息。
export function runAudioTitle(run: ArchivedRunSummary): string {
  return run.audio === undefined ? "无音频文件" : `${run.audio.format} · ${run.audio.sampleRateHz} Hz`;
}
