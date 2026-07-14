import type {
  TTSSyncRequest,
  TTSCanonicalControls,
  TTSOutputPreferences,
  TTSStreamRequest,
  TTSVoiceSelection
} from "./requests";
import type { TTSStreamResult, TTSSyncResult } from "./results";
import type { VendorDirective } from "./vendor-extension";

// BenchConfigTuple: 合成配置身份元组；只包含会影响一次 TTS 请求语义的字段。
export interface BenchConfigTuple {
  providerId: string;
  modelId: string;
  voice: TTSVoiceSelection;
  output?: TTSOutputPreferences;
  controls?: TTSCanonicalControls;
  vendor?: VendorDirective;
}

// BenchConfig: 已登记的合成配置；同一厂商、模型、音色和参数组合使用 digest 去重。
export interface BenchConfig extends BenchConfigTuple {
  configId: string;
  digest: string;
  displayName: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// BenchConfigCreateRequest: 创建合成配置的输入契约；displayName 不参与 digest。
export interface BenchConfigCreateRequest extends BenchConfigTuple {
  displayName: string;
  description?: string;
}

// BenchConfigSet: 一组可复用合成配置；Benchmark plan 通过它和语料组合做笛卡尔积。
export interface BenchConfigSet {
  configSetId: string;
  digest: string;
  name: string;
  description?: string;
  configIds: string[];
  createdAt: string;
  updatedAt: string;
}

// BenchConfigSetCreateRequest: 创建配置组合的输入契约；configIds 按请求顺序保留。
export interface BenchConfigSetCreateRequest {
  name: string;
  description?: string;
  configIds: string[];
}

// BenchmarkTextMode: Benchmark job 使用纯文本还是 SSML 语料。
export type BenchmarkTextMode = "text" | "ssml";

// BenchmarkJobOperation: Benchmark 允许规划的合成 operation；第一阶段 API 只开放 tts.sync。
export type BenchmarkJobOperation = "tts.sync" | "tts.stream";

// BenchmarkPlanStatus: Benchmark plan 生命周期状态；第一阶段只生成 planned 状态。
export type BenchmarkPlanStatus = "planned" | "running" | "succeeded" | "failed" | "cancelled";

// BenchmarkPlanJobStatus: Benchmark job 生命周期状态；执行阶段会写入成功或失败结果。
export type BenchmarkPlanJobStatus = "planned" | "running" | "succeeded" | "failed";

// BenchmarkPlanJobRequest: Benchmark job 内部保存的 canonical TTS 请求。
export type BenchmarkPlanJobRequest = TTSSyncRequest | TTSStreamRequest;

// BenchmarkFirstPacketSource: 首包延迟来源；同步合成无法观测真实首个音频包。
export type BenchmarkFirstPacketSource = "stream_audio_chunk" | "sync_not_observable";

// BenchmarkAudioDurationSource: 音频时长来源；用于区分真实事件、文件头和厂商响应推断。
export type BenchmarkAudioDurationSource = "stream_completed_event" | "wav_header" | "vendor_response";

// BenchmarkPlanJobMetrics: 单个 Benchmark job 的指标；只记录平台能明确采集或推断的数据。
export interface BenchmarkPlanJobMetrics {
  textLength: number;
  totalLatencyMs?: number;
  firstPacketLatencyMs?: number;
  firstPacketSource?: BenchmarkFirstPacketSource;
  audioDurationMs?: number;
  audioDurationSource?: BenchmarkAudioDurationSource;
  audioByteLength?: number;
  audioChunkCount?: number;
  realtimeFactor?: number;
}

// BenchmarkPlanJob: 一条 planned Benchmark 请求；执行阶段会把它送入现有 Facade 并写入指标。
export interface BenchmarkPlanJob {
  jobId: string;
  corpusItemId: string;
  configId: string;
  operation: BenchmarkJobOperation;
  textMode: BenchmarkTextMode;
  request: BenchmarkPlanJobRequest;
  status: BenchmarkPlanJobStatus;
  runId?: string;
  result?: TTSSyncResult | TTSStreamResult;
  metrics?: BenchmarkPlanJobMetrics;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

// BenchmarkPlanSummary: Benchmark plan 的规模摘要；用于列表页快速展示。
export interface BenchmarkPlanSummary {
  corpusItemCount: number;
  configCount: number;
  totalJobs: number;
  succeededJobs?: number;
  failedJobs?: number;
  measuredJobs?: number;
  averageTotalLatencyMs?: number;
  averageFirstPacketLatencyMs?: number;
  averageAudioDurationMs?: number;
  averageRealtimeFactor?: number;
  totalAudioByteLength?: number;
}

// BenchmarkPlan: 语料组合和配置组合生成的可执行计划；第一阶段只归档 planned 请求。
export interface BenchmarkPlan {
  planId: string;
  displayName: string;
  description?: string;
  corpusSetId: string;
  configSetId: string;
  operation: BenchmarkJobOperation;
  textMode: BenchmarkTextMode;
  status: BenchmarkPlanStatus;
  createdAt: string;
  updatedAt: string;
  jobs: BenchmarkPlanJob[];
  summary: BenchmarkPlanSummary;
  archive: {
    runPath: string;
    files: string[];
  };
}

// BenchmarkPlanCreateRequest: 创建 Benchmark plan 的输入契约；执行和指标采集由后续阶段补齐。
export interface BenchmarkPlanCreateRequest {
  displayName: string;
  description?: string;
  corpusSetId: string;
  configSetId: string;
  operation?: BenchmarkJobOperation;
  textMode?: BenchmarkTextMode;
}
