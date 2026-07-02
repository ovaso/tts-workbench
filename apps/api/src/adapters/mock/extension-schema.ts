import type { TTSOperation, VendorExtensionSchema } from "@tts-platform/core";

const syncSchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "Mock sync synthesis extension",
  description: "Optional controls used only by the local mock adapter.",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      toneHz: {
        type: "number",
        minimum: 120,
        maximum: 1200
      },
      durationMs: {
        type: "number",
        minimum: 200,
        maximum: 3000
      }
    }
  }
};

const emptySchema: VendorExtensionSchema = {
  schemaVersion: "1.0.0",
  title: "No vendor extension",
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {}
  }
};

export function mockExtensionSchema(operation: TTSOperation): VendorExtensionSchema {
  if (operation === "tts.sync") {
    return syncSchema;
  }
  return emptySchema;
}
