import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  TTSError,
  type CorpusFilterSnapshot,
  type CorpusItem,
  type CorpusItemCreateRequest,
  type CorpusLengthCategory,
  type CorpusSet,
  type CorpusSetCreateRequest
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

  // listItems: 无入参；输出按创建时间倒序排列的语料记录。
  listItems(): CorpusItem[] {
    return [...this.items.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  // getItem: 入参为语料 id；输出对应语料，缺失时返回 undefined。
  getItem(corpusItemId: string): CorpusItem | undefined {
    return this.items.get(corpusItemId);
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

  // listSets: 无入参；输出按创建时间倒序排列的语料组合。
  listSets(): CorpusSet[] {
    return [...this.sets.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  // getSet: 入参为语料组合 id；输出对应语料组合，缺失时返回 undefined。
  getSet(corpusSetId: string): CorpusSet | undefined {
    return this.sets.get(corpusSetId);
  }

  // saveSet: 入参为语料组合创建请求；输出补齐 id 和时间戳后的语料组合。
  saveSet(request: CorpusSetCreateRequest): CorpusSet {
    const corpusItemIds = uniqueStrings(request.corpusItemIds);
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
      ...(request.filtersSnapshot === undefined ? {} : { filtersSnapshot: normalizeFilterSnapshot(request.filtersSnapshot) })
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
  return {
    ...(snapshot.language === undefined ? {} : { language: snapshot.language }),
    ...(snapshot.scene === undefined ? {} : { scene: snapshot.scene }),
    ...(snapshot.emotion === undefined ? {} : { emotion: snapshot.emotion }),
    ...(snapshot.lengthCategory === undefined ? {} : { lengthCategory: snapshot.lengthCategory }),
    ...(snapshot.styleTags === undefined ? {} : { styleTags: normalizeTags(snapshot.styleTags) })
  };
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
