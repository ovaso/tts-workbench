import {
  TTSError,
  type CorpusFilterSnapshot,
  type CorpusItemCreateRequest,
  type CorpusLengthCategory,
  type CorpusSetCreateRequest
} from "@tts-platform/core";
import type { FastifyInstance } from "fastify";
import type { FileCorpusRegistry } from "../storage/corpus-registry";

// registerCorpusRoutes: 入参为 Fastify 实例和语料 registry；功能是注册语料与语料组合 HTTP API。
export async function registerCorpusRoutes(app: FastifyInstance, corpus: FileCorpusRegistry): Promise<void> {
  app.get("/v1/corpus-items", async () => {
    return {
      items: corpus.listItems()
    };
  });

  app.post("/v1/corpus-items", async (request, reply) => {
    const item = corpus.saveItem(parseCorpusItemCreateRequest(request.body));
    return reply.status(201).send({ item });
  });

  app.get("/v1/corpus-sets", async () => {
    return {
      sets: corpus.listSets()
    };
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

// parseCorpusSetCreateRequest: 入参为 HTTP body；输出可保存的语料组合创建请求。
function parseCorpusSetCreateRequest(body: unknown): CorpusSetCreateRequest {
  const input = requireObject(body, "request body");
  const request: CorpusSetCreateRequest = {
    name: requireTrimmedString(input.name, "name"),
    corpusItemIds: parseStringList(input.corpusItemIds, "corpusItemIds")
  };
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
  return snapshot;
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

// parseStringList: 入参为未知数组和字段名；输出 trim 后的非空字符串列表。
function parseStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new TTSError(`${label} must be an array.`, "invalid_request", 400);
  }
  return value.map((item, index) => requireTrimmedString(item, `${label}[${index}]`));
}
