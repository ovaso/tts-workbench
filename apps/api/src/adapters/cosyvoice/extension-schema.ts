import type { TTSOperation, VendorExtensionSchema } from "@tts-platform/core";

// cosyVoiceTtsExtensionSchema: CosyVoice TTS 厂商扩展 schema，只放不能进入 canonical 的厂商参数。
export const cosyVoiceTtsExtensionSchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "CosyVoice TTS extension",
  description: "CosyVoice-specific TTS parameters passed through the vendor extension boundary.",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      instruction: {
        type: "string"
      },
      text_type: {
        type: "string",
        enum: ["PlainText", "SSML"]
      },
      enable_ssml: {
        type: "boolean"
      }
    }
  }
};

// cosyVoiceCloneExtensionSchema: CosyVoice 音色复刻厂商扩展 schema，限制为文档确认的补充字段。
export const cosyVoiceCloneExtensionSchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "CosyVoice voice clone extension",
  description: "CosyVoice-specific voice enrollment fields not already represented by the canonical clone form.",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      prefix: {
        type: "string"
      }
    }
  }
};

const emptySchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "No CosyVoice extension",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {}
  }
};

// cosyVoiceExtensionSchema: 入参为 operation；输出 CosyVoice 对应 operation 的 vendor extension schema。
export function cosyVoiceExtensionSchema(operation: TTSOperation): VendorExtensionSchema {
  if (operation === "tts.sync" || operation === "tts.stream") {
    return cosyVoiceTtsExtensionSchema;
  }
  if (operation === "voice.clone.create") {
    return cosyVoiceCloneExtensionSchema;
  }
  return emptySchema;
}
