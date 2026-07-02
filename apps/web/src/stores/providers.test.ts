import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TTSCapabilities } from "@tts-platform/core";
import { getCapabilities } from "../api/providers";
import { useProvidersStore } from "./providers";

vi.mock("../api/providers", () => ({
  getCapabilities: vi.fn(),
  listProviders: vi.fn()
}));

const capabilities = (adapterVersion: string): TTSCapabilities => ({
  providerId: "minimax",
  providerName: "MiniMax",
  adapterVersion,
  vendorFeatures: {
    supportsHttpTTS: true,
    supportsStreamingTTS: true,
    supportsPersistentVoiceClone: true,
    supportsInstantVoiceClone: false,
    supportsVoiceCloneDelete: false
  },
  vendorModels: [],
  operations: {}
});

describe("providers store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(getCapabilities).mockReset();
  });

  it("refreshes cached capabilities when force is requested", async () => {
    vi.mocked(getCapabilities)
      .mockResolvedValueOnce(capabilities("old"))
      .mockResolvedValueOnce(capabilities("new"));

    const store = useProvidersStore();

    expect((await store.loadCapabilities("minimax")).adapterVersion).toBe("old");
    expect((await store.loadCapabilities("minimax")).adapterVersion).toBe("old");
    expect((await store.loadCapabilities("minimax", { force: true })).adapterVersion).toBe("new");
    expect(getCapabilities).toHaveBeenCalledTimes(2);
  });
});
