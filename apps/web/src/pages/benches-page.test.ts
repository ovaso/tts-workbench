import { describe, expect, it } from "vitest";
import type { BenchConfig } from "@tts-platform/core";
import {
  benchConfigActionsClass,
  benchConfigOutputLabel,
  benchConfigVoiceLabel,
  benchTabItems,
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
});
