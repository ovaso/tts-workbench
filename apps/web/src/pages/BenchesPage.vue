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

    <div v-if="activeTab === 'plans'" :class="benchConfigActionsClass()">
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openPlanDialog">
        创建方案
      </v-btn>
      <v-btn :loading="plansLoading" prepend-icon="mdi-refresh" variant="tonal" @click="loadPlans">
        刷新方案
      </v-btn>
    </div>

    <div v-if="activeTab === 'runs'" :class="benchConfigActionsClass()">
      <v-btn :loading="plansLoading" prepend-icon="mdi-refresh" variant="tonal" @click="loadPlans">
        刷新运行列表
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
            <v-list-item title="方案数量" :subtitle="`${plans.length} 个`" />
            <v-list-item title="可用配置" :subtitle="`${configs.length} 个`" />
            <v-list-item title="可用语料组合" :subtitle="`${corpusSets.length} 个`" />
          </v-list>

          <v-divider class="my-3" />

          <v-progress-linear v-if="plansLoading" class="mb-3" color="primary" indeterminate />

          <div v-if="plans.length === 0 && !plansLoading" class="bench-empty-state">
            <v-icon color="primary" icon="mdi-format-list-bulleted" size="44" />
            <div class="bench-empty-title">暂无 Benchmark 方案</div>
            <div class="bench-empty-body">
              在这里选择一组配置和一个语料组合，生成可运行、可审计的固定方案。
            </div>
          </div>

          <v-data-table
            v-else
            class="bench-plan-table"
            density="comfortable"
            :headers="planHeaders"
            hide-default-footer
            hover
            item-value="planId"
            :items="plans"
          >
            <template #item.displayName="{ item }">
              <div class="bench-config-name-cell">
                <AutoScrollText :text="item.displayName" />
                <AutoScrollText :text="item.planId" mono />
              </div>
            </template>
            <template #item.status="{ item }">
              <v-chip :color="benchmarkPlanStatusColor(item.status)" density="compact" size="small" variant="tonal">
                {{ benchmarkPlanStatusLabel(item.status) }}
              </v-chip>
            </template>
            <template #item.operation="{ item }">
              {{ benchmarkOperationLabel(item.operation) }}
            </template>
            <template #item.scale="{ item }">
              {{ benchmarkPlanScaleLabel(item) }}
            </template>
            <template #item.createdAt="{ item }">
              {{ formatLocalDateTime(item.createdAt) }}
            </template>
            <template #item.actions="{ item }">
              <div class="bench-row-actions">
                <v-tooltip text="查看运行" location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      color="primary"
                      icon="mdi-eye-outline"
                      size="small"
                      variant="text"
                      @click="openRunPlan(item.planId)"
                    />
                  </template>
                </v-tooltip>
                <v-tooltip text="运行方案" location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      color="primary"
                      icon="mdi-play"
                      :loading="runningPlanId === item.planId"
                      size="small"
                      variant="text"
                      @click="runPlan(item.planId)"
                    />
                  </template>
                </v-tooltip>
              </div>
            </template>
          </v-data-table>
        </div>
      </v-window-item>

      <v-window-item value="runs">
        <div class="work-grid">
          <div class="work-panel pa-4">
            <v-list class="bench-summary" density="compact">
              <v-list-item title="当前方案" :subtitle="selectedPlan?.displayName ?? '尚未选择'" />
              <v-list-item
                title="运行状态"
                :subtitle="selectedPlan === undefined ? '尚未选择' : benchmarkPlanStatusLabel(selectedPlan.status)"
              />
              <v-list-item title="归档位置" subtitle="data/benchmark-runs" />
            </v-list>

            <v-divider class="my-3" />

            <div class="bench-run-actions">
              <v-btn
                color="primary"
                prepend-icon="mdi-play"
                :disabled="selectedPlan === undefined"
                :loading="selectedPlan !== undefined && runningPlanId === selectedPlan.planId"
                @click="runSelectedPlan"
              >
                启动 Benchmark
              </v-btn>
              <v-btn :loading="plansLoading" prepend-icon="mdi-refresh" variant="tonal" @click="loadPlans">
                刷新运行列表
              </v-btn>
            </div>
          </div>

          <div class="work-panel pa-4">
            <v-progress-linear v-if="plansLoading" class="mb-3" color="primary" indeterminate />

            <div v-if="plans.length === 0 && !plansLoading" class="bench-empty-state">
              <v-icon color="primary" icon="mdi-playlist-play" size="44" />
              <div class="bench-empty-title">暂无 Benchmark 运行</div>
              <div class="bench-empty-body">
                先在方案列表创建 Benchmark 方案，再回到这里启动和查看运行结果。
              </div>
            </div>

            <v-data-table
              v-else
              class="bench-plan-table"
              density="comfortable"
              :headers="runHeaders"
              hide-default-footer
              hover
              item-value="planId"
              :items="plans"
            >
              <template #item.displayName="{ item }">
                <button class="bench-plan-button" type="button" @click="selectPlan(item.planId)">
                  <AutoScrollText :text="item.displayName" />
                </button>
              </template>
              <template #item.status="{ item }">
                <v-chip :color="benchmarkPlanStatusColor(item.status)" density="compact" size="small" variant="tonal">
                  {{ benchmarkPlanStatusLabel(item.status) }}
                </v-chip>
              </template>
              <template #item.result="{ item }">
                {{ benchmarkPlanResultLabel(item) }}
              </template>
              <template #item.metrics="{ item }">
                {{ benchmarkPlanMetricSummaryLabel(item) }}
              </template>
              <template #item.actions="{ item }">
                <div class="bench-row-actions">
                  <v-btn
                    color="primary"
                    icon="mdi-eye-outline"
                    size="small"
                    variant="text"
                    @click="selectPlan(item.planId)"
                  />
                  <v-btn
                    color="primary"
                    icon="mdi-play"
                    :loading="runningPlanId === item.planId"
                    size="small"
                    variant="text"
                    @click="runPlan(item.planId)"
                  />
                </div>
              </template>
            </v-data-table>
          </div>
        </div>

        <div v-if="selectedPlan" class="work-panel pa-4 mt-4">
          <div class="bench-job-header">
            <div>
              <h3>{{ selectedPlan.displayName }}</h3>
              <div class="bench-job-meta">
                {{ benchmarkPlanScaleLabel(selectedPlan) }} · {{ benchmarkPlanResultLabel(selectedPlan) }} ·
                {{ benchmarkPlanMetricSummaryLabel(selectedPlan) }}
              </div>
            </div>
            <v-chip :color="benchmarkPlanStatusColor(selectedPlan.status)" variant="tonal">
              {{ benchmarkPlanStatusLabel(selectedPlan.status) }}
            </v-chip>
          </div>

          <v-data-table
            class="bench-plan-table"
            density="comfortable"
            :headers="jobHeaders"
            hide-default-footer
            hover
            item-value="jobId"
            :items="selectedPlan.jobs"
          >
            <template #item.jobId="{ item }">
              <AutoScrollText :text="item.jobId" mono />
            </template>
            <template #item.status="{ item }">
              <v-chip :color="jobStatusColor(item.status)" density="compact" size="small" variant="tonal">
                {{ item.status }}
              </v-chip>
            </template>
            <template #item.firstPacketLatencyMs="{ item }">
              {{ benchmarkJobFirstPacketLabel(item.metrics) }}
            </template>
            <template #item.totalLatencyMs="{ item }">
              {{ metricMsLabel(item.metrics?.totalLatencyMs) }}
            </template>
            <template #item.audioDurationMs="{ item }">
              {{ metricMsLabel(item.metrics?.audioDurationMs) }}
            </template>
            <template #item.realtimeFactor="{ item }">
              {{ metricRatioLabel(item.metrics?.realtimeFactor) }}
            </template>
            <template #item.audioByteLength="{ item }">
              {{ metricBytesLabel(item.metrics?.audioByteLength) }}
            </template>
            <template #item.runId="{ item }">
              <v-btn
                v-if="item.runId"
                :to="`/runs/${item.runId}`"
                density="comfortable"
                prepend-icon="mdi-open-in-new"
                size="small"
                variant="text"
              >
                {{ item.runId }}
              </v-btn>
              <span v-else>未生成</span>
            </template>
            <template #item.errorMessage="{ item }">
              <AutoScrollText :text="item.errorMessage ?? ''" />
            </template>
          </v-data-table>
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
                    :disabled="formatItems.length === 0"
                    prepend-inner-icon="mdi-file-music-outline"
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-select
                    v-model.number="sampleRateHz"
                    :items="sampleRateItems"
                    label="采样率"
                    :disabled="sampleRateItems.length === 0"
                    prepend-inner-icon="mdi-sine-wave"
                    variant="outlined"
                  />
                </v-col>
              </v-row>
            </div>
            <div>
              <v-row>
                <v-col cols="12" md="4">
                  <v-text-field
                    v-model.number="speed"
                    label="Speed"
                    :disabled="!supportsSpeed"
                    :max="speedBounds.max"
                    :min="speedBounds.min"
                    type="number"
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field
                    v-model.number="pitch"
                    label="Pitch"
                    :disabled="!supportsPitch"
                    :max="pitchBounds.max"
                    :min="pitchBounds.min"
                    type="number"
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field
                    v-model.number="volume"
                    label="Volume"
                    :disabled="!supportsVolume"
                    :max="volumeBounds.max"
                    :min="volumeBounds.min"
                    type="number"
                    variant="outlined"
                  />
                </v-col>
              </v-row>
              <v-text-field v-model="emotion" label="Emotion" :disabled="!supportsEmotion" variant="outlined" />
              <v-text-field v-model="style" label="Style" :disabled="!supportsStyle" variant="outlined" />
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

    <v-dialog v-model="planDialog" max-width="960">
      <v-card>
        <v-card-title>创建 Benchmark 方案</v-card-title>
        <v-card-text>
          <div class="bench-plan-dialog-grid">
            <div>
              <v-text-field
                v-model="planDisplayName"
                label="方案名称"
                prepend-inner-icon="mdi-format-title"
                variant="outlined"
              />
              <v-select
                v-model="planCorpusSetId"
                :items="corpusSetItems"
                label="语料组合"
                prepend-inner-icon="mdi-folder-text-outline"
                variant="outlined"
              />
              <v-select
                v-model="planOperation"
                :items="operationItems"
                label="合成类型"
                prepend-inner-icon="mdi-transit-connection-variant"
                variant="outlined"
              />
              <v-select
                v-model="planTextMode"
                :items="textModeItems"
                label="文本模式"
                prepend-inner-icon="mdi-text"
                variant="outlined"
              />
              <v-textarea v-model="planDescription" auto-grow label="描述" rows="4" variant="outlined" />
            </div>
            <div>
              <div class="bench-picker-toolbar">
                <span>{{ selectedPlanConfigIds.length }} 已选</span>
                <span>{{ configs.length }} 可用配置</span>
              </div>
              <v-data-table
                class="bench-picker-table"
                density="compact"
                :headers="planConfigHeaders"
                hide-default-footer
                hover
                item-value="configId"
                :items="configs"
              >
                <template #header.selected>
                  <v-checkbox-btn
                    :indeterminate="somePlanConfigsSelected && !allPlanConfigsSelected"
                    :model-value="allPlanConfigsSelected"
                    @update:model-value="toggleAllPlanConfigs($event === true)"
                  />
                </template>
                <template #item.selected="{ item }">
                  <v-checkbox-btn
                    :model-value="selectedPlanConfigIds.includes(item.configId)"
                    @update:model-value="togglePlanConfig(item.configId, $event === true)"
                  />
                </template>
                <template #item.displayName="{ item }">
                  <AutoScrollText :text="item.displayName" />
                </template>
                <template #item.providerId="{ item }">
                  <AutoScrollText :text="item.providerId" />
                </template>
                <template #item.modelId="{ item }">
                  <AutoScrollText :text="item.modelId" mono />
                </template>
              </v-data-table>
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="planDialog = false">取消</v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-content-save"
            :disabled="!canCreatePlan"
            :loading="creatingPlan"
            @click="submitPlan"
          >
            创建
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup lang="ts">
import type {
  BenchConfig,
  BenchConfigCreateRequest,
  BenchmarkJobOperation,
  BenchmarkPlan,
  BenchmarkPlanJobStatus,
  BenchmarkTextMode,
  CorpusSet,
  TTSOutputFormat,
  VendorPayload,
  VoiceRecord
} from "@tts-platform/core";
import { computed, onMounted, ref, watch } from "vue";
import { createBenchConfig, createBenchConfigSet, listBenchConfigs } from "../api/bench-configs";
import { createBenchmarkPlan, listBenchmarkPlans, runBenchmarkPlan } from "../api/benchmark-plans";
import { listCorpusSets } from "../api/corpus";
import { listVoices } from "../api/voices";
import AutoScrollText from "../components/AutoScrollText.vue";
import ProviderSelector from "../components/ProviderSelector.vue";
import VendorExtensionEditor from "../components/VendorExtensionEditor.vue";
import { useProvidersStore } from "../stores/providers";
import { formatLocalDateTime } from "../utils/time";
import {
  defaultFormatForModel,
  defaultModelForOperation,
  defaultSampleRateForModel,
  formatOptionsForModel,
  modelById,
  modelOptions,
  numericControlBounds,
  sampleRateOptionsForModel,
  supportsCanonicalControl,
  vendorExtensionTemplateForOperation,
  voiceOptions
} from "./synthesize-options";
import { type ComboboxOption, voiceInputValue } from "./synthesize-submit";
import {
  benchmarkPlanResultLabel,
  benchmarkPlanScaleLabel,
  benchmarkOperationLabel,
  benchmarkPlanMetricSummaryLabel,
  benchmarkPlanStatusColor,
  benchmarkPlanStatusLabel,
  benchConfigOutputLabel,
  benchConfigActionsClass,
  benchConfigVoiceLabel,
  benchTabItems,
  benchmarkJobFirstPacketLabel,
  metricBytesLabel,
  metricMsLabel,
  metricRatioLabel,
  shortBenchDigest
} from "./benches-page";

const activeTab = ref("configs");
const tabItems = benchTabItems();
const store = useProvidersStore();
const configs = ref<BenchConfig[]>([]);
const plans = ref<BenchmarkPlan[]>([]);
const corpusSets = ref<CorpusSet[]>([]);
const configsLoading = ref(false);
const plansLoading = ref(false);
const corpusSetsLoading = ref(false);
const creatingConfig = ref(false);
const creatingPlan = ref(false);
const configDialog = ref(false);
const planDialog = ref(false);
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
const managedVoices = ref<VoiceRecord[]>([]);
const planDisplayName = ref("");
const planDescription = ref("");
const planCorpusSetId = ref("");
const planOperation = ref<BenchmarkJobOperation>("tts.sync");
const planTextMode = ref<BenchmarkTextMode>("text");
const selectedPlanConfigIds = ref<string[]>([]);
const selectedPlanId = ref("");
const runningPlanId = ref("");
const configHeaders = [
  { title: "配置", key: "displayName", sortable: true },
  { title: "厂商", key: "providerId", sortable: true },
  { title: "模型", key: "modelId", sortable: true },
  { title: "音色", key: "voice", sortable: false },
  { title: "输出", key: "output", sortable: false },
  { title: "创建时间", key: "createdAt", sortable: true }
];
const planHeaders = [
  { title: "方案", key: "displayName", sortable: true },
  { title: "状态", key: "status", sortable: true },
  { title: "类型", key: "operation", sortable: true },
  { title: "规模", key: "scale", sortable: false },
  { title: "语料组合", key: "corpusSetId", sortable: true },
  { title: "配置组合", key: "configSetId", sortable: true },
  { title: "创建时间", key: "createdAt", sortable: true },
  { title: "操作", key: "actions", sortable: false, align: "center" as const }
];
const runHeaders = [
  { title: "方案", key: "displayName", sortable: true },
  { title: "状态", key: "status", sortable: true },
  { title: "结果", key: "result", sortable: false },
  { title: "平均指标", key: "metrics", sortable: false },
  { title: "更新时间", key: "updatedAt", sortable: true },
  { title: "操作", key: "actions", sortable: false, align: "center" as const }
];
const jobHeaders = [
  { title: "Job", key: "jobId", sortable: true },
  { title: "语料", key: "corpusItemId", sortable: true },
  { title: "配置", key: "configId", sortable: true },
  { title: "状态", key: "status", sortable: true },
  { title: "首包", key: "firstPacketLatencyMs", sortable: false },
  { title: "总耗时", key: "totalLatencyMs", sortable: false },
  { title: "音频时长", key: "audioDurationMs", sortable: false },
  { title: "RTF", key: "realtimeFactor", sortable: false },
  { title: "字节", key: "audioByteLength", sortable: false },
  { title: "Run", key: "runId", sortable: false },
  { title: "错误", key: "errorMessage", sortable: false }
];
const planConfigHeaders = [
  { title: "", key: "selected", sortable: false, width: 52 },
  { title: "配置", key: "displayName", sortable: true },
  { title: "厂商", key: "providerId", sortable: true },
  { title: "模型", key: "modelId", sortable: true }
];
const textModeItems: Array<{ title: string; value: BenchmarkTextMode }> = [
  { title: "纯文本", value: "text" },
  { title: "SSML", value: "ssml" }
];
const operationItems: Array<{ title: string; value: BenchmarkJobOperation }> = [
  { title: "同步合成", value: "tts.sync" },
  { title: "流式合成", value: "tts.stream" }
];
const currentCapabilities = computed(() => store.capabilities[providerId.value]);
const currentModel = computed(() => modelById(currentCapabilities.value, modelId.value, "tts.sync"));
const selectedManagedVoice = computed(() => {
  const selectedVoiceId = voiceInputValue(voiceInput.value);
  return managedVoices.value.find((voice) => voice.voiceId === selectedVoiceId);
});
const modelItems = computed(() => modelOptions(currentCapabilities.value, "tts.sync", selectedManagedVoice.value));
const formatItems = computed(() => formatOptionsForModel(currentModel.value, currentCapabilities.value, "tts.sync"));
const sampleRateItems = computed(() => sampleRateOptionsForModel(currentModel.value, currentCapabilities.value, "tts.sync"));
const supportsSpeed = computed(() => supportsCanonicalControl(currentModel.value, currentCapabilities.value, "tts.sync", "speed"));
const supportsPitch = computed(() => supportsCanonicalControl(currentModel.value, currentCapabilities.value, "tts.sync", "pitch"));
const supportsVolume = computed(() => supportsCanonicalControl(currentModel.value, currentCapabilities.value, "tts.sync", "volume"));
const supportsEmotion = computed(() => supportsCanonicalControl(currentModel.value, currentCapabilities.value, "tts.sync", "emotion"));
const supportsStyle = computed(() => supportsCanonicalControl(currentModel.value, currentCapabilities.value, "tts.sync", "style"));
const speedBounds = computed(() => numericControlBounds(currentModel.value, currentCapabilities.value, "tts.sync", "speed"));
const pitchBounds = computed(() => numericControlBounds(currentModel.value, currentCapabilities.value, "tts.sync", "pitch"));
const volumeBounds = computed(() => numericControlBounds(currentModel.value, currentCapabilities.value, "tts.sync", "volume"));
const selectedPlan = computed(() => plans.value.find((plan) => plan.planId === selectedPlanId.value));
const corpusSetItems = computed(() =>
  corpusSets.value.map((set) => ({
    title: `${set.name} · ${set.corpusItemIds.length} 条`,
    value: set.corpusSetId
  }))
);
const allPlanConfigsSelected = computed(
  () => configs.value.length > 0 && configs.value.every((config) => selectedPlanConfigIds.value.includes(config.configId))
);
const somePlanConfigsSelected = computed(() =>
  configs.value.some((config) => selectedPlanConfigIds.value.includes(config.configId))
);
const canCreateConfig = computed(() => {
  return (
    providerId.value.length > 0 &&
    currentModel.value !== undefined &&
    configDisplayName.value.trim().length > 0 &&
    voiceInputValue(voiceInput.value).length > 0 &&
    formatItems.value.includes(outputFormat.value) &&
    sampleRateItems.value.includes(sampleRateHz.value)
  );
});
const canCreatePlan = computed(() => {
  return (
    planDisplayName.value.trim().length > 0 &&
    planCorpusSetId.value.length > 0 &&
    selectedPlanConfigIds.value.length > 0
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
      voiceInput.value = "";
      const capabilities = await store.loadCapabilities(nextProviderId);
      applyProviderDefaults(capabilities);
      await loadVoiceOptions(nextProviderId);
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : "加载厂商能力失败。";
    }
  },
  {
    immediate: true
  }
);

watch(modelId, () => {
  applyModelDefaults();
  applyVendorExtensionTemplate();
});

watch(voiceInput, () => {
  applyVoiceCompatibilityDefaults();
});

// openConfigDialog: 无入参；功能是打开添加 Benchmark 配置弹窗并初始化默认名称。
function openConfigDialog() {
  success.value = "";
  error.value = "";
  if (configDisplayName.value.trim().length === 0) {
    configDisplayName.value = "Benchmark 配置";
  }
  configDialog.value = true;
}

// applyProviderDefaults: 入参为 provider capability；功能是按 TTS 合成能力选择 Benchmark 默认模型。
function applyProviderDefaults(capabilities: typeof currentCapabilities.value) {
  modelId.value = defaultModelForOperation(capabilities, "tts.sync", selectedManagedVoice.value);
  applyModelDefaults();
  applyVendorExtensionTemplate();
}

// applyVoiceCompatibilityDefaults: 无入参；功能是选择有强兼容约束的音色后，把配置模型切到允许范围内。
function applyVoiceCompatibilityDefaults() {
  const availableModelIds = modelItems.value.map((item) => item.value);
  if (availableModelIds.length > 0 && !availableModelIds.includes(modelId.value)) {
    modelId.value = defaultModelForOperation(currentCapabilities.value, "tts.sync", selectedManagedVoice.value);
  }
}

// applyModelDefaults: 无入参；功能是按当前模型 capability 刷新输出参数并清理不支持的控制项。
function applyModelDefaults() {
  if (currentModel.value === undefined) {
    return;
  }
  const nextFormat = defaultFormatForModel(currentModel.value, currentCapabilities.value, "tts.sync");
  if (nextFormat !== undefined) {
    outputFormat.value = nextFormat;
  }
  const nextSampleRate = defaultSampleRateForModel(currentModel.value, currentCapabilities.value, "tts.sync");
  if (nextSampleRate !== undefined) {
    sampleRateHz.value = nextSampleRate;
  }
  if (!supportsSpeed.value) {
    speed.value = undefined;
  }
  if (!supportsPitch.value) {
    pitch.value = undefined;
  }
  if (!supportsVolume.value) {
    volume.value = undefined;
  }
  if (!supportsEmotion.value) {
    emotion.value = "";
  }
  if (!supportsStyle.value) {
    style.value = "";
  }
}

// applyVendorExtensionTemplate: 无入参；功能是按当前厂商和模型刷新 Benchmark 配置的厂商参数模板。
function applyVendorExtensionTemplate() {
  vendorExtensionJson.value = vendorExtensionTemplateForOperation(currentCapabilities.value, "tts.sync", currentModel.value);
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

// loadPlans: 无入参；功能是刷新 Benchmark 方案和运行结果列表。
async function loadPlans() {
  plansLoading.value = true;
  error.value = "";
  try {
    plans.value = await listBenchmarkPlans();
    if (selectedPlanId.value.length === 0 && plans.value[0] !== undefined) {
      selectedPlanId.value = plans.value[0].planId;
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "加载 Benchmark 方案失败。";
  } finally {
    plansLoading.value = false;
  }
}

// loadCorpusSets: 无入参；功能是刷新可用于 Benchmark 的语料组合列表。
async function loadCorpusSets() {
  corpusSetsLoading.value = true;
  error.value = "";
  try {
    corpusSets.value = await listCorpusSets();
    if (planCorpusSetId.value.length === 0 && corpusSets.value[0] !== undefined) {
      planCorpusSetId.value = corpusSets.value[0].corpusSetId;
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "加载语料组合失败。";
  } finally {
    corpusSetsLoading.value = false;
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

// openPlanDialog: 无入参；功能是打开创建 Benchmark 方案弹窗并准备候选配置和语料组合。
function openPlanDialog() {
  success.value = "";
  error.value = "";
  if (planDisplayName.value.trim().length === 0) {
    planDisplayName.value = "Benchmark 方案";
  }
  if (planCorpusSetId.value.length === 0 && corpusSets.value[0] !== undefined) {
    planCorpusSetId.value = corpusSets.value[0].corpusSetId;
  }
  planDialog.value = true;
}

// togglePlanConfig: 入参为配置 id 和选中状态；功能是维护创建方案弹窗里的配置选择。
function togglePlanConfig(configId: string, selected: boolean) {
  const nextIds = new Set(selectedPlanConfigIds.value);
  if (selected) {
    nextIds.add(configId);
  } else {
    nextIds.delete(configId);
  }
  selectedPlanConfigIds.value = [...nextIds];
}

// toggleAllPlanConfigs: 入参为是否全选；功能是批量维护方案配置选择。
function toggleAllPlanConfigs(selected: boolean) {
  selectedPlanConfigIds.value = selected ? configs.value.map((config) => config.configId) : [];
}

// submitPlan: 无入参；功能是由所选语料组合和配置列表生成 Benchmark 方案。
async function submitPlan() {
  if (!canCreatePlan.value) {
    return;
  }
  creatingPlan.value = true;
  error.value = "";
  success.value = "";
  try {
    const configSet = await createBenchConfigSet({
      name: `${planDisplayName.value.trim()} 配置组合`,
      configIds: selectedPlanConfigIds.value
    });
    const plan = await createBenchmarkPlan({
      displayName: planDisplayName.value.trim(),
      corpusSetId: planCorpusSetId.value,
      configSetId: configSet.configSetId,
      operation: planOperation.value,
      textMode: planTextMode.value,
      ...(planDescription.value.trim().length === 0 ? {} : { description: planDescription.value.trim() })
    });
    await loadPlans();
    selectedPlanId.value = plan.planId;
    success.value = `Benchmark 方案已创建：${plan.displayName}`;
    planDialog.value = false;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "创建 Benchmark 方案失败。";
  } finally {
    creatingPlan.value = false;
  }
}

// openRunPlan: 入参为 planId；功能是切换到运行页并选中指定方案。
function openRunPlan(planId: string) {
  selectedPlanId.value = planId;
  activeTab.value = "runs";
}

// selectPlan: 入参为 planId；功能是在运行页选中要查看的 Benchmark 方案。
function selectPlan(planId: string) {
  selectedPlanId.value = planId;
}

// runSelectedPlan: 无入参；功能是运行当前选中的 Benchmark 方案。
async function runSelectedPlan() {
  if (selectedPlan.value === undefined) {
    return;
  }
  await runPlan(selectedPlan.value.planId);
}

// runPlan: 入参为 planId；功能是顺序执行 Benchmark 方案并刷新运行结果。
async function runPlan(planId: string) {
  runningPlanId.value = planId;
  error.value = "";
  success.value = "";
  try {
    const plan = await runBenchmarkPlan(planId);
    await loadPlans();
    selectedPlanId.value = plan.planId;
    activeTab.value = "runs";
    success.value = `Benchmark 运行完成：${benchmarkPlanResultLabel(plan)}`;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "运行 Benchmark 失败。";
  } finally {
    runningPlanId.value = "";
  }
}

// jobStatusColor: 入参为 Benchmark job 状态；输出 Vuetify 状态颜色。
function jobStatusColor(status: BenchmarkPlanJobStatus): string {
  if (status === "succeeded") {
    return "success";
  }
  if (status === "failed") {
    return "error";
  }
  if (status === "running") {
    return "primary";
  }
  return "default";
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
  if (supportsSpeed.value && speed.value !== undefined && Number.isFinite(speed.value)) {
    controls.speed = speed.value;
  }
  if (supportsPitch.value && pitch.value !== undefined && Number.isFinite(pitch.value)) {
    controls.pitch = pitch.value;
  }
  if (supportsVolume.value && volume.value !== undefined && Number.isFinite(volume.value)) {
    controls.volume = volume.value;
  }
  if (supportsEmotion.value && emotion.value.trim().length > 0) {
    controls.emotion = emotion.value.trim();
  }
  if (supportsStyle.value && style.value.trim().length > 0) {
    controls.style = style.value.trim();
  }
  return Object.keys(controls).length === 0 ? undefined : controls;
}

// loadVoiceOptions: 入参为 providerId；功能是加载当前厂商本地音色 registry 并生成配置弹窗音色选项。
async function loadVoiceOptions(nextProviderId: string) {
  const voices = await listVoices({
    providerId: nextProviderId
  });
  managedVoices.value = voices;
  knownVoiceIds.value = new Set(voices.map((voice) => voice.voiceId));
  voiceItems.value = voiceOptions(voices);
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
  await Promise.all([loadConfigs(), loadCorpusSets(), loadPlans()]);
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

.bench-plan-table :deep(td) {
  vertical-align: middle;
}

.bench-row-actions {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.bench-plan-button {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.bench-plan-button:hover {
  color: #155eef;
}

.bench-config-dialog-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr);
  gap: 18px;
}

.bench-plan-dialog-grid {
  display: grid;
  grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.2fr);
  gap: 18px;
}

.bench-picker-toolbar {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  color: #5b667a;
  font-size: 0.86rem;
}

.bench-picker-table {
  max-height: 420px;
  overflow: auto;
}

.bench-picker-table :deep(td) {
  vertical-align: middle;
}

.bench-job-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.bench-job-header h3 {
  margin: 0;
  color: #172033;
  font-size: 1rem;
}

.bench-job-meta {
  margin-top: 4px;
  color: #667085;
  font-size: 0.86rem;
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

  .bench-plan-dialog-grid {
    grid-template-columns: 1fr;
  }

  .bench-job-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
