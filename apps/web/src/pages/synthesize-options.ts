import type {
  CanonicalControlCapability,
  TTSCapabilities,
  TTSOperation,
  TTSOutputFormat,
  TTSVendorModel,
  VendorPayload
} from "@tts-platform/core";

export interface SelectOption<T extends string | number> {
  title: string;
  value: T;
}

// modelOptions: 入参为 provider capability；输出当前 provider 可用于表单选择的模型选项。
export function modelOptions(capabilities: TTSCapabilities | undefined): SelectOption<string>[] {
  return (
    capabilities?.vendorModels.map((model) => ({
      title: model.displayName ?? model.modelId,
      value: model.modelId
    })) ?? []
  );
}

// defaultModelForOperation: 入参为 provider capability 和 operation；输出该 operation 的默认模型 id。
export function defaultModelForOperation(
  capabilities: TTSCapabilities | undefined,
  operation: TTSOperation
): string {
  return (
    capabilities?.vendorModels.find((model) => model.defaultForOperations?.includes(operation))?.modelId ??
    capabilities?.vendorModels[0]?.modelId ??
    ""
  );
}

// modelById: 入参为 provider capability 和模型 id；输出匹配的 vendor model。
export function modelById(
  capabilities: TTSCapabilities | undefined,
  modelId: string
): TTSVendorModel | undefined {
  return capabilities?.vendorModels.find((model) => model.modelId === modelId);
}

// formatOptionsForModel: 入参为 vendor model；输出该模型支持的编码格式选项。
export function formatOptionsForModel(model: TTSVendorModel | undefined): TTSOutputFormat[] {
  return model?.canonicalCapabilities.outputFormats ?? [];
}

// sampleRateOptionsForModel: 入参为 vendor model；输出该模型支持的采样率选项。
export function sampleRateOptionsForModel(model: TTSVendorModel | undefined): number[] {
  return model?.canonicalCapabilities.sampleRatesHz ?? [];
}

// languageOptionsForModel: 入参为 vendor model；输出该模型声明的语言选项。
export function languageOptionsForModel(model: TTSVendorModel | undefined): SelectOption<string>[] {
  const languageCapability = model?.canonicalCapabilities.canonicalControls.language;
  return valuesFromCapability(languageCapability).map((value) => ({
    title: value,
    value
  }));
}

// defaultFormatForModel: 入参为 vendor model；输出模型默认编码格式或第一个支持格式。
export function defaultFormatForModel(model: TTSVendorModel | undefined): TTSOutputFormat | undefined {
  return model?.defaultConfiguration?.output?.format ?? model?.canonicalCapabilities.outputFormats?.[0];
}

// defaultSampleRateForModel: 入参为 vendor model；输出模型默认采样率或第一个支持采样率。
export function defaultSampleRateForModel(model: TTSVendorModel | undefined): number | undefined {
  return model?.defaultConfiguration?.output?.sampleRateHz ?? model?.canonicalCapabilities.sampleRatesHz?.[0];
}

// defaultLanguageForModel: 入参为 vendor model；输出模型默认语言或第一个语言选项。
export function defaultLanguageForModel(model: TTSVendorModel | undefined): string {
  const configured = model?.defaultConfiguration?.controls?.language;
  if (typeof configured === "string") {
    return configured;
  }
  return languageOptionsForModel(model)[0]?.value ?? "";
}

// defaultVoicePlaceholderForModel: 入参为 vendor model；输出默认音色提示文本，不代表用户已显式选择。
export function defaultVoicePlaceholderForModel(model: TTSVendorModel | undefined): string {
  const voiceId = model?.defaultConfiguration?.voice?.providerVoiceId;
  return voiceId === undefined ? "留空使用厂商默认音色" : `默认：${voiceId}`;
}

// vendorExtensionTemplateForOperation: 入参为厂商能力、operation 和模型；输出该 operation 的厂商参数完整模板。
export function vendorExtensionTemplateForOperation(
  capabilities: TTSCapabilities | undefined,
  operation: TTSOperation,
  model: TTSVendorModel | undefined
): string {
  const schema = capabilities?.operations[operation]?.vendorExtensionSchema?.jsonSchema;
  const properties = schemaObject(schema?.properties);
  const params: VendorPayload = {};

  for (const [key, propertySchema] of Object.entries(properties)) {
    params[key] = templateValueForSchema(key, propertySchema, model);
  }

  return JSON.stringify(params, null, 2);
}

// valuesFromCapability: 入参为 canonical control capability；输出字符串枚举值。
function valuesFromCapability(capability: CanonicalControlCapability | undefined): string[] {
  return capability?.values ?? [];
}

// schemaObject: 入参为 JSON schema 任意节点；输出 object properties，非法时返回空对象。
function schemaObject(value: unknown): Record<string, VendorPayload> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, VendorPayload>;
}

// templateValueForSchema: 入参为字段名、schema 和模型；输出页面 JSON 模板中的占位默认值。
function templateValueForSchema(
  key: string,
  schema: VendorPayload,
  model: TTSVendorModel | undefined
): unknown {
  if (key === "language_boost") {
    return defaultLanguageForModel(model) || null;
  }
  if (key === "model") {
    return model?.modelId ?? "";
  }
  if (schema.default !== undefined) {
    return schema.default;
  }

  const enumValues = Array.isArray(schema.enum) ? schema.enum : [];
  if (enumValues.length > 0) {
    return enumValues[0];
  }

  const schemaType = schema.type;
  const types = Array.isArray(schemaType) ? schemaType : [schemaType];
  if (types.includes("boolean")) {
    return false;
  }
  if (types.includes("array")) {
    return [];
  }
  if (types.includes("object")) {
    const childProperties = schemaObject(schema.properties);
    return Object.fromEntries(
      Object.entries(childProperties).map(([childKey, childSchema]) => [
        childKey,
        templateValueForSchema(childKey, childSchema, model)
      ])
    );
  }
  if (types.includes("number") || types.includes("integer")) {
    return 0;
  }
  return types.includes("null") ? null : "";
}
