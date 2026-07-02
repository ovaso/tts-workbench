<template>
  <audio class="audio-player" controls :src="source" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { apiUrl } from "../api/client";

const props = defineProps<{
  src: string;
}>();

const source = computed(() => {
  if (props.src.startsWith("http")) {
    return props.src;
  }
  return apiUrl(props.src);
});
</script>

<style scoped>
.audio-player {
  width: 100%;
  min-height: 42px;
}
</style>
