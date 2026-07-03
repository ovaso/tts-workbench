import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { benchConfigDigest, FileBenchConfigRegistry } from "../storage/bench-config-registry";

describe("FileBenchConfigRegistry", () => {
  it("uses vendor-model-voice-param digest as config identity", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-bench-configs-"));
    const registry = new FileBenchConfigRegistry(dataRoot);
    const request = {
      displayName: "MiniMax baseline",
      providerId: "minimax",
      modelId: "speech-02",
      voice: {
        providerVoiceId: "voice_a"
      },
      output: {
        format: "mp3" as const,
        sampleRateHz: 32000
      },
      controls: {
        speed: 1
      }
    };

    const first = registry.save(request);
    const second = registry.save({
      ...request,
      displayName: "Duplicate name is ignored by digest"
    });

    expect(first.configId).toBe(benchConfigDigest(request));
    expect(second.configId).toBe(first.configId);
    expect(registry.list()).toHaveLength(1);
  });
});
