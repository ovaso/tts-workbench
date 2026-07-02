import type {
  CanonicalControlCapability,
  TTSCapabilities,
  TTSOperation,
  TTSOutputFormat,
  TTSVendorModel
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
  return voiceId === undefined ? "Leave empty to use provider default" : `Default: ${voiceId}`;
}

// valuesFromCapability: 入参为 canonical control capability；输出字符串枚举值。
function valuesFromCapability(capability: CanonicalControlCapability | undefined): string[] {
  return capability?.values ?? [];
}
