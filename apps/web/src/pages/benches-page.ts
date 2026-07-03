import type { BenchConfig } from "@tts-platform/core";

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
