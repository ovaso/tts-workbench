import type { TTSOperation, VendorExtensionSchema } from "@tts-platform/core";

const ttsSchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "Xiaomi MiMo TTS extension",
  description: "MiMo Chat Completions TTS specific controls kept behind the vendor extension boundary.",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      stylePrompt: {
        type: "string",
        description: "Natural-language user prompt for style and delivery control."
      },
      assistantPrefix: {
        type: "string",
        description: "Audio tag prefix prepended to assistant text, for example (开心) or (唱歌)."
      },
      voiceDesignPrompt: {
        type: "string",
        description: "Voice description required by mimo-v2.5-tts-voicedesign."
      },
      optimizeTextPreview: {
        type: "boolean",
        description: "Maps to audio.optimize_text_preview for voice design previews."
      }
    }
  }
};

const instantCloneSchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "Xiaomi MiMo instant voice clone extension",
  description: "MiMo instant voice clone controls that do not belong in canonical reference audio fields.",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      stylePrompt: {
        type: "string"
      },
      assistantPrefix: {
        type: "string"
      }
    }
  }
};

const emptySchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "No Xiaomi MiMo extension",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {}
  }
};

// xiaomiMiMoExtensionSchema: 入参为 operation；输出对应 MiMo operation 的 vendor extension schema。
export function xiaomiMiMoExtensionSchema(operation: TTSOperation): VendorExtensionSchema {
  if (operation === "tts.sync" || operation === "tts.stream") {
    return ttsSchema;
  }
  if (operation === "voice.clone.instant") {
    return instantCloneSchema;
  }
  return emptySchema;
}
