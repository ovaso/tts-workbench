import type { ArchivedRunSummary } from "@tts-platform/core";

// syncSynthesisRuns: 入参为跨 operation 运行摘要；输出语音合成页面展示的合成记录。
export function syncSynthesisRuns(runs: ArchivedRunSummary[]): ArchivedRunSummary[] {
  return runs.filter((run) => run.operation === "tts.sync" || run.operation === "tts.stream");
}

// runAudioTitle: 入参为运行摘要；输出语音合成记录中的音频信息。
export function runAudioTitle(run: ArchivedRunSummary): string {
  return run.audio === undefined ? "无音频文件" : `${run.audio.format} · ${run.audio.sampleRateHz} Hz`;
}

// runStatusLabel: 入参为运行状态；输出页面展示的中文状态。
export function runStatusLabel(status: ArchivedRunSummary["status"]): string {
  if (status === "succeeded") {
    return "成功";
  }
  if (status === "failed") {
    return "失败";
  }
  return "已计划";
}

// runStatusColor: 入参为运行状态；输出 Material 状态图标使用的语义色。
export function runStatusColor(status: ArchivedRunSummary["status"]): string {
  if (status === "succeeded") {
    return "success";
  }
  if (status === "failed") {
    return "error";
  }
  return "info";
}

// runStatusIcon: 入参为运行状态；输出 Material Design Icons 的状态图标名。
export function runStatusIcon(status: ArchivedRunSummary["status"]): string {
  if (status === "succeeded") {
    return "mdi-check-circle-outline";
  }
  if (status === "failed") {
    return "mdi-alert-circle-outline";
  }
  return "mdi-clock-outline";
}

// runStatusTooltip: 入参为运行摘要；输出状态图标 tooltip 文案，失败时优先展示错误原因。
export function runStatusTooltip(run: ArchivedRunSummary): string {
  if (run.status === "failed") {
    return run.errorReason ?? "运行失败，归档中未记录错误原因。";
  }
  return runStatusLabel(run.status);
}

// runDetailTabs: 无入参；输出合成页分裂详情面板使用的 tab 配置。
export function runDetailTabs(): Array<{ title: string; value: string }> {
  return [
    { title: "请求", value: "request" },
    { title: "计划", value: "plan" },
    { title: "映射", value: "mapping" },
    { title: "结果", value: "result" },
    { title: "厂商", value: "vendor" }
  ];
}
