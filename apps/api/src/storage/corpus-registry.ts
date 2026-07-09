import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  TTSError,
  type CorpusFilterSnapshot,
  type CorpusItem,
  type CorpusItemCreateRequest,
  type CorpusItemQuery,
  type CorpusItemUpdateRequest,
  type CorpusLengthCategory,
  type CorpusSet,
  type CorpusSetCreateRequest,
  type CorpusSetExpanded,
  type CorpusStats,
  type CorpusValueCount
} from "@tts-platform/core";
import { datasetsRoot, defaultDataRoot } from "./paths";

export class FileCorpusRegistry {
  private readonly items = new Map<string, CorpusItem>();
  private readonly sets = new Map<string, CorpusSet>();
  private readonly itemFilePath: string;
  private readonly setFilePath: string;

  // constructor: 入参为可选 data root；功能是加载本地语料和语料组合 registry。
  constructor(dataRoot = defaultDataRoot()) {
    const root = datasetsRoot(dataRoot);
    this.itemFilePath = path.join(root, "corpus-items.json");
    this.setFilePath = path.join(root, "corpus-sets.json");
    this.load();
  }

  // listItems: 入参为可选查询条件；输出按创建时间倒序排列且命中筛选的语料记录。
  listItems(query: CorpusItemQuery = {}): CorpusItem[] {
    const normalizedQuery = normalizeItemQuery(query);
    return [...this.items.values()]
      .filter((item) => matchesItemQuery(item, normalizedQuery))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  // getItem: 入参为语料 id；输出对应语料，缺失时返回 undefined。
  getItem(corpusItemId: string): CorpusItem | undefined {
    return this.items.get(corpusItemId);
  }

  // stats: 入参为可选查询条件；输出命中语料的多维度聚合统计。
  stats(query: CorpusItemQuery = {}): CorpusStats {
    const items = this.listItems(query);
    return {
      itemCount: items.length,
      setCount: this.sets.size,
      ssmlEnabledCount: items.filter((item) => item.ssmlEnabled).length,
      byLanguage: countValues(items, (item) => item.language),
      byScene: countValues(items, (item) => item.scene),
      byEmotion: countValues(items, (item) => item.emotion),
      byLengthCategory: countValues(items, (item) => item.lengthCategory, ["short", "medium", "long"]),
      byStyleTag: countValues(
        items.flatMap((item) => item.styleTags),
        (tag) => tag
      )
    };
  }

  // saveItem: 入参为语料创建请求；输出补齐 id 和时间戳后的语料记录。
  saveItem(request: CorpusItemCreateRequest): CorpusItem {
    const now = new Date().toISOString();
    const item: CorpusItem = {
      corpusItemId: createCorpusId("corpus_item"),
      title: request.title,
      text: request.text,
      language: request.language,
      lengthCategory: request.lengthCategory ?? inferLengthCategory(request.text),
      styleTags: normalizeTags(request.styleTags),
      ssmlEnabled: request.ssmlEnabled ?? request.ssml !== undefined,
      createdAt: now,
      updatedAt: now,
      ...(request.scene === undefined ? {} : { scene: request.scene }),
      ...(request.emotion === undefined ? {} : { emotion: request.emotion }),
      ...(request.ssml === undefined ? {} : { ssml: request.ssml }),
      ...(request.notes === undefined ? {} : { notes: request.notes })
    };

    this.items.set(item.corpusItemId, item);
    this.persistItems();
    return item;
  }

  // updateItem: 入参为语料 id 和更新请求；输出更新后的语料记录，缺失时抛出 404。
  updateItem(corpusItemId: string, request: CorpusItemUpdateRequest): CorpusItem {
    const current = this.items.get(corpusItemId);
    if (current === undefined) {
      throw new TTSError(`Corpus item '${corpusItemId}' was not found.`, "invalid_request", 404);
    }

    const text = request.text ?? current.text;
    const ssml = resolveOptionalTextField(current.ssml, request.ssml);
    const ssmlEnabled = request.ssmlEnabled ?? current.ssmlEnabled;
    if (ssmlEnabled && ssml === undefined) {
      throw new TTSError("ssml is required when ssmlEnabled is true.", "invalid_request", 400);
    }

    const updated: CorpusItem = {
      corpusItemId: current.corpusItemId,
      title: request.title ?? current.title,
      text,
      language: request.language ?? current.language,
      lengthCategory: request.lengthCategory ?? current.lengthCategory,
      styleTags: request.styleTags === undefined ? current.styleTags : normalizeTags(request.styleTags),
      ssmlEnabled,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      ...optionalTextField("scene", resolveOptionalTextField(current.scene, request.scene)),
      ...optionalTextField("emotion", resolveOptionalTextField(current.emotion, request.emotion)),
      ...optionalTextField("ssml", ssmlEnabled ? ssml : undefined),
      ...optionalTextField("notes", resolveOptionalTextField(current.notes, request.notes))
    };

    this.items.set(corpusItemId, updated);
    this.persistItems();
    return updated;
  }

  // deleteItem: 入参为语料 id；输出被删除的语料记录，被组合引用时拒绝删除。
  deleteItem(corpusItemId: string): CorpusItem {
    const item = this.items.get(corpusItemId);
    if (item === undefined) {
      throw new TTSError(`Corpus item '${corpusItemId}' was not found.`, "invalid_request", 404);
    }
    const referencingSets = this.listSets().filter((set) => set.corpusItemIds.includes(corpusItemId));
    if (referencingSets.length > 0) {
      throw new TTSError("Corpus item is referenced by corpus sets.", "invalid_request", 409, {
        corpusSetIds: referencingSets.map((set) => set.corpusSetId)
      });
    }

    this.items.delete(corpusItemId);
    this.persistItems();
    return item;
  }

  // listSets: 无入参；输出按创建时间倒序排列的语料组合。
  listSets(): CorpusSet[] {
    return [...this.sets.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  // getSet: 入参为语料组合 id；输出对应语料组合，缺失时返回 undefined。
  getSet(corpusSetId: string): CorpusSet | undefined {
    return this.sets.get(corpusSetId);
  }

  // getExpandedSet: 入参为语料组合 id；输出组合及其当前可解析的语料条目。
  getExpandedSet(corpusSetId: string): CorpusSetExpanded | undefined {
    const set = this.sets.get(corpusSetId);
    if (set === undefined) {
      return undefined;
    }
    return {
      ...set,
      items: set.corpusItemIds.flatMap((corpusItemId) => {
        const item = this.items.get(corpusItemId);
        return item === undefined ? [] : [item];
      })
    };
  }

  // saveSet: 入参为语料组合创建请求；输出补齐 id 和时间戳后的语料组合。
  saveSet(request: CorpusSetCreateRequest): CorpusSet {
    const filtersSnapshot =
      request.filtersSnapshot === undefined ? undefined : normalizeFilterSnapshot(request.filtersSnapshot);
    const explicitItemIds = uniqueStrings(request.corpusItemIds ?? []);
    const corpusItemIds =
      explicitItemIds.length > 0
        ? explicitItemIds
        : filtersSnapshot === undefined
          ? []
          : this.listItems(filtersSnapshot).map((item) => item.corpusItemId);
    if (corpusItemIds.length === 0) {
      throw new TTSError("corpusItemIds must contain at least one item.", "invalid_request", 400);
    }
    for (const corpusItemId of corpusItemIds) {
      if (!this.items.has(corpusItemId)) {
        throw new TTSError(`Corpus item '${corpusItemId}' was not found.`, "invalid_request", 404);
      }
    }

    const now = new Date().toISOString();
    const set: CorpusSet = {
      corpusSetId: createCorpusId("corpus_set"),
      name: request.name,
      corpusItemIds,
      createdAt: now,
      updatedAt: now,
      ...(request.description === undefined ? {} : { description: request.description }),
      ...(filtersSnapshot === undefined ? {} : { filtersSnapshot })
    };

    this.sets.set(set.corpusSetId, set);
    this.persistSets();
    return set;
  }

  // load: 无入参；功能是从本地 JSON 文件恢复语料和语料组合。
  private load(): void {
    if (existsSync(this.itemFilePath)) {
      const raw = JSON.parse(readFileSync(this.itemFilePath, "utf8")) as { items?: CorpusItem[] };
      for (const item of raw.items ?? []) {
        this.items.set(item.corpusItemId, item);
      }
    }
    if (existsSync(this.setFilePath)) {
      const raw = JSON.parse(readFileSync(this.setFilePath, "utf8")) as { sets?: CorpusSet[] };
      for (const set of raw.sets ?? []) {
        this.sets.set(set.corpusSetId, set);
      }
    }
  }

  // persistItems: 无入参；功能是把语料记录写回本地文件系统。
  private persistItems(): void {
    mkdirSync(path.dirname(this.itemFilePath), { recursive: true });
    writeFileSync(this.itemFilePath, `${JSON.stringify({ items: this.listItems() }, null, 2)}\n`);
  }

  // persistSets: 无入参；功能是把语料组合写回本地文件系统。
  private persistSets(): void {
    mkdirSync(path.dirname(this.setFilePath), { recursive: true });
    writeFileSync(this.setFilePath, `${JSON.stringify({ sets: this.listSets() }, null, 2)}\n`);
  }
}

// createCorpusId: 入参为 id 前缀；输出带时间戳和随机后缀的本地语料 id。
function createCorpusId(prefix: "corpus_item" | "corpus_set", now = new Date()): string {
  const timestamp = now.toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}_${timestamp}_${randomUUID().slice(0, 8)}`;
}

// inferLengthCategory: 入参为语料文本；输出第一阶段的自动长度标签。
export function inferLengthCategory(text: string): CorpusLengthCategory {
  const length = [...text].length;
  if (length <= 80) {
    return "short";
  }
  if (length <= 300) {
    return "medium";
  }
  return "long";
}

// normalizeTags: 入参为可选标签数组；输出去空白、去重后的标签数组。
function normalizeTags(tags: string[] | undefined): string[] {
  return uniqueStrings(tags ?? []);
}

// normalizeFilterSnapshot: 入参为筛选条件快照；输出去除空白标签后的快照。
function normalizeFilterSnapshot(snapshot: CorpusFilterSnapshot): CorpusFilterSnapshot {
  const query = normalizeItemQuery(snapshot);
  return {
    ...(query.search === undefined ? {} : { search: query.search }),
    ...(query.language === undefined ? {} : { language: query.language }),
    ...(query.scene === undefined ? {} : { scene: query.scene }),
    ...(query.emotion === undefined ? {} : { emotion: query.emotion }),
    ...(query.lengthCategory === undefined ? {} : { lengthCategory: query.lengthCategory }),
    ...(query.styleTags === undefined ? {} : { styleTags: query.styleTags }),
    ...(query.ssmlEnabled === undefined ? {} : { ssmlEnabled: query.ssmlEnabled })
  };
}

// resolveOptionalTextField: 入参为当前值和可选更新值；输出保留、更新或清空后的字段值。
function resolveOptionalTextField(current: string | undefined, next: string | undefined): string | undefined {
  if (next === undefined) {
    return current;
  }
  const normalized = next.trim();
  return normalized.length === 0 ? undefined : normalized;
}

// optionalTextField: 入参为字段名和值；输出仅包含非空文本字段的局部对象。
function optionalTextField<TKey extends "scene" | "emotion" | "ssml" | "notes">(
  key: TKey,
  value: string | undefined
): Partial<Record<TKey, string>> {
  return value === undefined ? {} : { [key]: value } as Partial<Record<TKey, string>>;
}

// normalizeItemQuery: 入参为语料查询条件；输出去空白、去空数组后的标准查询对象。
function normalizeItemQuery(query: CorpusItemQuery): CorpusItemQuery {
  const styleTags = normalizeTags(query.styleTags);
  return {
    ...(query.search === undefined || query.search.trim().length === 0 ? {} : { search: query.search.trim() }),
    ...(query.language === undefined || query.language.trim().length === 0 ? {} : { language: query.language.trim() }),
    ...(query.scene === undefined || query.scene.trim().length === 0 ? {} : { scene: query.scene.trim() }),
    ...(query.emotion === undefined || query.emotion.trim().length === 0 ? {} : { emotion: query.emotion.trim() }),
    ...(query.lengthCategory === undefined ? {} : { lengthCategory: query.lengthCategory }),
    ...(styleTags.length === 0 ? {} : { styleTags }),
    ...(query.ssmlEnabled === undefined ? {} : { ssmlEnabled: query.ssmlEnabled })
  };
}

// matchesItemQuery: 入参为语料记录和查询条件；输出该记录是否满足所有筛选条件。
function matchesItemQuery(item: CorpusItem, query: CorpusItemQuery): boolean {
  if (query.search !== undefined && !matchesSearch(item, query.search)) {
    return false;
  }
  if (query.language !== undefined && !equalsFacet(item.language, query.language)) {
    return false;
  }
  if (query.scene !== undefined && !equalsFacet(item.scene, query.scene)) {
    return false;
  }
  if (query.emotion !== undefined && !equalsFacet(item.emotion, query.emotion)) {
    return false;
  }
  if (query.lengthCategory !== undefined && item.lengthCategory !== query.lengthCategory) {
    return false;
  }
  if (query.ssmlEnabled !== undefined && item.ssmlEnabled !== query.ssmlEnabled) {
    return false;
  }
  if (query.styleTags !== undefined && !containsAllTags(item.styleTags, query.styleTags)) {
    return false;
  }
  return true;
}

// matchesSearch: 入参为语料记录和搜索词；输出搜索词是否命中标题、正文、备注或标签。
function matchesSearch(item: CorpusItem, search: string): boolean {
  const needle = search.toLocaleLowerCase();
  return [item.title, item.text, item.notes ?? "", ...item.styleTags].some((value) =>
    value.toLocaleLowerCase().includes(needle)
  );
}

// equalsFacet: 入参为语料维度值和查询值；输出大小写不敏感的相等判断结果。
function equalsFacet(value: string | undefined, expected: string): boolean {
  return value !== undefined && value.toLocaleLowerCase() === expected.toLocaleLowerCase();
}

// containsAllTags: 入参为语料标签和查询标签；输出语料是否包含全部查询标签。
function containsAllTags(itemTags: string[], expectedTags: string[]): boolean {
  const normalizedItemTags = new Set(itemTags.map((tag) => tag.toLocaleLowerCase()));
  return expectedTags.every((tag) => normalizedItemTags.has(tag.toLocaleLowerCase()));
}

// countValues: 入参为数据列表、取值函数和可选排序顺序；输出非空值的计数列表。
function countValues<TItem, TValue extends string>(
  items: TItem[],
  pickValue: (item: TItem) => TValue | undefined,
  order?: TValue[]
): Array<CorpusValueCount<TValue>> {
  const counts = new Map<TValue, number>();
  for (const item of items) {
    const value = pickValue(item);
    if (value === undefined || value.length === 0) {
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const values = [...counts.entries()].map(([value, count]) => ({ value, count }));
  if (order !== undefined) {
    return values.sort((left, right) => order.indexOf(left.value) - order.indexOf(right.value));
  }
  return values.sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

// uniqueStrings: 入参为字符串数组；输出 trim 后保持首次出现顺序的唯一字符串数组。
function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
