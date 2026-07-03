<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>音色克隆</h1>
      <v-btn
        color="primary"
        prepend-icon="mdi-account-voice"
        :disabled="!canSubmit"
        :loading="submitting"
        @click="submit"
      >
        提交复刻
      </v-btn>
    </div>

    <v-alert v-if="error" class="mb-4" type="error" variant="tonal">
      {{ error }}
    </v-alert>
    <v-alert v-if="success" class="mb-4" type="success" variant="tonal">
      {{ success }}
    </v-alert>

    <div class="work-grid">
      <div class="work-panel pa-4">
        <ProviderSelector v-model="providerId" :providers="store.providers" />
        <v-select
          v-model="model"
          :items="modelItems"
          label="模型"
          prepend-inner-icon="mdi-cube"
          variant="outlined"
        />
        <v-text-field
          v-model="voiceName"
          label="音色名称"
          prepend-inner-icon="mdi-tag-outline"
          variant="outlined"
        />
        <v-file-input
          v-model="referenceAudio"
          accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav"
          label="参考音频"
          prepend-inner-icon="mdi-music-note"
          variant="outlined"
        />
        <VendorExtensionEditor v-model="vendorExtensionJson" />
      </div>

      <div class="work-panel pa-4">
        <v-list density="compact">
          <v-list-item title="能力状态" :subtitle="supportText" />
          <v-list-item title="参考音频" :subtitle="audioSummary" />
          <v-list-item title="转录要求" :subtitle="transcriptRequirement" />
          <v-list-item title="执行状态" :subtitle="executionStatus" />
        </v-list>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { VendorDirectiveMode, VendorPayload, VoiceCloneRequest } from "@tts-platform/core";
import { computed, onMounted, ref, watch } from "vue";
import { createVoiceClone } from "../api/voices";
import ProviderSelector from "../components/ProviderSelector.vue";
import VendorExtensionEditor from "../components/VendorExtensionEditor.vue";
import { useProvidersStore } from "../stores/providers";
import {
  persistentVoiceCloneCapability,
  referenceAudioSummary,
  voiceCloneSupportText
} from "./voice-clone-options";
import {
  defaultModelForOperation,
  modelById,
  modelOptions,
  vendorExtensionTemplateForOperation
} from "./synthesize-options";
import { fileToDataUrl, referenceAudioFormat, selectedReferenceFile } from "./voice-clone-submit";

const store = useProvidersStore();
const providerId = ref("minimax");
const model = ref("");
const voiceName = ref("");
const referenceAudio = ref<File | File[] | null>(null);
const vendorMode = ref<VendorDirectiveMode>("prefer_vendor");
const vendorExtensionJson = ref("{}");
const error = ref("");
const success = ref("");
const submitting = ref(false);

const currentCapabilities = computed(() => store.capabilities[providerId.value]);
const currentModel = computed(() => modelById(currentCapabilities.value, model.value));
const modelItems = computed(() => modelOptions(currentCapabilities.value));
const vendorExtensionTemplate = computed(() =>
  vendorExtensionTemplateForOperation(currentCapabilities.value, "voice.clone.create", currentModel.value)
);
const cloneCapability = computed(() => persistentVoiceCloneCapability(currentCapabilities.value));
const supportText = computed(() => voiceCloneSupportText(currentCapabilities.value));
const audioSummary = computed(() => referenceAudioSummary(cloneCapability.value));
const transcriptRequirement = computed(() =>
  cloneCapability.value?.requiresTranscript === true ? "需要" : "不需要"
);
const referenceFile = computed(() => selectedReferenceFile(referenceAudio.value));
const canSubmit = computed(
  () =>
    cloneCapability.value !== undefined &&
    providerId.value.length > 0 &&
    model.value.length > 0 &&
    voiceName.value.trim().length > 0 &&
    referenceFile.value !== undefined &&
    !submitting.value
);
const executionStatus = computed(() => {
  if (submitting.value) {
    return "正在上传参考音频并调用厂商复刻接口";
  }
  if (success.value.length > 0) {
    return success.value;
  }
  return "请选择参考音频并提交复刻";
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
      const capabilities = await store.loadCapabilities(nextProviderId, { force: true });
      applyProviderDefaults(capabilities);
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : "加载厂商能力失败。";
    }
  },
  {
    immediate: true
  }
);

watch(model, () => {
  applyVendorExtensionTemplate();
});

watch(
  vendorExtensionTemplate,
  () => {
    applyVendorExtensionTemplate();
  },
  {
    immediate: true
  }
);

// applyProviderDefaults: 入参为 provider capability；功能是选择音色克隆默认模型。
function applyProviderDefaults(capabilities: typeof currentCapabilities.value) {
  const nextModel = defaultModelForOperation(capabilities, "voice.clone.create");
  if (nextModel.length > 0) {
    model.value = nextModel;
  }
}

// applyVendorExtensionTemplate: 无入参；功能是根据当前厂商与模型刷新音色克隆厂商参数完整模板。
function applyVendorExtensionTemplate() {
  vendorExtensionJson.value = vendorExtensionTemplate.value;
}

async function submit() {
  error.value = "";
  success.value = "";
  const file = referenceFile.value;
  if (file === undefined) {
    error.value = "请选择参考音频。";
    return;
  }
  if (voiceName.value.trim().length === 0) {
    error.value = "请填写音色名称。";
    return;
  }

  submitting.value = true;
  try {
    const vendorParams = parseVendorParams();
    const format = referenceAudioFormat(file);
    const referenceAudioItem: VoiceCloneRequest["referenceAudio"][number] = {
      uri: await fileToDataUrl(file)
    };
    if (format !== undefined) {
      referenceAudioItem.format = format;
    }

    const request: VoiceCloneRequest = {
      operation: "voice.clone.create",
      providerId: providerId.value,
      displayName: voiceName.value.trim(),
      model: model.value,
      referenceAudio: [referenceAudioItem],
      consent: {
        confirmed: true,
        usageScope: "internal_eval"
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

    const result = await createVoiceClone(request);
    success.value = `复刻完成：${result.voice.providerVoiceId}`;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "音色复刻失败。";
  } finally {
    submitting.value = false;
  }
}

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

function pruneEmptyVendorParams(params: VendorPayload): VendorPayload {
  return Object.fromEntries(
    Object.entries(params).flatMap(([key, value]) => {
      if (value === null || value === undefined) {
        return [];
      }
      if (Array.isArray(value)) {
        return value.length > 0 ? [[key, value]] : [];
      }
      if (typeof value === "object") {
        const nested = pruneEmptyVendorParams(value as VendorPayload);
        return Object.keys(nested).length > 0 ? [[key, nested]] : [];
      }
      if (typeof value === "string" && value.trim().length === 0) {
        return [];
      }
      return [[key, value]];
    })
  );
}

onMounted(async () => {
  await store.loadProviders();
});
</script>
