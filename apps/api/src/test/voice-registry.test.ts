import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { InMemoryVoiceRegistry } from "../storage/voice-registry";

describe("InMemoryVoiceRegistry", () => {
  it("persists cloned voices to the local data root", async () => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "tts-voices-"));
    const registry = new InMemoryVoiceRegistry(dataRoot);

    registry.save({
      voiceId: "minimax:voice_1",
      providerId: "minimax",
      providerVoiceId: "voice_1",
      displayName: "Voice 1",
      source: "cloned",
      createdAt: "2026-07-03T00:00:00.000Z",
      sourceOperation: "voice.clone.create",
      clone: {
        createdAt: "2026-07-03T00:00:00.000Z"
      }
    });

    const reloaded = new InMemoryVoiceRegistry(dataRoot);

    expect(reloaded.list({ providerId: "minimax" })).toHaveLength(1);
    expect(reloaded.list({ providerId: "minimax" })[0]?.providerVoiceId).toBe("voice_1");
    expect(reloaded.get("minimax:voice_1")?.providerVoiceId).toBe("voice_1");
  });
});
