import type { TTSCapabilities, TTSVendorModel, VoiceCompatibilityPolicy } from "@tts-platform/core";
import { doubaoExtensionSchema, doubaoTtsExtensionSchema } from "./extension-schema";

export const DOUBAO_PROVIDER_ID = "doubao";
export const DOUBAO_ADAPTER_VERSION = "0.1.0";
export const DOUBAO_DEFAULT_TTS_RESOURCE_ID = "seed-tts-2.0";
export const DOUBAO_DEFAULT_CLONE_RESOURCE_ID = "seed-icl-2.0";
export const DOUBAO_DEFAULT_RESOURCE_ID = DOUBAO_DEFAULT_TTS_RESOURCE_ID;

const doubaoCloneResourceIds = ["seed-icl-2.0", "seed-icl-1.0", "seed-icl-1.0-concurr"] as const;
const doubaoTtsResourceIds = ["seed-tts-2.0", "seed-tts-1.0", "seed-tts-1.0-concurr"] as const;
const doubaoResourceIds = [...doubaoCloneResourceIds, ...doubaoTtsResourceIds] as const;
const outputFormats = ["mp3", "pcm", "opus"] as const;
const sampleRatesHz = [8000, 16000, 22050, 24000, 32000, 44100, 48000] as const;

// doubaoSameResourcePolicy: 豆包复刻音色必须匹配 X-Api-Resource-Id，能力声明在 provider/model/operation 三层复用。
const doubaoSameResourcePolicy: VoiceCompatibilityPolicy = {
  kind: "same_resource",
  enforcedBy: "vendor",
  resourceKind: "clone_resource",
  notes: ["复刻音色合成时必须用匹配的 X-Api-Resource-Id。"]
};

// doubaoModel: 入参为豆包 Resource Id；输出模型级 capability，按 operation 区分复刻模型和合成模型。
function doubaoModel(resourceId: (typeof doubaoResourceIds)[number]): TTSVendorModel {
  if (isDoubaoCloneResourceId(resourceId)) {
    return {
      modelId: resourceId,
      displayName: `${resourceId} · 声音复刻模型`,
      defaultForOperations: resourceId === DOUBAO_DEFAULT_CLONE_RESOURCE_ID ? ["voice.clone.create"] : [],
      canonicalCapabilities: {
        supportsText: false,
        supportsSSML: false,
        supportedOperations: ["voice.clone.create"],
        canonicalControls: {},
        voiceClone: {
          persistent: true,
          instant: false,
          requiresTranscript: false,
          supportedAudioFormats: ["wav", "mp3", "m4a", "pcm"],
          maxReferenceAudioFiles: 1,
          resultCompatibility: doubaoSameResourcePolicy
        }
      },
      voiceCompatibilityPolicy: doubaoSameResourcePolicy,
      vendorModelFeatureSchema: doubaoExtensionSchema("voice.clone.create"),
      notes: ["seed-icl 系列只作为声音复刻模型；复刻后的音色按厂商级资源管理，可在豆包 TTS 合成模型中选择使用。"]
    };
  }

  return {
    modelId: resourceId,
    displayName: resourceId,
    defaultForOperations: resourceId === DOUBAO_DEFAULT_TTS_RESOURCE_ID ? ["tts.sync", "tts.stream"] : [],
    canonicalCapabilities: {
      supportsText: true,
      supportsSSML: true,
      supportedOperations: ["tts.sync", "tts.stream"],
      outputFormats: [...outputFormats],
      outputChunkFormats: [...outputFormats],
      sampleRatesHz: [...sampleRatesHz],
      maxTextChars: 10000,
      canonicalControls: doubaoCanonicalControls(),
      voiceCompatibilityPolicy: doubaoSameResourcePolicy
    },
    voiceCompatibilityPolicy: doubaoSameResourcePolicy,
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
    notes: ["modelId 映射为 X-Api-Resource-Id；seed-tts 系列仅用于 TTS 合成。"]
  };
}

// doubaoCanonicalControls: 无入参；输出豆包 TTS SSE 资源共用的 canonical controls。
function doubaoCanonicalControls(): TTSVendorModel["canonicalCapabilities"]["canonicalControls"] {
  return {
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
  };
}

// doubaoCapabilities: 入参为 adapterVersion；输出豆包 adapter 固化的 provider capability 定义。
export function doubaoCapabilities(adapterVersion = DOUBAO_ADAPTER_VERSION): TTSCapabilities {
  const defaultControls = doubaoModel(DOUBAO_DEFAULT_TTS_RESOURCE_ID).canonicalCapabilities.canonicalControls;
  return {
    providerId: DOUBAO_PROVIDER_ID,
    providerName: "Doubao",
    adapterVersion,
    voiceCompatibilityPolicy: doubaoSameResourcePolicy,
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
        voiceCompatibilityPolicy: doubaoSameResourcePolicy,
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
        voiceCompatibilityPolicy: doubaoSameResourcePolicy,
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
          maxReferenceAudioFiles: 1,
          resultCompatibility: doubaoSameResourcePolicy
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

// isDoubaoCloneResourceId: 入参为 Resource Id；输出是否为只用于声音复刻的 seed-icl 系列。
function isDoubaoCloneResourceId(resourceId: string): resourceId is (typeof doubaoCloneResourceIds)[number] {
  return (doubaoCloneResourceIds as readonly string[]).includes(resourceId);
}
