import { describe, expect, it } from "vitest";
import type { BenchConfig } from "@tts-platform/core";
import {
  benchmarkPlanResultLabel,
  benchmarkPlanScaleLabel,
  benchmarkOperationLabel,
  benchmarkPlanMetricSummaryLabel,
  benchmarkPlanStatusColor,
  benchmarkPlanStatusLabel,
  benchConfigActionsClass,
  benchConfigOutputLabel,
  benchConfigVoiceLabel,
  benchTabItems,
  benchmarkJobFirstPacketLabel,
  metricBytesLabel,
  metricMsLabel,
  metricRatioLabel,
  shortBenchDigest
} from "./benches-page";

const config: BenchConfig = {
  configId: "1234567890abcdef",
  digest: "1234567890abcdef",
  displayName: "MiniMax baseline",
  providerId: "minimax",
  modelId: "speech-02",
  voice: {
    providerVoiceId: "voice_a"
  },
  output: {
    format: "mp3",
    sampleRateHz: 32000
  },
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z"
};

describe("benches page helpers", () => {
  it("defines config, plan and run tabs", () => {
    expect(benchTabItems().map((tab) => tab.value)).toEqual(["configs", "plans", "runs"]);
  });

  it("formats bench config table fields", () => {
    expect(shortBenchDigest(config.digest)).toBe("1234567890ab");
    expect(benchConfigVoiceLabel(config)).toBe("voice_a");
    expect(benchConfigOutputLabel(config)).toBe("mp3 · 32000 Hz");
  });

  it("keeps config actions aligned to the trailing edge", () => {
    expect(benchConfigActionsClass()).toBe("bench-actions bench-actions-end");
  });

  it("formats benchmark plan status and scale", () => {
    const plan = {
      planId: "plan_1",
      displayName: "Smoke plan",
      corpusSetId: "corpus_set_1",
      configSetId: "config_set_1",
      operation: "tts.sync" as const,
      textMode: "text" as const,
      status: "failed" as const,
      createdAt: "2026-07-09T00:00:00.000Z",
      updatedAt: "2026-07-09T00:00:00.000Z",
      jobs: [
        {
          jobId: "job_1",
          corpusItemId: "corpus_item_1",
          configId: "config_1",
          operation: "tts.sync" as const,
          textMode: "text" as const,
          request: {
            operation: "tts.sync" as const,
            providerId: "mock",
            text: "hello",
            voice: {}
          },
          status: "succeeded" as const
        },
        {
          jobId: "job_2",
          corpusItemId: "corpus_item_2",
          configId: "config_1",
          operation: "tts.sync" as const,
          textMode: "text" as const,
          request: {
            operation: "tts.sync" as const,
            providerId: "mock",
            text: "hello",
            voice: {}
          },
          status: "failed" as const
        }
      ],
      summary: {
        corpusItemCount: 2,
        configCount: 1,
        totalJobs: 2,
        averageFirstPacketLatencyMs: 123,
        averageTotalLatencyMs: 456,
        averageRealtimeFactor: 0.76
      },
      archive: {
        runPath: "data/benchmark-runs/plan_1",
        files: ["benchmark-plan.json"]
      }
    };

    expect(benchmarkPlanScaleLabel(plan)).toBe("2 语料 x 1 配置 = 2 jobs");
    expect(benchmarkPlanResultLabel(plan)).toBe("1 成功 / 1 失败");
    expect(benchmarkOperationLabel("tts.stream")).toBe("流式合成");
    expect(benchmarkPlanMetricSummaryLabel(plan)).toBe("首包 123 ms · 总耗时 456 ms · RTF 0.760");
    expect(benchmarkPlanStatusLabel("failed")).toBe("失败");
    expect(benchmarkPlanStatusColor("failed")).toBe("error");
  });

  it("formats benchmark metrics", () => {
    expect(metricMsLabel(88)).toBe("88 ms");
    expect(metricMsLabel(undefined)).toBe("未采集");
    expect(metricBytesLabel(1536)).toBe("1.5 KB");
    expect(metricRatioLabel(0.423)).toBe("0.423");
    expect(benchmarkJobFirstPacketLabel({ textLength: 4, firstPacketSource: "sync_not_observable" })).toBe(
      "同步不可观测"
    );
  });
});
