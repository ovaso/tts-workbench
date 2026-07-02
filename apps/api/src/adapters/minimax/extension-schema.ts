import type { TTSOperation, VendorExtensionSchema } from "@tts-platform/core";

// minimaxSyncExtensionSchema: MiniMax HTTP/WS TTS 共享的厂商扩展 schema，只允许文档确认字段。
export const minimaxSyncExtensionSchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "MiniMax sync TTS extension",
  description: "MiniMax-specific TTS parameters passed through the vendor extension boundary.",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      pronunciation_dict: {
        type: "object"
      },
      timbre_weights: {
        type: "array"
      },
      language_boost: {
        type: ["string", "null"]
      },
      voice_modify: {
        type: "object"
      },
      subtitle_enable: {
        type: "boolean"
      },
      subtitle_type: {
        type: "string",
        enum: ["sentence", "word", "word_streaming"]
      },
      output_format: {
        type: "string",
        enum: ["hex", "url"]
      },
      aigc_watermark: {
        type: "boolean"
      }
    }
  }
};

// emptySchema: 暂未实现或没有厂商扩展的 operation 使用空 schema。
const emptySchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "No MiniMax extension",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {}
  }
};

// minimaxExtensionSchema: 入参为 operation；输出该 operation 的 MiniMax vendor extension schema。
export function minimaxExtensionSchema(operation: TTSOperation): VendorExtensionSchema {
  if (operation === "tts.sync" || operation === "tts.stream") {
    return minimaxSyncExtensionSchema;
  }
  return emptySchema;
}
