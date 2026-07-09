// CorpusLengthCategory: 语料长度标签；用于 Benchmark 维度聚合和筛选。
export type CorpusLengthCategory = "short" | "medium" | "long";

// CorpusFilterSnapshot: 语料组合创建时的筛选条件快照；用于复现当时的语料选择来源。
export interface CorpusFilterSnapshot {
  search?: string;
  language?: string;
  scene?: string;
  emotion?: string;
  lengthCategory?: CorpusLengthCategory;
  styleTags?: string[];
  ssmlEnabled?: boolean;
}

// CorpusItemQuery: 语料条目查询条件；用于 API、前端筛选和按筛选生成语料组合。
export interface CorpusItemQuery extends CorpusFilterSnapshot {}

// CorpusValueCount: 语料统计中的单个维度计数；value 为维度值，count 为命中条数。
export interface CorpusValueCount<TValue extends string = string> {
  value: TValue;
  count: number;
}

// CorpusStats: 语料库聚合统计；用于控制台展示和后续 Benchmark 维度检查。
export interface CorpusStats {
  itemCount: number;
  setCount: number;
  ssmlEnabledCount: number;
  byLanguage: Array<CorpusValueCount<string>>;
  byScene: Array<CorpusValueCount<string>>;
  byEmotion: Array<CorpusValueCount<string>>;
  byLengthCategory: Array<CorpusValueCount<CorpusLengthCategory>>;
  byStyleTag: Array<CorpusValueCount<string>>;
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

// CorpusItemUpdateRequest: 更新语料记录的输入契约；未传字段保持原值，传空值的可选字段会被清除。
export interface CorpusItemUpdateRequest {
  title?: string;
  text?: string;
  language?: string;
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

// CorpusSetExpanded: 展开后的语料组合；用于详情页或 API 审计时查看组合内实际语料。
export interface CorpusSetExpanded extends CorpusSet {
  items: CorpusItem[];
}

// CorpusSetCreateRequest: 创建语料组合的输入契约；只保存语料 id，不复制语料正文。
export interface CorpusSetCreateRequest {
  name: string;
  description?: string;
  corpusItemIds?: string[];
  filtersSnapshot?: CorpusFilterSnapshot;
}
