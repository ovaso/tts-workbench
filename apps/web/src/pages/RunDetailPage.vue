<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>{{ runId }}</h1>
      <v-btn icon="mdi-refresh" :loading="loading" variant="text" @click="load" />
    </div>

    <v-alert v-if="error" class="mb-4" type="error" variant="tonal">
      {{ error }}
    </v-alert>

    <div v-if="detail" class="work-panel pa-4">
      <div class="run-meta mb-4">
        创建时间 {{ formatLocalDateTime(detail.result.createdAt) }}
      </div>
      <AudioPlayer
        v-if="detail.result.audio.url"
        class="mb-4"
        :format="detail.result.audio.format"
        :src="detail.result.audio.url"
      />
      <v-tabs v-model="tab" density="comfortable">
        <v-tab value="request">请求</v-tab>
        <v-tab value="plan">计划</v-tab>
        <v-tab value="mapping">映射</v-tab>
        <v-tab value="result">结果</v-tab>
        <v-tab value="vendor">厂商</v-tab>
      </v-tabs>

      <v-window v-model="tab" class="mt-4">
        <v-window-item value="request">
          <JsonViewer :value="detail.request" />
        </v-window-item>
        <v-window-item value="plan">
          <JsonViewer :value="detail.plan" />
        </v-window-item>
        <v-window-item value="mapping">
          <JsonViewer :value="detail.mappingReport" />
        </v-window-item>
        <v-window-item value="result">
          <JsonViewer :value="detail.result" />
        </v-window-item>
        <v-window-item value="vendor">
          <v-row>
            <v-col cols="12" md="6">
              <JsonViewer :value="detail.vendorRequest" />
            </v-col>
            <v-col cols="12" md="6">
              <JsonViewer :value="detail.vendorResponse" />
            </v-col>
          </v-row>
        </v-window-item>
      </v-window>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getRun, type RunDetail } from "../api/runs";
import AudioPlayer from "../components/AudioPlayer.vue";
import JsonViewer from "../components/JsonViewer.vue";
import { formatLocalDateTime } from "../utils/time";

const props = defineProps<{
  runId: string;
}>();

const detail = ref<RunDetail>();
const loading = ref(false);
const error = ref("");
const tab = ref("mapping");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    detail.value = await getRun(props.runId);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "加载运行详情失败。";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.run-meta {
  color: rgb(var(--v-theme-on-surface-variant));
  font-size: 0.875rem;
}
</style>
