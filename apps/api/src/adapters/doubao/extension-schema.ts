import type { TTSOperation, VendorExtensionSchema } from "@tts-platform/core";

// doubaoTtsExtensionSchema: 豆包 TTS 厂商扩展 schema；仅承载 canonical 无法表达的 V3 请求字段。
export const doubaoTtsExtensionSchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "Doubao TTS extension",
  description: "Doubao-specific TTS V3 parameters passed through the vendor extension boundary.",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      uid: {
        type: "string"
      },
      namespace: {
        type: "string"
      },
      resourceId: {
        type: "string"
      },
      ttsModel: {
        type: "string",
        enum: ["seed-tts-2.0-standard", "seed-tts-2.0-expressive"]
      },
      additions: {
        type: "object"
      },
      emotionScale: {
        type: "number",
        minimum: 1,
        maximum: 5
      },
      enableTimestamp: {
        type: "boolean"
      },
      enableSubtitle: {
        type: "boolean"
      },
      mixSpeaker: {
        type: "object"
      },
      requireUsageTokens: {
        type: "boolean"
      }
    }
  }
};

// doubaoVoiceCloneExtensionSchema: 豆包声音复刻扩展 schema；限制为 V3 clone 文档确认的补充字段。
export const doubaoVoiceCloneExtensionSchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "Doubao voice clone extension",
  description: "Doubao-specific voice clone V3 parameters not represented by the canonical clone form.",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      speakerId: {
        type: "string"
      },
      customSpeakerId: {
        type: "string"
      },
      prepaid: {
        type: "boolean"
      },
      languageCode: {
        type: "number"
      },
      extraParams: {
        type: "object"
      }
    }
  }
};

const emptySchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "No Doubao extension",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {}
  }
};

// doubaoExtensionSchema: 入参为 operation；输出豆包对应 operation 的 vendor extension schema。
export function doubaoExtensionSchema(operation: TTSOperation): VendorExtensionSchema {
  if (operation === "tts.sync" || operation === "tts.stream") {
    return doubaoTtsExtensionSchema;
  }
  if (operation === "voice.clone.create") {
    return doubaoVoiceCloneExtensionSchema;
  }
  return emptySchema;
}
