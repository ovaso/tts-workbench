import type {
  BenchConfig,
  BenchmarkJobOperation,
  BenchmarkPlan,
  BenchmarkPlanJobMetrics,
  BenchmarkPlanStatus
} from "@tts-platform/core";

export interface BenchTabItem {
  title: string;
  value: "configs" | "plans" | "runs";
  icon: string;
}

// benchConfigActionsClass: 无入参；输出配置列表顶部操作区使用的样式类名。
export function benchConfigActionsClass(): string {
  return "bench-actions bench-actions-end";
}

// shortBenchDigest: 入参为配置 digest；输出表格中展示的短 digest。
export function shortBenchDigest(digest: string): string {
  return digest.slice(0, 12);
}

// benchConfigVoiceLabel: 入参为 Benchmark 配置；输出配置列表展示的音色标识。
export function benchConfigVoiceLabel(config: BenchConfig): string {
  return config.voice.voiceId ?? config.voice.providerVoiceId ?? "未记录";
}

// benchConfigOutputLabel: 入参为 Benchmark 配置；输出配置列表展示的音频输出摘要。
export function benchConfigOutputLabel(config: BenchConfig): string {
  if (config.output === undefined) {
    return "默认输出";
  }
  const format = config.output.format ?? "默认格式";
  const sampleRate = config.output.sampleRateHz === undefined ? "" : ` · ${config.output.sampleRateHz} Hz`;
  return `${format}${sampleRate}`;
}

// benchmarkPlanScaleLabel: 入参为 Benchmark 方案；输出语料、配置和 job 规模摘要。
export function benchmarkPlanScaleLabel(plan: BenchmarkPlan): string {
  return `${plan.summary.corpusItemCount} 语料 x ${plan.summary.configCount} 配置 = ${plan.summary.totalJobs} jobs`;
}

// benchmarkPlanResultLabel: 入参为 Benchmark 方案；输出运行结果摘要。
export function benchmarkPlanResultLabel(plan: BenchmarkPlan): string {
  const succeeded = plan.summary.succeededJobs ?? plan.jobs.filter((job) => job.status === "succeeded").length;
  const failed = plan.summary.failedJobs ?? plan.jobs.filter((job) => job.status === "failed").length;
  return `${succeeded} 成功 / ${failed} 失败`;
}

// benchmarkOperationLabel: 入参为 Benchmark operation；输出方案列表展示的中文类型。
export function benchmarkOperationLabel(operation: BenchmarkJobOperation): string {
  return operation === "tts.stream" ? "流式合成" : "同步合成";
}

// benchmarkPlanMetricSummaryLabel: 入参为 Benchmark 方案；输出平均指标摘要。
export function benchmarkPlanMetricSummaryLabel(plan: BenchmarkPlan): string {
  return [
    `首包 ${metricMsLabel(plan.summary.averageFirstPacketLatencyMs)}`,
    `总耗时 ${metricMsLabel(plan.summary.averageTotalLatencyMs)}`,
    `RTF ${metricRatioLabel(plan.summary.averageRealtimeFactor)}`
  ].join(" · ");
}

// benchmarkJobFirstPacketLabel: 入参为 job 指标；输出首包延迟展示文案。
export function benchmarkJobFirstPacketLabel(metrics: BenchmarkPlanJobMetrics | undefined): string {
  if (metrics?.firstPacketSource === "sync_not_observable") {
    return "同步不可观测";
  }
  return metricMsLabel(metrics?.firstPacketLatencyMs);
}

// metricMsLabel: 入参为毫秒指标；输出带 ms 单位的文案。
export function metricMsLabel(value: number | undefined): string {
  return value === undefined ? "未采集" : `${value} ms`;
}

// metricBytesLabel: 入参为字节数；输出更易读的字节文案。
export function metricBytesLabel(value: number | undefined): string {
  if (value === undefined) {
    return "未采集";
  }
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

// metricRatioLabel: 入参为比率指标；输出三位小数文案。
export function metricRatioLabel(value: number | undefined): string {
  return value === undefined ? "未采集" : value.toFixed(3);
}

// benchmarkPlanStatusColor: 入参为 plan 状态；输出 Vuetify 状态颜色。
export function benchmarkPlanStatusColor(status: BenchmarkPlanStatus): string {
  if (status === "succeeded") {
    return "success";
  }
  if (status === "failed") {
    return "error";
  }
  if (status === "running") {
    return "primary";
  }
  if (status === "cancelled") {
    return "warning";
  }
  return "default";
}

// benchmarkPlanStatusLabel: 入参为 plan 状态；输出中文状态文案。
export function benchmarkPlanStatusLabel(status: BenchmarkPlanStatus): string {
  const labels: Record<BenchmarkPlanStatus, string> = {
    planned: "已规划",
    running: "运行中",
    succeeded: "成功",
    failed: "失败",
    cancelled: "已取消"
  };
  return labels[status];
}

// benchTabItems: 无入参；输出 Benches 页面 tab 配置。
export function benchTabItems(): BenchTabItem[] {
  return [
    {
      title: "配置列表",
      value: "configs",
      icon: "mdi-tune-variant"
    },
    {
      title: "方案列表",
      value: "plans",
      icon: "mdi-format-list-bulleted"
    },
    {
      title: "运行和运行列表",
      value: "runs",
      icon: "mdi-playlist-play"
    }
  ];
}
