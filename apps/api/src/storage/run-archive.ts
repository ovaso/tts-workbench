import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  TTSError,
  type ArchivedRunSummary,
  type AudioArtifact,
  type MappingReport,
  type TTSOutputFormat,
  type TTSPlan,
  type TTSSyncPlan,
  type TTSSyncProviderResult,
  type TTSSyncRequest,
  type TTSSyncResult,
  type TTSStreamPlan,
  type TTSStreamRequest,
  type TTSStreamResult,
  type VoiceClonePlan,
  type VoiceCloneRequest,
  type VoiceCloneResult,
  type VendorPayload
} from "@tts-platform/core";
import { createRunId } from "../utils/ids";
import { readJsonFile, writePrettyJson } from "../utils/json";
import { defaultDataRoot, runRoot, runsRoot } from "./paths";

const ARCHIVE_FILES = [
  "request.json",
  "plan.json",
  "mapping-report.json",
  "vendor-request.json",
  "vendor-response.json",
  "result.json"
] as const;

export interface ArchiveRunInput {
  request: TTSSyncRequest;
  plan: TTSSyncPlan;
  providerResult: TTSSyncProviderResult;
  runId?: string;
}

export interface ArchiveVoiceCloneInput {
  request: VoiceCloneRequest;
  plan: VoiceClonePlan;
  providerResult: VoiceCloneResult;
  runId?: string;
}

export interface ArchiveStreamRunInput {
  request: TTSStreamRequest;
  plan: TTSStreamPlan;
  audio?: {
    data: Uint8Array;
    format: TTSOutputFormat;
    sampleRateHz: number;
  };
  vendorEvents: VendorPayload[];
  vendorResponse: VendorPayload;
  status?: "succeeded" | "failed";
  runId?: string;
}

export interface StoredRunDetail {
  result: TTSSyncResult | TTSStreamResult;
  request: TTSSyncRequest | TTSStreamRequest;
  plan: TTSPlan;
  mappingReport: MappingReport;
  vendorRequest: VendorPayload;
  vendorResponse: VendorPayload;
}

export class FileRunArchive {
  readonly dataRoot: string;

  constructor(dataRoot = defaultDataRoot()) {
    this.dataRoot = dataRoot;
  }

  async writeRun(input: ArchiveRunInput): Promise<TTSSyncResult> {
    const runId = input.runId ?? createRunId();
    assertSafeRunId(runId);

    const directory = runRoot(this.dataRoot, runId);
    await mkdir(directory, { recursive: true });

    const audioFileName = `audio.${input.providerResult.audio.format}`;
    await writeFile(path.join(directory, audioFileName), input.providerResult.audio.data);

    const result: TTSSyncResult = {
      runId,
      providerId: input.request.providerId,
      operation: "tts.sync",
      status: "succeeded",
      createdAt: new Date().toISOString(),
      audio: {
        fileName: audioFileName,
        format: input.providerResult.audio.format,
        sampleRateHz: input.providerResult.audio.sampleRateHz,
        byteLength: input.providerResult.audio.data.byteLength,
        url: `/v1/runs/${runId}/audio`
      },
      archive: {
        runPath: `data/runs/${runId}`,
        files: [...ARCHIVE_FILES, audioFileName]
      }
    };

    await writePrettyJson(path.join(directory, "request.json"), input.request);
    await writePrettyJson(path.join(directory, "plan.json"), input.plan);
    await writePrettyJson(path.join(directory, "mapping-report.json"), input.plan.mappingReport);
    await writePrettyJson(path.join(directory, "vendor-request.json"), input.plan.vendorRequest);
    await writePrettyJson(path.join(directory, "vendor-response.json"), input.providerResult.vendorResponse);
    await writePrettyJson(path.join(directory, "result.json"), result);

    return result;
  }

  async writeVoiceClone(input: ArchiveVoiceCloneInput): Promise<VoiceCloneResult> {
    const runId = input.runId ?? createRunId();
    assertSafeRunId(runId);

    const directory = runRoot(this.dataRoot, runId);
    await mkdir(directory, { recursive: true });

    const result = {
      ...input.providerResult,
      runId,
      providerId: input.request.providerId,
      operation: "voice.clone.create" as const,
      status: "succeeded" as const,
      createdAt: new Date().toISOString(),
      archive: {
        runPath: `data/runs/${runId}`,
        files: [...ARCHIVE_FILES]
      }
    };

    await writePrettyJson(path.join(directory, "request.json"), input.request);
    await writePrettyJson(path.join(directory, "plan.json"), input.plan);
    await writePrettyJson(path.join(directory, "mapping-report.json"), input.plan.mappingReport);
    await writePrettyJson(path.join(directory, "vendor-request.json"), input.plan.vendorRequest);
    await writePrettyJson(path.join(directory, "vendor-response.json"), input.providerResult.vendorResponse);
    await writePrettyJson(path.join(directory, "result.json"), result);

    return input.providerResult;
  }

  // writeStreamRun: 入参为流式执行结果；功能是保存流式 request、plan、events、最终响应和拼接音频。
  async writeStreamRun(input: ArchiveStreamRunInput): Promise<TTSStreamResult> {
    const runId = input.runId ?? createRunId();
    assertSafeRunId(runId);

    const directory = runRoot(this.dataRoot, runId);
    await mkdir(directory, { recursive: true });

    const files = [...ARCHIVE_FILES, "vendor-events.ndjson"];
    let audio: AudioArtifact | undefined;
    if (input.audio !== undefined) {
      const audioFileName = `audio.${input.audio.format}`;
      await writeFile(path.join(directory, audioFileName), input.audio.data);
      audio = {
        fileName: audioFileName,
        format: input.audio.format,
        sampleRateHz: input.audio.sampleRateHz,
        byteLength: input.audio.data.byteLength,
        url: `/v1/runs/${runId}/audio`
      };
      files.push(audioFileName);
    }

    const result: TTSStreamResult = {
      runId,
      providerId: input.request.providerId,
      operation: "tts.stream",
      status: input.status ?? "succeeded",
      createdAt: new Date().toISOString(),
      ...(audio === undefined ? {} : { audio }),
      archive: {
        runPath: `data/runs/${runId}`,
        files
      }
    };

    await writePrettyJson(path.join(directory, "request.json"), input.request);
    await writePrettyJson(path.join(directory, "plan.json"), input.plan);
    await writePrettyJson(path.join(directory, "mapping-report.json"), input.plan.mappingReport);
    await writePrettyJson(path.join(directory, "vendor-request.json"), input.plan.vendorRequest);
    await writeFile(
      path.join(directory, "vendor-events.ndjson"),
      input.vendorEvents.map((event) => JSON.stringify(event)).join("\n")
    );
    await writePrettyJson(path.join(directory, "vendor-response.json"), input.vendorResponse);
    await writePrettyJson(path.join(directory, "result.json"), result);

    return result;
  }

  async listRuns(): Promise<ArchivedRunSummary[]> {
    await mkdir(runsRoot(this.dataRoot), { recursive: true });
    const entries = await readdir(runsRoot(this.dataRoot), { withFileTypes: true });
    const results = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            return await readRunSummary(runsRoot(this.dataRoot), entry.name);
          } catch {
            return undefined;
          }
        })
    );

    return results
      .filter((result): result is ArchivedRunSummary => result !== undefined)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async readRun(runId: string): Promise<StoredRunDetail> {
    assertSafeRunId(runId);
    const directory = runRoot(this.dataRoot, runId);
    await assertRunExists(directory, runId);

    const [result, request, plan, mappingReport, vendorRequest, vendorResponse] = await Promise.all([
      readJsonFile<TTSSyncResult | TTSStreamResult>(path.join(directory, "result.json")),
      readJsonFile<TTSSyncRequest | TTSStreamRequest>(path.join(directory, "request.json")),
      readJsonFile<TTSPlan>(path.join(directory, "plan.json")),
      readJsonFile<MappingReport>(path.join(directory, "mapping-report.json")),
      readJsonFile<VendorPayload>(path.join(directory, "vendor-request.json")),
      readJsonFile<VendorPayload>(path.join(directory, "vendor-response.json"))
    ]);

    return {
      result,
      request,
      plan,
      mappingReport,
      vendorRequest,
      vendorResponse
    };
  }

  async audioStream(runId: string): Promise<{ stream: NodeJS.ReadableStream; filePath: string }> {
    const detail = await this.readRun(runId);
    if (detail.result.audio === undefined) {
      throw new TTSError(`Run '${runId}' does not have an audio artifact.`, "invalid_request", 404);
    }
    const filePath = path.join(runRoot(this.dataRoot, runId), detail.result.audio.fileName);
    await stat(filePath);
    return {
      stream: createReadStream(filePath),
      filePath
    };
  }
}

// readRunSummary: 入参为 runs 根目录和 runId；功能是兼容读取同步合成与音色克隆的列表摘要。
async function readRunSummary(root: string, runId: string): Promise<ArchivedRunSummary> {
  const directory = path.join(root, runId);
  const result = await readJsonFile<Record<string, unknown>>(path.join(directory, "result.json"));
  const plan = await readJsonFile<TTSPlan>(path.join(directory, "plan.json"));

  const audio = isAudioArtifact(result.audio) ? result.audio : undefined;
  const errorReason = runErrorReason(result);
  const summary: ArchivedRunSummary = {
    runId: stringValue(result.runId) ?? runId,
    providerId: stringValue(result.providerId) ?? plan.providerId,
    operation: plan.operation,
    status: result.status === "failed" || result.status === "planned" ? result.status : "succeeded",
    createdAt: stringValue(result.createdAt) ?? plan.createdAt,
    archive: archiveSummary(result.archive, runId, audio)
  };
  if (audio !== undefined) {
    summary.audio = audio;
  }
  if (errorReason !== undefined) {
    summary.errorReason = errorReason;
  }
  return summary;
}

// runErrorReason: 入参为 result.json 内容；输出运行失败时可在列表 tooltip 展示的错误原因。
function runErrorReason(result: Record<string, unknown>): string | undefined {
  const directReason = stringValue(result.errorReason);
  if (directReason !== undefined) {
    return directReason;
  }

  const directMessage = stringValue(result.message);
  if (directMessage !== undefined) {
    return directMessage;
  }

  if (result.error !== null && typeof result.error === "object" && !Array.isArray(result.error)) {
    const error = result.error as Record<string, unknown>;
    return stringValue(error.message);
  }

  return undefined;
}

// archiveSummary: 入参为 result 中的 archive、runId 和音频信息；输出运行列表所需的归档摘要。
function archiveSummary(archive: unknown, runId: string, audio: AudioArtifact | undefined): ArchivedRunSummary["archive"] {
  if (archive !== null && typeof archive === "object" && !Array.isArray(archive)) {
    const record = archive as Record<string, unknown>;
    const files = Array.isArray(record.files)
      ? record.files.filter((file): file is string => typeof file === "string")
      : [...ARCHIVE_FILES];
    return {
      runPath: stringValue(record.runPath) ?? `data/runs/${runId}`,
      files
    };
  }

  return {
    runPath: `data/runs/${runId}`,
    files: audio === undefined ? [...ARCHIVE_FILES] : [...ARCHIVE_FILES, audio.fileName]
  };
}

// isAudioArtifact: 入参为未知 JSON 值；输出是否可作为同步合成音频摘要使用。
function isAudioArtifact(value: unknown): value is AudioArtifact {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const audio = value as Record<string, unknown>;
  return (
    typeof audio.fileName === "string" &&
    isOutputFormat(audio.format) &&
    typeof audio.sampleRateHz === "number" &&
    typeof audio.byteLength === "number"
  );
}

// isOutputFormat: 入参为未知值；输出是否为平台支持的音频格式。
function isOutputFormat(value: unknown): value is TTSOutputFormat {
  return (
    value === "wav" ||
    value === "mp3" ||
    value === "ogg" ||
    value === "pcm" ||
    value === "flac" ||
    value === "opus"
  );
}

// stringValue: 入参为未知值；输出非空字符串或 undefined。
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function assertSafeRunId(runId: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
    throw new TTSError("Invalid run id.", "invalid_request", 400);
  }
}

async function assertRunExists(directory: string, runId: string): Promise<void> {
  try {
    const info = await stat(directory);
    if (!info.isDirectory()) {
      throw new Error("Run path is not a directory.");
    }
  } catch {
    throw new TTSError(`Run '${runId}' was not found.`, "invalid_request", 404);
  }
}
