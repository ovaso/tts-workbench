<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>Synthesize</h1>
      <v-btn
        color="primary"
        prepend-icon="mdi-play"
        :loading="submitting"
        @click="submit"
      >
        Run
      </v-btn>
    </div>

    <v-alert v-if="error" class="mb-4" type="error" variant="tonal">
      {{ error }}
    </v-alert>

    <div class="work-grid">
      <div class="work-panel pa-4">
        <ProviderSelector v-model="providerId" :providers="store.providers" />
        <v-textarea v-model="text" auto-grow label="Text" rows="5" variant="outlined" />
        <v-row>
          <v-col cols="12" md="6">
            <v-select
              v-model="model"
              :items="modelItems"
              label="Model"
              prepend-inner-icon="mdi-cube"
              variant="outlined"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="providerVoiceId"
              label="Provider Voice"
              :placeholder="providerVoicePlaceholder"
              prepend-inner-icon="mdi-account-voice"
              variant="outlined"
            />
          </v-col>
        </v-row>
        <v-row>
          <v-col cols="12" md="4">
            <v-select
              v-if="languageItems.length > 0"
              v-model="language"
              :items="languageItems"
              label="Language"
              variant="outlined"
            />
            <v-text-field v-else v-model="language" label="Language" variant="outlined" />
          </v-col>
          <v-col cols="12" md="4">
            <v-select v-model="format" :items="formats" label="Format" variant="outlined" />
          </v-col>
          <v-col cols="12" md="4">
            <v-select
              v-model.number="sampleRateHz"
              :items="sampleRates"
              label="Sample Rate"
              variant="outlined"
            />
          </v-col>
        </v-row>
      </div>

      <div class="work-panel pa-4">
        <v-select v-model="vendorMode" :items="vendorModes" label="Vendor Mode" variant="outlined" />
        <VendorExtensionEditor v-model="vendorExtensionJson" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type {
  TTSOutputFormat,
  TTSSyncRequest,
  VendorDirectiveMode,
  VendorPayload
} from "@tts-platform/core";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import ProviderSelector from "../components/ProviderSelector.vue";
import VendorExtensionEditor from "../components/VendorExtensionEditor.vue";
import { synthesizeSync } from "../api/tts";
import { useProvidersStore } from "../stores/providers";
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
  sampleRateOptionsForModel
} from "./synthesize-options";

const router = useRouter();
const store = useProvidersStore();

const providerId = ref("minimax");
const text = ref("你好，这是一次语音合成测试。");
const model = ref("");
const providerVoiceId = ref("");
const language = ref("");
const format = ref<TTSOutputFormat>("mp3");
const sampleRateHz = ref(32000);
const vendorMode = ref<VendorDirectiveMode>("prefer_vendor");
const vendorExtensionJson = ref('{\n  "language_boost": "Chinese",\n  "output_format": "hex"\n}');
const submitting = ref(false);
const error = ref("");

const vendorModes: VendorDirectiveMode[] = ["canonical_only", "prefer_vendor", "vendor_required"];
const currentCapabilities = computed(() => store.capabilities[providerId.value]);
const currentModel = computed(() => modelById(currentCapabilities.value, model.value));
const modelItems = computed(() => modelOptions(currentCapabilities.value));
const formats = computed(() => formatOptionsForModel(currentModel.value));
const sampleRates = computed(() => sampleRateOptionsForModel(currentModel.value));
const languageItems = computed(() => languageOptionsForModel(currentModel.value));
const providerVoicePlaceholder = computed(() => defaultVoicePlaceholderForModel(currentModel.value));

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
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : "Failed to load provider capabilities.";
    }
  },
  {
    immediate: true
  }
);

watch(model, () => {
  applyModelDefaults();
});

async function submit() {
  error.value = "";
  submitting.value = true;
  try {
    const vendorParams = parseVendorParams();
    const voice: TTSSyncRequest["voice"] = {};
    if (providerVoiceId.value.trim().length > 0) {
      voice.providerVoiceId = providerVoiceId.value.trim();
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
    await router.push(`/runs/${result.runId}`);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Synthesis failed.";
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

// parseVendorParams: 无入参；功能是把 vendor extension 编辑器内容解析为对象参数。
function parseVendorParams(): VendorPayload {
  const raw = vendorExtensionJson.value.trim();
  if (raw.length === 0) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Vendor extension JSON must be an object.");
  }
  return parsed as VendorPayload;
}

onMounted(async () => {
  await store.loadProviders();
});
</script>
