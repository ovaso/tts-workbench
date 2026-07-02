import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  TTSError,
  type MappingReport,
  type TTSSyncPlan,
  type TTSSyncProviderResult,
  type TTSSyncRequest,
  type TTSSyncResult,
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

export interface StoredRunDetail {
  result: TTSSyncResult;
  request: TTSSyncRequest;
  plan: TTSSyncPlan;
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

  async listRuns(): Promise<TTSSyncResult[]> {
    await mkdir(runsRoot(this.dataRoot), { recursive: true });
    const entries = await readdir(runsRoot(this.dataRoot), { withFileTypes: true });
    const results = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            return await readJsonFile<TTSSyncResult>(
              path.join(runsRoot(this.dataRoot), entry.name, "result.json")
            );
          } catch {
            return undefined;
          }
        })
    );

    return results
      .filter((result): result is TTSSyncResult => result !== undefined)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async readRun(runId: string): Promise<StoredRunDetail> {
    assertSafeRunId(runId);
    const directory = runRoot(this.dataRoot, runId);
    await assertRunExists(directory, runId);

    const [result, request, plan, mappingReport, vendorRequest, vendorResponse] = await Promise.all([
      readJsonFile<TTSSyncResult>(path.join(directory, "result.json")),
      readJsonFile<TTSSyncRequest>(path.join(directory, "request.json")),
      readJsonFile<TTSSyncPlan>(path.join(directory, "plan.json")),
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
    const filePath = path.join(runRoot(this.dataRoot, runId), detail.result.audio.fileName);
    await stat(filePath);
    return {
      stream: createReadStream(filePath),
      filePath
    };
  }
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
