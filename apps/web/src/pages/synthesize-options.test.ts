import { describe, expect, it } from "vitest";
import type { TTSCapabilities } from "@tts-platform/core";
import {
  defaultFormatForModel,
  defaultLanguageForModel,
  defaultModelForOperation,
  defaultSampleRateForModel,
  defaultVoicePlaceholderForModel,
  formatOptionsForModel,
  languageOptionsForModel,
  modelById,
  modelOptions,
  sampleRateOptionsForModel
} from "./synthesize-options";

const capabilities: TTSCapabilities = {
  providerId: "demo",
  providerName: "Demo",
  adapterVersion: "0.1.0",
  vendorFeatures: {
    supportsHttpTTS: true,
    supportsStreamingTTS: false,
    supportsPersistentVoiceClone: false,
    supportsInstantVoiceClone: false,
    supportsVoiceCloneDelete: false
  },
  vendorModels: [
    {
      modelId: "demo-model",
      displayName: "Demo Model",
      defaultForOperations: ["tts.sync"],
      canonicalCapabilities: {
        supportsText: true,
        supportsSSML: false,
        supportedOperations: ["tts.sync"],
        outputFormats: ["mp3", "wav"],
        sampleRatesHz: [24000, 32000],
        canonicalControls: {
          language: {
            support: "supported",
            values: ["Chinese", "English"]
          }
        }
      },
      defaultConfiguration: {
        voice: {
          providerVoiceId: "demo-default-voice"
        },
        output: {
          format: "mp3",
          sampleRateHz: 32000
        },
        controls: {
          language: "Chinese"
        }
      }
    }
  ],
  operations: {}
};

describe("synthesize options", () => {
  it("derives model-specific form options from provider capabilities", () => {
    const model = modelById(capabilities, "demo-model");

    expect(modelOptions(capabilities)).toEqual([{ title: "Demo Model", value: "demo-model" }]);
    expect(defaultModelForOperation(capabilities, "tts.sync")).toBe("demo-model");
    expect(formatOptionsForModel(model)).toEqual(["mp3", "wav"]);
    expect(sampleRateOptionsForModel(model)).toEqual([24000, 32000]);
    expect(languageOptionsForModel(model)).toEqual([
      { title: "Chinese", value: "Chinese" },
      { title: "English", value: "English" }
    ]);
    expect(defaultFormatForModel(model)).toBe("mp3");
    expect(defaultSampleRateForModel(model)).toBe(32000);
    expect(defaultLanguageForModel(model)).toBe("Chinese");
    expect(defaultVoicePlaceholderForModel(model)).toBe("Default: demo-default-voice");
  });
});
