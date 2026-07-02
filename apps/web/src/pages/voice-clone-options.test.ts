import { describe, expect, it } from "vitest";
import type { TTSCapabilities } from "@tts-platform/core";
import {
  persistentVoiceCloneCapability,
  referenceAudioSummary,
  voiceCloneSupportText
} from "./voice-clone-options";
import { modelById, vendorExtensionTemplateForOperation } from "./synthesize-options";

const supportedCapabilities: TTSCapabilities = {
  providerId: "demo",
  providerName: "Demo",
  adapterVersion: "0.1.0",
  vendorFeatures: {
    supportsHttpTTS: true,
    supportsStreamingTTS: false,
    supportsPersistentVoiceClone: true,
    supportsInstantVoiceClone: false,
    supportsVoiceCloneDelete: false
  },
  vendorModels: [
    {
      modelId: "speech-2.8-hd",
      defaultForOperations: ["voice.clone.create"],
      canonicalCapabilities: {
        supportsText: true,
        supportsSSML: false,
        supportedOperations: ["voice.clone.create"],
        canonicalControls: {}
      }
    }
  ],
  operations: {
    "voice.clone.create": {
      operation: "voice.clone.create",
      supported: true,
      canonicalControls: {},
      voiceClone: {
        persistent: true,
        instant: false,
        requiresTranscript: false,
        supportedAudioFormats: ["mp3", "m4a", "wav"],
        minReferenceAudioSeconds: 10,
        maxReferenceAudioSeconds: 300,
        maxReferenceAudioFiles: 1
      },
      vendorExtensionSchema: {
        schemaVersion: "1.0.0",
        title: "MiniMax voice clone",
        jsonSchema: {
          type: "object",
          properties: {
            clone_prompt: {
              type: "object",
              properties: {
                prompt_text: {
                  type: "string",
                  default: ""
                }
              }
            },
            text: {
              type: "string",
              default: ""
            }
          }
        }
      }
    }
  }
};

describe("voice clone options", () => {
  it("derives persistent voice clone status from capabilities", () => {
    expect(voiceCloneSupportText(undefined)).toBe("请选择厂商");
    expect(voiceCloneSupportText(supportedCapabilities)).toBe("支持持久音色复刻");
    expect(persistentVoiceCloneCapability(supportedCapabilities)?.persistent).toBe(true);
    expect(referenceAudioSummary(persistentVoiceCloneCapability(supportedCapabilities))).toBe(
      "mp3 / m4a / wav，10-300 秒，最多 1 个文件"
    );
  });

  it("builds the full voice clone vendor extension template", () => {
    const model = modelById(supportedCapabilities, "speech-2.8-hd");

    expect(JSON.parse(vendorExtensionTemplateForOperation(supportedCapabilities, "voice.clone.create", model))).toEqual({
      clone_prompt: {
        prompt_text: ""
      },
      text: ""
    });
  });
});
