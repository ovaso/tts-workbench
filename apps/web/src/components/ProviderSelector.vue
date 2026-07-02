<template>
  <v-select
    :items="items"
    :model-value="modelValue"
    density="comfortable"
    item-title="title"
    item-value="value"
    label="Provider"
    prepend-inner-icon="mdi-server"
    variant="outlined"
    @update:model-value="emit('update:modelValue', String($event))"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ProviderSummary } from "../api/providers";

const props = defineProps<{
  modelValue: string;
  providers: ProviderSummary[];
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const items = computed(() =>
  props.providers.map((provider) => ({
    title: `${provider.providerName} (${provider.providerId})`,
    value: provider.providerId
  }))
);
</script>
