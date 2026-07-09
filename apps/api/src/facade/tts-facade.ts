import {
  TTSError,
  type TTSAdapter,
  type TTSCapabilities,
  type TTSStreamEvent,
  type TTSStreamPlan,
  type TTSSyncRequest,
  type TTSSyncResult,
  type TTSStreamRequest,
  type TTSStreamSession,
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
