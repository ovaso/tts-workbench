import type { TTSCapabilities } from "@tts-platform/core";
import { mockExtensionSchema } from "./extension-schema";

export const MOCK_PROVIDER_ID = "mock";

export const MOCK_ADAPTER_VERSION = "0.1.0";

export function mockCapabilities(adapterVersion = MOCK_ADAPTER_VERSION): TTSCapabilities {
  return {
    providerId: MOCK_PROVIDER_ID,
    providerName: "Local Mock TTS",
    adapterVersion,
    vendorFeatures: {
      supportsHttpTTS: true,
      supportsStreamingTTS: false,
      supportsPersistentVoiceClone: false,
      supportsInstantVoiceClone: false,
      supportsVoiceCloneDelete: false
    },
    vendorModels: [
      {
        modelId: "mock-tts-v1",
        displayName: "Mock TTS v1",
        description: "Local sine-wave model used for facade and archive validation.",
        defaultForOperations: ["tts.sync"],
        canonicalCapabilities: {
          supportsText: true,
          supportsSSML: false,
          supportedOperations: ["tts.sync"],
          outputFormats: ["wav"],
          sampleRatesHz: [16000, 24000, 48000],
          maxTextChars: 10000,
          canonicalControls: {
            speed: {
              support: "supported",
              min: 0.5,
              max: 2,
              defaultValue: 1
            },
            pitch: {
              support: "approximated",
              min: -12,
              max: 12,
              defaultValue: 0
            },
            volume: {
              support: "ignored",
              defaultValue: 1
            },
            language: {
              support: "supported",
              values: ["en", "zh", "ja"]
            }
          }
        },
        defaultConfiguration: {
          output: {
            format: "wav",
            sampleRateHz: 24000,
            channels: 1
          },
          controls: {
            speed: 1,
            pitch: 0,
            volume: 1,
            language: "en"
          }
        },
        vendorModelFeatureSchema: {
          schemaVersion: "1.0.0",
          title: "Mock TTS model features",
          description: "Model-specific mock controls accepted through the vendor extension boundary.",
          jsonSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              toneHz: {
                type: "number",
                minimum: 120,
                maximum: 1200
              },
              durationMs: {
                type: "number",
                minimum: 200,
                maximum: 3000
              }
            }
          }
        }
      }
    ],
    operations: {
      "tts.sync": {
        operation: "tts.sync",
        supported: true,
        transportProtocols: ["https"],
        outputFormats: ["wav"],
        sampleRatesHz: [16000, 24000, 48000],
        maxTextChars: 10000,
        canonicalControls: {
          speed: {
            support: "supported",
            min: 0.5,
            max: 2,
            defaultValue: 1
          },
          pitch: {
            support: "approximated",
            min: -12,
            max: 12,
            defaultValue: 0
          },
          volume: {
            support: "ignored",
            defaultValue: 1,
            notes: ["The mock adapter records volume in the mapping report but does not change audio gain."]
          },
          language: {
            support: "supported",
            values: ["en", "zh", "ja"]
          }
        },
        vendorExtensionSchema: mockExtensionSchema("tts.sync")
      },
      "tts.stream": {
        operation: "tts.stream",
        supported: false,
        transportProtocols: ["websocket", "sse", "http_chunk"],
        inputModes: ["text_once", "text_incremental"],
        outputFormats: ["wav", "pcm"],
        outputChunkFormats: ["pcm"],
        sampleRatesHz: [16000, 24000],
        maxTextChars: 10000,
        supportsTimestamps: false,
        supportsInterruption: false,
        canonicalControls: {},
        vendorExtensionSchema: mockExtensionSchema("tts.stream"),
        notes: ["Contract is declared, but streaming execution is intentionally deferred."]
      },
      "voice.clone.create": {
        operation: "voice.clone.create",
        supported: false,
        voiceClone: {
          persistent: true,
          instant: false,
          requiresTranscript: false,
          supportedAudioFormats: ["wav", "mp3", "m4a"],
          minReferenceAudioSeconds: 10,
          maxReferenceAudioSeconds: 300,
          maxReferenceAudioFiles: 1
        },
        canonicalControls: {},
        vendorExtensionSchema: mockExtensionSchema("voice.clone.create"),
        notes: ["Voice clone storage is reserved for a later skeleton phase."]
      },
      "voice.clone.instant": {
        operation: "voice.clone.instant",
        supported: false,
        voiceClone: {
          persistent: false,
          instant: true,
          requiresTranscript: false,
          supportedAudioFormats: ["wav", "mp3", "m4a"],
          minReferenceAudioSeconds: 10,
          maxReferenceAudioSeconds: 300,
          maxReferenceAudioFiles: 1
        },
        canonicalControls: {},
        vendorExtensionSchema: mockExtensionSchema("voice.clone.instant")
      },
      "voice.clone.delete": {
        operation: "voice.clone.delete",
        supported: false,
        canonicalControls: {},
        vendorExtensionSchema: mockExtensionSchema("voice.clone.delete")
      }
    }
  };
}
