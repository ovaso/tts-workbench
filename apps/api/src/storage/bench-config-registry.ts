import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  TTSError,
  type BenchConfig,
  type BenchConfigCreateRequest,
  type BenchConfigSet,
  type BenchConfigSetCreateRequest,
  type BenchConfigTuple
} from "@tts-platform/core";
import { benchConfigsRoot, defaultDataRoot } from "./paths";

export class FileBenchConfigRegistry {
  private readonly configs = new Map<string, BenchConfig>();
  private readonly sets = new Map<string, BenchConfigSet>();
  private readonly configFilePath: string;
  private readonly setFilePath: string;

  // constructor: 入参为可选 data root；功能是加载本地 Benchmark 配置 registry。
  constructor(dataRoot = defaultDataRoot()) {
    const root = benchConfigsRoot(dataRoot);
    this.configFilePath = path.join(root, "configs.json");
    this.setFilePath = path.join(root, "config-sets.json");
    this.load();
  }

  // list: 无入参；功能是列出已登记的 Benchmark 配置。
  list(): BenchConfig[] {
    return [...this.configs.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  // get: 入参为配置 id；输出对应 Benchmark 配置，缺失时返回 undefined。
  get(configId: string): BenchConfig | undefined {
    return this.configs.get(configId);
  }

  // save: 入参为创建请求；功能是按 vendor-model-voice-param digest 去重保存配置。
  save(request: BenchConfigCreateRequest): BenchConfig {
    const digest = benchConfigDigest(request);
    const existing = this.configs.get(digest);
    if (existing !== undefined) {
      return existing;
    }

    const now = new Date().toISOString();
    const config: BenchConfig = {
      configId: digest,
      digest,
      displayName: request.displayName,
      providerId: request.providerId,
      modelId: request.modelId,
      voice: request.voice,
      createdAt: now,
      updatedAt: now,
      ...(request.description === undefined ? {} : { description: request.description }),
      ...(request.output === undefined ? {} : { output: request.output }),
      ...(request.controls === undefined ? {} : { controls: request.controls }),
      ...(request.vendor === undefined ? {} : { vendor: request.vendor })
    };

    this.configs.set(digest, config);
    this.persist();
    return config;
  }

  // listSets: 无入参；输出已登记的 Benchmark 配置组合。
  listSets(): BenchConfigSet[] {
    return [...this.sets.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  // getSet: 入参为配置组合 id；输出对应配置组合，缺失时返回 undefined。
  getSet(configSetId: string): BenchConfigSet | undefined {
    return this.sets.get(configSetId);
  }

  // saveSet: 入参为配置组合创建请求；输出按 configIds digest 去重后的配置组合。
  saveSet(request: BenchConfigSetCreateRequest): BenchConfigSet {
    const configIds = uniqueStrings(request.configIds);
    if (configIds.length === 0) {
      throw new TTSError("configIds must contain at least one config.", "invalid_request", 400);
    }
    for (const configId of configIds) {
      if (!this.configs.has(configId)) {
        throw new TTSError(`Bench config '${configId}' was not found.`, "invalid_request", 404);
      }
    }

    const digest = benchConfigSetDigest(configIds);
    const existing = this.sets.get(digest);
    if (existing !== undefined) {
      return existing;
    }

    const now = new Date().toISOString();
    const set: BenchConfigSet = {
      configSetId: digest,
      digest,
      name: request.name,
      configIds,
      createdAt: now,
      updatedAt: now,
      ...(request.description === undefined ? {} : { description: request.description })
    };

    this.sets.set(digest, set);
    this.persistSets();
    return set;
  }

  // load: 无入参；功能是从本地文件读取 Benchmark 配置，文件不存在时保持空 registry。
  private load(): void {
    if (existsSync(this.configFilePath)) {
      const raw = JSON.parse(readFileSync(this.configFilePath, "utf8")) as { configs?: BenchConfig[] };
      for (const config of raw.configs ?? []) {
        this.configs.set(config.digest, config);
      }
    }
    if (existsSync(this.setFilePath)) {
      const raw = JSON.parse(readFileSync(this.setFilePath, "utf8")) as { sets?: BenchConfigSet[] };
      for (const set of raw.sets ?? []) {
        this.sets.set(set.digest, set);
      }
    }
  }

  // persist: 无入参；功能是把 Benchmark 配置写回本地文件系统。
  private persist(): void {
    mkdirSync(path.dirname(this.configFilePath), { recursive: true });
    writeFileSync(
      this.configFilePath,
      `${JSON.stringify(
        {
          configs: this.list()
        },
        null,
        2
      )}\n`
    );
  }

  // persistSets: 无入参；功能是把 Benchmark 配置组合写回本地文件系统。
  private persistSets(): void {
    mkdirSync(path.dirname(this.setFilePath), { recursive: true });
    writeFileSync(
      this.setFilePath,
      `${JSON.stringify(
        {
          sets: this.listSets()
        },
        null,
        2
      )}\n`
    );
  }
}

// benchConfigDigest: 入参为配置 tuple；输出稳定 sha256 digest，作为配置主键。
export function benchConfigDigest(tuple: BenchConfigTuple): string {
  return createHash("sha256").update(stableStringify(normalizeBenchConfigTuple(tuple))).digest("hex");
}

// benchConfigSetDigest: 入参为配置 id 数组；输出稳定 sha256 digest，作为配置组合主键。
export function benchConfigSetDigest(configIds: string[]): string {
  return createHash("sha256").update(stableStringify(configIds)).digest("hex");
}

// normalizeBenchConfigTuple: 入参为配置 tuple；输出只参与 digest 的规范化 vendor-model-voice-param 对象。
function normalizeBenchConfigTuple(tuple: BenchConfigTuple): BenchConfigTuple {
  return {
    providerId: tuple.providerId,
    modelId: tuple.modelId,
    voice: stripUndefined(tuple.voice),
    ...(tuple.output === undefined ? {} : { output: stripUndefined(tuple.output) }),
    ...(tuple.controls === undefined ? {} : { controls: stripUndefined(tuple.controls) }),
    ...(tuple.vendor === undefined ? {} : { vendor: tuple.vendor })
  };
}

// stableStringify: 入参为 JSON-like 值；输出对象 key 有序的稳定 JSON 字符串。
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

// stripUndefined: 入参为对象；输出去掉 undefined 字段后的对象，避免 digest 受空字段影响。
function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
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
