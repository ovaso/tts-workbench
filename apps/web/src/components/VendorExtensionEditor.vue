<template>
  <v-textarea
    :model-value="modelValue"
    auto-grow
    density="comfortable"
    label="Vendor Extension JSON"
    prepend-inner-icon="mdi-code-json"
    rows="7"
    spellcheck="false"
    variant="outlined"
    @update:model-value="emit('update:modelValue', String($event))"
  />
</template>

<script setup lang="ts">
defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
</script>
