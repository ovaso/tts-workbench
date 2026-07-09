import type {
  CorpusFilterSnapshot,
  CorpusItem,
  CorpusItemCreateRequest,
  CorpusItemQuery,
  CorpusLengthCategory,
  CorpusSet,
  CorpusStats
} from "@tts-platform/core";

export type CorpusSsmlFilter = "any" | "enabled" | "disabled";

export interface CorpusFilterForm {
  search: string | null;
  language: string | null;
  scene: string | null;
  emotion: string | null;
  lengthCategory: CorpusLengthCategory | "";
  styleTags: string[] | null;
  ssmlEnabled: CorpusSsmlFilter;
}

export interface CorpusItemForm {
  title: string;
  text: string;
  language: string;
  scene: string;
  emotion: string;
  lengthCategory: CorpusLengthCategory | "";
  styleTagsText: string;
  ssmlEnabled: boolean;
  ssml: string;
  notes: string;
}

export interface CorpusMetricItem {
  title: string;
  value: string;
}

const lengthCategoryLabels: Record<CorpusLengthCategory, string> = {
  short: "短",
  medium: "中",
  long: "长"
};

// emptyCorpusFilterForm: 无入参；输出语料筛选表单的默认值。
export function emptyCorpusFilterForm(): CorpusFilterForm {
  return {
    search: "",
    language: "",
    scene: "",
    emotion: "",
    lengthCategory: "",
    styleTags: [],
    ssmlEnabled: "any"
  };
}

// emptyCorpusItemForm: 无入参；输出新增语料弹窗的默认表单值。
export function emptyCorpusItemForm(): CorpusItemForm {
  return {
    title: "",
    text: "",
    language: "zh-CN",
    scene: "",
    emotion: "",
    lengthCategory: "",
    styleTagsText: "",
    ssmlEnabled: false,
    ssml: "",
    notes: ""
  };
}

// corpusItemFormFromItem: 入参为语料条目；输出编辑弹窗可直接使用的表单值。
export function corpusItemFormFromItem(item: CorpusItem): CorpusItemForm {
  return {
    title: item.title,
    text: item.text,
    language: item.language,
    scene: item.scene ?? "",
    emotion: item.emotion ?? "",
    lengthCategory: item.lengthCategory,
    styleTagsText: item.styleTags.join(", "),
    ssmlEnabled: item.ssmlEnabled,
    ssml: item.ssml ?? "",
    notes: item.notes ?? ""
  };
}

// corpusQueryFromForm: 入参为筛选表单；输出 API 可使用的语料查询条件。
export function corpusQueryFromForm(form: CorpusFilterForm): CorpusItemQuery {
  const search = nonEmpty(form.search);
  const language = nonEmpty(form.language);
  const scene = nonEmpty(form.scene);
  const emotion = nonEmpty(form.emotion);
  const styleTags = form.styleTags === null ? [] : form.styleTags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  const ssmlEnabled = ssmlFilterToBoolean(form.ssmlEnabled);
  return {
    ...(search === undefined ? {} : { search }),
    ...(language === undefined ? {} : { language }),
    ...(scene === undefined ? {} : { scene }),
    ...(emotion === undefined ? {} : { emotion }),
    ...(form.lengthCategory === "" ? {} : { lengthCategory: form.lengthCategory }),
    ...(styleTags.length === 0 ? {} : { styleTags }),
    ...(ssmlEnabled === undefined ? {} : { ssmlEnabled })
  };
}

// corpusFilterSnapshotFromForm: 入参为筛选表单；输出可写入 CorpusSet 的筛选快照。
export function corpusFilterSnapshotFromForm(form: CorpusFilterForm): CorpusFilterSnapshot {
  return corpusQueryFromForm(form);
}

// corpusCreateRequestFromForm: 入参为新增语料表单；输出 API 创建语料请求。
export function corpusCreateRequestFromForm(form: CorpusItemForm): CorpusItemCreateRequest {
  const request: CorpusItemCreateRequest = {
    title: form.title.trim(),
    text: form.text.trim(),
    language: form.language.trim(),
    styleTags: splitCorpusTags(form.styleTagsText),
    ssmlEnabled: form.ssmlEnabled
  };
  appendOptionalString(request, "scene", form.scene);
  appendOptionalString(request, "emotion", form.emotion);
  appendOptionalString(request, "notes", form.notes);
  if (form.lengthCategory !== "") {
    request.lengthCategory = form.lengthCategory;
  }
  if (form.ssmlEnabled && form.ssml.trim().length > 0) {
    request.ssml = form.ssml.trim();
  }
  return request;
}

// splitCorpusTags: 入参为逗号、中文逗号、分号或换行分隔的标签文本；输出去重标签数组。
export function splitCorpusTags(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of value.split(/[,，;\n]/g)) {
    const tag = part.trim();
    if (tag.length === 0 || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

// corpusLengthCategoryLabel: 入参为长度标签；输出中文展示标签。
export function corpusLengthCategoryLabel(value: CorpusLengthCategory): string {
  return lengthCategoryLabels[value];
}

// corpusSsmlLabel: 入参为语料条目；输出 SSML 状态展示文本。
export function corpusSsmlLabel(item: CorpusItem): string {
  return item.ssmlEnabled && item.ssml !== undefined ? "已启用" : "未启用";
}

// corpusSetSourceLabel: 入参为语料组合；输出组合来源摘要。
export function corpusSetSourceLabel(set: CorpusSet): string {
  return set.filtersSnapshot === undefined ? "手动选择" : "筛选快照";
}

// corpusSetItemCountLabel: 入参为语料组合；输出组合条目数量文案。
export function corpusSetItemCountLabel(set: CorpusSet): string {
  return `${set.corpusItemIds.length} 条`;
}

// corpusFilterSnapshotChips: 入参为筛选快照；输出表格中展示的筛选摘要标签。
export function corpusFilterSnapshotChips(snapshot: CorpusFilterSnapshot | undefined): string[] {
  if (snapshot === undefined) {
    return [];
  }
  return [
    ...(snapshot.search === undefined ? [] : [`搜索 ${snapshot.search}`]),
    ...(snapshot.language === undefined ? [] : [`语言 ${snapshot.language}`]),
    ...(snapshot.scene === undefined ? [] : [`场景 ${snapshot.scene}`]),
    ...(snapshot.emotion === undefined ? [] : [`情绪 ${snapshot.emotion}`]),
    ...(snapshot.lengthCategory === undefined ? [] : [`长度 ${corpusLengthCategoryLabel(snapshot.lengthCategory)}`]),
    ...(snapshot.styleTags === undefined ? [] : snapshot.styleTags.map((tag) => `标签 ${tag}`)),
    ...(snapshot.ssmlEnabled === undefined ? [] : [`SSML ${snapshot.ssmlEnabled ? "已启用" : "未启用"}`])
  ];
}

// corpusStatsMetricItems: 入参为语料统计；输出顶部统计条目。
export function corpusStatsMetricItems(stats: CorpusStats | undefined): CorpusMetricItem[] {
  return [
    {
      title: "语料",
      value: String(stats?.itemCount ?? 0)
    },
    {
      title: "组合",
      value: String(stats?.setCount ?? 0)
    },
    {
      title: "SSML",
      value: String(stats?.ssmlEnabledCount ?? 0)
    },
    {
      title: "语言",
      value: String(stats?.byLanguage.length ?? 0)
    }
  ];
}

// corpusFacetItems: 入参为语料列表和字段名；输出表单候选项，避免页面重复维护枚举。
export function corpusFacetItems(items: CorpusItem[], field: "language" | "scene" | "emotion"): string[] {
  const values = new Set<string>();
  for (const item of items) {
    const value = item[field];
    if (value !== undefined && value.length > 0) {
      values.add(value);
    }
  }
  return [...values].sort((left, right) => left.localeCompare(right));
}

// corpusTagItems: 入参为语料列表；输出已存在的标签候选项。
export function corpusTagItems(items: CorpusItem[]): string[] {
  return [...new Set(items.flatMap((item) => item.styleTags))].sort((left, right) => left.localeCompare(right));
}

// ssmlFilterToBoolean: 入参为 UI 的 SSML 筛选值；输出 API 使用的布尔筛选值。
function ssmlFilterToBoolean(value: CorpusSsmlFilter): boolean | undefined {
  if (value === "enabled") {
    return true;
  }
  if (value === "disabled") {
    return false;
  }
  return undefined;
}

// appendOptionalString: 入参为创建请求、字段名和值；功能是只写入非空字符串字段。
function appendOptionalString(
  request: CorpusItemCreateRequest,
  field: "scene" | "emotion" | "notes",
  value: string
): void {
  const normalized = value.trim();
  if (normalized.length > 0) {
    request[field] = normalized;
  }
}

// nonEmpty: 入参为可空字符串；输出 trim 后的非空字符串。
function nonEmpty(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}
