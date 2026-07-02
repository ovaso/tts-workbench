import type { TTSCapabilities, VoiceCloneCapability } from "@tts-platform/core";

// persistentVoiceCloneCapability: 入参为厂商 capability；输出持久音色复刻的能力详情。
export function persistentVoiceCloneCapability(
  capabilities: TTSCapabilities | undefined
): VoiceCloneCapability | undefined {
  const operation = capabilities?.operations["voice.clone.create"];
  if (operation?.supported !== true || operation.voiceClone?.persistent !== true) {
    return undefined;
  }
  return operation.voiceClone;
}

// voiceCloneSupportText: 入参为厂商 capability；输出页面展示的音色复刻能力状态。
export function voiceCloneSupportText(capabilities: TTSCapabilities | undefined): string {
  if (capabilities === undefined) {
    return "请选择厂商";
  }
  return persistentVoiceCloneCapability(capabilities) === undefined
    ? "当前厂商未声明支持持久音色复刻"
    : "支持持久音色复刻";
}

// referenceAudioSummary: 入参为音色复刻能力；输出参考音频约束摘要。
export function referenceAudioSummary(capability: VoiceCloneCapability | undefined): string {
  if (capability === undefined) {
    return "无可用参考音频配置";
  }
  const formats = capability.supportedAudioFormats.join(" / ");
  const minSeconds = capability.minReferenceAudioSeconds ?? "不限";
  const maxSeconds = capability.maxReferenceAudioSeconds ?? "不限";
  const maxFiles = capability.maxReferenceAudioFiles ?? "不限";
  return `${formats}，${minSeconds}-${maxSeconds} 秒，最多 ${maxFiles} 个文件`;
}
