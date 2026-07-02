import type { TTSOutputFormat } from "@tts-platform/core";

// canPlayInlineAudio: format 为输出编码；功能是判断是否交给浏览器 audio 控件直接预览。
export function canPlayInlineAudio(format?: TTSOutputFormat): boolean {
  return format === undefined || format === "mp3";
}

// downloadOnlyMessageForAudioFormat: format 为输出编码；功能是生成非内联播放格式的下载提示。
export function downloadOnlyMessageForAudioFormat(format?: TTSOutputFormat): string {
  if (format === "wav") {
    return "WAV 已归档，但当前浏览器或音频封装可能不支持直接播放。可下载后用本地播放器打开，或合成时选择 mp3 作为预览格式。";
  }
  if (format === "flac") {
    return "FLAC 已归档，但当前浏览器可能不支持直接播放。可下载后用本地播放器打开，或合成时选择 mp3 作为预览格式。";
  }
  if (format === "pcm") {
    return "PCM 已归档，但裸 PCM 通常不能由浏览器直接播放。可下载后用音频工具处理，或合成时选择 mp3。";
  }
  if (format === "ogg") {
    return "OGG 已归档，但当前浏览器可能不支持直接播放。可下载后用本地播放器打开，或合成时选择 mp3 作为预览格式。";
  }
  return "该音频格式当前浏览器可能不支持直接播放，可下载后查看。";
}
