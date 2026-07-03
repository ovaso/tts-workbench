import { describe, expect, it } from "vitest";
import type { ProviderSummary } from "../api/providers";
import type { TTSCapabilities } from "@tts-platform/core";
import {
  providerDetailTooltip,
  providerInitial,
  providerLogoKey,
  providerTtsStatus,
  providerVoiceCloningStatus,
  visibleProductionProviders
} from "./providers-page";

const providers: ProviderSummary[] = [
  {
    providerId: "mock",
    providerName: "Local Mock TTS",
    adapterVersion: "0.1.0"
  },
  {
    providerId: "minimax",
    providerName: "MiniMax",
    adapterVersion: "0.1.0"
  }
];

const capabilities: TTSCapabilities = {
  providerId: "minimax",
  providerName: "MiniMax",
  adapterVersion: "0.1.0",
  vendorFeatures: {
    supportsHttpTTS: true,
    supportsStreamingTTS: false,
    supportsPersistentVoiceClone: true,
    supportsInstantVoiceClone: false,
    supportsVoiceCloneDelete: false
  },
  vendorModels: [],
  operations: {}
};

describe("providers page helpers", () => {
  it("hides mock provider from provider management list", () => {
    expect(visibleProductionProviders(providers).map((provider) => provider.providerId)).toEqual(["minimax"]);
  });

  it("builds detail icon tooltip text", () => {
    expect(providerDetailTooltip(providers[1]!)).toBe("查看 MiniMax 能力 JSON");
  });

  it("derives provider visual initial", () => {
    expect(providerInitial(providers[1]!)).toBe("M");
  });

  it("maps known providers to bundled official logos", () => {
    expect(providerLogoKey(providers[1]!)).toBe("minimax");
    expect(providerLogoKey(providers[0]!)).toBeUndefined();
  });

  it("derives TTS integration status from capabilities", () => {
    expect(providerTtsStatus(capabilities)).toMatchObject({
      supported: true,
      label: "已接入"
    });
    expect(
      providerTtsStatus({
        ...capabilities,
        vendorFeatures: {
          ...capabilities.vendorFeatures,
          supportsHttpTTS: false
        }
      })
    ).toMatchObject({
      supported: false,
      label: "不支持"
    });
  });

  it("derives voice cloning integration status from capabilities", () => {
    expect(providerVoiceCloningStatus(capabilities)).toMatchObject({
      supported: true,
      label: "已接入"
    });
    expect(
      providerVoiceCloningStatus({
        ...capabilities,
        vendorFeatures: {
          ...capabilities.vendorFeatures,
          supportsPersistentVoiceClone: false
        }
      })
    ).toMatchObject({
      supported: false,
      label: "不支持"
    });
  });
});
