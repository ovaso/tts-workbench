<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>厂商</h1>
      <v-btn icon="mdi-refresh" :loading="store.loading" variant="text" @click="reload" />
    </div>

    <v-alert v-if="store.error" class="mb-4" type="error" variant="tonal">
      {{ store.error }}
    </v-alert>

    <div class="work-panel pa-4">
      <div v-if="visibleProviders.length === 0" class="providers-empty-state">
        <v-icon color="primary" icon="mdi-cloud-off-outline" size="44" />
        <div class="providers-empty-title">暂无可展示厂商</div>
        <div class="providers-empty-body">完成真实厂商 adapter 注册后，厂商会显示在这里。</div>
      </div>

      <div v-else class="providers-list">
        <v-table class="providers-table" density="comfortable">
          <colgroup>
            <col class="provider-name-column" />
            <col class="provider-adapter-column" />
            <col class="provider-status-column" />
            <col class="provider-status-column" />
            <col class="provider-detail-column" />
          </colgroup>
          <thead>
            <tr>
              <th>厂商名称</th>
              <th>适配器版本</th>
              <th class="text-center">TTS</th>
              <th class="text-center">VoiceCloning</th>
              <th class="text-center">详情</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="provider in visibleProviders" :key="provider.providerId">
              <td>
                <div class="provider-identity-cell">
                  <div class="provider-avatar">
                    <img
                      v-if="providerLogo(provider) !== undefined"
                      :alt="provider.providerName"
                      :src="providerLogo(provider)"
                    />
                    <span v-else>{{ providerInitial(provider) }}</span>
                  </div>
                  <div class="provider-name-cell">
                    <AutoScrollText :text="provider.providerName" />
                    <span>{{ provider.providerId }}</span>
                  </div>
                </div>
              </td>
              <td>
                <span class="provider-version-badge">
                  <AutoScrollText :text="provider.adapterVersion" mono />
                </span>
              </td>
              <td>
                <ProviderCapabilityIcon
                  :loading="capabilityLoadingByProviderId[provider.providerId] === true"
                  :status="providerTtsStatus(store.capabilities[provider.providerId])"
                />
              </td>
              <td>
                <ProviderCapabilityIcon
                  :loading="capabilityLoadingByProviderId[provider.providerId] === true"
                  :status="providerVoiceCloningStatus(store.capabilities[provider.providerId])"
                />
              </td>
              <td class="text-center">
                <v-tooltip :text="providerDetailTooltip(provider)" location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      :loading="detailLoadingProviderId === provider.providerId"
                      color="primary"
                      icon="mdi-information-outline"
                      size="small"
                      variant="text"
                      @click="openProviderDetail(provider.providerId)"
                    />
                  </template>
                </v-tooltip>
              </td>
            </tr>
          </tbody>
        </v-table>
      </div>
    </div>

    <v-dialog v-model="detailDialogOpen" max-width="960">
      <v-card>
        <v-card-title class="provider-dialog-title">
          <span>{{ selectedProviderTitle }}</span>
          <v-btn icon="mdi-close" variant="text" @click="detailDialogOpen = false" />
        </v-card-title>
        <v-card-text>
          <v-alert v-if="selectedProviderError" class="mb-4" type="error" variant="tonal">
            {{ selectedProviderError }}
          </v-alert>
          <JsonViewer v-if="selectedCapabilities" :value="selectedCapabilities" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AutoScrollText from "../components/AutoScrollText.vue";
import ProviderCapabilityIcon from "../components/ProviderCapabilityIcon.vue";
import JsonViewer from "../components/JsonViewer.vue";
import { useProvidersStore } from "../stores/providers";
import minimaxLogoUrl from "../assets/providers/minimax.png";
import {
  providerDetailTooltip,
  providerInitial,
  providerLogoKey,
  providerTtsStatus,
  providerVoiceCloningStatus,
  visibleProductionProviders
} from "./providers-page";

const store = useProvidersStore();
const capabilityLoadingByProviderId = ref<Record<string, boolean | undefined>>({});
const capabilityErrorByProviderId = ref<Record<string, string | undefined>>({});
const detailDialogOpen = ref(false);
const selectedProviderId = ref("");
const detailLoadingProviderId = ref("");
const providerLogoUrls = {
  minimax: minimaxLogoUrl
};

// visibleProviders: 无入参；功能是隐藏仅用于本地测试闭环的 mock provider。
const visibleProviders = computed(() =>
  visibleProductionProviders(store.providers)
);

// reload: 无入参；功能是刷新厂商摘要列表，保留用户手动展开详情的行为。
async function reload() {
  await store.loadProviders();
  await loadVisibleProviderCapabilities();
}

const selectedCapabilities = computed(() => store.capabilities[selectedProviderId.value]);

const selectedProviderTitle = computed(() => {
  const provider = visibleProviders.value.find((item) => item.providerId === selectedProviderId.value);
  return provider === undefined ? "厂商能力 JSON" : `${provider.providerName} 能力 JSON`;
});

const selectedProviderError = computed(() => capabilityErrorByProviderId.value[selectedProviderId.value] ?? "");

// providerLogo: 入参为 provider 摘要；功能是返回已内置的官方厂商图标地址。
function providerLogo(provider: (typeof visibleProviders.value)[number]): string | undefined {
  const logoKey = providerLogoKey(provider);
  return logoKey === undefined ? undefined : providerLogoUrls[logoKey];
}

// loadVisibleProviderCapabilities: 无入参；功能是为列表状态列预加载所有可见厂商能力。
async function loadVisibleProviderCapabilities() {
  await Promise.all(
    visibleProviders.value.map(async (provider) => {
      await loadProviderCapabilities(provider.providerId);
    })
  );
}

// loadProviderCapabilities: 入参为 providerId；功能是加载厂商能力详情并记录单项加载状态。
async function loadProviderCapabilities(providerId: string) {
  if (store.capabilities[providerId] !== undefined) {
    return;
  }
  capabilityLoadingByProviderId.value = {
    ...capabilityLoadingByProviderId.value,
    [providerId]: true
  };
  capabilityErrorByProviderId.value = {
    ...capabilityErrorByProviderId.value,
    [providerId]: undefined
  };
  try {
    await store.loadCapabilities(providerId);
  } catch (caught) {
    capabilityErrorByProviderId.value = {
      ...capabilityErrorByProviderId.value,
      [providerId]: caught instanceof Error ? caught.message : "加载厂商能力失败。"
    };
  } finally {
    capabilityLoadingByProviderId.value = {
      ...capabilityLoadingByProviderId.value,
      [providerId]: false
    };
  }
}

// openProviderDetail: 入参为 providerId；功能是打开厂商详情弹窗并按需加载 capabilities JSON。
async function openProviderDetail(providerId: string) {
  selectedProviderId.value = providerId;
  detailDialogOpen.value = true;
  detailLoadingProviderId.value = providerId;
  await loadProviderCapabilities(providerId);
  detailLoadingProviderId.value = "";
}

onMounted(reload);
</script>

<style scoped>
.providers-list {
  overflow-x: auto;
  border: 1px solid #e4e8f0;
  border-radius: 8px;
}

.providers-table {
  min-width: 820px;
  table-layout: fixed;
}

.providers-table :deep(th) {
  height: 44px;
  border-bottom: 1px solid #d9e1ee;
  background: #f8fafc;
  color: #344054;
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
}

.providers-table :deep(td) {
  height: 76px;
  padding-top: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef2f7;
  color: #172033;
  vertical-align: middle;
}

.providers-table :deep(tbody tr) {
  transition: background-color 140ms ease;
}

.providers-table :deep(tbody tr:hover) {
  background: #fbfcff;
}

.providers-table :deep(tbody tr:last-child td) {
  border-bottom: 0;
}

.provider-name-column {
  width: auto;
}

.provider-adapter-column {
  width: 172px;
}

.provider-status-column {
  width: 150px;
}

.provider-detail-column {
  width: 82px;
}

.provider-identity-cell {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  min-width: 0;
}

.provider-avatar {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid #cbd5e1;
  border-radius: 50%;
  background: #eef4ff;
  color: #2454a6;
  font-size: 0.85rem;
  font-weight: 800;
  overflow: hidden;
}

.provider-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.provider-name-cell {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.provider-name-cell span {
  color: #667085;
  font-size: 0.76rem;
}

.provider-version-badge {
  display: inline-flex;
  box-sizing: border-box;
  align-items: center;
  max-width: 100%;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #d9e1ee;
  border-radius: 999px;
  background: #f8fafc;
  color: #344054;
}

.providers-table :deep(.v-btn) {
  border-radius: 50%;
}

.provider-dialog-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.providers-empty-state {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 180px;
  border: 1px dashed #b7c4d8;
  border-radius: 8px;
  background: #f8fafc;
  color: #667085;
  text-align: center;
}

.providers-empty-title {
  color: #172033;
  font-size: 1rem;
  font-weight: 700;
}

.providers-empty-body {
  max-width: 360px;
  font-size: 0.9rem;
  line-height: 1.55;
}
</style>
