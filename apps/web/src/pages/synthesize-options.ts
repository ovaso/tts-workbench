import type {
  CanonicalControlName,
  CanonicalControlCapability,
  TTSCapabilities,
  TTSOperation,
  TTSOutputFormat,
  TTSVendorModel,
  VoiceCompatibility,
  VoiceRecord,
  VendorPayload
} from "@tts-platform/core";

export interface SelectOption<T extends string | number> {
  title: string;
  value: T;
}

export interface NumericControlBounds {
  min?: number;
  max?: number;
  defaultValue?: number;
}

// operationModels: 入参为 provider capability 和 operation；输出该 operation 可用的模型列表。
export function operationModels(
  capabilities: TTSCapabilities | undefined,
  operation: TTSOperation
): TTSVendorModel[] {
  if (capabilities?.operations[operation]?.supported !== true) {
    return [];
  }
  return capabilities.vendorModels.filter((model) => model.canonicalCapabilities.supportedOperations.includes(operation));
}

// providerSupportsOperation: 入参为 provider capability 和 operation；输出该厂商是否至少有一个模型支持该 operation。
export function providerSupportsOperation(
  capabilities: TTSCapabilities | undefined,
  operation: TTSOperation
): boolean {
  return operationModels(capabilities, operation).length > 0;
}

// modelOptions: 入参为 provider capability 和可选 operation；输出当前表单可选择的模型选项。
export function modelOptions(
  capabilities: TTSCapabilities | undefined,
  operation?: TTSOperation,
  voice?: VoiceRecord
): SelectOption<string>[] {
  const models = operation === undefined ? capabilities?.vendorModels ?? [] : operationModels(capabilities, operation);
  return (
    models.filter((model) => isModelCompatibleWithVoice(model.modelId, voice?.compatibility)).map((model) => ({
      title: model.displayName ?? model.modelId,
      value: model.modelId
    }))
  );
}

// defaultModelForOperation: 入参为 provider capability 和 operation；输出该 operation 的默认模型 id。
export function defaultModelForOperation(
  capabilities: TTSCapabilities | undefined,
  operation: TTSOperation,
  voice?: VoiceRecord
): string {
  const models = operationModels(capabilities, operation).filter((model) =>
    isModelCompatibleWithVoice(model.modelId, voice?.compatibility)
  );
  return (
    compatibleModelIds(voice?.compatibility).find((modelId) => models.some((model) => model.modelId === modelId)) ??
    models.find((model) => model.defaultForOperations?.includes(operation))?.modelId ??
    models[0]?.modelId ??
    ""
  );
}

// modelById: 入参为 provider capability 和模型 id；输出匹配的 vendor model。
export function modelById(
  capabilities: TTSCapabilities | undefined,
  modelId: string,
  operation?: TTSOperation
): TTSVendorModel | undefined {
  const model = capabilities?.vendorModels.find((candidate) => candidate.modelId === modelId);
  if (operation !== undefined && model?.canonicalCapabilities.supportedOperations.includes(operation) !== true) {
    return undefined;
  }
  return model;
}

// supportsOperation: 入参为厂商能力、模型和 operation；输出当前页面是否应开放该 operation。
export function supportsOperation(
  capabilities: TTSCapabilities | undefined,
  model: TTSVendorModel | undefined,
  operation: TTSOperation
): boolean {
  return (
    capabilities?.operations[operation]?.supported === true &&
    model?.canonicalCapabilities.supportedOperations.includes(operation) === true
  );
}

// formatOptionsForModel: 入参为 vendor model、provider capability 和 operation；输出该模型支持的编码格式选项。
export function formatOptionsForModel(
  model: TTSVendorModel | undefined,
  capabilities?: TTSCapabilities,
  operation: Extract<TTSOperation, "tts.sync" | "tts.stream"> = "tts.sync"
): TTSOutputFormat[] {
  if (operation === "tts.stream") {
    return (
      model?.canonicalCapabilities.outputChunkFormats ??
      capabilities?.operations["tts.stream"]?.outputChunkFormats ??
      model?.canonicalCapabilities.outputFormats ??
      capabilities?.operations["tts.stream"]?.outputFormats ??
      []
    );
  }
  return model?.canonicalCapabilities.outputFormats ?? capabilities?.operations["tts.sync"]?.outputFormats ?? [];
}

// sampleRateOptionsForModel: 入参为 vendor model、provider capability 和 operation；输出该模型支持的采样率选项。
export function sampleRateOptionsForModel(
  model: TTSVendorModel | undefined,
  capabilities?: TTSCapabilities,
  operation: Extract<TTSOperation, "tts.sync" | "tts.stream"> = "tts.sync"
): number[] {
  return model?.canonicalCapabilities.sampleRatesHz ?? capabilities?.operations[operation]?.sampleRatesHz ?? [];
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
export function defaultFormatForModel(
  model: TTSVendorModel | undefined,
  capabilities?: TTSCapabilities,
  operation: Extract<TTSOperation, "tts.sync" | "tts.stream"> = "tts.sync"
): TTSOutputFormat | undefined {
  const formats = formatOptionsForModel(model, capabilities, operation);
  const configured = model?.defaultConfiguration?.output?.format;
  return configured !== undefined && formats.includes(configured) ? configured : formats[0];
}

// defaultSampleRateForModel: 入参为 vendor model；输出模型默认采样率或第一个支持采样率。
export function defaultSampleRateForModel(
  model: TTSVendorModel | undefined,
  capabilities?: TTSCapabilities,
  operation: Extract<TTSOperation, "tts.sync" | "tts.stream"> = "tts.sync"
): number | undefined {
  const sampleRates = sampleRateOptionsForModel(model, capabilities, operation);
  const configured = model?.defaultConfiguration?.output?.sampleRateHz;
  return configured !== undefined && sampleRates.includes(configured) ? configured : sampleRates[0];
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
  return voiceId === undefined ? "必填：输入或选择音色 ID" : `默认：${voiceId}`;
}

// requiresExplicitVoiceForModel: 入参为 vendor model；输出该模型是否必须由用户显式提供音色。
export function requiresExplicitVoiceForModel(model: TTSVendorModel | undefined): boolean {
  return model?.defaultConfiguration?.voice?.providerVoiceId === undefined;
}

// voiceOptions: 入参为已按 provider 查询的本地 voice registry；输出厂商级音色选项，不按合成模型二次过滤。
export function voiceOptions(voices: VoiceRecord[]): SelectOption<string>[] {
  return voices.map((voice) => ({
    title: `${voice.displayName} (${voice.providerVoiceId})`,
    value: voice.voiceId
  }));
}

// isModelCompatibleWithVoice: 入参为模型 id 和音色兼容事实；输出模型是否可与该音色一起合成。
export function isModelCompatibleWithVoice(
  modelId: string,
  compatibility: VoiceCompatibility | undefined
): boolean {
  const ids = compatibleModelIds(compatibility);
  return ids.length === 0 || ids.includes(modelId);
}

// compatibleModelIds: 入参为音色兼容事实；输出强绑定时允许使用的模型 id 列表。
function compatibleModelIds(compatibility: VoiceCompatibility | undefined): string[] {
  if (compatibility?.scope === "model") {
    return compatibility.modelIds;
  }
  if (compatibility?.scope === "resource") {
    return compatibility.compatibleModelIds ?? [];
  }
  return [];
}

// controlCapabilityForModel: 入参为模型、厂商能力、operation 和控制项；输出该控制项的有效 capability。
export function controlCapabilityForModel(
  model: TTSVendorModel | undefined,
  capabilities: TTSCapabilities | undefined,
  operation: Extract<TTSOperation, "tts.sync" | "tts.stream">,
  control: CanonicalControlName
): CanonicalControlCapability | undefined {
  return model?.canonicalCapabilities.canonicalControls[control] ?? capabilities?.operations[operation]?.canonicalControls[control];
}

// supportsCanonicalControl: 入参为模型、厂商能力、operation 和控制项；输出表单是否应开放该控制项。
export function supportsCanonicalControl(
  model: TTSVendorModel | undefined,
  capabilities: TTSCapabilities | undefined,
  operation: Extract<TTSOperation, "tts.sync" | "tts.stream">,
  control: CanonicalControlName
): boolean {
  const capability = controlCapabilityForModel(model, capabilities, operation, control);
  return capability?.support === "supported" || capability?.support === "approximated";
}

// numericControlBounds: 入参为模型、厂商能力、operation 和控制项；输出数字控件可使用的范围和默认值。
export function numericControlBounds(
  model: TTSVendorModel | undefined,
  capabilities: TTSCapabilities | undefined,
  operation: Extract<TTSOperation, "tts.sync" | "tts.stream">,
  control: Extract<CanonicalControlName, "speed" | "pitch" | "volume">
): NumericControlBounds {
  const capability = controlCapabilityForModel(model, capabilities, operation, control);
  return {
    ...(typeof capability?.min === "number" ? { min: capability.min } : {}),
    ...(typeof capability?.max === "number" ? { max: capability.max } : {}),
    ...(typeof capability?.defaultValue === "number" ? { defaultValue: capability.defaultValue } : {})
  };
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
