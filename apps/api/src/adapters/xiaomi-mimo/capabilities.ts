import type { TTSCapabilities, TTSVendorModel } from "@tts-platform/core";
import { xiaomiMiMoExtensionSchema } from "./extension-schema";

export const XIAOMI_MIMO_PROVIDER_ID = "xiaomi_mimo";
export const XIAOMI_MIMO_ADAPTER_VERSION = "0.1.0";
export const XIAOMI_MIMO_DEFAULT_MODEL = "mimo-v2.5-tts";
export const XIAOMI_MIMO_DEFAULT_VOICE_ID = "mimo_default";

const outputFormats = ["wav"] as const;
const streamChunkFormats = ["pcm"] as const;
const sampleRatesHz = [24000] as const;

// xiaomiMiMoModel: 入参为模型 id；输出该 MiMo 模型在平台中的 capability 描述。
function xiaomiMiMoModel(modelId: "mimo-v2.5-tts" | "mimo-v2.5-tts-voicedesign" | "mimo-v2.5-tts-voiceclone"): TTSVendorModel {
  if (modelId === "mimo-v2.5-tts-voiceclone") {
    return {
      modelId,
      displayName: "MiMo V2.5 TTS Voice Clone",
      defaultForOperations: ["voice.clone.instant"],
      canonicalCapabilities: {
        supportsText: true,
        supportsSSML: false,
        supportedOperations: ["voice.clone.instant"],
        outputFormats: [...outputFormats],
        sampleRatesHz: [...sampleRatesHz],
        canonicalControls: xiaomiMiMoCanonicalControls(),
        voiceClone: {
          persistent: false,
          instant: true,
          requiresTranscript: false,
          supportedAudioFormats: ["mp3", "wav"],
          maxReferenceAudioFiles: 1
        }
      },
      defaultConfiguration: {
        output: {
          format: "wav",
          sampleRateHz: 24000,
          channels: 1
        }
      },
      vendorModelFeatureSchema: xiaomiMiMoExtensionSchema("voice.clone.instant"),
      notes: ["即时音色复刻不返回持久 voiceId，请映射到 voice.clone.instant。"]
    };
  }

  return {
    modelId,
    displayName: modelId === "mimo-v2.5-tts" ? "MiMo V2.5 TTS" : "MiMo V2.5 TTS Voice Design",
    defaultForOperations: modelId === XIAOMI_MIMO_DEFAULT_MODEL ? ["tts.sync", "tts.stream"] : [],
    canonicalCapabilities: {
      supportsText: true,
      supportsSSML: false,
      supportedOperations: modelId === "mimo-v2.5-tts" ? ["tts.sync", "tts.stream"] : ["tts.sync"],
      outputFormats: [...outputFormats],
      sampleRatesHz: [...sampleRatesHz],
      canonicalControls: xiaomiMiMoCanonicalControls(),
      ...(modelId === "mimo-v2.5-tts" ? { outputChunkFormats: [...streamChunkFormats] } : {})
    },
    defaultConfiguration: {
      ...(modelId === "mimo-v2.5-tts"
        ? {
            voice: {
              providerVoiceId: XIAOMI_MIMO_DEFAULT_VOICE_ID
            }
          }
        : {}),
      output: {
        format: "wav",
        sampleRateHz: 24000,
        channels: 1
      }
    },
    vendorModelFeatureSchema: xiaomiMiMoExtensionSchema("tts.sync"),
    notes:
      modelId === "mimo-v2.5-tts-voicedesign"
        ? ["音色描述通过 vendor extension 的 voiceDesignPrompt 表达，不新增 canonical 字段。"]
        : ["流式低延迟能力仅声明在 mimo-v2.5-tts。"]
  };
}

// xiaomiMiMoCanonicalControls: 无入参；输出 MiMo 可近似支持的 canonical controls。
function xiaomiMiMoCanonicalControls(): TTSVendorModel["canonicalCapabilities"]["canonicalControls"] {
  return {
    style: {
      support: "approximated",
      notes: ["通过 user prompt 或 assistant 标签近似表达。"]
    },
    emotion: {
      support: "approximated",
      notes: ["通过自然语言风格提示或音频标签近似表达。"]
    },
    speed: {
      support: "approximated",
      notes: ["通过自然语言提示表达，不是独立数值参数。"]
    },
    pitch: {
      support: "approximated",
      notes: ["通过自然语言提示表达，不是独立数值参数。"]
    },
    language: {
      support: "approximated",
      values: ["zh", "en", "auto"],
      notes: ["语言主要由文本、预置音色和标签共同决定。"]
    }
  };
}

// xiaomiMiMoCapabilities: 入参为 adapterVersion；输出 Xiaomi MiMo provider capability 定义。
export function xiaomiMiMoCapabilities(adapterVersion = XIAOMI_MIMO_ADAPTER_VERSION): TTSCapabilities {
  return {
    providerId: XIAOMI_MIMO_PROVIDER_ID,
    providerName: "Xiaomi MiMo",
    adapterVersion,
    vendorFeatures: {
      supportsHttpTTS: true,
      supportsStreamingTTS: true,
      supportsPersistentVoiceClone: false,
      supportsInstantVoiceClone: true,
      supportsVoiceCloneDelete: false
    },
    vendorModels: [
      xiaomiMiMoModel("mimo-v2.5-tts"),
      xiaomiMiMoModel("mimo-v2.5-tts-voicedesign"),
      xiaomiMiMoModel("mimo-v2.5-tts-voiceclone")
    ],
    operations: {
      "tts.sync": {
        operation: "tts.sync",
        supported: true,
        transportProtocols: ["https"],
        outputFormats: [...outputFormats],
        sampleRatesHz: [...sampleRatesHz],
        canonicalControls: xiaomiMiMoCanonicalControls(),
        vendorExtensionSchema: xiaomiMiMoExtensionSchema("tts.sync")
      },
      "tts.stream": {
        operation: "tts.stream",
        supported: true,
        transportProtocols: ["sse"],
        inputModes: ["text_once"],
        outputFormats: [...streamChunkFormats],
        outputChunkFormats: [...streamChunkFormats],
        sampleRatesHz: [...sampleRatesHz],
        supportsTimestamps: false,
        supportsInterruption: false,
        canonicalControls: xiaomiMiMoCanonicalControls(),
        vendorExtensionSchema: xiaomiMiMoExtensionSchema("tts.stream"),
        notes: ["当前仅 mimo-v2.5-tts 声明低延迟流式。"]
      },
      "voice.clone.create": {
        operation: "voice.clone.create",
        supported: false,
        canonicalControls: {},
        vendorExtensionSchema: xiaomiMiMoExtensionSchema("voice.clone.create")
      },
      "voice.clone.instant": {
        operation: "voice.clone.instant",
        supported: true,
        transportProtocols: ["https"],
        outputFormats: [...outputFormats],
        sampleRatesHz: [...sampleRatesHz],
        voiceClone: {
          persistent: false,
          instant: true,
          requiresTranscript: false,
          supportedAudioFormats: ["mp3", "wav"],
          maxReferenceAudioFiles: 1
        },
        canonicalControls: xiaomiMiMoCanonicalControls(),
        vendorExtensionSchema: xiaomiMiMoExtensionSchema("voice.clone.instant")
      },
      "voice.clone.delete": {
        operation: "voice.clone.delete",
        supported: false,
        canonicalControls: {},
        vendorExtensionSchema: xiaomiMiMoExtensionSchema("voice.clone.delete")
      }
    }
  };
}
