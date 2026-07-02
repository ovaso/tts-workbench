<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>Providers</h1>
      <v-btn icon="mdi-refresh" :loading="store.loading" variant="text" @click="reload" />
    </div>

    <v-alert v-if="store.error" class="mb-4" type="error" variant="tonal">
      {{ store.error }}
    </v-alert>

    <div class="work-grid">
      <div class="work-panel">
        <v-table density="comfortable">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Adapter</th>
              <th class="text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="provider in store.providers" :key="provider.providerId">
              <td>{{ provider.providerName }}</td>
              <td>{{ provider.adapterVersion }}</td>
              <td class="text-right">
                <v-btn
                  icon="mdi-chevron-right"
                  size="small"
                  variant="text"
                  @click="selectProvider(provider.providerId)"
                />
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>

      <div class="work-panel pa-4">
        <JsonViewer v-if="selectedCapabilities" :value="selectedCapabilities" />
        <div v-else class="text-medium-emphasis pa-4">No provider selected</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import JsonViewer from "../components/JsonViewer.vue";
import { useProvidersStore } from "../stores/providers";

const store = useProvidersStore();
const selectedProviderId = ref("");

const selectedCapabilities = computed(() => {
  if (selectedProviderId.value.length === 0) {
    return undefined;
  }
  return store.capabilities[selectedProviderId.value];
});

async function reload() {
  await store.loadProviders();
  if (selectedProviderId.value.length === 0 && store.providers[0] !== undefined) {
    await selectProvider(store.providers[0].providerId);
  }
}

async function selectProvider(providerId: string) {
  selectedProviderId.value = providerId;
  await store.loadCapabilities(providerId);
}

onMounted(reload);
</script>
