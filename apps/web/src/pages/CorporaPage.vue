<template>
  <section class="page-shell">
    <div class="page-title">
      <h1>语料库</h1>
    </div>

    <v-alert v-if="error" class="mb-4" type="error" variant="tonal">
      {{ error }}
    </v-alert>
    <v-alert v-if="success" class="mb-4" type="success" variant="tonal">
      {{ success }}
    </v-alert>

    <div class="corpus-metrics mb-4">
      <div v-for="metric in metricItems" :key="metric.title" class="corpus-metric">
        <span>{{ metric.title }}</span>
        <strong>{{ metric.value }}</strong>
      </div>
    </div>

    <v-tabs v-model="activeTab" class="mb-4" color="primary">
      <v-tab prepend-icon="mdi-text-box-multiple-outline" value="items">语料条目</v-tab>
      <v-tab prepend-icon="mdi-folder-text-outline" value="sets">语料组合</v-tab>
    </v-tabs>

    <div v-if="activeTab === 'items'" class="corpus-actions corpus-actions-outside">
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openItemDialog">
        添加语料
      </v-btn>
      <v-btn icon="mdi-refresh" :loading="refreshing" variant="text" @click="loadAll" />
    </div>

    <div v-if="activeTab === 'sets'" class="corpus-actions corpus-actions-outside">
      <v-btn
        color="primary"
        prepend-icon="mdi-playlist-plus"
        @click="openSetDialog"
      >
        创建组合
      </v-btn>
      <v-btn icon="mdi-refresh" :loading="refreshing" variant="text" @click="loadAll" />
    </div>

    <v-window v-model="activeTab">
      <v-window-item value="items">
        <div class="work-panel pa-4">
          <div class="corpus-filter-grid">
            <v-text-field
              v-model="filters.search"
              clearable
              density="comfortable"
              label="搜索"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
            />
            <v-combobox
              v-model="filters.language"
              clearable
              density="comfortable"
              :items="languageItems"
              label="语言"
              prepend-inner-icon="mdi-translate"
              variant="outlined"
            />
            <v-combobox
              v-model="filters.scene"
              clearable
              density="comfortable"
              :items="sceneItems"
              label="场景"
              prepend-inner-icon="mdi-briefcase-outline"
              variant="outlined"
            />
            <v-combobox
              v-model="filters.emotion"
              clearable
              density="comfortable"
              :items="emotionItems"
              label="情绪"
              prepend-inner-icon="mdi-emoticon-outline"
              variant="outlined"
            />
            <v-select
              v-model="filters.lengthCategory"
              density="comfortable"
              :items="lengthFilterItems"
              label="长度"
              prepend-inner-icon="mdi-ruler-square"
              variant="outlined"
            />
            <v-select
              v-model="filters.ssmlEnabled"
              density="comfortable"
              :items="ssmlFilterItems"
              label="SSML"
              prepend-inner-icon="mdi-code-tags"
              variant="outlined"
            />
            <v-combobox
              v-model="filters.styleTags"
              chips
              clearable
              density="comfortable"
              :items="tagItems"
              label="标签"
              multiple
              prepend-inner-icon="mdi-tag-multiple-outline"
              variant="outlined"
            />
            <v-btn prepend-icon="mdi-filter-remove-outline" variant="tonal" @click="resetFilters">
              重置
            </v-btn>
          </div>

          <v-divider class="my-3" />

          <div class="corpus-list-toolbar">
            <span>{{ items.length }} 条</span>
          </div>

          <v-progress-linear v-if="loadingItems" class="my-3" color="primary" indeterminate />

          <div v-if="items.length === 0 && !loadingItems" class="corpus-empty-state">
            <v-icon color="primary" icon="mdi-text-box-search-outline" size="44" />
            <div class="corpus-empty-title">暂无语料</div>
          </div>

          <v-data-table
            v-else
            class="corpus-table"
            density="comfortable"
            :headers="itemHeaders"
            hide-default-footer
            hover
            item-value="corpusItemId"
            :items="items"
          >
            <template #item.title="{ item }">
              <button class="corpus-title-cell corpus-title-button" type="button" @click="openItemDetail(item)">
                <AutoScrollText :text="item.title" />
                <AutoScrollText :text="item.corpusItemId" mono />
              </button>
            </template>
            <template #item.text="{ item }">
              <AutoScrollText :text="item.text" />
            </template>
            <template #item.dimensions="{ item }">
              <div class="corpus-chip-list">
                <v-chip density="compact" size="small" variant="tonal">{{ item.language }}</v-chip>
                <v-chip v-if="item.scene" density="compact" size="small" variant="tonal">{{ item.scene }}</v-chip>
                <v-chip v-if="item.emotion" density="compact" size="small" variant="tonal">{{ item.emotion }}</v-chip>
                <v-chip density="compact" size="small" variant="tonal">
                  {{ corpusLengthCategoryLabel(item.lengthCategory) }}
                </v-chip>
              </div>
            </template>
            <template #item.styleTags="{ item }">
              <div class="corpus-chip-list">
                <v-chip v-for="tag in item.styleTags" :key="tag" density="compact" size="small">
                  {{ tag }}
                </v-chip>
              </div>
            </template>
            <template #item.ssml="{ item }">
              <v-chip :color="item.ssmlEnabled ? 'primary' : undefined" density="compact" size="small" variant="tonal">
                {{ corpusSsmlLabel(item) }}
              </v-chip>
            </template>
            <template #item.createdAt="{ item }">
              {{ formatLocalDateTime(item.createdAt) }}
            </template>
            <template #item.actions="{ item }">
              <div class="corpus-row-actions">
                <v-tooltip text="查看语料" location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      color="primary"
                      icon="mdi-eye-outline"
                      size="small"
                      variant="text"
                      @click="openItemDetail(item)"
                    />
                  </template>
                </v-tooltip>
                <v-tooltip text="编辑语料" location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      color="primary"
                      icon="mdi-pencil-outline"
                      size="small"
                      variant="text"
                      @click="openEditItemDialog(item)"
                    />
                  </template>
                </v-tooltip>
                <v-tooltip text="删除语料" location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      color="error"
                      icon="mdi-delete-outline"
                      :loading="deletingItemId === item.corpusItemId"
                      size="small"
                      variant="text"
                      @click="openDeleteItemDialog(item)"
                    />
                  </template>
                </v-tooltip>
              </div>
            </template>
          </v-data-table>
        </div>
      </v-window-item>

      <v-window-item value="sets">
        <div class="work-panel pa-4">
          <v-progress-linear v-if="setsLoading" class="mb-3" color="primary" indeterminate />

          <div v-if="sets.length === 0 && !setsLoading" class="corpus-empty-state">
            <v-icon color="primary" icon="mdi-folder-text-outline" size="44" />
            <div class="corpus-empty-title">暂无语料组合</div>
          </div>

          <v-data-table
            v-else
            class="corpus-table"
            density="comfortable"
            :headers="setHeaders"
            hide-default-footer
            hover
            item-value="corpusSetId"
            :items="sets"
          >
            <template #item.name="{ item }">
              <div class="corpus-title-cell">
                <AutoScrollText :text="item.name" />
                <AutoScrollText :text="item.corpusSetId" mono />
              </div>
            </template>
            <template #item.count="{ item }">
              {{ corpusSetItemCountLabel(item) }}
            </template>
            <template #item.source="{ item }">
              <v-chip density="compact" size="small" variant="tonal">
                {{ corpusSetSourceLabel(item) }}
              </v-chip>
            </template>
            <template #item.filters="{ item }">
              <div class="corpus-chip-list">
                <v-chip
                  v-for="chip in corpusFilterSnapshotChips(item.filtersSnapshot)"
                  :key="chip"
                  density="compact"
                  size="small"
                >
                  {{ chip }}
                </v-chip>
              </div>
            </template>
            <template #item.createdAt="{ item }">
              {{ formatLocalDateTime(item.createdAt) }}
            </template>
            <template #item.actions="{ item }">
              <v-tooltip text="查看组合" location="top">
                <template #activator="{ props }">
                  <v-btn
                    v-bind="props"
                    :loading="detailLoadingSetId === item.corpusSetId"
                    color="primary"
                    icon="mdi-eye-outline"
                    size="small"
                    variant="text"
                    @click="openSetDetail(item.corpusSetId)"
                  />
                </template>
              </v-tooltip>
            </template>
          </v-data-table>
        </div>
      </v-window-item>
    </v-window>

    <v-dialog v-model="itemDialog" max-width="920">
      <v-card>
        <v-card-title>{{ itemDialogTitle }}</v-card-title>
        <v-card-text>
          <div class="corpus-item-dialog-grid">
            <div>
              <v-text-field v-model="itemForm.title" label="标题" prepend-inner-icon="mdi-format-title" variant="outlined" />
              <v-textarea v-model="itemForm.text" auto-grow label="文本" rows="5" variant="outlined" />
              <v-row>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="itemForm.language"
                    label="语言"
                    prepend-inner-icon="mdi-translate"
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-select
                    v-model="itemForm.lengthCategory"
                    :items="lengthCreateItems"
                    label="长度"
                    prepend-inner-icon="mdi-ruler-square"
                    variant="outlined"
                  />
                </v-col>
              </v-row>
              <v-text-field
                v-model="itemForm.styleTagsText"
                label="标签"
                prepend-inner-icon="mdi-tag-multiple-outline"
                variant="outlined"
              />
            </div>
            <div>
              <v-row>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="itemForm.scene"
                    label="场景"
                    prepend-inner-icon="mdi-briefcase-outline"
                    variant="outlined"
                  />
                </v-col>
                <v-col cols="12" md="6">
                  <v-text-field
                    v-model="itemForm.emotion"
                    label="情绪"
                    prepend-inner-icon="mdi-emoticon-outline"
                    variant="outlined"
                  />
                </v-col>
              </v-row>
              <v-switch v-model="itemForm.ssmlEnabled" color="primary" inset label="SSML" />
              <v-textarea
                v-if="itemForm.ssmlEnabled"
                v-model="itemForm.ssml"
                auto-grow
                label="SSML"
                rows="5"
                variant="outlined"
              />
              <v-textarea v-model="itemForm.notes" auto-grow label="备注" rows="4" variant="outlined" />
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="itemDialog = false">取消</v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-content-save"
            :disabled="!canCreateItem"
            :loading="creatingItem"
            @click="submitItem"
          >
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="setDialog" max-width="720">
      <v-card>
        <v-card-title>创建语料组合</v-card-title>
        <v-card-text>
          <v-text-field v-model="setName" label="名称" prepend-inner-icon="mdi-folder-text-outline" variant="outlined" />
          <v-textarea v-model="setDescription" auto-grow label="描述" rows="3" variant="outlined" />
          <div class="corpus-set-filter-grid">
            <v-text-field
              v-model="setFilters.search"
              clearable
              density="comfortable"
              label="搜索"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
            />
            <v-combobox
              v-model="setFilters.language"
              clearable
              density="comfortable"
              :items="languageItems"
              label="语言"
              prepend-inner-icon="mdi-translate"
              variant="outlined"
            />
            <v-combobox
              v-model="setFilters.scene"
              clearable
              density="comfortable"
              :items="sceneItems"
              label="场景"
              prepend-inner-icon="mdi-briefcase-outline"
              variant="outlined"
            />
            <v-select
              v-model="setFilters.lengthCategory"
              density="comfortable"
              :items="lengthFilterItems"
              label="长度"
              prepend-inner-icon="mdi-ruler-square"
              variant="outlined"
            />
          </div>
          <div class="corpus-set-dialog-toolbar">
            <span>{{ setCandidateItems.length }} 条候选</span>
            <span>{{ setSelectedItemIds.length }} 已选</span>
            <v-btn size="small" prepend-icon="mdi-filter-remove-outline" variant="tonal" @click="resetSetFilters">
              重置筛选
            </v-btn>
          </div>
          <v-progress-linear v-if="setCandidatesLoading" class="mb-3" color="primary" indeterminate />
          <v-data-table
            class="corpus-set-picker-table"
            density="compact"
            :headers="setPickerHeaders"
            hide-default-footer
            hover
            item-value="corpusItemId"
            :items="setCandidateItems"
          >
            <template #header.selected>
              <v-checkbox-btn
                :indeterminate="someSetCandidatesSelected && !allSetCandidatesSelected"
                :model-value="allSetCandidatesSelected"
                @update:model-value="toggleAllSetCandidates($event === true)"
              />
            </template>
            <template #item.selected="{ item }">
              <v-checkbox-btn
                :model-value="setSelectedItemIds.includes(item.corpusItemId)"
                @update:model-value="toggleSetSelectedItem(item.corpusItemId, $event === true)"
              />
            </template>
            <template #item.title="{ item }">
              <AutoScrollText :text="item.title" />
            </template>
            <template #item.text="{ item }">
              <AutoScrollText :text="item.text" />
            </template>
          </v-data-table>
          <div class="corpus-set-preview">
            <span>条目数量</span>
            <strong>{{ setSelectedItemIds.length }}</strong>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="setDialog = false">取消</v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-content-save"
            :disabled="!canCreateSet"
            :loading="creatingSet"
            @click="submitSet"
          >
            创建
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="itemDetailDialog" max-width="760">
      <v-card>
        <v-card-title class="corpus-dialog-title">
          <span>{{ selectedItem?.title ?? "语料详情" }}</span>
          <v-btn icon="mdi-close" variant="text" @click="itemDetailDialog = false" />
        </v-card-title>
        <v-card-text>
          <div v-if="selectedItem" class="corpus-detail-stack">
            <div class="corpus-detail-text">{{ selectedItem.text }}</div>
            <div class="corpus-chip-list">
              <v-chip density="compact" size="small" variant="tonal">{{ selectedItem.language }}</v-chip>
              <v-chip v-if="selectedItem.scene" density="compact" size="small" variant="tonal">
                {{ selectedItem.scene }}
              </v-chip>
              <v-chip v-if="selectedItem.emotion" density="compact" size="small" variant="tonal">
                {{ selectedItem.emotion }}
              </v-chip>
              <v-chip density="compact" size="small" variant="tonal">
                {{ corpusLengthCategoryLabel(selectedItem.lengthCategory) }}
              </v-chip>
              <v-chip v-for="tag in selectedItem.styleTags" :key="tag" density="compact" size="small">
                {{ tag }}
              </v-chip>
            </div>
            <pre v-if="selectedItem.ssmlEnabled && selectedItem.ssml" class="corpus-code-block">{{ selectedItem.ssml }}</pre>
            <div v-if="selectedItem.notes" class="corpus-detail-notes">{{ selectedItem.notes }}</div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            v-if="selectedItem"
            color="primary"
            prepend-icon="mdi-pencil-outline"
            variant="tonal"
            @click="openEditItemDialog(selectedItem)"
          >
            编辑
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteItemDialog" max-width="520">
      <v-card>
        <v-card-title>删除语料</v-card-title>
        <v-card-text>
          {{ itemPendingDelete === undefined ? "确认删除这条语料？" : `确认删除“${itemPendingDelete.title}”？` }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteItemDialog = false">取消</v-btn>
          <v-btn
            color="error"
            prepend-icon="mdi-delete-outline"
            :loading="deletingItemId.length > 0"
            @click="submitDeleteItem"
          >
            删除
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="setDetailDialog" max-width="920">
      <v-card>
        <v-card-title class="corpus-dialog-title">
          <span>{{ selectedSet?.name ?? "语料组合" }}</span>
          <v-btn icon="mdi-close" variant="text" @click="setDetailDialog = false" />
        </v-card-title>
        <v-card-text>
          <v-alert v-if="selectedSetError" class="mb-4" type="error" variant="tonal">
            {{ selectedSetError }}
          </v-alert>
          <div v-if="selectedSet" class="corpus-detail-stack">
            <div class="corpus-chip-list">
              <v-chip
                v-for="chip in corpusFilterSnapshotChips(selectedSet.filtersSnapshot)"
                :key="chip"
                density="compact"
                size="small"
              >
                {{ chip }}
              </v-chip>
            </div>
            <v-data-table
              class="corpus-table"
              density="comfortable"
              :headers="setDetailHeaders"
              hide-default-footer
              hover
              item-value="corpusItemId"
              :items="selectedSet.items"
            >
              <template #item.title="{ item }">
                <AutoScrollText :text="item.title" />
              </template>
              <template #item.text="{ item }">
                <AutoScrollText :text="item.text" />
              </template>
              <template #item.lengthCategory="{ item }">
                {{ corpusLengthCategoryLabel(item.lengthCategory) }}
              </template>
            </v-data-table>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup lang="ts">
import type { CorpusItem, CorpusLengthCategory, CorpusSet, CorpusSetCreateRequest, CorpusSetExpanded, CorpusStats } from "@tts-platform/core";
import { computed, onMounted, ref, watch } from "vue";
import {
  createCorpusItem,
  createCorpusSet,
  deleteCorpusItem,
  getCorpusSet,
  getCorpusStats,
  listCorpusItems,
  listCorpusSets,
  updateCorpusItem
} from "../api/corpus";
import AutoScrollText from "../components/AutoScrollText.vue";
import { formatLocalDateTime } from "../utils/time";
import {
  corpusCreateRequestFromForm,
  corpusFacetItems,
  corpusFilterSnapshotChips,
  corpusFilterSnapshotFromForm,
  corpusLengthCategoryLabel,
  corpusQueryFromForm,
  corpusSetItemCountLabel,
  corpusSetSourceLabel,
  corpusSsmlLabel,
  corpusStatsMetricItems,
  corpusTagItems,
  emptyCorpusFilterForm,
  emptyCorpusItemForm,
  corpusItemFormFromItem
} from "./corpora-page";

type CorpusTab = "items" | "sets";

const activeTab = ref<CorpusTab>("items");
const filters = ref(emptyCorpusFilterForm());
const setFilters = ref(emptyCorpusFilterForm());
const itemForm = ref(emptyCorpusItemForm());
const items = ref<CorpusItem[]>([]);
const setCandidateItems = ref<CorpusItem[]>([]);
const sets = ref<CorpusSet[]>([]);
const stats = ref<CorpusStats | undefined>(undefined);
const setSelectedItemIds = ref<string[]>([]);
const loadingItems = ref(false);
const statsLoading = ref(false);
const setsLoading = ref(false);
const setCandidatesLoading = ref(false);
const creatingItem = ref(false);
const creatingSet = ref(false);
const itemDialog = ref(false);
const itemDetailDialog = ref(false);
const deleteItemDialog = ref(false);
const setDialog = ref(false);
const setDetailDialog = ref(false);
const setName = ref("");
const setDescription = ref("");
const editingItemId = ref("");
const selectedItem = ref<CorpusItem | undefined>(undefined);
const itemPendingDelete = ref<CorpusItem | undefined>(undefined);
const deletingItemId = ref("");
const selectedSet = ref<CorpusSetExpanded | undefined>(undefined);
const selectedSetError = ref("");
const detailLoadingSetId = ref("");
const error = ref("");
const success = ref("");

const itemHeaders = [
  { title: "标题", key: "title", sortable: true },
  { title: "文本", key: "text", sortable: false },
  { title: "维度", key: "dimensions", sortable: false },
  { title: "标签", key: "styleTags", sortable: false },
  { title: "SSML", key: "ssml", sortable: false },
  { title: "创建时间", key: "createdAt", sortable: true },
  { title: "操作", key: "actions", sortable: false, align: "center" as const }
];
const setHeaders = [
  { title: "组合", key: "name", sortable: true },
  { title: "数量", key: "count", sortable: false },
  { title: "来源", key: "source", sortable: false },
  { title: "筛选快照", key: "filters", sortable: false },
  { title: "创建时间", key: "createdAt", sortable: true },
  { title: "详情", key: "actions", sortable: false, align: "center" as const }
];
const setDetailHeaders = [
  { title: "标题", key: "title", sortable: true },
  { title: "文本", key: "text", sortable: false },
  { title: "语言", key: "language", sortable: true },
  { title: "场景", key: "scene", sortable: true },
  { title: "长度", key: "lengthCategory", sortable: true }
];
const setPickerHeaders = [
  { title: "", key: "selected", sortable: false, width: 52 },
  { title: "标题", key: "title", sortable: true },
  { title: "文本", key: "text", sortable: false },
  { title: "语言", key: "language", sortable: true },
  { title: "场景", key: "scene", sortable: true }
];
const lengthFilterItems: Array<{ title: string; value: CorpusLengthCategory | "" }> = [
  { title: "全部", value: "" },
  { title: "短", value: "short" },
  { title: "中", value: "medium" },
  { title: "长", value: "long" }
];
const lengthCreateItems: Array<{ title: string; value: CorpusLengthCategory | "" }> = [
  { title: "自动", value: "" },
  { title: "短", value: "short" },
  { title: "中", value: "medium" },
  { title: "长", value: "long" }
];
const ssmlFilterItems = [
  { title: "全部", value: "any" },
  { title: "已启用", value: "enabled" },
  { title: "未启用", value: "disabled" }
];

const refreshing = computed(() => loadingItems.value || statsLoading.value || setsLoading.value);
const metricItems = computed(() => corpusStatsMetricItems(stats.value));
const languageItems = computed(() => corpusFacetItems(items.value, "language"));
const sceneItems = computed(() => corpusFacetItems(items.value, "scene"));
const emotionItems = computed(() => corpusFacetItems(items.value, "emotion"));
const tagItems = computed(() => corpusTagItems(items.value));
const itemDialogTitle = computed(() => (editingItemId.value.length === 0 ? "添加语料" : "编辑语料"));
const allSetCandidatesSelected = computed(
  () =>
    setCandidateItems.value.length > 0 &&
    setCandidateItems.value.every((item) => setSelectedItemIds.value.includes(item.corpusItemId))
);
const someSetCandidatesSelected = computed(() =>
  setCandidateItems.value.some((item) => setSelectedItemIds.value.includes(item.corpusItemId))
);
const canCreateItem = computed(() => {
  return (
    itemForm.value.title.trim().length > 0 &&
    itemForm.value.text.trim().length > 0 &&
    itemForm.value.language.trim().length > 0 &&
    (!itemForm.value.ssmlEnabled || itemForm.value.ssml.trim().length > 0)
  );
});
const canCreateSet = computed(() => {
  return setName.value.trim().length > 0 && setSelectedItemIds.value.length > 0;
});

watch(
  filters,
  () => {
    void loadItemsAndStats();
  },
  {
    deep: true
  }
);

watch(
  setFilters,
  () => {
    if (setDialog.value) {
      void loadSetCandidates();
    }
  },
  {
    deep: true
  }
);

// loadAll: 无入参；功能是刷新语料条目、统计和语料组合列表。
async function loadAll() {
  clearMessages();
  await Promise.all([loadItemsAndStats(), loadSets()]);
}

// loadItemsAndStats: 无入参；功能是按当前筛选条件刷新语料条目和统计。
async function loadItemsAndStats() {
  loadingItems.value = true;
  statsLoading.value = true;
  error.value = "";
  try {
    const query = corpusQueryFromForm(filters.value);
    const [nextItems, nextStats] = await Promise.all([listCorpusItems(query), getCorpusStats(query)]);
    items.value = nextItems;
    stats.value = nextStats;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "加载语料失败。";
  } finally {
    loadingItems.value = false;
    statsLoading.value = false;
  }
}

// loadSets: 无入参；功能是刷新语料组合列表。
async function loadSets() {
  setsLoading.value = true;
  error.value = "";
  try {
    sets.value = await listCorpusSets();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "加载语料组合失败。";
  } finally {
    setsLoading.value = false;
  }
}

// loadSetCandidates: 无入参；功能是按创建组合弹窗内的筛选条件刷新候选语料。
async function loadSetCandidates() {
  setCandidatesLoading.value = true;
  error.value = "";
  try {
    setCandidateItems.value = await listCorpusItems(corpusQueryFromForm(setFilters.value));
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "加载组合候选语料失败。";
  } finally {
    setCandidatesLoading.value = false;
  }
}

// openItemDialog: 无入参；功能是打开新增语料弹窗并重置表单。
function openItemDialog() {
  clearMessages();
  editingItemId.value = "";
  itemForm.value = emptyCorpusItemForm();
  itemDialog.value = true;
}

// openEditItemDialog: 入参为语料条目；功能是打开编辑语料弹窗并填充现有字段。
function openEditItemDialog(item: CorpusItem) {
  clearMessages();
  selectedItem.value = item;
  editingItemId.value = item.corpusItemId;
  itemForm.value = corpusItemFormFromItem(item);
  itemDetailDialog.value = false;
  itemDialog.value = true;
}

// submitItem: 无入参；功能是提交新增或编辑语料并刷新语料库视图。
async function submitItem() {
  if (!canCreateItem.value) {
    return;
  }
  creatingItem.value = true;
  clearMessages();
  try {
    const request = corpusCreateRequestFromForm(itemForm.value);
    const item =
      editingItemId.value.length === 0
        ? await createCorpusItem(request)
        : await updateCorpusItem(editingItemId.value, request);
    itemDialog.value = false;
    await loadAll();
    success.value = editingItemId.value.length === 0 ? `语料已保存：${item.title}` : `语料已更新：${item.title}`;
    editingItemId.value = "";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "保存语料失败。";
  } finally {
    creatingItem.value = false;
  }
}

// resetFilters: 无入参；功能是清空语料筛选条件。
function resetFilters() {
  filters.value = emptyCorpusFilterForm();
}

// resetSetFilters: 无入参；功能是清空创建组合弹窗中的候选语料筛选条件。
function resetSetFilters() {
  setFilters.value = emptyCorpusFilterForm();
}

// toggleSetSelectedItem: 入参为语料 id 和选中状态；功能是维护组合创建弹窗内的已选语料。
function toggleSetSelectedItem(corpusItemId: string, selected: boolean) {
  const nextIds = new Set(setSelectedItemIds.value);
  if (selected) {
    nextIds.add(corpusItemId);
  } else {
    nextIds.delete(corpusItemId);
  }
  setSelectedItemIds.value = [...nextIds];
}

// toggleAllSetCandidates: 入参为是否选中当前候选列表；功能是批量维护组合弹窗内的已选语料。
function toggleAllSetCandidates(selected: boolean) {
  const nextIds = new Set(setSelectedItemIds.value);
  for (const item of setCandidateItems.value) {
    if (selected) {
      nextIds.add(item.corpusItemId);
    } else {
      nextIds.delete(item.corpusItemId);
    }
  }
  setSelectedItemIds.value = [...nextIds];
}

// openSetDialog: 无入参；功能是打开语料组合弹窗并加载可筛选候选语料。
function openSetDialog() {
  clearMessages();
  setName.value = "";
  setDescription.value = "";
  setFilters.value = emptyCorpusFilterForm();
  setSelectedItemIds.value = [];
  setCandidateItems.value = [];
  setDialog.value = true;
  void loadSetCandidates();
}

// submitSet: 无入参；功能是按显式勾选或当前筛选快照创建语料组合。
async function submitSet() {
  if (!canCreateSet.value) {
    return;
  }
  creatingSet.value = true;
  clearMessages();
  try {
    const set = await createCorpusSet(buildSetRequest());
    setDialog.value = false;
    activeTab.value = "sets";
    await Promise.all([loadSets(), loadItemsAndStats()]);
    success.value = `语料组合已创建：${set.name}`;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "创建语料组合失败。";
  } finally {
    creatingSet.value = false;
  }
}

// buildSetRequest: 无入参；功能是把创建组合弹窗内容转换为 API 请求。
function buildSetRequest(): CorpusSetCreateRequest {
  const snapshot = corpusFilterSnapshotFromForm(setFilters.value);
  const request: CorpusSetCreateRequest = {
    name: setName.value.trim(),
    corpusItemIds: setSelectedItemIds.value
  };
  if (setDescription.value.trim().length > 0) {
    request.description = setDescription.value.trim();
  }
  if (hasSnapshotFields(snapshot)) {
    request.filtersSnapshot = snapshot;
  }
  return request;
}

// openItemDetail: 入参为语料条目；功能是打开语料详情弹窗。
function openItemDetail(item: CorpusItem) {
  selectedItem.value = item;
  itemDetailDialog.value = true;
}

// openDeleteItemDialog: 入参为语料条目；功能是打开删除确认弹窗。
function openDeleteItemDialog(item: CorpusItem) {
  clearMessages();
  itemPendingDelete.value = item;
  deleteItemDialog.value = true;
}

// submitDeleteItem: 无入参；功能是删除未被语料组合引用的语料条目并刷新列表。
async function submitDeleteItem() {
  if (itemPendingDelete.value === undefined) {
    return;
  }
  deletingItemId.value = itemPendingDelete.value.corpusItemId;
  clearMessages();
  try {
    const item = await deleteCorpusItem(itemPendingDelete.value.corpusItemId);
    deleteItemDialog.value = false;
    itemPendingDelete.value = undefined;
    await loadAll();
    success.value = `语料已删除：${item.title}`;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "删除语料失败。";
  } finally {
    deletingItemId.value = "";
  }
}

// openSetDetail: 入参为语料组合 id；功能是加载并打开语料组合展开详情。
async function openSetDetail(corpusSetId: string) {
  detailLoadingSetId.value = corpusSetId;
  selectedSetError.value = "";
  selectedSet.value = undefined;
  try {
    selectedSet.value = await getCorpusSet(corpusSetId);
    setDetailDialog.value = true;
  } catch (caught) {
    selectedSetError.value = caught instanceof Error ? caught.message : "加载语料组合详情失败。";
    setDetailDialog.value = true;
  } finally {
    detailLoadingSetId.value = "";
  }
}

// clearMessages: 无入参；功能是清空顶部提示信息。
function clearMessages() {
  error.value = "";
  success.value = "";
}

// hasSnapshotFields: 入参为筛选快照；输出快照是否含有实际筛选字段。
function hasSnapshotFields(snapshot: ReturnType<typeof corpusFilterSnapshotFromForm>): boolean {
  return Object.keys(snapshot).length > 0;
}

onMounted(loadAll);
</script>

<style scoped>
.corpus-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.corpus-actions-outside {
  margin-bottom: 16px;
  justify-content: flex-end;
}

.corpus-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.corpus-metric {
  display: grid;
  gap: 4px;
  min-height: 72px;
  padding: 12px 14px;
  border: 1px solid #d9dee8;
  border-radius: 8px;
  background: #ffffff;
}

.corpus-metric span {
  color: #5b667a;
  font-size: 0.78rem;
}

.corpus-metric strong {
  color: #172033;
  font-size: 1.28rem;
  line-height: 1.1;
}

.corpus-filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  align-items: start;
}

.corpus-filter-grid > * {
  min-width: 0;
}

.corpus-filter-grid :deep(.v-input),
.corpus-filter-grid :deep(.v-field) {
  min-width: 0;
}

.corpus-list-toolbar {
  display: flex;
  gap: 14px;
  justify-content: flex-end;
  color: #5b667a;
  font-size: 0.86rem;
}

.corpus-table {
  min-width: 920px;
}

.corpus-table :deep(td) {
  vertical-align: middle;
}

.corpus-title-cell {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.corpus-title-button {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.corpus-title-button:hover {
  color: #155eef;
}

.corpus-row-actions {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.corpus-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.corpus-empty-state {
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

.corpus-empty-title {
  color: #172033;
  font-size: 1rem;
  font-weight: 700;
}

.corpus-item-dialog-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr);
  gap: 18px;
}

.corpus-set-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid #e4e8f0;
  border-radius: 8px;
  background: #fbfcff;
}

.corpus-set-filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.corpus-set-filter-grid > * {
  min-width: 0;
}

.corpus-set-filter-grid :deep(.v-input),
.corpus-set-filter-grid :deep(.v-field) {
  min-width: 0;
}

.corpus-set-dialog-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  color: #5b667a;
  font-size: 0.86rem;
}

.corpus-set-picker-table {
  max-height: 360px;
  overflow: auto;
  margin-bottom: 12px;
}

.corpus-set-picker-table :deep(td) {
  vertical-align: middle;
}

.corpus-dialog-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.corpus-detail-stack {
  display: grid;
  gap: 14px;
}

.corpus-detail-text,
.corpus-detail-notes {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.65;
}

.corpus-detail-text {
  color: #172033;
  font-size: 0.96rem;
}

.corpus-detail-notes {
  padding: 10px 12px;
  border: 1px solid #e4e8f0;
  border-radius: 8px;
  background: #fbfcff;
  color: #475467;
}

.corpus-code-block {
  max-height: 240px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border-radius: 8px;
  background: #121826;
  color: #d8e2ff;
  font-size: 0.84rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

@media (max-width: 980px) {
  .corpus-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .corpus-item-dialog-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .corpus-actions {
    justify-content: stretch;
  }

  .corpus-actions :deep(.v-btn) {
    flex: 1 1 140px;
  }

  .corpus-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
