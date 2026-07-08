import { describe, expect, it } from "vitest";
import type { TTSCapabilities, TTSVendorModel, VoiceRecord } from "@tts-platform/core";
import {
  controlCapabilityForModel,
  defaultFormatForModel,
  defaultLanguageForModel,
  defaultModelForOperation,
  defaultSampleRateForModel,
  defaultVoicePlaceholderForModel,
  formatOptionsForModel,
  languageOptionsForModel,
  modelById,
  modelOptions,
  numericControlBounds,
  operationModels,
  providerSupportsOperation,
  requiresExplicitVoiceForModel,
  sampleRateOptionsForModel,
  supportsCanonicalControl,
  supportsOperation,
  vendorExtensionTemplateForOperation,
  voiceOptions
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
          },
          speed: {
            support: "supported",
            min: 0.5,
            max: 2,
            defaultValue: 1
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
    },
    {
      modelId: "demo-clone",
      displayName: "Demo Clone",
      defaultForOperations: ["voice.clone.create"],
      canonicalCapabilities: {
        supportsText: false,
        supportsSSML: false,
        supportedOperations: ["voice.clone.create"],
        canonicalControls: {}
      }
    }
  ],
  operations: {
    "tts.sync": {
      operation: "tts.sync",
      supported: true,
      canonicalControls: {},
      vendorExtensionSchema: {
        schemaVersion: "1.0.0",
        title: "Demo",
        jsonSchema: {
          type: "object",
          properties: {
            language_boost: {
              type: ["string", "null"]
            },
            output_format: {
              type: "string",
              enum: ["hex", "url"]
            },
            subtitle_enable: {
              type: "boolean"
            },
            pronunciation_dict: {
              type: "object"
            },
            timbre_weights: {
              type: "array"
            }
          }
        }
      }
    }
  }
};

describe("synthesize options", () => {
  it("derives model-specific form options from provider capabilities", () => {
    const model = modelById(capabilities, "demo-model");

    expect(modelOptions(capabilities)).toEqual([
      { title: "Demo Model", value: "demo-model" },
      { title: "Demo Clone", value: "demo-clone" }
    ]);
    expect(modelOptions(capabilities, "tts.sync")).toEqual([
      { title: "Demo Model", value: "demo-model" }
    ]);
    expect(modelOptions(capabilities, "voice.clone.create")).toEqual([]);
    expect(operationModels(capabilities, "tts.sync").map((item) => item.modelId)).toEqual(["demo-model"]);
    expect(providerSupportsOperation(capabilities, "tts.sync")).toBe(true);
    expect(defaultModelForOperation(capabilities, "tts.sync")).toBe("demo-model");
    expect(modelById(capabilities, "demo-clone", "tts.sync")).toBeUndefined();
    expect(supportsOperation(capabilities, model, "tts.sync")).toBe(true);
    expect(supportsOperation(capabilities, model, "tts.stream")).toBe(false);
    expect(formatOptionsForModel(model, capabilities, "tts.sync")).toEqual(["mp3", "wav"]);
    expect(sampleRateOptionsForModel(model, capabilities, "tts.sync")).toEqual([24000, 32000]);
    expect(languageOptionsForModel(model)).toEqual([
      { title: "Chinese", value: "Chinese" },
      { title: "English", value: "English" }
    ]);
    expect(defaultFormatForModel(model, capabilities, "tts.sync")).toBe("mp3");
    expect(defaultSampleRateForModel(model, capabilities, "tts.sync")).toBe(32000);
    expect(defaultLanguageForModel(model)).toBe("Chinese");
    expect(defaultVoicePlaceholderForModel(model)).toBe("默认：demo-default-voice");
    expect(requiresExplicitVoiceForModel(model)).toBe(false);
    expect(controlCapabilityForModel(model, capabilities, "tts.sync", "speed")?.support).toBe("supported");
    expect(supportsCanonicalControl(model, capabilities, "tts.sync", "speed")).toBe(true);
    expect(supportsCanonicalControl(model, capabilities, "tts.sync", "pitch")).toBe(false);
    expect(numericControlBounds(model, capabilities, "tts.sync", "speed")).toEqual({
      min: 0.5,
      max: 2,
      defaultValue: 1
    });
  });

  it("marks models without a default voice as requiring explicit voice input", () => {
    const model: TTSVendorModel = {
      modelId: "cosyvoice-v3.5-plus",
      canonicalCapabilities: {
        supportsText: true,
        supportsSSML: true,
        supportedOperations: ["tts.sync"],
        canonicalControls: {}
      }
    };

    expect(defaultVoicePlaceholderForModel(model)).toBe("必填：输入或选择音色 ID");
    expect(requiresExplicitVoiceForModel(model)).toBe(true);
  });

  it("builds a full vendor extension template from operation schema", () => {
    const model = modelById(capabilities, "demo-model");

    expect(JSON.parse(vendorExtensionTemplateForOperation(capabilities, "tts.sync", model))).toEqual({
      language_boost: "Chinese",
      output_format: "hex",
      subtitle_enable: false,
      pronunciation_dict: {},
      timbre_weights: []
    });
  });

  it("filters synthesis models by enforced voice compatibility", () => {
    const secondTtsModel: TTSVendorModel = {
      modelId: "other-tts",
      displayName: "Other TTS",
      canonicalCapabilities: {
        supportsText: true,
        supportsSSML: false,
        supportedOperations: ["tts.sync"],
        outputFormats: ["mp3"],
        sampleRatesHz: [24000],
        canonicalControls: {}
      }
    };
    const extendedCapabilities: TTSCapabilities = {
      ...capabilities,
      vendorModels: [...capabilities.vendorModels, secondTtsModel]
    };
    const modelBoundVoice: VoiceRecord = {
      voiceId: "demo:voice_model",
      providerId: "demo",
      providerVoiceId: "voice_model",
      displayName: "Model Voice",
      source: "cloned",
      createdAt: "2026-07-03T00:00:00.000Z",
      compatibility: {
        scope: "model",
        enforced: true,
        modelIds: ["other-tts"]
      }
    };
    const resourceBoundVoice: VoiceRecord = {
      ...modelBoundVoice,
      voiceId: "demo:voice_resource",
      providerVoiceId: "voice_resource",
      compatibility: {
        scope: "resource",
        enforced: true,
        resourceIds: ["seed-icl-2.0"],
        resourceKind: "clone_resource",
        compatibleModelIds: ["demo-model"]
      }
    };

    expect(modelOptions(extendedCapabilities, "tts.sync", modelBoundVoice)).toEqual([
      { title: "Other TTS", value: "other-tts" }
    ]);
    expect(defaultModelForOperation(extendedCapabilities, "tts.sync", modelBoundVoice)).toBe("other-tts");
    expect(modelOptions(extendedCapabilities, "tts.sync", resourceBoundVoice)).toEqual([
      { title: "Demo Model", value: "demo-model" }
    ]);
  });

  it("builds provider-scoped cloned voice options from voice registry records", () => {
    expect(
      voiceOptions(
        [
          {
            voiceId: "demo:voice_1",
            providerId: "demo",
            providerVoiceId: "voice_1",
            displayName: "Voice One",
            source: "cloned",
            modelId: "demo-model",
            createdAt: "2026-07-03T00:00:00.000Z",
            sourceOperation: "voice.clone.create"
          },
          {
            voiceId: "demo:voice_2",
            providerId: "demo",
            providerVoiceId: "voice_2",
            displayName: "Voice Two",
            source: "cloned",
            modelId: "other-model",
            createdAt: "2026-07-03T00:00:00.000Z",
            sourceOperation: "voice.clone.create"
          },
          {
            voiceId: "demo:voice_legacy_clone",
            providerId: "demo",
            providerVoiceId: "legacy_clone",
            displayName: "Legacy Clone",
            source: "cloned",
            modelId: "demo-clone",
            createdAt: "2026-07-03T00:00:00.000Z",
            sourceOperation: "voice.clone.create"
          }
        ]
      )
    ).toEqual([
      {
        title: "Voice One (voice_1)",
        value: "demo:voice_1"
      },
      {
        title: "Voice Two (voice_2)",
        value: "demo:voice_2"
      },
      {
        title: "Legacy Clone (legacy_clone)",
        value: "demo:voice_legacy_clone"
      }
    ]);
  });
});
