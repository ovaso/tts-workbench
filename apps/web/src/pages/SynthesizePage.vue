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
            <v-text-field v-model="model" label="Model" prepend-inner-icon="mdi-cube" variant="outlined" />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="providerVoiceId"
              label="Provider Voice"
              prepend-inner-icon="mdi-account-voice"
              variant="outlined"
            />
          </v-col>
        </v-row>
        <v-row>
          <v-col cols="12" md="4">
            <v-text-field v-model="language" label="Language" variant="outlined" />
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
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import ProviderSelector from "../components/ProviderSelector.vue";
import VendorExtensionEditor from "../components/VendorExtensionEditor.vue";
import { synthesizeSync } from "../api/tts";
import { useProvidersStore } from "../stores/providers";

const router = useRouter();
const store = useProvidersStore();

const providerId = ref("mock");
const text = ref("Hello from TTS Workbench.");
const model = ref("mock-tts-v1");
const providerVoiceId = ref("mock-voice");
const language = ref("en");
const format = ref<TTSOutputFormat>("wav");
const sampleRateHz = ref(24000);
const vendorMode = ref<VendorDirectiveMode>("prefer_vendor");
const vendorExtensionJson = ref('{\n  "toneHz": 440,\n  "durationMs": 600\n}');
const submitting = ref(false);
const error = ref("");

const formats: TTSOutputFormat[] = ["wav", "mp3", "ogg", "pcm", "flac", "opus"];
const sampleRates = [16000, 24000, 48000];
const vendorModes: VendorDirectiveMode[] = ["canonical_only", "prefer_vendor", "vendor_required"];

watch(
  () => store.providers,
  (providers) => {
    if (providers.length > 0 && providerId.value.length === 0) {
      providerId.value = providers[0]?.providerId ?? "mock";
    }
  },
  {
    immediate: true
  }
);

async function submit() {
  error.value = "";
  submitting.value = true;
  try {
    const vendorParams = parseVendorParams();
    const request: TTSSyncRequest = {
      operation: "tts.sync",
      providerId: providerId.value,
      text: text.value,
      model: model.value,
      voice: {
        providerVoiceId: providerVoiceId.value,
        language: language.value
      },
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
