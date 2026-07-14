import { performance } from "node:perf_hooks";
import {
  TTSError,
  type TTSAdapter,
  type TTSCapabilities,
  type TTSOutputFormat,
  type TTSStreamEvent,
  type TTSStreamPlan,
  type TTSSyncRequest,
  type TTSSyncResult,
  type TTSStreamRequest,
  type TTSStreamResult,
  type TTSStreamSession,
  type VendorPayload,
  type VoiceCloneInstantRequest,
  type VoiceCloneInstantResult,
  type VoiceCloneRequest,
  type VoiceCloneResult,
  type VoiceCompatibility,
  type VoiceCreateRequest,
  type VoiceDeleteResult,
  type VoiceQuery,
  type VoiceRecord
} from "@tts-platform/core";
import type { FileRunArchive } from "../storage/run-archive";
import type { InMemoryVoiceRegistry } from "../storage/voice-registry";
import type { AdapterRegistry, ProviderSummary } from "./adapter-registry";

export class TTSFacade {
  constructor(
    private readonly registry: AdapterRegistry,
    private readonly archive: FileRunArchive,
    private readonly voices: InMemoryVoiceRegistry
  ) {}

  listProviders(): ProviderSummary[] {
    return this.registry.listProviders();
  }

  getCapabilities(providerId: string): TTSCapabilities {
    return this.registry.capabilities(providerId);
  }

  async synthesizeSync(request: TTSSyncRequest): Promise<TTSSyncResult> {
    const adapter = this.registry.getOrThrow(request.providerId);
    const resolvedRequest = this.resolveVoiceSelection(request, adapter);
    const plan = await adapter.plan(resolvedRequest);

    if (plan.operation !== "tts.sync" || adapter.synthesizeSync === undefined) {
      throw new TTSError(
        `Provider '${resolvedRequest.providerId}' does not support tts.sync.`,
        "operation_not_supported",
        400
      );
    }

    const providerResult = await adapter.synthesizeSync(plan);
    return this.archive.writeRun({
      request: resolvedRequest,
      plan,
      providerResult
    });
  }

  // prepareStream: 入参为流式合成请求；输出已 plan 的 stream session 执行上下文。
  async prepareStream(request: TTSStreamRequest): Promise<TTSPreparedStreamSession> {
    const adapter = this.registry.getOrThrow(request.providerId);
    const resolvedRequest = this.resolveVoiceSelection(request, adapter);
    const plan = await adapter.plan(resolvedRequest);

    if (plan.operation !== "tts.stream" || adapter.synthesizeStream === undefined) {
      throw new TTSError(
        `Provider '${resolvedRequest.providerId}' does not support tts.stream.`,
        "operation_not_supported",
        400
      );
    }

    const streamAdapter: TTSStreamAdapter = adapter as TTSStreamAdapter;
    return {
      request: resolvedRequest,
      plan,
      adapter: streamAdapter,
      session: {
        sessionId: plan.planId,
        providerId: resolvedRequest.providerId,
        operation: "tts.stream",
        protocol: resolvedRequest.stream?.protocol ?? "websocket"
      }
    };
  }

  async synthesizeStream(request: TTSStreamRequest): Promise<TTSStreamSession> {
    const prepared = await this.prepareStream(request);
    return prepared.session;
  }

  // synthesizeStreamToArchive: 入参为流式合成请求；输出归档后的 stream run 和首包等执行指标。
  async synthesizeStreamToArchive(request: TTSStreamRequest): Promise<TTSArchivedStreamExecution> {
    const prepared = await this.prepareStream(request);
    const startedAt = performance.now();
    const vendorEvents: VendorPayload[] = [];
    const audioChunks: Uint8Array[] = [];
    let audioFormat: TTSOutputFormat | undefined;
    let firstPacketLatencyMs: number | undefined;
    let audioDurationMs: number | undefined;
    let errorMessage: string | undefined;
    let runStatus: "succeeded" | "failed" = "succeeded";
    let finalResponse: VendorPayload = {
      status: "started",
      sessionId: prepared.session.sessionId
    };

    try {
      for await (const event of prepared.adapter.synthesizeStream(prepared.plan)) {
        vendorEvents.push(toArchiveStreamEvent(event));
        if (event.type === "audio.chunk") {
          if (firstPacketLatencyMs === undefined) {
            firstPacketLatencyMs = elapsedMs(startedAt);
          }
          audioChunks.push(event.data);
          audioFormat = event.format;
          continue;
        }

        if (event.type === "session.completed") {
          audioDurationMs = event.durationMs;
          finalResponse = {
            status: "succeeded",
            event: toArchiveStreamEvent(event)
          };
        }
        if (event.type === "error") {
          runStatus = "failed";
          errorMessage = event.message;
          finalResponse = {
            status: "failed",
            event: toArchiveStreamEvent(event)
          };
        }
      }
    } catch (caught) {
      runStatus = "failed";
      errorMessage = caught instanceof Error ? caught.message : "Stream execution failed.";
      finalResponse = {
        status: "failed",
        message: errorMessage
      };
      vendorEvents.push({
        direction: "platform",
        type: "error",
        message: errorMessage
      });
    }

    const result = await this.archive.writeStreamRun({
      request: prepared.request,
      plan: prepared.plan,
      vendorEvents,
      vendorResponse: finalResponse,
      status: runStatus,
      ...(audioChunks.length === 0 || audioFormat === undefined
        ? {}
        : {
            audio: {
              data: concatBytes(audioChunks),
              format: audioFormat,
              sampleRateHz: sampleRateFromStreamPlan(prepared.plan.vendorRequest)
            }
          })
    });

    return {
      result,
      metrics: {
        totalLatencyMs: elapsedMs(startedAt),
        ...(firstPacketLatencyMs === undefined ? {} : { firstPacketLatencyMs }),
        audioByteLength: audioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
        audioChunkCount: audioChunks.length,
        ...(audioDurationMs === undefined ? {} : { audioDurationMs })
      },
      ...(errorMessage === undefined ? {} : { errorMessage })
    };
  }

  async createVoiceClone(request: VoiceCloneRequest): Promise<VoiceCloneResult> {
    const adapter = this.registry.getOrThrow(request.providerId);
    const plan = await adapter.plan(request);

    if (plan.operation !== "voice.clone.create" || adapter.createVoiceClone === undefined) {
      throw new TTSError(
        `Provider '${request.providerId}' does not support voice.clone.create.`,
        "operation_not_supported",
        400
      );
    }

    const providerResult = await adapter.createVoiceClone(plan);
    this.voices.save(providerResult.voice);
    await this.archive.writeVoiceClone({
      request,
      plan,
      providerResult
    });
    return providerResult;
  }

  // createInstantVoiceClone: 入参为即时音色复刻请求；输出归档后的即时复刻音频运行结果。
  async createInstantVoiceClone(request: VoiceCloneInstantRequest): Promise<VoiceCloneInstantResult> {
    const adapter = this.registry.getOrThrow(request.providerId);
    const plan = await adapter.plan(request);

    if (plan.operation !== "voice.clone.instant" || adapter.createInstantVoiceClone === undefined) {
      throw new TTSError(
        `Provider '${request.providerId}' does not support voice.clone.instant.`,
        "operation_not_supported",
        400
      );
    }

    const providerResult = await adapter.createInstantVoiceClone(plan);
    return this.archive.writeVoiceCloneInstant({
      request,
      plan,
      providerResult
    });
  }

  listVoices(query?: VoiceQuery): VoiceRecord[] {
    return this.voices.list(query).map((voice) => this.withAdapterVoiceCompatibility(voice));
  }

  // createVoice: 入参为手动登记音色请求；输出写入本地 registry 后的受控音色记录。
  createVoice(request: VoiceCreateRequest): VoiceRecord {
    const voice = {
      voiceId: `${request.providerId}:${request.providerVoiceId}`,
      providerId: request.providerId,
      providerVoiceId: request.providerVoiceId,
      displayName: request.displayName,
      source: request.source,
      createdAt: new Date().toISOString(),
      ...(request.modelId === undefined ? {} : { modelId: request.modelId }),
      ...(request.createdWithModelId === undefined ? {} : { createdWithModelId: request.createdWithModelId }),
      ...(request.preferredModelId === undefined ? {} : { preferredModelId: request.preferredModelId }),
      ...(request.compatibility === undefined ? {} : { compatibility: request.compatibility }),
      ...(request.language === undefined ? {} : { language: request.language }),
      ...(request.vendorMetadata === undefined ? {} : { vendorMetadata: request.vendorMetadata })
    };
    return this.voices.save(this.withAdapterVoiceCompatibility(voice));
  }

  // deleteVoice: 入参为平台 voiceId；输出本地受控音色删除结果，不调用厂商删除接口。
  deleteVoice(voiceId: string): VoiceDeleteResult {
    const voice = this.voices.delete(voiceId);
    if (voice === undefined) {
      throw new TTSError(`Voice '${voiceId}' was not found.`, "invalid_request", 404);
    }
    return {
      voiceId: voice.voiceId,
      providerId: voice.providerId,
      providerVoiceId: voice.providerVoiceId,
      deletedAt: new Date().toISOString()
    };
  }

  // resolveVoiceSelection: 入参为同步/流式合成请求和 adapter；功能是把平台 voiceId 解析为厂商 providerVoiceId，并附加厂商音色兼容事实。
  private resolveVoiceSelection<TRequest extends TTSSyncRequest | TTSStreamRequest>(
    request: TRequest,
    adapter: TTSAdapter
  ): TRequest {
    const localVoiceId = request.voice.voiceId;
    if (localVoiceId === undefined) {
      return request;
    }

    const voice = this.voices.get(localVoiceId);
    if (voice === undefined) {
      return request;
    }
    if (voice.providerId !== request.providerId) {
      throw new TTSError(
        `Voice '${localVoiceId}' belongs to provider '${voice.providerId}', not '${request.providerId}'.`,
        "invalid_request",
        400
      );
    }

    const compatibility = adapter.voiceCompatibility?.(voice) ?? voice.compatibility;
    const requestWithModel = applyVoiceModelCompatibility(request, compatibility);
    return {
      ...requestWithModel,
      voice: {
        ...requestWithModel.voice,
        providerVoiceId: voice.providerVoiceId,
        ...(compatibility === undefined ? {} : { compatibility })
      }
    } as TRequest;
  }

  // withAdapterVoiceCompatibility: 入参为 voice registry 记录；输出补齐 adapter 推导兼容事实后的 voice 记录。
  private withAdapterVoiceCompatibility(voice: VoiceRecord): VoiceRecord {
    const adapter = this.registry.get(voice.providerId);
    const compatibility = adapter?.voiceCompatibility?.(voice) ?? voice.compatibility;
    if (compatibility === undefined) {
      return voice;
    }
    return {
      ...voice,
      compatibility
    };
  }
}

// applyVoiceModelCompatibility: 入参为合成请求和可选音色兼容事实；输出补齐或校验模型后的合成请求。
function applyVoiceModelCompatibility<TRequest extends TTSSyncRequest | TTSStreamRequest>(
  request: TRequest,
  compatibility: VoiceCompatibility | undefined
): TRequest {
  if (compatibility === undefined) {
    return request;
  }
  if (compatibility.scope === "model") {
    const modelId = request.model;
    if (modelId !== undefined && !compatibility.modelIds.includes(modelId)) {
      throw new TTSError(
        `Voice '${request.voice.voiceId ?? request.voice.providerVoiceId ?? ""}' is only compatible with model(s): ${compatibility.modelIds.join(", ")}.`,
        "invalid_request",
        400
      );
    }
    return modelId === undefined && compatibility.modelIds[0] !== undefined
      ? {
          ...request,
          model: compatibility.modelIds[0]
        }
      : request;
  }
  if (compatibility.scope === "resource") {
    const compatibleModelIds = compatibility.compatibleModelIds ?? [];
    const modelId = request.model;
    if (modelId !== undefined && compatibleModelIds.length > 0 && !compatibleModelIds.includes(modelId)) {
      throw new TTSError(
        `Voice '${request.voice.voiceId ?? request.voice.providerVoiceId ?? ""}' requires model(s): ${compatibleModelIds.join(", ")} for resource '${compatibility.resourceIds[0] ?? ""}'.`,
        "invalid_request",
        400
      );
    }
    return modelId === undefined && compatibleModelIds[0] !== undefined
      ? {
          ...request,
          model: compatibleModelIds[0]
        }
      : request;
  }
  return request;
}

export interface TTSStreamAdapter extends TTSAdapter {
  synthesizeStream(plan: TTSStreamPlan): AsyncIterable<TTSStreamEvent>;
}

export interface TTSPreparedStreamSession {
  session: TTSStreamSession;
  request: TTSStreamRequest;
  plan: TTSStreamPlan;
  adapter: TTSStreamAdapter;
}

export interface TTSArchivedStreamMetrics {
  totalLatencyMs: number;
  firstPacketLatencyMs?: number;
  audioDurationMs?: number;
  audioByteLength: number;
  audioChunkCount: number;
}

export interface TTSArchivedStreamExecution {
  result: TTSStreamResult;
  metrics: TTSArchivedStreamMetrics;
  errorMessage?: string;
}

// toArchiveStreamEvent: 入参为统一流式事件；输出去除大块音频正文后的归档事件。
function toArchiveStreamEvent(event: TTSStreamEvent): VendorPayload {
  if (event.type === "audio.chunk") {
    return {
      type: event.type,
      sequence: event.sequence,
      byteLength: event.data.byteLength,
      format: event.format,
      ...(event.timestampMs === undefined ? {} : { timestampMs: event.timestampMs })
    };
  }
  return event;
}

// concatBytes: 入参为多个 Uint8Array；输出按顺序拼接后的字节数组。
function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

// sampleRateFromStreamPlan: 入参为 vendorRequest；输出流式归档音频的采样率。
function sampleRateFromStreamPlan(vendorRequest: VendorPayload): number {
  return typeof vendorRequest.sampleRateHz === "number" && Number.isFinite(vendorRequest.sampleRateHz)
    ? vendorRequest.sampleRateHz
    : 24000;
}

// elapsedMs: 入参为 performance 起点；输出四舍五入的耗时毫秒。
function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
