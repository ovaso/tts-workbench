import {
  TTSError,
  type CorpusFilterSnapshot,
  type CorpusItemCreateRequest,
  type CorpusItemQuery,
  type CorpusItemUpdateRequest,
  type CorpusLengthCategory,
  type CorpusSetCreateRequest
} from "@tts-platform/core";
import type { FastifyInstance } from "fastify";
import type { FileCorpusRegistry } from "../storage/corpus-registry";

// registerCorpusRoutes: 入参为 Fastify 实例和语料 registry；功能是注册语料与语料组合 HTTP API。
export async function registerCorpusRoutes(app: FastifyInstance, corpus: FileCorpusRegistry): Promise<void> {
  app.get("/v1/corpus-items", async (request) => {
    return {
      items: corpus.listItems(parseCorpusItemQuery(request.query))
    };
  });

  app.post("/v1/corpus-items", async (request, reply) => {
    const item = corpus.saveItem(parseCorpusItemCreateRequest(request.body));
    return reply.status(201).send({ item });
  });

  app.get("/v1/corpus-items/:corpusItemId", async (request) => {
    const params = requireObject(request.params, "route params");
    const item = corpus.getItem(requireTrimmedString(params.corpusItemId, "corpusItemId"));
    if (item === undefined) {
      throw new TTSError("Corpus item was not found.", "invalid_request", 404);
    }
    return item;
  });

  app.patch("/v1/corpus-items/:corpusItemId", async (request) => {
    const params = requireObject(request.params, "route params");
    const item = corpus.updateItem(
      requireTrimmedString(params.corpusItemId, "corpusItemId"),
      parseCorpusItemUpdateRequest(request.body)
    );
    return { item };
  });

  app.delete("/v1/corpus-items/:corpusItemId", async (request) => {
    const params = requireObject(request.params, "route params");
    const item = corpus.deleteItem(requireTrimmedString(params.corpusItemId, "corpusItemId"));
    return { item };
  });

  app.get("/v1/corpus-stats", async (request) => {
    return {
      stats: corpus.stats(parseCorpusItemQuery(request.query))
    };
  });

  app.get("/v1/corpus-sets", async () => {
    return {
      sets: corpus.listSets()
    };
  });

  app.get("/v1/corpus-sets/:corpusSetId", async (request) => {
    const params = requireObject(request.params, "route params");
    const set = corpus.getExpandedSet(requireTrimmedString(params.corpusSetId, "corpusSetId"));
    if (set === undefined) {
      throw new TTSError("Corpus set was not found.", "invalid_request", 404);
    }
    return set;
  });

  app.post("/v1/corpus-sets", async (request, reply) => {
    const set = corpus.saveSet(parseCorpusSetCreateRequest(request.body));
    return reply.status(201).send({ set });
  });
}

// parseCorpusItemCreateRequest: 入参为 HTTP body；输出可保存的语料创建请求。
function parseCorpusItemCreateRequest(body: unknown): CorpusItemCreateRequest {
  const input = requireObject(body, "request body");
  const request: CorpusItemCreateRequest = {
    title: requireTrimmedString(input.title, "title"),
    text: requireTrimmedString(input.text, "text"),
    language: requireTrimmedString(input.language, "language")
  };
  if (typeof input.scene === "string" && input.scene.trim().length > 0) {
    request.scene = input.scene.trim();
  }
  if (typeof input.emotion === "string" && input.emotion.trim().length > 0) {
    request.emotion = input.emotion.trim();
  }
  if (input.lengthCategory !== undefined) {
    request.lengthCategory = parseLengthCategory(input.lengthCategory, "lengthCategory");
  }
  if (input.styleTags !== undefined) {
    request.styleTags = parseStringList(input.styleTags, "styleTags");
  }
  if (typeof input.ssml === "string" && input.ssml.trim().length > 0) {
    request.ssml = input.ssml.trim();
  }
  if (typeof input.ssmlEnabled === "boolean") {
    request.ssmlEnabled = input.ssmlEnabled;
  }
  if (typeof input.notes === "string" && input.notes.trim().length > 0) {
    request.notes = input.notes.trim();
  }
  return request;
}

// parseCorpusItemUpdateRequest: 入参为 HTTP body；输出语料更新请求，空字符串可用于清空可选字段。
function parseCorpusItemUpdateRequest(body: unknown): CorpusItemUpdateRequest {
  const input = requireObject(body, "request body");
  const request: CorpusItemUpdateRequest = {};
  if (hasOwn(input, "title")) {
    request.title = requireTrimmedString(input.title, "title");
  }
  if (hasOwn(input, "text")) {
    request.text = requireTrimmedString(input.text, "text");
  }
  if (hasOwn(input, "language")) {
    request.language = requireTrimmedString(input.language, "language");
  }
  if (hasOwn(input, "scene")) {
    request.scene = parseOptionalString(input.scene, "scene");
  }
  if (hasOwn(input, "emotion")) {
    request.emotion = parseOptionalString(input.emotion, "emotion");
  }
  if (input.lengthCategory !== undefined) {
    request.lengthCategory = parseLengthCategory(input.lengthCategory, "lengthCategory");
  }
  if (input.styleTags !== undefined) {
    request.styleTags = parseStringList(input.styleTags, "styleTags");
  }
  if (hasOwn(input, "ssml")) {
    request.ssml = parseOptionalString(input.ssml, "ssml");
  }
  if (input.ssmlEnabled !== undefined) {
    request.ssmlEnabled = parseBoolean(input.ssmlEnabled, "ssmlEnabled");
  }
  if (hasOwn(input, "notes")) {
    request.notes = parseOptionalString(input.notes, "notes");
  }
  return request;
}

// parseCorpusSetCreateRequest: 入参为 HTTP body；输出可保存的语料组合创建请求。
function parseCorpusSetCreateRequest(body: unknown): CorpusSetCreateRequest {
  const input = requireObject(body, "request body");
  const request: CorpusSetCreateRequest = {
    name: requireTrimmedString(input.name, "name")
  };
  if (input.corpusItemIds !== undefined) {
    request.corpusItemIds = parseStringList(input.corpusItemIds, "corpusItemIds");
  }
  if (typeof input.description === "string" && input.description.trim().length > 0) {
    request.description = input.description.trim();
  }
  if (input.filtersSnapshot !== undefined) {
    request.filtersSnapshot = parseFilterSnapshot(input.filtersSnapshot);
  }
  return request;
}

// parseFilterSnapshot: 入参为未知筛选快照；输出语料组合可归档的筛选快照。
function parseFilterSnapshot(value: unknown): CorpusFilterSnapshot {
  const input = requireObject(value, "filtersSnapshot");
  const snapshot: CorpusFilterSnapshot = {};
  if (typeof input.search === "string" && input.search.trim().length > 0) {
    snapshot.search = input.search.trim();
  }
  if (typeof input.language === "string" && input.language.trim().length > 0) {
    snapshot.language = input.language.trim();
  }
  if (typeof input.scene === "string" && input.scene.trim().length > 0) {
    snapshot.scene = input.scene.trim();
  }
  if (typeof input.emotion === "string" && input.emotion.trim().length > 0) {
    snapshot.emotion = input.emotion.trim();
  }
  if (input.lengthCategory !== undefined) {
    snapshot.lengthCategory = parseLengthCategory(input.lengthCategory, "filtersSnapshot.lengthCategory");
  }
  if (input.styleTags !== undefined) {
    snapshot.styleTags = parseStringList(input.styleTags, "filtersSnapshot.styleTags");
  }
  if (input.ssmlEnabled !== undefined) {
    snapshot.ssmlEnabled = parseBoolean(input.ssmlEnabled, "filtersSnapshot.ssmlEnabled");
  }
  return snapshot;
}

// parseCorpusItemQuery: 入参为 HTTP query；输出语料列表和统计接口共用的查询条件。
function parseCorpusItemQuery(value: unknown): CorpusItemQuery {
  const input = requireObject(value, "query");
  const query: CorpusItemQuery = {};
  if (typeof input.search === "string" && input.search.trim().length > 0) {
    query.search = input.search.trim();
  }
  if (typeof input.language === "string" && input.language.trim().length > 0) {
    query.language = input.language.trim();
  }
  if (typeof input.scene === "string" && input.scene.trim().length > 0) {
    query.scene = input.scene.trim();
  }
  if (typeof input.emotion === "string" && input.emotion.trim().length > 0) {
    query.emotion = input.emotion.trim();
  }
  if (input.lengthCategory !== undefined) {
    query.lengthCategory = parseLengthCategory(input.lengthCategory, "lengthCategory");
  }
  if (input.styleTags !== undefined) {
    query.styleTags = parseQueryStringList(input.styleTags, "styleTags");
  }
  if (input.ssmlEnabled !== undefined) {
    query.ssmlEnabled = parseBoolean(input.ssmlEnabled, "ssmlEnabled");
  }
  return query;
}

// parseBoolean: 入参为未知布尔值或 query 字符串；输出标准 boolean。
function parseBoolean(value: unknown, label: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  throw new TTSError(`${label} is invalid.`, "invalid_request", 400);
}

// parseLengthCategory: 入参为未知长度标签；输出受控语料长度标签。
function parseLengthCategory(value: unknown, label: string): CorpusLengthCategory {
  if (value === "short" || value === "medium" || value === "long") {
    return value;
  }
  throw new TTSError(`${label} is invalid.`, "invalid_request", 400);
}

// requireObject: 入参为未知值和字段名；输出普通对象，否则抛出请求错误。
function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TTSError(`${label} must be an object.`, "invalid_request", 400);
  }
  return value as Record<string, unknown>;
}

// requireTrimmedString: 入参为未知值和字段名；输出 trim 后非空字符串。
function requireTrimmedString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TTSError(`${label} is required.`, "invalid_request", 400);
  }
  return value.trim();
}

// parseOptionalString: 入参为未知值和字段名；输出 trim 后字符串，空字符串由上层解释为清空字段。
function parseOptionalString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new TTSError(`${label} must be a string.`, "invalid_request", 400);
  }
  return value.trim();
}

// hasOwn: 入参为对象和字段名；输出请求 body 是否显式包含该字段。
function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

// parseStringList: 入参为未知数组和字段名；输出 trim 后的非空字符串列表。
function parseStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new TTSError(`${label} must be an array.`, "invalid_request", 400);
  }
  return value.map((item, index) => requireTrimmedString(item, `${label}[${index}]`));
}

// parseQueryStringList: 入参为 query 中的字符串、字符串数组；输出支持逗号分隔的字符串列表。
function parseQueryStringList(value: unknown, label: string): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item, index) => requireTrimmedString(item, `${label}[${index}]`));
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      if (typeof item !== "string") {
        throw new TTSError(`${label}[${index}] is required.`, "invalid_request", 400);
      }
      return item
        .split(",")
        .map((part, partIndex) => requireTrimmedString(part, `${label}[${index}][${partIndex}]`));
    });
  }
  throw new TTSError(`${label} must be a string or array.`, "invalid_request", 400);
}
