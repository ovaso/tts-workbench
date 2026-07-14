import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import {
  TTSError,
  type BenchConfig,
  type BenchmarkAudioDurationSource,
  type BenchmarkJobOperation,
  type BenchmarkPlan,
  type BenchmarkPlanCreateRequest,
  type BenchmarkPlanJob,
  type BenchmarkPlanJobMetrics,
  type BenchmarkTextMode,
  type TTSStreamResult,
  type TTSSyncResult,
  type CorpusItem,
  type TTSSyncRequest,
  type TTSStreamRequest,
  type VendorPayload
} from "@tts-platform/core";
import type { TTSFacade } from "../facade/tts-facade";
import { createPlanId } from "../utils/ids";
import { readJsonFile, writePrettyJson } from "../utils/json";
import { benchmarkRunRoot, benchmarkRunsRoot, defaultDataRoot, runRoot } from "./paths";
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

  // executePlan: 入参为 plan id 和 TTS Facade；功能是顺序执行 Benchmark jobs 并写回 plan 结果。
  async executePlan(planId: string, facade: TTSFacade): Promise<BenchmarkPlan> {
    const current = await this.readPlan(planId);
    if (current.operation !== "tts.sync" && current.operation !== "tts.stream") {
      throw new TTSError("Only TTS operations are supported in benchmark runner.", "operation_not_supported", 400);
    }

    let plan: BenchmarkPlan = {
      ...current,
      status: "running",
      updatedAt: new Date().toISOString(),
      jobs: current.jobs.map(resetJobExecution),
      summary: {
        corpusItemCount: current.summary.corpusItemCount,
        configCount: current.summary.configCount,
        totalJobs: current.summary.totalJobs,
        succeededJobs: 0,
        failedJobs: 0
      }
    };
    await this.writePlan(plan);

    const executedJobs: BenchmarkPlanJob[] = [];
    for (const job of plan.jobs) {
      const runningJob: BenchmarkPlanJob = {
        ...job,
        status: "running",
        startedAt: new Date().toISOString()
      };
      executedJobs.push(runningJob);
      plan = {
        ...plan,
        jobs: [...executedJobs, ...plan.jobs.slice(executedJobs.length)],
        updatedAt: new Date().toISOString()
      };
      await this.writePlan(plan);

      const completedJob = await executeBenchmarkJob(runningJob, facade, this.dataRoot);
      executedJobs[executedJobs.length - 1] = completedJob;
      plan = {
        ...plan,
        jobs: [...executedJobs, ...plan.jobs.slice(executedJobs.length)],
        updatedAt: new Date().toISOString()
      };
      await this.writePlan(plan);
    }

    const succeededJobs = executedJobs.filter((job) => job.status === "succeeded").length;
    const failedJobs = executedJobs.filter((job) => job.status === "failed").length;
    const completed: BenchmarkPlan = {
      ...plan,
      status: failedJobs > 0 ? "failed" : "succeeded",
      updatedAt: new Date().toISOString(),
      summary: {
        ...plan.summary,
        succeededJobs,
        failedJobs,
        ...aggregateBenchmarkMetrics(executedJobs)
      }
    };
    await this.writePlan(completed);
    return completed;
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

  // writePlan: 入参为完整 Benchmark plan；功能是覆盖写回对应 plan 归档。
  private async writePlan(plan: BenchmarkPlan): Promise<void> {
    await writePrettyJson(path.join(benchmarkRunRoot(this.dataRoot, plan.planId), "benchmark-plan.json"), plan);
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

// resetJobExecution: 入参为历史 job；输出清除旧执行结果后的 planned job。
function resetJobExecution(job: BenchmarkPlanJob): BenchmarkPlanJob {
  return {
    jobId: job.jobId,
    corpusItemId: job.corpusItemId,
    configId: job.configId,
    operation: job.operation,
    textMode: job.textMode,
    request: job.request,
    status: "planned"
  };
}

// executeBenchmarkJob: 入参为 running job、Facade 和 dataRoot；输出带 runId、result、指标或错误信息的 completed job。
async function executeBenchmarkJob(
  job: BenchmarkPlanJob,
  facade: TTSFacade,
  dataRoot: string
): Promise<BenchmarkPlanJob> {
  if (job.operation === "tts.stream") {
    return executeStreamBenchmarkJob(job, facade, dataRoot);
  }
  return executeSyncBenchmarkJob(job, facade, dataRoot);
}

// executeSyncBenchmarkJob: 入参为 running job、Facade 和 dataRoot；输出同步合成的运行结果和响应耗时指标。
async function executeSyncBenchmarkJob(
  job: BenchmarkPlanJob,
  facade: TTSFacade,
  dataRoot: string
): Promise<BenchmarkPlanJob> {
  const startedAt = performance.now();
  try {
    const result = await facade.synthesizeSync(job.request as TTSSyncRequest);
    const metrics = await buildSyncMetrics(job.request, result, dataRoot, elapsedMs(startedAt));
    return succeededBenchmarkJob(job, result, metrics);
  } catch (caught) {
    return {
      ...job,
      status: "failed",
      metrics: {
        textLength: requestTextLength(job.request),
        totalLatencyMs: elapsedMs(startedAt),
        firstPacketSource: "sync_not_observable"
      },
      errorMessage: caught instanceof Error ? caught.message : "Benchmark job failed.",
      completedAt: new Date().toISOString()
    };
  }
}

// executeStreamBenchmarkJob: 入参为 running job、Facade 和 dataRoot；输出流式合成结果和首包指标。
async function executeStreamBenchmarkJob(
  job: BenchmarkPlanJob,
  facade: TTSFacade,
  dataRoot: string
): Promise<BenchmarkPlanJob> {
  const execution = await facade.synthesizeStreamToArchive(job.request as TTSStreamRequest);
  const metrics = await buildStreamMetrics(job.request, execution, dataRoot);
  const completedAt = new Date().toISOString();
  if (execution.result.status === "failed" || execution.errorMessage !== undefined) {
    return {
      ...job,
      status: "failed",
      runId: execution.result.runId,
      result: execution.result,
      metrics,
      errorMessage: execution.errorMessage ?? "Benchmark stream job failed.",
      completedAt
    };
  }
  return succeededBenchmarkJob(job, execution.result, metrics);
}

// succeededBenchmarkJob: 入参为 running job、普通 run 结果和指标；输出成功的 Benchmark job。
function succeededBenchmarkJob(
  job: BenchmarkPlanJob,
  result: TTSSyncResult | TTSStreamResult,
  metrics: BenchmarkPlanJobMetrics
): BenchmarkPlanJob {
  return {
    ...job,
    status: "succeeded",
    runId: result.runId,
    result,
    metrics,
    completedAt: new Date().toISOString()
  };
}

// buildSyncMetrics: 入参为请求、同步结果、dataRoot 和总耗时；输出同步 Benchmark 指标。
async function buildSyncMetrics(
  request: TTSSyncRequest | TTSStreamRequest,
  result: TTSSyncResult,
  dataRoot: string,
  totalLatencyMs: number
): Promise<BenchmarkPlanJobMetrics> {
  const duration = await audioDurationFromRun(dataRoot, result);
  const metrics: BenchmarkPlanJobMetrics = {
    textLength: requestTextLength(request),
    totalLatencyMs,
    firstPacketSource: "sync_not_observable",
    audioByteLength: result.audio.byteLength
  };
  if (duration !== undefined) {
    const rtf = realtimeFactor(totalLatencyMs, duration.durationMs);
    metrics.audioDurationMs = duration.durationMs;
    metrics.audioDurationSource = duration.source;
    if (rtf !== undefined) {
      metrics.realtimeFactor = rtf;
    }
  }
  return metrics;
}

// buildStreamMetrics: 入参为请求、流式执行结果和 dataRoot；输出流式 Benchmark 指标。
async function buildStreamMetrics(
  request: TTSSyncRequest | TTSStreamRequest,
  execution: Awaited<ReturnType<TTSFacade["synthesizeStreamToArchive"]>>,
  dataRoot: string
): Promise<BenchmarkPlanJobMetrics> {
  const duration =
    execution.metrics.audioDurationMs === undefined
      ? await audioDurationFromRun(dataRoot, execution.result)
      : {
          durationMs: execution.metrics.audioDurationMs,
          source: "stream_completed_event" as const
        };
  const metrics: BenchmarkPlanJobMetrics = {
    textLength: requestTextLength(request),
    totalLatencyMs: execution.metrics.totalLatencyMs,
    audioByteLength: execution.result.audio?.byteLength ?? execution.metrics.audioByteLength,
    audioChunkCount: execution.metrics.audioChunkCount
  };
  if (execution.metrics.firstPacketLatencyMs !== undefined) {
    metrics.firstPacketLatencyMs = execution.metrics.firstPacketLatencyMs;
    metrics.firstPacketSource = "stream_audio_chunk";
  }
  if (duration !== undefined) {
    const rtf = realtimeFactor(execution.metrics.totalLatencyMs, duration.durationMs);
    metrics.audioDurationMs = duration.durationMs;
    metrics.audioDurationSource = duration.source;
    if (rtf !== undefined) {
      metrics.realtimeFactor = rtf;
    }
  }
  return metrics;
}

// aggregateBenchmarkMetrics: 入参为执行后的 jobs；输出 plan summary 中的指标聚合字段。
function aggregateBenchmarkMetrics(jobs: BenchmarkPlanJob[]): Pick<
  BenchmarkPlan["summary"],
  | "measuredJobs"
  | "averageTotalLatencyMs"
  | "averageFirstPacketLatencyMs"
  | "averageAudioDurationMs"
  | "averageRealtimeFactor"
  | "totalAudioByteLength"
> {
  const metrics = jobs.map((job) => job.metrics).filter((value): value is BenchmarkPlanJobMetrics => value !== undefined);
  const measuredJobs = metrics.length;
  const totalAudioByteLength = metrics.reduce((sum, metric) => sum + (metric.audioByteLength ?? 0), 0);
  const averageTotalLatencyMs = averageMetric(metrics.map((metric) => metric.totalLatencyMs));
  const averageFirstPacketLatencyMs = averageMetric(metrics.map((metric) => metric.firstPacketLatencyMs));
  const averageAudioDurationMs = averageMetric(metrics.map((metric) => metric.audioDurationMs));
  const averageRealtimeFactor = averageMetric(metrics.map((metric) => metric.realtimeFactor));
  return {
    measuredJobs,
    ...(averageTotalLatencyMs === undefined ? {} : { averageTotalLatencyMs }),
    ...(averageFirstPacketLatencyMs === undefined ? {} : { averageFirstPacketLatencyMs }),
    ...(averageAudioDurationMs === undefined ? {} : { averageAudioDurationMs }),
    ...(averageRealtimeFactor === undefined ? {} : { averageRealtimeFactor }),
    ...(totalAudioByteLength === 0 ? {} : { totalAudioByteLength })
  };
}

// audioDurationFromRun: 入参为 dataRoot 和普通 run 结果；输出音频时长及来源。
async function audioDurationFromRun(
  dataRoot: string,
  result: TTSSyncResult | TTSStreamResult
): Promise<{ durationMs: number; source: BenchmarkAudioDurationSource } | undefined> {
  if (result.audio !== undefined && result.audio.format === "wav") {
    const wavPath = path.join(runRoot(dataRoot, result.runId), result.audio.fileName);
    const durationMs = durationMsFromWav(await readFile(wavPath));
    if (durationMs !== undefined) {
      return {
        durationMs,
        source: "wav_header"
      };
    }
  }

  const vendorDurationMs = await durationMsFromVendorResponse(dataRoot, result.runId);
  if (vendorDurationMs !== undefined) {
    return {
      durationMs: vendorDurationMs,
      source: "vendor_response"
    };
  }
  return undefined;
}

// durationMsFromWav: 入参为 WAV 文件字节；输出从 fmt/data chunk 推导出的音频时长。
function durationMsFromWav(bytes: Uint8Array): number | undefined {
  if (bytes.byteLength < 44 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WAVE") {
    return undefined;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let byteRate: number | undefined;
  let dataSize: number | undefined;
  while (offset + 8 <= bytes.byteLength) {
    const chunkId = ascii(bytes, offset, offset + 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    if (chunkId === "fmt " && chunkSize >= 16 && chunkDataOffset + 12 <= bytes.byteLength) {
      byteRate = view.getUint32(chunkDataOffset + 8, true);
    }
    if (chunkId === "data") {
      dataSize = chunkSize;
    }
    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (byteRate === undefined || byteRate <= 0 || dataSize === undefined) {
    return undefined;
  }
  return roundMs((dataSize / byteRate) * 1000);
}

// durationMsFromVendorResponse: 入参为 dataRoot 和 runId；输出厂商响应中可识别的毫秒时长。
async function durationMsFromVendorResponse(dataRoot: string, runId: string): Promise<number | undefined> {
  try {
    const vendorResponse = await readJsonFile<VendorPayload>(path.join(runRoot(dataRoot, runId), "vendor-response.json"));
    return findDurationMs(vendorResponse);
  } catch {
    return undefined;
  }
}

// findDurationMs: 入参为未知 JSON；输出递归找到的 durationMs 风格字段。
function findDurationMs(value: unknown): number | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDurationMs(item);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const [key, raw] of Object.entries(record)) {
    const normalized = key.toLowerCase().replace(/[_-]/g, "");
    if ((normalized === "durationms" || normalized === "audiodurationms") && isPositiveFiniteNumber(raw)) {
      return roundMs(raw);
    }
  }
  for (const raw of Object.values(record)) {
    const found = findDurationMs(raw);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

// requestTextLength: 入参为 TTS 请求；输出 Benchmark 展示用文本长度。
function requestTextLength(request: TTSSyncRequest | TTSStreamRequest): number {
  return (request.ssml ?? request.text).length;
}

// realtimeFactor: 入参为耗时和音频时长；输出 RTF 指标。
function realtimeFactor(totalLatencyMs: number, audioDurationMs: number): number | undefined {
  if (audioDurationMs <= 0) {
    return undefined;
  }
  return roundRatio(totalLatencyMs / audioDurationMs);
}

// averageMetric: 入参为可选数值列表；输出忽略空值后的平均值。
function averageMetric(values: Array<number | undefined>): number | undefined {
  const finiteValues = values.filter(isPositiveFiniteNumber);
  if (finiteValues.length === 0) {
    return undefined;
  }
  return roundRatio(finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length);
}

// elapsedMs: 入参为 performance 起点；输出四舍五入后的耗时毫秒。
function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

// roundMs: 入参为毫秒数；输出保留整数毫秒的指标值。
function roundMs(value: number): number {
  return Math.max(0, Math.round(value));
}

// roundRatio: 入参为比率；输出保留三位小数的指标值。
function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// isPositiveFiniteNumber: 入参为未知值；输出是否为非负有限数字。
function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// ascii: 入参为字节区间；输出 ASCII 字符串。
function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

// buildJobRequest: 入参为语料、配置、operation 和文本模式；输出可交给 Facade 的 canonical 请求。
function buildJobRequest(
  corpusItem: CorpusItem,
  benchConfig: BenchConfig,
  operation: BenchmarkJobOperation,
  textMode: BenchmarkTextMode
): TTSSyncRequest | TTSStreamRequest {
  const baseRequest = {
    providerId: benchConfig.providerId,
    text: corpusItem.text,
    model: benchConfig.modelId,
    voice: benchConfig.voice,
    clientRequestId: `${corpusItem.corpusItemId}:${benchConfig.configId}`
  };

  const request: TTSSyncRequest | TTSStreamRequest =
    operation === "tts.stream"
      ? {
          operation: "tts.stream",
          ...baseRequest,
          stream: {
            protocol: "websocket",
            ...(benchConfig.output?.format === undefined ? {} : { chunkFormat: benchConfig.output.format })
          }
        }
      : {
          operation: "tts.sync",
          ...baseRequest
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
