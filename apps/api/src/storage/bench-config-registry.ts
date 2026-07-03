import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BenchConfig, BenchConfigCreateRequest, BenchConfigTuple } from "@tts-platform/core";
import { benchConfigsRoot, defaultDataRoot } from "./paths";

export class FileBenchConfigRegistry {
  private readonly configs = new Map<string, BenchConfig>();
  private readonly filePath: string;

  // constructor: 入参为可选 data root；功能是加载本地 Benchmark 配置 registry。
  constructor(dataRoot = defaultDataRoot()) {
    this.filePath = path.join(benchConfigsRoot(dataRoot), "configs.json");
    this.load();
  }

  // list: 无入参；功能是列出已登记的 Benchmark 配置。
  list(): BenchConfig[] {
    return [...this.configs.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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

  // load: 无入参；功能是从本地文件读取 Benchmark 配置，文件不存在时保持空 registry。
  private load(): void {
    if (!existsSync(this.filePath)) {
      return;
    }
    const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as { configs?: BenchConfig[] };
    for (const config of raw.configs ?? []) {
      this.configs.set(config.digest, config);
    }
  }

  // persist: 无入参；功能是把 Benchmark 配置写回本地文件系统。
  private persist(): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(
      this.filePath,
      `${JSON.stringify(
        {
          configs: this.list()
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
