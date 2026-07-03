<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>Benches</h1>
    </div>

    <v-tabs v-model="activeTab" class="mb-4" color="primary">
      <v-tab
        v-for="tab in tabItems"
        :key="tab.value"
        :prepend-icon="tab.icon"
        :value="tab.value"
      >
        {{ tab.title }}
      </v-tab>
    </v-tabs>

    <div v-if="activeTab === 'configs'" :class="benchConfigActionsClass()">
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openConfigDialog">
        添加配置
      </v-btn>
      <v-btn :loading="configsLoading" prepend-icon="mdi-refresh" variant="tonal" @click="loadConfigs">
        刷新配置
      </v-btn>
    </div>

    <v-alert v-if="error" class="mb-4" type="error" variant="tonal">
      {{ error }}
    </v-alert>
    <v-alert v-if="success" class="mb-4" type="success" variant="tonal">
      {{ success }}
    </v-alert>

    <v-window v-model="activeTab">
      <v-window-item value="configs">
        <div class="work-panel pa-4">
          <v-list class="bench-summary" density="compact">
            <v-list-item title="配置数量" :subtitle="`${configs.length} 个`" />
            <v-list-item title="配置单元" subtitle="vendor + model + voice + params" />
            <v-list-item title="复用方式" subtitle="可被多个 Benchmark 方案引用" />
          </v-list>

          <v-divider class="my-3" />

          <div v-if="configs.length === 0" class="bench-empty-state">
            <v-icon color="primary" icon="mdi-tune-variant" size="44" />
            <div class="bench-empty-title">暂无 Benchmark 配置</div>
            <div class="bench-empty-body">
              后续可在这里登记可复用的厂商、模型、音色、输出格式、通用控制参数和 vendor extension 组合。
            </div>
          </div>

          <v-data-table
            v-else
            class="bench-config-table"
            density="comfortable"
            :headers="configHeaders"
            hide-default-footer
            hover
            item-value="configId"
            :items="configs"
          >
            <template #item.displayName="{ item }">
              <div class="bench-config-name-cell">
                <AutoScrollText :text="item.displayName" />
                <AutoScrollText :text="shortBenchDigest(item.digest)" mono />
              </div>
            </template>
            <template #item.providerId="{ item }">
              <AutoScrollText :text="item.providerId" />
            </template>
            <template #item.modelId="{ item }">
              <AutoScrollText :text="item.modelId" mono />
            </template>
            <template #item.voice="{ item }">
              <AutoScrollText :text="benchConfigVoiceLabel(item)" mono />
            </template>
            <template #item.output="{ item }">
              <AutoScrollText :text="benchConfigOutputLabel(item)" />
            </template>
            <template #item.createdAt="{ item }">
              {{ formatLocalDateTime(item.createdAt) }}
            </template>
          </v-data-table>
        </div>
      </v-window-item>

      <v-window-item value="plans">
        <div class="work-panel pa-4">
          <v-list class="bench-summary" density="compact">
            <v-list-item title="方案数量" subtitle="0 个" />
            <v-list-item title="组合方式" subtitle="选择已有配置 + corpus" />
            <v-list-item title="事实来源" subtitle="data/bench-plans 待接入" />
          </v-list>

          <v-divider class="my-3" />

          <div class="bench-empty-state">
            <v-icon color="primary" icon="mdi-format-list-bulleted" size="44" />
            <div class="bench-empty-title">暂无 Benchmark 方案</div>
            <div class="bench-empty-body">
              后续可在这里选择一组已有配置，再组合 corpus，形成可复用、可运行、可审计的固定方案。
            </div>
          </div>
        </div>
      </v-window-item>

      <v-window-item value="runs">
        <div class="work-grid">
          <div class="work-panel pa-4">
            <v-list class="bench-summary" density="compact">
              <v-list-item title="当前方案" subtitle="尚未选择" />
              <v-list-item title="运行状态" subtitle="待接入执行链路" />
              <v-list-item title="归档位置" subtitle="data/benchmark-runs" />
            </v-list>

            <v-divider class="my-3" />

            <div class="bench-run-actions">
              <v-btn color="primary" disabled prepend-icon="mdi-play">
                启动 Benchmark
              </v-btn>
              <v-btn disabled prepend-icon="mdi-refresh" variant="tonal">
                刷新运行列表
              </v-btn>
            </div>
          </div>

          <div class="work-panel pa-4">
            <div class="bench-empty-state">
              <v-icon color="primary" icon="mdi-playlist-play" size="44" />
              <div class="bench-empty-title">暂无 Benchmark 运行</div>
              <div class="bench-empty-body">
                方案执行后，运行记录、产物路径、评分摘要和审计信息会显示在这里。
              </div>
            </div>
          </div>
        </div>
      </v-window-item>
    </v-window>

    <v-dialog v-model="configDialog" max-width="920">
      <v-card>
        <v-card-title>添加 Benchmark 配置</v-card-title>
        <v-card-text>
          <div class="bench-config-dialog-grid">
            <div>
              <v-text-field
                v-model="configDisplayName"
                label="配置名称"
                prepend-inner-icon="mdi-tag-outline"
                variant="outlined"
              />
              <ProviderSelector v-model="providerId" :providers="store.providers" />
              <v-combobox
                v-model="modelId"
                :items="modelItems"
                label="模型"
                prepend-inner-icon="mdi-cube"
                variant="outlined"
              />
              <v-combobox
                v-model="voiceInput"
                :items="voiceItems"
                label="音色"
                prepend-inner-icon="mdi-account-voice"
                variant="outlined"
              />
              <v-row>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="outputFormat"
                    :items="formatItems"
                    label="输出格式"
                    prepend-inner-icon="mdi-file-music-outline"
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model.number="sampleRateHz"
                    label="采样率"
                    prepend-inner-icon="mdi-sine-wave"
                    type="number"
                    variant="outlined"
                  />
                </v-col>
              </v-row>
            </div>
            <div>
              <v-row>
                <v-col cols="12" md="4">
                  <v-text-field v-model.number="speed" label="Speed" type="number" variant="outlined" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model.number="pitch" label="Pitch" type="number" variant="outlined" />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model.number="volume" label="Volume" type="number" variant="outlined" />
                </v-col>
              </v-row>
              <v-text-field v-model="emotion" label="Emotion" variant="outlined" />
              <v-text-field v-model="style" label="Style" variant="outlined" />
              <VendorExtensionEditor v-model="vendorExtensionJson" />
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="configDialog = false">取消</v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-content-save"
            :disabled="!canCreateConfig"
            :loading="creatingConfig"
            @click="submitConfig"
          >
            添加
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup lang="ts">
import type { BenchConfig, BenchConfigCreateRequest, TTSOutputFormat, VendorPayload } from "@tts-platform/core";
import { computed, onMounted, ref, watch } from "vue";
import { createBenchConfig, listBenchConfigs } from "../api/bench-configs";
import { listVoices } from "../api/voices";
import AutoScrollText from "../components/AutoScrollText.vue";
import ProviderSelector from "../components/ProviderSelector.vue";
import VendorExtensionEditor from "../components/VendorExtensionEditor.vue";
import { useProvidersStore } from "../stores/providers";
import { formatLocalDateTime } from "../utils/time";
import { modelOptions } from "./synthesize-options";
import { type ComboboxOption, voiceInputValue } from "./synthesize-submit";
import {
  benchConfigOutputLabel,
  benchConfigActionsClass,
  benchConfigVoiceLabel,
  benchTabItems,
  shortBenchDigest
} from "./benches-page";

const activeTab = ref("configs");
const tabItems = benchTabItems();
const store = useProvidersStore();
const configs = ref<BenchConfig[]>([]);
const configsLoading = ref(false);
const creatingConfig = ref(false);
const configDialog = ref(false);
const error = ref("");
const success = ref("");
const providerId = ref("minimax");
const modelId = ref("");
const configDisplayName = ref("");
const voiceInput = ref<string | ComboboxOption | null>("");
const voiceItems = ref<Array<{ title: string; value: string }>>([]);
const outputFormat = ref<TTSOutputFormat>("mp3");
const sampleRateHz = ref(32000);
const speed = ref<number | undefined>(undefined);
const pitch = ref<number | undefined>(undefined);
const volume = ref<number | undefined>(undefined);
const emotion = ref("");
const style = ref("");
const vendorExtensionJson = ref("{}");
const knownVoiceIds = ref(new Set<string>());
const configHeaders = [
  { title: "配置", key: "displayName", sortable: true },
  { title: "厂商", key: "providerId", sortable: true },
  { title: "模型", key: "modelId", sortable: true },
  { title: "音色", key: "voice", sortable: false },
  { title: "输出", key: "output", sortable: false },
  { title: "创建时间", key: "createdAt", sortable: true }
];
const formatItems: TTSOutputFormat[] = ["mp3", "wav", "flac", "ogg", "opus", "pcm"];
const currentCapabilities = computed(() => store.capabilities[providerId.value]);
const modelItems = computed(() => modelOptions(currentCapabilities.value));
const canCreateConfig = computed(() => {
  return (
    providerId.value.length > 0 &&
    modelId.value.length > 0 &&
    configDisplayName.value.trim().length > 0 &&
    voiceInputValue(voiceInput.value).length > 0
  );
});

watch(
  () => store.providers,
  (providers) => {
    if (providers.length > 0 && providerId.value.length === 0) {
      providerId.value = providers.find((provider) => provider.providerId !== "mock")?.providerId ?? "";
    }
  },
  {
    immediate: true
  }
);

watch(
  providerId,
  async (nextProviderId) => {
    if (nextProviderId.length === 0) {
      return;
    }
    try {
      const capabilities = await store.loadCapabilities(nextProviderId);
      if (modelId.value.length === 0) {
        modelId.value = capabilities.vendorModels[0]?.modelId ?? "";
      }
      await loadVoiceOptions(nextProviderId);
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : "加载厂商能力失败。";
    }
  },
  {
    immediate: true
  }
);

// openConfigDialog: 无入参；功能是打开添加 Benchmark 配置弹窗并初始化默认名称。
function openConfigDialog() {
  success.value = "";
  error.value = "";
  if (configDisplayName.value.trim().length === 0) {
    configDisplayName.value = "Benchmark 配置";
  }
  configDialog.value = true;
}

// loadConfigs: 无入参；功能是刷新 Benchmark 配置列表。
async function loadConfigs() {
  configsLoading.value = true;
  error.value = "";
  try {
    configs.value = await listBenchConfigs();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "加载 Benchmark 配置失败。";
  } finally {
    configsLoading.value = false;
  }
}

// submitConfig: 无入参；功能是提交 Benchmark 配置，并由后端按 digest 去重。
async function submitConfig() {
  creatingConfig.value = true;
  error.value = "";
  success.value = "";
  try {
    const request = buildConfigRequest();
    const config = await createBenchConfig(request);
    await loadConfigs();
    success.value = `配置已保存：${config.displayName}`;
    configDialog.value = false;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "添加 Benchmark 配置失败。";
  } finally {
    creatingConfig.value = false;
  }
}

// buildConfigRequest: 无入参；功能是把添加配置弹窗内容转换为 API 创建请求。
function buildConfigRequest(): BenchConfigCreateRequest {
  const selectedVoice = voiceInputValue(voiceInput.value);
  const request: BenchConfigCreateRequest = {
    displayName: configDisplayName.value.trim(),
    providerId: providerId.value,
    modelId: modelId.value,
    voice: knownVoiceIds.value.has(selectedVoice)
      ? {
          voiceId: selectedVoice
        }
      : {
          providerVoiceId: selectedVoice
        },
    output: buildOutput()
  };

  const controls = buildControls();
  if (controls !== undefined) {
    request.controls = controls;
  }
  const vendorParams = parseVendorParams();
  if (Object.keys(vendorParams).length > 0) {
    request.vendor = {
      mode: "prefer_vendor",
      extensions: {
        [providerId.value]: {
          schemaVersion: "1.0.0",
          params: vendorParams
        }
      }
    };
  }
  return request;
}

// buildOutput: 无入参；功能是收集配置输出格式和可选采样率。
function buildOutput(): NonNullable<BenchConfigCreateRequest["output"]> {
  return {
    format: outputFormat.value,
    ...(Number.isFinite(sampleRateHz.value) ? { sampleRateHz: sampleRateHz.value } : {})
  };
}

// buildControls: 无入参；功能是收集非空通用控制参数。
function buildControls(): BenchConfigCreateRequest["controls"] | undefined {
  const controls: NonNullable<BenchConfigCreateRequest["controls"]> = {};
  if (speed.value !== undefined && Number.isFinite(speed.value)) {
    controls.speed = speed.value;
  }
  if (pitch.value !== undefined && Number.isFinite(pitch.value)) {
    controls.pitch = pitch.value;
  }
  if (volume.value !== undefined && Number.isFinite(volume.value)) {
    controls.volume = volume.value;
  }
  if (emotion.value.trim().length > 0) {
    controls.emotion = emotion.value.trim();
  }
  if (style.value.trim().length > 0) {
    controls.style = style.value.trim();
  }
  return Object.keys(controls).length === 0 ? undefined : controls;
}

// loadVoiceOptions: 入参为 providerId；功能是加载本地音色 registry 并生成配置弹窗音色选项。
async function loadVoiceOptions(nextProviderId: string) {
  const voices = await listVoices({ providerId: nextProviderId });
  knownVoiceIds.value = new Set(voices.map((voice) => voice.voiceId));
  voiceItems.value = voices.map((voice) => ({
    title: `${voice.displayName} (${voice.providerVoiceId})`,
    value: voice.voiceId
  }));
}

// parseVendorParams: 无入参；功能是解析配置中的 vendor extension JSON。
function parseVendorParams(): VendorPayload {
  const raw = vendorExtensionJson.value.trim();
  if (raw.length === 0) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("厂商特定参数 JSON 必须是对象。");
  }
  return parsed as VendorPayload;
}

onMounted(async () => {
  await store.loadProviders();
  await loadConfigs();
});
</script>

<style scoped>
.bench-summary {
  border: 1px solid #e4e8f0;
  border-radius: 8px;
  background: #fbfcff;
}

.bench-run-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.bench-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.bench-actions-end {
  justify-content: flex-end;
}

.bench-config-name-cell {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.bench-config-table :deep(td) {
  vertical-align: middle;
}

.bench-config-dialog-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr);
  gap: 18px;
}

.bench-empty-state {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 220px;
  border: 1px dashed #b7c4d8;
  border-radius: 8px;
  background: #f8fafc;
  color: #667085;
  text-align: center;
}

.bench-empty-title {
  color: #172033;
  font-size: 1rem;
  font-weight: 700;
}

.bench-empty-body {
  max-width: 460px;
  font-size: 0.9rem;
  line-height: 1.55;
}

@media (max-width: 860px) {
  .bench-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .bench-config-dialog-grid {
    grid-template-columns: 1fr;
  }
}
</style>
