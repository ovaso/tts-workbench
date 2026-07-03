<template>
  <span
    ref="containerRef"
    class="auto-scroll-text"
    :class="{ 'is-overflowing': isOverflowing, 'is-mono': mono }"
    :style="{ '--scroll-distance': `${scrollDistance}px` }"
    :title="text"
  >
    <span ref="contentRef" class="auto-scroll-text__content">{{ text }}</span>
  </span>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    text: string;
    mono?: boolean;
  }>(),
  {
    mono: false
  }
);

const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const isOverflowing = ref(false);
const scrollDistance = ref(0);
let resizeObserver: ResizeObserver | undefined;

// measureOverflow: 无入参；功能是测量文本是否超出单元格，并计算自动滚动距离。
function measureOverflow() {
  const container = containerRef.value;
  const content = contentRef.value;
  if (container === null || content === null) {
    return;
  }

  const distance = Math.max(0, content.scrollWidth - container.clientWidth);
  scrollDistance.value = distance;
  isOverflowing.value = distance > 4;
}

watch(
  () => props.text,
  async () => {
    await nextTick();
    measureOverflow();
  }
);

onMounted(async () => {
  await nextTick();
  measureOverflow();
  resizeObserver = new ResizeObserver(measureOverflow);
  if (containerRef.value !== null) {
    resizeObserver.observe(containerRef.value);
  }
  if (contentRef.value !== null) {
    resizeObserver.observe(contentRef.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});
</script>

<style scoped>
.auto-scroll-text {
  display: block;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
}

.auto-scroll-text__content {
  display: inline-block;
  min-width: 0;
  transform: translateX(0);
}

.auto-scroll-text.is-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.82rem;
}

.auto-scroll-text.is-overflowing:hover .auto-scroll-text__content,
.auto-scroll-text.is-overflowing:focus-within .auto-scroll-text__content {
  animation: auto-scroll-text-slide 6s linear infinite alternate;
}

@keyframes auto-scroll-text-slide {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(calc(-1 * var(--scroll-distance)));
  }
}
</style>
