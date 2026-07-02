<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>Runs</h1>
      <v-btn icon="mdi-refresh" :loading="loading" variant="text" @click="load" />
    </div>

    <v-alert v-if="error" class="mb-4" type="error" variant="tonal">
      {{ error }}
    </v-alert>

    <div class="work-panel">
      <v-table density="comfortable">
        <thead>
          <tr>
            <th>Run</th>
            <th>Provider</th>
            <th>Created</th>
            <th>Audio</th>
            <th class="text-right">Open</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="run in runs" :key="run.runId">
            <td>{{ run.runId }}</td>
            <td>{{ run.providerId }}</td>
            <td>{{ formatLocalDateTime(run.createdAt) }}</td>
            <td>{{ run.audio.format }} · {{ run.audio.sampleRateHz }} Hz</td>
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
import type { TTSSyncResult } from "@tts-platform/core";
import { onMounted, ref } from "vue";
import { listRuns } from "../api/runs";
import { formatLocalDateTime } from "../utils/time";

const runs = ref<TTSSyncResult[]>([]);
const loading = ref(false);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    runs.value = await listRuns();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Failed to load runs.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
