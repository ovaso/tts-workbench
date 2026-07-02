<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>音色克隆</h1>
      <v-btn color="primary" disabled prepend-icon="mdi-account-voice">
        提交复刻
      </v-btn>
    </div>

    <v-alert v-if="error" class="mb-4" type="error" variant="tonal">
      {{ error }}
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
          <v-list-item title="执行状态" subtitle="后端音色复刻执行链路待接入" />
        </v-list>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
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

const store = useProvidersStore();
const providerId = ref("minimax");
const model = ref("");
const voiceName = ref("");
const referenceAudio = ref<File | File[] | null>(null);
const vendorExtensionJson = ref("{}");
const error = ref("");

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

onMounted(async () => {
  await store.loadProviders();
});
</script>
