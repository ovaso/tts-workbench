import type { TTSCapabilities, TTSVendorModel } from "@tts-platform/core";
import { cosyVoiceExtensionSchema, cosyVoiceTtsExtensionSchema } from "./extension-schema";

export const COSYVOICE_PROVIDER_ID = "cosyvoice";
export const COSYVOICE_ADAPTER_VERSION = "0.1.0";
export const COSYVOICE_DEFAULT_MODEL = "cosyvoice-v3.5-plus";

const cosyVoiceModels = [
  "cosyvoice-v3.5-plus",
  "cosyvoice-v3.5-flash",
  "cosyvoice-v3-plus",
  "cosyvoice-v3-flash",
  "cosyvoice-v2",
  "cosyvoice-v1"
] as const;

const outputFormats = ["mp3", "wav"] as const;
const sampleRatesHz = [16000, 24000, 48000] as const;

// cosyVoiceModel: 入参为模型 ID；输出模型级 canonical 能力和默认输出配置。
function cosyVoiceModel(modelId: (typeof cosyVoiceModels)[number]): TTSVendorModel {
  const model: TTSVendorModel = {
    modelId,
    displayName: modelId,
    defaultForOperations: modelId === COSYVOICE_DEFAULT_MODEL ? ["tts.sync", "tts.stream", "voice.clone.create"] : [],
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
          min: 0.5,
          max: 2,
          defaultValue: 1
        },
        pitch: {
          support: "supported",
          min: 0.5,
          max: 2,
          defaultValue: 1
        },
        volume: {
          support: "supported",
          min: 0,
          max: 100,
          defaultValue: 50
        },
        style: {
          support: "supported",
          notes: ["CosyVoice v3.5 models expose instruction-style control through vendor extension."]
        },
        language: {
          support: "supported",
          values: ["zh-CN", "en-US", "ja-JP", "ko-KR"]
        }
      },
      voiceClone: {
        persistent: true,
        instant: false,
        requiresTranscript: false,
        supportedAudioFormats: ["wav", "mp3", "m4a"],
        minReferenceAudioSeconds: 10,
        maxReferenceAudioSeconds: 60,
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
        speed: 1,
        pitch: 1,
        volume: 50
      }
    },
    vendorModelFeatureSchema: cosyVoiceTtsExtensionSchema
  };
  if (modelId.startsWith("cosyvoice-v3.5")) {
    model.notes = ["v3.5 models do not provide system voices; pass a cloned or designed voice id."];
  }
  return model;
}

// cosyVoiceCapabilities: 入参为 adapterVersion；输出 CosyVoice adapter 的 provider capability 定义。
export function cosyVoiceCapabilities(adapterVersion = COSYVOICE_ADAPTER_VERSION): TTSCapabilities {
  return {
    providerId: COSYVOICE_PROVIDER_ID,
    providerName: "CosyVoice",
    adapterVersion,
    vendorFeatures: {
      supportsHttpTTS: true,
      supportsStreamingTTS: true,
      supportsPersistentVoiceClone: true,
      supportsInstantVoiceClone: false,
      supportsVoiceCloneDelete: false
    },
    vendorModels: cosyVoiceModels.map((modelId) => cosyVoiceModel(modelId)),
    operations: {
      "tts.sync": {
        operation: "tts.sync",
        supported: true,
        transportProtocols: ["https"],
        outputFormats: [...outputFormats],
        sampleRatesHz: [...sampleRatesHz],
        maxTextChars: 10000,
        canonicalControls: cosyVoiceModel(COSYVOICE_DEFAULT_MODEL).canonicalCapabilities.canonicalControls,
        vendorExtensionSchema: cosyVoiceExtensionSchema("tts.sync"),
        notes: ["CosyVoice HTTP non-realtime synthesis currently uses the Beijing Workspace endpoint."]
      },
      "tts.stream": {
        operation: "tts.stream",
        supported: true,
        transportProtocols: ["websocket"],
        inputModes: ["text_once", "text_incremental"],
        outputFormats: [...outputFormats],
        outputChunkFormats: [...outputFormats],
        sampleRatesHz: [...sampleRatesHz],
        maxTextChars: 10000,
        supportsTimestamps: false,
        supportsInterruption: false,
        canonicalControls: cosyVoiceModel(COSYVOICE_DEFAULT_MODEL).canonicalCapabilities.canonicalControls,
        vendorExtensionSchema: cosyVoiceExtensionSchema("tts.stream"),
        notes: ["Current adapter creates stream plans; upstream CosyVoice WebSocket transport is the next layer."]
      },
      "voice.clone.create": {
        operation: "voice.clone.create",
        supported: true,
        voiceClone: {
          persistent: true,
          instant: false,
          requiresTranscript: false,
          supportedAudioFormats: ["wav", "mp3", "m4a"],
          minReferenceAudioSeconds: 10,
          maxReferenceAudioSeconds: 60,
          maxReferenceAudioFiles: 1
        },
        canonicalControls: {},
        vendorExtensionSchema: cosyVoiceExtensionSchema("voice.clone.create")
      },
      "voice.clone.instant": {
        operation: "voice.clone.instant",
        supported: false,
        canonicalControls: {},
        vendorExtensionSchema: cosyVoiceExtensionSchema("voice.clone.instant")
      },
      "voice.clone.delete": {
        operation: "voice.clone.delete",
        supported: false,
        canonicalControls: {},
        vendorExtensionSchema: cosyVoiceExtensionSchema("voice.clone.delete")
      }
    }
  };
}
