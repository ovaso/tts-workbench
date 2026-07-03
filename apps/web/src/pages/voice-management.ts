import type { VoiceRecord } from "@tts-platform/core";

// sourceLabel: 入参为音色来源枚举；输出页面展示的中文来源名称。
export function sourceLabel(source: VoiceRecord["source"]): string {
  if (source === "external") {
    return "外部控制台";
  }
  if (source === "vendor_builtin") {
    return "厂商内置";
  }
  return "复刻生成";
}

// sourceColor: 入参为音色来源枚举；输出 Material chip 使用的语义色。
export function sourceColor(source: VoiceRecord["source"]): string {
  if (source === "external") {
    return "indigo";
  }
  if (source === "vendor_builtin") {
    return "teal";
  }
  return "primary";
}

// deleteVoiceConfirmationText: 入参为音色记录；输出删除前确认弹窗文案。
export function deleteVoiceConfirmationText(voice: Pick<VoiceRecord, "displayName">): string {
  return `确认移除音色「${voice.displayName}」吗？`;
}

// voiceManagementActionLabels: 无入参；输出音色管理页顶部主要操作按钮文案。
export function voiceManagementActionLabels(): { register: string; clone: string } {
  return {
    register: "登记音色",
    clone: "参考音频创建"
  };
}

export type ModelInputValue = string | { title: string; value: string } | null;

// modelInputValue: 入参为模型输入框值；输出可保存到 VoiceRecord.modelId 的模型 id。
export function modelInputValue(value: ModelInputValue): string {
  if (value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return typeof value.value === "string" ? value.value.trim() : "";
}
