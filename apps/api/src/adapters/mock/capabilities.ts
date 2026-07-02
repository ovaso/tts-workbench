import type { TTSCapabilities } from "@tts-platform/core";
import { mockExtensionSchema } from "./extension-schema";

export const MOCK_PROVIDER_ID = "mock";

export function mockCapabilities(adapterVersion: string): TTSCapabilities {
  return {
    providerId: MOCK_PROVIDER_ID,
    providerName: "Local Mock TTS",
    adapterVersion,
    operations: {
      "tts.sync": {
        operation: "tts.sync",
        supported: true,
        outputFormats: ["wav"],
        sampleRatesHz: [16000, 24000, 48000],
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
        outputFormats: ["wav", "pcm"],
        sampleRatesHz: [16000, 24000],
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
          supportedAudioFormats: ["wav", "mp3"]
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
          supportedAudioFormats: ["wav", "mp3"]
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
