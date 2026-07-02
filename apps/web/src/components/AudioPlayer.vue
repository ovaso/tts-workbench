<template>
  <div>
    <audio v-if="canPlayInline" class="audio-player" controls :src="source" />
    <v-alert v-else type="info" variant="tonal">
      {{ downloadOnlyMessage }}
      <template #append>
        <v-btn :href="source" download variant="text">
          下载
        </v-btn>
      </template>
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { TTSOutputFormat } from "@tts-platform/core";
import { apiUrl } from "../api/client";
import { canPlayInlineAudio, downloadOnlyMessageForAudioFormat } from "./audio-playback";

const props = defineProps<{
  src: string;
  format?: TTSOutputFormat;
}>();

// source: 无入参；功能是把 API 相对音频路径转换为可访问 URL。
const source = computed(() => {
  if (props.src.startsWith("http")) {
    return props.src;
  }
  return apiUrl(props.src);
});

// canPlayInline: 无入参；功能是判断当前格式是否适合浏览器内联 audio 播放。
const canPlayInline = computed(() => {
  return canPlayInlineAudio(props.format);
});

// downloadOnlyMessage: 无入参；功能是为浏览器不稳定支持的音频格式提供下载提示。
const downloadOnlyMessage = computed(() => {
  return downloadOnlyMessageForAudioFormat(props.format);
});
</script>

<style scoped>
.audio-player {
  width: 100%;
  min-height: 42px;
}
</style>
