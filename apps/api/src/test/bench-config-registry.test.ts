import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { benchConfigDigest, benchConfigSetDigest, FileBenchConfigRegistry } from "../storage/bench-config-registry";

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

  it("saves config sets by digest after validating config ids", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-bench-config-sets-"));
    const registry = new FileBenchConfigRegistry(dataRoot);
    const config = registry.save({
      displayName: "Mock baseline",
      providerId: "mock",
      modelId: "mock-model",
      voice: {
        providerVoiceId: "voice_a"
      }
    });

    const set = registry.saveSet({
      name: "Baseline",
      configIds: [config.configId, config.configId]
    });
    const restored = new FileBenchConfigRegistry(dataRoot);

    expect(set.configSetId).toBe(benchConfigSetDigest([config.configId]));
    expect(set.configIds).toEqual([config.configId]);
    expect(restored.getSet(set.configSetId)?.configIds).toEqual([config.configId]);
  });
});
