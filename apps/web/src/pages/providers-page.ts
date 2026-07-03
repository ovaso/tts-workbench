import type { ProviderSummary } from "../api/providers";
import type { TTSCapabilities } from "@tts-platform/core";

export interface ProviderCapabilityStatus {
  supported: boolean;
  label: string;
  tooltip: string;
}

// visibleProductionProviders: 入参为所有 provider 摘要；输出厂商管理页展示的非 mock provider。
export function visibleProductionProviders(providers: ProviderSummary[]): ProviderSummary[] {
  return providers.filter((provider) => provider.providerId !== "mock");
}

// providerDetailTooltip: 入参为 provider 摘要；输出详情图标的 tooltip 文案。
export function providerDetailTooltip(provider: ProviderSummary): string {
  return `查看 ${provider.providerName} 能力 JSON`;
}

// providerInitial: 入参为 provider 摘要；输出厂商列表头像标识使用的首字符。
export function providerInitial(provider: ProviderSummary): string {
  return provider.providerName.trim().slice(0, 1).toUpperCase();
}

// providerLogoKey: 入参为 provider 摘要；输出前端已内置的官方 logo key，未知厂商返回 undefined。
export function providerLogoKey(provider: ProviderSummary): "minimax" | undefined {
  return provider.providerId === "minimax" ? "minimax" : undefined;
}

// providerTtsStatus: 入参为厂商能力；输出 TTS 能力在列表中的展示状态。
export function providerTtsStatus(capabilities: TTSCapabilities | undefined): ProviderCapabilityStatus {
  if (capabilities === undefined) {
    return {
      supported: false,
      label: "未加载",
      tooltip: "正在加载 TTS 能力状态。"
    };
  }

  const supported =
    capabilities.vendorFeatures.supportsHttpTTS ||
    capabilities.vendorFeatures.supportsStreamingTTS ||
    capabilities.operations["tts.sync"]?.supported === true ||
    capabilities.operations["tts.stream"]?.supported === true;

  return supported
    ? {
        supported: true,
        label: "已接入",
        tooltip: "已接入 TTS 合成能力。"
      }
    : {
        supported: false,
        label: "不支持",
        tooltip: "当前厂商未声明 TTS 合成能力。"
      };
}

// providerVoiceCloningStatus: 入参为厂商能力；输出音色克隆能力在列表中的展示状态。
export function providerVoiceCloningStatus(capabilities: TTSCapabilities | undefined): ProviderCapabilityStatus {
  if (capabilities === undefined) {
    return {
      supported: false,
      label: "未加载",
      tooltip: "正在加载音色克隆能力状态。"
    };
  }

  const supported =
    capabilities.vendorFeatures.supportsPersistentVoiceClone ||
    capabilities.vendorFeatures.supportsInstantVoiceClone ||
    capabilities.operations["voice.clone.create"]?.supported === true ||
    capabilities.operations["voice.clone.instant"]?.supported === true;

  return supported
    ? {
        supported: true,
        label: "已接入",
        tooltip: "已接入音色克隆能力。"
      }
    : {
        supported: false,
        label: "不支持",
        tooltip: "当前厂商未声明音色克隆能力。"
      };
}
