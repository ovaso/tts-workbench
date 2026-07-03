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

    <div class="work-panel">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>运行 ID</th>
            <th>厂商</th>
            <th>创建时间</th>
            <th>音频</th>
            <th class="text-right">打开</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="run in synthesisRuns" :key="run.runId">
            <td>{{ run.runId }}</td>
            <td>{{ run.providerId }}</td>
            <td>{{ formatLocalDateTime(run.createdAt) }}</td>
            <td>{{ runAudioTitle(run) }}</td>
            <td class="text-right">
              <v-btn
                icon="mdi-open-in-new"
                size="small"
                :to="`/runs/${run.runId}`"
                variant="text"
              />
            </td>
          </tr>
          <tr v-if="synthesisRuns.length === 0">
            <td colspan="5" class="text-medium-emphasis">暂无语音合成记录</td>
          </tr>
        </tbody>
      </v-table>
    </div>
  </section>
</template>

<script setup lang="ts">
import type {
  ArchivedRunSummary,
  TTSOutputFormat,
  TTSSyncRequest,
  VendorDirectiveMode,
  VendorPayload
} from "@tts-platform/core";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import ProviderSelector from "../components/ProviderSelector.vue";
import VendorExtensionEditor from "../components/VendorExtensionEditor.vue";
import { listRuns } from "../api/runs";
import { synthesizeSync } from "../api/tts";
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
  sampleRateOptionsForModel,
  vendorExtensionTemplateForOperation,
  voiceOptions
} from "./synthesize-options";
import { runAudioTitle, syncSynthesisRuns } from "./synthesize-runs";
import { type ComboboxOption, voiceInputValue } from "./synthesize-submit";

const router = useRouter();
const store = useProvidersStore();

const providerId = ref("minimax");
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
const currentCapabilities = computed(() => store.capabilities[providerId.value]);
const currentModel = computed(() => modelById(currentCapabilities.value, model.value));
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

watch(model, () => {
  applyModelDefaults();
  applyVendorExtensionTemplate();
});

async function submit() {
  error.value = "";
  submitting.value = true;
  try {
    const vendorParams = parseVendorParams();
    const voice: TTSSyncRequest["voice"] = {};
    const selectedVoice = voiceInputValue(voiceIdInput.value);
    if (selectedVoice.length > 0 && knownVoiceIds.value.has(selectedVoice)) {
      voice.voiceId = selectedVoice;
    } else if (selectedVoice.length > 0) {
      voice.providerVoiceId = selectedVoice;
    }
    if (language.value.trim().length > 0) {
      voice.language = language.value;
    }

    const request: TTSSyncRequest = {
      operation: "tts.sync",
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

    const result = await synthesizeSync(request);
    await loadRuns();
    await router.push(`/runs/${result.runId}`);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "语音合成失败。";
  } finally {
    submitting.value = false;
  }
}

// applyProviderDefaults: 入参为 provider capability；功能是选择默认模型并刷新模型相关表单默认值。
function applyProviderDefaults(capabilities: typeof currentCapabilities.value) {
  const nextModel = defaultModelForOperation(capabilities, "tts.sync");
  if (nextModel.length > 0) {
    model.value = nextModel;
  }
  applyModelDefaults();
}

// applyModelDefaults: 无入参；功能是根据当前模型刷新格式、采样率和语言默认值。
function applyModelDefaults() {
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
  const voices = await listVoices({ providerId: nextProviderId });
  knownVoiceIds.value = new Set(voices.map((voice) => voice.voiceId));
  voiceItems.value = voiceOptions(voices);
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
