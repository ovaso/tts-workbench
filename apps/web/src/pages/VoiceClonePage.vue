<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>音色管理</h1>
    </div>

    <v-alert v-if="error" class="mb-4" type="error" variant="tonal">
      {{ error }}
    </v-alert>
    <v-alert v-if="success" class="mb-4" type="success" variant="tonal">
      {{ success }}
    </v-alert>

    <v-tabs v-model="activeTab" class="mb-4" color="primary">
      <v-tab value="manage" prepend-icon="mdi-account-multiple">管理音色</v-tab>
      <v-tab value="test" prepend-icon="mdi-play-circle">音色合成测试</v-tab>
    </v-tabs>

    <div v-if="activeTab === 'manage'" class="voice-actions voice-actions-outside">
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openManualDialog">
        {{ actionLabels.register }}
      </v-btn>
      <v-btn color="primary" prepend-icon="mdi-account-voice" variant="tonal" @click="openCloneDialog">
        {{ actionLabels.clone }}
      </v-btn>
    </div>

    <v-window v-model="activeTab">
      <v-window-item value="manage">
        <div class="work-panel pa-4">
          <v-list class="voice-summary" density="compact">
            <v-list-item title="受控音色" :subtitle="`${voices.length} 个`" />
            <v-list-item title="涉及厂商" :subtitle="`${managedProviderCount} 个`" />
            <v-list-item title="事实来源" subtitle="本地 voice registry" />
          </v-list>

          <v-divider class="my-3" />

          <div v-if="voices.length === 0" class="voice-empty-state">
            <v-icon color="primary" icon="mdi-account-voice" size="44" />
            <div class="voice-empty-title">暂无受控音色</div>
            <div class="voice-empty-body">
              可以登记外部控制台已有音色，或通过参考音频创建新音色。
            </div>
          </div>

          <v-data-table
            v-else
            class="voice-table"
            density="comfortable"
            :headers="voiceTableHeaders"
            hide-default-footer
            hover
            item-value="voiceId"
            :items="voices"
          >
            <template #item.displayName="{ item }">
              <v-list-item class="voice-name-cell" density="compact">
                <template #title>
                  <AutoScrollText :text="item.displayName" />
                </template>
                <template #subtitle>
                  <AutoScrollText :text="item.voiceId" mono />
                </template>
              </v-list-item>
            </template>
            <template #item.providerId="{ item }">
              <AutoScrollText :text="providerLabel(item.providerId)" />
            </template>
            <template #item.modelId="{ item }">
              <AutoScrollText :text="item.modelId ?? '未记录'" mono />
            </template>
            <template #item.providerVoiceId="{ item }">
              <AutoScrollText :text="item.providerVoiceId" mono />
            </template>
            <template #item.source="{ item }">
              <v-chip
                :color="sourceColor(item.source)"
                density="comfortable"
                size="small"
                variant="tonal"
              >
                {{ sourceLabel(item.source) }}
              </v-chip>
            </template>
            <template #item.createdAt="{ item }">
              {{ formatLocalDateTime(item.createdAt) }}
            </template>
            <template #item.actions="{ item }">
              <div class="voice-row-actions">
                <v-tooltip text="移除受控记录">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      color="error"
                      density="comfortable"
                      icon="mdi-delete-outline"
                      :loading="deletingVoiceId === item.voiceId"
                      variant="text"
                      @click="submitDeleteVoice(item)"
                    />
                  </template>
                </v-tooltip>
              </div>
            </template>
          </v-data-table>
        </div>
      </v-window-item>

      <v-window-item value="test">
        <div class="work-grid">
          <div class="work-panel pa-4">
            <v-select
              v-model="testVoiceId"
              :items="voiceItems"
              label="受控音色"
              prepend-inner-icon="mdi-account-voice"
              variant="outlined"
            />
            <v-textarea
              v-model="testText"
              label="测试文本"
              prepend-inner-icon="mdi-text"
              rows="5"
              variant="outlined"
            />
            <v-btn
              color="primary"
              prepend-icon="mdi-play"
              :disabled="!canTestVoice"
              :loading="testingVoice"
              @click="submitVoiceTest"
            >
              合成测试
            </v-btn>
          </div>

          <div class="work-panel pa-4">
            <AudioPlayer
              v-if="testResult?.audio.url"
              :src="testResult.audio.url"
              :format="testResult.audio.format"
            />
            <v-list class="mt-3" density="compact">
              <v-list-item title="测试状态" :subtitle="testStatus" />
              <v-list-item title="运行 ID" :subtitle="testResult?.runId ?? '尚未生成'" />
            </v-list>
          </div>
        </div>
      </v-window-item>
    </v-window>

    <v-dialog v-model="manualDialog" max-width="560">
      <v-card>
        <v-card-title>登记音色</v-card-title>
        <v-card-text>
          <ProviderSelector v-model="providerId" :providers="store.providers" />
          <v-text-field
            v-model="manualDisplayName"
            label="音色名称"
            prepend-inner-icon="mdi-tag-outline"
            variant="outlined"
          />
          <v-text-field
            v-model="manualProviderVoiceId"
            label="厂商音色 ID"
            prepend-inner-icon="mdi-identifier"
            variant="outlined"
          />
          <v-combobox
            v-model="manualModelId"
            :items="modelItems"
            label="模型 ID"
            prepend-inner-icon="mdi-cube"
            variant="outlined"
          />
          <v-text-field
            v-model="manualLanguage"
            label="语言"
            placeholder="例如 zh-CN，可留空"
            prepend-inner-icon="mdi-translate"
            variant="outlined"
          />
          <v-select
            v-model="manualSource"
            :items="sourceItems"
            label="来源"
            prepend-inner-icon="mdi-source-branch"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="manualDialog = false">取消</v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-content-save"
            :disabled="!canCreateVoice"
            :loading="creatingVoice"
            @click="submitManualVoice"
          >
            登记
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="cloneDialog" max-width="880">
      <v-card>
        <v-card-title>通过参考音频创建音色</v-card-title>
        <v-card-text>
          <div class="clone-dialog-grid">
            <div>
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
            <v-list density="compact">
              <v-list-item title="能力状态" :subtitle="supportText" />
              <v-list-item title="参考音频" :subtitle="audioSummary" />
              <v-list-item title="转录要求" :subtitle="transcriptRequirement" />
              <v-list-item title="执行状态" :subtitle="cloneExecutionStatus" />
            </v-list>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="cloneDialog = false">取消</v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-account-voice"
            :disabled="!canSubmitClone"
            :loading="submittingClone"
            @click="submitClone"
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
  TTSSyncRequest,
  TTSSyncResult,
  VendorDirectiveMode,
  VendorPayload,
  VoiceCloneRequest,
  VoiceCreateRequest,
  VoiceRecord
} from "@tts-platform/core";
import { computed, onMounted, ref, watch } from "vue";
import { synthesizeSync } from "../api/tts";
import { createVoice, createVoiceClone, deleteVoice, listVoices } from "../api/voices";
import AudioPlayer from "../components/AudioPlayer.vue";
import AutoScrollText from "../components/AutoScrollText.vue";
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
import {
  deleteVoiceConfirmationText,
  type ModelInputValue,
  modelInputValue,
  sourceColor,
  sourceLabel,
  voiceManagementActionLabels
} from "./voice-management";
import { formatLocalDateTime } from "../utils/time";

const store = useProvidersStore();
const activeTab = ref<"manage" | "test">("manage");
const providerId = ref("minimax");
const model = ref("");
const voiceName = ref("");
const referenceAudio = ref<File | File[] | null>(null);
const vendorMode = ref<VendorDirectiveMode>("prefer_vendor");
const vendorExtensionJson = ref("{}");
const error = ref("");
const success = ref("");
const submittingClone = ref(false);
const creatingVoice = ref(false);
const testingVoice = ref(false);
const deletingVoiceId = ref("");
const manualDialog = ref(false);
const cloneDialog = ref(false);
const voices = ref<VoiceRecord[]>([]);
const manualDisplayName = ref("");
const manualProviderVoiceId = ref("");
const manualModelId = ref<ModelInputValue>("");
const manualLanguage = ref("");
const manualSource = ref<VoiceCreateRequest["source"]>("external");
const testVoiceId = ref("");
const testText = ref("这是一段用于验证受控音色的合成测试文本。");
const testResult = ref<TTSSyncResult | null>(null);

const sourceItems: Array<{ title: string; value: VoiceCreateRequest["source"] }> = [
  { title: "外部控制台音色", value: "external" },
  { title: "厂商内置音色", value: "vendor_builtin" }
];
const actionLabels = voiceManagementActionLabels();
const voiceTableHeaders = [
  { title: "音色", key: "displayName", sortable: true },
  { title: "厂商", key: "providerId", sortable: true },
  { title: "模型 ID", key: "modelId", sortable: true },
  { title: "厂商音色 ID", key: "providerVoiceId", sortable: true },
  { title: "来源", key: "source", sortable: true },
  { title: "创建时间", key: "createdAt", sortable: true },
  { title: "操作", key: "actions", align: "end" as const, sortable: false }
];
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
const managedProviderCount = computed(() => new Set(voices.value.map((voice) => voice.providerId)).size);
const selectedTestVoice = computed(() => voices.value.find((voice) => voice.voiceId === testVoiceId.value));
const voiceItems = computed(() =>
  voices.value.map((voice) => ({
    title: `${voice.displayName} · ${providerLabel(voice.providerId)} (${voice.providerVoiceId})`,
    value: voice.voiceId
  }))
);
const canCreateVoice = computed(
  () =>
    providerId.value.length > 0 &&
    manualDisplayName.value.trim().length > 0 &&
    manualProviderVoiceId.value.trim().length > 0 &&
    !creatingVoice.value
);
const canSubmitClone = computed(
  () =>
    cloneCapability.value !== undefined &&
    providerId.value.length > 0 &&
    model.value.length > 0 &&
    voiceName.value.trim().length > 0 &&
    referenceFile.value !== undefined &&
    !submittingClone.value
);
const canTestVoice = computed(
  () =>
    selectedTestVoice.value !== undefined &&
    testText.value.trim().length > 0 &&
    !testingVoice.value
);
const cloneExecutionStatus = computed(() => {
  if (submittingClone.value) {
    return "正在上传参考音频并调用厂商复刻接口";
  }
  if (success.value.length > 0) {
    return success.value;
  }
  return "请选择参考音频并提交复刻";
});
const testStatus = computed(() => {
  if (testingVoice.value) {
    return "正在使用受控音色合成";
  }
  return testResult.value === null ? "请选择音色并提交测试" : "测试音频已生成";
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

// applyProviderDefaults: 入参为 provider capability；功能是选择音色复刻默认模型。
function applyProviderDefaults(capabilities: typeof currentCapabilities.value) {
  const nextModel = defaultModelForOperation(capabilities, "voice.clone.create");
  if (nextModel.length > 0) {
    model.value = nextModel;
  }
}

// applyVendorExtensionTemplate: 无入参；功能是根据当前厂商与模型刷新音色复刻厂商参数完整模板。
function applyVendorExtensionTemplate() {
  vendorExtensionJson.value = vendorExtensionTemplate.value;
}

// loadManagedVoices: 无入参；功能是刷新本地全部受控音色列表。
async function loadManagedVoices() {
  voices.value = await listVoices();
  if (voices.value.every((voice) => voice.voiceId !== testVoiceId.value)) {
    testVoiceId.value = voices.value[0]?.voiceId ?? "";
  }
}

// providerLabel: 入参为 providerId；输出列表中展示的厂商名称。
function providerLabel(nextProviderId: string): string {
  const provider = store.providers.find((item) => item.providerId === nextProviderId);
  return provider === undefined ? nextProviderId : `${provider.providerName} (${provider.providerId})`;
}

// openManualDialog: 无入参；功能是打开手动登记音色弹窗并清理上一轮反馈。
function openManualDialog() {
  error.value = "";
  success.value = "";
  manualDialog.value = true;
}

// openCloneDialog: 无入参；功能是打开参考音频创建音色弹窗并清理上一轮反馈。
function openCloneDialog() {
  error.value = "";
  success.value = "";
  cloneDialog.value = true;
}

// submitManualVoice: 无入参；功能是把外部控制台或厂商内置音色登记到本地受控 registry。
async function submitManualVoice() {
  error.value = "";
  success.value = "";
  creatingVoice.value = true;
  try {
    const request: VoiceCreateRequest = {
      providerId: providerId.value,
      providerVoiceId: manualProviderVoiceId.value.trim(),
      displayName: manualDisplayName.value.trim(),
      source: manualSource.value
    };
    if (manualLanguage.value.trim().length > 0) {
      request.language = manualLanguage.value.trim();
    }
    const nextModelId = modelInputValue(manualModelId.value);
    if (nextModelId.length > 0) {
      request.modelId = nextModelId;
    }
    const voice = await createVoice(request);
    success.value = `已登记音色：${voice.displayName}`;
    manualDisplayName.value = "";
    manualProviderVoiceId.value = "";
    manualModelId.value = "";
    manualLanguage.value = "";
    await loadManagedVoices();
    testVoiceId.value = voice.voiceId;
    manualDialog.value = false;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "登记音色失败。";
  } finally {
    creatingVoice.value = false;
  }
}

// submitDeleteVoice: 入参为受控音色记录；功能是从本地 registry 移除该音色并刷新列表。
async function submitDeleteVoice(voice: VoiceRecord) {
  const confirmed = window.confirm(deleteVoiceConfirmationText(voice));
  if (!confirmed) {
    return;
  }
  error.value = "";
  success.value = "";
  deletingVoiceId.value = voice.voiceId;
  try {
    await deleteVoice(voice.voiceId);
    success.value = `已移除音色：${voice.displayName}`;
    if (testVoiceId.value === voice.voiceId) {
      testVoiceId.value = "";
      testResult.value = null;
    }
    await loadManagedVoices();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "移除音色失败。";
  } finally {
    deletingVoiceId.value = "";
  }
}

// submitVoiceTest: 无入参；功能是使用受控音色提交一次同步 TTS 合成并保存测试结果。
async function submitVoiceTest() {
  error.value = "";
  success.value = "";
  testingVoice.value = true;
  testResult.value = null;
  try {
    const selectedVoice = selectedTestVoice.value;
    if (selectedVoice === undefined) {
      throw new Error("请选择受控音色。");
    }
    const request: TTSSyncRequest = {
      operation: "tts.sync",
      providerId: selectedVoice.providerId,
      text: testText.value.trim(),
      voice: {
        voiceId: testVoiceId.value
      }
    };
    testResult.value = await synthesizeSync(request);
    success.value = `合成测试完成：${testResult.value.runId}`;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "音色合成测试失败。";
  } finally {
    testingVoice.value = false;
  }
}

// submitClone: 无入参；功能是提交参考音频复刻请求并把返回音色纳入受控 registry。
async function submitClone() {
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

  submittingClone.value = true;
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
    await loadManagedVoices();
    testVoiceId.value = result.voice.voiceId;
    cloneDialog.value = false;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "音色复刻失败。";
  } finally {
    submittingClone.value = false;
  }
}

// parseVendorParams: 无入参；功能是解析页面中的厂商参数 JSON 并清理空值。
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

// pruneEmptyVendorParams: 入参为厂商参数对象；输出删除空字符串、空数组和空对象后的参数对象。
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
  await loadManagedVoices();
});
</script>

<style scoped>
.voice-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.voice-actions-outside {
  margin: -2px 0 14px;
}

.voice-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.voice-table {
  border: 1px solid #e4e8f0;
  border-radius: 8px;
  min-width: 0;
  overflow: hidden;
}

.voice-table :deep(table) {
  min-width: 980px;
}

.voice-table :deep(.v-table__wrapper) {
  overflow-x: auto;
}

.voice-name-cell {
  min-width: 220px;
  padding-inline: 0;
}

.voice-row-actions {
  display: flex;
  justify-content: flex-end;
}

.voice-empty-state {
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

.voice-empty-title {
  color: #172033;
  font-size: 1rem;
  font-weight: 700;
}

.voice-empty-body {
  max-width: 360px;
  font-size: 0.9rem;
  line-height: 1.55;
}

.clone-dialog-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(260px, 0.85fr);
  gap: 18px;
}

@media (max-width: 760px) {
  .voice-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .voice-summary,
  .clone-dialog-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1080px) {
  .voice-summary {
    grid-template-columns: 1fr;
  }
}
</style>
