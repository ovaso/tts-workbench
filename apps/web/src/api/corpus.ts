import type {
  CorpusItem,
  CorpusItemCreateRequest,
  CorpusItemQuery,
  CorpusItemUpdateRequest,
  CorpusSet,
  CorpusSetCreateRequest,
  CorpusSetExpanded,
  CorpusStats
} from "@tts-platform/core";
import { requestJson } from "./client";

// listCorpusItems: 入参为可选语料查询条件；功能是读取筛选后的语料条目列表。
export async function listCorpusItems(query: CorpusItemQuery = {}): Promise<CorpusItem[]> {
  const response = await requestJson<{ items: CorpusItem[] }>(`/v1/corpus-items${corpusSearch(query)}`);
  return response.items;
}

// createCorpusItem: 入参为语料创建请求；功能是保存一条新的语料条目。
export async function createCorpusItem(request: CorpusItemCreateRequest): Promise<CorpusItem> {
  const response = await requestJson<{ item: CorpusItem }>("/v1/corpus-items", {
    method: "POST",
    json: request
  });
  return response.item;
}

// getCorpusItem: 入参为语料 id；功能是读取单条语料详情。
export async function getCorpusItem(corpusItemId: string): Promise<CorpusItem> {
  return requestJson<CorpusItem>(`/v1/corpus-items/${encodeURIComponent(corpusItemId)}`);
}

// updateCorpusItem: 入参为语料 id 和更新请求；功能是保存语料条目的编辑结果。
export async function updateCorpusItem(corpusItemId: string, request: CorpusItemUpdateRequest): Promise<CorpusItem> {
  const response = await requestJson<{ item: CorpusItem }>(`/v1/corpus-items/${encodeURIComponent(corpusItemId)}`, {
    method: "PATCH",
    json: request
  });
  return response.item;
}

// deleteCorpusItem: 入参为语料 id；功能是删除未被语料组合引用的语料条目。
export async function deleteCorpusItem(corpusItemId: string): Promise<CorpusItem> {
  const response = await requestJson<{ item: CorpusItem }>(`/v1/corpus-items/${encodeURIComponent(corpusItemId)}`, {
    method: "DELETE"
  });
  return response.item;
}

// getCorpusStats: 入参为可选语料查询条件；功能是读取语料库聚合统计。
export async function getCorpusStats(query: CorpusItemQuery = {}): Promise<CorpusStats> {
  const response = await requestJson<{ stats: CorpusStats }>(`/v1/corpus-stats${corpusSearch(query)}`);
  return response.stats;
}

// listCorpusSets: 无入参；功能是读取已保存的语料组合列表。
export async function listCorpusSets(): Promise<CorpusSet[]> {
  const response = await requestJson<{ sets: CorpusSet[] }>("/v1/corpus-sets");
  return response.sets;
}

// getCorpusSet: 入参为语料组合 id；功能是读取展开后的语料组合详情。
export async function getCorpusSet(corpusSetId: string): Promise<CorpusSetExpanded> {
  return requestJson<CorpusSetExpanded>(`/v1/corpus-sets/${encodeURIComponent(corpusSetId)}`);
}

// createCorpusSet: 入参为语料组合创建请求；功能是按显式条目或筛选快照保存语料组合。
export async function createCorpusSet(request: CorpusSetCreateRequest): Promise<CorpusSet> {
  const response = await requestJson<{ set: CorpusSet }>("/v1/corpus-sets", {
    method: "POST",
    json: request
  });
  return response.set;
}

// corpusSearch: 入参为语料查询条件；输出可拼接到 API path 的 query string。
function corpusSearch(query: CorpusItemQuery): string {
  const params = new URLSearchParams();
  appendString(params, "search", query.search);
  appendString(params, "language", query.language);
  appendString(params, "scene", query.scene);
  appendString(params, "emotion", query.emotion);
  appendString(params, "lengthCategory", query.lengthCategory);
  appendString(params, "styleTags", query.styleTags?.join(","));
  if (query.ssmlEnabled !== undefined) {
    params.set("ssmlEnabled", String(query.ssmlEnabled));
  }
  return params.size === 0 ? "" : `?${params.toString()}`;
}

// appendString: 入参为 URLSearchParams、字段名和值；功能是追加非空字符串查询参数。
function appendString(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined && value.trim().length > 0) {
    params.set(key, value.trim());
  }
}
