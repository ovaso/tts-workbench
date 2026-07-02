<template>
  <pre class="json-viewer">{{ rendered }}</pre>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  value: unknown;
}>();

const rendered = computed(() => JSON.stringify(props.value, null, 2));
</script>
