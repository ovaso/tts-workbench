<template>
  <v-tooltip :text="status.tooltip" location="top">
    <template #activator="{ props }">
      <span
        v-bind="props"
        class="provider-capability-icon"
        :class="{
          'is-loading': loading,
          'is-supported': status.supported,
          'is-unsupported': !status.supported
        }"
      >
        <v-progress-circular v-if="loading" color="primary" indeterminate size="18" width="2" />
        <template v-else>
          <v-icon
            :icon="status.supported ? 'mdi-check-circle' : 'mdi-close-circle'"
            size="20"
          />
          <v-icon
            v-if="status.supported"
            color="success"
            icon="mdi-power-plug-outline"
            size="16"
          />
        </template>
      </span>
    </template>
  </v-tooltip>
</template>

<script setup lang="ts">
import type { ProviderCapabilityStatus } from "../pages/providers-page";

defineProps<{
  status: ProviderCapabilityStatus;
  loading?: boolean;
}>();
</script>

<style scoped>
.provider-capability-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-sizing: border-box;
  min-width: 64px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid;
  border-radius: 999px;
}

.provider-capability-icon.is-supported {
  border-color: #b7dfc7;
  background: #eefaf2;
  color: rgb(var(--v-theme-success));
}

.provider-capability-icon.is-unsupported {
  border-color: #f3b8b8;
  background: #fff4f4;
  color: rgb(var(--v-theme-error));
}

.provider-capability-icon.is-loading {
  border-color: #c8d6ef;
  background: #f5f8ff;
  color: rgb(var(--v-theme-primary));
}
</style>
