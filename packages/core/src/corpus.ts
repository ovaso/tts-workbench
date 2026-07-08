// CorpusLengthCategory: 语料长度标签；用于 Benchmark 维度聚合和筛选。
export type CorpusLengthCategory = "short" | "medium" | "long";

// CorpusFilterSnapshot: 语料组合创建时的筛选条件快照；用于复现当时的语料选择来源。
export interface CorpusFilterSnapshot {
  language?: string;
  scene?: string;
  emotion?: string;
  lengthCategory?: CorpusLengthCategory;
  styleTags?: string[];
}

// CorpusItem: 单条语料记录；保留纯文本，并可选保存同一语料的 SSML 版本。
export interface CorpusItem {
  corpusItemId: string;
  title: string;
  text: string;
  language: string;
  scene?: string;
  emotion?: string;
  lengthCategory: CorpusLengthCategory;
  styleTags: string[];
  ssml?: string;
  ssmlEnabled: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// CorpusItemCreateRequest: 创建语料记录的输入契约；长度标签可由 API 根据文本自动补齐。
export interface CorpusItemCreateRequest {
  title: string;
  text: string;
  language: string;
  scene?: string;
  emotion?: string;
  lengthCategory?: CorpusLengthCategory;
  styleTags?: string[];
  ssml?: string;
  ssmlEnabled?: boolean;
  notes?: string;
}

// CorpusSet: 可复用语料组合；Benchmark plan 通过它引用一组语料。
export interface CorpusSet {
  corpusSetId: string;
  name: string;
  description?: string;
  corpusItemIds: string[];
  filtersSnapshot?: CorpusFilterSnapshot;
  createdAt: string;
  updatedAt: string;
}

// CorpusSetCreateRequest: 创建语料组合的输入契约；只保存语料 id，不复制语料正文。
export interface CorpusSetCreateRequest {
  name: string;
  description?: string;
  corpusItemIds: string[];
  filtersSnapshot?: CorpusFilterSnapshot;
}
