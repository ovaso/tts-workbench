<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>运行记录</h1>
      <v-btn icon="mdi-refresh" :loading="loading" variant="text" @click="load" />
    </div>

    <v-alert v-if="error" class="mb-4" type="error" variant="tonal">
      {{ error }}
    </v-alert>

    <div class="work-panel">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>运行 ID</th>
            <th>厂商</th>
            <th>类型</th>
            <th>创建时间</th>
            <th>音频</th>
            <th class="text-right">打开</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="run in runs" :key="run.runId">
            <td>{{ run.runId }}</td>
            <td>{{ run.providerId }}</td>
            <td>{{ operationTitle(run.operation) }}</td>
            <td>{{ formatLocalDateTime(run.createdAt) }}</td>
            <td>{{ audioTitle(run) }}</td>
            <td class="text-right">
              <v-btn
                icon="mdi-open-in-new"
                size="small"
                :to="`/runs/${run.runId}`"
                variant="text"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { ArchivedRunSummary } from "@tts-platform/core";
import { onMounted, ref } from "vue";
import { listRuns } from "../api/runs";
import { formatLocalDateTime } from "../utils/time";

const runs = ref<ArchivedRunSummary[]>([]);
const loading = ref(false);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    runs.value = await listRuns();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "加载运行记录失败。";
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// operationTitle: 入参为 operation；输出运行列表中展示的中文类型。
function operationTitle(operation: ArchivedRunSummary["operation"]): string {
  if (operation === "tts.sync") {
    return "同步合成";
  }
  if (operation === "voice.clone.create") {
    return "音色克隆";
  }
  return operation;
}

// audioTitle: 入参为运行摘要；输出音频列展示内容，非音频类运行显示占位。
function audioTitle(run: ArchivedRunSummary): string {
  return run.audio === undefined ? "无音频文件" : `${run.audio.format} · ${run.audio.sampleRateHz} Hz`;
}
</script>
