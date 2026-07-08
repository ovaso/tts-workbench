import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  TTSError,
  type BenchConfig,
  type BenchmarkJobOperation,
  type BenchmarkPlan,
  type BenchmarkPlanCreateRequest,
  type BenchmarkPlanJob,
  type BenchmarkTextMode,
  type CorpusItem,
  type TTSSyncRequest,
  type TTSStreamRequest
} from "@tts-platform/core";
import { createPlanId } from "../utils/ids";
import { readJsonFile, writePrettyJson } from "../utils/json";
import { benchmarkRunRoot, benchmarkRunsRoot, defaultDataRoot } from "./paths";
import type { FileBenchConfigRegistry } from "./bench-config-registry";
import type { FileCorpusRegistry } from "./corpus-registry";

const BENCHMARK_PLAN_FILES = ["benchmark-plan.json"] as const;

export class FileBenchmarkPlanArchive {
  readonly dataRoot: string;

  // constructor: 入参为语料 registry、配置 registry 和可选 data root；功能是准备 Benchmark plan 文件归档。
  constructor(
    private readonly corpus: FileCorpusRegistry,
    private readonly configs: FileBenchConfigRegistry,
    dataRoot = defaultDataRoot()
  ) {
    this.dataRoot = dataRoot;
  }

  // createPlan: 入参为 Benchmark plan 创建请求；输出已归档的 planned Benchmark plan。
  async createPlan(request: BenchmarkPlanCreateRequest): Promise<BenchmarkPlan> {
    const operation = request.operation ?? "tts.sync";
    if (operation !== "tts.sync") {
      throw new TTSError("Only operation 'tts.sync' is supported in benchmark phase 1.", "operation_not_supported", 400);
    }

    const textMode = request.textMode ?? "text";
    const corpusSet = this.corpus.getSet(request.corpusSetId);
    if (corpusSet === undefined) {
      throw new TTSError(`Corpus set '${request.corpusSetId}' was not found.`, "invalid_request", 404);
    }
    const configSet = this.configs.getSet(request.configSetId);
    if (configSet === undefined) {
      throw new TTSError(`Bench config set '${request.configSetId}' was not found.`, "invalid_request", 404);
    }

    const corpusItems = corpusSet.corpusItemIds.map((corpusItemId) => this.requireCorpusItem(corpusItemId));
    const benchConfigs = configSet.configIds.map((configId) => this.requireBenchConfig(configId));
    const planId = createPlanId();
    const jobs = buildBenchmarkJobs(planId, corpusItems, benchConfigs, operation, textMode);
    const now = new Date().toISOString();
    const plan: BenchmarkPlan = {
      planId,
      displayName: request.displayName,
      corpusSetId: request.corpusSetId,
      configSetId: request.configSetId,
      operation,
      textMode,
      status: "planned",
      createdAt: now,
      updatedAt: now,
      jobs,
      summary: {
        corpusItemCount: corpusItems.length,
        configCount: benchConfigs.length,
        totalJobs: jobs.length
      },
      archive: {
        runPath: `data/benchmark-runs/${planId}`,
        files: [...BENCHMARK_PLAN_FILES]
      },
      ...(request.description === undefined ? {} : { description: request.description })
    };

    await writePrettyJson(path.join(benchmarkRunRoot(this.dataRoot, planId), "benchmark-plan.json"), plan);
    return plan;
  }

  // listPlans: 无入参；输出已归档 Benchmark plan 摘要列表，按创建时间倒序。
  async listPlans(): Promise<BenchmarkPlan[]> {
    await mkdir(benchmarkRunsRoot(this.dataRoot), { recursive: true });
    const entries = await readdir(benchmarkRunsRoot(this.dataRoot), { withFileTypes: true });
    const plans = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            return await this.readPlan(entry.name);
          } catch {
            return undefined;
          }
        })
    );

    return plans
      .filter((plan): plan is BenchmarkPlan => plan !== undefined)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  // readPlan: 入参为 plan id；输出已归档的 Benchmark plan 详情。
  async readPlan(planId: string): Promise<BenchmarkPlan> {
    assertSafePlanId(planId);
    const directory = benchmarkRunRoot(this.dataRoot, planId);
    await assertPlanExists(directory, planId);
    return readJsonFile<BenchmarkPlan>(path.join(directory, "benchmark-plan.json"));
  }

  // requireCorpusItem: 入参为语料 id；输出语料记录，缺失时抛出请求错误。
  private requireCorpusItem(corpusItemId: string): CorpusItem {
    const item = this.corpus.getItem(corpusItemId);
    if (item === undefined) {
      throw new TTSError(`Corpus item '${corpusItemId}' was not found.`, "invalid_request", 404);
    }
    return item;
  }

  // requireBenchConfig: 入参为配置 id；输出合成配置，缺失时抛出请求错误。
  private requireBenchConfig(configId: string): BenchConfig {
    const config = this.configs.get(configId);
    if (config === undefined) {
      throw new TTSError(`Bench config '${configId}' was not found.`, "invalid_request", 404);
    }
    return config;
  }
}

// buildBenchmarkJobs: 入参为 plan id、语料、配置、operation 和文本模式；输出 planned job 列表。
function buildBenchmarkJobs(
  planId: string,
  corpusItems: CorpusItem[],
  benchConfigs: BenchConfig[],
  operation: BenchmarkJobOperation,
  textMode: BenchmarkTextMode
): BenchmarkPlanJob[] {
  const jobs: BenchmarkPlanJob[] = [];
  for (const corpusItem of corpusItems) {
    for (const benchConfig of benchConfigs) {
      const request = buildJobRequest(corpusItem, benchConfig, operation, textMode);
      jobs.push({
        jobId: `${planId}_job_${String(jobs.length + 1).padStart(4, "0")}`,
        corpusItemId: corpusItem.corpusItemId,
        configId: benchConfig.configId,
        operation,
        textMode,
        request,
        status: "planned"
      });
    }
  }
  return jobs;
}

// buildJobRequest: 入参为语料、配置、operation 和文本模式；输出可交给 Facade 的 canonical 请求。
function buildJobRequest(
  corpusItem: CorpusItem,
  benchConfig: BenchConfig,
  operation: BenchmarkJobOperation,
  textMode: BenchmarkTextMode
): TTSSyncRequest | TTSStreamRequest {
  if (operation !== "tts.sync") {
    throw new TTSError("Only operation 'tts.sync' is supported in benchmark phase 1.", "operation_not_supported", 400);
  }
  const request: TTSSyncRequest = {
    operation: "tts.sync",
    providerId: benchConfig.providerId,
    text: corpusItem.text,
    model: benchConfig.modelId,
    voice: benchConfig.voice,
    clientRequestId: `${corpusItem.corpusItemId}:${benchConfig.configId}`
  };

  if (textMode === "ssml") {
    if (corpusItem.ssml === undefined || !corpusItem.ssmlEnabled) {
      throw new TTSError(
        `Corpus item '${corpusItem.corpusItemId}' does not have enabled SSML.`,
        "invalid_request",
        400
      );
    }
    request.ssml = corpusItem.ssml;
  }
  if (benchConfig.output !== undefined) {
    request.output = benchConfig.output;
  }
  if (benchConfig.controls !== undefined) {
    request.controls = benchConfig.controls;
  }
  if (benchConfig.vendor !== undefined) {
    request.vendor = benchConfig.vendor;
  }
  return request;
}

// assertSafePlanId: 入参为 plan id；功能是拒绝路径穿越字符。
function assertSafePlanId(planId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(planId)) {
    throw new TTSError("Invalid benchmark plan id.", "invalid_request", 400);
  }
}

// assertPlanExists: 入参为 plan 目录和 id；功能是确认归档目录存在。
async function assertPlanExists(directory: string, planId: string): Promise<void> {
  try {
    const info = await stat(directory);
    if (!info.isDirectory()) {
      throw new Error("Benchmark plan path is not a directory.");
    }
  } catch {
    throw new TTSError(`Benchmark plan '${planId}' was not found.`, "invalid_request", 404);
  }
}
