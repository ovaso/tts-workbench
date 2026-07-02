import type { TTSCapabilities, TTSVendorModel } from "@tts-platform/core";
import { minimaxSyncExtensionSchema, minimaxExtensionSchema } from "./extension-schema";

export const MINIMAX_PROVIDER_ID = "minimax";
export const MINIMAX_ADAPTER_VERSION = "0.1.0";

// speechModels: MiniMax 文档声明的 TTS 模型常量；模型属于 vendor adapter 的静态定义。
const speechModels = [
  "speech-2.8-hd",
  "speech-2.8-turbo",
  "speech-2.6-hd",
  "speech-2.6-turbo",
  "speech-02-hd",
  "speech-02-turbo",
  "speech-01-hd",
  "speech-01-turbo"
] as const;

const outputFormats = ["mp3", "wav", "flac"] as const;
const streamFormats = ["mp3"] as const;
const sampleRatesHz = [16000, 24000, 32000, 44100] as const;

// minimaxSpeechModel: 入参为 MiniMax modelId 和展示名；输出该模型的 canonical 能力与厂商模型扩展 schema。
function minimaxSpeechModel(modelId: (typeof speechModels)[number], displayName = modelId): TTSVendorModel {
  return {
    modelId,
    displayName,
    defaultForOperations: modelId === "speech-2.8-hd" ? ["tts.sync", "tts.stream", "voice.clone.create"] : [],
    canonicalCapabilities: {
      supportsText: true,
      supportsSSML: false,
      supportedOperations: ["tts.sync", "tts.stream", "voice.clone.create"],
      outputFormats: [...outputFormats],
      outputChunkFormats: [...streamFormats],
      sampleRatesHz: [...sampleRatesHz],
      maxTextChars: 10000,
      canonicalControls: {
        speed: {
          support: "supported",
          min: 0.5,
          max: 2,
          defaultValue: 1
        },
        pitch: {
          support: "supported",
          min: -12,
          max: 12,
          defaultValue: 0
        },
        volume: {
          support: "supported",
          min: 0,
          max: 10,
          defaultValue: 1
        },
        emotion: {
          support: "supported",
          values: ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"]
        },
        language: {
          support: "supported",
          values: [
            "Chinese",
            "Chinese,Yue",
            "English",
            "Japanese",
            "Korean",
            "Spanish",
            "French",
            "German",
            "Portuguese",
            "Russian",
            "Arabic",
            "auto"
          ]
        }
      },
      voiceClone: {
        persistent: true,
        instant: false,
        requiresTranscript: false,
        supportedAudioFormats: ["mp3", "m4a", "wav"],
        minReferenceAudioSeconds: 10,
        maxReferenceAudioSeconds: 300,
        maxReferenceAudioFiles: 1
      }
    },
    defaultConfiguration: {
      output: {
        format: "mp3",
        sampleRateHz: 32000,
        bitrate: 128000,
        channels: 1
      },
      controls: {
        speed: 1,
        pitch: 0,
        volume: 1
      }
    },
    vendorModelFeatureSchema: minimaxSyncExtensionSchema
  };
}

// minimaxCapabilities: 入参为 adapterVersion；输出 MiniMax adapter 固化的 provider capability 定义。
export function minimaxCapabilities(adapterVersion = MINIMAX_ADAPTER_VERSION): TTSCapabilities {
  return {
    providerId: MINIMAX_PROVIDER_ID,
    providerName: "MiniMax",
    adapterVersion,
    vendorFeatures: {
      supportsHttpTTS: true,
      supportsStreamingTTS: true,
      supportsPersistentVoiceClone: true,
      supportsInstantVoiceClone: false,
      supportsVoiceCloneDelete: false
    },
    vendorModels: speechModels.map((modelId) => minimaxSpeechModel(modelId)),
    operations: {
      "tts.sync": {
        operation: "tts.sync",
        supported: true,
        transportProtocols: ["https"],
        outputFormats: [...outputFormats],
        sampleRatesHz: [...sampleRatesHz],
        maxTextChars: 10000,
        canonicalControls: minimaxSpeechModel("speech-2.8-hd").canonicalCapabilities.canonicalControls,
        vendorExtensionSchema: minimaxExtensionSchema("tts.sync")
      },
      "tts.stream": {
        operation: "tts.stream",
        supported: true,
        transportProtocols: ["websocket"],
        inputModes: ["text_once", "text_incremental"],
        outputFormats: [...streamFormats],
        outputChunkFormats: [...streamFormats],
        sampleRatesHz: [...sampleRatesHz],
        maxTextChars: 10000,
        supportsTimestamps: true,
        supportsInterruption: false,
        canonicalControls: minimaxSpeechModel("speech-2.8-hd").canonicalCapabilities.canonicalControls,
        vendorExtensionSchema: minimaxExtensionSchema("tts.stream")
      },
      "voice.clone.create": {
        operation: "voice.clone.create",
        supported: true,
        voiceClone: {
          persistent: true,
          instant: false,
          requiresTranscript: false,
          supportedAudioFormats: ["mp3", "m4a", "wav"],
          minReferenceAudioSeconds: 10,
          maxReferenceAudioSeconds: 300,
          maxReferenceAudioFiles: 1
        },
        canonicalControls: {},
        vendorExtensionSchema: minimaxExtensionSchema("voice.clone.create")
      },
      "voice.clone.instant": {
        operation: "voice.clone.instant",
        supported: false,
        canonicalControls: {},
        vendorExtensionSchema: minimaxExtensionSchema("voice.clone.instant")
      },
      "voice.clone.delete": {
        operation: "voice.clone.delete",
        supported: false,
        canonicalControls: {},
        vendorExtensionSchema: minimaxExtensionSchema("voice.clone.delete")
      }
    }
  };
}
