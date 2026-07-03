import type { TTSCapabilities, TTSVendorModel } from "@tts-platform/core";
import { doubaoExtensionSchema, doubaoTtsExtensionSchema } from "./extension-schema";

export const DOUBAO_PROVIDER_ID = "doubao";
export const DOUBAO_ADAPTER_VERSION = "0.1.0";
export const DOUBAO_DEFAULT_RESOURCE_ID = "seed-icl-2.0";

const doubaoResourceIds = ["seed-icl-2.0", "seed-icl-1.0", "seed-icl-1.0-concurr", "seed-tts-2.0", "seed-tts-1.0", "seed-tts-1.0-concurr"] as const;
const outputFormats = ["mp3", "pcm", "opus"] as const;
const sampleRatesHz = [8000, 16000, 22050, 24000, 32000, 44100, 48000] as const;

// doubaoModel: 入参为豆包 Resource Id；输出模型级 capability，用 Resource Id 对齐计费和音色可用性。
function doubaoModel(resourceId: (typeof doubaoResourceIds)[number]): TTSVendorModel {
  return {
    modelId: resourceId,
    displayName: resourceId,
    defaultForOperations: resourceId === DOUBAO_DEFAULT_RESOURCE_ID ? ["tts.sync", "tts.stream", "voice.clone.create"] : [],
    canonicalCapabilities: {
      supportsText: true,
      supportsSSML: true,
      supportedOperations: ["tts.sync", "tts.stream", "voice.clone.create"],
      outputFormats: [...outputFormats],
      outputChunkFormats: [...outputFormats],
      sampleRatesHz: [...sampleRatesHz],
      maxTextChars: 10000,
      canonicalControls: {
        speed: {
          support: "supported",
          min: -50,
          max: 100,
          defaultValue: 0,
          notes: ["豆包 speech_rate 使用 -50 到 100 的厂商刻度。"]
        },
        volume: {
          support: "supported",
          min: -50,
          max: 100,
          defaultValue: 0,
          notes: ["豆包 loudness_rate 使用 -50 到 100 的厂商刻度。"]
        },
        emotion: {
          support: "supported",
          notes: ["仅部分音色支持 emotion 与 emotion_scale。"]
        },
        language: {
          support: "supported",
          values: ["zh-CN", "en-US", "ja-JP", "es-ES", "id-ID", "pt-PT", "de-DE", "fr-FR", "ko-KR"]
        }
      },
      voiceClone: {
        persistent: true,
        instant: false,
        requiresTranscript: false,
        supportedAudioFormats: ["wav", "mp3", "m4a", "pcm"],
        maxReferenceAudioFiles: 1
      }
    },
    defaultConfiguration: {
      output: {
        format: "mp3",
        sampleRateHz: 24000,
        channels: 1
      },
      controls: {
        speed: 0,
        volume: 0
      }
    },
    vendorModelFeatureSchema: doubaoTtsExtensionSchema,
    notes: ["modelId 映射为 X-Api-Resource-Id；声音复刻 2.0 的 req_params.model 通过 vendor extension ttsModel 传入。"]
  };
}

// doubaoCapabilities: 入参为 adapterVersion；输出豆包 adapter 固化的 provider capability 定义。
export function doubaoCapabilities(adapterVersion = DOUBAO_ADAPTER_VERSION): TTSCapabilities {
  const defaultControls = doubaoModel(DOUBAO_DEFAULT_RESOURCE_ID).canonicalCapabilities.canonicalControls;
  return {
    providerId: DOUBAO_PROVIDER_ID,
    providerName: "Doubao",
    adapterVersion,
    vendorFeatures: {
      supportsHttpTTS: true,
      supportsStreamingTTS: true,
      supportsPersistentVoiceClone: true,
      supportsInstantVoiceClone: false,
      supportsVoiceCloneDelete: false
    },
    vendorModels: doubaoResourceIds.map((resourceId) => doubaoModel(resourceId)),
    operations: {
      "tts.sync": {
        operation: "tts.sync",
        supported: true,
        transportProtocols: ["sse"],
        outputFormats: [...outputFormats],
        sampleRatesHz: [...sampleRatesHz],
        maxTextChars: 10000,
        canonicalControls: defaultControls,
        vendorExtensionSchema: doubaoExtensionSchema("tts.sync"),
        notes: ["当前 adapter 通过豆包 SSE 接口聚合所有音频片段，形成同步合成结果。"]
      },
      "tts.stream": {
        operation: "tts.stream",
        supported: true,
        transportProtocols: ["sse"],
        inputModes: ["text_once"],
        outputFormats: [...outputFormats],
        outputChunkFormats: [...outputFormats],
        sampleRatesHz: [...sampleRatesHz],
        supportsTimestamps: true,
        supportsInterruption: false,
        canonicalControls: defaultControls,
        vendorExtensionSchema: doubaoExtensionSchema("tts.stream")
      },
      "voice.clone.create": {
        operation: "voice.clone.create",
        supported: true,
        voiceClone: {
          persistent: true,
          instant: false,
          requiresTranscript: false,
          supportedAudioFormats: ["wav", "mp3", "m4a", "pcm"],
          maxReferenceAudioFiles: 1
        },
        canonicalControls: {},
        vendorExtensionSchema: doubaoExtensionSchema("voice.clone.create"),
        notes: ["豆包 V3 训练接口需要本地音频内容转 base64；当前 adapter 支持 referenceAudio.path 或 file:// URI。"]
      },
      "voice.clone.instant": {
        operation: "voice.clone.instant",
        supported: false,
        canonicalControls: {},
        vendorExtensionSchema: doubaoExtensionSchema("voice.clone.instant")
      },
      "voice.clone.delete": {
        operation: "voice.clone.delete",
        supported: false,
        canonicalControls: {},
        vendorExtensionSchema: doubaoExtensionSchema("voice.clone.delete")
      }
    }
  };
}
