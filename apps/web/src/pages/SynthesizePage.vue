<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>语音合成</h1>
      <v-btn
        color="primary"
        prepend-icon="mdi-play"
        :loading="submitting"
        @click="submit"
      >
        运行
      </v-btn>
    </div>

    <v-alert v-if="error" class="mb-4" type="error" variant="tonal">
      {{ error }}
    </v-alert>

    <div class="work-grid">
      <div class="work-panel pa-4">
        <ProviderSelector v-model="providerId" :providers="store.providers" />
        <v-btn-toggle
          v-model="operationMode"
          v-if="supportsSyncOperation || supportsStreamOperation"
          class="mb-4"
          color="primary"
          divided
          mandatory
          variant="outlined"
        >
          <v-btn v-if="supportsSyncOperation" value="sync" prepend-icon="mdi-file-music">同步</v-btn>
          <v-btn v-if="supportsStreamOperation" value="stream" prepend-icon="mdi-access-point">流式</v-btn>
        </v-btn-toggle>
        <v-textarea v-model="text" auto-grow label="文本" rows="5" variant="outlined" />
        <v-row>
          <v-col cols="12" md="6">
            <v-select
              v-model="model"
              :items="modelItems"
              label="模型"
              prepend-inner-icon="mdi-cube"
              variant="outlined"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-combobox
              v-model="voiceIdInput"
              :items="voiceItems"
              item-title="title"
              item-value="value"
              label="音色 ID"
              :placeholder="providerVoicePlaceholder"
              prepend-inner-icon="mdi-account-voice"
              variant="outlined"
              clearable
            />
          </v-col>
        </v-row>
        <v-row>
          <v-col cols="12" md="4">
            <v-select
              v-if="languageItems.length > 0"
              v-model="language"
              :items="languageItems"
              label="语言"
              variant="outlined"
            />
            <v-text-field v-else v-model="language" label="语言" variant="outlined" />
          </v-col>
          <v-col cols="12" md="4">
            <v-select v-model="format" :items="formats" label="编码格式" variant="outlined" />
          </v-col>
          <v-col cols="12" md="4">
            <v-select
              v-model.number="sampleRateHz"
              :items="sampleRates"
              label="采样率"
              variant="outlined"
            />
          </v-col>
        </v-row>
      </div>

      <div class="work-panel pa-4">
        <v-select
          v-model="vendorMode"
          :items="vendorModeItems"
          item-title="title"
          item-value="value"
          label="厂商参数模式"
          variant="outlined"
        />
        <VendorExtensionEditor v-model="vendorExtensionJson" />
      </div>
    </div>

    <div class="page-title mt-6">
      <h2>语音合成记录</h2>
      <v-btn icon="mdi-refresh" :loading="runsLoading" variant="text" @click="loadRuns" />
    </div>

    <v-alert v-if="runsError" class="mb-4" type="error" variant="tonal">
      {{ runsError }}
    </v-alert>

    <div class="work-panel pa-4">
      <div v-if="synthesisRuns.length === 0" class="runs-empty-state">
        <v-icon color="primary" icon="mdi-history" size="44" />
        <div class="runs-empty-title">暂无语音合成记录</div>
        <div class="runs-empty-body">运行一次语音合成后，归档记录会显示在这里。</div>
      </div>

      <div v-else class="runs-expansion-list">
        <div class="runs-expansion-header">
          <div class="run-row-grid">
            <span>运行 ID</span>
            <span>厂商</span>
            <span class="run-status-header">状态</span>
            <span>创建时间</span>
            <span>音频</span>
          </div>
        </div>

        <v-expansion-panels
          v-model="expandedRunIds"
          class="runs-expansion-panels"
          multiple
          @update:model-value="handleExpandedRuns"
        >
          <v-expansion-panel
            v-for="run in synthesisRuns"
            :key="run.runId"
            class="run-panel"
            :value="run.runId"
          >
            <v-expansion-panel-title class="run-panel-title">
              <div class="run-row-grid">
                <AutoScrollText :text="run.runId" mono />
                <AutoScrollText :text="run.providerId" />
                <div class="run-status-cell">
                  <v-tooltip :text="runStatusTooltip(run)" location="top">
                    <template #activator="{ props }">
                      <v-icon
                        v-bind="props"
                        :color="runStatusColor(run.status)"
                        :icon="runStatusIcon(run.status)"
                        size="20"
                      />
                    </template>
                  </v-tooltip>
                </div>
                <span>{{ formatLocalDateTime(run.createdAt) }}</span>
                <AutoScrollText :text="runAudioTitle(run)" />
              </div>
            </v-expansion-panel-title>

            <v-expansion-panel-text>
              <div class="run-expansion-panel">
                <div class="inline-detail-header">
                  <div>
                    <h3>{{ run.runId }}</h3>
                    <div class="inline-detail-meta">
                      {{ run.providerId }} · {{ formatLocalDateTime(run.createdAt) }}
                    </div>
                  </div>
                  <v-btn
                    icon="mdi-refresh"
                    :loading="runDetailLoadingByRunId[run.runId] === true"
                    variant="text"
                    @click.stop="loadRunDetail(run.runId)"
                  />
                </div>

                <v-alert
                  v-if="runDetailErrorByRunId[run.runId]"
                  class="my-4"
                  type="error"
                  variant="tonal"
                >
                  {{ runDetailErrorByRunId[run.runId] }}
                </v-alert>

                <v-progress-linear
                  v-if="runDetailLoadingByRunId[run.runId] === true"
                  class="my-4"
                  color="primary"
                  indeterminate
                />

                <div v-if="runDetailsByRunId[run.runId]">
                  <AudioPlayer
                    v-if="runDetailsByRunId[run.runId]?.result.audio?.url"
                    class="mb-4"
                    :format="runDetailsByRunId[run.runId]?.result.audio?.format ?? 'mp3'"
                    :src="runDetailsByRunId[run.runId]?.result.audio?.url ?? ''"
                  />
                  <v-tabs
                    v-model="runDetailTabByRunId[run.runId]"
                    class="run-detail-tabs"
                    color="primary"
                    density="comfortable"
                  >
                    <v-tab v-for="tab in runDetailTabItems" :key="tab.value" :value="tab.value">
                      {{ tab.title }}
                    </v-tab>
                  </v-tabs>

                  <v-window v-model="runDetailTabByRunId[run.runId]" class="mt-4">
                    <v-window-item value="request">
                      <JsonViewer :value="runDetailsByRunId[run.runId]?.request" />
                    </v-window-item>
                    <v-window-item value="plan">
                      <JsonViewer :value="runDetailsByRunId[run.runId]?.plan" />
                    </v-window-item>
                    <v-window-item value="mapping">
                      <JsonViewer :value="runDetailsByRunId[run.runId]?.mappingReport" />
                    </v-window-item>
                    <v-window-item value="result">
                      <JsonViewer :value="runDetailsByRunId[run.runId]?.result" />
                    </v-window-item>
                    <v-window-item value="vendor">
                      <v-row>
                        <v-col cols="12" md="6">
                          <JsonViewer :value="runDetailsByRunId[run.runId]?.vendorRequest" />
                        </v-col>
                        <v-col cols="12" md="6">
                          <JsonViewer :value="runDetailsByRunId[run.runId]?.vendorResponse" />
                        </v-col>
                      </v-row>
                    </v-window-item>
                  </v-window>
                </div>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type {
  ArchivedRunSummary,
  TTSOutputFormat,
  TTSStreamRequest,
  TTSSyncRequest,
  VendorDirectiveMode,
  VendorPayload
} from "@tts-platform/core";
import { computed, onMounted, ref, watch } from "vue";
import AudioPlayer from "../components/AudioPlayer.vue";
import AutoScrollText from "../components/AutoScrollText.vue";
import JsonViewer from "../components/JsonViewer.vue";
import ProviderSelector from "../components/ProviderSelector.vue";
import VendorExtensionEditor from "../components/VendorExtensionEditor.vue";
import { getRun, listRuns, type RunDetail } from "../api/runs";
import { synthesizeStream, synthesizeSync, ttsStreamSocketUrl } from "../api/tts";
import { listVoices } from "../api/voices";
import { useProvidersStore } from "../stores/providers";
import { formatLocalDateTime } from "../utils/time";
import {
  defaultFormatForModel,
  defaultLanguageForModel,
  defaultModelForOperation,
  defaultSampleRateForModel,
  defaultVoicePlaceholderForModel,
  formatOptionsForModel,
  languageOptionsForModel,
  modelById,
  modelOptions,
  requiresExplicitVoiceForModel,
  sampleRateOptionsForModel,
  supportsOperation,
  vendorExtensionTemplateForOperation,
  voiceOptions
} from "./synthesize-options";
import {
  runAudioTitle,
  runDetailTabs,
  runStatusColor,
  runStatusIcon,
  runStatusTooltip,
  syncSynthesisRuns
} from "./synthesize-runs";
import { type ComboboxOption, voiceInputValue } from "./synthesize-submit";

const store = useProvidersStore();

const providerId = ref("minimax");
const operationMode = ref<"sync" | "stream">("sync");
const text = ref("你好，这是一次语音合成测试。");
const model = ref("");
const voiceIdInput = ref<string | ComboboxOption | null>("");
const language = ref("");
const format = ref<TTSOutputFormat>("mp3");
const sampleRateHz = ref(32000);
const vendorMode = ref<VendorDirectiveMode>("prefer_vendor");
const vendorExtensionJson = ref("{}");
const submitting = ref(false);
const error = ref("");
const knownVoiceIds = ref(new Set<string>());
const voiceItems = ref<Array<{ title: string; value: string }>>([]);
const runs = ref<ArchivedRunSummary[]>([]);
const runsLoading = ref(false);
const runsError = ref("");
const runDetailsByRunId = ref<Record<string, RunDetail | undefined>>({});
const runDetailLoadingByRunId = ref<Record<string, boolean | undefined>>({});
const runDetailErrorByRunId = ref<Record<string, string | undefined>>({});
const runDetailTabByRunId = ref<Record<string, string | undefined>>({});
const expandedRunIds = ref<string[]>([]);

const vendorModeItems: Array<{ title: string; value: VendorDirectiveMode }> = [
  {
    title: "仅使用通用参数",
    value: "canonical_only"
  },
  {
    title: "优先使用厂商参数",
    value: "prefer_vendor"
  },
  {
    title: "必须使用厂商参数",
    value: "vendor_required"
  }
];
const runDetailTabItems = runDetailTabs();
const currentCapabilities = computed(() => store.capabilities[providerId.value]);
const currentModel = computed(() => modelById(currentCapabilities.value, model.value));
const supportsSyncOperation = computed(() => supportsOperation(currentCapabilities.value, currentModel.value, "tts.sync"));
const supportsStreamOperation = computed(() =>
  supportsOperation(currentCapabilities.value, currentModel.value, "tts.stream")
);
const modelItems = computed(() => modelOptions(currentCapabilities.value));
const formats = computed(() => formatOptionsForModel(currentModel.value));
const sampleRates = computed(() => sampleRateOptionsForModel(currentModel.value));
const languageItems = computed(() => languageOptionsForModel(currentModel.value));
const providerVoicePlaceholder = computed(() => defaultVoicePlaceholderForModel(currentModel.value));
const synthesisRuns = computed(() => syncSynthesisRuns(runs.value));

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
      voiceIdInput.value = "";
      const capabilities = await store.loadCapabilities(nextProviderId);
      applyProviderDefaults(capabilities);
      applyVendorExtensionTemplate();
      await loadVoiceOptions(nextProviderId);
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : "加载厂商能力失败。";
    }
  },
  {
    immediate: true
  }
);

watch(model, async () => {
  voiceIdInput.value = "";
  applyModelDefaults();
  applyVendorExtensionTemplate();
  if (providerId.value.length > 0) {
    try {
      await loadVoiceOptions(providerId.value);
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : "加载音色列表失败。";
    }
  }
});

async function submit() {
  error.value = "";
  submitting.value = true;
  try {
    const vendorParams = parseVendorParams();
    const voice: TTSSyncRequest["voice"] = {};
    const selectedVoice = voiceInputValue(voiceIdInput.value);
    if (selectedVoice.length === 0 && requiresExplicitVoiceForModel(currentModel.value)) {
      throw new Error("当前模型需要填写音色 ID。请在音色 ID 中输入 CosyVoice voice_id，或先到音色管理登记/复刻音色。");
    }
    if (operationMode.value === "stream" && !supportsStreamOperation.value) {
      throw new Error("当前厂商或模型不支持流式合成。");
    }
    if (operationMode.value === "sync" && !supportsSyncOperation.value) {
      throw new Error("当前厂商或模型不支持同步合成。");
    }
    if (selectedVoice.length > 0 && knownVoiceIds.value.has(selectedVoice)) {
      voice.voiceId = selectedVoice;
    } else if (selectedVoice.length > 0) {
      voice.providerVoiceId = selectedVoice;
    }
    if (language.value.trim().length > 0) {
      voice.language = language.value;
    }

    const request: TTSSyncRequest | TTSStreamRequest = {
      operation: operationMode.value === "stream" ? "tts.stream" : "tts.sync",
      providerId: providerId.value,
      text: text.value,
      model: model.value,
      voice,
      output: {
        format: format.value,
        sampleRateHz: sampleRateHz.value
      },
      vendor: {
        mode: vendorMode.value
      }
    };

    if (Object.keys(vendorParams).length > 0) {
      request.vendor = {
        mode: vendorMode.value,
        extensions: {
          [providerId.value]: {
            schemaVersion: "1.0.0",
            params: vendorParams
          }
        }
      };
    }

    if (operationMode.value === "stream") {
      await runStreamSynthesis(request as TTSStreamRequest);
      return;
    }

    const result = await synthesizeSync(request as TTSSyncRequest);
    await loadRuns();
    await expandAndLoadRun(result.runId);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "语音合成失败。";
  } finally {
    submitting.value = false;
  }
}

// runStreamSynthesis: 入参为流式请求；功能是创建 stream session、连接下游 WS 并在完成后刷新归档记录。
async function runStreamSynthesis(request: TTSStreamRequest) {
  const session = await synthesizeStream(request);
  await waitForStreamCompletion(ttsStreamSocketUrl(session));
  await loadRuns();
  const latestStreamRun = runs.value.find((run) => run.operation === "tts.stream" && run.providerId === providerId.value);
  if (latestStreamRun !== undefined) {
    await expandAndLoadRun(latestStreamRun.runId);
  }
}

// waitForStreamCompletion: 入参为 WebSocket URL；输出流式合成完成或失败的 Promise。
function waitForStreamCompletion(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let completed = false;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "client.ready" }));
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      const payload = parseStreamEvent(event.data);
      if (payload.type === "error") {
        reject(new Error(typeof payload.message === "string" ? payload.message : "流式合成失败。"));
        socket.close();
      }
      if (payload.type === "session.completed") {
        completed = true;
      }
    });
    socket.addEventListener("error", () => {
      reject(new Error("流式合成 WebSocket 连接失败。"));
    });
    socket.addEventListener("close", () => {
      if (completed) {
        resolve();
      } else {
        reject(new Error("流式合成连接在完成前关闭。"));
      }
    });
  });
}

// parseStreamEvent: 入参为 WebSocket 文本帧；输出可判断类型的事件对象。
function parseStreamEvent(raw: string): { type?: unknown; message?: unknown } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// expandAndLoadRun: 入参为 runId；功能是展开指定 run 并加载详情。
async function expandAndLoadRun(runId: string) {
  if (!expandedRunIds.value.includes(runId)) {
    expandedRunIds.value = [runId, ...expandedRunIds.value];
  }
  await loadRunDetail(runId);
}

// handleExpandedRuns: 入参为当前展开 runId 数组；功能是支持多个 expansion panel 同时展开并补充加载详情。
async function handleExpandedRuns(nextRunIds: string[]) {
  expandedRunIds.value = nextRunIds;
  const unloadedRunIds = nextRunIds.filter((runId) => runDetailsByRunId.value[runId] === undefined);
  for (const runId of unloadedRunIds) {
    await loadRunDetail(runId);
  }
}

// loadRunDetail: 入参为 runId；功能是加载同步合成运行详情并展示请求、计划、映射和厂商审计 tabs。
async function loadRunDetail(runId: string) {
  runDetailLoadingByRunId.value = {
    ...runDetailLoadingByRunId.value,
    [runId]: true
  };
  runDetailErrorByRunId.value = {
    ...runDetailErrorByRunId.value,
    [runId]: undefined
  };
  if (runDetailTabByRunId.value[runId] === undefined) {
    runDetailTabByRunId.value = {
      ...runDetailTabByRunId.value,
      [runId]: "mapping"
    };
  }
  try {
    const detail = await getRun(runId);
    runDetailsByRunId.value = {
      ...runDetailsByRunId.value,
      [runId]: detail
    };
  } catch (caught) {
    runDetailsByRunId.value = {
      ...runDetailsByRunId.value,
      [runId]: undefined
    };
    runDetailErrorByRunId.value = {
      ...runDetailErrorByRunId.value,
      [runId]: caught instanceof Error ? caught.message : "加载运行详情失败。"
    };
  } finally {
    runDetailLoadingByRunId.value = {
      ...runDetailLoadingByRunId.value,
      [runId]: false
    };
  }
}

// applyProviderDefaults: 入参为 provider capability；功能是选择默认模型并刷新模型相关表单默认值。
function applyProviderDefaults(capabilities: typeof currentCapabilities.value) {
  const preferredOperation =
    operationMode.value === "stream" && capabilities?.operations["tts.stream"]?.supported === true ? "tts.stream" : "tts.sync";
  const nextModel = defaultModelForOperation(capabilities, preferredOperation);
  if (nextModel.length > 0) {
    model.value = nextModel;
  }
  applyModelDefaults();
}

// applyModelDefaults: 无入参；功能是根据当前模型刷新格式、采样率和语言默认值。
function applyModelDefaults() {
  if (operationMode.value === "stream" && !supportsStreamOperation.value) {
    operationMode.value = "sync";
  }
  if (operationMode.value === "sync" && !supportsSyncOperation.value && supportsStreamOperation.value) {
    operationMode.value = "stream";
  }
  const nextFormat = defaultFormatForModel(currentModel.value);
  if (nextFormat !== undefined) {
    format.value = nextFormat;
  }

  const nextSampleRateHz = defaultSampleRateForModel(currentModel.value);
  if (nextSampleRateHz !== undefined) {
    sampleRateHz.value = nextSampleRateHz;
  }

  language.value = defaultLanguageForModel(currentModel.value);
}

// applyVendorExtensionTemplate: 无入参；功能是根据当前厂商与模型刷新厂商参数完整模板。
function applyVendorExtensionTemplate() {
  vendorExtensionJson.value = vendorExtensionTemplateForOperation(
    currentCapabilities.value,
    "tts.sync",
    currentModel.value
  );
}

// loadVoiceOptions: 入参为 providerId；功能是加载本地已克隆音色并刷新合成页音色候选。
async function loadVoiceOptions(nextProviderId: string) {
  const voices = await listVoices({
    providerId: nextProviderId,
    ...(model.value.length === 0 ? {} : { modelId: model.value })
  });
  knownVoiceIds.value = new Set(voices.map((voice) => voice.voiceId));
  voiceItems.value = voiceOptions(voices, model.value);
}

// loadRuns: 无入参；功能是刷新语音合成页面下方的同步合成记录。
async function loadRuns() {
  runsLoading.value = true;
  runsError.value = "";
  try {
    runs.value = await listRuns();
  } catch (caught) {
    runsError.value = caught instanceof Error ? caught.message : "加载语音合成记录失败。";
  } finally {
    runsLoading.value = false;
  }
}

// parseVendorParams: 无入参；功能是把 vendor extension 编辑器内容解析为对象参数。
function parseVendorParams(): VendorPayload {
  const raw = vendorExtensionJson.value.trim();
  if (raw.length === 0) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("厂商特定参数 JSON 必须是对象。");
  }
  return pruneEmptyVendorParams(parsed as VendorPayload);
}

// pruneEmptyVendorParams: 入参为厂商参数对象；输出去掉空占位值后的对象，确保未配置项走厂商默认。
function pruneEmptyVendorParams(params: VendorPayload): VendorPayload {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === null || value === undefined) {
        return false;
      }
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      if (typeof value === "object") {
        return Object.keys(value).length > 0;
      }
      return true;
    })
  );
}

onMounted(async () => {
  await store.loadProviders();
  await loadRuns();
});
</script>

<style scoped>
.runs-expansion-list {
  overflow-x: auto;
}

.run-row-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1.8fr) minmax(88px, 0.55fr) minmax(76px, 0.45fr) minmax(156px, 0.9fr) minmax(112px, 0.65fr);
  gap: 12px;
  align-items: center;
  min-width: 760px;
}

.runs-expansion-header {
  padding: 0 48px 8px 24px;
  color: #344054;
  font-size: 0.76rem;
  font-weight: 700;
}

.run-status-header,
.run-status-cell {
  justify-self: center;
}

.run-status-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
}

.runs-expansion-panels {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 760px;
}

.run-panel {
  border: 1px solid #e4e8f0;
  border-bottom-width: 0;
  border-radius: 0;
  box-shadow: none;
  transition:
    margin 160ms ease,
    border-color 160ms ease,
    border-radius 160ms ease,
    box-shadow 160ms ease;
}

.run-panel:first-child {
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
}

.run-panel:last-child {
  border-bottom-width: 1px;
  border-bottom-right-radius: 8px;
  border-bottom-left-radius: 8px;
}

.run-panel + .run-panel {
  margin-top: 0;
}

.run-panel.v-expansion-panel--active {
  z-index: 1;
  margin: 12px 0;
  border: 1px solid #c6d4ea;
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(23, 32, 51, 0.08);
}

.run-panel.v-expansion-panel--active + .run-panel {
  border-top-width: 1px;
}

.run-panel-title {
  color: #172033;
  min-height: 48px;
  padding-top: 0;
  padding-bottom: 0;
}

.run-panel-title :deep(.v-expansion-panel-title__overlay) {
  opacity: 0;
}

.run-panel :deep(.v-expansion-panel-text__wrapper) {
  padding: 0;
}

.run-expansion-panel {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 16px;
  border: 0;
  border-top: 1px solid #d9e1ee;
  border-left: 3px solid rgb(var(--v-theme-primary));
  background: #fbfcff;
}

.inline-detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.inline-detail-header h3 {
  color: #172033;
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.inline-detail-meta {
  margin-top: 4px;
  color: #475467;
  font-size: 0.875rem;
  font-weight: 500;
}

.run-detail-tabs {
  color: #344054;
}

.run-detail-tabs :deep(.v-tab) {
  color: #344054;
  font-weight: 600;
}

.run-detail-tabs :deep(.v-tab--selected) {
  color: rgb(var(--v-theme-primary));
}

.runs-empty-state {
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

.runs-empty-title {
  color: #172033;
  font-size: 1rem;
  font-weight: 700;
}

.runs-empty-body {
  max-width: 360px;
  font-size: 0.9rem;
  line-height: 1.55;
}
</style>
